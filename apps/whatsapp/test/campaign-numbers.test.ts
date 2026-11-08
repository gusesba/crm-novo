import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";

const directory = mkdtempSync(join(tmpdir(), "via-campaign-numbers-"));
process.env.DATA_DIR = directory;
// Simula o schema anterior à associação de campanhas a números.
const previous = new DatabaseSync(join(directory, "whatsapp.db"));
previous.exec(`CREATE TABLE campaigns (id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,status TEXT,
  sent INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,skipped INTEGER DEFAULT 0,error TEXT,created_at INTEGER)`);
previous.prepare("INSERT INTO campaigns(id,user_id,payload,status,created_at) VALUES('before-upgrade','10','{}','running',1)").run();
previous.close();
const { db } = await import("../src/storage/database.js");
const { initializeCampaignNumbers } = await import("../src/storage/campaign-numbers.js");
const { bindSessionNumber } = await import("../src/storage/backups.js");
const { saveMessage } = await import("../src/storage/messages.js");
const { campaigns, cancelSessionCampaigns } = await import("../src/campaigns/worker.js");
const { disconnect } = await import("../src/sessions/manager.js");
const { registerRoutes } = await import("../src/routes.js");
const app = Fastify();
await registerRoutes(app);
after(async () => { await app.close(); db.close(); rmSync(directory, { recursive: true }); });

