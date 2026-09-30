"use client";

import { Copy, MessageSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { messagePhones } from "@/lib/message-phones";
import type { SharedContact } from "@/lib/types";

export function MessageText({ text, onStartConversation, onError }: {
  text: string;
  onStartConversation?: (contact: SharedContact) => void;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<{ phone: string; top: number; left: number }>();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const phones = messagePhones(text);

  useEffect(() => {
    if (!selected) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setSelected(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        trigger.current?.focus();
        setSelected(undefined);
      }
    };
    const close = () => setSelected(undefined);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menu.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [selected]);

  useLayoutEffect(() => {
    if (!selected || !menu.current) return;
    const bounds = menu.current.getBoundingClientRect();
    setPosition({
      top: Math.max(8, Math.min(selected.top, window.innerHeight - bounds.height - 8)),
      left: Math.max(8, Math.min(selected.left, window.innerWidth - bounds.width - 8)),
    });
  }, [selected]);

  const parts = [];
  let cursor = 0;
  for (const phone of phones) {
    parts.push(text.slice(cursor, phone.start));
    parts.push(
      <button
        key={phone.start}
        type="button"
        className="message-phone"
        aria-label={`Ações para o telefone ${phone.text}`}
        aria-haspopup="menu"
        aria-expanded={selected?.phone === phone.phone}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          trigger.current = event.currentTarget;
          setSelected(selected?.phone === phone.phone ? undefined : { phone: phone.phone, top: bounds.bottom + 6, left: bounds.left });
        }}
      >{phone.text}</button>,
    );
    cursor = phone.start + phone.text.length;
  }
  parts.push(text.slice(cursor));

  return (
    <div className="message-text">
      {parts}
      {selected && createPortal(
        <div ref={menu} role="menu" aria-label="Ações do telefone" className="message-menu-popover message-phone-popover" style={position}>
          {onStartConversation && (
            <button type="button" role="menuitem" onClick={() => {
              onStartConversation({ name: "+" + selected.phone, phone: selected.phone });
              setSelected(undefined);
            }}>
              <MessageSquare size={16} /> Conversar com +{selected.phone}
            </button>
          )}
          <button type="button" role="menuitem" onClick={async () => {
            try {
              await navigator.clipboard.writeText("+" + selected.phone);
              trigger.current?.focus();
              setSelected(undefined);
            } catch {
              onError("Não foi possível copiar o número de telefone.");
              setSelected(undefined);
            }
          }}>
            <Copy size={16} /> Copiar número de telefone
          </button>
        </div>, document.body,
      )}
    </div>
  );
}
