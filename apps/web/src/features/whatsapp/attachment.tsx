"use client";
import type { Attachment } from "@/lib/types";
import { Paperclip, X } from "lucide-react";
import type { ClipboardEvent } from "react";
export function AttachmentPicker({
  value,
  onChange,
  onError,
  onAdd,
  onReadingChange,
}: {
  value: Attachment[];
  onChange: (files: Attachment[]) => void;
  onAdd: (files: Attachment[]) => void;
  onError: (message: string) => void;
  onReadingChange?: (reading: boolean) => void;
}) {
  return <>
    {value.map((file, index) => <div className="attachment-tag" key={index}>
      <Paperclip size={14} />
      {file.name}
      <button
        type="button"
        aria-label={`Remover anexo ${index + 1}: ${file.name}`}
        onClick={() => onChange(value.filter((_, position) => position !== index))}
      >
        <X size={13} />
      </button>
    </div>)}
    <label className="file-label">
      <Paperclip size={16} />
      Adicionar anexos · até 10 arquivos / 16 MB no total
      <input
        type="file"
        multiple
        onChange={(e) => {
          readAttachments(Array.from(e.target.files || []), onAdd, onError, false, onReadingChange);
          e.target.value = "";
        }}
      />
    </label>
  </>;
}

export function readAttachment(
  file: File | undefined,
  onChange: (file: Attachment) => void,
  onError: (message: string) => void,
  asDocument = false,
) {
  if (!file) return;
  if (file.size > 16 * 1024 * 1024) {
    onError("O anexo deve ter no máximo 16 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () =>
    onChange({
      name: file.name,
      mime:
        file.type ||
        (file.name.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "application/octet-stream"),
      data: String(reader.result).split(",")[1],
      ...(asDocument ? { asDocument: true } : {}),
    });
  reader.onerror = () => onError("Não foi possível ler o arquivo.");
  reader.readAsDataURL(file);
}

export function pasteAttachment(
  event: ClipboardEvent<HTMLElement>,
  onChange: (files: Attachment[]) => void,
  onError: (message: string) => void,
  onReadingChange?: (reading: boolean) => void,
) {
  const files = Array.from(event.clipboardData.files);
  if (!files.length) return;
  event.preventDefault();
  readAttachments(files, onChange, onError, false, onReadingChange);
}

export function messageAttachments(message: { attachment?: Attachment | null; attachments?: Attachment[] | null }): Attachment[] {
  return message.attachments?.length ? message.attachments : message.attachment ? [message.attachment] : [];
}

export function mergeAttachments(current: Attachment[], added: Attachment[]) {
  const files = [...current, ...added];
  if (files.length > 10) throw new Error("Selecione até 10 anexos por mensagem.");
  if (files.reduce((total, file) => total + file.data.length, 0) > 22_400_000)
    throw new Error("Os anexos devem somar no máximo 16 MB.");
  return files;
}

export function readAttachments(
  files: File[],
  onChange: (files: Attachment[]) => void,
  onError: (message: string) => void,
  asDocument = false,
  onReadingChange?: (reading: boolean) => void,
) {
  if (!files.length) return;
  if (files.length > 10 || files.reduce((total, file) => total + file.size, 0) > 16 * 1024 * 1024) {
    onError("Selecione até 10 anexos, somando no máximo 16 MB.");
    return;
  }
  onReadingChange?.(true);
  void Promise.all(files.map((file) => new Promise<Attachment>((resolve, reject) =>
    readAttachment(file, resolve, reject, asDocument),
  ))).then(onChange).catch((error: unknown) => onError(String(error instanceof Error ? error.message : error)))
    .finally(() => onReadingChange?.(false));
}
