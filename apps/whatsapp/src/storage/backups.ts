import { BufferJSON, normalizeMessageContent, type WAMessage } from "@whiskeysockets/baileys";
import { db } from "./database.js";
import { messageMetadata, type StoredMessage } from "./message-metadata.js";
import { messageReply } from "./message-replies.js";
import { sessionIdSchema, sessionOwner } from "../sessions/session-id.js";

type Row = { id: string; chat_id: string; text: string; mine: number; kind: string; timestamp: number; raw: string };
export function accountPhone(jid?: string | null) {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return undefined;
  const phone = jid.split("@")[0].split(":")[0];
  return /^\d{10,15}$/.test(phone) ? phone : undefined;
}
export function sessionNumber(session: string) {
  return (db.prepare("SELECT phone FROM session_numbers WHERE session_id=?").get(session) as { phone: string } | undefined)?.phone;
}
const mediaLabels: Record<string, string> = { image: "Foto", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha" };

function copyMessage(session: string, number: string, row: Row) {
  const owner = sessionOwner(session);
  const raw = JSON.parse(row.raw, BufferJSON.reviver) as StoredMessage;
  const content = normalizeMessageContent(raw.message);
  const sourceMatches = sessionNumber(session) === number || number.startsWith("legacy_");
  const contact = content?.contactMessage;
  const metadata = row.kind === "deleted" ? { edited: false, forwarded: false } : messageMetadata(raw);
  const quoted = sourceMatches && row.kind !== "deleted" ? messageReply(session, row.chat_id, row.raw,
    /^\d+$/.test(number) ? { id: `${number}@s.whatsapp.net` } : undefined) : undefined;
  // O arquivo contém apenas texto e metadados de apresentação; nunca guarda raw, chaves ou miniaturas.
  const reply = quoted ? { id: quoted.id, author: quoted.author, mine: quoted.mine, kind: quoted.kind, text: quoted.text } : undefined;
  const reactions = sourceMatches ? db.prepare("SELECT emoji,sender='me' AS mine FROM message_reactions WHERE user_id=? AND message_id=?")
    .all(session, row.id) as { emoji: string; mine: number }[] : [];
  const payload = {
    id: row.id, chatId: row.chat_id, text: row.text, mine: row.mine, kind: row.kind, timestamp: row.timestamp,
    canDeleteForEveryone: false, ...metadata, reply,
    ...(mediaLabels[row.kind] ? { mediaLabel: mediaLabels[row.kind] } : {}),
    ...(contact ? { contact: { name: contact.displayName || "Contato", phone: contact.vcard?.match(/waid=(\d+)/)?.[1] || "" } } : {}),
    reactions: reactions.map((reaction) => ({ emoji: reaction.emoji, mine: !!reaction.mine })),
  };
  db.prepare(`INSERT INTO backup_messages(owner_id,number,chat_id,id,timestamp,kind,revision_at,payload) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(owner_id,number,chat_id,id) DO UPDATE SET payload=excluded.payload,kind=excluded.kind,revision_at=excluded.revision_at
    WHERE backup_messages.kind!='deleted' AND (excluded.kind='deleted' OR
      (excluded.revision_at>=backup_messages.revision_at AND
       (COALESCE(json_extract(backup_messages.payload,'$.edited'),0)=0 OR json_extract(excluded.payload,'$.edited')=1)))`)
    .run(owner, number, row.chat_id, row.id, row.timestamp, row.kind, raw.crmMetadata?.editedAt || 0, JSON.stringify(payload));
  const chat = sourceMatches ? db.prepare("SELECT name FROM chats WHERE user_id=? AND id=?").get(session, row.chat_id) as { name: string } | undefined : undefined;
  backupChatName(session, row.chat_id, chat?.name || row.chat_id, number);
}

export function backupMessage(session: string, id: string) {
  const number = sessionNumber(session);
  if (!number) return;
  const row = db.prepare("SELECT * FROM messages WHERE user_id=? AND id=?").get(session, id) as Row | undefined;
  if (row) copyMessage(session, number, row);
}
export function backupDetachedMessage(session: string, number: string, message: WAMessage) {
  const content = normalizeMessageContent(message.message);
  const chatId = message.key.remoteJid?.endsWith("@lid") && message.key.remoteJidAlt?.endsWith("@s.whatsapp.net")
    ? message.key.remoteJidAlt : message.key.remoteJid;
  if (!content || !message.key.id || !chatId || chatId === "status@broadcast" || content.protocolMessage || content.reactionMessage) return;
  const kind = content.imageMessage ? "image" : content.videoMessage ? "video" : content.audioMessage ? "audio"
    : content.documentMessage ? "document" : content.stickerMessage ? "sticker" : content.contactMessage ? "contact" : "text";
  copyMessage(session, number, {
    id: message.key.id, chat_id: chatId, mine: message.key.fromMe ? 1 : 0, kind,
    text: content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption || content.videoMessage?.caption ||
      content.documentMessage?.caption || content.documentMessage?.fileName || mediaLabels[kind] || content.contactMessage?.displayName || "Mensagem não suportada",
    timestamp: Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000, raw: JSON.stringify(message, BufferJSON.replacer),
  });
}
export function backupChatName(session: string, chatId: string, name: string, number = sessionNumber(session)) {
  if (!number || !sessionIdSchema.safeParse(session).success) return;
  db.prepare(`INSERT INTO backup_chats VALUES(?,?,?,?) ON CONFLICT(owner_id,number,id) DO UPDATE SET
    name=CASE WHEN excluded.name!=excluded.id THEN excluded.name ELSE backup_chats.name END`)
    .run(sessionOwner(session), number, chatId, name);
}
export function removeBackupMessage(session: string, chatId: string, id: string) {
  const number = sessionNumber(session);
  if (number) db.prepare("DELETE FROM backup_messages WHERE owner_id=? AND number=? AND chat_id=? AND id=?")
    .run(sessionOwner(session), number, chatId, id);
}
export function markBackupMessageDeleted(session: string, number: string, chatId: string, id: string) {
  const owner = sessionOwner(session);
  const row = db.prepare("SELECT payload FROM backup_messages WHERE owner_id=? AND number=? AND chat_id=? AND id=?")
    .get(owner, number, chatId, id) as { payload: string } | undefined;
  if (!row) return;
  const message = JSON.parse(row.payload);
  const payload = { id, chatId, text: "Mensagem apagada", mine: message.mine, kind: "deleted", timestamp: message.timestamp,
    canDeleteForEveryone: false, edited: false, forwarded: false, reactions: [] };
  db.prepare("UPDATE backup_messages SET kind='deleted',payload=? WHERE owner_id=? AND number=? AND chat_id=? AND id=?")
    .run(JSON.stringify(payload), owner, number, chatId, id);
}
function snapshot(session: string, number: string) {
  const rows = db.prepare("SELECT * FROM messages WHERE user_id=? ORDER BY timestamp,id").iterate(session);
  for (const row of rows) copyMessage(session, number, row as Row);
}
function registerNumber(session: string, number: string, now = Date.now()) {
  db.prepare(`INSERT INTO backup_numbers VALUES(?,?,?,?) ON CONFLICT(owner_id,number) DO UPDATE SET
    last_connected_at=MAX(backup_numbers.last_connected_at,excluded.last_connected_at)`)
    .run(sessionOwner(session), number, now, now);
}

export function bindSessionNumber(session: string, jid: string, migrateExisting = false) {
  const phone = accountPhone(jid);
  if (!phone || !sessionIdSchema.safeParse(session).success) return;
  const previous = sessionNumber(session);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (previous !== phone && (!migrateExisting || previous)) {
      const number = previous || `legacy_${session}`;
      const hasMessages = db.prepare("SELECT 1 FROM messages WHERE user_id=? LIMIT 1").get(session);
      if (hasMessages) {
        registerNumber(session, number);
        snapshot(session, number);
      }
      // Só limpa o atendimento antigo depois de arquivar seus textos na mesma transação.
      for (const table of ["messages", "chats", "contacts", "contact_names", "chat_states", "message_reactions", "profile_pictures", "media_cache", "pending_message_edits", "service_state"])
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(session);
    }
    db.prepare("INSERT OR REPLACE INTO session_numbers VALUES(?,?)").run(session, phone);
    registerNumber(session, phone);
    if (migrateExisting || previous !== phone || !db.prepare("SELECT 1 FROM service_state WHERE user_id=? AND key='number-backup-v1'").get(session)) {
      snapshot(session, phone);
      db.prepare("INSERT OR REPLACE INTO service_state VALUES(?,'number-backup-v1','done')").run(session);
    }
    db.exec("COMMIT");
    return phone;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function initializeBackups() {
  const sessions = db.prepare("SELECT user_id AS session FROM messages UNION SELECT user_id FROM auth WHERE key='creds' UNION SELECT session_id FROM session_numbers")
    .all() as { session: string }[];
  for (const { session } of sessions) {
    if (!sessionIdSchema.safeParse(session).success) continue;
    const credentials = db.prepare("SELECT value FROM auth WHERE user_id=? AND key='creds'").get(session) as { value: string } | undefined;
    const phone = credentials ? accountPhone((JSON.parse(credentials.value) as { me?: { id?: string } }).me?.id) : undefined;
    if (phone) bindSessionNumber(session, `${phone}@s.whatsapp.net`, true);
    else {
      const number = sessionNumber(session) || `legacy_${session}`;
      if (!db.prepare("SELECT 1 FROM messages WHERE user_id=? LIMIT 1").get(session)) continue;
      db.exec("BEGIN IMMEDIATE");
      try {
        registerNumber(session, number);
        snapshot(session, number);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  }
}
export function backupNumbers(owner: string) {
  return db.prepare(`SELECT number AS id,CASE WHEN number LIKE 'legacy_%' THEN NULL ELSE number END AS phone,
    first_connected_at AS firstConnectedAt,last_connected_at AS lastConnectedAt FROM backup_numbers WHERE owner_id=?
    ORDER BY last_connected_at DESC,number`).all(owner);
}
function ensureNumber(owner: string, number: string) {
  if (!db.prepare("SELECT 1 FROM backup_numbers WHERE owner_id=? AND number=?").get(owner, number))
    throw Object.assign(new Error("Backup deste número não encontrado."), { statusCode: 404 });
}
export function backupChats(owner: string, number: string) {
  ensureNumber(owner, number);
  return db.prepare(`WITH latest AS (
      SELECT chat_id,payload,timestamp,ROW_NUMBER() OVER(PARTITION BY chat_id ORDER BY timestamp DESC,id DESC) AS position
      FROM backup_messages WHERE owner_id=? AND number=?)
    SELECT c.id,c.name,json_extract(m.payload,'$.text') AS lastText,m.timestamp AS updatedAt,
      0 AS archived,0 AS pinnedAt,0 AS unreadCount,0 AS markedUnread
    FROM backup_chats c JOIN latest m ON m.chat_id=c.id AND m.position=1 WHERE c.owner_id=? AND c.number=?
    ORDER BY m.timestamp DESC,c.id`).all(owner, number, owner, number);
}
export function backupMessages(owner: string, number: string, chatId: string, before = Date.now() + 1000, beforeId = "") {
  ensureNumber(owner, number);
  const rows = db.prepare(`SELECT payload FROM backup_messages WHERE owner_id=? AND number=? AND chat_id=?
    AND (timestamp<? OR (timestamp=? AND id<?)) ORDER BY timestamp DESC,id DESC LIMIT 100`)
    .all(owner, number, chatId, before, before, beforeId).reverse() as { payload: string }[];
  return rows.map((row) => JSON.parse(row.payload));
}
