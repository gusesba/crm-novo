import test, { after } from "node:test";
import assert from "node:assert/strict";
import type { ClipboardEvent } from "react";
import type { Attachment } from "../src/lib/types";
import { mergeAttachments, pasteAttachment } from "../src/features/whatsapp/attachment";

const originalReader = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
class ClipboardFileReader {
  result: string | null = null;
  onload?: () => void;
  onerror?: () => void;
  readAsDataURL(file: File) {
    if (file.name === "unreadable.pdf") {
      this.onerror?.();
      return;
    }
    void file.arrayBuffer().then((data) => {
      this.result = `data:${file.type};base64,${Buffer.from(data).toString("base64")}`;
      this.onload?.();
    });
  }
}
Object.defineProperty(globalThis, "FileReader", { configurable: true, value: ClipboardFileReader });
after(() => {
  if (originalReader) Object.defineProperty(globalThis, "FileReader", originalReader);
  else Reflect.deleteProperty(globalThis, "FileReader");
});

function clipboard(files: File[]) {
  let prevented = false;
  return {
    event: { clipboardData: { files }, preventDefault: () => { prevented = true; } } as unknown as ClipboardEvent<HTMLElement>,
    prevented: () => prevented,
  };
}

test("colar texto puro mantém a ação padrão e não altera o anexo", () => {
  const paste = clipboard([]);
  pasteAttachment(paste.event, () => assert.fail("Não deve anexar"), () => assert.fail("Não deve falhar"));
  assert.equal(paste.prevented(), false);
});

test("imagem e documento colados usam o mesmo payload base64 do seletor e bloqueiam texto alternativo", async () => {
  for (const [name, mime] of [["image.png", "image/png"], ["material.pdf", "application/pdf"]]) {
    const paste = clipboard([new File(["arquivo de teste"], name, { type: mime })]);
    const [attachment] = await new Promise<Attachment[]>((resolve, reject) => pasteAttachment(paste.event, resolve, reject));
    assert.equal(paste.prevented(), true);
    assert.deepEqual(attachment, { name, mime, data: Buffer.from("arquivo de teste").toString("base64") });
  }
});

test("vários arquivos são lidos na ordem da colagem e acrescentados aos anteriores", async () => {
  const paste = clipboard([new File(["a"], "a.txt"), new File(["b"], "b.txt")]);
  const files = await new Promise<Attachment[]>((resolve, reject) => pasteAttachment(paste.event, resolve, reject));
  assert.equal(paste.prevented(), true);
  assert.deepEqual(files.map((file) => file.name), ["a.txt", "b.txt"]);
  assert.deepEqual(mergeAttachments([{ name: "old", mime: "text/plain", data: "eA==" }], files).map((file) => file.name), ["old", "a.txt", "b.txt"]);
});

test("arquivo maior que 16 MB e falha de leitura preservam a composição com erro", async () => {
  for (const file of [new File([new Uint8Array(16 * 1024 * 1024 + 1)], "large.pdf"), new File(["x"], "unreadable.pdf")]) {
    const paste = clipboard([file]);
    const error = await new Promise<string>((resolve) => pasteAttachment(paste.event, () => assert.fail("Não deve substituir o anexo"), resolve));
    assert.equal(paste.prevented(), true);
    assert.match(error, /16 MB|ler o arquivo/);
  }
});

test("arquivo sem MIME usa fallback existente, inclusive WebP como figurinha", async () => {
  for (const [name, mime] of [["figurinha.webp", "image/webp"], ["dados.bin", "application/octet-stream"]]) {
    const paste = clipboard([new File(["x"], name)]);
    const [attachment] = await new Promise<Attachment[]>((resolve, reject) => pasteAttachment(paste.event, resolve, reject));
    assert.equal(attachment.mime, mime);
  }
});

test("falha em um arquivo impede anexação parcial e limites incluem anexos anteriores", async () => {
  const paste = clipboard([new File(["a"], "a.txt"), new File(["b"], "unreadable.pdf")]);
  await new Promise<void>((resolve) => pasteAttachment(paste.event, () => assert.fail("Não deve anexar parte do lote"), () => resolve()));
  const file = { name: "a", mime: "text/plain", data: "eA==" };
  assert.throws(() => mergeAttachments(Array(10).fill(file), [file]), /10 anexos/);
  assert.throws(() => mergeAttachments([{ ...file, data: "a".repeat(22_400_000) }], [file]), /16 MB/);
});
