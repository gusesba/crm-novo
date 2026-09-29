"use client";
import { useApp } from "@/components/providers";
import { Avatar, ErrorBox, Modal } from "@/components/ui";
import { post } from "@/lib/api";
import type { Chat, Message } from "@/lib/types";
import { Search } from "lucide-react";
import { useState } from "react";

export function ForwardMessageModal({
  message,
  chats,
  onClose,
  onForwarded,
}: {
  message: Message;
  chats: Chat[];
  onClose: () => void;
  onForwarded: (chatId: string) => void;
}) {
  const { notify } = useApp();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const available = chats.filter(
    (chat) =>
      chat.id.endsWith("@s.whatsapp.net") &&
      `${chat.name} ${chat.id}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function forward(chat: Chat) {
    setBusy(chat.id);
    setError("");
    try {
      await post(`/whatsapp/messages/${message.id}/forward`, {
        chatId: chat.id,
      });
      notify(`Mensagem encaminhada para ${chat.name}.`);
      onForwarded(chat.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal
      title="Encaminhar mensagem"
      description="Escolha uma conversa individual."
      onClose={onClose}
    >
      <div className="modal-form">
        {error && <ErrorBox message={error} />}
        <div className="search-field">
          <Search size={16} />
          <input
            autoFocus
            aria-label="Buscar conversa para encaminhar"
            placeholder="Buscar por nome ou telefone…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="forward-chat-list">
          {available.map((chat) => (
            <button
              type="button"
              key={chat.id}
              disabled={!!busy}
              onClick={() => void forward(chat)}
            >
              <Avatar name={chat.name} small />
              <span>
                <strong>{chat.name}</strong>
                <small>{chat.id.split("@")[0]}</small>
              </span>
              {busy === chat.id && <small>Encaminhando…</small>}
            </button>
          ))}
          {!available.length && (
            <p className="form-note">Nenhuma conversa encontrada.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
