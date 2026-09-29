"use client";

import { api } from "@/lib/api";
import type { Message } from "@/lib/types";
import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type LoadedMedia = { url: string; name: string; mime: string };

export function MessageAttachment({
  message,
  userId,
  onError,
}: {
  message: Message;
  userId?: string;
  onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const attempted = useRef(false);
  const [visible, setVisible] = useState(false);
  const [media, setMedia] = useState<LoadedMedia>();
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const attachment = message.attachment;
  const isPdf = attachment?.mime === "application/pdf";
  const hasPreview =
    message.kind === "image" ||
    message.kind === "sticker" ||
    message.kind === "video" ||
    message.kind === "audio";

  useEffect(() => {
    if (!hasPreview || !host.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        root: host.current.closest(".message-list"),
        rootMargin: "300px",
      },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [hasPreview]);

  useEffect(() => {
    if (!visible || media || loading || attempted.current) return;
    attempted.current = true;
    let active = true;
    setLoading(true);
    loadMedia(message.id, userId)
      .then((loaded) => {
        if (active) setMedia(loaded);
        else URL.revokeObjectURL(loaded.url);
      })
      .catch((cause) => active && setPreviewError((cause as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [media, message.id, retryKey, userId, visible]);

  useEffect(
    () => () => {
      if (media) URL.revokeObjectURL(media.url);
    },
    [media],
  );

  if (!attachment) return null;

  async function download() {
    try {
      const loaded = media || (await loadMedia(message.id, userId));
      const link = document.createElement("a");
      link.href = loaded.url;
      link.download = loaded.name;
      link.click();
      if (!media) setTimeout(() => URL.revokeObjectURL(loaded.url), 1000);
    } catch (cause) {
      onError((cause as Error).message);
    }
  }

  async function openExpanded() {
    if (media) {
      setExpanded(true);
      return;
    }
    setLoading(true);
    try {
      const loaded = await loadMedia(message.id, userId);
      setMedia(loaded);
      setExpanded(true);
    } catch (cause) {
      onError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={host} className={`message-attachment ${message.kind}`}>
      {loading && (
        <div className="message-media-loading">
          <LoaderCircle size={20} />
          Carregando prévia…
        </div>
      )}
      {previewError && !loading && (
        <button
          type="button"
          className="message-media-error"
          onClick={() => {
            attempted.current = false;
            setPreviewError("");
            setRetryKey((value) => value + 1);
          }}
        >
          Não foi possível carregar a miniatura. Tentar novamente
        </button>
      )}
      {media && message.kind === "image" && (
        <button
          type="button"
          className="message-image-preview"
          onClick={() => void openExpanded()}
          aria-label={`Ampliar ${attachment.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt={attachment.name} />
        </button>
      )}
      {media && message.kind === "sticker" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="message-sticker-preview"
          src={media.url}
          alt="Figurinha"
        />
      )}
      {media && message.kind === "video" && (
        <video className="message-video-preview" src={media.url} controls />
      )}
      {media && message.kind === "audio" && (
        <audio className="message-audio-preview" src={media.url} controls />
      )}
      {isPdf && (
        <div className="message-pdf-preview">
          {attachment.thumbnail ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${attachment.thumbnail}`}
                alt={`Prévia de ${attachment.name}`}
              />
              <button
                type="button"
                aria-label={`Abrir ${attachment.name}`}
                onClick={() => void openExpanded()}
              />
            </>
          ) : null}
        </div>
      )}
      {message.kind === "document" && (
        <div className="message-file-card">
          <FileKindIcon mime={attachment.mime} name={attachment.name} />
          <div>
            <strong>{attachment.name}</strong>
            <span>{fileDescription(attachment)}</span>
          </div>
          <button
            type="button"
            aria-label={`Baixar ${attachment.name}`}
            onClick={() => void download()}
          >
            <Download size={18} />
          </button>
        </div>
      )}
      {expanded && media && (
        <div className="media-viewer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="media-viewer-close"
            aria-label="Fechar visualização"
            onClick={() => setExpanded(false)}
          >
            <X size={21} />
          </button>
          {isPdf ? (
            <iframe src={media.url} title={attachment.name} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt={attachment.name} />
          )}
        </div>
      )}
    </div>
  );
}

async function loadMedia(id: string, userId?: string) {
  const file = await api<{ data: string; mime: string; name: string }>(
    `/whatsapp/media/${id}${userId ? `?userId=${userId}` : ""}`,
  );
  const bytes = Uint8Array.from(atob(file.data), (character) =>
    character.charCodeAt(0),
  );
  return {
    url: URL.createObjectURL(new Blob([bytes], { type: file.mime })),
    mime: file.mime,
    name: file.name,
  };
}

function FileKindIcon({ mime, name }: { mime: string; name: string }) {
  if (mime.includes("spreadsheet") || /\.(csv|xls|xlsx)$/i.test(name))
    return <FileSpreadsheet size={25} />;
  if (mime.startsWith("text/") || mime === "application/pdf")
    return <FileText size={25} />;
  return <File size={25} />;
}

function fileDescription(attachment: NonNullable<Message["attachment"]>) {
  const details = [];
  if (attachment.pageCount)
    details.push(
      `${attachment.pageCount} ${attachment.pageCount === 1 ? "página" : "páginas"}`,
    );
  details.push(fileType(attachment.mime, attachment.name));
  if (attachment.size) details.push(formatBytes(attachment.size));
  return details.join(" · ");
}

function fileType(mime: string, name: string) {
  const extension = name.split(".").pop();
  if (extension && extension !== name) return extension.toUpperCase();
  return mime.split("/").pop()?.toUpperCase() || "ARQUIVO";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
