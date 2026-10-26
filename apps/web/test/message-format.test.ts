import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormattedMessage } from "../src/features/whatsapp/formatted-message";
import { MessageText } from "../src/features/whatsapp/message-text";

const render = (text: string) => renderToStaticMarkup(createElement(FormattedMessage, { text }));

test("renderiza negrito, itálico e tachado, incluindo combinações e acentos", () => {
  assert.equal(render("Olá *João*! _Condições especiais_ e ~valor antigo~."), "Olá <strong>João</strong>! <em>Condições especiais</em> e <s>valor antigo</s>.");
  assert.equal(render("*_~Tudo junto~_*"), "<strong><em><s>Tudo junto</s></em></strong>");
  assert.equal(render("*bom _dia_!* *x*"), "<strong>bom <em>dia</em>!</strong> <strong>x</strong>");
  assert.equal(render("*a*_b_~c~"), "<strong>a</strong><em>b</em><s>c</s>");
});

test("código entre uma ou três crases é literal e preserva quebras de linha", () => {
  assert.equal(render("Use `a_b *c* ~d~`"), 'Use <code class="message-code">a_b *c* ~d~</code>');
  assert.equal(render("```linha 1\n*linha 2*```"), '<code class="message-code">linha 1\n*linha 2*</code>');
  assert.equal(render("*Antes* `a` _depois_"), '<strong>Antes</strong> <code class="message-code">a</code> <em>depois</em>');
});

test("marcadores incompletos, vazios, com espaços ou dentro de palavras ficam literais", () => {
  for (const text of ["sem formatação", "*sem fechar", "_aberto", "~aberto", "```aberto", "`aberto", "**", "__", "~~", "**Markdown**", "* texto*", "*texto *", "nome_do_arquivo", "2*3*4", "https://site/a_b_c", "*linha\nnova*"])
    assert.equal(render(text), text);
});

test("HTML é escapado tanto em texto formatado quanto em código", () => {
  const html = render('*<img src=x onerror="alert(1)">* `<script>alert(1)</script>`');
  assert.equal(html, '<strong>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</strong> <code class="message-code">&lt;script&gt;alert(1)&lt;/script&gt;</code>');
  assert.doesNotMatch(html, /<(img|script)[ >]/);
});

test("ações de telefone continuam disponíveis em textos formatados e código não cria botões", () => {
  const html = renderToStaticMarkup(createElement(MessageText, {
    text: '*Ligue para (41) 99717-3484* ou _41997173484_. Código: `41997173484`',
    onError: () => {},
  }));
  assert.equal((html.match(/class="message-phone"/g) || []).length, 2);
  assert.match(html, /<strong>Ligue para <button/);
  assert.match(html, /<em><button/);
  assert.match(html, /<code class="message-code">41997173484<\/code>/);
  assert.match(html, /aria-label="Ações para o telefone \(41\) 99717-3484"/);
});

test("texto longo e delimitadores repetidos são preservados sem recursão ilimitada", () => {
  const text = "*".repeat(10000);
  assert.equal(render(text), text);
  assert.equal(render("*" + "a".repeat(10000) + "*"), "<strong>" + "a".repeat(10000) + "</strong>");
});
