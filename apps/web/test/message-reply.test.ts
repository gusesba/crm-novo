import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageReply } from "../src/features/whatsapp/message-reply";

const quote = { id: "original", author: "Mariana", mine: false, text: "*Mensagem* citada", kind: "text" };
test("citação exibe autor e texto formatado sem interpretar HTML recebido", () => {
  const html = renderToStaticMarkup(createElement(MessageReply, { reply: { ...quote, text: '*<img src=x onerror="alert(1)">*' } }));
  assert.match(html, /<blockquote class="message-reply" aria-label="Mensagem citada">/);
  assert.match(html, /<strong>Mariana<\/strong>/);
  assert.match(html, /<strong>&lt;img/);
  assert.doesNotMatch(html, /<img/);
});
test("mensagem própria usa Você e só oferece navegação quando a original está carregada", () => {
  const html = renderToStaticMarkup(createElement(MessageReply, { reply: { ...quote, mine: true }, onNavigate: () => {} }));
  assert.match(html, /<button type="button" class="message-reply" aria-label="Ir para mensagem de você">/);
  assert.match(html, /<strong>Você<\/strong>/);
  assert.match(html, /<strong>Mensagem<\/strong> citada/);
});
test("prévia de mídia exibe ícone e miniatura sem controles de download/envio", () => {
  const html = renderToStaticMarkup(createElement(MessageReply, { reply: { ...quote, kind: "image", text: "Foto", thumbnail: "AQID" } }));
  assert.match(html, /lucide-camera/);
  assert.match(html, /src="data:image\/jpeg;base64,AQID"/);
  assert.match(html, /alt="Miniatura da mensagem citada"/);
  assert.doesNotMatch(html, /<button|<a |iframe/);
});
