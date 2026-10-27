"use client";
import { useWhatsAppApi } from "./account-context";
import { ErrorBox } from "@/components/ui";
import type { Attachment, Chat, Message, SharedContact } from "@/lib/types";
import { ContactRound, Paperclip, Send, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { ComposerAttachmentMenu } from "./composer-attachment-menu";
import { ComposerEmojiPicker } from "./composer-emoji-picker";
import { ContactPicker } from "./contact-picker";
import { VoiceRecorder } from "./voice-recorder";
import { mergeAttachments, pasteAttachment } from "./attachment";
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
  const { post, put } = useWhatsAppApi();
  const [text, setText] = useState(editing?.text || "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const latestAttachments = useRef(attachments);
  latestAttachments.current = attachments;
  const [readingFiles, setReadingFiles] = useState(0);
  const onReadingChange = (reading: boolean) => setReadingFiles((count) => count + (reading ? 1 : -1));
  const [contact, setContact] = useState<SharedContact>();
  const [choosingContact, setChoosingContact] = useState(false);
  const [recording, setRecording] = useState(false);
  const isSticker = attachments.length === 1 && attachments[0].mime === "image/webp" && !attachments[0].asDocument;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  function selectAttachments(files: Attachment[]) {
    try {
      const next = mergeAttachments(latestAttachments.current, files);
      latestAttachments.current = next;
      setAttachments(next);
      setContact(undefined);
      if (next.length === 1 && next[0].mime === "image/webp" && !next[0].asDocument) setText("");
    } catch (error) { setError((error as Error).message); }
  }
  function insertEmoji(emoji: string) {
    const input = textarea.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (text.length - (end - start) + emoji.length > input.maxLength) return;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || readingFiles || recording || (!text.trim() && !attachments.length && !contact)) return;
    setBusy(true);
    setError("");
    try {
      if (editing)
        await put(`/whatsapp/messages/${editing.id}`, { chatId, text });
      else {
        const result = await post<{ sent: boolean; sentAttachments?: number; textSent?: boolean; error?: string }>("/whatsapp/send", {
          chatId,
          text,
          attachments,
          contact,
          replyTo: reply?.id,
        });
        if (result.sent === false) {
          setAttachments(attachments.slice(result.sentAttachments || 0));
          if (result.textSent) setText("");
          if (result.sentAttachments) clearSelection();
          onSent();
          setError(result.error || "Parte dos anexos foi enviada. Confira o histórico antes de continuar.");
          return;
        }
      }
      setText("");
      setAttachments([]);
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
      <form
        className="composer"
        onSubmit={send}
        onPaste={(event) => {
          if (!editing && !busy && !recording)
            pasteAttachment(event, selectAttachments, setError, onReadingChange);
        }}
      >
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
        {!editing && (!!attachments.length || contact) && (
          <div className="composer-options">
            {attachments.map((attachment, index) => (
              <div className="attachment-tag" key={index}>
                <Paperclip size={14} />
                {attachment.name}
                <button
                  type="button"
                  aria-label={`Remover anexo ${index + 1}: ${attachment.name}`}
                  disabled={busy}
                  onClick={() => setAttachments((files) => files.filter((_, position) => position !== index))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {contact && (
              <div className="attachment-tag">
                <ContactRound size={14} />
                {contact.name} · {contact.phone}
                <button
                  type="button"
                  aria-label="Remover contato"
                  disabled={busy}
                  onClick={() => setContact(undefined)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {attachments.map((attachment, index) => attachment.voiceNote && (
              <audio
                className="voice-preview"
                key={index}
                controls
                src={`data:${attachment.mime};base64,${attachment.data}`}
              />
            ))}
            {attachments.map((attachment, index) => attachment.mime.startsWith("image/") && !attachment.asDocument && (
              <img
                className="composer-sticker-preview"
                key={index}
                src={`data:${attachment.mime};base64,${attachment.data}`}
                alt={`Prévia de ${attachment.name}`}
              />
            ))}
          </div>
        )}
        <div className="composer-input">
          {!editing && (
            <ComposerAttachmentMenu
              disabled={busy || recording}
              onError={setError}
              onContact={() => setChoosingContact(true)}
              onFile={selectAttachments}
              onReadingChange={onReadingChange}
            />
          )}
          <ComposerEmojiPicker
            disabled={busy || recording || isSticker || !!contact}
            onSelect={insertEmoji}
            allowSticker={!editing}
            onError={setError}
            onStickerSelect={(file) => {
              selectAttachments([file]);
            }}
          />
          {!editing &&
            (recording || (!attachments.length && !contact && !text.trim())) && (
              <VoiceRecorder
                disabled={busy}
                compact
                onError={setError}
                onRecordingChange={setRecording}
                onRecorded={(file) => {
                  setAttachments([file]);
                  setText("");
                }}
              />
            )}
          {!recording && (
            <textarea
              ref={textarea}
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
              disabled={busy || isSticker || !!contact || recording}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (
                    !busy &&
                    !recording &&
                    (text.trim() || attachments.length || contact)
                  )
                    e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          )}
          <button
            className="button primary"
            disabled={
              busy || !!readingFiles || recording || (!text.trim() && !attachments.length && !contact)
            }
            aria-label={editing ? "Salvar edição" : "Enviar mensagem"}
          >
            <Send size={17} />
            {busy ? "…" : readingFiles ? "Lendo anexos…" : editing ? "Salvar" : "Enviar"}
          </button>
        </div>
      </form>
      {choosingContact && (
        <ContactPicker
          chats={chats}
          onClose={() => setChoosingContact(false)}
          onSelect={(selected) => {
            setContact(selected);
            setAttachments([]);
            setText("");
            setChoosingContact(false);
          }}
        />
      )}
    </>
  );
}
