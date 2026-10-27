import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-contacts-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const {
  getContact,
  saveWhatsAppContact,
  saveContactSchema,
  contactChatSchema,
} = await import("../src/messaging/contacts.js");
const { saveContact, savePushName, saveConversationName, contactName } =
  await import("../src/storage/contacts.js");
const { listChats } = await import("../src/storage/chat-states.js");
const chatId = "5551999999999@s.whatsapp.net";
type ContactSocket = Pick<WASocket, "addOrEditContact">;
after(() => {
  db.close();
  rmSync(directory, { recursive: true });
});

test("agenda aceita os IDs de dez a quinze dígitos já abertos pelo fluxo de leads sem trocar o número", async () => {
  for (const phone of [
    "1234567890",
    "51990000030",
    "5551999999999",
    "123456789012345",
  ]) {
    const chatId = `${phone}@s.whatsapp.net`;
    let called = "";
    const saved = await saveWhatsAppContact(
      "lead-regression",
      { chatId, firstName: "Larissa", lastName: "Mendes" },
      () => ({
        addOrEditContact: async (id) => {
          called = id;
        },
      }),
    );
    assert.equal(called, chatId);
    assert.equal(saved.chatId, chatId);
    assert.equal(
      getContact("lead-regression", chatId).fullName,
      "Larissa Mendes",
    );
  }
  for (const phone of ["123456789", "1234567890123456"])
    assert.throws(() => contactChatSchema.parse(`${phone}@s.whatsapp.net`));
});

test("salvar contato aguarda confirmação remota e envia nome/sobrenome pela API nativa", async () => {
  const user = "create";
  let confirm!: () => void;
  let call: unknown;
  const pending = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  const saving = saveWhatsAppContact(
    user,
    { chatId, firstName: "  Maria Clara  ", lastName: "  da Silva  " },
    () => ({
      addOrEditContact: async (jid, action) => {
        call = { jid, action };
        await pending;
      },
    }),
  );
  assert.equal(getContact(user, chatId).saved, false);
  assert.equal(contactName(user, chatId), undefined);
  assert.deepEqual(call, {
    jid: chatId,
    action: {
      firstName: "Maria Clara",
      fullName: "Maria Clara da Silva",
      pnJid: chatId,
      lidJid: undefined,
      saveOnPrimaryAddressbook: false,
    },
  });
  confirm();
  const result = await saving;
  assert.deepEqual(result, {
    chatId,
    firstName: "Maria Clara",
    lastName: "da Silva",
    fullName: "Maria Clara da Silva",
    saved: true,
  });
  assert.deepEqual(getContact(user, chatId), result);
  assert.equal(getContact("other-account", chatId).saved, false);
});

test("editar nome substitui dados da agenda e prévia sem alterar histórico ou estado do chat", async () => {
  const user = "edit";
  db.prepare("INSERT INTO chats VALUES(?,?,?,?,?)").run(
    user,
    chatId,
    "Nome antigo",
    "Mensagem mantida",
    123,
  );
  db.prepare("INSERT INTO contacts VALUES(?,?,?,?)").run(
    user,
    chatId,
    "Nome antigo",
    5,
  ); // metadata antiga de conversa individual
  db.prepare(
    "INSERT INTO chat_states(user_id,id,archived,pinned_at,unread_count) VALUES(?,?,?,?,?)",
  ).run(user, chatId, 1, 99, 7);
  const socket: ContactSocket = { addOrEditContact: async () => {} };
  await saveWhatsAppContact(
    user,
    { chatId, firstName: "Ana", lastName: "Souza" },
    () => socket,
  );
  const chat = listChats(user)[0] as {
    name: string;
    lastText: string;
    archived: number;
    pinnedAt: number;
    unreadCount: number;
    contactSaved: number;
  };
  assert.equal(chat.name, "Ana Souza");
  assert.equal(chat.lastText, "Mensagem mantida");
  assert.equal(chat.archived, 1);
  assert.equal(chat.pinnedAt, 99);
  assert.equal(chat.unreadCount, 7);
  assert.equal(chat.contactSaved, 1);
  saveConversationName(user, chatId, "Nome antigo do histórico");
  savePushName(user, chatId, "Nome do perfil");
  assert.equal(contactName(user, chatId), "Ana Souza");
  await saveWhatsAppContact(user, { chatId, firstName: "Ana" }, () => socket);
  assert.equal(getContact(user, chatId).lastName, "");
  assert.equal(getContact(user, chatId).fullName, "Ana");
});

