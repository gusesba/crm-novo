import type { Message } from "@/lib/types";
import { Ban, Camera, FileText, MapPin, Mic, Sticker, UserRound, Video } from "lucide-react";
import { FormattedMessage } from "./formatted-message";

export function MessageReply({ reply, onNavigate }: { reply: NonNullable<Message["reply"]>; onNavigate?: () => void }) {
  const Icon = { image: Camera, video: Video, audio: Mic, document: FileText, sticker: Sticker, contact: UserRound, location: MapPin, deleted: Ban }[reply.kind];
  const content = <>
    <span className="message-reply-content">
      <strong>{reply.mine ? "Você" : reply.author}</strong>
      <span className="message-reply-text">
        {Icon && <Icon size={14} aria-hidden="true" />}
        <span><FormattedMessage text={reply.text} /></span>
      </span>
    </span>
    {reply.thumbnail && <img src={`data:image/jpeg;base64,${reply.thumbnail}`} alt="Miniatura da mensagem citada" />}
  </>;
  return onNavigate ? (
    <button type="button" className="message-reply" aria-label={`Ir para mensagem de ${reply.mine ? "você" : reply.author}`} onClick={onNavigate}>{content}</button>
  ) : (
    <blockquote className="message-reply" aria-label="Mensagem citada">{content}</blockquote>
  );
}
