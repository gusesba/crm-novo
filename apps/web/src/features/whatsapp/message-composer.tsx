"use client";
import { ErrorBox } from "@/components/ui";
import { post, put } from "@/lib/api";
import type { Attachment, Chat, Message, SharedContact } from "@/lib/types";
import { ContactRound, Paperclip, Send, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ComposerAttachmentMenu } from "./composer-attachment-menu";
import { ContactPicker } from "./contact-picker";
import { VoiceRecorder } from "./voice-recorder";
export function MessageComposer({
  chatId,
  chats,
  reply,
  editing,
  clearSelection,
  onSent,
}: {
  chatId: string;
  chats: Chat[];
  reply?: Message;
  editing?: Message;
  clearSelection: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState(editing?.text || "");
  const [attachment, setAttachment] = useState<Attachment>();
  const [contact, setContact] = useState<SharedContact>();
  const [choosingContact, setChoosingContact] = useState(false);
  const [recording, setRecording] = useState(false);
  const isSticker = attachment?.mime === "image/webp" && !attachment.asDocument;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (recording || (!text.trim() && !attachment && !contact)) return;
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
          contact,
          replyTo: reply?.id,
        });
      setText("");
      setAttachment(undefined);
      setContact(undefined);
      clearSelection();
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
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
        {!editing && (attachment || contact) && (
          <div className="composer-options">
            {attachment && (
              <div className="attachment-tag">
                <Paperclip size={14} />
                {attachment.name}
                <button
                  type="button"
                  aria-label="Remover anexo"
                  onClick={() => setAttachment(undefined)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {contact && (
              <div className="attachment-tag">
                <ContactRound size={14} />
                {contact.name} · {contact.phone}
                <button
                  type="button"
                  aria-label="Remover contato"
                  onClick={() => setContact(undefined)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {attachment?.voiceNote && (
              <audio
                className="voice-preview"
                controls
                src={`data:${attachment.mime};base64,${attachment.data}`}
              />
            )}
          </div>
        )}
        <div className="composer-input">
          {!editing && (
            <ComposerAttachmentMenu
              disabled={busy || recording}
              onError={setError}
              onContact={() => setChoosingContact(true)}
              onFile={(file) => {
                setAttachment(file);
                setContact(undefined);
                if (file.mime === "image/webp" && !file.asDocument) setText("");
              }}
            />
          )}
          {!editing &&
            (recording || (!attachment && !contact && !text.trim())) && (
              <VoiceRecorder
                disabled={busy}
                compact
                onError={setError}
                onRecordingChange={setRecording}
                onRecorded={(file) => {
                  setAttachment(file);
                  setText("");
                }}
              />
            )}
          {!recording && (
            <textarea
              aria-label="Mensagem"
              placeholder={
                contact
                  ? "Contato será enviado sem texto"
                  : isSticker
                    ? "Figurinhas são enviadas sem texto"
                    : "Escreva sua mensagem…"
              }
              rows={1}
              maxLength={10000}
              value={text}
              disabled={isSticker || !!contact || recording}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (
                    !busy &&
                    !recording &&
                    (text.trim() || attachment || contact)
                  )
                    e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          )}
          <button
            className="button primary"
            disabled={
              busy || recording || (!text.trim() && !attachment && !contact)
            }
            aria-label={editing ? "Salvar edição" : "Enviar mensagem"}
          >
            <Send size={17} />
            {busy ? "…" : editing ? "Salvar" : "Enviar"}
          </button>
        </div>
      </form>
      {choosingContact && (
        <ContactPicker
          chats={chats}
          onClose={() => setChoosingContact(false)}
          onSelect={(selected) => {
            setContact(selected);
            setAttachment(undefined);
            setText("");
            setChoosingContact(false);
          }}
        />
      )}
    </>
  );
}
