import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatList } from "../src/features/whatsapp/chat-list";
import { Conversation } from "../src/features/whatsapp/conversation";

test("lista do backup sem foto não cria imagem nem botão de consulta de foto", () => {
  const html = renderToStaticMarkup(createElement(ChatList, {
    chats: [{ id: "5551999998888@s.whatsapp.net", name: "Contato", lastText: "Mensagem guardada", updatedAt: 100, archived: false, pinnedAt: 0 }],
    search: "", onSelect: () => {},
  }));
  assert.match(html, /Mensagem guardada/);
  assert.doesNotMatch(html, /<img|profile-picture|Abrir foto de perfil/);
});

test("conversa de backup informa mensagens sem mídia e não oferece compositor ou consulta de anexo", () => {
  const html = renderToStaticMarkup(createElement(Conversation, {
    chatId: "5551999998888@s.whatsapp.net", backup: true, backupNumber: "5551999990001", chats: [], onStartConversation: () => {}, onRead: () => {},
  }));
  assert.match(html, /Mídias não fazem parte do backup/);
  assert.doesNotMatch(html, /<textarea|<img|<video|<audio|<iframe|Enviar mensagem|profile-picture|Baixar/);
});
