import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(join(tmpdir(), "via-startup-history-"));
process.env.DATA_DIR = directory;
const legacy = new DatabaseSync(join(directory, "whatsapp.db"));
legacy.exec(`CREATE TABLE messages(user_id TEXT,id TEXT,chat_id TEXT,text TEXT,mine INTEGER,kind TEXT,timestamp INTEGER,raw TEXT,PRIMARY KEY(user_id,id));
  BEGIN;`);
const insert = legacy.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)");
for (let index = 0; index < 3000; index++) {
  const chatId = index < 500 ? `${5551999000000 + index}@s.whatsapp.net` : `${10000000 + index % 50}@lid`;
  const raw = { key: { id: String(index), remoteJid: chatId, fromMe: false },
    message: { conversation: "Histórico anterior" }, messageTimestamp: 100 + index };
  insert.run("95", String(index), chatId, "Histórico anterior", 0, "text", (100 + index) * 1000, JSON.stringify(raw));
}
legacy.exec("COMMIT");
legacy.close();
const { db } = await import("../src/storage/database.js");
const { initializeBackups, backupMessages } = await import("../src/storage/backups.js");
after(() => { db.close(); rmSync(directory, { recursive: true }); });

test("inicialização do schema anterior busca LID por índice e preserva histórico com número não resolvido", () => {
  const number = "5551999990001";
  db.prepare("INSERT INTO auth VALUES(?,?,?)").run("95", "creds", JSON.stringify({ me: { id: `${number}@s.whatsapp.net` } }));
  const prepare = db.prepare.bind(db);
  let plan: string[] | undefined;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (!plan && sql.includes("JOIN session_numbers n ON n.session_id=m.user_id")) {
      const get = statement.get.bind(statement);
      statement.get = (...parameters) => {
        plan = (prepare("EXPLAIN QUERY PLAN " + sql).all(...parameters) as { detail: string }[]).map((row) => row.detail);
        return get(...parameters);
      };
    }
    return statement;
  };
  try { initializeBackups(); } finally { db.prepare = prepare; }
  // Verifica o plano da consulta realmente usada, sem depender da velocidade da máquina.
  assert.ok(plan?.some((detail) => /SEARCH m .*\(<expr>=\?/.test(detail)), plan?.join("\n"));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM messages").get()?.count, 3000);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM backup_messages").get()?.count, 3000);
  assert.equal(backupMessages("95", number, "10000000@lid").length, 50);
  assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
});
