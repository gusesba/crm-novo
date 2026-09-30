"use client";

import { api } from "@/lib/api";
import { ErrorBox } from "@/components/ui";
import type { Attachment } from "@/lib/types";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readAttachment } from "./attachment";

type RecentSticker = { id: string; label: string };
type StickerMedia = { data: string; mime: string };

export function ComposerStickerPicker({
  onSelect,
  onError,
}: {
  onSelect: (attachment: Attachment) => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<RecentSticker[]>([]);
  const [loaded, setLoaded] = useState<Record<string, StickerMedia>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const recent = await api<RecentSticker[]>("/whatsapp/stickers");
        if (cancelled) return;
        setItems(recent);
        setLoading(false);
        for (let index = 0; index < recent.length; index += 4) {
          await Promise.all(
            recent.slice(index, index + 4).map(async ({ id }) => {
              try {
                const media = await api<StickerMedia>(
                  `/whatsapp/media/${encodeURIComponent(id)}`,
                );
                if (!cancelled)
                  setLoaded((current) => ({ ...current, [id]: media }));
              } catch {
                // A mídia antiga pode ter expirado no WhatsApp; as demais continuam disponíveis.
              }
            }),
          );
          if (cancelled) return;
        }
      } catch (cause) {
        if (!cancelled) {
          setError((cause as Error).message);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectFile(file: File | undefined) {
    if (!file) return;
    if (
      file.type === "image/webp" ||
      file.name.toLowerCase().endsWith(".webp")
    ) {
      readAttachment(file, onSelect, onError);
      return;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      onError("Escolha uma imagem PNG, JPG ou WebP para criar a figurinha.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      onError("A imagem deve ter no máximo 16 MB.");
      return;
    }
    void (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a figurinha.");
        const scale = Math.min(512 / bitmap.width, 512 / bitmap.height);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;
        context.drawImage(
          bitmap,
          (512 - width) / 2,
          (512 - height) / 2,
          width,
          height,
        );
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error("Não foi possível criar a figurinha.")),
            "image/webp",
            0.85,
          ),
        );
        readAttachment(
          new File([blob], "Figurinha.webp", { type: "image/webp" }),
          onSelect,
          onError,
        );
      } catch (cause) {
        onError((cause as Error).message);
      }
    })();
  }

  return (
    <div className="composer-sticker-picker">
      <div className="composer-sticker-heading">Figurinhas recentes</div>
      <div className="composer-sticker-grid">
        <button
          type="button"
          className="composer-sticker-create"
          onClick={() => input.current?.click()}
        >
          <Plus size={25} />
          <span>Criar</span>
        </button>
        {items.map(({ id, label }) => {
          const media = loaded[id];
          return (
            <button
              key={id}
              type="button"
              className="composer-sticker-tile"
              title={label}
              aria-label={`Selecionar ${label}`}
              disabled={!media}
              onClick={() =>
                media &&
                onSelect({
                  name: "Figurinha.webp",
                  mime: "image/webp",
                  data: media.data,
                })
              }
            >
              {media ? (
                <img src={`data:${media.mime};base64,${media.data}`} alt="" />
              ) : (
                <span className="composer-sticker-placeholder" />
              )}
            </button>
          );
        })}
      </div>
      {loading && (
        <p className="composer-sticker-status">Carregando figurinhas…</p>
      )}
      {!loading && !items.length && !error && (
        <p className="composer-sticker-status">
          Suas figurinhas usadas aparecerão aqui. Você também pode criar uma.
        </p>
      )}
      {error && <ErrorBox message={error} />}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,.webp"
        className="composer-file-input"
        aria-label="Criar figurinha de imagem"
        onChange={(event) => {
          selectFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
