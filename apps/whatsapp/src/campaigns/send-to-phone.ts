import { phoneVariants } from "../messaging/resolve-phone.js";

export async function sendToPhone<T>(
  phone: string,
  lookup: (
    candidate: string,
  ) => Promise<{ exists: boolean; jid: string }[] | undefined>,
  send: (chatId: string) => Promise<T>,
  signal?: AbortSignal,
) {
  const attempted = new Set<string>();
  let lastError: unknown;
  for (const candidate of phoneVariants(phone)) {
    signal?.throwIfAborted();
    try {
      const matches = await lookup(candidate);
      signal?.throwIfAborted();
      const match = matches?.find(
        (item) => item.exists && /^\d+@s\.whatsapp\.net$/.test(item.jid),
      );
      if (!match || attempted.has(match.jid)) continue;
      attempted.add(match.jid);
      const result = await send(match.jid);
      return { result, chatId: match.jid, phone: match.jid.split("@")[0] };
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
    }
  }
  throw (
    lastError ||
    new Error(
      "O telefone cadastrado e suas variantes não foram encontrados no WhatsApp.",
    )
  );
}
