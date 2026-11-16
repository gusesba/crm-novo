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

test("mensagens e disparos aceitam múltiplos anexos sem misturar formato legado e respeitam limites", () => {
  const file = { name: "a.pdf", mime: "application/pdf", data: "YQ==" };
  const chatId = "5551999999999@s.whatsapp.net";
  for (const attachments of [[file, file], Array(10).fill(file)]) {
    assert.equal(sendSchema.safeParse({ chatId, attachments }).success, true);
    assert.equal(campaignSchema.safeParse({ ...campaign, messages: [{ attachments }] }).success, true);
  }
  for (const attachments of [[], Array(11).fill(file), [{ ...file, data: "a".repeat(11_200_001) }, { ...file, data: "b".repeat(11_200_001) }]]) {
    assert.equal(sendSchema.safeParse({ chatId, attachments }).success, false);
    assert.equal(campaignSchema.safeParse({ ...campaign, messages: [{ attachments }] }).success, false);
  }
  assert.equal(sendSchema.safeParse({ chatId, attachment: file, attachments: [file] }).success, false);
  assert.equal(campaignSchema.safeParse({ ...campaign, messages: [{ attachment: file, attachments: [file] }] }).success, false);
  assert.equal(sendSchema.safeParse({ chatId, attachments: [file], contact: { name: "Ana", phone: "5551999999999" } }).success, false);
  assert.equal(sendSchema.safeParse({ chatId, attachments: [{ ...file, voiceNote: true }] }).success, false);
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
test("mensagens aceitam grupos e rejeitam identificadores arbitrários", () => {
  assert.equal(
    sendSchema.safeParse({ chatId: "5551999999999@s.whatsapp.net", text: "Oi" })
      .success,
    true,
  );
  assert.equal(
    sendSchema.safeParse({ chatId: "123@g.us", text: "Oi" }).success,
    true,
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
test("envio e ações aceitam os mesmos IDs de dez a quinze dígitos da agenda", () => {
  for (const phone of ["1234567890", "12166321952", "5551999999999", "123456789012345"]) {
    const chatId = `${phone}@s.whatsapp.net`;
    for (const content of [
      { text: "Oi" },
      { attachment: { name: "a.pdf", mime: "application/pdf", data: "YQ==" } },
      { text: "", attachments: [], contact: { name: "Ana", phone } },
    ]) {
      const input = sendSchema.parse({ chatId, ...content });
      assert.equal(input.chatId, chatId);
      if (input.contact) assert.equal(input.contact.phone, phone);
    }
    assert.equal(reactionSchema.safeParse({ chatId, emoji: "👍" }).success, true);
    assert.equal(forwardSchema.safeParse({ chatId }).success, true);
    assert.equal(deleteSchema.safeParse({ chatId, forEveryone: false }).success, true);
  }
});

test("envio e ações rejeitam IDs fora dos limites e destinos não suportados", () => {
  const invalidIds = [
    "123456789@s.whatsapp.net", "1234567890123456@s.whatsapp.net",
    "abc@g.us", "123--456@g.us", "123@@g.us", "123 @g.us", `${"1".repeat(100)}@g.us`,
    "12166321952@lid", "status@broadcast", "../../other",
    "+12166321952@s.whatsapp.net", "121 66321952@s.whatsapp.net",
  ];
  for (const chatId of invalidIds) {
    assert.equal(sendSchema.safeParse({ chatId, text: "Oi" }).success, false);
    assert.equal(reactionSchema.safeParse({ chatId, emoji: "👍" }).success, false);
    assert.equal(forwardSchema.safeParse({ chatId }).success, false);
    assert.equal(deleteSchema.safeParse({ chatId, forEveryone: true }).success, false);
  }
  for (const phone of ["123456789", "1234567890123456", "+12166321952", "121 66321952"]) {
    assert.equal(sendSchema.safeParse({
      chatId: "12166321952@s.whatsapp.net", contact: { name: "Ana", phone },
    }).success, false);
  }
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
test("ações de mensagem aceitam conversas individuais e grupos válidos", () => {
  const chatId = "5551999999999@s.whatsapp.net";
  assert.equal(reactionSchema.safeParse({ chatId, emoji: "❤️" }).success, true);
  assert.equal(forwardSchema.safeParse({ chatId }).success, true);
  assert.equal(
    deleteSchema.safeParse({ chatId, forEveryone: true }).success,
    true,
  );
  assert.equal(
    reactionSchema.safeParse({ chatId: "123@g.us", emoji: "👍" }).success,
    true,
  );
});

test("grupos atuais e legados aceitam envio e ações, mas continuam fora dos disparos", () => {
  for (const chatId of ["120363123456789012@g.us", "5511999999999-1234567890@g.us"]) {
    for (const content of [
      { text: "Olá, grupo" },
      { attachments: [{ name: "a.pdf", mime: "application/pdf", data: "YQ==" }] },
      { contact: { name: "Ana", phone: "5551999999999" } },
    ]) assert.equal(sendSchema.parse({ chatId, ...content }).chatId, chatId);
    assert.equal(reactionSchema.safeParse({ chatId, emoji: "👍" }).success, true);
    assert.equal(forwardSchema.safeParse({ chatId }).success, true);
    assert.equal(deleteSchema.safeParse({ chatId, forEveryone: true }).success, true);
    assert.equal(campaignSchema.safeParse({ ...campaign, recipients: [{ leadId: 1, phone: chatId, name: "Grupo" }] }).success, false);
  }
});
