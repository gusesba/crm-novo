import assert from "node:assert/strict";
import test from "node:test";
import { messagePhones } from "../src/lib/message-phones";

test("identifica telefone com DDD no texto e inclui o DDI brasileiro", () => {
  assert.deepEqual(messagePhones("41997173484 aaaaaaa"), [
    { start: 0, text: "41997173484", phone: "5541997173484" },
  ]);
  assert.deepEqual(messagePhones("Ligue para (41) 99717-3484."), [
    { start: 11, text: "(41) 99717-3484", phone: "5541997173484" },
  ]);
});

test("preserva DDI explícito e reconhece vários telefones", () => {
  const phones = messagePhones("+41 99 717 34 84, +55 (41) 99717-3484");
  assert.deepEqual(phones.map((item) => item.phone), ["41997173484", "5541997173484"]);
});

test("ignora datas, números curtos, longos e números dentro de palavras", () => {
  for (const text of ["30-09-2026", "123456789", "1234567890123456", "abc41997173484", "41997173484abc"])
    assert.deepEqual(messagePhones(text), []);
});
