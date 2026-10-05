import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proto, type WAMessage } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-history-test-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const {
  canDeleteForEveryone,
  saveMessage,
  listMessages,
  listRecentStickers,
  rawMessage,
  markMessageDeleted,
  deleteStoredMessage,
  saveMessageReaction,
} = await import("../src/storage/messages.js");
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

test("Status com número alternativo não entra na conversa nem altera sua prévia", () => {
  const user = "status-filter";
  saveMessage(user, message("real-message"));
  for (const remoteJidAlt of [undefined, chat]) {
    saveMessage(user, {
      ...message("story"),
      key: { id: "story", remoteJid: "status@broadcast", remoteJidAlt, participant: chat },
      messageTimestamp: 200,
      message: { imageMessage: { caption: "Story" } },
      pushName: "Nome do story",
    });
  }
  assert.equal(rawMessage(user, "story"), undefined);
  assert.deepEqual(listMessages(user, chat).map((item) => item.id), ["real-message"]);
  const chats = listChats(user) as { id: string; lastText: string; updatedAt: number }[];
  assert.equal(chats.length, 1);
  assert.equal(chats[0].lastText, "real-message");
  assert.equal(chats[0].updatedAt, 100_000);
  assert.equal(contactName(user, chat), "Cliente");
});

test("resposta enviada numa conversa a um Status continua sendo mensagem real", () => {
  const user = "status-reply";
  saveMessage(user, {
    ...message("reply"),
    message: { extendedTextMessage: {
      text: "Gostei do story",
      contextInfo: { remoteJid: "status@broadcast", stanzaId: "story" },
    } },
  });
  assert.equal(listMessages(user, chat)[0].text, "Gostei do story");
});

test("número alternativo não transfere mensagem de grupo para conversa individual", () => {
  const user = "group-alt";
  const group = "120363000000000001@g.us";
  saveMessage(user, {
    ...message("group-message"),
    key: { id: "group-message", remoteJid: group, remoteJidAlt: chat, participant: chat },
  });
  assert.equal(listMessages(user, group).length, 1);
  assert.equal(listMessages(user, chat).length, 0);
});

test("exclusão para todos respeita autoria e prazo de dois dias", () => {
  const now = 2_000_000_000_000;
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  assert.equal(canDeleteForEveryone(true, now - twoDays + 1, now), true);
  assert.equal(canDeleteForEveryone(true, now - twoDays, now), false);
  assert.equal(canDeleteForEveryone(false, now - 1000, now), false);
  assert.equal(canDeleteForEveryone(true, 0, now), false);
});

test("mensagens antigas mantêm histórico sem opção de excluir para todos", async () => {
  const user = "delete-deadline";
  const old = {
    ...message("old-own"),
    key: { ...message("old-own").key, fromMe: true },
  };
  saveMessage(user, old);
  const stored = listMessages(user, chat).find((item) => item.id === "old-own");
  assert.equal(stored?.canDeleteForEveryone, false);
  const { deleteMessage } = await import("../src/messaging/send.js");
  await assert.rejects(deleteMessage(user, "old-own", chat, true), {
    statusCode: 400,
  });
  assert.ok(rawMessage(user, "old-own"));
});

