import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WASocket } from "@whiskeysockets/baileys";
import { sendSchema } from "../src/messaging/schemas.js";

const directory = mkdtempSync(join(tmpdir(), "via-individual-send-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { sendMessage } = await import("../src/messaging/send.js");
const { listMessages } = await import("../src/storage/messages.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });

test("cartão da agenda é enviado à conversa de onze dígitos sem acrescentar DDI", async () => {
  const chatId = "12166321952@s.whatsapp.net";
  const input = sendSchema.parse({
    chatId, text: "", attachments: [],
    contact: { name: "ANA PAULA - SECRETARIA", phone: "554195419271" },
  });
  let calls = 0;
  const socket = { sendMessage: async (jid, content) => {
    calls++;
    assert.equal(jid, chatId);
    assert.ok("contacts" in content);
    const card = content.contacts.contacts[0];
    assert.equal(card.displayName, input.contact!.name);
    assert.match(card.vcard!, /TEL;type=CELL;waid=554195419271:\+554195419271/);
    return { key: { id: "sent-contact", remoteJid: jid, fromMe: true }, messageTimestamp: 100,
      message: { contactMessage: card } };
  } } satisfies Pick<WASocket, "sendMessage">;
  assert.deepEqual(await sendMessage("contact", input, () => socket), { id: "sent-contact", sent: true });
  assert.equal(calls, 1);
  const messages = listMessages("contact", chatId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "contact");
  assert.deepEqual(messages[0].contact, input.contact);
  assert.equal(listMessages("other-account", chatId).length, 0);
});

test("texto e anexo aceitam conversa de dez dígitos mantendo o destinatário original", async () => {
  const chatId = "1234567890@s.whatsapp.net";
  let calls = 0;
  const socket = { sendMessage: async (jid, content) => {
    assert.equal(jid, chatId);
    calls++;
    if (calls === 1) assert.deepEqual(content, { text: "Oi" });
    else {
      assert.ok("document" in content);
      assert.equal(content.fileName, "a.pdf");
    }
    return { key: { id: `sent-${calls}`, remoteJid: jid, fromMe: true }, messageTimestamp: 100,
      message: { conversation: "Enviado" } };
  } } satisfies Pick<WASocket, "sendMessage">;
  for (const content of [
    { text: "Oi" },
    { attachments: [{ name: "a.pdf", mime: "application/pdf", data: "YQ==" }] },
  ]) {
    const result = await sendMessage("short-number", sendSchema.parse({ chatId, ...content }), () => socket);
    assert.equal(result.sent, true);
  }
  assert.equal(calls, 2);
  assert.equal(listMessages("short-number", chatId).length, 2);
});
