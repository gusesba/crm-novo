import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proto, type WAMessage } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-history-test-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { saveMessage, listMessages, rawMessage } =
  await import("../src/storage/messages.js");
const { listChats, saveChatState } =
  await import("../src/storage/chat-states.js");
const { saveProfilePicture, storedProfilePicture } =
  await import("../src/storage/profile-pictures.js");
const { contactName, saveContact, saveConversationName, savePushName } =
  await import("../src/storage/contacts.js");
after(() => {
  db.close();
  rmSync(directory, { recursive: true });
});
const chat = "5551999999999@s.whatsapp.net";
const message = (id: string, text = id): WAMessage => ({
  key: { id, remoteJid: chat, fromMe: false },
  messageTimestamp: 100,
  message: { conversation: text },
  pushName: "Cliente",
});

test("cursor não perde mensagens com o mesmo timestamp", () => {
  for (let i = 0; i < 105; i++)
    saveMessage("1", message(String(i).padStart(3, "0")));
  const first = listMessages("1", chat);
  assert.equal(first.length, 100);
  const oldest = first[0];
  const second = listMessages(
    "1",
    chat,
    Number(oldest.timestamp),
    String(oldest.id),
  );
  assert.equal(second.length, 5);
  assert.equal(new Set([...first, ...second].map((m) => m.id)).size, 105);
});
test("histórico é isolado por usuário e conversa", () => {
  assert.deepEqual(listMessages("2", chat), []);
  assert.deepEqual(listMessages("1", "5551888888888@s.whatsapp.net"), []);
  assert.equal(rawMessage("2", "000"), undefined);
});
test("histórico expõe metadados de documentos e reconhece figurinhas", () => {
  const user = "attachments";
  saveMessage(user, {
    ...message("document"),
    message: {
      documentMessage: {
        fileName: "relatorio.pdf",
        mimetype: "application/pdf",
        fileLength: 4096,
        pageCount: 5,
        caption: "Confira o relatório",
      },
    },
  } as WAMessage);
  saveMessage(user, {
    ...message("sticker"),
    message: {
      stickerMessage: {
        mimetype: "image/webp",
        fileLength: 2048,
      },
    },
  } as WAMessage);

  const stored = listMessages(user, chat);
  assert.deepEqual(stored[0].attachment, {
    name: "relatorio.pdf",
    mime: "application/pdf",
    size: 4096,
    pageCount: 5,
  });
  assert.equal(stored[0].text, "Confira o relatório");
  assert.equal(stored[1].kind, "sticker");
  assert.deepEqual(stored[1].attachment, {
    name: "Figurinha.webp",
    mime: "image/webp",
    size: 2048,
    pageCount: undefined,
  });
});
test("tipo de mídia antigo é recuperado do conteúdo original", () => {
  const user = "legacy-media";
  const legacy = {
    ...message("legacy-sticker"),
    message: {
      stickerMessage: {
        mimetype: "image/webp",
        fileLength: 1024,
      },
    },
  } as WAMessage;
  saveMessage(user, legacy);
  db.prepare(
    "UPDATE messages SET kind='text',text='Mensagem não suportada' WHERE user_id=? AND id=?",
  ).run(user, "legacy-sticker");
  db.prepare(
    "UPDATE chats SET last_text='Mensagem não suportada' WHERE user_id=? AND id=?",
  ).run(user, chat);

  const stored = listMessages(user, chat)[0];
  assert.equal(stored.kind, "sticker");
  assert.equal(stored.text, "");
  assert.equal(stored.attachment?.mime, "image/webp");
  assert.equal(
    (listChats(user) as { lastText: string }[])[0].lastText,
    "Figurinha",
  );
});
test("atualização e edição persistem conteúdo e contexto de resposta", () => {
  saveMessage("3", message("original", "Primeira versão"));
  saveMessage("3", {
    ...message("edit-event"),
    message: {
      protocolMessage: {
        key: { id: "original", remoteJid: chat },
        editedMessage: { conversation: "Versão editada" },
      },
    },
  });
  assert.equal(listMessages("3", chat)[0].text, "Versão editada");
  assert.equal(
    rawMessage("3", "original")?.message?.conversation,
    "Versão editada",
  );
  saveMessage("3", message("original", "Atualização direta"));
  assert.equal(listMessages("3", chat).length, 1);
  assert.equal(listMessages("3", chat)[0].text, "Atualização direta");
});
test("identificador alternativo mantém o vínculo por telefone", () => {
  saveMessage("4", {
    ...message("lid"),
    key: { id: "lid", remoteJid: "12345@lid", remoteJidAlt: chat },
  });
  assert.equal(listMessages("4", chat).length, 1);
});
test("foto de perfil fica isolada por usuário e conversa", () => {
  const data = new Uint8Array([1, 2, 3]);
  saveProfilePicture("1", chat, "image/jpeg", data);
  assert.deepEqual(storedProfilePicture("1", chat)?.data, data);
  assert.equal(storedProfilePicture("2", chat), undefined);
  assert.equal(
    storedProfilePicture("1", "5551888888888@s.whatsapp.net"),
    undefined,
  );
});
test("nome salvo tem prioridade sobre nome de perfil e número", () => {
  saveMessage("5", message("contact-name", "Olá"));
  savePushName("5", chat, "Nome do perfil");
  assert.equal(contactName("5", chat), "Nome do perfil");
  saveContact("5", { id: "12345@lid", phoneNumber: chat, name: "Nome salvo" });
  savePushName("5", chat, "Perfil atualizado");
  assert.equal(contactName("5", chat), "Nome salvo");
  const chatName = db
    .prepare("SELECT name FROM chats WHERE user_id=? AND id=?")
    .get("5", chat) as { name: string };
  assert.equal(chatName.name, "Nome salvo");
});
test("nome do remetente não substitui o título do grupo", () => {
  const group = "120363000000000000@g.us";
  const groupMessage = (id: string, pushName: string): WAMessage => ({
    key: {
      id,
      remoteJid: group,
      participant: "5551999999999@s.whatsapp.net",
      fromMe: false,
    },
    messageTimestamp: 100,
    message: { conversation: "Mensagem no grupo" },
    pushName,
  });
  saveMessage("6", groupMessage("group-1", "Alice"));
  let stored = db
    .prepare("SELECT name FROM chats WHERE user_id=? AND id=?")
    .get("6", group) as { name: string };
  assert.equal(stored.name, group);
  saveConversationName("6", group, "Equipe Comercial");
  saveMessage("6", groupMessage("group-2", "Bob"));
  stored = db
    .prepare("SELECT name FROM chats WHERE user_id=? AND id=?")
    .get("6", group) as { name: string };
  assert.equal(stored.name, "Equipe Comercial");
});
test("conversas fixadas vêm antes e arquivadas ficam separadas", () => {
  const user = "7";
  const regular = "5551888888888@s.whatsapp.net";
  const pinned = "5551777777777@s.whatsapp.net";
  const archived = "5551666666666@s.whatsapp.net";
  for (const [id, remoteJid] of [
    ["regular", regular],
    ["pinned", pinned],
    ["archived", archived],
  ])
    saveMessage(user, {
      ...message(id),
      key: { id, remoteJid, fromMe: false },
    });
  saveChatState(user, { id: pinned, pinned: 100 });
  saveChatState(user, { id: archived, archived: true, pinned: 200 });

  const chats = listChats(user) as {
    id: string;
    archived: number;
    pinnedAt: number;
  }[];
  assert.deepEqual(
    chats.map((item) => item.id),
    [pinned, regular, archived],
  );
  assert.equal(chats[0].pinnedAt, 100);
  assert.equal(chats[2].archived, 1);
});
test("conversas arquivadas não são cortadas pelo limite das ativas", () => {
  const user = "8";
  for (let index = 0; index < 501; index++) {
    const id = `active-${String(index).padStart(3, "0")}`;
    saveMessage(user, {
      ...message(id),
      key: { id, remoteJid: `${index}@s.whatsapp.net`, fromMe: false },
    });
  }
  const archived = "archived@s.whatsapp.net";
  saveMessage(user, {
    ...message("archived-limit"),
    key: { id: "archived-limit", remoteJid: archived, fromMe: false },
  });
  saveChatState(user, { id: archived, archived: true });

  const chats = listChats(user) as { id: string }[];
  assert.equal(chats.length, 501);
  assert.ok(chats.some((item) => item.id === archived));
});
test("estado de conversa por LID é aplicado à conversa pelo telefone", () => {
  const user = "9";
  const phone = "5551555555555";
  const chatId = `${phone}@s.whatsapp.net`;
  const lid = "123456789012345@lid";
  saveMessage(user, {
    ...message("lid-pinned"),
    key: { id: "lid-pinned", remoteJid: chatId, fromMe: false },
  });
  db.prepare("INSERT INTO auth VALUES(?,?,?)").run(
    user,
    "lid-mapping-123456789012345_reverse",
    JSON.stringify(phone),
  );
  saveChatState(user, { id: lid, pinned: 300 });

  const chats = listChats(user) as { id: string; pinnedAt: number }[];
  assert.equal(chats.find((item) => item.id === chatId)?.pinnedAt, 300);
  const orphan = db
    .prepare(
      "SELECT COUNT(*) AS count FROM chat_states WHERE user_id=? AND id=?",
    )
    .get(user, lid) as { count: number };
  assert.equal(orphan.count, 0);
});
test("reações são atualizadas e removidas sem criar novas mensagens", () => {
  const user = "10";
  saveMessage(user, message("reaction-target", "Mensagem alvo"));
  saveMessage(user, {
    ...message("reaction-event"),
    message: {
      reactionMessage: {
        key: { id: "reaction-target", remoteJid: chat },
        text: "👍",
      },
    },
  });
  let messages = listMessages(user, chat);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].reactions, [{ emoji: "👍", mine: false }]);
  saveMessage(user, {
    ...message("reaction-remove"),
    message: {
      reactionMessage: {
        key: { id: "reaction-target", remoteJid: chat },
        text: "",
      },
    },
  });
  messages = listMessages(user, chat);
  assert.deepEqual(messages[0].reactions, []);
});
test("revogação remove a mensagem e suas reações do histórico", () => {
  const user = "11";
  saveMessage(user, message("delete-target", "Mensagem apagada"));
  saveMessage(user, {
    ...message("delete-event"),
    message: {
      protocolMessage: {
        key: { id: "delete-target", remoteJid: chat },
        type: proto.Message.ProtocolMessage.Type.REVOKE,
      },
    },
  });
  assert.deepEqual(listMessages(user, chat), []);
});
