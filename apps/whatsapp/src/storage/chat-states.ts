import type {
  AuthenticationState,
  ChatUpdate,
  WAMessageKey,
  WASocket,
} from "@whiskeysockets/baileys";
import { proto } from "@whiskeysockets/baileys";
import { db } from "./database.js";

let lastUnreadUpdate = 0;
function unreadUpdateTime() {
  lastUnreadUpdate = Math.max(Date.now(), lastUnreadUpdate + 1);
  return lastUnreadUpdate;
}

function canonicalChatId(user: string, id: string) {
  if (!id.endsWith("@lid")) return id;
  const lid = id.slice(0, id.indexOf("@")).split(":")[0];
  const mapping = db
    .prepare("SELECT value FROM auth WHERE user_id=? AND key=?")
    .get(user, `lid-mapping-${lid}_reverse`) as { value: string } | undefined;
  if (!mapping) return id;
  try {
    const phone = JSON.parse(mapping.value);
    return typeof phone === "string" && /^\d+$/.test(phone)
      ? `${phone}@s.whatsapp.net`
      : id;
  } catch {
    return id;
  }
}

function normalizeChatStates(user: string) {
  const states = db
    .prepare(
      "SELECT id,archived,pinned_at AS pinnedAt,unread_count AS unreadCount,unread_updated_at AS unreadUpdatedAt FROM chat_states WHERE user_id=? AND id LIKE '%@lid'",
    )
    .all(user) as { id: string; archived: number; pinnedAt: number; unreadCount: number; unreadUpdatedAt: number }[];
  for (const state of states) {
    const id = canonicalChatId(user, state.id);
    if (id === state.id) continue;
    db.prepare(
      `INSERT INTO chat_states(user_id,id,archived,pinned_at,unread_count,unread_updated_at) VALUES(?,?,?,?,?,?)
       ON CONFLICT(user_id,id) DO UPDATE SET
         archived=MAX(chat_states.archived,excluded.archived),
         pinned_at=MAX(chat_states.pinned_at,excluded.pinned_at),
         unread_count=CASE WHEN excluded.unread_updated_at > chat_states.unread_updated_at THEN excluded.unread_count ELSE chat_states.unread_count END,
         unread_updated_at=MAX(chat_states.unread_updated_at,excluded.unread_updated_at)`,
    ).run(user, id, state.archived, state.pinnedAt, state.unreadCount, state.unreadUpdatedAt);
    db.prepare("DELETE FROM chat_states WHERE user_id=? AND id=?").run(
      user,
      state.id,
    );
  }
}

export function saveChatState(
  user: string,
  chat: Pick<ChatUpdate, "id" | "archived" | "pinned" | "unreadCount">,
  unreadMode: "snapshot" | "delta" = "snapshot",
) {
  if (!chat.id) return;
  const id = canonicalChatId(user, chat.id);
  db.prepare("INSERT OR IGNORE INTO chat_states(user_id,id) VALUES(?,?)").run(user, id);
  if (typeof chat.archived === "boolean")
    db.prepare(
      "UPDATE chat_states SET archived=? WHERE user_id=? AND id=?",
    ).run(chat.archived ? 1 : 0, user, id);
  if (Object.hasOwn(chat, "pinned") && chat.pinned !== undefined)
    db.prepare(
      "UPDATE chat_states SET pinned_at=? WHERE user_id=? AND id=?",
    ).run(Number(chat.pinned || 0), user, id);
  if (Object.hasOwn(chat, "unreadCount") && typeof chat.unreadCount === "number" &&
      Number.isSafeInteger(chat.unreadCount) && chat.unreadCount >= -1) {
    const count = chat.unreadCount;
    db.prepare(
      `UPDATE chat_states SET unread_count=CASE
         WHEN ?=-1 THEN CASE WHEN unread_count>0 THEN unread_count ELSE -1 END
         WHEN ?=0 THEN 0
         WHEN ?='delta' THEN MAX(unread_count,0)+?
         ELSE ? END, unread_updated_at=MAX(unread_updated_at+1,?)
       WHERE user_id=? AND id=?`,
    ).run(count, count, unreadMode, count, count, unreadUpdateTime(), user, id);
  }
}

export function chatUnreadState(user: string, chatId: string) {
  normalizeChatStates(user);
  return db.prepare(
    "SELECT unread_count AS unreadCount,unread_updated_at AS version FROM chat_states WHERE user_id=? AND id=?",
  ).get(user, canonicalChatId(user, chatId)) as { unreadCount: number; version: number } | undefined;
}

export function clearChatUnread(user: string, chatId: string, version: number) {
  db.prepare(
    "UPDATE chat_states SET unread_count=0,unread_updated_at=MAX(unread_updated_at+1,?) WHERE user_id=? AND id=? AND unread_updated_at=?",
  ).run(unreadUpdateTime(), user, canonicalChatId(user, chatId), version);
}

