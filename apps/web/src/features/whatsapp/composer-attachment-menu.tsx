"use client";
import type { Attachment } from "@/lib/types";
import {
  ContactRound,
  FileText,
  Headphones,
  Image as ImageIcon,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readAttachment } from "./attachment";

export function ComposerAttachmentMenu({
  disabled,
  onFile,
  onContact,
  onError,
}: {
  disabled: boolean;
  onFile: (file: Attachment) => void;
  onContact: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const documents = useRef<HTMLInputElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function choose(input: HTMLInputElement | null) {
    setOpen(false);
    input?.click();
  }

  function selected(input: HTMLInputElement, asDocument = false) {
    readAttachment(input.files?.[0], onFile, onError, asDocument);
    input.value = "";
  }

  return (
    <div
      className="composer-add"
      ref={root}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="composer-add-toggle"
        aria-label="Adicionar à mensagem"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={22} />
      </button>
      {open && (
        <div className="composer-add-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(documents.current)}
          >
            <FileText className="composer-add-document" size={19} /> Documento
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(media.current)}
          >
            <ImageIcon className="composer-add-media" size={19} /> Fotos e
            vídeos
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(audio.current)}
          >
            <Headphones className="composer-add-audio" size={19} /> Áudio
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onContact();
            }}
          >
            <ContactRound className="composer-add-contact" size={19} /> Contato
          </button>
        </div>
      )}
      <input
        ref={documents}
        className="composer-file-input"
        type="file"
        aria-label="Escolher documento"
        onChange={(event) => selected(event.currentTarget, true)}
      />
      <input
        ref={media}
        className="composer-file-input"
        type="file"
        accept="image/png,image/jpeg,image/gif,video/*"
        aria-label="Escolher foto ou vídeo"
        onChange={(event) => selected(event.currentTarget)}
      />
      <input
        ref={audio}
        className="composer-file-input"
        type="file"
        accept="audio/*"
        aria-label="Escolher áudio"
        onChange={(event) => selected(event.currentTarget)}
      />
    </div>
  );
}
