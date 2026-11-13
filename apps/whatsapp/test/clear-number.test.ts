import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { ZodError } from "zod";

const directory = mkdtempSync(join(tmpdir(), "via-clear-number-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { bindSessionNumber, backupNumbers, backupMessages, initializeBackups, sessionNumber } = await import("../src/storage/backups.js");
const { clearNumber, disconnect } = await import("../src/sessions/manager.js");
const { saveMessage, listMessages } = await import("../src/storage/messages.js");
const { sqliteAuth } = await import("../src/storage/auth.js");
const { saveWhatsAppContact } = await import("../src/messaging/contacts.js");
const { sendMessage } = await import("../src/messaging/send.js");
const { syncGroupNames } = await import("../src/storage/contacts.js");
const { registerRoutes } = await import("../src/routes.js");
const app = Fastify();
app.setErrorHandler((error, _req, reply) => {
  const cause = error as Error & { statusCode?: number };
  return reply.code(error instanceof ZodError ? 400 : cause.statusCode || 502).send({ message: cause.message });
});
await registerRoutes(app);
after(async () => { await app.close(); db.close(); rmSync(directory, { recursive: true }); });
const a = "5551999990001";
const b = "5551999990002";
const chat = "5551999998888@s.whatsapp.net";
const message = { key: { id: "same", remoteJid: chat, fromMe: false }, message: { conversation: "Preservar até confirmar" }, messageTimestamp: 100 };
function seed(session: string, number = a) {
  bindSessionNumber(session, `${number}@s.whatsapp.net`);
  saveMessage(session, message);
}
const sessionTables = ["messages", "chats", "chat_aliases", "contacts", "contact_names", "chat_states", "message_reactions", "profile_pictures", "media_cache", "pending_message_edits", "service_state", "auth"];

test("limpeza HTTP elimina todas as sessões do número/dono, caches e backup sem afetar outros números, donos ou resultados", async () => {
  const extra = "40_" + "a".repeat(32);
  const other = "40_" + "b".repeat(32);
  for (const session of ["40", extra, "41"]) seed(session);
  seed(other, b);
  for (const session of ["40", extra, other, "41"])
    db.prepare("INSERT INTO chat_aliases VALUES(?,?,?)").run(session, "123456789@lid", chat);
  for (const [owner, number] of [["40", a], ["40", b], ["41", a]])
    db.prepare("INSERT INTO backup_chat_aliases VALUES(?,?,?,?)").run(owner, number, "123456789@lid", chat);
  db.prepare("INSERT INTO contacts VALUES(?,?,?,?)").run(extra, chat, "Contato", 4);
  db.prepare("INSERT INTO contact_names VALUES(?,?,?,?,?)").run(extra, chat, "Contato", "", "Contato");
  db.prepare("INSERT INTO message_reactions VALUES(?,?,?,?)").run(extra, "same", "me", "👍");
  db.prepare("INSERT INTO profile_pictures VALUES(?,?,?,?,?)").run(extra, chat, "image/jpeg", Buffer.from("foto"), 100);
  db.prepare("INSERT INTO media_cache VALUES(?,?,?,?,?,?)").run(extra, "same", "image/jpeg", "foto", Buffer.from("bytes"), 100);
  db.prepare("INSERT INTO pending_message_edits VALUES(?,?,?,?,?,?)").run(extra, "edit", chat, "same", 100, "{}");
  db.prepare("INSERT INTO campaigns(id,user_id,owner_id,sender_phone,status,payload) VALUES('campaign',?,'40',?,'running','{}')").run(extra, a);
  const response = await app.inject({ method: "DELETE", url: `/backups/40/${a}` });
  assert.equal(response.statusCode, 200);
  for (const session of ["40", extra]) {
    for (const table of sessionTables) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(session)?.n, 0, table);
    assert.equal(sessionNumber(session), undefined);
  }
  assert.deepEqual(backupNumbers("40").map((row) => row.id), [b]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM backup_chat_aliases WHERE owner_id='40' AND number=?").get(a)?.count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM backup_chat_aliases").get()?.count, 2);
  assert.throws(() => backupMessages("40", a, chat), { statusCode: 404 });
  assert.equal(listMessages(other, chat).length, 1);
  assert.equal(backupMessages("41", a, chat).length, 1);
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id='campaign'").get()?.status, "cancelled");
  initializeBackups();
  assert.throws(() => backupMessages("40", a, chat), { statusCode: 404 });
  assert.equal((await app.inject({ method: "DELETE", url: `/backups/40/${a}` })).statusCode, 404);
});

