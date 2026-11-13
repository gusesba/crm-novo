import { db } from "./database.js";
import { consolidateBackupChat, sessionNumber } from "./backups.js";
import { sessionOwner } from "../sessions/session-id.js";
import type { WAMessage } from "@whiskeysockets/baileys";
import { replayEncryptedEdits } from "./encrypted-edits.js";

export function saveChatIdentity(user: string, id: string, chatId: string) {
  if (!/^\d+(?::\d+)?@lid$/.test(id) || !/^\d{10,15}@s\.whatsapp\.net$/.test(chatId)) return;
  const lid = id.split("@")[0].split(":")[0] + "@lid";
  db.prepare(`INSERT INTO chat_aliases VALUES(?,?,?) ON CONFLICT(user_id,lid) DO UPDATE SET chat_id=excluded.chat_id
    WHERE chat_aliases.chat_id!=excluded.chat_id`).run(user, lid, chatId);
}

export function canonicalChatId(user: string, id: string) {
  if (!id.endsWith("@lid")) return id;
  const lid = id.split("@")[0].split(":")[0];
  const mapping = db.prepare("SELECT value FROM auth WHERE user_id=? AND key=?")
    .get(user, `lid-mapping-${lid}_reverse`) as { value: string } | undefined;
  if (mapping) {
    let phone: unknown;
    try {
      phone = JSON.parse(mapping.value);
    } catch { /* Uma chave inválida não comprova a identidade. */ }
    if (typeof phone === "string" && /^\d{10,15}$/.test(phone)) {
      const chatId = `${phone}@s.whatsapp.net`;
      saveChatIdentity(user, id, chatId);
      return chatId;
    }
  }
  const alias = db.prepare("SELECT chat_id FROM chat_aliases WHERE user_id=? AND lid=?")
    .get(user, `${lid}@lid`) as { chat_id: string } | undefined;
  if (alias) return alias.chat_id;
  const message = db.prepare(`SELECT chat_id,json_extract(raw,'$.key.remoteJidAlt') AS phone FROM messages
    WHERE user_id=? AND json_extract(raw,'$.key.remoteJid')=?
      AND (json_extract(raw,'$.key.remoteJidAlt') LIKE '%@s.whatsapp.net' OR chat_id LIKE '%@s.whatsapp.net') LIMIT 1`)
    .get(user, id) as { phone: string; chat_id: string } | undefined;
  const chatId = message && [message.phone, message.chat_id].find((value) => /^\d{10,15}@s\.whatsapp\.net$/.test(value));
  if (!chatId) return id;
  saveChatIdentity(user, id, chatId);
  return chatId;
}

export function normalizeChats(user: string, save: (user: string, message: WAMessage) => void) {
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
      if (number) consolidateBackupChat(user, number, chat.id, id);
      db.prepare("DELETE FROM chats WHERE user_id=? AND id=?").run(user, chat.id);
    }
    const pending = db.prepare(`SELECT DISTINCT p.chat_id,p.target_id FROM pending_message_edits p
      JOIN messages m ON m.user_id=p.user_id AND m.chat_id=p.chat_id AND m.id=p.target_id
      WHERE p.user_id=? AND m.kind!='deleted'`).all(user) as { chat_id: string; target_id: string }[];
    for (const edit of pending) replayEncryptedEdits(user, edit.chat_id, edit.target_id, save);
    db.exec("RELEASE normalize_chats");
  } catch (error) {
    db.exec("ROLLBACK TO normalize_chats; RELEASE normalize_chats");
    throw error;
  }
}
