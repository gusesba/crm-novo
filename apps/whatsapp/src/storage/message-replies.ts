import { areJidsSameUser, BufferJSON, jidNormalizedUser, normalizeMessageContent, type proto, type WAMessage } from "@whiskeysockets/baileys";
import { db } from "./database.js";
import { contactName } from "./contacts.js";

export function messageReply(user: string, chatId: string, raw: string) {
  const message = JSON.parse(raw, BufferJSON.reviver) as WAMessage;
  const content = normalizeMessageContent(message.message);
  const context = Object.values(content || {}).find((part) =>
    part && typeof part === "object" && "contextInfo" in part && part.contextInfo?.stanzaId,
  )?.contextInfo as proto.IContextInfo | undefined;
  if (!context?.stanzaId) return undefined;
  const row = db.prepare(
    "SELECT raw,kind,mine FROM messages WHERE user_id=? AND chat_id=? AND id=?",
  ).get(user, chatId, context.stanzaId) as { raw: string; kind: string; mine: number } | undefined;
  let original = row && JSON.parse(row.raw, BufferJSON.reviver) as WAMessage | undefined;
  if (original && context.remoteJid && ![chatId, original.key.remoteJid, original.key.remoteJidAlt].includes(context.remoteJid))
    original = undefined;
  const stored = original ? row : undefined;
  const sender = context.participant || original?.key.participantAlt || original?.key.participant ||
    (stored && !stored.mine && !chatId.endsWith("@g.us") ? chatId : undefined);
  const auth = db.prepare("SELECT value FROM auth WHERE user_id=? AND key='creds'").get(user) as { value: string } | undefined;
  const me = auth ? (JSON.parse(auth.value) as { me?: { id?: string; lid?: string } }).me : undefined;
  const mine = stored ? !!stored.mine : !!sender && [me?.id, me?.lid].some((id) => id && areJidsSameUser(id, sender));
  const senderId = sender ? jidNormalizedUser(sender) : undefined;
  const author = mine ? "Você" : (senderId && contactName(user, senderId)) || original?.pushName ||
    (senderId?.endsWith("@s.whatsapp.net") ? `+${senderId.split("@")[0]}` : "Contato");
  const quoted = normalizeMessageContent(context.quotedMessage || original?.message);
  const deleted = stored?.kind === "deleted";
  const kind = deleted ? "deleted" : quoted?.imageMessage ? "image" : quoted?.videoMessage ? "video" :
    quoted?.audioMessage ? "audio" : quoted?.documentMessage ? "document" : quoted?.stickerMessage ? "sticker" :
    quoted?.contactMessage || quoted?.contactsArrayMessage ? "contact" :
    quoted?.locationMessage || quoted?.liveLocationMessage ? "location" : "text";
  const text = deleted ? "Mensagem apagada" : quoted?.conversation || quoted?.extendedTextMessage?.text ||
    quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || quoted?.documentMessage?.caption ||
    quoted?.documentMessage?.fileName || quoted?.contactMessage?.displayName || quoted?.contactsArrayMessage?.displayName ||
    ({ image: "Foto", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha", contact: "Contato", location: "Localização" } as Record<string, string>)[kind] ||
    "Mensagem não disponível";
  const media = quoted?.imageMessage || quoted?.videoMessage || quoted?.documentMessage || quoted?.stickerMessage;
  const thumbnail = !deleted && media && "jpegThumbnail" in media ? media.jpegThumbnail : undefined;
  const bytes = typeof thumbnail === "string" ? Buffer.from(thumbnail, "base64") : thumbnail;
  return {
    id: context.stanzaId, author, mine, kind, text: text.slice(0, 500),
    thumbnail: bytes?.length && bytes.length <= 64 * 1024 ? Buffer.from(bytes).toString("base64") : undefined,
  };
}
