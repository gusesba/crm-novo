import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError, clearCsrf, downloadFile, post } from "../src/lib/api";

test("downloadFile saves the binary response and releases the temporary URL", async (t) => {
  const controller = new AbortController();
  const bytes = new Uint8Array([80, 75, 3, 4]);
  let downloaded: Blob | undefined;
  const events: string[] = [];
  const link = {
    href: "", download: "",
    click() { events.push("click"); },
    remove() { events.push("remove"); },
  };
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/leads/export?sales=true&serviceId=2");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal, controller.signal);
    return new Response(bytes);
  });
  t.mock.method(URL, "createObjectURL", (blob: Blob) => { downloaded = blob; return "blob:export"; });
  t.mock.method(URL, "revokeObjectURL", (url: string) => { assert.equal(url, "blob:export"); events.push("revoke"); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement(tag: string) { assert.equal(tag, "a"); return link; },
    body: { appendChild(element: unknown) { assert.equal(element, link); events.push("append"); } },
  } });
  t.after(() => { Reflect.deleteProperty(globalThis, "document"); });

  await downloadFile("/leads/export?sales=true&serviceId=2", "vendas.xlsx", controller.signal);
  assert.equal(link.href, "blob:export");
  assert.equal(link.download, "vendas.xlsx");
  assert.deepEqual(new Uint8Array(await downloaded!.arrayBuffer()), bytes);
  assert.deepEqual(events, ["append", "click", "remove"]);
  t.mock.timers.tick(1000);
  assert.deepEqual(events, ["append", "click", "remove", "revoke"]);
});

test("download errors preserve API feedback and redirect expired sessions", async (t) => {
  const redirects: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { assign(path: string) { redirects.push(path); } },
  } });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); });
  t.mock.method(globalThis, "fetch", async () => Response.json({ title: "Sessão expirada" }, { status: 401 }));
  await assert.rejects(downloadFile("/leads/export", "leads.xlsx"), (e: unknown) =>
    e instanceof ApiError && e.status === 401 && e.message === "Sessão expirada");
  assert.deepEqual(redirects, ["/login"]);
  t.mock.method(globalThis, "fetch", async () => Response.json({ errors: { serviceId: ["Serviço inválido"] } }, { status: 400 }));
  await assert.rejects(downloadFile("/leads/export?serviceId=abc", "leads.xlsx"), /Serviço inválido/);
});

test("cancelled exports do not start a download", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => {
    controller.abort();
    return new Response("cancelled");
  });
  const createUrl = t.mock.method(URL, "createObjectURL");
  await downloadFile("/leads/export", "leads.xlsx", controller.signal);
  assert.equal(createUrl.mock.callCount(), 0);
});

test("JSON requests still handle CSRF and no-content responses", async (t) => {
  clearCsrf();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    if (url === "/api/auth/csrf") return Response.json({ token: "test-csrf" });
    if (url === "/api/leads") {
      assert.equal(new Headers(options.headers).get("X-CSRF-TOKEN"), "test-csrf");
      assert.equal(new Headers(options.headers).get("Content-Type"), "application/json");
      return Response.json({ id: 42 });
    }
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(await post("/leads", { name: "Teste" }), { id: 42 });
  assert.equal(await api("/leads/42", { method: "DELETE" }), undefined);
  assert.equal(calls, 3);
  clearCsrf();
});
