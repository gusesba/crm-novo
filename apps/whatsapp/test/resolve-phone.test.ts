import assert from "node:assert/strict";
import { test } from "node:test";
import { phoneVariants, resolvePhone } from "../src/messaging/resolve-phone.js";

test("Brazilian variants start with the exact phone and include country code and ninth digit combinations", () => {
  assert.deepEqual(phoneVariants("5551999991234"), ["5551999991234", "51999991234", "555199991234", "5199991234"]);
  assert.deepEqual(phoneVariants("5199991234"), ["5199991234", "555199991234", "5551999991234", "51999991234"]);
  assert.deepEqual(phoneVariants("551133331234"), ["551133331234", "1133331234"]);
  assert.deepEqual(phoneVariants("441234567890"), ["441234567890"]);
});

test("An exact match stops the lookup without confirmation", async () => {
  const attempts: string[] = [];
  const result = await resolvePhone("5551999991234", async (phone) => {
    attempts.push(phone);
    return [{ exists: true, jid: phone + "@s.whatsapp.net" }];
  });
  assert.deepEqual(attempts, ["5551999991234"]);
  assert.equal(result?.requiresConfirmation, false);
});

test("A fallback match requires confirmation and uses the WhatsApp returned number", async () => {
  const attempts: string[] = [];
  const result = await resolvePhone("5551999991234", async (phone) => {
    attempts.push(phone);
    return [{ exists: phone === "555199991234", jid: phone + "@s.whatsapp.net" }];
  });
  assert.deepEqual(attempts, ["5551999991234", "51999991234", "555199991234"]);
  assert.deepEqual(result, { phone: "555199991234", chatId: "555199991234@s.whatsapp.net", requiresConfirmation: true });
});

test("WhatsApp rewriting the original number also requires confirmation", async () => {
  const result = await resolvePhone("5551999991234", async () => [{ exists: true, jid: "555199991234@s.whatsapp.net" }]);
  assert.equal(result?.requiresConfirmation, true);
});

test("No match returns null after checking all variants", async () => {
  const attempts: string[] = [];
  assert.equal(await resolvePhone("5551999991234", async (phone) => { attempts.push(phone); return []; }), null);
  assert.deepEqual(attempts, phoneVariants("5551999991234"));
});
