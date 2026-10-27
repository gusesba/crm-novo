import { createDecipheriv, createHmac } from "node:crypto";
import { BufferJSON, jidNormalizedUser, normalizeMessageContent, proto, type WAMessage } from "@whiskeysockets/baileys";
import { db } from "./database.js";
import { messageMetadata, preserveMessageSecret, type StoredMessage } from "./message-metadata.js";

type Save = (user: string, message: WAMessage) => void;
const applying = new Set<string>();
export function encryptedEdit(message: WAMessage) {
  const content = normalizeMessageContent(message.message);
  if (!content?.secretEncryptedMessage) return undefined;
  const envelope = proto.Message.fromObject(content).secretEncryptedMessage;
  return envelope?.secretEncType === proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT ? envelope : undefined;
}

function identities(user: string, values: (string | null | undefined)[]) {
  const result = new Set(values.filter((id): id is string => !!id && /@(s\.whatsapp\.net|lid)$/.test(id)).map(jidNormalizedUser));
  for (const id of [...result]) {
    const lid = id.endsWith("@lid");
    const value = db.prepare("SELECT value FROM auth WHERE user_id=? AND key=?").get(user,
      `lid-mapping-${id.split("@")[0]}${lid ? "_reverse" : ""}`) as { value: string } | undefined;
    if (!value) continue;
    const mapped: unknown = JSON.parse(value.value);
    if (typeof mapped === "string" && /^\d+$/.test(mapped)) result.add(`${mapped}@${lid ? "s.whatsapp.net" : "lid"}`);
  }
  return [...result];
}

export function decodeEncryptedEdit(user: string, message: WAMessage, original: WAMessage) {
  const envelope = encryptedEdit(message);
  if (!envelope?.targetMessageKey?.id || envelope.targetMessageKey.id !== original.key.id ||
      !!message.key.fromMe !== !!original.key.fromMe) return undefined;
  const payload = envelope.encPayload;
  const iv = envelope.encIv;
  const content = proto.Message.fromObject(original.message || {});
  const secret = content.messageContextInfo?.messageSecret || normalizeMessageContent(content)?.messageContextInfo?.messageSecret || proto.WebMessageInfo.fromObject(original).messageSecret;
  if (!secret || secret.length !== 32 || !payload || payload.length < 16 || iv?.length !== 12) return undefined;
  const auth = db.prepare("SELECT value FROM auth WHERE user_id=? AND key='creds'").get(user) as { value: string } | undefined;
  const me = auth ? JSON.parse(auth.value).me : undefined;
  const authors = (msg: WAMessage) => identities(user, msg.key.fromMe ? [me?.id, me?.lid] :
    msg.key.remoteJid?.endsWith("@g.us") ? [msg.key.participant, msg.key.participantAlt] : [msg.key.remoteJid, msg.key.remoteJidAlt]);
  const editors = authors(message);
  const senders = authors(original);
  if (!editors.some((id) => senders.includes(id))) return undefined;
  const extracted = createHmac("sha256", Buffer.alloc(32)).update(secret).digest();
  for (const sender of senders) for (const editor of editors) {
    try {
      const info = Buffer.concat([Buffer.from(original.key.id!), Buffer.from(sender), Buffer.from(editor), Buffer.from("Message Edit"), Buffer.from([1])]);
      const key = createHmac("sha256", extracted).update(info).digest();
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(payload.subarray(payload.length - 16));
      const decoded = proto.Message.decode(Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()])).protocolMessage;
      if (decoded?.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT && decoded.editedMessage &&
          (!decoded.key?.id || decoded.key.id === original.key.id) &&
          !normalizeMessageContent(decoded.editedMessage)?.protocolMessage && !normalizeMessageContent(decoded.editedMessage)?.secretEncryptedMessage)
        return decoded;
    } catch { /* Outra forma de endereçamento PN/LID pode autenticar o mesmo autor. */ }
  }
  return undefined;
}

export function replayEncryptedEdits(user: string, chatId: string, target: string, save: Save) {
  const guard = `${user}\0${chatId}\0${target}`;
  if (applying.has(guard)) return;
  applying.add(guard);
  try {
    const pending = db.prepare("SELECT id,raw,timestamp FROM pending_message_edits WHERE user_id=? AND chat_id=? AND target_id=? ORDER BY timestamp,id")
      .all(user, chatId, target) as { id: string; raw: string; timestamp: number }[];
    for (const event of pending) {
      const row = db.prepare("SELECT raw FROM messages WHERE user_id=? AND chat_id=? AND id=? AND kind!='deleted'").get(user, chatId, target) as { raw: string } | undefined;
      if (!row) continue;
      const original = JSON.parse(row.raw, BufferJSON.reviver) as StoredMessage;
      const protocol = decodeEncryptedEdit(user, JSON.parse(event.raw, BufferJSON.reviver), original);
      if (!protocol) continue;
      const editedAt = Number(protocol.timestampMs || event.timestamp);
      if (!Number.isSafeInteger(editedAt) || editedAt <= 0) continue;
      if (editedAt > (original.crmMetadata?.editedAt || 0))
        save(user, { ...original, message: preserveMessageSecret(protocol.editedMessage!, original.message),
          crmMetadata: { ...messageMetadata(original), edited: true, editedAt } } as StoredMessage);
      db.prepare("DELETE FROM pending_message_edits WHERE user_id=? AND id=?").run(user, event.id);
    }
  } finally { applying.delete(guard); }
}

export function queueEncryptedEdit(user: string, chatId: string, message: WAMessage, save: Save) {
  const envelope = encryptedEdit(message);
  if (!envelope) return false;
  if (message.key.id && envelope.targetMessageKey?.id)
    db.prepare("INSERT OR IGNORE INTO pending_message_edits VALUES(?,?,?,?,?,?)").run(user, message.key.id, chatId,
      envelope.targetMessageKey.id, Number(message.messageTimestamp || 0) * 1000, JSON.stringify(message, BufferJSON.replacer));
  if (envelope.targetMessageKey?.id) replayEncryptedEdits(user, chatId, envelope.targetMessageKey.id, save);
  return true;
}

export function reconcileEncryptedEdits(save: Save, remove: (user: string, id: string, chat: string) => unknown) {
  const rows = db.prepare("SELECT user_id AS user,id,chat_id AS chatId,raw FROM messages WHERE text='Mensagem não suportada' AND raw LIKE '%secretEncryptedMessage%'")
    .all() as { user: string; id: string; chatId: string; raw: string }[];
  for (const row of rows) {
    const message = JSON.parse(row.raw, BufferJSON.reviver);
    if (queueEncryptedEdit(row.user, row.chatId, message, save)) remove(row.user, row.id, row.chatId);
  }
  const pending = db.prepare("SELECT DISTINCT user_id AS user,chat_id AS chatId,target_id AS target FROM pending_message_edits").all() as { user: string; chatId: string; target: string }[];
  for (const item of pending) replayEncryptedEdits(item.user, item.chatId, item.target, save);
}
