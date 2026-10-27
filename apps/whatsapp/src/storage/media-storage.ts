import { statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "./database.js";

const day = 86_400_000;
export const mediaSettingsSchema = z.object({
  retentionEnabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(3650),
});
export const mediaCleanupSchema = z.object({
  days: z.number().int().min(1).max(3650),
});
export type MediaSettings = z.infer<typeof mediaSettingsSchema>;
type File = { data?: string; name?: string; mime?: string; removed?: boolean };
type Payload = {
  attachment?: File;
  attachments?: File[];
  messages?: Payload[];
};
type Campaign = {
  id: string;
  payload: string;
  status: string;
  created_at: number;
};

export function mediaSettings(): MediaSettings {
  const row = db
    .prepare(
      "SELECT retention_enabled,retention_days FROM media_settings WHERE id=1",
    )
    .get() as { retention_enabled: number; retention_days: number };
  return {
    retentionEnabled: Boolean(row.retention_enabled),
    retentionDays: row.retention_days,
  };
}
export function saveMediaSettings(input: MediaSettings) {
  const settings = mediaSettingsSchema.parse(input);
  db.prepare(
    "UPDATE media_settings SET retention_enabled=?,retention_days=? WHERE id=1",
  ).run(Number(settings.retentionEnabled), settings.retentionDays);
  return settings;
}
export function shouldStoreMedia(createdAt: number, now = Date.now()) {
  const { purged_before } = db
    .prepare("SELECT purged_before FROM media_settings WHERE id=1")
    .get() as { purged_before: number };
  const settings = mediaSettings();
  return (
    Number.isFinite(createdAt) &&
    createdAt > 0 &&
    createdAt >= purged_before &&
    (!settings.retentionEnabled ||
      createdAt >= now - settings.retentionDays * day)
  );
}
export function storedMedia(user: string, id: string) {
  return db
    .prepare(
      "SELECT mime,name,data,created_at AS createdAt FROM media_cache WHERE user_id=? AND message_id=?",
    )
    .get(user, id) as
    | { mime: string; name: string; data: Uint8Array; createdAt: number }
    | undefined;
}
export function storeMedia(
  user: string,
  id: string,
  file: { mime: string; name: string; data: Uint8Array },
  createdAt: number,
  now = Date.now(),
) {
  // A remoção pode ocorrer durante um download; verificar a política novamente antes de gravar.
  if (
    !file.data.length ||
    file.data.length > 16 * 1024 * 1024 ||
    !shouldStoreMedia(createdAt, now)
  )
    return;
  if (
    !db
      .prepare(
        "SELECT 1 FROM messages WHERE user_id=? AND id=? AND kind!='deleted'",
      )
      .get(user, id)
  )
    return;
  try {
    db.prepare(
      "INSERT INTO media_cache VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,message_id) DO UPDATE SET mime=excluded.mime,name=excluded.name,data=excluded.data,created_at=excluded.created_at",
    ).run(user, id, file.mime, file.name, file.data, createdAt);
  } catch {
    console.warn(
      "Não foi possível guardar a cópia local da mídia. A mensagem já enviada não será reenviada.",
    );
  }
}
export function removeStoredMedia(user: string, id: string) {
  db.prepare("DELETE FROM media_cache WHERE user_id=? AND message_id=?").run(
    user,
    id,
  );
}
function files(payload: Payload): File[] {
  return [
    payload.attachment,
    ...(payload.attachments || []),
    ...(payload.messages || []).flatMap(files),
  ].filter((file): file is File => Boolean(file));
}
function campaignUsage(campaign: Campaign) {
  const attachments = files(JSON.parse(campaign.payload)).filter((file) =>
    Boolean(file.data),
  );
  return {
    bytes: attachments.reduce(
      (sum, file) => sum + Buffer.byteLength(file.data!, "utf8"),
      0,
    ),
    count: attachments.length,
  };
}
function campaigns() {
  return db
    .prepare("SELECT id,payload,status,created_at FROM campaigns")
    .iterate() as Iterable<Campaign>;
}
function campaignTotals(before = Infinity, finishedOnly = false) {
  const total = { bytes: 0, count: 0 };
  for (const row of campaigns()) {
    if (
      row.created_at >= before ||
      (finishedOnly && ["running", "queued"].includes(row.status))
    )
      continue;
    const usage = campaignUsage(row);
    total.bytes += usage.bytes;
    total.count += usage.count;
  }
  return total;
}
function byteCount(sql: string, before?: number) {
  const row =
    before === undefined ? db.prepare(sql).get() : db.prepare(sql).get(before);
  return row as { bytes: number; count: number };
}
export function mediaStorageStatus() {
  const chat = byteCount(
    "SELECT COALESCE(SUM(length(data)),0) AS bytes,COUNT(*) AS count FROM media_cache",
  );
  const profiles = byteCount(
    "SELECT COALESCE(SUM(length(data)),0) AS bytes,COUNT(data) AS count FROM profile_pictures",
  );
  const campaign = campaignTotals();
  const databaseBytes = [
    "whatsapp.db",
    "whatsapp.db-wal",
    "whatsapp.db-shm",
  ].reduce((sum, name) => {
    try {
      return sum + statSync(join(config.dataDir, name)).size;
    } catch {
      return sum;
    }
  }, 0);
  return {
    settings: mediaSettings(),
    chat,
    campaign,
    profiles,
    totalBytes: chat.bytes + campaign.bytes + profiles.bytes,
    totalCount: chat.count + campaign.count + profiles.count,
    databaseBytes,
  };
}
export function mediaCleanupPreview(days: number, now = Date.now()) {
  mediaCleanupSchema.parse({ days });
  const before = now - days * day;
  const chat = byteCount(
    "SELECT COALESCE(SUM(length(data)),0) AS bytes,COUNT(*) AS count FROM media_cache WHERE created_at<?",
    before,
  );
  const profiles = byteCount(
    "SELECT COALESCE(SUM(length(data)),0) AS bytes,COUNT(data) AS count FROM profile_pictures WHERE updated_at<?",
    before,
  );
  const campaign = campaignTotals(before, true);
  return {
    days,
    before,
    chat,
    campaign,
    profiles,
    totalBytes: chat.bytes + campaign.bytes + profiles.bytes,
    totalCount: chat.count + campaign.count + profiles.count,
  };
}
export function cleanupMedia(days: number, now = Date.now()) {
  const preview = mediaCleanupPreview(days, now);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM media_cache WHERE created_at<?").run(
      preview.before,
    );
    db.prepare("DELETE FROM profile_pictures WHERE updated_at<?").run(
      preview.before,
    );
    for (const row of campaigns()) {
      if (
        row.created_at >= preview.before ||
        ["running", "queued"].includes(row.status)
      )
        continue;
      const payload = JSON.parse(row.payload) as Payload;
      let changed = false;
      for (const file of files(payload))
        if (file.data) {
          file.data = "";
          file.removed = true;
          changed = true;
        }
      if (changed)
        db.prepare("UPDATE campaigns SET payload=? WHERE id=?").run(
          JSON.stringify(payload),
          row.id,
        );
    }
    db.prepare(
      "UPDATE media_settings SET purged_before=MAX(purged_before,?) WHERE id=1",
    ).run(preview.before);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return preview;
}
export function runMediaRetention(now = Date.now()) {
  const settings = mediaSettings();
  if (settings.retentionEnabled)
    return cleanupMedia(settings.retentionDays, now);
}
