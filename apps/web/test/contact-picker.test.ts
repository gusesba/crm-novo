import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactPicker } from "../src/features/whatsapp/contact-picker";
import type { Chat } from "../src/lib/types";

test("seletor oferece contatos de dez a quinze dígitos e omite IDs inválidos, grupos e LID", () => {
  const valid = ["1234567890", "12166321952", "5551999999999", "123456789012345"];
  const invalid = ["123456789@s.whatsapp.net", "1234567890123456@s.whatsapp.net", "12166321952@g.us", "12166321952@lid"];
  const ids = [...valid.map((phone) => `${phone}@s.whatsapp.net`), ...invalid];
  const chats: Chat[] = ids.map((id, index) => ({
    id, name: `Contato ${index}`, lastText: "", updatedAt: 0, archived: false, pinnedAt: 0,
  }));
  const html = renderToStaticMarkup(createElement(ContactPicker, {
    chats, onSelect: () => {}, onClose: () => {},
  }));
  for (let index = 0; index < ids.length; index++) {
    const label = `Contato ${index}</strong>`;
    assert.equal(html.includes(label), index < valid.length);
  }
});
