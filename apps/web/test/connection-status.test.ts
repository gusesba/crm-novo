import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Connection } from "../src/features/whatsapp/connection";
import { WhatsAppAccountContext } from "../src/features/whatsapp/account-context";

test("montar ou trocar a conta verifica status sem anunciar desconexão nem oferecer nova conexão", () => {
  for (const accountId of ["default", "comercial"]) {
    const html = renderToStaticMarkup(createElement(WhatsAppAccountContext.Provider,
      { value: { accountId, userId: "" } }, createElement(Connection)));
    assert.match(html, /Verificando conexão…/);
    assert.match(html, /<button[^>]*disabled=""/);
    assert.doesNotMatch(html, /Conectar WhatsApp|Desconectar|Conecte sua conta pelo QR Code/);
  }
});
