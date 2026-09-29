import test from "node:test";
import assert from "node:assert/strict";
import {
  deliver,
  type DeliveryDependencies,
} from "../src/campaigns/deliver.js";
import type { CampaignInput } from "../src/messaging/schemas.js";

const input: CampaignInput = {
  name: "Homologação sem rede",
  messages: [{ text: "Olá" }, { text: "Temos uma condição especial" }],
  intervalSeconds: 5,
  intervalVarianceSeconds: 2,
  pauseEvery: 2,
  pauseSeconds: 10,
  recipients: [1, 2, 3].map((leadId) => ({
    leadId,
    name: "Teste",
    phone: "5551999999999",
  })),
};
function fixture(overrides: Partial<DeliveryDependencies> = {}) {
  const sent: number[] = [],
    counts: string[] = [],
    waits: number[] = [];
  const dependencies: DeliveryDependencies = {
    eligible: async () => true,
    send: async (recipient) => {
      sent.push(recipient.leadId);
    },
    record: (_recipient, status) => {
      counts.push(status);
    },
    wait: async (milliseconds, signal) => {
      signal.throwIfAborted();
      waits.push(milliseconds);
    },
    random: () => 0.5,
    ...overrides,
  };
  return { dependencies, sent, counts, waits };
}
test("revalida os destinatários e respeita intervalo e pausa", async () => {
  const f = fixture({ eligible: async (recipient) => recipient.leadId !== 2 });
  await deliver(input, new AbortController().signal, f.dependencies);
  assert.deepEqual(f.sent, [1, 1, 3, 3]);
  assert.deepEqual(f.counts, ["sent", "skipped", "sent"]);
  assert.deepEqual(f.waits, [5000, 15000, 5000]);
});
test("aplica a margem aleatória ao intervalo de cada mensagem", async () => {
  const values = [0, 0.999, 0, 0.999, 0];
  const f = fixture({ random: () => values.shift() ?? 0 });
  await deliver(input, new AbortController().signal, f.dependencies);
  assert.deepEqual(f.waits, [3000, 17000, 3000, 17000, 3000]);
});
test("cancelamento durante a validação impede o envio", async () => {
  const controller = new AbortController();
  const f = fixture({
    eligible: async () => {
      controller.abort();
      return true;
    },
  });
  await assert.rejects(deliver(input, controller.signal, f.dependencies));
  assert.deepEqual(f.sent, []);
});
test("falha de validação não envia nem prossegue para outro contato", async () => {
  const f = fixture({
    eligible: async () => {
      throw new Error("CRM indisponível");
    },
  });
  await assert.rejects(
    deliver(input, new AbortController().signal, f.dependencies),
    /CRM indisponível/,
  );
  assert.deepEqual(f.sent, []);
});
test("falha de um envio é contada e o lote continua sem retry", async () => {
  let attempts = 0;
  const f = fixture({
    send: async (recipient) => {
      attempts++;
      if (recipient.leadId === 1) throw new Error("Falha de rede");
    },
  });
  await deliver(input, new AbortController().signal, f.dependencies);
  assert.equal(attempts, 5);
  assert.deepEqual(f.counts, ["failed", "sent", "sent"]);
});
test("cancelar envio já iniciado contabiliza conclusão e bloqueia os próximos", async () => {
  const controller = new AbortController();
  const f = fixture({
    send: async () => {
      controller.abort();
    },
  });
  await assert.rejects(deliver(input, controller.signal, f.dependencies));
  assert.deepEqual(f.counts, []);
});
