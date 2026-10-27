"use client";
import { useWhatsAppApi } from "./account-context";
import { useState, type FormEvent } from "react";
import { useApp } from "@/components/providers";
import { Field, Loading, Modal } from "@/components/ui";
import { useWhatsAppResource as useResource } from "./account-context";
import { ContactRound } from "lucide-react";

export type WhatsAppContact = {
  chatId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  saved: boolean;
};

export function ContactButton({
  chatId,
  backup,
  saved,
  onClick,
}: {
  chatId: string;
  backup: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  if (backup || !/^\d{10,15}@s\.whatsapp\.net$/.test(chatId)) return null;
  return (
    <button
      type="button"
      className="button secondary compact"
      onClick={onClick}
    >
      <ContactRound size={14} />
      {saved ? "Editar contato" : "Salvar contato"}
    </button>
  );
}

export function ContactForm({
  chatId,
  linkedLead,
  onClose,
  onSaved,
}: {
  chatId: string;
  linkedLead?: boolean;
  onClose: () => void;
  onSaved: (contact: WhatsAppContact) => void;
}) {
  const { put } = useWhatsAppApi();
  const { notify } = useApp();
  const result = useResource<WhatsAppContact>(
    `/whatsapp/contacts?chatId=${encodeURIComponent(chatId)}`,
  );
  const [draft, setDraft] = useState<{ firstName: string; lastName: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const names = draft || {
    firstName: result.data?.firstName || "",
    lastName: result.data?.lastName || "",
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const contact = await put<WhatsAppContact>("/whatsapp/contacts", {
        chatId,
        firstName: names.firstName.trim(),
        lastName: names.lastName.trim(),
      });
      notify("Contato salvo no WhatsApp.");
      onSaved(contact);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        result.data?.saved
          ? "Editar contato no WhatsApp"
          : "Salvar contato no WhatsApp"
      }
      description={
        linkedLead ? "O nome do lead no CRM não será alterado." : undefined
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {result.loading && !result.data ? (
        <Loading />
      ) : (
        <form className="modal-form" onSubmit={submit}>
          {(error || result.error) && (
            <p role="alert" className="form-note">
              {error || result.error}
            </p>
          )}
          {result.error && (
            <button
              type="button"
              className="button secondary"
              onClick={result.reload}
            >
              Tentar novamente
            </button>
          )}
          <Field label="Telefone">
            <input value={`+${chatId.split("@")[0]}`} readOnly />
          </Field>
          <Field label="Nome *">
            <input
              autoFocus
              autoComplete="given-name"
              required
              maxLength={80}
              value={names.firstName}
              disabled={busy || !!result.error}
              onChange={(event) =>
                setDraft({ ...names, firstName: event.target.value })
              }
            />
          </Field>
          <Field label="Sobrenome">
            <input
              autoComplete="family-name"
              maxLength={80}
              value={names.lastName}
              disabled={busy || !!result.error}
              onChange={(event) =>
                setDraft({ ...names, lastName: event.target.value })
              }
            />
          </Field>
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !result.data ||
                !!result.error ||
                !names.firstName.trim()
              }
            >
              {busy ? "Salvando…" : "Salvar no WhatsApp"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
