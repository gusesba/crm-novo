import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { whatsappAccountPath } from "../src/lib/whatsapp-account";
import { WhatsAppAccountContext, useWhatsAppApi } from "../src/features/whatsapp/account-context";

test("seleção da conta mantém query de histórico, paginação e CSRF fora do escopo WhatsApp", () => {
  assert.equal(whatsappAccountPath("/whatsapp/messages?userId=2&before=100", "comercial"), "/whatsapp/messages?userId=2&before=100&accountId=comercial");
  assert.equal(whatsappAccountPath("/whatsapp/send", "a b"), "/whatsapp/send?accountId=a%20b");
  assert.equal(whatsappAccountPath("/whatsapp/send", "default"), "/whatsapp/send");
  for (const path of ["/auth/csrf", "/leads?mine=true", "/classifications"])
    assert.equal(whatsappAccountPath(path, "comercial"), path);
});

test("clientes de duas contas capturam seus próprios caminhos sem seleção global mutável", async () => {
  const clients: ReturnType<typeof useWhatsAppApi>[] = [];
  function Capture() {
    clients.push(useWhatsAppApi());
    return null;
  }
  for (const accountId of ["default", "comercial", "pessoal"])
    renderToStaticMarkup(createElement(WhatsAppAccountContext.Provider, { value: { accountId, userId: "" } }, createElement(Capture)));
  const previous = globalThis.fetch;
  const calls: { path: string; method?: string; body?: BodyInit | null }[] = [];
  globalThis.fetch = async (input, options) => {
    calls.push({ path: String(input), method: options?.method, body: options?.body });
    return new Response(JSON.stringify(String(input).includes("csrf") ? { token: "test-token" } : {}));
  };
  try {
    await Promise.all(clients.map((client) => client.post("/whatsapp/send", { chatId: "same-chat", text: "Olá" })));
    await clients[1].put("/whatsapp/chats/read", { chatId: "same-chat", lastMessageId: "message" });
    await clients[2].api("/whatsapp/media/message?userId=2");
    await clients[0].api("/whatsapp/stickers");
    const sends = calls.filter((call) => call.method === "POST");
    assert.deepEqual(sends.map((call) => call.path), ["/api/whatsapp/send", "/api/whatsapp/send?accountId=comercial", "/api/whatsapp/send?accountId=pessoal"]);
    assert.equal(calls.at(-3)?.path, "/api/whatsapp/chats/read?accountId=comercial");
    assert.equal(calls.at(-2)?.path, "/api/whatsapp/media/message?userId=2&accountId=pessoal");
    assert.equal(calls.at(-1)?.path, "/api/whatsapp/stickers");
  } finally {
    globalThis.fetch = previous;
  }
});
