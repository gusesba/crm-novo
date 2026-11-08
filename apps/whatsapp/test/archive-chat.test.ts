import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proto } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-archive-test-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage } = await import("../src/storage/messages.js");
const { saveChatState } = await import("../src/storage/chat-states.js");
const { archiveChat } = await import("../src/messaging/archive-chat.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });

const chat = "5551999999999@s.whatsapp.net";

test("arquivar e desarquivar restaura timestamp Long salvo no banco e preserva não lidas/fixação", async () => {
  const timestamp = 1794107859;
  const user = "archive-persisted-long";
  saveMessage(user, proto.WebMessageInfo.fromObject({
    key: { id: "long", remoteJid: chat, fromMe: false },
    messageTimestamp: { low: timestamp, high: 0, unsigned: true },
    message: { conversation: "Olá" },
  }));
  saveChatState(user, { id: chat, unreadCount: 3, pinned: 100 });
  for (const archived of [true, false]) {
    let calls = 0;
    const result = await archiveChat(user, chat, archived, () => ({
      chatModify: async (patch, jid) => {
        calls++;
        assert.equal(jid, chat);
        assert.ok("archive" in patch);
        if ("archive" in patch) {
          assert.equal(patch.archive, archived);
          assert.ok(Array.isArray(patch.lastMessages));
          if (Array.isArray(patch.lastMessages)) {
            assert.equal(patch.lastMessages[0].key.id, "long");
            assert.equal(Number(patch.lastMessages[0].messageTimestamp), timestamp);
          }
        }
      },
    }));
    assert.equal(calls, 1);
    assert.deepEqual(result, { chatId: chat, archived });
    const state = db.prepare("SELECT archived,pinned_at,unread_count FROM chat_states WHERE user_id=? AND id=?").get(user, chat);
    assert.deepEqual({ ...state }, { archived: Number(archived), pinned_at: 100, unread_count: 3 });
  }
});

test("arquivamento sem timestamp continua rejeitado antes de chamar WhatsApp", async () => {
  const user = "archive-missing-timestamp";
  saveMessage(user, { key: { id: "missing", remoteJid: chat }, message: { conversation: "Olá" } });
  await assert.rejects(archiveChat(user, chat, true, () => { throw new Error("Não deve chamar socket"); }), { statusCode: 409 });
  assert.equal(db.prepare("SELECT 1 FROM chat_states WHERE user_id=? AND id=?").get(user, chat), undefined);
});
