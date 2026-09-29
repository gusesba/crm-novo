"use client";
import type { Attachment } from "@/lib/types";
import { Paperclip, X } from "lucide-react";
export function AttachmentPicker({
  value,
  onChange,
  onError,
}: {
  value?: Attachment;
  onChange: (file?: Attachment) => void;
  onError: (message: string) => void;
}) {
  async function read(file?: File) {
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
      });
    reader.onerror = () => onError("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }
  return value ? (
    <div className="attachment-tag">
      <Paperclip size={14} />
      {value.name}
      <button
        type="button"
        aria-label="Remover anexo"
        onClick={() => onChange(undefined)}
      >
        <X size={13} />
      </button>
    </div>
  ) : (
    <label className="file-label">
      <Paperclip size={16} />
      Adicionar anexo · até 16 MB
      <input type="file" onChange={(e) => void read(e.target.files?.[0])} />
    </label>
  );
}
