import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, hkdfSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BufferJSON, decryptMessageNode, isRealMessage, proto, type WAMessage } from "@whiskeysockets/baileys";
import pino from "pino";

const directory = mkdtempSync(join(tmpdir(), "via-encrypted-edits-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage, listMessages, rawMessage, deleteStoredMessage } = await import("../src/storage/messages.js");
const { reconcileEncryptedEdits } = await import("../src/storage/encrypted-edits.js");
const { editMessage } = await import("../src/messaging/send.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });
const chat = "5551999999999@s.whatsapp.net";
const me = "5551888888888@s.whatsapp.net";
const secret = Buffer.alloc(32, 7);
function original(hasSecret = true, fromMe = false, chatId = chat): WAMessage {
  return { key: { id: "original", remoteJid: chatId, fromMe, ...(chatId.endsWith("@g.us") ? { participant: chat } : {}) },
    messageTimestamp: 100, message: { conversation: "Antes", ...(hasSecret ? { messageContextInfo: { messageSecret: secret } } : {}) } };
}
function event(options: { id?: string; timestamp?: number; author?: string; fromMe?: boolean; chatId?: string; target?: string; text?: string } = {}): WAMessage {
  const { id = "event", timestamp = 200000, author = chat, fromMe = false, chatId = chat, target = "original", text = "Depois" } = options;
  const plaintext = proto.Message.encode({ protocolMessage: { type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
    key: { id: target }, timestampMs: timestamp, editedMessage: { conversation: text } } }).finish();
  const key = hkdfSync("sha256", secret, Buffer.alloc(0), Buffer.from(`original${author}${author}Message Edit`), 32);
  const iv = Buffer.alloc(12, 3);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { key: { id, remoteJid: chatId, fromMe, ...(chatId.endsWith("@g.us") ? { participant: author } : {}) }, messageTimestamp: timestamp / 1000,
    message: { secretEncryptedMessage: { secretEncType: proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT,
      targetMessageKey: { id: "original", remoteJid: me, fromMe: true }, encPayload: payload, encIv: iv } } };
}

test("edição criptografada atualiza somente a original e mantém posição, autor, segredo e prévia", () => {
  saveMessage("direct", original());
  saveMessage("direct", event());
  const rows = listMessages("direct", chat);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "original");
  assert.equal(rows[0].text, "Depois");
  assert.equal(rows[0].edited, true);
  assert.equal(rows[0].mine, 0);
  assert.equal(rows[0].timestamp, 100000);
  assert.equal(db.prepare("SELECT last_text FROM chats WHERE user_id='direct'").get()?.last_text, "Depois");
  assert.deepEqual(rawMessage("direct", "original")?.message?.messageContextInfo?.messageSecret, secret);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pending_message_edits WHERE user_id='direct'").get()?.count, 0);
});

test("edição antes da original ou sem segredo fica pendente sem criar balão e é reaplicada quando o segredo chega", () => {
  saveMessage("pending", event());
  assert.equal(listMessages("pending", chat).length, 0);
  saveMessage("pending", original(false));
  assert.equal(listMessages("pending", chat)[0].text, "Antes");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pending_message_edits WHERE user_id='pending'").get()?.count, 1);
  saveMessage("pending", original());
  assert.equal(listMessages("pending", chat)[0].text, "Depois");
});

test("recibos repetidos ou fora de ordem não restauram uma revisão antiga", () => {
  saveMessage("order", original());
  saveMessage("order", event({ id: "new", timestamp: 300000, text: "Mais recente" }));
  saveMessage("order", original(false));
  saveMessage("order", event({ id: "old", timestamp: 200000, text: "Antiga" }));
  saveMessage("order", event({ id: "new", timestamp: 300000, text: "Mais recente" }));
  assert.equal(listMessages("order", chat)[0].text, "Mais recente");
  assert.equal(listMessages("order", chat).length, 1);
});

test("PN/LID e mensagem própria usam endereçamento autenticado da sessão", () => {
  db.prepare("INSERT INTO auth VALUES(?,?,?)").run("lid", "lid-mapping-123_reverse", JSON.stringify(chat.split("@")[0]));
  db.prepare("INSERT INTO auth VALUES(?,?,?)").run("lid", `lid-mapping-${chat.split("@")[0]}`, JSON.stringify("123"));
  saveMessage("lid", original());
  const incoming = event({ author: "123@lid" });
  incoming.key = { ...incoming.key, remoteJid: "123@lid", remoteJidAlt: chat };
  saveMessage("lid", incoming);
  assert.equal(listMessages("lid", chat)[0].text, "Depois");
  db.prepare("INSERT INTO auth VALUES(?,?,?)").run("self", "creds", JSON.stringify({ me: { id: me, lid: "999@lid" } }));
  saveMessage("self", original(true, true));
  saveMessage("self", event({ author: "999@lid", fromMe: true }));
  assert.equal(listMessages("self", chat)[0].text, "Depois");
});

test("outro participante, sessão, conversa, alvo divergente ou cifra adulterada não alteram a original", () => {
  const group = "123456@g.us";
  saveMessage("group-valid", original(true, false, group));
  saveMessage("group-valid", event({ chatId: group }));
  assert.equal(listMessages("group-valid", group)[0].text, "Depois");
  saveMessage("group", original(true, false, group));
  saveMessage("group", event({ chatId: group, author: "5551777777777@s.whatsapp.net" }));
  assert.equal(listMessages("group", group)[0].text, "Antes");
  saveMessage("safe", original());
  saveMessage("other-session", event());
  saveMessage("safe", event({ chatId: "other@g.us" }));
  saveMessage("safe", event({ id: "mismatch", target: "wrong" }));
  const bad = event({ id: "tampered" });
  bad.message!.secretEncryptedMessage!.encPayload![0] ^= 1;
  saveMessage("safe", bad);
  assert.equal(listMessages("safe", chat)[0].text, "Antes");
  assert.equal(listMessages("safe", chat).length, 1);
});

test("edição local e ressincronização preservam o segredo para futuras revisões", async () => {
  saveMessage("local-secret", original(true, true));
  await editMessage("local-secret", "original", chat, "Local", () => ({ sendMessage: async () => undefined }));
  saveMessage("local-secret", original(false, true));
  assert.deepEqual(rawMessage("local-secret", "original")?.message?.messageContextInfo?.messageSecret, secret);
});

test("reparo retira somente balões de edição criptografada, recupera conteúdo possível e conserva pendentes", () => {
  for (const hasSecret of [false, true]) {
    const user = `repair-${hasSecret}`;
    saveMessage(user, original(hasSecret));
    db.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)").run(user, "event", chat, "Mensagem não suportada", 0, "text", 200000, JSON.stringify(event(), BufferJSON.replacer));
    db.prepare("UPDATE chats SET last_text='Mensagem não suportada',updated_at=200000 WHERE user_id=?").run(user);
  }
  reconcileEncryptedEdits(saveMessage, deleteStoredMessage);
  for (const hasSecret of [false, true]) {
    const user = `repair-${hasSecret}`;
    assert.equal(listMessages(user, chat).length, 1);
    assert.equal(listMessages(user, chat)[0].text, hasSecret ? "Depois" : "Antes");
    assert.equal(db.prepare("SELECT updated_at FROM chats WHERE user_id=?").get(user)?.updated_at, 100000);
  }
});

test("decoder da dependência preserva segredo externo de dispositivo vinculado e edição não conta como nova mensagem", async () => {
  const wire = proto.Message.encode({ messageContextInfo: { messageSecret: secret },
    deviceSentMessage: { destinationJid: chat, message: { conversation: "Mensagem do celular" } } }).finish();
  const decoded = decryptMessageNode({ tag: "message", attrs: { id: "device", from: me, recipient: chat, t: "100", type: "text" },
    content: [{ tag: "plaintext", attrs: {}, content: wire }] }, me, undefined,
    { lidMapping: { getLIDForPN: async () => null } } as unknown as Parameters<typeof decryptMessageNode>[3], pino({ level: "silent" }));
  await decoded.decrypt();
  assert.deepEqual(decoded.fullMessage.message?.messageContextInfo?.messageSecret, secret);
  assert.equal(decoded.fullMessage.message?.conversation, "Mensagem do celular");
  assert.equal(isRealMessage(event()), false);
  assert.equal(isRealMessage(original()), true);
});
