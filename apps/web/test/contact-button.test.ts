import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactButton } from "../src/features/whatsapp/contact-form";

test("conversa aberta pelo lead com identificador de onze dígitos oferece salvar e editar contato", () => {
  const chatId = "51990000030@s.whatsapp.net";
  for (const saved of [false, true]) {
    const html = renderToStaticMarkup(
      createElement(ContactButton, {
        chatId,
        saved,
        backup: false,
        onClick: () => {},
      }),
    );
    assert.match(html, saved ? /Editar contato/ : /Salvar contato/);
    assert.match(html, /<button type="button"/);
  }
});

test("botão continua ausente no Backup, grupos, LID e identificadores inválidos", () => {
  const cases = [
    { chatId: "51990000030@s.whatsapp.net", backup: true },
    ...[
      "123@g.us",
      "123@lid",
      "status@broadcast",
      "123456789@s.whatsapp.net",
      "1234567890123456@s.whatsapp.net",
    ].map((chatId) => ({ chatId, backup: false })),
  ];
  for (const props of cases)
    assert.equal(
      renderToStaticMarkup(
        createElement(ContactButton, {
          ...props,
          saved: false,
          onClick: () => {},
        }),
      ),
      "",
    );
});
