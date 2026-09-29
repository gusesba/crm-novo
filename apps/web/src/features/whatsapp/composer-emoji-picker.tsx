"use client";

import EmojiPicker, {
  EmojiStyle,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import portugueseEmojis from "emoji-picker-react/dist/data/emojis-pt.js";
import type { Attachment } from "@/lib/types";
import { Smile, Sticker } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ComposerStickerPicker } from "./composer-sticker-picker";

export function ComposerEmojiPicker({
  disabled,
  onSelect,
  allowSticker,
  onStickerSelect,
  onError,
}: {
  disabled: boolean;
  onSelect: (emoji: string) => void;
  allowSticker: boolean;
  onStickerSelect: (attachment: Attachment) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"emoji" | "sticker">("emoji");
  const [position, setPosition] = useState({ left: 0, bottom: 0, width: 480 });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeResize = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    window.addEventListener("resize", closeResize);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      window.removeEventListener("resize", closeResize);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(480, window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      bottom: window.innerHeight - rect.top + 10,
      width,
    });
    setOpen(true);
  }

  return (
    <div className="composer-emoji" ref={root}>
      <button
        ref={button}
        type="button"
        className="composer-emoji-toggle"
        aria-label="Escolher emoji ou figurinha"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        <Smile size={21} />
      </button>
      {open && (
        <div
          className="composer-emoji-popover"
          role="dialog"
          aria-label="Emojis e figurinhas"
          style={position}
        >
          {mode === "emoji" ? (
            <EmojiPicker
              emojiData={portugueseEmojis}
              emojiStyle={EmojiStyle.NATIVE}
              theme={Theme.LIGHT}
              suggestedEmojisMode={SuggestionMode.RECENT}
              searchPlaceholder="Pesquisar emoji"
              previewConfig={{ showPreview: false }}
              width="100%"
              height={340}
              onEmojiClick={({ emoji }) => onSelect(emoji)}
            />
          ) : (
            <ComposerStickerPicker
              onError={onError}
              onSelect={(attachment) => {
                onStickerSelect(attachment);
                setOpen(false);
              }}
            />
          )}
          <div
            className="composer-picker-tabs"
            role="tablist"
            aria-label="Tipo de conteúdo"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "emoji"}
              aria-label="Emojis"
              onClick={() => setMode("emoji")}
            >
              <Smile size={19} />
            </button>
            {allowSticker && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "sticker"}
                aria-label="Figurinhas"
                onClick={() => setMode("sticker")}
              >
                <Sticker size={19} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
