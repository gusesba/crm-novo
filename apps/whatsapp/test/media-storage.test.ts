import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-media-storage-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage, rawMessage, deleteStoredMessage, markMessageDeleted } =
  await import("../src/storage/messages.js");
const storage = await import("../src/storage/media-storage.js");
const { media } = await import("../src/messaging/media.js");
const { sendMessage } = await import("../src/messaging/send.js");
const day = 86_400_000;
const now = 2_000_000_000_000;
const chat = "5551999999999@s.whatsapp.net";
const file = {
  mime: "image/jpeg",
  name: "foto.jpg",
  data: Buffer.from("image-bytes"),
};
function message(id: string, timestamp: number): WAMessage {
  return {
    key: { id, remoteJid: chat, fromMe: false },
    messageTimestamp: Math.floor(timestamp / 1000),
    message: {
      imageMessage: { caption: "Texto preservado", mimetype: file.mime },
    },
  };
}
function reset() {
  db.exec(
    "DELETE FROM media_cache; DELETE FROM campaigns; DELETE FROM profile_pictures; DELETE FROM messages; DELETE FROM message_reactions; UPDATE media_settings SET retention_enabled=0,retention_days=30,purged_before=0;",
  );
}
function save(id: string, timestamp: number, user = "1") {
  saveMessage(user, message(id, timestamp));
  storage.storeMedia(user, id, file, timestamp, now);
}
function campaign(
  id: string,
  status: string,
  timestamp: number,
  legacy = false,
) {
  const attachment = {
    name: "foto.jpg",
    mime: file.mime,
    data: file.data.toString("base64"),
  };
  const payload = {
    name: id,
    recipients: [{ leadId: 1, phone: "5551999999999", name: "Contato" }],
    ...(legacy
      ? { text: "Modelo antigo", attachment }
      : {
          messages: [
            {
              text: "Olá, ${nome}",
              attachments: [attachment, { ...attachment, name: "outra.jpg" }],
            },
          ],
        }),
  };
  db.prepare(
    "INSERT INTO campaigns(id,user_id,payload,status,created_at,sent) VALUES(?,?,?,?,?,1)",
  ).run(id, "1", JSON.stringify(payload), status, timestamp);
}
after(() => {
  db.close();
  rmSync(directory, { recursive: true });
});

test("retention starts disabled, persists its days, and rejects invalid ranges and types", () => {
  reset();
  assert.deepEqual(storage.mediaSettings(), {
    retentionEnabled: false,
    retentionDays: 30,
  });
  for (const retentionDays of [0, -1, 3651, 1.5, "30", null])
    assert.throws(() =>
      storage.saveMediaSettings({
        retentionEnabled: true,
        retentionDays,
      } as never),
    );
  assert.throws(() =>
    storage.saveMediaSettings({
      retentionEnabled: "false",
      retentionDays: 30,
    } as never),
  );
  assert.deepEqual(
    storage.saveMediaSettings({ retentionEnabled: true, retentionDays: 15 }),
    storage.mediaSettings(),
  );
  storage.saveMediaSettings({ retentionEnabled: false, retentionDays: 15 });
  save("very-old", now - 500 * day);
  assert.equal(storage.runMediaRetention(now), undefined);
  assert.ok(storage.storedMedia("1", "very-old"));
});

test("usage measures chat bytes, base64 campaigns, profiles, and physical database separately", () => {
  reset();
  save("old", now - 31 * day);
  save("recent", now);
  campaign("completed", "completed", now - 31 * day);
  db.prepare("INSERT INTO profile_pictures VALUES(?,?,?,?,?)").run(
    "1",
    chat,
    file.mime,
    Buffer.from("avatar"),
    now,
  );
  const status = storage.mediaStorageStatus();
  assert.deepEqual(
    { ...status.chat },
    { bytes: file.data.length * 2, count: 2 },
  );
  assert.deepEqual(status.campaign, {
    bytes: file.data.toString("base64").length * 2,
    count: 2,
  });
  assert.deepEqual({ ...status.profiles }, { bytes: 6, count: 1 });
  assert.equal(
    status.totalBytes,
    status.chat.bytes + status.campaign.bytes + 6,
  );
  assert.equal(status.totalCount, 5);
  assert.ok(status.databaseBytes > 0);
});

