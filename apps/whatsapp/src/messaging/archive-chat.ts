import { BufferJSON, proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { connectedSocket } from "../sessions/manager.js";
import { db } from "../storage/database.js";
import { saveChatState } from "../storage/chat-states.js";
import { sessionNumber } from "../storage/backups.js";

export async function archiveChat(
  user: string,
  chatId: string,
  archived: boolean,
  getSocket: (user: string) => Pick<WASocket, "chatModify"> = connectedSocket,
) {
  if (!db.prepare("SELECT 1 FROM chats WHERE user_id=? AND id=?").get(user, chatId))
    throw Object.assign(new Error("Conversa não encontrada."), { statusCode: 404 });

  const row = db.prepare(
    "SELECT raw FROM messages WHERE user_id=? AND chat_id=? ORDER BY timestamp DESC,id DESC LIMIT 1",
  ).get(user, chatId) as { raw: string } | undefined;
  const last = row ? proto.WebMessageInfo.fromObject(JSON.parse(row.raw, BufferJSON.reviver)) as WAMessage : undefined;
  if (!last?.key.id || !last.key.remoteJid || !Number(last.messageTimestamp) ||
      (last.key.remoteJid.endsWith("@g.us") && !last.key.fromMe && !last.key.participant))
    throw Object.assign(new Error("Sincronize as mensagens da conversa antes de alterar o arquivamento."), {
      statusCode: 409,
    });

  const number = sessionNumber(user);
  await getSocket(user).chatModify({
    archive: archived,
    lastMessages: [{ key: last.key, messageTimestamp: last.messageTimestamp }],
  }, chatId);
  if (number !== sessionNumber(user))
    throw Object.assign(new Error("Os dados desta conta foram alterados durante o arquivamento."), { statusCode: 409 });
  saveChatState(user, { id: chatId, archived });
  return { chatId, archived };
}
