import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClearNumberData } from "../src/features/whatsapp/clear-number-data";

test("limpeza exige desconexão e a confirmação fica fechada antes de acionar o botão", () => {
  const locked = renderToStaticMarkup(createElement(ClearNumberData, { number: "5551999990001", canClear: false, onCleared: () => {} }));
  assert.match(locked, /<button[^>]*disabled=""/);
  assert.match(locked, /Desconecte todas as contas/);
  const available = renderToStaticMarkup(createElement(ClearNumberData, { number: "5551999990001", canClear: true, onCleared: () => {} }));
  assert.doesNotMatch(available, /disabled=""|<dialog|Excluir conversas e backup/);
  assert.match(available, /Limpar dados do número/);
});
