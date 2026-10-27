import {
  downloadMediaMessage,
  normalizeMessageContent,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { connectedSocket } from "../sessions/manager.js";
import { rawMessage } from "../storage/messages.js";
import {
  removeStoredMedia,
  shouldStoreMedia,
  storedMedia,
  storeMedia,
} from "../storage/media-storage.js";

export async function media(user: string, id: string) {
  const message = rawMessage(user, id);
  if (!message)
    throw Object.assign(new Error("Anexo não encontrado."), {
      statusCode: 404,
    });
  const content = normalizeMessageContent(message.message);
  const attachment =
    content?.imageMessage ||
    content?.videoMessage ||
    content?.audioMessage ||
    content?.documentMessage ||
    content?.stickerMessage;
  if (!attachment)
    throw Object.assign(new Error("Mensagem sem anexo."), { statusCode: 400 });
  const cached = storedMedia(user, id);
  if (cached && shouldStoreMedia(cached.createdAt))
    return {
      data: Buffer.from(cached.data).toString("base64"),
      mime: cached.mime,
      name: cached.name,
    };
  if (cached) removeStoredMedia(user, id);
  if (attachment.url === "https://a.whatsapp.net") attachment.url = null;
  const stream = await downloadMediaMessage(
    message,
    "stream",
    { options: { signal: AbortSignal.timeout(30_000) } },
    {
      logger: pino({ level: "silent" }),
      reuploadRequest: connectedSocket(user).updateMediaMessage,
    },
  );
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) {
      stream.destroy();
      throw Object.assign(new Error("Anexo maior que 16 MB."), {
        statusCode: 413,
      });
    }
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const mime = attachment.mimetype || "application/octet-stream";
  const name = (attachment as { fileName?: string }).fileName || "anexo";
  storeMedia(
    user,
    id,
    { data, mime, name },
    Number(message.messageTimestamp || 0) * 1000,
  );
  return { data: data.toString("base64"), mime, name };
}

const pending = new Map<string, { user: string; id: string }>();
const inFlight = new Set<string>();
let active = 0;
let stopping = false;
const logger = pino({ level: "warn" });
export function cacheIncomingMedia(user: string, message: WAMessage) {
  const id = message.key.id;
  const content = normalizeMessageContent(message.message);
  if (
    !id ||
    !(
      content?.imageMessage ||
      content?.videoMessage ||
      content?.audioMessage ||
      content?.documentMessage ||
      content?.stickerMessage
    ) ||
    !shouldStoreMedia(Number(message.messageTimestamp || 0) * 1000) ||
    storedMedia(user, id) ||
    stopping
  )
    return;
  const key = JSON.stringify([user, id]);
  if (inFlight.has(key) || pending.has(key) || pending.size >= 100) return;
  pending.set(key, { user, id });
  setImmediate(drain);
}
function drain() {
  while (!stopping && active < 2 && pending.size) {
    const [key, item] = pending.entries().next().value!;
    pending.delete(key);
    inFlight.add(key);
    active++;
    void media(item.user, item.id)
      .catch(() =>
        logger.warn(
          "Não foi possível arquivar uma mídia recebida; a visualização poderá tentar novamente.",
        ),
      )
      .finally(() => {
        inFlight.delete(key);
        active--;
        drain();
      });
  }
}
export function stopMediaCaching() {
  stopping = true;
  pending.clear();
}