const a = "5551999990001";
const b = "5551999990002";
const primary = "10";
const extra = "10_" + "a".repeat(32);
const other = "11";
const recipient = "5551999998888";
const chatId = recipient + "@s.whatsapp.net";
const messages = [{ text: "Olá, ${PrimeiroNome}!" }];
function insert(id: string, session: string, phone: string | null, createdAt: number, status = "completed") {
  db.prepare("INSERT INTO campaigns(id,user_id,owner_id,sender_phone,payload,status,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, session, session.split("_")[0], phone, JSON.stringify({ name: id, messages, recipients: [{ leadId: 1, name: "Cliente", phone: recipient }] }), status, createdAt);
}
function delivery(id: string, messageId: string, position = 0, status = "sent") {
  db.prepare("INSERT INTO campaign_deliveries(campaign_id,position,lead_id,name,phone,status,external_message_id) VALUES(?,?,?,?,?,?,?)")
    .run(id, position, position + 1, "Cliente", recipient, status, messageId);
}

test("atualização preserva campanhas existentes e não atribui o número atual a registros sem origem comprovada", () => {
  bindSessionNumber(primary, a + "@s.whatsapp.net");
  initializeCampaignNumbers();
  initializeCampaignNumbers();
  const row = db.prepare("SELECT owner_id,sender_phone,status FROM campaigns WHERE id='before-upgrade'").get();
  assert.equal(row?.owner_id, "10");
  assert.equal(row?.sender_phone, null);
  assert.equal(row?.status, "interrupted");
  assert.ok(campaigns(primary, 1, 50).items.some((item) => item.id === "before-upgrade"));
});

test("mesmo número reúne guias do mesmo dono, com paginação antes da resposta e isolamento entre usuários", async () => {
  bindSessionNumber(extra, a + "@s.whatsapp.net");
  bindSessionNumber(other, a + "@s.whatsapp.net");
  insert("primary-a", primary, a, 100);
  insert("extra-a", extra, a, 200);
  insert("primary-b", primary, b, 300);
  insert("other-a", other, a, 400);
  const first = (await app.inject(`/sessions/${extra}/campaigns?page=1&pageSize=1`)).json();
  assert.equal(first.phone, a);
  assert.equal(first.total, 2);
  assert.equal(first.items[0].id, "extra-a");
  assert.equal(first.items[0].senderPhone, a);
  const second = (await app.inject(`/sessions/${extra}/campaigns?page=2&pageSize=1`)).json();
  assert.equal(second.items[0].id, "primary-a");
  assert.deepEqual(campaigns(other, 1, 50).items.map((item) => item.id), ["other-a"]);
});

test("troca de número filtra lista, mensagens, resultados e cancelamento; o histórico acompanha outra guia", async () => {
  delivery("primary-a", "sent-a");
  delivery("primary-a", "failed-a", 1, "failed");
  bindSessionNumber(primary, b + "@s.whatsapp.net");
  assert.deepEqual(campaigns(primary, 1, 50).items.map((item) => item.id), ["primary-b", "before-upgrade"]);
  for (const suffix of ["messages", "deliveries"]) {
    assert.equal((await app.inject(`/sessions/${primary}/campaigns/primary-a/${suffix}`)).statusCode, 404);
    assert.equal((await app.inject(`/sessions/${other}/campaigns/primary-a/${suffix}`)).statusCode, 404);
    assert.equal((await app.inject(`/sessions/${extra}/campaigns/primary-a/${suffix}`)).statusCode, 200);
  }
  assert.deepEqual((await app.inject(`/sessions/${extra}/campaigns/primary-a/messages`)).json(), messages);
  const results = (await app.inject(`/sessions/${extra}/campaigns/primary-a/deliveries?status=failed&pageSize=1`)).json();
  assert.equal(results.total, 1);
  assert.equal(results.items[0].status, "failed");
  insert("running-a", primary, a, 500, "running");
  assert.equal((await app.inject({ method: "POST", url: `/sessions/${primary}/campaigns/running-a/cancel` })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/sessions/${other}/campaigns/running-a/cancel` })).statusCode, 404);
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id='running-a'").get()?.status, "running");
  assert.equal((await app.inject({ method: "POST", url: `/sessions/${extra}/campaigns/running-a/cancel` })).statusCode, 200);
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id='running-a'").get()?.status, "cancelled");
  await disconnect(extra);
  assert.ok(campaigns(extra, 1, 50).items.some((item) => item.id === "primary-a"));
});

test("cancelamento automático continua restrito à sessão de execução, inclusive após troca de número", () => {
  insert("cancel-session", primary, a, 600, "running");
  insert("keep-session", extra, a, 601, "running");
  cancelSessionCampaigns(primary);
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id='cancel-session'").get()?.status, "cancelled");
  assert.equal(db.prepare("SELECT status FROM campaigns WHERE id='keep-session'").get()?.status, "running");
});

test("migração recupera origem pelas mensagens confirmadas sem mover históricos para o novo número", () => {
  insert("legacy-proven", primary, null, 700);
  delivery("legacy-proven", "proven-id");
  saveMessage(extra, { key: { id: "proven-id", remoteJid: chatId, fromMe: true }, messageTimestamp: 100, message: { conversation: "Enviada por A" } });
  initializeCampaignNumbers();
  initializeCampaignNumbers();
  assert.equal(db.prepare("SELECT sender_phone FROM campaigns WHERE id='legacy-proven'").get()?.sender_phone, a);
  assert.ok(campaigns(extra, 1, 50).items.some((item) => item.id === "legacy-proven"));
  assert.ok(!campaigns(primary, 1, 50).items.some((item) => item.id === "legacy-proven"));
  bindSessionNumber(primary, a + "@s.whatsapp.net");
  assert.ok(campaigns(primary, 1, 50).items.some((item) => item.id === "legacy-proven"));
});

test("migração mantém origem desconhecida em evidência ambígua, recebida ou pertencente a outro usuário", async () => {
  insert("legacy-ambiguous", primary, null, 800);
  delivery("legacy-ambiguous", "shared-id");
  for (const phone of [a, b]) {
    bindSessionNumber(primary, phone + "@s.whatsapp.net");
    saveMessage(primary, { key: { id: "shared-id", remoteJid: chatId, fromMe: true }, messageTimestamp: 100, message: { conversation: "Origem ambígua" } });
  }
  insert("legacy-foreign", primary, null, 801);
  delivery("legacy-foreign", "foreign-id");
  saveMessage(other, { key: { id: "foreign-id", remoteJid: chatId, fromMe: true }, messageTimestamp: 100, message: { conversation: "Outro dono" } });
  insert("legacy-incoming", primary, null, 802);
  delivery("legacy-incoming", "incoming-id");
  saveMessage(primary, { key: { id: "incoming-id", remoteJid: chatId, fromMe: false }, messageTimestamp: 100, message: { conversation: "Recebida" } });
  initializeCampaignNumbers();
  for (const id of ["legacy-ambiguous", "legacy-foreign", "legacy-incoming"]) {
    assert.equal(db.prepare("SELECT sender_phone FROM campaigns WHERE id=?").get(id)?.sender_phone, null);
    assert.equal((await app.inject(`/sessions/${extra}/campaigns/${id}/messages`)).statusCode, 404);
    assert.equal((await app.inject(`/sessions/${primary}/campaigns/${id}/messages`)).statusCode, 200);
  }
  assert.equal(db.prepare("SELECT sender_phone FROM campaigns WHERE id='before-upgrade'").get()?.sender_phone, null);
});

test("falha de migração reverte a atribuição do número sem alterar resultados", () => {
  insert("legacy-rollback", extra, null, 900);
  delivery("legacy-rollback", "proven-id");
  db.exec("CREATE TEMP TRIGGER fail_campaign_number BEFORE UPDATE OF sender_phone ON campaigns WHEN NEW.id='legacy-rollback' BEGIN SELECT RAISE(ABORT,'migration failure'); END");
  assert.throws(initializeCampaignNumbers, /migration failure/);
  assert.equal(db.prepare("SELECT sender_phone,status FROM campaigns WHERE id='legacy-rollback'").get()?.sender_phone, null);
  assert.equal(db.prepare("SELECT status FROM campaign_deliveries WHERE campaign_id='legacy-rollback'").get()?.status, "sent");
  db.exec("DROP TRIGGER fail_campaign_number");
  initializeCampaignNumbers();
  assert.equal(db.prepare("SELECT sender_phone FROM campaigns WHERE id='legacy-rollback'").get()?.sender_phone, a);
});
