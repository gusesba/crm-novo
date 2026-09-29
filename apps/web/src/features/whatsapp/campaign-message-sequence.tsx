"use client";
import type { Attachment } from "@/lib/types";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { AttachmentPicker } from "./attachment";

export interface CampaignMessageDraft {
  id: string;
  text: string;
  attachment?: Attachment;
}

export function CampaignMessageSequence({
  messages,
  onChange,
  onError,
}: {
  messages: CampaignMessageDraft[];
  onChange: (messages: CampaignMessageDraft[]) => void;
  onError: (message: string) => void;
}) {
  function update(id: string, values: Partial<CampaignMessageDraft>) {
    onChange(
      messages.map((message) =>
        message.id === id ? { ...message, ...values } : message,
      ),
    );
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= messages.length) return;
    const reordered = [...messages];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    onChange(reordered);
  }

  function add() {
    if (messages.length >= 10) return;
    onChange([
      ...messages,
      { id: crypto.randomUUID(), text: "", attachment: undefined },
    ]);
  }

  function updateAttachment(id: string, attachment?: Attachment) {
    const encodedSize = messages.reduce(
      (total, message) =>
        total +
        (message.id === id
          ? attachment?.data.length || 0
          : message.attachment?.data.length || 0),
      0,
    );
    if (encodedSize > 22_400_000) {
      onError("Os anexos da sequência devem somar no máximo 16 MB.");
      return;
    }
    update(id, {
      attachment,
      ...(attachment?.mime === "image/webp" ? { text: "" } : {}),
    });
  }

  return (
    <div className="campaign-sequence">
      <div className="campaign-sequence-heading">
        <div>
          <strong>Sequência de mensagens</strong>
          <p>Envie até 10 mensagens na ordem abaixo.</p>
        </div>
        <span>{messages.length}/10</span>
      </div>
      <div className="campaign-message-list">
        {messages.map((message, index) => (
          <div className="campaign-message-editor" key={message.id}>
            <div className="campaign-message-editor-heading">
              <strong>Mensagem {index + 1}</strong>
              <div>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Mover mensagem ${index + 1} para cima`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === messages.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Mover mensagem ${index + 1} para baixo`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  disabled={messages.length === 1}
                  onClick={() =>
                    onChange(messages.filter((item) => item.id !== message.id))
                  }
                  aria-label={`Remover mensagem ${index + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <textarea
              aria-label={`Texto da mensagem ${index + 1}`}
              rows={3}
              maxLength={10000}
              value={message.text}
              disabled={message.attachment?.mime === "image/webp"}
              onChange={(event) =>
                update(message.id, { text: event.target.value })
              }
              placeholder={
                message.attachment?.mime === "image/webp"
                  ? "Figurinhas são enviadas sem texto"
                  : index === 0
                    ? "Olá, {{nome}}!"
                    : "Continue a conversa com a próxima informação…"
              }
            />
            <AttachmentPicker
              value={message.attachment}
              onChange={(attachment) =>
                updateAttachment(message.id, attachment)
              }
              onError={onError}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button secondary campaign-add-message"
        disabled={messages.length >= 10}
        onClick={add}
      >
        <Plus size={15} />
        Adicionar mensagem
      </button>
      <CampaignPreview messages={messages} />
    </div>
  );
}

function CampaignPreview({ messages }: { messages: CampaignMessageDraft[] }) {
  const visible = messages.filter(
    (message) => message.text.trim() || message.attachment,
  );
  return (
    <section className="campaign-preview" aria-label="Preview do disparo">
      <div className="campaign-preview-heading">
        <div>
          <strong>Preview do envio</strong>
          <p>Exemplo para o contato Mariana Almeida</p>
        </div>
        <span>WhatsApp</span>
      </div>
      <div className="campaign-preview-chat">
        {!visible.length ? (
          <p className="campaign-preview-empty">
            Escreva ou anexe algo para visualizar a sequência.
          </p>
        ) : (
          visible.map((message) => (
            <div
              className={`campaign-preview-bubble ${message.attachment?.mime === "image/webp" ? "sticker" : ""}`}
              key={message.id}
            >
              {message.attachment && (
                <CampaignAttachmentPreview attachment={message.attachment} />
              )}
              {message.text.trim() &&
                message.attachment?.mime !== "image/webp" && (
                  <p>
                    {message.text.replaceAll("{{nome}}", "Mariana Almeida")}
                  </p>
                )}
              <small>agora</small>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CampaignAttachmentPreview({ attachment }: { attachment: Attachment }) {
  const source = `data:${attachment.mime};base64,${attachment.data}`;
  if (attachment.mime === "image/webp")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="campaign-preview-sticker" src={source} alt="Figurinha" />
    );
  if (attachment.mime.startsWith("image/"))
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="campaign-preview-image"
        src={source}
        alt={attachment.name}
      />
    );
  if (attachment.mime === "application/pdf")
    return (
      <div className="campaign-preview-pdf">
        <iframe
          src={`${source}#page=1&toolbar=0&navpanes=0&scrollbar=0`}
          title={`Prévia de ${attachment.name}`}
        />
        <div>
          <FileText size={16} />
          <span>{attachment.name}</span>
        </div>
      </div>
    );
  return (
    <div className="campaign-preview-attachment">
      {attachment.mime.startsWith("image/") ? (
        <ImageIcon size={15} />
      ) : (
        <FileText size={15} />
      )}
      <span>{attachment.name}</span>
    </div>
  );
}
