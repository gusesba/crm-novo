import type {
  AuthenticationState,
  ChatUpdate,
  WASocket,
} from "@whiskeysockets/baileys";
import { db } from "./database.js";

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
      "SELECT id,archived,pinned_at AS pinnedAt FROM chat_states WHERE user_id=? AND id LIKE '%@lid'",
    )
    .all(user) as { id: string; archived: number; pinnedAt: number }[];
  for (const state of states) {
    const id = canonicalChatId(user, state.id);
    if (id === state.id) continue;
    db.prepare(
      `INSERT INTO chat_states VALUES(?,?,?,?)
       ON CONFLICT(user_id,id) DO UPDATE SET
         archived=MAX(chat_states.archived,excluded.archived),
         pinned_at=MAX(chat_states.pinned_at,excluded.pinned_at)`,
    ).run(user, id, state.archived, state.pinnedAt);
    db.prepare("DELETE FROM chat_states WHERE user_id=? AND id=?").run(
      user,
      state.id,
    );
  }
}

export function saveChatState(
  user: string,
  chat: Pick<ChatUpdate, "id" | "archived" | "pinned">,
) {
  if (!chat.id) return;
  const id = canonicalChatId(user, chat.id);
  db.prepare("INSERT OR IGNORE INTO chat_states VALUES(?,?,0,0)").run(user, id);
  if (typeof chat.archived === "boolean")
    db.prepare(
      "UPDATE chat_states SET archived=? WHERE user_id=? AND id=?",
    ).run(chat.archived ? 1 : 0, user, id);
  if (Object.hasOwn(chat, "pinned") && chat.pinned !== undefined)
    db.prepare(
      "UPDATE chat_states SET pinned_at=? WHERE user_id=? AND id=?",
    ).run(Number(chat.pinned || 0), user, id);
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
              COALESCE(s.archived,0) AS archived,COALESCE(s.pinned_at,0) AS pinnedAt
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
         (SELECT COUNT(*) FROM service_state WHERE user_id=? AND key='chat-state-snapshot-v3') AS completed`,
    )
    .get(user, user) as { chats: number; completed: number };
  if (!status.chats || status.completed) return;

  await state.keys.set({
    "app-state-sync-version": { regular_low: null },
  });
  await socket.resyncAppState(["regular_low"], false);
  db.prepare("INSERT OR REPLACE INTO service_state VALUES(?,?,?)").run(
    user,
    "chat-state-snapshot-v3",
    new Date().toISOString(),
  );
}
