"use client";
import { post } from "@/lib/api";
import { useApp } from "@/components/providers";
import { ErrorBox, Modal } from "@/components/ui";
import type { Lead } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

type Resolution = {
  phone: string;
  chatId: string;
  requiresConfirmation: boolean;
  exists: boolean;
};

export function LeadConversationButton({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState<Resolution>();
  async function open(acceptedPhone?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await post<Resolution>(`/leads/${lead.id}/conversation`, {
        revision: lead.revision,
        acceptedPhone,
      });
      if (result.requiresConfirmation) {
        setVariant(result);
        return;
      }
      setVariant(undefined);
      if (result.exists)
        notify(
          "Já existe uma conversa com este número. Abrindo a conversa existente.",
        );
      router.push(`/whatsapp?phone=${encodeURIComponent(result.phone)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => void open()}
        >
          {busy ? "Consultando…" : "Conversa"}
        </button>
        {error && <ErrorBox message={error} />}
      </span>
      {variant &&
        createPortal(
          <Modal
            title="Número alternativo encontrado"
            onClose={() => {
              if (!busy) setVariant(undefined);
            }}
          >
            <div className="modal-form">
              <p>
                O número original {lead.phone} não foi encontrado no WhatsApp.
                Encontramos a variante {variant.phone}. Deseja usar esse número
                e atualizar o telefone do lead?
              </p>
              {variant.exists && (
                <p>
                  Já existe uma conversa com esse número. Ao confirmar, você
                  será direcionado para ela.
                </p>
              )}
              <div className="modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setVariant(undefined)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void open(variant.phone)}
                >
                  {busy ? "Aguarde…" : "Usar variante"}
                </button>
              </div>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
