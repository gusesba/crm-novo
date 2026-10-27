import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { sessionIdSchema, sessionOwner } from "../src/sessions/session-id.js";

const directory = mkdtempSync(join(tmpdir(), "via-multiple-accounts-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { registerRoutes } = await import("../src/routes.js");
const { saveMessage } = await import("../src/storage/messages.js");
const { sqliteAuth } = await import("../src/storage/auth.js");
const { disconnect } = await import("../src/sessions/manager.js");
const app = Fastify();
await registerRoutes(app);
const primary = "2";
const extra = "2_" + "a".repeat(32);
const other = "3_" + "b".repeat(32);
const chatId = "5551999999999@s.whatsapp.net";
after(async () => {
  await app.close();
  db.close();
  rmSync(directory, { recursive: true });
});

test("identificadores preservam sessões legadas e extraem o dono para elegibilidade dos disparos", () => {
  assert.equal(sessionOwner(primary), "2");
  assert.equal(sessionOwner(extra), "2");
  assert.equal(sessionOwner(other), "3");
  for (const value of ["2_x", "2/3", "../2", "2_" + "a".repeat(31), "2_" + "a".repeat(33), "2_" + "A".repeat(32)])
    assert.equal(sessionIdSchema.safeParse(value).success, false);
});

test("rotas e armazenamento isolam a mesma conversa/mensagem por conta", async () => {
  for (const [user, text] of [[primary, "Principal"], [extra, "Comercial"], [other, "Outro usuário"]]) {
    saveMessage(user, { key: { id: "same-message", remoteJid: chatId, fromMe: false }, message: { conversation: text }, messageTimestamp: 100 });
    const status = await app.inject(`/sessions/${user}/status`);
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().status, "disconnected");
    const chats = await app.inject(`/sessions/${user}/chats`);
    assert.equal(chats.statusCode, 200);
    assert.equal(chats.json()[0].lastText, text);
    const messages = await app.inject(`/sessions/${user}/messages?chatId=${encodeURIComponent(chatId)}`);
    assert.equal(messages.statusCode, 200);
    assert.equal(messages.json().length, 1);
    assert.equal(messages.json()[0].text, text);
  }
});

test("desconectar uma conta remove somente suas credenciais e mantém os históricos", async () => {
  for (const user of [primary, extra, other]) sqliteAuth(user).saveCreds();
  await disconnect(extra);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth WHERE user_id=?").get(extra)?.count, 0);
  for (const user of [primary, other])
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth WHERE user_id=?").get(user)?.count, 1);
  for (const user of [primary, extra, other]) {
    const messages = await app.inject(`/sessions/${user}/messages?chatId=${encodeURIComponent(chatId)}`);
    assert.equal(messages.json().length, 1);
  }
});
