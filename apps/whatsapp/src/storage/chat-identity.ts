import { db } from "./database.js";
import { sessionNumber } from "./backups.js";
import { sessionOwner } from "../sessions/session-id.js";

export function canonicalChatId(user: string, id: string) {
  if (!id.endsWith("@lid")) return id;
  const lid = id.split("@")[0].split(":")[0];
  const mapping = db.prepare("SELECT value FROM auth WHERE user_id=? AND key=?")
    .get(user, `lid-mapping-${lid}_reverse`) as { value: string } | undefined;
  if (mapping) {
    try {
      const phone = JSON.parse(mapping.value);
      if (typeof phone === "string" && /^\d{10,15}$/.test(phone)) return `${phone}@s.whatsapp.net`;
    } catch { /* Uma chave inválida não comprova a identidade. */ }
  }
  const message = db.prepare(`SELECT json_extract(raw,'$.key.remoteJidAlt') AS phone FROM messages
    WHERE user_id=? AND json_extract(raw,'$.key.remoteJid')=?
      AND json_extract(raw,'$.key.remoteJidAlt') LIKE '%@s.whatsapp.net' LIMIT 1`)
    .get(user, id) as { phone: string } | undefined;
  return message && /^\d{10,15}@s\.whatsapp\.net$/.test(message.phone) ? message.phone : id;
}

export function normalizeChats(user: string) {
  const number = sessionNumber(user);
  const owner = number ? sessionOwner(user) : null;
  const chats = db.prepare(`SELECT id FROM chats WHERE user_id=? AND id LIKE '%@lid'
    UNION SELECT id FROM backup_chats WHERE owner_id=? AND number=? AND id LIKE '%@lid'`)
    .all(user, owner, number ?? null) as { id: string }[];
  db.exec("SAVEPOINT normalize_chats");
  try {
    for (const chat of chats) {
      const id = canonicalChatId(user, chat.id);
      if (id === chat.id) continue;
      db.prepare(`INSERT INTO contacts SELECT user_id,?,name,priority FROM contacts WHERE user_id=? AND id=?
        ON CONFLICT(user_id,id) DO UPDATE SET
          name=CASE WHEN excluded.priority>contacts.priority THEN excluded.name ELSE contacts.name END,
          priority=MAX(contacts.priority,excluded.priority)`).run(id, user, chat.id);
      db.prepare(`INSERT INTO chats SELECT user_id,?,name,last_text,updated_at FROM chats WHERE user_id=? AND id=?
        ON CONFLICT(user_id,id) DO UPDATE SET
          name=CASE WHEN chats.name=chats.id THEN excluded.name ELSE chats.name END,
          last_text=CASE WHEN excluded.updated_at>chats.updated_at THEN excluded.last_text ELSE chats.last_text END,
          updated_at=MAX(chats.updated_at,excluded.updated_at)`).run(id, user, chat.id);
      db.prepare(`UPDATE chats SET name=COALESCE((SELECT name FROM contacts WHERE user_id=? AND id=?),name)
        WHERE user_id=? AND id=?`).run(user, id, user, id);
      db.prepare("UPDATE messages SET chat_id=? WHERE user_id=? AND chat_id=?").run(id, user, chat.id);
      db.prepare("UPDATE pending_message_edits SET chat_id=? WHERE user_id=? AND chat_id=?").run(id, user, chat.id);
      if (number) {
        db.prepare(`INSERT INTO backup_chats SELECT owner_id,number,?,CASE WHEN name=id THEN ? ELSE name END
          FROM backup_chats WHERE owner_id=? AND number=? AND id=?
          ON CONFLICT(owner_id,number,id) DO UPDATE SET
            name=CASE WHEN backup_chats.name=backup_chats.id THEN excluded.name ELSE backup_chats.name END`)
          .run(id, id, owner, number, chat.id);
        db.prepare(`INSERT INTO backup_messages(owner_id,number,chat_id,id,timestamp,kind,revision_at,payload)
          SELECT owner_id,number,?,id,timestamp,kind,revision_at,json_set(payload,'$.chatId',?)
          FROM backup_messages WHERE owner_id=? AND number=? AND chat_id=?
          ON CONFLICT(owner_id,number,chat_id,id) DO UPDATE SET payload=excluded.payload,kind=excluded.kind,revision_at=excluded.revision_at
          WHERE backup_messages.kind!='deleted' AND (excluded.kind='deleted' OR
            (excluded.revision_at>=backup_messages.revision_at AND
             (COALESCE(json_extract(backup_messages.payload,'$.edited'),0)=0 OR json_extract(excluded.payload,'$.edited')=1)))`)
          .run(id, id, owner, number, chat.id);
        db.prepare("DELETE FROM backup_messages WHERE owner_id=? AND number=? AND chat_id=?").run(owner, number, chat.id);
        db.prepare("DELETE FROM backup_chats WHERE owner_id=? AND number=? AND id=?").run(owner, number, chat.id);
      }
      db.prepare("DELETE FROM chats WHERE user_id=? AND id=?").run(user, chat.id);
    }
    db.exec("RELEASE normalize_chats");
  } catch (error) {
    db.exec("ROLLBACK TO normalize_chats; RELEASE normalize_chats");
    throw error;
  }
}
