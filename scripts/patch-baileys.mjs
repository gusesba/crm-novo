import { readFileSync, writeFileSync } from "node:fs";

// Compatibilidade da versão fixada: preservar a chave de mensagens de outros dispositivos
// e não contabilizar envelopes de edição como novas mensagens recebidas.
const root = new URL("../node_modules/@whiskeysockets/baileys/", import.meta.url);
const version = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version;
if (version !== "7.0.0-rc14") throw new Error("Revise os patches de edição ao atualizar o Baileys.");
const patches = [
  ["lib/Utils/decode-wa-message.js", "msg = msg.deviceSentMessage?.message || msg;", `if (msg.deviceSentMessage?.message) {
                            const inner = msg.deviceSentMessage.message;
                            const outer = { ...msg };
                            delete outer.deviceSentMessage;
                            msg = { ...outer, ...inner, messageContextInfo: { ...outer.messageContextInfo, ...inner.messageContextInfo } };
                        } // crm-preserve-device-message-secret`],
  ["lib/Utils/process-message.js", "!normalizedContent?.pollUpdateMessage);", `!normalizedContent?.pollUpdateMessage &&
        normalizedContent?.secretEncryptedMessage?.secretEncType !== proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT); // crm-ignore-edit-unread`],
];
for (const [path, before, after] of patches) {
  const file = new URL(path, root);
  const source = readFileSync(file, "utf8");
  if (source.includes(after)) continue;
  if (source.split(before).length !== 2) throw new Error(`Não foi possível aplicar o patch em ${path}.`);
  writeFileSync(file, source.replace(before, after));
}
