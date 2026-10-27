import {
  normalizeMessageContent,
  type AnyMessageContent,
  type WASocket,
} from "@whiskeysockets/baileys";
import { convertVoiceNote } from "./voice-note.js";
import { connectedSocket } from "../sessions/manager.js";
import {
  canDeleteForEveryone,
  deleteStoredMessage,
  markMessageDeleted,
  messageChatId,
  rawMessage,
  saveMessage,
} from "../storage/messages.js";
import { messageAttachments, type SendInput } from "./schemas.js";
import { messageContext, messageMetadata, preserveMessageSecret } from "../storage/message-metadata.js";
import { storeMedia } from "../storage/media-storage.js";
import { markBackupMessageDeleted, sessionNumber } from "../storage/backups.js";
export { media } from "./media.js";

export async function sendMessage(
  user: string,
  input: SendInput,
  getSocket: (user: string) => Pick<WASocket, "sendMessage"> = connectedSocket,
  signal?: AbortSignal,
) {
  const files = messageAttachments(input);
  // Valida o lote inteiro antes do primeiro envio para não enviar parte de uma seleção inválida.
  let totalSize = 0;
  for (const file of files) {
    const size = Buffer.from(file.data, "base64").length;
    totalSize += size;
    if (!size || size > 16 * 1024 * 1024)
      throw Object.assign(new Error("O anexo deve ter conteúdo e no máximo 16 MB."), { statusCode: 400 });
  }
  if (totalSize > 16 * 1024 * 1024)
    throw Object.assign(new Error("Os anexos devem somar no máximo 16 MB."), { statusCode: 400 });
  const socket = getSocket(user);
  const sourceNumber = sessionNumber(user);
  if (!input.attachments?.length) return sendSingleMessage(user, input, socket, sourceNumber);
  const ids: string[] = [];
  let sentAttachments = 0;
  let textSent = false;
  const captionIndex = files.findIndex((file) => file.asDocument || (file.mime !== "image/webp" && !file.mime.startsWith("audio/")));
  try {
    for (const [index, file] of files.entries()) {
      signal?.throwIfAborted();
      const text = index === captionIndex ? input.text : undefined;
      const result = await sendSingleMessage(user, {
        chatId: input.chatId, attachment: file, text,
        replyTo: index === 0 ? input.replyTo : undefined,
      }, socket, sourceNumber);
      ids.push(result.id);
      sentAttachments++;
      if (text?.trim()) textSent = true;
    }
    if (input.text?.trim() && !textSent) {
      signal?.throwIfAborted();
      const result = await sendSingleMessage(user, { chatId: input.chatId, text: input.text }, socket, sourceNumber);
      ids.push(result.id);
      textSent = true;
    }
  } catch (error) {
    if (!ids.length) throw error;
    return { id: ids.at(-1)!, ids, sent: false as const, sentAttachments, textSent,
      error: `${sentAttachments} de ${files.length} anexos confirmados. ${error instanceof Error ? error.message : "Falha no envio."} Confira o histórico antes de tentar novamente.` };
  }
  return { id: ids.at(-1)!, ids, sent: true as const, sentAttachments, textSent };
}
async function sendSingleMessage(user: string, input: SendInput, socket: Pick<WASocket, "sendMessage">, sourceNumber?: string) {
  if (sourceNumber && sourceNumber !== sessionNumber(user))
    throw new Error("O número da conta mudou. Confira o histórico antes de continuar o envio.");
  let content: AnyMessageContent = { text: input.text || "" };
  if (input.contact) {
    const { name, phone } = input.contact;
    const safeName = name.replace(/[\\,;]/g, "\\$&").replace(/\r?\n/g, "\\n");
    content = {
      contacts: {
        displayName: name,
        contacts: [
          {
            displayName: name,
            vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${safeName}\nTEL;type=CELL;waid=${phone}:+${phone}\nEND:VCARD`,
          },
        ],
      },
    };
  }
  if (input.attachment) {
    const { name, mime, data } = input.attachment;
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > 16 * 1024 * 1024)
      throw Object.assign(new Error("O anexo deve ter no máximo 16 MB."), {
        statusCode: 400,
      });
    const audio = input.attachment.voiceNote
      ? await convertVoiceNote(buffer)
      : buffer;
    content = input.attachment.asDocument
      ? {
          document: buffer,
          mimetype: mime,
          fileName: name,
          caption: input.text || "",
        }
      : mime === "image/webp"
        ? { sticker: buffer, mimetype: mime }
        : mime.startsWith("image/")
          ? { image: buffer, caption: input.text || "", mimetype: mime }
          : mime.startsWith("video/")
            ? { video: buffer, caption: input.text || "", mimetype: mime }
            : mime.startsWith("audio/")
              ? {
                  audio,
                  mimetype: input.attachment.voiceNote
                    ? "audio/ogg; codecs=opus"
                    : mime,
                  ptt: !!input.attachment.voiceNote,
                }
              : {
                  document: buffer,
                  mimetype: mime,
                  fileName: name,
                  caption: input.text || "",
                };
  }
  const quoted = input.replyTo ? rawMessage(user, input.replyTo) : undefined;
  if (
    input.replyTo &&
    (!quoted ||
      (quoted.key.remoteJid !== input.chatId &&
        quoted.key.remoteJidAlt !== input.chatId))
  )
    throw Object.assign(new Error("Mensagem de resposta inválida."), {
      statusCode: 400,
    });
  const result = await socket.sendMessage(input.chatId, content, { quoted });
  if (!result?.key.id) throw new Error("O WhatsApp não confirmou o envio.");
  saveMessage(user, result, sourceNumber);
  if (input.attachment && (!sourceNumber || sourceNumber === sessionNumber(user))) {
    const file = input.attachment;
    const data = file.voiceNote ? (content as { audio: Buffer }).audio : Buffer.from(file.data, "base64");
    storeMedia(user, result.key.id, { name: file.name, mime: file.voiceNote ? "audio/ogg; codecs=opus" : file.mime, data }, Number(result.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000);
  }
  // Áudios não aceitam legenda: enviar o texto como mensagem separada.
  if (input.attachment?.mime.startsWith("audio/") && !input.attachment.asDocument && input.text?.trim()) {
    if (sourceNumber && sourceNumber !== sessionNumber(user)) throw new Error("O áudio foi confirmado, mas o número da conta mudou antes do texto. Confira o backup do número original.");
    const caption = await socket.sendMessage(input.chatId, {
      text: input.text,
    });
    if (!caption?.key.id)
      throw new Error("O áudio foi enviado, mas o texto não foi confirmado.");
    saveMessage(user, caption, sourceNumber);
  }
  return { id: result.key.id, sent: true as const };
}
export async function editMessage(
  user: string,
  id: string,
  chatId: string,
  text: string,
  getSocket: (user: string) => Pick<WASocket, "sendMessage"> = connectedSocket,
) {
  const previous = rawMessage(user, id);
  const sourceNumber = sessionNumber(user);
  if (!previous?.key.fromMe || messageChatId(previous) !== chatId)
    throw Object.assign(
      new Error("Só é possível editar suas mensagens nesta conversa."),
      { statusCode: 403 },
    );
  await getSocket(user).sendMessage(chatId, { text, edit: previous.key });
  const contextInfo = messageContext(previous.message);
  const edited = { ...previous, message: preserveMessageSecret(contextInfo ? { extendedTextMessage: { text, contextInfo } } : { conversation: text }, previous.message),
    crmMetadata: { ...messageMetadata(previous), edited: true, editedAt: Date.now() } };
  saveMessage(user, edited, sourceNumber);
  return { edited: true };
}
export async function reactToMessage(
  user: string,
  id: string,
  chatId: string,
  emoji: string,
) {
  const previous = conversationMessage(user, id, chatId);
  const sourceNumber = sessionNumber(user);
  const result = await connectedSocket(user).sendMessage(chatId, {
    react: { text: emoji, key: previous.key },
  });
  if (!result?.key.id) throw new Error("O WhatsApp não confirmou a reação.");
  saveMessage(user, result, sourceNumber);
  return { reacted: true };
}
export async function forwardMessage(
  user: string,
  id: string,
  targetChatId: string,
) {
  const previous = rawMessage(user, id);
  const sourceNumber = sessionNumber(user);
  if (!previous)
    throw Object.assign(new Error("Mensagem não encontrada."), {
      statusCode: 404,
    });
  const result = await connectedSocket(user).sendMessage(targetChatId, {
    forward: previous,
    force: true,
  });
  if (!result?.key.id)
    throw new Error("O WhatsApp não confirmou o encaminhamento.");
  saveMessage(user, result, sourceNumber);
  return { id: result.key.id, forwarded: true };
}
export async function deleteMessage(
  user: string,
  id: string,
  chatId: string,
  forEveryone: boolean,
) {
  if (!forEveryone) {
    if (!deleteStoredMessage(user, id, chatId))
      throw Object.assign(new Error("Mensagem não encontrada nesta conversa."), {
        statusCode: 404,
      });
    return { deleted: true, forEveryone: false };
  }
  const previous = conversationMessage(user, id, chatId);
  if (forEveryone) {
    const sourceNumber = sessionNumber(user);
    if (!previous.key.fromMe)
      throw Object.assign(
        new Error("Só é possível excluir suas mensagens para todos."),
        { statusCode: 403 },
      );
    if (!canDeleteForEveryone(true, Number(previous.messageTimestamp) * 1000))
      throw Object.assign(
        new Error(
          "O prazo de dois dias para excluir esta mensagem para todos terminou.",
        ),
        { statusCode: 400 },
      );
    const result = await connectedSocket(user).sendMessage(chatId, {
      delete: previous.key,
    });
    if (sourceNumber && sourceNumber !== sessionNumber(user)) markBackupMessageDeleted(user, sourceNumber, chatId, id);
    else markMessageDeleted(user, id, chatId);
    if (!result?.key.id)
      throw new Error("O WhatsApp não confirmou o envio da solicitação.");
    return { requested: true, forEveryone: true };
  }
}
function conversationMessage(user: string, id: string, chatId: string) {
  const message = rawMessage(user, id);
  if (!message || messageChatId(message) !== chatId)
    throw Object.assign(new Error("Mensagem não encontrada nesta conversa."), {
      statusCode: 404,
    });
  return message;
}