export function syncMessageRead(user: string, key: WAMessageKey) {
  if (!key.id || !key.remoteJid || key.fromMe !== false) return;
  const message = db.prepare(
    "SELECT rowid,chat_id AS chatId,timestamp,raw FROM messages WHERE user_id=? AND id=? AND mine=0",
  ).get(user, key.id) as { rowid: number; chatId: string; timestamp: number; raw: string } | undefined;
  if (!message) return;
  const raw = JSON.parse(message.raw);
  const chatId = canonicalChatId(user, message.chatId);
  if (canonicalChatId(user, key.remoteJid) !== chatId && raw.key?.remoteJid !== key.remoteJid) return;
  const read = proto.WebMessageInfo.Status.READ;
  if (raw.status >= read) return;

  const chatIds = JSON.stringify([...new Set([message.chatId, chatId, key.remoteJid])]);
  // O recibo confirma a leitura até esta mensagem, sem usar a hora do recibo como hora do conteúdo.
  db.prepare(
    `UPDATE messages SET raw=json_set(raw,'$.status',?)
     WHERE user_id=? AND mine=0 AND chat_id IN (SELECT value FROM json_each(?))
       AND (timestamp<? OR (timestamp=? AND rowid<=?)) AND COALESCE(json_extract(raw,'$.status'),0)<?`,
  ).run(read, user, chatIds, message.timestamp, message.timestamp, message.rowid, read);
  const newer = db.prepare(
    `SELECT COUNT(*) AS count FROM messages
     WHERE user_id=? AND mine=0 AND chat_id IN (SELECT value FROM json_each(?))
       AND (timestamp>? OR (timestamp=? AND rowid>?)) AND COALESCE(json_extract(raw,'$.status'),0)<?`,
  ).get(user, chatIds, message.timestamp, message.timestamp, message.rowid, read) as { count: number };
  const current = chatUnreadState(user, chatId);
  if (current && current.unreadCount > newer.count)
    saveChatState(user, { id: chatId, unreadCount: newer.count });
}

export function listChats(user: string) {
  normalizeChatStates(user);
  return db
    .prepare(
      `WITH active AS (
         SELECT c2.id FROM chats c2
         LEFT JOIN chat_states s2 ON s2.user_id=c2.user_id AND s2.id=c2.id
         WHERE c2.user_id=? AND COALESCE(s2.archived,0)=0
         ORDER BY CASE WHEN COALESCE(s2.pinned_at,0)>0 THEN 0 ELSE 1 END,
                  COALESCE(s2.pinned_at,0) DESC,c2.updated_at DESC LIMIT 500
       )
       SELECT c.id,c.name,
              CASE WHEN c.last_text='Mensagem não suportada' AND EXISTS (
                SELECT 1 FROM messages m
                WHERE m.user_id=c.user_id AND m.chat_id=c.id AND m.timestamp=c.updated_at
                  AND json_type(m.raw,'$.message.stickerMessage') IS NOT NULL
              ) THEN 'Figurinha' ELSE c.last_text END AS lastText,
              c.updated_at AS updatedAt,
              COALESCE(s.archived,0) AS archived,COALESCE(s.pinned_at,0) AS pinnedAt,
              MAX(COALESCE(s.unread_count,0),0) AS unreadCount,
              COALESCE(s.unread_count,0)<0 AS markedUnread,
              EXISTS(SELECT 1 FROM contacts contact WHERE contact.user_id=c.user_id AND contact.id=c.id AND contact.priority>=4) AS contactSaved
       FROM chats c LEFT JOIN chat_states s ON s.user_id=c.user_id AND s.id=c.id
       WHERE c.user_id=? AND (COALESCE(s.archived,0)=1 OR c.id IN active)
       ORDER BY COALESCE(s.archived,0) ASC,
                CASE WHEN COALESCE(s.pinned_at,0)>0 THEN 0 ELSE 1 END,
                COALESCE(s.pinned_at,0) DESC,c.updated_at DESC`,
    )
    .all(user, user);
}

export async function backfillChatStates(
  user: string,
  socket: WASocket,
  state: AuthenticationState,
) {
  const status = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM chats WHERE user_id=?) AS chats,
         (SELECT COUNT(*) FROM service_state WHERE user_id=? AND key='chat-state-snapshot-v4') AS completed`,
    )
    .get(user, user) as { chats: number; completed: number };
  if (!status.chats || status.completed) return;

  await state.keys.set({
    "app-state-sync-version": { regular_low: null },
  });
  await socket.resyncAppState(["regular_low"], false);
  db.prepare("INSERT OR REPLACE INTO service_state VALUES(?,?,?)").run(
    user,
    "chat-state-snapshot-v4",
    new Date().toISOString(),
  );
}
