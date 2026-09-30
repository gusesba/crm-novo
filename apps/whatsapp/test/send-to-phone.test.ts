import assert from "node:assert/strict";
import { test } from "node:test";
import { sendToPhone } from "../src/campaigns/send-to-phone.js";
import { phoneVariants } from "../src/messaging/resolve-phone.js";

test("Sends to the registered number without requiring a stored conversation", async () => {
  const lookups: string[] = [];
  const sends: string[] = [];
  const delivery = await sendToPhone(
    "5199991234",
    async (candidate) => {
      lookups.push(candidate);
      return [{ exists: true, jid: `${candidate}@s.whatsapp.net` }];
    },
    async (chatId) => {
      sends.push(chatId);
      return { id: "sent" };
    },
  );
  assert.deepEqual(lookups, ["5199991234"]);
  assert.deepEqual(sends, ["5199991234@s.whatsapp.net"]);
  assert.equal(delivery.result.id, "sent");
});

test("Tries country code and ninth digit variants when the number is not registered", async () => {
  const lookups: string[] = [];
  const delivery = await sendToPhone(
    "5199991234",
    async (candidate) => {
      lookups.push(candidate);
      return [
        {
          exists: candidate === "5551999991234",
          jid: `${candidate}@s.whatsapp.net`,
        },
      ];
    },
    async () => ({ id: "fallback" }),
  );
  assert.deepEqual(lookups, ["5199991234", "555199991234", "5551999991234"]);
  assert.equal(delivery.phone, "5551999991234");
});

test("Tries a different variant after a failed send and does not retry the same resolved destination", async () => {
  const sends: string[] = [];
  const delivery = await sendToPhone(
    "5199991234",
    async (candidate) => [
      {
        exists: true,
        jid: `${candidate === "5551999991234" ? candidate : "555199991234"}@s.whatsapp.net`,
      },
    ],
    async (chatId) => {
      sends.push(chatId);
      if (sends.length === 1) throw new Error("Falha no número original");
      return { id: "fallback" };
    },
  );
  assert.deepEqual(sends, [
    "555199991234@s.whatsapp.net",
    "5551999991234@s.whatsapp.net",
  ]);
  assert.equal(delivery.result.id, "fallback");
});

test("Reports failure after every variant is exhausted", async () => {
  const lookups: string[] = [];
  await assert.rejects(
    sendToPhone(
      "5199991234",
      async (candidate) => {
        lookups.push(candidate);
        return [];
      },
      async () => assert.fail("No registered destination"),
    ),
    /variantes não foram encontrados/,
  );
  assert.deepEqual(lookups, phoneVariants("5199991234"));
});

test("Cancellation during lookup prevents sending and trying other variants", async () => {
  const controller = new AbortController();
  const lookups: string[] = [];
  await assert.rejects(sendToPhone("5199991234", async (candidate) => {
    lookups.push(candidate);
    controller.abort();
    return [{ exists: true, jid: `${candidate}@s.whatsapp.net` }];
  }, async () => assert.fail("Cancelled campaigns cannot send"), controller.signal), /abort/i);
  assert.deepEqual(lookups, ["5199991234"]);
});
