import { BufferJSON, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { connectedSocket } from "../sessions/manager.js";
import { db } from "../storage/database.js";
import { chatUnreadState, clearChatUnread, saveChatState } from "../storage/chat-states.js";

function usableKey(message: WAMessage) {
  return !!message.key.id && !!message.key.remoteJid &&
    (!message.key.remoteJid.endsWith("@g.us") || message.key.fromMe || !!message.key.participant);
}

export async function readChat(
  user: string,
  chatId: string,
  lastMessageId: string,
  getSocket: (user: string) => Pick<WASocket, "chatModify" | "readMessages"> = connectedSocket,
) {
  const row = db.prepare(
    "SELECT raw,timestamp FROM messages WHERE user_id=? AND chat_id=? AND id=?",
  ).get(user, chatId, lastMessageId) as { raw: string; timestamp: number } | undefined;
  if (!row) throw Object.assign(new Error("Mensagem da conversa não encontrada."), { statusCode: 404 });
  const last = JSON.parse(row.raw, BufferJSON.reviver) as WAMessage;
  if (!usableKey(last) || !Number(last.messageTimestamp))
    throw Object.assign(new Error("Sincronize as mensagens antes de marcar a conversa como lida."), { statusCode: 409 });
  saveChatState(user, { id: chatId });
  const state = chatUnreadState(user, chatId)!;
  // Sem snapshot, zero ainda não confirma a leitura de uma conversa antiga.
  if (!state.unreadCount && state.version > 0) return { chatId, unreadCount: 0, markedUnread: false };
  const socket = getSocket(user);
  const incoming = db.prepare(
    `SELECT raw FROM messages WHERE user_id=? AND chat_id=? AND mine=0
       AND (timestamp<? OR (timestamp=? AND id<=?))
     ORDER BY timestamp DESC,id DESC LIMIT ?`,
  ).all(user, chatId, row.timestamp, row.timestamp, lastMessageId, Math.max(state.unreadCount, 1)) as { raw: string }[];
  const keys = incoming.map((item) => JSON.parse(item.raw, BufferJSON.reviver) as WAMessage)
    .filter(usableKey).map((message) => message.key);
  if (keys.length) await socket.readMessages(keys);
  await socket.chatModify({ markRead: true, lastMessages: [{ key: last.key, messageTimestamp: last.messageTimestamp }] }, chatId);
  const latest = db.prepare(
    "SELECT id FROM messages WHERE user_id=? AND chat_id=? ORDER BY timestamp DESC,id DESC LIMIT 1",
  ).get(user, chatId) as { id: string } | undefined;
  if (latest?.id === lastMessageId) clearChatUnread(user, chatId, state.version);
  const remaining = chatUnreadState(user, chatId)?.unreadCount ?? 0;
  return { chatId, unreadCount: Math.max(remaining, 0), markedUnread: remaining < 0 };
}
