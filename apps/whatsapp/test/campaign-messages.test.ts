import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "via-campaign-messages-"));
process.env.DATA_DIR = directory;
const { db } = await import("../src/storage/database.js");
const { campaignMessages } = await import("../src/campaigns/worker.js");
after(() => {
  db.close();
  rmSync(directory, { recursive: true });
});

test("Details return the saved message sequence and attachments in their original order", () => {
  const messages = [
    { text: "Olá, {{nome}}!\nCondições especiais." },
    {
      text: "Veja o documento",
      attachment: {
        name: "Condições.pdf",
        mime: "application/pdf",
        data: "YWJj",
      },
    },
  ];
  db.prepare(
    "INSERT INTO campaigns(id,user_id,payload,status,created_at) VALUES(?,?,?,?,?)",
  ).run(
    "sequence",
    "1",
    JSON.stringify({ messages, recipients: [{ name: "Cliente" }] }),
    "completed",
    100,
  );
  assert.deepEqual(campaignMessages("1", "sequence"), messages);
});

test("Details cannot read campaigns owned by another user", () => {
  assert.throws(() => campaignMessages("2", "sequence"), { statusCode: 404 });
  assert.throws(() => campaignMessages("1", "missing"), { statusCode: 404 });
});

test("Older campaigns retain their single text message", () => {
  db.prepare(
    "INSERT INTO campaigns(id,user_id,payload,status,created_at) VALUES(?,?,?,?,?)",
  ).run(
    "legacy",
    "1",
    JSON.stringify({ text: "Mensagem anterior" }),
    "completed",
    100,
  );
  assert.deepEqual(campaignMessages("1", "legacy"), [
    { text: "Mensagem anterior", attachment: undefined },
  ]);
});
