import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignMessageSequence } from "../src/features/whatsapp/campaign-message-sequence";

test("editor informa o token e prévia substitui primeiro nome e nome completo em toda a sequência", () => {
  const html = renderToStaticMarkup(createElement(CampaignMessageSequence, {
    messages: [
      { id: "1", text: "Olá, ${PrimeiroNome}! ${PrimeiroNome}, confira ${nome} / {{nome}}." },
      { id: "2", text: "Para ${PrimeiroNome}", attachment: { name: "foto.jpg", mime: "image/jpeg", data: "YWJj" } },
    ],
    onChange: () => {}, onError: () => {},
  }));
  assert.match(html, /<code>\$\{PrimeiroNome\}<\/code>/);
  assert.match(html, /placeholder="Olá, \$\{PrimeiroNome\}!"/);
  assert.match(html, /<p>Olá, Mariana! Mariana, confira Mariana Almeida \/ Mariana Almeida\.<\/p>/);
  assert.match(html, /<p>Para Mariana<\/p>/);
  assert.match(html, /alt="foto.jpg"/);
  for (const index of [1, 2]) {
    assert.match(html, new RegExp(`type="button" aria-label="Inserir primeiro nome na mensagem ${index}">\\$\\{PrimeiroNome\\}</button>`));
    assert.match(html, new RegExp(`type="button" aria-label="Inserir nome completo na mensagem ${index}">\\$\\{nome\\}</button>`));
  }
});

test("botões de personalização ficam desabilitados para figurinhas", () => {
  const html = renderToStaticMarkup(createElement(CampaignMessageSequence, {
    messages: [{ id: "1", text: "", attachment: { name: "figurinha.webp", mime: "image/webp", data: "YWJj" } }],
    onChange: () => {}, onError: () => {},
  }));
  assert.match(html, /disabled="" aria-label="Inserir primeiro nome na mensagem 1"/);
  assert.match(html, /disabled="" aria-label="Inserir nome completo na mensagem 1"/);
});

test("cada mensagem permite selecionar vários anexos e prévia conserva todos com uma legenda", () => {
  const html = renderToStaticMarkup(createElement(CampaignMessageSequence, {
    messages: [{ id: "1", text: "Olá, ${nome}", attachments: [
      { name: "a.png", mime: "image/png", data: "YQ==" },
      { name: "b.txt", mime: "text/plain", data: "Yg==" },
    ] }], onChange: () => {}, onError: () => {},
  }));
  assert.match(html, /type="file" multiple=""/);
  assert.match(html, /Remover anexo 1: a.png/);
  assert.match(html, /Remover anexo 2: b.txt/);
  assert.match(html, /alt="a.png"/);
  assert.match(html, /<span>b.txt<\/span>/);
  assert.equal((html.match(/<p>Olá, Mariana Almeida<\/p>/g) || []).length, 1);
});