test("credenciais de qualquer sessão do número bloqueiam limpeza até desconexão explícita", async () => {
  const extra = "42_" + "c".repeat(32);
  seed("42");
  seed(extra);
  sqliteAuth(extra).saveCreds();
  const before = (await app.inject(`/sessions/${extra}/status`)).json();
  assert.equal(before.historyNumber, a);
  assert.equal(before.canDisconnect, true);
  assert.equal(before.canClearHistory, false);
  assert.equal((await app.inject("/backups/42/numbers")).json()[0].canClear, false);
  const response = await app.inject({ method: "DELETE", url: `/backups/42/${a}` });
  assert.equal(response.statusCode, 409);
  assert.match(response.json().message, /Desconecte todas/);
  assert.equal(backupMessages("42", a, chat).length, 1);
  assert.equal(listMessages("42", chat).length, 1);
  await disconnect(extra);
  const after = (await app.inject(`/sessions/${extra}/status`)).json();
  assert.equal(after.canDisconnect, false);
  assert.equal(after.canClearHistory, true);
  assert.equal((await app.inject("/backups/42/numbers")).json()[0].canClear, true);
  assert.equal((await app.inject({ method: "DELETE", url: `/backups/42/${a}` })).statusCode, 200);
});

test("falha durante exclusão reverte mensagens, caches, associação e backup na mesma transação", () => {
  seed("43");
  db.exec("CREATE TEMP TRIGGER fail_clear BEFORE DELETE ON backup_numbers WHEN OLD.owner_id='43' BEGIN SELECT RAISE(ABORT,'test failure'); END");
  assert.throws(() => clearNumber("43", a), /test failure/);
  assert.equal(sessionNumber("43"), a);
  assert.equal(listMessages("43", chat).length, 1);
  assert.equal(backupMessages("43", a, chat).length, 1);
  db.exec("DROP TRIGGER fail_clear");
});

test("confirmações tardias de envio, contato e grupos não recriam dados apagados", async () => {
  seed("44");
  const sending = sendMessage("44", { chatId: chat, text: "Enviando" }, () => ({ sendMessage: async () => {
    clearNumber("44", a);
    return message;
  } }));
  await sending;
  assert.equal(listMessages("44", chat).length, 0);
  assert.equal(backupNumbers("44").length, 0);
  seed("45");
  await assert.rejects(saveWhatsAppContact("45", { chatId: chat, firstName: "Contato" }, () => ({ addOrEditContact: async () => {
    clearNumber("45", a);
  } })), { statusCode: 409 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE user_id='45'").get()?.n, 0);
  seed("46");
  await syncGroupNames("46", { groupFetchAllParticipating: async () => {
    clearNumber("46", a);
    return { group: { id: "1@g.us", subject: "Grupo atrasado" } };
  } } as Parameters<typeof syncGroupNames>[1]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE user_id='46'").get()?.n, 0);
});

test("histórico legado pode ser limpo antes ou depois de trocar de número sem apagar a nova conta", () => {
  saveMessage("47", message);
  initializeBackups();
  clearNumber("47", "legacy_47");
  initializeBackups();
  assert.equal(listMessages("47", chat).length, 0);
  assert.equal(backupNumbers("47").length, 0);
  saveMessage("48", message);
  initializeBackups();
  seed("48", b);
  sqliteAuth("48").saveCreds();
  clearNumber("48", "legacy_48");
  assert.equal(sessionNumber("48"), b);
  assert.equal(listMessages("48", chat).length, 1);
  assert.equal(backupMessages("48", b, chat).length, 1);
});

test("chaves e credenciais de um socket parado não voltam a ser persistidas", async () => {
  let current = true;
  const auth = sqliteAuth("49", () => current);
  auth.saveCreds();
  current = false;
  await disconnect("49");
  await auth.state.keys.set({ "app-state-sync-version": { regular_low: { version: 1 } } });
  auth.saveCreds();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auth WHERE user_id='49'").get()?.n, 0);
});

test("validação e dono do backup impedem exclusão de número ausente ou alheio", async () => {
  seed("50");
  assert.equal((await app.inject({ method: "DELETE", url: `/backups/51/${a}` })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: "/backups/50/123" })).statusCode, 400);
  assert.equal(backupMessages("50", a, chat).length, 1);
});
