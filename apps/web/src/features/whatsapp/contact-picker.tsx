"use client";
import { Avatar, Modal } from "@/components/ui";
import type { Chat, SharedContact } from "@/lib/types";
import { useState, type FormEvent } from "react";

export function ContactPicker({
  chats,
  onSelect,
  onClose,
}: {
  chats: Chat[];
  onSelect: (contact: SharedContact) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const available = chats
    .filter(
      (chat) =>
        /^\d{12,15}@s\.whatsapp\.net$/.test(chat.id) &&
        `${chat.name} ${chat.id}`.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 30);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!name.trim() || !/^\d{12,15}$/.test(digits)) return;
    onSelect({ name: name.trim(), phone: digits });
  }

  return (
    <Modal
      title="Enviar contato"
      description="Selecione uma conversa ou informe um contato."
      onClose={onClose}
    >
      <div className="modal-form">
        <input
          aria-label="Buscar contato"
          placeholder="Buscar nas conversas…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="forward-chat-list contact-chat-list">
          {available.map((chat) => (
            <button
              type="button"
              key={chat.id}
              onClick={() =>
                onSelect({ name: chat.name, phone: chat.id.split("@")[0] })
              }
            >
              <Avatar name={chat.name} small />
              <span>
                <strong>{chat.name}</strong>
                <small>{chat.id.split("@")[0]}</small>
              </span>
            </button>
          ))}
          {!available.length && (
            <p className="form-note">Nenhuma conversa encontrada.</p>
          )}
        </div>
        <form className="contact-manual" onSubmit={submit}>
          <strong>Outro contato</strong>
          <input
            aria-label="Nome do contato"
            placeholder="Nome"
            maxLength={120}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            aria-label="Telefone do contato"
            placeholder="Telefone com DDI e DDD"
            inputMode="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <button
            className="button secondary"
            disabled={
              !name.trim() || !/^\d{12,15}$/.test(phone.replace(/\D/g, ""))
            }
          >
            Selecionar contato
          </button>
        </form>
      </div>
    </Modal>
  );
}
