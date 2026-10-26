import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatList } from "../src/features/whatsapp/chat-list";
import type { Chat } from "../src/lib/types";

function render(unreadCount?: number, markedUnread = false) {
  const chat: Chat = {
    id: "5551999999999@s.whatsapp.net", name: "Contato", lastText: "Foto",
    updatedAt: 100, archived: false, pinnedAt: 10, unreadCount, markedUnread,
  };
  return renderToStaticMarkup(createElement(ChatList, {
    chats: [chat], search: "", pictureUrl: () => "", onSelect: () => {}, onOpenPhoto: () => {},
  }));
}

test("contador mostra quantidade e descrição acessível sem substituir fixação ou prévia", () => {
  const html = render(4);
  assert.match(html, /class="chat-unread-count" aria-label="4 mensagens não lidas">4<\/span>/);
  assert.match(html, /Conversa fixada/);
  assert.match(html, /<p>Foto<\/p>/);
  assert.match(html, /chat-item  unread/);
});

test("uma mensagem usa singular e contagem grande é limitada visualmente a 99+", () => {
  assert.match(render(1), /aria-label="1 mensagem não lida">1<\/span>/);
  assert.match(render(150), /aria-label="150 mensagens não lidas">99\+<\/span>/);
});

test("zero e payload legado não exibem indicador de não lidas", () => {
  assert.doesNotMatch(render(0), /chat-unread-count/);
  assert.doesNotMatch(render(), /chat-unread-count/);
});

test("marcação manual sem quantidade exibe somente um ponto acessível", () => {
  const html = render(0, true);
  assert.match(html, /class="chat-unread-count marked" aria-label="Conversa marcada como não lida"><\/span>/);
  assert.doesNotMatch(html, /aria-label="1 mensagem não lida"/);
});
