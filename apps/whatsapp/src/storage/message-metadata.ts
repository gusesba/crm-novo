import { normalizeMessageContent, type proto, type WAMessage } from "@whiskeysockets/baileys";

export type StoredMessage = WAMessage & { crmMetadata?: { edited?: boolean; forwarded?: boolean; editedAt?: number } };

export function preserveMessageSecret(message: proto.IMessage, previous?: proto.IMessage | null): proto.IMessage {
  const secret = message.messageContextInfo?.messageSecret || normalizeMessageContent(message)?.messageContextInfo?.messageSecret ||
    previous?.messageContextInfo?.messageSecret || normalizeMessageContent(previous)?.messageContextInfo?.messageSecret;
  return secret ? { ...message, messageContextInfo: { ...message.messageContextInfo, messageSecret: secret } } : message;
}

export function messageContext(message?: proto.IMessage | null): proto.IContextInfo | undefined {
  const content = normalizeMessageContent(message);
  return Object.values(content || {}).find((part) => part && typeof part === "object" && "contextInfo" in part && part.contextInfo)?.contextInfo;
}

export function messageMetadata(message: WAMessage) {
  const saved = (message as StoredMessage).crmMetadata;
  let edited = saved?.edited === true;
  let content = message.message;
  for (let depth = 0; content && depth < 6; depth++) {
    if (content.editedMessage?.message) { edited = true; break; }
    content = (content.ephemeralMessage || content.viewOnceMessage || content.documentWithCaptionMessage ||
      content.viewOnceMessageV2 || content.viewOnceMessageV2Extension || content.associatedChildMessage ||
      content.groupStatusMessage || content.groupStatusMessageV2)?.message;
  }
  const context = messageContext(message.message);
  const score = context?.forwardingScore;
  const forwarded = saved?.forwarded === true || context?.isForwarded === true ||
    (typeof score === "number" && Number.isSafeInteger(score) && score > 0);
  return { edited, forwarded };
}
