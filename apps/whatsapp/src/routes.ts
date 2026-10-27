import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./storage/database.js";
import { listMessages, listRecentStickers } from "./storage/messages.js";
import { connect, connectedSocket, disconnect, sessionStatus } from "./sessions/manager.js";
import { resolvePhone } from "./messaging/resolve-phone.js";
import { sessionIdSchema } from "./sessions/session-id.js";
import {
  archiveChatSchema,
  campaignSchema,
  deleteSchema,
  forwardSchema,
  reactionSchema,
  readChatSchema,
  sendSchema,
} from "./messaging/schemas.js";
import {
  deleteMessage,
  editMessage,
  forwardMessage,
  media,
  reactToMessage,
  sendMessage,
} from "./messaging/send.js";
import { profilePicture } from "./messaging/profile-picture.js";
import { archiveChat } from "./messaging/archive-chat.js";
import { readChat } from "./messaging/read-chat.js";
import { listChats } from "./storage/chat-states.js";
import { contactChatSchema, getContact, saveContactSchema, saveWhatsAppContact } from "./messaging/contacts.js";
import { cleanupMedia, mediaCleanupPreview, mediaCleanupSchema, mediaSettingsSchema, mediaStorageStatus, saveMediaSettings } from "./storage/media-storage.js";
import {
  campaignDeliveries,
  campaignMessages,
  campaigns,
  cancelCampaign,
  createCampaign,
} from "./campaigns/worker.js";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/media-storage", async () => mediaStorageStatus());
  app.put("/media-storage/settings", async (req) => saveMediaSettings(mediaSettingsSchema.parse(req.body)));
  app.post("/media-storage/cleanup-preview", async (req) => mediaCleanupPreview(mediaCleanupSchema.parse(req.body).days));
  app.post("/media-storage/cleanup", async (req) => {
    const body = mediaCleanupSchema.extend({ confirmed: z.literal(true) }).parse(req.body);
    return cleanupMedia(body.days);
  });
  const params = z.object({
    user: sessionIdSchema,
    id: z.string().max(200).optional(),
  });
  app.get("/sessions/:user/contacts", async (req) => {
    const { chatId } = z.object({ chatId: contactChatSchema }).parse(req.query);
    return getContact(params.parse(req.params).user, chatId);
  });
  app.put("/sessions/:user/contacts", async (req) => saveWhatsAppContact(params.parse(req.params).user, saveContactSchema.parse(req.body)));
  app.get("/sessions/:user/status", async (req) =>
    sessionStatus(params.parse(req.params).user),
  );
  app.post("/sessions/:user/connect", async (req) =>
    connect(params.parse(req.params).user),
  );
  app.post("/sessions/:user/disconnect", async (req) =>
    disconnect(params.parse(req.params).user),
  );
  app.get("/sessions/:user/chats", async (req) =>
    listChats(params.parse(req.params).user),
  );
  app.put("/sessions/:user/chats/archive", async (req) => {
    const { chatId, archived } = archiveChatSchema.parse(req.body);
    return archiveChat(params.parse(req.params).user, chatId, archived);
  });
  app.put("/sessions/:user/chats/read", async (req) => {
    const { chatId, lastMessageId } = readChatSchema.parse(req.body);
    return readChat(params.parse(req.params).user, chatId, lastMessageId);
  });
  app.post("/sessions/:user/resolve-phone", async (req) => {
    const { phone } = z.object({ phone: z.string().regex(/^\d{10,15}$/) }).parse(req.body);
    const user = params.parse(req.params).user;
    const chatExists = (chatId: string) => Boolean(db.prepare("SELECT 1 FROM chats WHERE user_id=? AND id=?").get(user, chatId));
    const socket = connectedSocket(user);
    const result = await resolvePhone(phone, (candidate) => socket.onWhatsApp(candidate));
    return result ? { ...result, exists: chatExists(result.chatId) } : null;
  });
  app.get("/sessions/:user/profile-picture", async (req, reply) => {
    const query = z
      .object({
        chatId: z
          .string()
          .max(100)
          .regex(/^[^@\s]+@(s\.whatsapp\.net|g\.us|lid)$/),
      })
      .parse(req.query);
    const picture = await profilePicture(
      params.parse(req.params).user,
      query.chatId,
    );
    if (!picture?.data || !picture.mime) return reply.code(404).send();
    return reply
      .header("Cache-Control", "private, max-age=3600")
      .type(picture.mime)
      .send(Buffer.from(picture.data));
  });
  app.get("/sessions/:user/messages", async (req) => {
    const query = z
      .object({
        chatId: z.string().max(100),
        before: z.coerce.number().optional(),
        beforeId: z.string().max(200).optional(),
      })
      .parse(req.query);
    return listMessages(
      params.parse(req.params).user,
      query.chatId,
      query.before,
      query.beforeId,
    );
  });
  app.get("/sessions/:user/stickers", async (req) =>
    listRecentStickers(params.parse(req.params).user),
  );
  app.post("/sessions/:user/send", async (req) =>
    sendMessage(params.parse(req.params).user, sendSchema.parse(req.body)),
  );
  app.put("/sessions/:user/messages/:id", async (req) => {
    const { user, id } = params.parse(req.params);
    const body = z
      .object({
        chatId: z.string().max(100),
        text: z.string().min(1).max(10000),
      })
      .parse(req.body);
    return editMessage(user, id!, body.chatId, body.text);
  });
  app.post("/sessions/:user/messages/:id/react", async (req) => {
    const { user, id } = params.parse(req.params);
    const body = reactionSchema.parse(req.body);
    return reactToMessage(user, id!, body.chatId, body.emoji);
  });
  app.post("/sessions/:user/messages/:id/forward", async (req) => {
    const { user, id } = params.parse(req.params);
    const body = forwardSchema.parse(req.body);
    return forwardMessage(user, id!, body.chatId);
  });
  app.delete("/sessions/:user/messages/:id", async (req) => {
    const { user, id } = params.parse(req.params);
    const body = deleteSchema.parse(req.body);
    return deleteMessage(user, id!, body.chatId, body.forEveryone);
  });
  app.get("/sessions/:user/media/:id", async (req) => {
    const { user, id } = params.parse(req.params);
    return media(user, id!);
  });
  app.get("/sessions/:user/campaigns", async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(6),
      })
      .parse(req.query);
    return campaigns(params.parse(req.params).user, query.page, query.pageSize);
  });
  app.get("/sessions/:user/campaigns/:id/messages", async (req) => {
    const { user, id } = params.parse(req.params);
    return campaignMessages(user, id!);
  });
  app.get("/sessions/:user/campaigns/:id/deliveries", async (req) => {
    const { user, id } = params.parse(req.params);
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(10),
        status: z.enum(["pending", "sent", "skipped", "failed"]).optional(),
      })
      .parse(req.query);
    return campaignDeliveries(
      user,
      id!,
      query.page,
      query.pageSize,
      query.status,
    );
  });
  app.post("/sessions/:user/campaigns", async (req) =>
    createCampaign(
      params.parse(req.params).user,
      campaignSchema.parse(req.body),
    ),
  );
  app.post("/sessions/:user/campaigns/:id/cancel", async (req) => {
    const { user, id } = params.parse(req.params);
    return cancelCampaign(user, id!);
  });
}
