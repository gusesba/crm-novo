import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WASocket } from "@whiskeysockets/baileys";
import { sendSchema } from "../src/messaging/schemas.js";

const directory = mkdtempSync(join(tmpdir(), "via-group-messages-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { sendMessage } = await import("../src/messaging/send.js");
const { listMessages, saveMessage } = await import("../src/storage/messages.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });

test("envia e persiste no grupo selecionado sem converter JID em telefone ou misturar sessões", async () => {
  for (const chatId of ["120363123456789012@g.us", "5511999999999-1234567890@g.us"]) {
    const user = chatId;
    saveMessage(user, { key: { id: "received", remoteJid: chatId, fromMe: false, participant: "5551999999999@s.whatsapp.net" },
      messageTimestamp: 100, message: { conversation: "Pergunta" } });
    let calls = 0;
    const socket = { sendMessage: async (jid, content, options) => {
      assert.equal(jid, chatId);
      assert.equal(options?.quoted?.key.id, "received");
      assert.ok("text" in content);
      calls++;
      return { key: { id: "sent", remoteJid: jid, fromMe: true }, messageTimestamp: 101, message: { conversation: content.text } };
    } } satisfies Pick<WASocket, "sendMessage">;
    const result = await sendMessage(user, sendSchema.parse({ chatId, text: "Resposta", replyTo: "received" }), () => socket);
    assert.equal(result.sent, true);
    assert.equal(calls, 1);
    const messages = listMessages(user, chatId);
    assert.deepEqual(messages.map((message) => message.text), ["Pergunta", "Resposta"]);
    assert.equal(messages[1].chatId, chatId);
    assert.equal(listMessages("other-session", chatId).length, 0);
    assert.equal(listMessages(user, chatId.split("@")[0] + "@s.whatsapp.net").length, 0);
    await assert.rejects(sendMessage("other-session", sendSchema.parse({ chatId, text: "Resposta", replyTo: "received" }), () => socket), /Mensagem de resposta inválida/);
    assert.equal(calls, 1);
  }
});

test("falha remota no grupo mantém o histórico sem registrar envio confirmado", async () => {
  const chatId = "120363999999999999@g.us";
  const socket = { sendMessage: async () => { throw new Error("Envio não permitido no grupo"); } } satisfies Pick<WASocket, "sendMessage">;
  await assert.rejects(sendMessage("failed", sendSchema.parse({ chatId, text: "Olá" }), () => socket), /Envio não permitido/);
  assert.equal(listMessages("failed", chatId).length, 0);
});
