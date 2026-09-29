"use client";
import { ErrorBox } from "@/components/ui";
import { post, put } from "@/lib/api";
import type { Attachment, Message } from "@/lib/types";
import { Send, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AttachmentPicker } from "./attachment";
export function MessageComposer({
  chatId,
  reply,
  editing,
  clearSelection,
  onSent,
}: {
  chatId: string;
  reply?: Message;
  editing?: Message;
  clearSelection: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState(editing?.text || "");
  const [attachment, setAttachment] = useState<Attachment>();
  const isSticker = attachment?.mime === "image/webp";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() && !attachment) return;
    setBusy(true);
    setError("");
    try {
      if (editing)
        await put(`/whatsapp/messages/${editing.id}`, { chatId, text });
      else
        await post("/whatsapp/send", {
          chatId,
          text,
          attachment,
          replyTo: reply?.id,
        });
      setText("");
      setAttachment(undefined);
      clearSelection();
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="composer" onSubmit={send}>
      {error && <ErrorBox message={error} />}{" "}
      {(reply || editing) && (
        <div className="reply-banner">
          <span>
            {editing
              ? "Editando mensagem"
              : `Respondendo: ${reply?.text.slice(0, 80)}`}
          </span>
          <button
            type="button"
            aria-label="Cancelar seleção"
            onClick={clearSelection}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!editing && (
        <AttachmentPicker
          value={attachment}
          onChange={(file) => {
            setAttachment(file);
            if (file?.mime === "image/webp") setText("");
          }}
          onError={setError}
        />
      )}
      <div className="composer-input">
        <textarea
          aria-label="Mensagem"
          placeholder={
            isSticker
              ? "Figurinhas são enviadas sem texto"
              : "Escreva sua mensagem…"
          }
          rows={1}
          maxLength={10000}
          value={text}
          disabled={isSticker}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!busy && (text.trim() || attachment))
                e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="button primary"
          disabled={busy || (!text.trim() && !attachment)}
          aria-label={editing ? "Salvar edição" : "Enviar mensagem"}
        >
          <Send size={17} />
          {busy ? "…" : editing ? "Salvar" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