test("cleanup only removes expired copies, keeps boundary, text and results, and skips active campaigns", () => {
  reset();
  save("old", now - 31 * day);
  save("boundary", now - 30 * day);
  save("new", now);
  save("another-user", now - 31 * day, "2");
  for (const status of [
    "running",
    "queued",
    "completed",
    "cancelled",
    "failed",
    "interrupted",
  ])
    campaign(status, status, now - 31 * day);
  campaign("legacy", "completed", now - 31 * day, true);
  campaign("boundary-campaign", "completed", now - 30 * day);
  db.prepare("INSERT INTO profile_pictures VALUES(?,?,?,?,?)").run(
    "1",
    chat,
    file.mime,
    Buffer.from("avatar"),
    now - 31 * day,
  );
  const beforeRaw = JSON.stringify(rawMessage("1", "old"));
  const preview = storage.mediaCleanupPreview(30, now);
  assert.equal(preview.chat.count, 2);
  assert.equal(preview.campaign.count, 9);
  assert.equal(preview.profiles.count, 1);
  assert.ok(storage.storedMedia("1", "old")); // preview does not mutate
  assert.deepEqual(storage.cleanupMedia(30, now), preview);
  assert.equal(storage.storedMedia("1", "old"), undefined);
  assert.equal(storage.storedMedia("2", "another-user"), undefined);
  assert.ok(storage.storedMedia("1", "boundary"));
  assert.ok(storage.storedMedia("1", "new"));
  assert.equal(JSON.stringify(rawMessage("1", "old")), beforeRaw);
  const finished = db
    .prepare("SELECT payload,sent,status FROM campaigns WHERE id='completed'")
    .get() as { payload: string; sent: number; status: string };
  const payload = JSON.parse(finished.payload);
  assert.equal(payload.messages[0].text, "Olá, ${nome}");
  assert.equal(payload.recipients[0].leadId, 1);
  assert.equal(payload.messages[0].attachments[0].data, "");
  assert.equal(payload.messages[0].attachments[0].removed, true);
  assert.equal(payload.messages[0].attachments[0].name, "foto.jpg");
  assert.equal(finished.sent, 1);
  assert.equal(finished.status, "completed");
  for (const id of ["running", "queued", "boundary-campaign"])
    assert.ok(
      JSON.parse(
        (
          db.prepare("SELECT payload FROM campaigns WHERE id=?").get(id) as {
            payload: string;
          }
        ).payload,
      ).messages[0].attachments[0].data,
    );
  assert.equal(storage.cleanupMedia(30, now).totalCount, 0);
});

test("automatic retention respects toggle and does not rearchive deleted or expired media", () => {
  reset();
  save("old", now - 31 * day);
  save("new", now);
  storage.saveMediaSettings({ retentionEnabled: true, retentionDays: 30 });
  assert.equal(storage.runMediaRetention(now)?.chat.count, 1);
  storage.storeMedia("1", "old", file, now - 31 * day, now);
  assert.equal(storage.storedMedia("1", "old"), undefined);
  storage.saveMediaSettings({ retentionEnabled: false, retentionDays: 30 });
  storage.storeMedia("1", "old", file, now - 31 * day, now); // a completed purge stays effective
  assert.equal(storage.storedMedia("1", "old"), undefined);
  assert.ok(storage.storedMedia("1", "new"));
  assert.throws(() => storage.cleanupMedia(0, now));
});

test("cached media works offline, is session isolated, and disappears with local delete or revoke", async () => {
  reset();
  const timestamp = Date.now();
  save("cached", timestamp);
  const cached = await media("1", "cached");
  assert.equal(cached.data, file.data.toString("base64"));
  await assert.rejects(media("2", "cached"), { statusCode: 404 });
  saveMessage("2", message("cached", timestamp));
  await assert.rejects(media("2", "cached"), { statusCode: 409 });
  deleteStoredMessage("1", "cached", chat);
  assert.equal(storage.storedMedia("1", "cached"), undefined);
  save("revoked", timestamp);
  markMessageDeleted("1", "revoked", chat);
  assert.equal(storage.storedMedia("1", "revoked"), undefined);
  await assert.rejects(media("1", "revoked"), { statusCode: 404 });
});

test("successful chat sends retain original bytes without requiring another WhatsApp download", async () => {
  reset();
  const socket = {
    sendMessage: async () => ({
      ...message("sent", Date.now()),
      key: { id: "sent", remoteJid: chat, fromMe: true },
    }),
  } as unknown as WASocket;
  await sendMessage(
    "1",
    {
      chatId: chat,
      attachment: { ...file, data: file.data.toString("base64") },
    },
    () => socket,
  );
  assert.equal((await media("1", "sent")).data, file.data.toString("base64"));
  assert.equal(storage.storedMedia("1", "sent")?.name, file.name);
});

test("cleanup rolls back file removal and campaign changes together on persistence failure", () => {
  reset();
  save("rollback", now - 31 * day);
  campaign("rollback", "completed", now - 31 * day);
  db.exec(
    "CREATE TRIGGER fail_media_cleanup BEFORE UPDATE ON campaigns BEGIN SELECT RAISE(ABORT,'test failure'); END;",
  );
  try {
    assert.throws(() => storage.cleanupMedia(30, now), /test failure/);
  } finally {
    db.exec("DROP TRIGGER fail_media_cleanup");
  }
  assert.ok(storage.storedMedia("1", "rollback"));
  assert.equal(storage.shouldStoreMedia(now - 31 * day, now), true);
  assert.equal(storage.mediaCleanupPreview(30, now).totalCount, 3);
});

test("cache write failure does not turn an already confirmed send into a retry", async () => {
  reset();
  let sends = 0;
  const socket = {
    sendMessage: async () => {
      sends++;
      return { ...message("cache-full", Date.now()), key: { id: "cache-full", remoteJid: chat, fromMe: true } };
    },
  } as unknown as WASocket;
  db.exec("CREATE TRIGGER fail_media_cache BEFORE INSERT ON media_cache BEGIN SELECT RAISE(ABORT,'cache full'); END;");
  try {
    const result = await sendMessage("1", { chatId: chat, attachment: { ...file, data: file.data.toString("base64") } }, () => socket);
    assert.equal(result.sent, true);
  } finally { db.exec("DROP TRIGGER fail_media_cache"); }
  assert.equal(sends, 1);
  assert.ok(rawMessage("1", "cache-full"));
  assert.equal(storage.storedMedia("1", "cache-full"), undefined);
});
