import {
  BufferJSON,
  normalizeMessageContent,
  proto,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { db } from "./database.js";
import { conversationName, savePushName } from "./contacts.js";

export function saveMessage(user: string, msg: WAMessage) {
  const jid = messageChatId(msg);
  if (!jid || jid === "status@broadcast" || !msg.key.id || !msg.message) return;
  const content = normalizeMessageContent(msg.message);
  if (!content) return;
  const reaction = content.reactionMessage;
  if (reaction?.key?.id) {
    const sender = msg.key.fromMe
      ? "me"
      : msg.key.participantAlt || msg.key.participant || jid;
    saveMessageReaction(user, reaction.key.id, sender, reaction.text || "");
    return;
  }
  const edit = content.protocolMessage?.editedMessage;
  if (edit && content.protocolMessage?.key?.id) {
    const original = rawMessage(user, content.protocolMessage.key.id);
    if (original && messageChatId(original) === jid) {
      original.message = edit;
      saveMessage(user, original);
    }
    return;
  }
  if (
    content.protocolMessage?.type ===
      proto.Message.ProtocolMessage.Type.REVOKE &&
    content.protocolMessage.key?.id
  ) {
    deleteStoredMessage(user, content.protocolMessage.key.id, jid);
    return;
  }
  if (content.protocolMessage || content.senderKeyDistributionMessage) return;
  const kind = content.imageMessage
    ? "image"
    : content.videoMessage
      ? "video"
      : content.audioMessage
        ? "audio"
        : content.documentMessage
          ? "document"
          : content.stickerMessage
            ? "sticker"
            : "text";
  const text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.documentMessage?.fileName ||
    (kind === "sticker" ? "Figurinha" : "") ||
    (kind === "text" ? "Mensagem não suportada" : "Anexo");
  const timestamp =
    Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000;
  if (!msg.key.fromMe) {
    const sender = jid.endsWith("@g.us")
      ? msg.key.participantAlt || msg.key.participant
      : jid;
    if (sender) savePushName(user, sender, msg.pushName);
  }
  const name = conversationName(user, jid) || jid;
  db.prepare(
    `INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET text=excluded.text,kind=excluded.kind,raw=excluded.raw`,
  ).run(
    user,
    msg.key.id,
    jid,
    text,
    msg.key.fromMe ? 1 : 0,
    kind,
    timestamp,
    JSON.stringify(msg, BufferJSON.replacer),
  );
  db.prepare(
    `INSERT INTO chats VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET
    name=CASE WHEN excluded.name != excluded.id THEN excluded.name ELSE chats.name END,
    last_text=CASE WHEN excluded.updated_at >= chats.updated_at THEN excluded.last_text ELSE chats.last_text END,
    updated_at=MAX(chats.updated_at,excluded.updated_at)`,
  ).run(user, jid, name, text, timestamp);
}
export function messageChatId(message: WAMessage) {
  return message.key.remoteJidAlt?.endsWith("@s.whatsapp.net")
    ? message.key.remoteJidAlt
    : message.key.remoteJid;
}
export function canDeleteForEveryone(
  mine: boolean,
  timestamp: number,
  now = Date.now(),
) {
  return (
    mine &&
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    timestamp <= now &&
    now - timestamp < 2 * 24 * 60 * 60 * 1000
  );
}
export function rawMessage(user: string, id: string): WAMessage | undefined {
  const row = db
    .prepare("SELECT raw FROM messages WHERE user_id=? AND id=?")
    .get(user, id) as { raw: string } | undefined;
  return row ? JSON.parse(row.raw, BufferJSON.reviver) : undefined;
}
export function listMessages(
  user: string,
  chatId: string,
  before = Date.now() + 1000,
  beforeId = "",
) {
  const messages = db
    .prepare(
      `SELECT id,chat_id AS chatId,text,mine,kind,timestamp,raw FROM messages
       WHERE user_id=? AND chat_id=? AND (timestamp < ? OR (timestamp = ? AND id < ?))
       ORDER BY timestamp DESC,id DESC LIMIT 100`,
    )
    .all(user, chatId, before, before, beforeId)
    .reverse() as {
    id: string;
    chatId: string;
    text: string;
    mine: number;
    kind: string;
    timestamp: number;
    raw: string;
  }[];
  if (!messages.length) return messages;
  const placeholders = messages.map(() => "?").join(",");
  const reactions = db
    .prepare(
      `SELECT message_id AS messageId,emoji,sender='me' AS mine
       FROM message_reactions WHERE user_id=? AND message_id IN (${placeholders})`,
    )
    .all(user, ...messages.map((message) => message.id)) as {
    messageId: string;
    emoji: string;
    mine: number;
  }[];
  return messages.map(({ raw, ...message }) => {
    const media = messageMedia(raw);
    const attachment = media?.attachment;
    const kind = media?.kind || message.kind;
    return {
      ...message,
      canDeleteForEveryone: canDeleteForEveryone(!!message.mine, message.timestamp),
      kind,
      text:
        attachment &&
        ((kind === "document" && message.text === attachment.name) ||
          (kind !== "document" &&
            ["Anexo", "Mensagem não suportada"].includes(message.text)))
          ? ""
          : message.text,
      attachment,
      reactions: reactions
        .filter((reaction) => reaction.messageId === message.id)
        .map(({ emoji, mine }) => ({ emoji, mine: !!mine })),
    };
  });
}

function messageMedia(raw: string) {
  const stored = JSON.parse(raw, BufferJSON.reviver) as WAMessage;
  const content = normalizeMessageContent(stored.message);
  const attachment =
    content?.imageMessage ||
    content?.videoMessage ||
    content?.audioMessage ||
    content?.documentMessage ||
    content?.stickerMessage;
  if (!attachment) return undefined;
  const kind = content?.imageMessage
    ? "image"
    : content?.videoMessage
      ? "video"
      : content?.audioMessage
        ? "audio"
        : content?.documentMessage
          ? "document"
          : "sticker";
  const metadata = attachment as typeof attachment & {
    fileName?: string | null;
    fileLength?: number | string | { low?: number } | null;
    pageCount?: number | null;
    jpegThumbnail?: Uint8Array | string | null;
  };
  const size = metadata.fileLength;
  const thumbnail =
    typeof metadata.jpegThumbnail === "string"
      ? metadata.jpegThumbnail
      : metadata.jpegThumbnail
        ? Buffer.from(metadata.jpegThumbnail).toString("base64")
        : undefined;
  return {
    kind,
    attachment: {
      name:
        metadata.fileName ||
        (content?.stickerMessage
          ? "Figurinha.webp"
          : defaultAttachmentName(metadata.mimetype)),
      mime: metadata.mimetype || "application/octet-stream",
      size:
        typeof size === "number"
          ? size
          : typeof size === "string"
            ? Number(size)
            : size?.low,
      pageCount: metadata.pageCount || undefined,
      ...(thumbnail ? { thumbnail } : {}),
    },
  };
}

function defaultAttachmentName(mime?: string | null) {
  if (mime?.startsWith("image/")) return "Imagem";
  if (mime?.startsWith("video/")) return "Vídeo";
  if (mime?.startsWith("audio/")) return "Áudio";
  if (mime === "application/pdf") return "Documento.pdf";
  return "Anexo";
}

export function saveMessageReaction(
  user: string,
  messageId: string,
  sender: string,
  emoji: string,
) {
  const target = db
    .prepare("SELECT 1 FROM messages WHERE user_id=? AND id=?")
    .get(user, messageId);
  if (!target) return;
  if (emoji)
    db.prepare(
      `INSERT INTO message_reactions VALUES(?,?,?,?)
       ON CONFLICT(user_id,message_id,sender) DO UPDATE SET emoji=excluded.emoji`,
    ).run(user, messageId, sender, emoji);
  else
    db.prepare(
      "DELETE FROM message_reactions WHERE user_id=? AND message_id=? AND sender=?",
    ).run(user, messageId, sender);
}

export function deleteStoredMessage(user: string, id: string, chatId: string) {
  const stored = db
    .prepare("SELECT 1 FROM messages WHERE user_id=? AND id=? AND chat_id=?")
    .get(user, id, chatId);
  if (!stored) return false;
  db.prepare(
    "DELETE FROM message_reactions WHERE user_id=? AND message_id=?",
  ).run(user, id);
  db.prepare("DELETE FROM messages WHERE user_id=? AND id=? AND chat_id=?").run(
    user,
    id,
    chatId,
  );
  const latest = db
    .prepare(
      "SELECT text,timestamp FROM messages WHERE user_id=? AND chat_id=? ORDER BY timestamp DESC,id DESC LIMIT 1",
    )
    .get(user, chatId) as { text: string; timestamp: number } | undefined;
  db.prepare(
    "UPDATE chats SET last_text=?,updated_at=? WHERE user_id=? AND id=?",
  ).run(latest?.text || "", latest?.timestamp || 0, user, chatId);
  return true;
}
