"use client";
import type { Message } from "@/lib/types";
import {
  ChevronDown,
  Forward,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function MessageActionsMenu({
  message,
  onReply,
  onEdit,
  onReact,
  onForward,
  onDelete,
}: {
  message: Message;
  onReply: () => void;
  onEdit: () => void;
  onReact: (emoji: string) => Promise<void>;
  onForward: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const ownReaction = message.reactions?.find((reaction) => reaction.mine)?.emoji;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !root.current?.contains(target) &&
        !popover.current?.contains(target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeForLayout = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", closeForLayout);
    document.addEventListener("scroll", closeForLayout, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", closeForLayout);
      document.removeEventListener("scroll", closeForLayout, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !root.current || !popover.current) return;
    const trigger = root.current.getBoundingClientRect();
    const menu = popover.current.getBoundingClientRect();
    const messageList = root.current.closest(".message-list")?.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const boundaryTop = Math.max(margin, messageList?.top ?? margin);
    const boundaryBottom = Math.min(
      window.innerHeight - margin,
      messageList?.bottom ?? window.innerHeight - margin,
    );
    const spaceAbove = trigger.top - boundaryTop;
    const spaceBelow = boundaryBottom - trigger.bottom;
    const opensUp = spaceBelow < menu.height + gap && spaceAbove > spaceBelow;
    setPosition({
      top: Math.max(
        boundaryTop,
        Math.min(
          opensUp ? trigger.top - menu.height - gap : trigger.bottom + gap,
          boundaryBottom - menu.height,
        ),
      ),
      left: Math.max(
        margin,
        Math.min(trigger.right - menu.width, window.innerWidth - menu.width - margin),
      ),
      ready: true,
    });
  }, [open, showReactions]);

  function select(action: () => void) {
    action();
    setOpen(false);
    setShowReactions(false);
  }

  return (
    <div className="message-menu" ref={root}>
      <button
        className="message-menu-toggle"
        aria-label="Ações da mensagem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setShowReactions(false);
          setPosition((value) => ({ ...value, ready: false }));
        }}
      >
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            className={`message-menu-popover ${showReactions ? "reaction-popover" : ""}`}
            role="menu"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.ready ? "visible" : "hidden",
            }}
          >
            {showReactions ? (
              <div className="reaction-picker" aria-label="Escolher reação">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    disabled={busy}
                    className={ownReaction === emoji ? "active" : ""}
                    aria-label={`Reagir com ${emoji}`}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onReact(ownReaction === emoji ? "" : emoji);
                        setOpen(false);
                        setShowReactions(false);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {message.kind !== "deleted" && (
                  <>
                    <button role="menuitem" onClick={() => select(onReply)}>
                      <Reply size={15} /> Responder
                    </button>
                    <button role="menuitem" onClick={() => setShowReactions(true)}>
                      <SmilePlus size={15} /> Reagir
                    </button>
                    <button role="menuitem" onClick={() => select(onForward)}>
                      <Forward size={15} /> Encaminhar
                    </button>
                  </>
                )}
                {!!message.mine && message.kind === "text" && (
                  <button role="menuitem" onClick={() => select(onEdit)}>
                    <Pencil size={15} /> Editar
                  </button>
                )}
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => select(onDelete)}
                >
                  <Trash2 size={15} /> {message.kind === "deleted" ? "Excluir para mim" : "Excluir"}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
