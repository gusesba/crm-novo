import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignSchema,
  deleteSchema,
  forwardSchema,
  reactionSchema,
  sendSchema,
} from "../src/messaging/schemas.js";
const campaign = {
  name: "Teste",
  messages: [{ text: "Olá" }],
  recipients: [{ leadId: 1, phone: "5551999999999", name: "Ana" }],
  intervalSeconds: 10,
  intervalVarianceSeconds: 3,
  pauseEvery: 20,
  pauseSeconds: 60,
};
test("disparos precisam de destinatários e conteúdo", () => {
  assert.equal(campaignSchema.safeParse(campaign).success, true);
  assert.equal(
    campaignSchema.safeParse({ ...campaign, recipients: [] }).success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({ ...campaign, messages: [{ text: " " }] })
      .success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({ ...campaign, messages: [] }).success,
    false,
  );
});
test("intervalo mínimo impede loops sem pausa", () => {
  assert.equal(
    campaignSchema.safeParse({ ...campaign, intervalSeconds: 0 }).success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({ ...campaign, pauseEvery: 0 }).success,
    false,
  );
  assert.equal(
    campaignSchema.safeParse({ ...campaign, intervalVarianceSeconds: 8 })
      .success,
    false,
  );
});
test("mensagens individuais não aceitam grupos ou identificadores arbitrários", () => {
  assert.equal(
    sendSchema.safeParse({ chatId: "5551999999999@s.whatsapp.net", text: "Oi" })
      .success,
    true,
  );
  assert.equal(
    sendSchema.safeParse({ chatId: "123@g.us", text: "Oi" }).success,
    false,
  );
  assert.equal(
    sendSchema.safeParse({ chatId: "../../other", text: "Oi" }).success,
    false,
  );
  assert.equal(
    sendSchema.safeParse({ chatId: "5551999999999@s.whatsapp.net", text: "" })
      .success,
    false,
  );
});
test("contato e áudio de voz exigem dados válidos", () => {
  const chatId = "5551999999999@s.whatsapp.net";
  assert.equal(
    sendSchema.safeParse({
      chatId,
      contact: { name: "Ana", phone: "5551999999999" },
    }).success,
    true,
  );
  assert.equal(
    sendSchema.safeParse({ chatId, contact: { name: "Ana", phone: "123" } })
      .success,
    false,
  );
  assert.equal(
    sendSchema.safeParse({
      chatId,
      text: "Oi",
      contact: { name: "Ana", phone: "5551999999999" },
    }).success,
    false,
  );
  assert.equal(
    sendSchema.safeParse({
      chatId,
      attachment: {
        name: "voz",
        mime: "audio/webm",
        data: "AAAA",
        voiceNote: true,
      },
    }).success,
    true,
  );
  assert.equal(
    sendSchema.safeParse({
      chatId,
      attachment: {
        name: "foto",
        mime: "image/png",
        data: "AAAA",
        voiceNote: true,
      },
    }).success,
    false,
  );
  assert.equal(
    sendSchema.safeParse({
      chatId,
      attachment: {
        name: "foto.png",
        mime: "image/png",
        data: "AAAA",
        asDocument: true,
      },
    }).success,
    true,
  );
  assert.equal(
    sendSchema.safeParse({
      chatId,
      attachment: {
        name: "voz",
        mime: "audio/webm",
        data: "AAAA",
        voiceNote: true,
        asDocument: true,
      },
    }).success,
    false,
  );
});
test("lotes são limitados a 500 contatos", () => {
  assert.equal(
    campaignSchema.safeParse({
      ...campaign,
      recipients: Array(501).fill(campaign.recipients[0]),
    }).success,
    false,
  );
});
test("ações de mensagem aceitam somente conversas individuais válidas", () => {
  const chatId = "5551999999999@s.whatsapp.net";
  assert.equal(reactionSchema.safeParse({ chatId, emoji: "❤️" }).success, true);
  assert.equal(forwardSchema.safeParse({ chatId }).success, true);
  assert.equal(
    deleteSchema.safeParse({ chatId, forEveryone: true }).success,
    true,
  );
  assert.equal(
    reactionSchema.safeParse({ chatId: "123@g.us", emoji: "👍" }).success,
    false,
  );
});
