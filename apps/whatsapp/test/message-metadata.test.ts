import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-message-metadata-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage, listMessages, rawMessage, markMessageDeleted } = await import("../src/storage/messages.js");
const { editMessage } = await import("../src/messaging/send.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });
const chat = "5551999999999@s.whatsapp.net";
const message = (id: string, content: proto.IMessage = { conversation: "Texto" }, fromMe = false): WAMessage => ({
  key: { id, remoteJid: chat, fromMe }, messageTimestamp: 100, message: content,
});

test("encaminhamento só usa contexto da mensagem principal, inclusive mídia e envelopes", () => {
  for (const contextInfo of [{ isForwarded: true }, { forwardingScore: 2 }]) {
    const user = JSON.stringify(contextInfo);
    saveMessage(user, message("forward", { ephemeralMessage: { message: { imageMessage: { caption: "Foto", contextInfo } } } }));
    const stored = listMessages(user, chat)[0];
    assert.equal(stored.forwarded, true);
    assert.equal(stored.edited, false);
    assert.equal(stored.text, "Foto");
  }
  saveMessage("quote-only", message("reply", { extendedTextMessage: { text: "Resposta", contextInfo: {
    stanzaId: "old", quotedMessage: { editedMessage: { message: { extendedTextMessage: { text: "Citada", contextInfo: { isForwarded: true } } } } },
  } } }));
  const reply = listMessages("quote-only", chat)[0];
  assert.equal(reply.edited, false);
  assert.equal(reply.forwarded, false);
});

test("edição nativa em messages.update é reconhecida sem perder texto ou posição", () => {
  const user = "native-edit";
  saveMessage(user, message("original"));
  saveMessage(user, { ...rawMessage(user, "original")!, messageTimestamp: 200,
    message: { ephemeralMessage: { message: { editedMessage: { message: { conversation: "Texto editado" } } } } } });
  const updated = listMessages(user, chat)[0];
  assert.equal(updated.edited, true);
  assert.equal(updated.forwarded, false);
  assert.equal(updated.text, "Texto editado");
  assert.equal(updated.timestamp, 100000);
});

test("evento de protocolo marca somente a original na sessão e conversa corretas", () => {
  saveMessage("protocol", message("original"));
  saveMessage("another-user", message("original"));
  const edit: proto.IMessage = { protocolMessage: { type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
    key: { id: "original", remoteJid: chat }, editedMessage: { conversation: "Editada pelo protocolo" } } };
  saveMessage("protocol", message("event", edit));
  assert.equal(listMessages("protocol", chat).length, 1);
  assert.equal(listMessages("protocol", chat)[0].edited, true);
  assert.equal(listMessages("another-user", chat)[0].edited, false);
  saveMessage("another-user", { ...message("other-chat-event", edit), key: { id: "other-chat-event", remoteJid: "other@g.us" } });
  assert.equal(listMessages("another-user", chat)[0].edited, false);
});

test("marcas conhecidas sobrevivem a atualização sem metadados e não são inferidas de texto diferente", () => {
  saveMessage("sticky", message("known", { editedMessage: { message: { extendedTextMessage: { text: "Inicial", contextInfo: { isForwarded: true } } } } }));
  saveMessage("sticky", message("known", { conversation: "Atualização sem marcas" }));
  const known = listMessages("sticky", chat)[0];
  assert.equal(known.edited, true);
  assert.equal(known.forwarded, true);
  saveMessage("normal", message("plain"));
  saveMessage("normal", message("plain", { conversation: "Texto diferente sem evento de edição" }));
  assert.equal(listMessages("normal", chat)[0].edited, false);
  assert.equal(listMessages("normal", chat)[0].forwarded, false);
});

test("editar pelo CRM marca após sucesso, preserva citação/encaminhamento e falha não marca", async () => {
  const contextInfo = { isForwarded: true, stanzaId: "quoted", quotedMessage: { conversation: "Trecho citado" } };
  saveMessage("local", message("original", { extendedTextMessage: { text: "Antes", contextInfo } }, true));
  const fake = { sendMessage: async () => undefined } satisfies Pick<WASocket, "sendMessage">;
  await editMessage("local", "original", chat, "Depois", () => fake);
  const updated = listMessages("local", chat)[0];
  assert.equal(updated.edited, true);
  assert.equal(updated.forwarded, true);
  assert.equal(updated.text, "Depois");
  assert.equal(updated.reply?.text, "Trecho citado");
  saveMessage("local-failure", message("original", { conversation: "Antes" }, true));
  await assert.rejects(editMessage("local-failure", "original", chat, "Depois", () => ({ sendMessage: async () => { throw new Error("Desconectado"); } })), /Desconectado/);
  assert.equal(listMessages("local-failure", chat)[0].edited, false);
  assert.equal(listMessages("local-failure", chat)[0].text, "Antes");
});

test("revogação remove os indicadores sem remover o balão apagado", () => {
  saveMessage("deleted", message("old", { editedMessage: { message: { extendedTextMessage: { text: "Antes", contextInfo: { isForwarded: true } } } } }));
  markMessageDeleted("deleted", "old", chat);
  const stored = listMessages("deleted", chat)[0];
  assert.equal(stored.kind, "deleted");
  assert.equal(stored.edited, false);
  assert.equal(stored.forwarded, false);
});