test("cartão de contato aparece com nome e telefone no histórico", () => {
  const user = "contact-card";
  saveMessage(user, {
    ...message("shared-contact"),
    message: {
      contactMessage: {
        displayName: "Ana Silva",
        vcard:
          "BEGIN:VCARD\nVERSION:3.0\nFN:Ana Silva\nTEL;type=CELL;waid=5551999999999:+5551999999999\nEND:VCARD",
      },
    },
  });
  const stored = listMessages(user, chat).find(
    (item) => item.id === "shared-contact",
  );
  assert.equal(stored?.kind, "contact");
  assert.deepEqual(stored?.contact, {
    name: "Ana Silva",
    phone: "5551999999999",
  });
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
test("seletor lista figurinhas recentes sem duplicar e respeita a conta", () => {
  const user = "recent-stickers";
  const sticker = (id: string, hash: number) => ({
    ...message(id),
    message: {
      stickerMessage: {
        mimetype: "image/webp",
        fileSha256: Uint8Array.from([hash]),
      },
    },
  });
  saveMessage(user, sticker("first", 1));
  saveMessage(user, sticker("repeat", 1));
  saveMessage(user, sticker("second", 2));
  saveMessage("another-user", sticker("private", 3));
  assert.deepEqual(
    listRecentStickers(user).map(({ id }) => id),
    ["second", "repeat"],
  );
  assert.deepEqual(
    listRecentStickers("another-user").map(({ id }) => id),
    ["private"],
  );
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
test("revogação mantém mensagem apagada e remove conteúdo e reações", () => {
  const user = "11";
  const original = message("delete-target", "Conteúdo original");
  saveMessage(user, original);
  saveMessageReaction(user, "delete-target", "me", "👍");
  saveMessage(user, {
    ...message("delete-event"),
    message: {
      protocolMessage: {
        key: { id: "delete-target", remoteJid: chat },
        type: proto.Message.ProtocolMessage.Type.REVOKE,
      },
    },
  });
  const messages = listMessages(user, chat);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "delete-target");
  assert.equal(messages[0].text, "Mensagem apagada");
  assert.equal(messages[0].kind, "deleted");
  assert.equal(messages[0].timestamp, 100000);
  assert.equal(messages[0].canDeleteForEveryone, false);
  assert.deepEqual(messages[0].reactions, []);
  assert.equal(rawMessage(user, "delete-target"), undefined);
  saveMessage(user, original);
  saveMessageReaction(user, "delete-target", "me", "❤️");
  assert.equal(listMessages(user, chat)[0].kind, "deleted");
  assert.deepEqual(listMessages(user, chat)[0].reactions, []);
  assert.equal(listChats(user)[0].lastText, "Mensagem apagada");
});

test("histórico protobuf sem fixação não desfaz uma conversa fixada", () => {
  const user = "pin-protobuf";
  saveMessage(user, message("pin-protobuf-message"));
  saveChatState(user, { id: chat, pinned: 123 });
  const partial = proto.Conversation.create({ id: chat });
  assert.equal("pinned" in partial, true);
  assert.equal(Object.hasOwn(partial, "pinned"), false);
  saveChatState(user, partial);
  saveChatState(user, { id: chat, pinned: undefined });
  assert.equal((listChats(user) as { pinnedAt: number }[])[0].pinnedAt, 123);
  saveChatState(user, { id: chat, pinned: null });
  assert.equal((listChats(user) as { pinnedAt: number }[])[0].pinnedAt, 0);
});

test("marcar mensagem apagada preserva autoria, ordem e isolamento da conversa", () => {
  const user = "deleted-media";
  saveMessage(user, { ...message("media-target"), key: { id: "media-target", remoteJid: chat, fromMe: true }, message: { imageMessage: { caption: "Privado", mimetype: "image/png" } } });
  assert.equal(markMessageDeleted(user, "media-target", "outro@s.whatsapp.net"), false);
  assert.equal(markMessageDeleted("outro", "media-target", chat), false);
  assert.equal(markMessageDeleted(user, "media-target", chat), true);
  assert.equal(markMessageDeleted(user, "media-target", chat), false);
  const stored = listMessages(user, chat)[0];
  assert.equal(stored.mine, 1);
  assert.equal(stored.kind, "deleted");
  assert.equal(stored.attachment, undefined);
  assert.equal(stored.contact, undefined);
  assert.equal(stored.canDeleteForEveryone, false);
});

test("excluir para mim continua removendo a mensagem completamente", () => {
  const user = "delete-local";
  saveMessage(user, message("local-target"));
  assert.equal(deleteStoredMessage(user, "local-target", chat), true);
  assert.deepEqual(listMessages(user, chat), []);
});

test("excluir para mim permite remover o balão apagado e valida usuário e conversa", async () => {
  const { deleteMessage } = await import("../src/messaging/send.js");
  const user = "delete-tombstone";
  saveMessage(user, message("deleted-target"));
  markMessageDeleted(user, "deleted-target", chat);
  await assert.rejects(deleteMessage("outro", "deleted-target", chat, false), { statusCode: 404 });
  await assert.rejects(deleteMessage(user, "deleted-target", "outra-conversa@s.whatsapp.net", false), { statusCode: 404 });
  await assert.rejects(deleteMessage(user, "deleted-target", chat, true), { statusCode: 404 });
  assert.equal(listMessages(user, chat)[0].kind, "deleted");
  assert.deepEqual(await deleteMessage(user, "deleted-target", chat, false), { deleted: true, forEveryone: false });
  assert.deepEqual(listMessages(user, chat), []);
  assert.equal(listChats(user)[0].lastText, "");
});
