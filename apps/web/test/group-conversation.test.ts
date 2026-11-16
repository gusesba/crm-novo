import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "../src/features/whatsapp/conversation";

test("conversas de grupos oferecem compositor; Backup e LID continuam em consulta", () => {
  for (const chatId of ["120363123456789012@g.us", "5511999999999-1234567890@g.us", "5551999999999@s.whatsapp.net", "123@lid"]) {
    for (const backup of [false, true]) {
      const html = renderToStaticMarkup(createElement(Conversation, {
        chatId, backup, chats: [], onStartConversation: () => {}, onRead: () => {},
      }));
      if (!backup && !chatId.endsWith("@lid")) {
        assert.match(html, /<textarea/);
        assert.match(html, /aria-label="Enviar mensagem"/);
      } else {
        assert.doesNotMatch(html, /<textarea|aria-label="Enviar mensagem"/);
      }
    }
  }
});
