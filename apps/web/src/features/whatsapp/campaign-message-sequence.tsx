"use client";
import type { Attachment } from "@/lib/types";
import { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { AttachmentPicker, mergeAttachments, messageAttachments, pasteAttachment } from "./attachment";
import { FormattedMessage } from "./formatted-message";

export interface CampaignMessageDraft {
  id: string;
  text: string;
  attachment?: Attachment;
  attachments?: Attachment[];
}

function isSticker(message: CampaignMessageDraft) {
  const files = messageAttachments(message);
  return files.length === 1 && files[0].mime === "image/webp";
}

export function CampaignMessageSequence({
  messages,
  onChange,
  onError,
  onReadingChange,
}: {
  messages: CampaignMessageDraft[];
  onChange: (messages: CampaignMessageDraft[]) => void;
  onError: (message: string) => void;
  onReadingChange?: (reading: boolean) => void;
}) {
  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const latestMessages = useRef(messages);
  latestMessages.current = messages;

  function update(id: string, values: Partial<CampaignMessageDraft>) {
    latestMessages.current = latestMessages.current.map((message) =>
      message.id === id ? { ...message, ...values } : message,
    );
    onChange(latestMessages.current);
  }

  function insertToken(message: CampaignMessageDraft, token: string) {
    const textarea = textareas.current.get(message.id);
    if (!textarea || textarea.disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = message.text.slice(0, start) + token + message.text.slice(end);
    if (text.length > 10000) {
      onError("O texto da mensagem deve ter no máximo 10.000 caracteres.");
      return;
    }
    update(message.id, { text });
    requestAnimationFrame(() => {
      if (!textarea.isConnected) return;
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
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

  function updateAttachments(id: string, files: Attachment[], append = false) {
    const current = latestMessages.current.find((message) => message.id === id);
    if (!current) return;
    let attachments: Attachment[];
    try { attachments = mergeAttachments(append ? messageAttachments(current) : [], files); }
    catch (error) { onError((error as Error).message); return; }
    const encodedSize = latestMessages.current.reduce(
      (total, message) =>
        total +
        (message.id === id
          ? attachments.reduce((sum, file) => sum + file.data.length, 0)
          : messageAttachments(message).reduce((sum, file) => sum + file.data.length, 0)),
      0,
    );
    if (encodedSize > 22_400_000) {
      onError("Os anexos da sequência devem somar no máximo 16 MB.");
      return;
    }
    update(id, {
      attachment: undefined,
      attachments,
      ...(attachments.length === 1 && attachments[0].mime === "image/webp" ? { text: "" } : {}),
    });
  }

  return (
    <div className="campaign-sequence">
      <div className="campaign-sequence-heading">
        <div>
          <strong>Sequência de mensagens</strong>
          <p>Envie até 10 mensagens na ordem abaixo.</p>
          <p>Use <code>{"${PrimeiroNome}"}</code> para o primeiro nome ou <code>{"${nome}"}</code> para o nome completo. <code>{"{{nome}}"}</code> também continua válido.</p>
        </div>
        <span>{messages.length}/10</span>
      </div>
      <div className="campaign-message-list">
        {messages.map((message, index) => (
          <div
            className="campaign-message-editor"
            key={message.id}
            onPaste={(event) => pasteAttachment(event, (files) => updateAttachments(message.id, files, true), onError, onReadingChange)}
          >
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
              ref={(element) => {
                if (element) textareas.current.set(message.id, element);
                else textareas.current.delete(message.id);
              }}
              aria-label={`Texto da mensagem ${index + 1}`}
              rows={3}
              maxLength={10000}
              value={message.text}
              disabled={isSticker(message)}
              onChange={(event) =>
                update(message.id, { text: event.target.value })
              }
              placeholder={
                isSticker(message)
                  ? "Figurinhas são enviadas sem texto"
                  : index === 0
                    ? "Olá, ${PrimeiroNome}!"
                    : "Continue a conversa com a próxima informação…"
              }
            />
            <div className="campaign-personalization" role="group" aria-label={`Personalizar mensagem ${index + 1}`}>
              <span>Inserir:</span>
              {[
                { token: "${PrimeiroNome}", label: "primeiro nome" },
                { token: "${nome}", label: "nome completo" },
              ].map(({ token, label }) => (
                <button
                  key={token}
                  type="button"
                  disabled={isSticker(message)}
                  aria-label={`Inserir ${label} na mensagem ${index + 1}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertToken(message, token)}
                >
                  {token}
                </button>
              ))}
            </div>
            <AttachmentPicker
              value={messageAttachments(message)}
              onChange={(files) => updateAttachments(message.id, files)}
              onAdd={(files) => updateAttachments(message.id, files, true)}
              onError={onError}
              onReadingChange={onReadingChange}
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
    (message) => message.text.trim() || messageAttachments(message).length,
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
              className={`campaign-preview-bubble ${isSticker(message) ? "sticker" : ""}`}
              key={message.id}
            >
              {messageAttachments(message).map((attachment, index) => (
                <CampaignAttachmentPreview key={index} attachment={attachment} />
              ))}
              {message.text.trim() &&
                !isSticker(message) && (
                  <p>
                    <FormattedMessage text={message.text.replaceAll("${PrimeiroNome}", "Mariana").replaceAll("${nome}", "Mariana Almeida").replaceAll("{{nome}}", "Mariana Almeida")} />
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

export function CampaignAttachmentPreview({ attachment }: { attachment: Attachment }) {
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
