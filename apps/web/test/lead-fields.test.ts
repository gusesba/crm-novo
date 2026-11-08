import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerFields } from "../src/features/leads/customer-fields";
import { PhoneInput } from "../src/features/leads/phone-input";
import { phoneMask } from "../src/lib/phone-mask";

test("vendedora tem nome e telefones bloqueados, mas pode editar e-mail, gênero e nascimento", () => {
  const html = renderToStaticMarkup(createElement(CustomerFields, { readOnly: true }));
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
  assert.match(inputs.find((input) => input.includes('name="name"'))!, /readOnly/);
  assert.equal(inputs.filter((input) => input.includes('type="tel"') && input.includes("readOnly")).length, 2);
  for (const name of ["email", "birthDate"]) {
    const input = inputs.find((input) => input.includes(`name="${name}"`))!;
    assert.doesNotMatch(input, /readOnly|disabled/);
  }
  assert.match(html, /<select name="gender">/);
  assert.doesNotMatch(html, /type="hidden" name="gender"/);
});

test("cadastro libera dados do cliente e exige nome e contato principal", () => {
  const html = renderToStaticMarkup(createElement(CustomerFields));
  assert.doesNotMatch(html, /readOnly|disabled/);
  const name = html.match(/<input\b[^>]*name="name"[^>]*>/)![0];
  assert.match(name, /required=""/);
  const phones = [...html.matchAll(/<input\b[^>]*type="tel"[^>]*>/g)].map((match) => match[0]);
  assert.match(phones[0], /required=""/);
  assert.doesNotMatch(phones[1], /required/);
});

test("máscara preserva o valor original enviado para não alterar telefone bloqueado", () => {
  for (const value of ["41987654321", "(41) 98765-4321", "5541987654321", "14155552671"]) {
    const html = renderToStaticMarkup(createElement(PhoneInput, {
      name: "additionalPhone", defaultValue: value, readOnly: true,
    }));
    assert.ok(html.includes(`<input type="hidden" name="additionalPhone" value="${value}"`));
  }
});

test("máscara aceita digitação parcial, fixo, celular, DDI e números internacionais sem truncar", () => {
  const cases = [
    ["", ""], ["4", "(4"], ["41", "(41"], ["419", "(41) 9"],
    ["4133334444", "(41) 3333-4444"], ["41987654321", "(41) 98765-4321"],
    ["5541987654321", "+55 (41) 98765-4321"], ["554133334444", "+55 (41) 3333-4444"],
    ["55987654321", "(55) 98765-4321"], ["+55 41 98765-4321", "+55 (41) 98765-4321"],
    ["+14155552671", "+14155552671"], ["442079460123", "442079460123"],
    ["123456789012345", "123456789012345"],
  ];
  for (const [value, expected] of cases) assert.equal(phoneMask(value), expected);
});
