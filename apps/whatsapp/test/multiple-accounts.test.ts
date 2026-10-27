import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { ZodError } from "zod";
import { sessionIdSchema, sessionOwner } from "../src/sessions/session-id.js";

const directory = mkdtempSync(join(tmpdir(), "via-multiple-accounts-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { registerRoutes } = await import("../src/routes.js");
const { saveMessage } = await import("../src/storage/messages.js");
const { sqliteAuth } = await import("../src/storage/auth.js");
const { disconnect } = await import("../src/sessions/manager.js");
const { bindSessionNumber, backupMessages } = await import("../src/storage/backups.js");
const app = Fastify();
app.setErrorHandler((error, _req, reply) => {
  const cause = error as Error & { statusCode?: number };
  return reply.code(error instanceof ZodError ? 400 : cause.statusCode || 502).send({ message: cause.message });
});
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

test("remover uma conta cancela somente seus disparos e preserva os históricos e o backup textual", async () => {
  bindSessionNumber(extra, "5551888888888@s.whatsapp.net", true);
  saveMessage(extra, { key: { id: "backup-kept", remoteJid: chatId, fromMe: false }, message: { conversation: "Preservada" }, messageTimestamp: 200 });
  for (const user of [primary, extra, other]) {
    sqliteAuth(user).saveCreds();
    db.prepare("INSERT INTO campaigns(id,user_id,payload,status,created_at) VALUES(?,?,?,'running',?)")
      .run(`remove-${user}`, user, "{}", Date.now());
  }
  const response = await app.inject({ method: "DELETE", url: `/sessions/${extra}` });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "disconnected");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth WHERE user_id=?").get(extra)?.count, 0);
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id=?").get(`remove-${extra}`)?.status, "cancelled");
  for (const user of [primary, other]) {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth WHERE user_id=?").get(user)?.count, 1);
    assert.equal(db.prepare("SELECT status FROM campaigns WHERE id=?").get(`remove-${user}`)?.status, "running");
  }
  const messages = await app.inject(`/sessions/${extra}/messages?chatId=${encodeURIComponent(chatId)}`);
  assert.ok(messages.json().some((message: { text: string }) => message.text === "Preservada"));
  assert.ok(backupMessages("2", "5551888888888", chatId).some((message) => message.text === "Preservada"));
  assert.equal((await app.inject({ method: "DELETE", url: `/sessions/${extra}` })).statusCode, 200);
});

test("remoção rejeita a Principal e identificadores inválidos sem apagar credenciais", async () => {
  sqliteAuth(primary).saveCreds();
  assert.equal((await app.inject({ method: "DELETE", url: `/sessions/${primary}` })).statusCode, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth WHERE user_id=?").get(primary)?.count, 1);
  assert.equal((await app.inject({ method: "DELETE", url: "/sessions/2_invalid" })).statusCode, 400);
});
