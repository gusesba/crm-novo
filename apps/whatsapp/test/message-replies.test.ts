import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { proto, WAMessage } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-message-replies-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage, listMessages, markMessageDeleted } = await import("../src/storage/messages.js");
const { saveContact } = await import("../src/storage/contacts.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });
const chat = "5551999999999@s.whatsapp.net";
const self = "5551888888888@s.whatsapp.net";
function original(user: string, mine = false, chatId = chat) {
  saveMessage(user, { key: { id: "original", remoteJid: chatId, fromMe: mine }, messageTimestamp: 100, message: { conversation: "Original armazenada" } });
}
function reply(user: string, contextInfo?: proto.IContextInfo, chatId = chat, content?: proto.IMessage) {
  saveMessage(user, { key: { id: "reply", remoteJid: chatId, fromMe: true }, messageTimestamp: 101,
    message: content || { extendedTextMessage: { text: "Resposta", contextInfo } } } as WAMessage);
  return listMessages(user, chatId).find((message) => message.id === "reply")!;
}

test("resposta mostra snapshot da citação, autor Você e mantém corpo/paginação independentes", () => {
  original("own", true);
  const result = reply("own", { stanzaId: "original", participant: self, quotedMessage: { conversation: "*Teste* citado" } });
  assert.equal(result.text, "Resposta");
  assert.deepEqual(result.reply, { id: "original", author: "Você", mine: true, kind: "text", text: "*Teste* citado", thumbnail: undefined });
  const page = listMessages("own", chat, 101000, "reply");
  assert.deepEqual(page.map((item) => item.id), ["original"]);
});

test("autor de grupo usa contato do participante e contexto é extraído de mídia/envelopes", () => {
  const user = "group";
  const group = "123456@g.us";
  saveContact(user, { id: "123@lid", name: "Mariana" });
  const contextInfo = { stanzaId: "missing", participant: "123:2@lid", quotedMessage: { conversation: "Olá" } };
  const result = reply(user, undefined, group, { ephemeralMessage: { message: { imageMessage: { caption: "Resposta com foto", contextInfo } } } });
  assert.equal(result.kind, "image");
  assert.equal(result.reply?.author, "Mariana");
  assert.equal(result.reply?.text, "Olá");
});

test("original fora da página é recuperada somente na mesma sessão e conversa", () => {
  original("fallback");
  saveContact("fallback", { id: chat, name: "Cliente salvo" });
  const result = reply("fallback", { stanzaId: "original" });
  assert.equal(result.reply?.text, "Original armazenada");
  assert.equal(result.reply?.author, "Cliente salvo");
  for (const [user, chatId, remoteJid] of [["other-user", chat, chat], ["other-chat", "other@s.whatsapp.net", "other@s.whatsapp.net"], ["cross-chat", chat, "other@s.whatsapp.net"]]) {
    if (user !== "other-user") original(user);
    const isolated = reply(user, { stanzaId: "original", remoteJid }, chatId);
    assert.equal(isolated.reply?.text, "Mensagem não disponível");
    assert.equal(isolated.reply?.mine, false);
  }
});

test("citação de mídia mostra tipo, legenda/nome e miniatura limitada sem baixar arquivo", () => {
  for (const [kind, quotedMessage, text] of [
    ["image", { imageMessage: { caption: "Foto citada", jpegThumbnail: new Uint8Array([1, 2, 3]) } }, "Foto citada"],
    ["video", { videoMessage: {} }, "Vídeo"],
    ["audio", { audioMessage: {} }, "Áudio"],
    ["document", { documentMessage: { fileName: "material.pdf" } }, "material.pdf"],
    ["sticker", { stickerMessage: {} }, "Figurinha"],
    ["contact", { contactMessage: { displayName: "Ana" } }, "Ana"],
    ["location", { locationMessage: {} }, "Localização"],
  ] as const) {
    const result = reply(`media-${kind}`, { stanzaId: "old", participant: chat, quotedMessage });
    assert.equal(result.reply?.kind, kind);
    assert.equal(result.reply?.text, text);
    assert.equal(result.reply?.thumbnail, kind === "image" ? "AQID" : undefined);
  }
  const large = reply("large", { stanzaId: "old", quotedMessage: { imageMessage: { jpegThumbnail: new Uint8Array(65537) } } });
  assert.equal(large.reply?.thumbnail, undefined);
  const long = reply("long", { stanzaId: "old", quotedMessage: { conversation: "a".repeat(1000) } });
  assert.equal(long.reply?.text.length, 500);
});

test("revogação da original prevalece sobre snapshot e mensagens comuns não ganham citação", () => {
  original("deleted");
  markMessageDeleted("deleted", "original", chat);
  const result = reply("deleted", { stanzaId: "original", quotedMessage: { conversation: "Não exibir após revogação" } });
  assert.equal(result.reply?.kind, "deleted");
  assert.equal(result.reply?.text, "Mensagem apagada");
  assert.equal(reply("plain")?.reply, undefined);
  assert.equal(reply("forward", { isForwarded: true })?.reply, undefined);
});

test("citação sem original identifica a própria conta por telefone ou LID das credenciais", () => {
  for (const participant of [self, "999@lid"]) {
    const user = `self-${participant}`;
    db.prepare("INSERT INTO auth VALUES(?,?,?)").run(user, "creds", JSON.stringify({ me: { id: `${self.split("@")[0]}:2@s.whatsapp.net`, lid: "999:2@lid" } }));
    const result = reply(user, { stanzaId: "old", participant, quotedMessage: { conversation: "Minha mensagem" } });
    assert.equal(result.reply?.mine, true);
    assert.equal(result.reply?.author, "Você");
  }
});
