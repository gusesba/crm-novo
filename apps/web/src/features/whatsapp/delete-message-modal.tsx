"use client";
import { ErrorBox, Modal } from "@/components/ui";
import type { Message } from "@/lib/types";
import { useState } from "react";

export function DeleteMessageModal({
  message,
  onClose,
  onDelete,
}: {
  message: Message;
  onClose: () => void;
  onDelete: (forEveryone: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove(forEveryone: boolean) {
    setBusy(true);
    setError("");
    try {
      await onDelete(forEveryone);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Excluir mensagem"
      description="Escolha onde esta mensagem será excluída."
      onClose={onClose}
    >
      <div className="modal-form">
        {error && <ErrorBox message={error} />}
        <p className="form-note">
          Excluir para mim remove a mensagem somente desta conversa no CRM.
          {message.canDeleteForEveryone
            ? " Excluir para todos apaga o conteúdo no WhatsApp e mantém a indicação de mensagem apagada no histórico."
            : ""}
        </p>
        <div className="modal-footer delete-message-actions">
          <button className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void remove(false)}
          >
            {busy ? "Excluindo…" : "Excluir para mim"}
          </button>
          {message.canDeleteForEveryone && (
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void remove(true)}
            >
              {busy ? "Excluindo…" : "Excluir para todos"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
