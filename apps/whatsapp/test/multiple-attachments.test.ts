import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AnyMessageContent, WASocket } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-multiple-attachments-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { sendMessage } = await import("../src/messaging/send.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });
const chatId = "5551999999999@s.whatsapp.net";
const file = (name: string, mime: string) => ({ name, mime, data: Buffer.from(name).toString("base64") });
function socket(failAt = -1, afterSend?: () => void) {
  const calls: AnyMessageContent[] = [];
  const fake = { sendMessage: async (jid, content) => {
    calls.push(content);
    if (calls.length === failAt) throw new Error("Falha simulada");
    afterSend?.();
    return { key: { id: `sent-${calls.length}`, remoteJid: jid, fromMe: true }, messageTimestamp: 100 + calls.length, message: { conversation: `Parte ${calls.length}` } };
  } } satisfies Pick<WASocket, "sendMessage">;
  return { calls, fake };
}

test("envia todos os anexos na ordem, grava cada mensagem e usa legenda uma vez", async () => {
  const { calls, fake } = socket();
  const result = await sendMessage("ordered", { chatId, text: "Legenda", attachments: [file("a.png", "image/png"), file("b.pdf", "application/pdf"), file("c.mp3", "audio/mpeg")] }, () => fake);
  assert.equal(result.sent, true);
  assert.equal(calls.length, 3);
  assert.ok("image" in calls[0]);
  assert.equal(calls[0].caption, "Legenda");
  assert.ok("document" in calls[1]);
  assert.equal(calls[1].fileName, "b.pdf");
  assert.equal(calls[1].caption, "");
  assert.ok("audio" in calls[2]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM messages WHERE user_id='ordered'").get()?.count, 3);
});

test("figurinhas e áudios preservam texto como uma única mensagem separada", async () => {
  const { calls, fake } = socket();
  await sendMessage("special", { chatId, text: "Texto", attachments: [file("a.webp", "image/webp"), file("b.mp3", "audio/mpeg")] }, () => fake);
  assert.equal(calls.length, 3);
  assert.ok("sticker" in calls[0]);
  assert.ok("audio" in calls[1]);
  assert.deepEqual(calls[2], { text: "Texto" });
  const document = socket();
  await sendMessage("document", { chatId, text: "Legenda", attachments: [{ ...file("a.mp3", "audio/mpeg"), asDocument: true }] }, () => document.fake);
  assert.equal(document.calls.length, 1);
  assert.equal((document.calls[0] as { caption: string }).caption, "Legenda");
});

test("arquivo inválido no fim impede qualquer envio do lote", async () => {
  const { calls, fake } = socket();
  await assert.rejects(sendMessage("invalid", { chatId, attachments: [file("a.png", "image/png"), { ...file("b.pdf", "application/pdf"), data: "" }] }, () => fake), { statusCode: 400 });
  assert.equal(calls.length, 0);
});

test("falha após o primeiro anexo informa confirmação parcial e não tenta os seguintes", async () => {
  const { calls, fake } = socket(2);
  const result = await sendMessage("partial", { chatId, text: "Legenda", attachments: [file("a.png", "image/png"), file("b.pdf", "application/pdf"), file("c.pdf", "application/pdf")] }, () => fake);
  assert.equal(result.sent, false);
  if (result.sent) assert.fail("Esperado resultado parcial");
  assert.equal(result.sentAttachments, 1);
  assert.equal(result.textSent, true);
  assert.equal(calls.length, 2);
  assert.match(result.error, /1 de 3 anexos confirmados/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM messages WHERE user_id='partial'").get()?.count, 1);
});

test("falha antes da primeira confirmação propaga erro; cancelamento interrompe os anexos restantes", async () => {
  const files = [file("a.pdf", "application/pdf"), file("b.pdf", "application/pdf")];
  const failure = socket(1);
  await assert.rejects(sendMessage("first-failure", { chatId, attachments: files }, () => failure.fake), /Falha simulada/);
  const controller = new AbortController();
  const aborted = socket(-1, () => controller.abort());
  const result = await sendMessage("cancelled", { chatId, attachments: files }, () => aborted.fake, controller.signal);
  assert.equal(result.sent, false);
  assert.equal(aborted.calls.length, 1);
});

test("falha ao enviar texto após anexos conserva a confirmação de todos os arquivos", async () => {
  const { fake } = socket(3);
  const result = await sendMessage("text-failure", { chatId, text: "Texto", attachments: [file("a.webp", "image/webp"), file("b.webp", "image/webp")] }, () => fake);
  assert.equal(result.sent, false);
  if (result.sent) assert.fail("Esperado resultado parcial");
  assert.equal(result.sentAttachments, 2);
  assert.equal(result.textSent, false);
});
