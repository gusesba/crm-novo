import makeWASocket, {
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { sqliteAuth } from "../storage/auth.js";
import { db } from "../storage/database.js";
import {
  deleteStoredMessage,
  messageChatId,
  rawMessage,
  saveMessage,
  saveMessageReaction,
} from "../storage/messages.js";
import {
  backfillSavedContacts,
  saveContact,
  saveConversationName,
  syncGroupNames,
} from "../storage/contacts.js";
import { backfillChatStates, saveChatState } from "../storage/chat-states.js";

type Session = {
  socket?: WASocket;
  status: "disconnected" | "connecting" | "qr" | "connected";
  qr?: string;
  stopped: boolean;
  attempts: number;
  groupsSynced: boolean;
  timer?: NodeJS.Timeout;
};
const sessions = new Map<string, Session>();
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

export function sessionStatus(user: string) {
  const session = sessions.get(user);
  return { status: session?.status || "disconnected", qr: session?.qr };
}
export function connectedSocket(user: string): WASocket {
  const session = sessions.get(user);
  if (!session?.socket || session.status !== "connected")
    throw Object.assign(new Error("Conecte o WhatsApp antes de enviar."), {
      statusCode: 409,
    });
  return session.socket;
}
export async function connect(user: string) {
  const existing = sessions.get(user);
  if (existing && existing.status !== "disconnected")
    return sessionStatus(user);
  const session: Session = existing || {
    status: "connecting",
    stopped: false,
    attempts: 0,
    groupsSynced: false,
  };
  session.status = "connecting";
  session.stopped = false;
  session.qr = undefined;
  if (session.timer) clearTimeout(session.timer);
  sessions.set(user, session);
  const { state, saveCreds } = sqliteAuth(user);
  const socket = makeWASocket({
    auth: state,
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async (key) =>
      key.id ? rawMessage(user, key.id)?.message || undefined : undefined,
  });
  session.socket = socket;
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async (update) => {
    if (session.socket !== socket) return;
    if (update.qr) {
      session.qr = await QRCode.toDataURL(update.qr);
      session.status = "qr";
    }
    if (update.connection === "open") {
      session.status = "connected";
      session.qr = undefined;
      session.attempts = 0;
      void (async () => {
        await backfillSavedContacts(user, socket, state);
        await backfillChatStates(user, socket, state);
      })().catch((error) => logger.warn(error, "Chat metadata sync failed"));
      if (!session.groupsSynced) {
        session.groupsSynced = true;
        void syncGroupNames(user, socket).catch((error) => {
          session.groupsSynced = false;
          logger.warn(error, "Group names sync failed");
        });
      }
    }
    if (update.connection === "close") {
      session.status = "disconnected";
      session.qr = undefined;
      const code = (
        update.lastDisconnect?.error as { output?: { statusCode?: number } }
      )?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        session.stopped = true;
        db.prepare("DELETE FROM auth WHERE user_id=?").run(user);
      }
      if (!session.stopped && session.attempts < 8) {
        session.timer = setTimeout(
          () => {
            void connect(user).catch((error) =>
              logger.error(error, "Reconnect failed"),
            );
          },
          Math.min(30000, 2000 * ++session.attempts),
        );
      }
    }
  });
  socket.ev.on("messages.upsert", (event) => {
    for (const message of event.messages) saveMessage(user, message);
  });
  socket.ev.on("messaging-history.set", (event) => {
    for (const message of event.messages) saveMessage(user, message);
    for (const contact of event.contacts) saveContact(user, contact);
    for (const chat of event.chats) {
      saveChatState(user, chat);
      if (chat.id)
        saveConversationName(user, chat.id, chat.name || chat.displayName);
    }
  });
  socket.ev.on("chats.upsert", (chats) => {
    for (const chat of chats) saveChatState(user, chat);
  });
  socket.ev.on("chats.update", (chats) => {
    for (const chat of chats) saveChatState(user, chat);
  });
  socket.ev.on("contacts.upsert", (contacts) => {
    for (const contact of contacts) saveContact(user, contact);
  });
  socket.ev.on("contacts.update", (contacts) => {
    for (const contact of contacts) saveContact(user, contact);
  });
  socket.ev.on("groups.upsert", (groups) => {
    for (const group of groups)
      saveConversationName(user, group.id, group.subject);
  });
  socket.ev.on("groups.update", (groups) => {
    for (const group of groups)
      if (group.id) saveConversationName(user, group.id, group.subject);
  });
  socket.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (key.id && update.message) {
        const previous = rawMessage(user, key.id);
        if (previous) saveMessage(user, { ...previous, ...update });
      }
    }
  });
  socket.ev.on("messages.reaction", (reactions) => {
    for (const { key, reaction } of reactions) {
      const senderKey = reaction.key;
      const sender = senderKey?.fromMe
        ? "me"
        : senderKey?.participant || senderKey?.remoteJid;
      if (key.id && sender)
        saveMessageReaction(user, key.id, sender, reaction.text || "");
    }
  });
  socket.ev.on("messages.delete", (event) => {
    if (!("keys" in event)) return;
    for (const key of event.keys) {
      if (!key.id) continue;
      const stored = rawMessage(user, key.id);
      const chatId = stored && messageChatId(stored);
      if (chatId) deleteStoredMessage(user, key.id, chatId);
    }
  });
  return sessionStatus(user);
}
export async function disconnect(user: string) {
  const session = sessions.get(user);
  if (session) {
    session.stopped = true;
    if (session.timer) clearTimeout(session.timer);
    try {
      await session.socket?.logout();
    } catch {
      session.socket?.end(undefined);
    }
  }
  sessions.delete(user);
  db.prepare("DELETE FROM auth WHERE user_id=?").run(user);
  return { status: "disconnected" };
}
export async function restoreSessions() {
  const users = db
    .prepare("SELECT DISTINCT user_id FROM auth WHERE key='creds'")
    .all() as { user_id: string }[];
  for (const row of users)
    await connect(row.user_id).catch((error) =>
      logger.error(error, "Session restore failed"),
    );
}
export function stopSessions() {
  for (const session of sessions.values()) {
    session.stopped = true;
    if (session.timer) clearTimeout(session.timer);
    session.socket?.end(undefined);
  }
}
