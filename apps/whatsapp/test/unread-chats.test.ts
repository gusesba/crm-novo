import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { proto, type WASocket } from "@whiskeysockets/baileys";

const directory = mkdtempSync(join(tmpdir(), "via-unread-test-"));
process.env.DATA_DIR = directory;
const old = new DatabaseSync(join(directory, "whatsapp.db"));
old.exec(`CREATE TABLE chat_states (user_id TEXT,id TEXT,archived INTEGER NOT NULL DEFAULT 0,pinned_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,id));
  INSERT INTO chat_states VALUES('legacy','legacy@s.whatsapp.net',1,123);`);
old.close();
const { db } = await import("../src/storage/database.js");
const { listChats, saveChatState, chatUnreadState } = await import("../src/storage/chat-states.js");
const { saveMessage, markMessageDeleted } = await import("../src/storage/messages.js");
const { readChat } = await import("../src/messaging/read-chat.js");
const { readChatSchema } = await import("../src/messaging/schemas.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });

const chat = "5551999999999@s.whatsapp.net";
function message(user: string, id = "last", chatId = chat, fromMe = false, timestamp = 100) {
  saveMessage(user, {
    key: { id, remoteJid: chatId, fromMe, ...(chatId.endsWith("@g.us") ? { participant: chat } : {}) },
    messageTimestamp: timestamp,
    message: { conversation: "Olá" },
  });
}
function socket() {
  const calls: { kind: string; data: unknown; chatId?: string }[] = [];
  const fake = {
    readMessages: async (keys) => { calls.push({ kind: "receipts", data: keys }); },
    chatModify: async (patch, chatId) => { calls.push({ kind: "modify", data: patch, chatId }); },
  } satisfies Pick<WASocket, "readMessages" | "chatModify">;
  return { calls, fake };
}

test("migração preserva estados existentes e começa sem inferir não lidas do histórico", () => {
  const state = db.prepare("SELECT * FROM chat_states WHERE user_id='legacy'").get()!;
  assert.equal(state.archived, 1);
  assert.equal(state.pinned_at, 123);
  assert.equal(state.unread_count, 0);
  assert.equal(state.unread_updated_at, 0);
  message("history-only");
  assert.equal((listChats("history-only")[0] as { unreadCount: number }).unreadCount, 0);
});

test("snapshots substituem a contagem, deltas somam e zero limpa sem alterar fixação/arquivamento", () => {
  const user = "counts";
  message(user);
  saveChatState(user, { id: chat, unreadCount: 4, archived: true, pinned: 50 });
  saveChatState(user, { id: chat, unreadCount: 4 });
  assert.equal(chatUnreadState(user, chat)?.unreadCount, 4);
  saveChatState(user, { id: chat, unreadCount: 2 }, "delta");
  assert.equal(chatUnreadState(user, chat)?.unreadCount, 6);
  saveChatState(user, { id: chat, archived: false });
  saveChatState(user, proto.Conversation.create({ id: chat }));
  for (const unreadCount of [null, undefined, NaN, 1.5, -2])
    saveChatState(user, { id: chat, unreadCount });
  assert.equal(chatUnreadState(user, chat)?.unreadCount, 6);
  saveChatState(user, { id: chat, unreadCount: 0 }, "delta");
  const row = listChats(user)[0] as { unreadCount: number; pinnedAt: number; archived: number };
  assert.equal(row.unreadCount, 0);
  assert.equal(row.pinnedAt, 50);
  assert.equal(row.archived, 0);
  saveChatState(user, { id: chat, unreadCount: -1 }, "delta");
  assert.equal(chatUnreadState(user, chat)?.unreadCount, -1);
  saveChatState(user, { id: chat, unreadCount: -1 }, "delta");
  assert.equal(chatUnreadState(user, chat)?.unreadCount, -1);
  const marked = listChats(user)[0] as { unreadCount: number; markedUnread: number };
  assert.equal(marked.unreadCount, 0);
  assert.equal(marked.markedUnread, 1);
  saveChatState(user, { id: chat, unreadCount: 1 }, "delta");
  assert.equal(chatUnreadState(user, chat)?.unreadCount, 1);
});

test("contagem é isolada por sessão e conversa", () => {
  message("one"); message("two");
  saveChatState("one", { id: chat, unreadCount: 9 });
  saveChatState("two", { id: chat, unreadCount: 2 });
  assert.equal(chatUnreadState("one", chat)?.unreadCount, 9);
  assert.equal(chatUnreadState("two", chat)?.unreadCount, 2);
  assert.equal(chatUnreadState("one", "other@g.us"), undefined);
});

test("LID é normalizado e o estado de leitura mais recente prevalece inclusive quando zero", () => {
  for (const clearLast of [false, true]) {
    const user = `lid-${clearLast}`;
    const lid = "123456789@lid";
    message(user);
    saveChatState(user, { id: chat, unreadCount: 3 });
    saveChatState(user, { id: lid, unreadCount: 7, pinned: 80 });
    if (clearLast) saveChatState(user, { id: chat, unreadCount: 0 });
    db.prepare("INSERT INTO auth VALUES(?,?,?)").run(user, "lid-mapping-123456789_reverse", JSON.stringify(chat.split("@")[0]));
    const rows = listChats(user) as { id: string; unreadCount: number; pinnedAt: number }[];
    assert.equal(rows[0].unreadCount, clearLast ? 0 : 7);
    assert.equal(rows[0].pinnedAt, 80);
    assert.equal(db.prepare("SELECT 1 FROM chat_states WHERE user_id=? AND id=?").get(user, lid), undefined);
    saveChatState(user, { id: lid, unreadCount: 1 }, "delta");
    assert.equal(chatUnreadState(user, chat)?.unreadCount, clearLast ? 1 : 8);
  }
});

test("marcar lida confirma recibos e estado remoto antes de limpar o contador", async () => {
  const user = "read-success";
  message(user, "older", chat, false, 90);
  message(user, "last");
  saveChatState(user, { id: chat, unreadCount: 2, archived: true, pinned: 100 });
  const { calls, fake } = socket();
  const result = await readChat(user, chat, "last", () => ({
    readMessages: async (keys) => { assert.equal(chatUnreadState(user, chat)?.unreadCount, 2); await fake.readMessages(keys); },
    chatModify: async (patch, jid) => { assert.equal(chatUnreadState(user, chat)?.unreadCount, 2); await fake.chatModify(patch, jid); },
  }));
  assert.deepEqual(result, { chatId: chat, unreadCount: 0, markedUnread: false });
  assert.deepEqual(calls.map((call) => call.kind), ["receipts", "modify"]);
  assert.deepEqual((calls[0].data as { id: string }[]).map((key) => key.id), ["last", "older"]);
  assert.equal((calls[1].data as { markRead: boolean }).markRead, true);
  assert.equal(calls[1].chatId, chat);
  const stored = listChats(user)[0] as { archived: number; pinnedAt: number };
  assert.equal(stored.archived, 1);
  assert.equal(stored.pinnedAt, 100);
});

test("falha de conexão, recibo ou patch mantém o contador e propaga erro", async () => {
  for (const stage of ["socket", "receipt", "modify"]) {
    const user = `read-failure-${stage}`;
    message(user);
    saveChatState(user, { id: chat, unreadCount: 4 });
    const failure = Object.assign(new Error("Falha simulada"), { statusCode: 409 });
    await assert.rejects(readChat(user, chat, "last", () => {
      if (stage === "socket") throw failure;
      return {
        readMessages: async () => { if (stage === "receipt") throw failure; },
        chatModify: async () => { if (stage === "modify") throw failure; },
      };
    }), failure);
    assert.equal(chatUnreadState(user, chat)?.unreadCount, 4);
  }
});

test("mensagem nova durante leitura e alteração concorrente do contador não são apagadas", async () => {
  for (const eventUpdatesCount of [false, true]) {
    const user = `read-race-${eventUpdatesCount}`;
    message(user);
    saveChatState(user, { id: chat, unreadCount: 4 });
    const result = await readChat(user, chat, "last", () => ({
      readMessages: async () => {},
      chatModify: async () => {
        if (eventUpdatesCount) saveChatState(user, { id: chat, unreadCount: 1 }, "delta");
        else message(user, "newer", chat, false, 101);
      },
    }));
    assert.equal(result.unreadCount, eventUpdatesCount ? 5 : 4);
    assert.equal(chatUnreadState(user, chat)?.unreadCount, eventUpdatesCount ? 5 : 4);
  }
});

test("leitura de grupo preserva participante, mensagem revogada continua referência e envio próprio não recebe recibo", async () => {
  const user = "group-read";
  const group = "12036300001@g.us";
  message(user, "group", group);
  markMessageDeleted(user, "group", group);
  saveChatState(user, { id: group, unreadCount: 1 });
  const { fake, calls } = socket();
  await readChat(user, group, "group", () => fake);
  assert.equal((calls[0].data as { participant: string }[])[0].participant, chat);
  message(user, "own", chat, true);
  saveChatState(user, { id: chat, unreadCount: 1 });
  calls.length = 0;
  await readChat(user, chat, "own", () => fake);
  assert.deepEqual(calls.map((call) => call.kind), ["modify"]);
});

test("última mensagem não pode ser de outra sessão/conversa e zero não chama socket", async () => {
  const user = "read-isolation";
  message(user);
  saveChatState(user, { id: chat, unreadCount: 1 });
  const getSocket = () => { throw new Error("Não deve chamar socket"); };
  await assert.rejects(readChat("other", chat, "last", getSocket), { statusCode: 404 });
  await assert.rejects(readChat(user, "other@g.us", "last", getSocket), { statusCode: 404 });
  saveChatState(user, { id: chat, unreadCount: 0 });
  assert.deepEqual(await readChat(user, chat, "last", getSocket), { chatId: chat, unreadCount: 0, markedUnread: false });
});

test("marcação manual de não lida é removida sem inventar quantidade de mensagens", async () => {
  const user = "manual-read";
  message(user);
  saveChatState(user, { id: chat, unreadCount: -1 }, "delta");
  const { fake } = socket();
  assert.deepEqual(await readChat(user, chat, "last", () => fake), { chatId: chat, unreadCount: 0, markedUnread: false });
  assert.equal(chatUnreadState(user, chat)?.unreadCount, 0);
});

test("abrir conversa antiga com contagem ainda desconhecida confirma leitura uma vez", async () => {
  const user = "unknown-count";
  message(user);
  assert.equal(chatUnreadState(user, chat), undefined);
  const { calls, fake } = socket();
  assert.deepEqual(await readChat(user, chat, "last", () => fake), { chatId: chat, unreadCount: 0, markedUnread: false });
  assert.deepEqual(calls.map((call) => call.kind), ["receipts", "modify"]);
  assert.ok(chatUnreadState(user, chat)!.version > 0);
  await readChat(user, chat, "last", () => { throw new Error("Leitura já confirmada"); });
});

test("payload de leitura aceita JIDs suportados e rejeita dados ausentes ou inválidos", () => {
  for (const chatId of [chat, "12036300001@g.us", "123@lid"])
    assert.equal(readChatSchema.safeParse({ chatId, lastMessageId: "last" }).success, true);
  for (const value of [{}, { chatId: chat }, { chatId: "status@broadcast", lastMessageId: "last" }, { chatId: chat, lastMessageId: "" }])
    assert.equal(readChatSchema.safeParse(value).success, false);
});
