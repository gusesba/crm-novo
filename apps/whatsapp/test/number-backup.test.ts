import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage } from "@whiskeysockets/baileys";
import Fastify from "fastify";

const directory = mkdtempSync(join(tmpdir(), "via-number-backup-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage, listMessages, markMessageDeleted, deleteStoredMessage, saveMessageReaction } = await import("../src/storage/messages.js");
const { saveContact } = await import("../src/storage/contacts.js");
const { bindSessionNumber, backupNumbers, backupMessages, backupChats, initializeBackups, sessionNumber } = await import("../src/storage/backups.js");
const { disconnect } = await import("../src/sessions/manager.js");
const { sendMessage } = await import("../src/messaging/send.js");
const { registerRoutes } = await import("../src/routes.js");
const app = Fastify();
await registerRoutes(app);
after(async () => { await app.close(); db.close(); rmSync(directory, { recursive: true }); });
const a = "5551999990001";
const b = "5551999990002";
const chat = "5551999998888@s.whatsapp.net";
function message(id: string, text: string, timestamp = 100): WAMessage {
  return { key: { id, remoteJid: chat, fromMe: false }, message: { conversation: text }, messageTimestamp: timestamp };
}

test("mesmo número em várias sessões compartilha um backup sem duplicar mensagens; outros usuários ficam isolados", () => {
  const extra = "20_" + "a".repeat(32);
  bindSessionNumber("20", a + "@s.whatsapp.net");
  bindSessionNumber(extra, a + ":4@s.whatsapp.net");
  saveMessage("20", message("same", "Primeira conta"));
  saveMessage(extra, message("same", "Primeira conta"));
  saveMessage(extra, message("second", "Segunda sessão", 101));
  assert.equal(backupNumbers("20").length, 1);
  assert.equal(backupMessages("20", a, chat).length, 2);
  bindSessionNumber("21", a + "@s.whatsapp.net");
  saveMessage("21", message("same", "Outro dono"));
  assert.equal(backupMessages("21", a, chat)[0].text, "Outro dono");
  assert.equal(backupMessages("20", a, chat)[0].text, "Primeira conta");
});

test("trocar o número na mesma sessão arquiva textos antes de limpar o atendimento e preserva ambos os números após desconectar", async () => {
  bindSessionNumber("22", a + "@s.whatsapp.net");
  saveMessage("22", message("same", "Número antigo"));
  saveContact("22", { id: chat, name: "Contato antigo" });
  db.prepare("INSERT INTO media_cache VALUES(?,?,?,?,?,?)").run("22", "same", "image/jpeg", "foto", Buffer.from("bytes"), 100);
  bindSessionNumber("22", b + "@s.whatsapp.net");
  assert.equal(listMessages("22", chat).length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM media_cache WHERE user_id='22'").get()?.n, 0);
  assert.equal(backupMessages("22", a, chat)[0].text, "Número antigo");
  saveMessage("22", message("same", "Número novo"));
  assert.equal(backupMessages("22", b, chat)[0].text, "Número novo");
  await disconnect("22");
  assert.equal(backupNumbers("22").length, 2);
  assert.equal(backupMessages("22", a, chat)[0].text, "Número antigo");
  assert.equal((backupChats("22", a)[0] as { name: string }).name, "Contato antigo");
});

test("backup guarda legenda/tipo e citação textual, sem raw, mídia, miniatura, chave ou URL", () => {
  bindSessionNumber("23", a + "@s.whatsapp.net");
  saveMessage("23", {
    key: { id: "image", remoteJid: chat, fromMe: false }, messageTimestamp: 100,
    message: { imageMessage: { caption: "Legenda preservada", mimetype: "image/jpeg", url: "https://media.example/file", mediaKey: Buffer.from("secret-key"), jpegThumbnail: Buffer.from("thumbnail") } },
  });
  saveMessage("23", {
    key: { id: "reply", remoteJid: chat, fromMe: true }, messageTimestamp: 101,
    message: { extendedTextMessage: { text: "Resposta", contextInfo: { stanzaId: "image", participant: chat,
      quotedMessage: { imageMessage: { caption: "Legenda citada", jpegThumbnail: Buffer.from("thumbnail"), mediaKey: Buffer.from("secret-key") } } } } },
  });
  const messages = backupMessages("23", a, chat);
  assert.equal(messages[0].text, "Legenda preservada");
  assert.equal(messages[0].mediaLabel, "Foto");
  assert.equal(messages[1].reply.text, "Legenda citada");
  assert.equal(messages[0].attachment, undefined);
  assert.equal(messages[1].reply.thumbnail, undefined);
  const stored = db.prepare("SELECT payload FROM backup_messages WHERE owner_id='23'").all();
  assert.doesNotMatch(JSON.stringify(stored), /thumbnail|mediaKey|media\.example|secret-key|\"raw\"|base64/);
});

test("migração usa a identidade existente, é repetível e preserva histórico sem identidade em aba anterior", () => {
  saveMessage("24", message("old", "Legado com número"));
  db.prepare("INSERT INTO auth VALUES(?,'creds',?)").run("24", JSON.stringify({ me: { id: a + ":5@s.whatsapp.net" } }));
  saveMessage("25", message("unknown", "Legado sem credenciais"));
  initializeBackups();
  initializeBackups();
  assert.equal(backupNumbers("24").length, 1);
  assert.equal(backupMessages("24", a, chat).length, 1);
  assert.equal(listMessages("24", chat)[0].text, "Legado com número");
  assert.equal((backupNumbers("25")[0] as { phone: string | null }).phone, null);
  bindSessionNumber("25", b + "@s.whatsapp.net");
  assert.equal(backupMessages("25", "legacy_25", chat)[0].text, "Legado sem credenciais");
  assert.equal(backupMessages("25", b, chat).length, 0);
});

test("falha na migração de uma troca de número reverte a limpeza e a associação", () => {
  bindSessionNumber("26", a + "@s.whatsapp.net");
  saveMessage("26", message("rollback", "Não perder"));
  db.exec("CREATE TEMP TRIGGER fail_backup BEFORE UPDATE ON backup_messages WHEN NEW.owner_id='26' BEGIN SELECT RAISE(ABORT,'test failure'); END");
  assert.throws(() => bindSessionNumber("26", b + "@s.whatsapp.net"), /test failure/);
  assert.equal(sessionNumber("26"), a);
  assert.equal(listMessages("26", chat)[0].text, "Não perder");
  db.exec("DROP TRIGGER fail_backup");
});

test("paginação usa timestamp e ID sem perder empates, sem limite de 500 conversas e endpoints não usam socket", async () => {
  bindSessionNumber("27", a + "@s.whatsapp.net");
  for (let index = 0; index < 105; index++) saveMessage("27", message(String(index).padStart(3, "0"), "Texto", 100));
  const first = backupMessages("27", a, chat);
  const second = backupMessages("27", a, chat, first[0].timestamp, first[0].id);
  assert.equal(first.length, 100);
  assert.equal(second.length, 5);
  assert.equal(new Set([...first, ...second].map((item) => item.id)).size, 105);
  for (let index = 0; index < 501; index++) saveMessage("27", { ...message("chat-" + index, "Texto"), key: { id: "chat-" + index, remoteJid: index + "@g.us", fromMe: false } });
  assert.equal(backupChats("27", a).length, 502);
  const numbers = await app.inject("/backups/27/numbers");
  assert.equal(numbers.statusCode, 200);
  const messages = await app.inject(`/backups/27/${a}/messages?chatId=${encodeURIComponent(chat)}`);
  assert.equal(messages.statusCode, 200);
  assert.equal(messages.json().length, 100);
  assert.throws(() => backupChats("28", a), { statusCode: 404 });
});

test("edição, reação e revogação acompanham mensagens; excluir localmente mantém a regra de excluir a cópia consultável", () => {
  bindSessionNumber("29", a + "@s.whatsapp.net");
  saveMessage("29", message("edit", "Original"));
  saveMessage("29", { ...message("edit", "Editada"), crmMetadata: { edited: true, editedAt: 200 } } as WAMessage);
  saveMessageReaction("29", "edit", "me", "👍");
  const stored = backupMessages("29", a, chat)[0];
  assert.equal(stored.text, "Editada");
  assert.equal(stored.edited, true);
  assert.deepEqual(stored.reactions, [{ emoji: "👍", mine: true }]);
  const extra = "29_" + "b".repeat(32);
  bindSessionNumber(extra, a + "@s.whatsapp.net");
  saveMessage(extra, message("edit", "Snapshot anterior"));
  assert.equal(backupMessages("29", a, chat)[0].text, "Editada");
  markMessageDeleted("29", "edit", chat);
  assert.equal(backupMessages("29", a, chat)[0].kind, "deleted");
  deleteStoredMessage("29", "edit", chat);
  assert.equal(backupMessages("29", a, chat).length, 0);
});

test("confirmação de envio após troca de número vai somente ao backup original e interrompe anexos restantes", async () => {
  bindSessionNumber("30", a + "@s.whatsapp.net");
  let calls = 0;
  const result = await sendMessage("30", { chatId: chat, attachments: [
    { name: "a.pdf", mime: "application/pdf", data: "YWJj" },
    { name: "b.pdf", mime: "application/pdf", data: "YWJj" },
  ] }, () => ({ sendMessage: async () => {
    calls++;
    bindSessionNumber("30", b + "@s.whatsapp.net");
    return { key: { id: "pending", remoteJid: chat, fromMe: true }, messageTimestamp: 100,
      message: { documentMessage: { fileName: "a.pdf", mimetype: "application/pdf" } } };
  } }));
  assert.equal(result.sent, false);
  assert.equal(calls, 1);
  assert.equal(listMessages("30", chat).length, 0);
  assert.equal(backupMessages("30", a, chat)[0].text, "a.pdf");
  assert.equal(backupMessages("30", b, chat).length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM media_cache WHERE user_id='30'").get()?.n, 0);
});