test("falha remota, sessão desconectada e falta de chave não anunciam salvamento local", async () => {
  const user = "fail";
  saveContact(user, { id: chatId, name: "Original" });
  const request = { chatId, firstName: "Alterado", lastName: "Teste" };
  await assert.rejects(
    saveWhatsAppContact(user, request, () => ({
      addOrEditContact: async () => {
        throw Error("rejected");
      },
    })),
    /rejected/,
  );
  await assert.rejects(
    saveWhatsAppContact(user, request, () => {
      throw Object.assign(Error("Conecte"), { statusCode: 409 });
    }),
    { statusCode: 409 },
  );
  await assert.rejects(
    saveWhatsAppContact(user, request, () => ({
      addOrEditContact: async () => {
        throw Error("App state key not present!");
      },
    })),
    { statusCode: 409 },
  );
  assert.equal(getContact(user, chatId).fullName, "Original");
  assert.equal(
    (
      db
        .prepare("SELECT COUNT(*) AS count FROM contact_names WHERE user_id=?")
        .get(user) as { count: number }
    ).count,
    0,
  );
});

test("mapeamento PN/LID confiável sincroniza o nome dos dois IDs da mesma sessão", async () => {
  const user = "mapping";
  db.prepare("INSERT INTO auth VALUES(?,?,?)").run(
    user,
    "lid-mapping-5551999999999",
    JSON.stringify("123456"),
  );
  let lid: string | null | undefined;
  await saveWhatsAppContact(
    user,
    { chatId, firstName: "João", lastName: "D’Ávila" },
    () => ({
      addOrEditContact: async (_, action) => {
        lid = action.lidJid;
      },
    }),
  );
  assert.equal(lid, "123456@lid");
  assert.equal(contactName(user, "123456@lid"), "João D’Ávila");
  assert.equal(contactName("other-account", "123456@lid"), undefined);
});

test("contatos antigos têm nomes sugeridos e atualizações do celular substituem o nome conhecido", async () => {
  const user = "sync";
  savePushName(user, chatId, "Marina Lopes");
  assert.deepEqual(getContact(user, chatId), {
    chatId,
    firstName: "Marina",
    lastName: "Lopes",
    fullName: "Marina Lopes",
    saved: false,
  });
  await saveWhatsAppContact(
    user,
    { chatId, firstName: "Maria Clara", lastName: "Silva" },
    () => ({ addOrEditContact: async () => {} }),
  );
  saveContact(user, { id: chatId, name: "Mariana Souza" });
  assert.equal(getContact(user, chatId).firstName, "Mariana");
  assert.equal(getContact(user, chatId).lastName, "Souza");
  assert.equal(getContact(user, chatId).saved, true);
  saveConversationName(user, "123@g.us", "Grupo oficial");
  saveContact(user, { id: "123@g.us", name: "Participante" });
  assert.equal(contactName(user, "123@g.us"), "Grupo oficial");
});

test("dados inválidos não chamam o socket e não aceitam grupos, LID ou nomes vazios", async () => {
  let calls = 0;
  const socket: ContactSocket = {
    addOrEditContact: async () => {
      calls++;
    },
  };
  for (const request of [
    { chatId: "123@g.us", firstName: "Nome" },
    { chatId: "123@lid", firstName: "Nome" },
    { chatId, firstName: "   " },
    { chatId, firstName: "a".repeat(81) },
    { chatId, firstName: "Nome", lastName: "a".repeat(81) },
  ])
    await assert.rejects(saveWhatsAppContact("invalid", request, () => socket));
  assert.equal(calls, 0);
  assert.throws(() => contactChatSchema.parse("status@broadcast"));
  assert.throws(() => saveContactSchema.parse({ chatId, firstName: null }));
});
