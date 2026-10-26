import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { campaignTimingStorageKey, defaultCampaignTiming, loadCampaignTiming, saveCampaignTiming, validateCampaignTiming } from "../src/features/whatsapp/campaign-timing";

function browser(t: TestContext) {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return { values, localStorage };
}

test("restaura os quatro campos salvos no navegador sem guardar outros dados do disparo", (t) => {
  const { values } = browser(t);
  assert.deepEqual(loadCampaignTiming(), defaultCampaignTiming);
  const timing = { intervalSeconds: 30, intervalVarianceSeconds: 5, pauseEvery: 25, pauseSeconds: 90 };
  assert.equal(saveCampaignTiming({ ...timing, text: "Não persistir mensagem", leadIds: [1] }), true);
  assert.deepEqual(loadCampaignTiming(), timing);
  assert.deepEqual(JSON.parse(values.get(campaignTimingStorageKey)!), timing);
});

test("dados inválidos ou corrompidos usam os padrões com intervalo mínimo preservado", (t) => {
  const { values } = browser(t);
  for (const saved of ["{", "null", "[]", '"texto"', JSON.stringify({ intervalSeconds: 30 }),
    JSON.stringify({ ...defaultCampaignTiming, intervalSeconds: "30" }),
    JSON.stringify({ ...defaultCampaignTiming, intervalSeconds: 3, intervalVarianceSeconds: 1 })]) {
    values.set(campaignTimingStorageKey, saved);
    assert.deepEqual(loadCampaignTiming(), defaultCampaignTiming);
  }
});

test("valores incompletos, decimais ou fora dos limites não substituem a última configuração válida", (t) => {
  const { values } = browser(t);
  assert.equal(saveCampaignTiming(defaultCampaignTiming), true);
  const previous = values.get(campaignTimingStorageKey);
  for (const change of [
    { intervalSeconds: NaN }, { intervalSeconds: 2 }, { intervalSeconds: 3601 }, { intervalSeconds: 10.5 },
    { intervalVarianceSeconds: -1 }, { intervalVarianceSeconds: 1801 }, { intervalVarianceSeconds: 8 },
    { pauseEvery: 0 }, { pauseEvery: 501 }, { pauseSeconds: -1 }, { pauseSeconds: 3601 }, { pauseSeconds: Infinity },
  ]) {
    assert.equal(saveCampaignTiming({ ...defaultCampaignTiming, ...change }), false);
    assert.equal(values.get(campaignTimingStorageKey), previous);
  }
  assert.ok(validateCampaignTiming({ intervalSeconds: 3, intervalVarianceSeconds: 0, pauseEvery: 1, pauseSeconds: 0 }));
  assert.ok(validateCampaignTiming({ intervalSeconds: 3600, intervalVarianceSeconds: 1800, pauseEvery: 500, pauseSeconds: 3600 }));
});

test("bloqueio ou falha do armazenamento não impede usar os intervalos na tela", (t) => {
  const { localStorage } = browser(t);
  t.mock.method(localStorage, "getItem", () => { throw new Error("Armazenamento bloqueado"); });
  t.mock.method(localStorage, "setItem", () => { throw new Error("Sem espaço"); });
  assert.deepEqual(loadCampaignTiming(), defaultCampaignTiming);
  assert.equal(saveCampaignTiming(defaultCampaignTiming), false);
  Object.defineProperty(window, "localStorage", { get: () => { throw new Error("Acesso bloqueado"); } });
  assert.deepEqual(loadCampaignTiming(), defaultCampaignTiming);
  assert.equal(saveCampaignTiming(defaultCampaignTiming), false);
});
