import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "../config.js";
import { db } from "../storage/database.js";
import { connectedSocket } from "../sessions/manager.js";
import { sendMessage } from "../messaging/send.js";
import type { CampaignInput } from "../messaging/schemas.js";
import { deliver } from "./deliver.js";
import { sendToPhone } from "./send-to-phone.js";

const controllers = new Map<string, AbortController>();
const running = new Map<string, Promise<void>>();
const activeUsers = new Set<string>();
export function campaigns(user: string, page: number, pageSize: number) {
  const total = (
    db
      .prepare("SELECT COUNT(*) AS total FROM campaigns WHERE user_id=?")
      .get(user) as { total: number }
  ).total;
  const items = db
    .prepare(
      "SELECT id, json_extract(payload,'$.name') AS name, json_array_length(payload,'$.recipients') AS total, COALESCE(json_array_length(payload,'$.messages'),1) AS messageCount, status, sent, failed, skipped, error, created_at AS createdAt FROM campaigns WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .all(user, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}
export function campaignDeliveries(
  user: string,
  id: string,
  page: number,
  pageSize: number,
  status?: string,
) {
  if (
    !db
      .prepare("SELECT id FROM campaigns WHERE id=? AND user_id=?")
      .get(id, user)
  )
    throw Object.assign(new Error("Disparo não encontrado."), {
      statusCode: 404,
    });
  const condition = status ? " AND status=?" : "";
  const params = status ? [id, status] : [id];
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM campaign_deliveries WHERE campaign_id=?${condition}`,
      )
      .get(...params) as { total: number }
  ).total;
  const items = db
    .prepare(
      `SELECT lead_id AS leadId, name, phone, status, error, external_message_id AS externalMessageId, updated_at AS updatedAt FROM campaign_deliveries WHERE campaign_id=?${condition} ORDER BY position LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}
export function createCampaign(user: string, input: CampaignInput) {
  connectedSocket(user);
  if (
    activeUsers.has(user) ||
    db
      .prepare("SELECT id FROM campaigns WHERE user_id=? AND status='running'")
      .get(user)
  )
    throw Object.assign(
      new Error("Aguarde ou cancele o disparo em andamento."),
      { statusCode: 409 },
    );
  const id = randomUUID();
  const controller = new AbortController();
  controllers.set(id, controller);
  db.prepare(
    "INSERT INTO campaigns(id,user_id,payload,status,created_at) VALUES(?,?,?,'running',?)",
  ).run(id, user, JSON.stringify(input), Date.now());
  const insertDelivery = db.prepare(
    "INSERT INTO campaign_deliveries(campaign_id,position,lead_id,name,phone) VALUES(?,?,?,?,?)",
  );
  for (const [position, recipient] of input.recipients.entries())
    insertDelivery.run(
      id,
      position,
      recipient.leadId,
      recipient.name,
      recipient.phone,
    );
  activeUsers.add(user);
  running.set(id, run(id, user, input, controller.signal));
  return { id };
}
export function cancelCampaign(user: string, id: string) {
  if (
    !db
      .prepare("SELECT id FROM campaigns WHERE id=? AND user_id=?")
      .get(id, user)
  )
    throw Object.assign(new Error("Disparo não encontrado."), {
      statusCode: 404,
    });
  controllers.get(id)?.abort();
  db.prepare(
    "UPDATE campaigns SET status='cancelled' WHERE id=? AND user_id=? AND status='running'",
  ).run(id, user);
  return { cancelled: true };
}
async function run(
  id: string,
  user: string,
  input: CampaignInput,
  signal: AbortSignal,
) {
  const destinations = new Map<number, string>();
  try {
    await deliver(input, signal, {
      eligible: async (recipient) => {
        const response = await fetch(
          `${config.apiUrl}/internal/eligibility?userId=${user}&leadId=${recipient.leadId}&phone=${recipient.phone}`,
          {
            headers: { "x-service-key": config.secret },
            signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          },
        );
        if (!response.ok)
          throw new Error("Não foi possível validar os destinatários no CRM.");
        return (
          ((await response.json()) as { eligible: boolean }).eligible === true
        );
      },
      send: async (recipient, message) => {
        const send = (chatId: string) =>
          sendMessage(user, {
            chatId,
            text: message.text?.replaceAll("{{nome}}", recipient.name),
            attachment: message.attachment,
          });
        const destination = destinations.get(recipient.leadId);
        if (destination)
          return { ...(await send(destination)), phone: destination.split("@")[0] };
        const delivery = await sendToPhone(
          recipient.phone,
          (candidate) => connectedSocket(user).onWhatsApp(candidate),
          send,
          signal,
        );
        destinations.set(recipient.leadId, delivery.chatId);
        return { ...delivery.result, phone: delivery.phone };
      },
      record: (recipient, status, error, result) => {
        // status é uma união fechada controlada pelo worker, nunca entrada HTTP.
        db.prepare(`UPDATE campaigns SET ${status}=${status}+1 WHERE id=?`).run(
          id,
        );
        const message = error
          ? error instanceof Error
            ? error.message
            : "Falha de envio"
          : null;
        const externalMessageId =
          result && typeof result === "object" && "id" in result
            ? String(result.id)
            : null;
        const deliveredPhone =
          result && typeof result === "object" && "phone" in result
            ? String(result.phone)
            : destinations.get(recipient.leadId)?.split("@")[0] || recipient.phone;
        db.prepare(
          "UPDATE campaign_deliveries SET status=?,error=?,external_message_id=?,phone=?,updated_at=? WHERE campaign_id=? AND lead_id=?",
        ).run(
          status,
          message,
          externalMessageId,
          deliveredPhone,
          Date.now(),
          id,
          recipient.leadId,
        );
      },
      wait: (milliseconds, signal) =>
        delay(milliseconds, undefined, { signal }),
      random: Math.random,
    });
    db.prepare(
      "UPDATE campaigns SET status='completed' WHERE id=? AND status='running'",
    ).run(id);
  } catch (error) {
    if (!signal.aborted)
      db.prepare("UPDATE campaigns SET status='failed',error=? WHERE id=?").run(
        error instanceof Error ? error.message : "Falha no disparo",
        id,
      );
  } finally {
    controllers.delete(id);
    activeUsers.delete(user);
    running.delete(id);
  }
}
export async function stopCampaigns() {
  for (const controller of controllers.values()) controller.abort();
  await Promise.allSettled(running.values());
}
