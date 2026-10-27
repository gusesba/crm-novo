"use client";
import { api, post } from "@/lib/api";
import type { WhatsAppAccount } from "@/lib/whatsapp-account";
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

export function LeadConversationButton({ lead, className = "text-button" }: { lead: Lead; className?: string }) {
  const router = useRouter();
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState<Resolution>();
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>();
  const [accountId, setAccountId] = useState("default");
  async function chooseAccount() {
    setBusy(true);
    setError("");
    try {
      const items = await api<WhatsAppAccount[]>("/whatsapp/accounts");
      if (items.length > 1) setAccounts(items);
      else await open(undefined, "default");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(acceptedPhone?: string, selectedAccount = accountId) {
    setAccountId(selectedAccount);
    setAccounts(undefined);
    setBusy(true);
    setError("");
    try {
      const result = await post<Resolution>(`/leads/${lead.id}/conversation?accountId=${encodeURIComponent(selectedAccount)}`, {
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
      router.push(`/whatsapp?phone=${encodeURIComponent(result.phone)}&accountId=${encodeURIComponent(selectedAccount)}`);
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
          className={className}
          disabled={busy}
          onClick={() => void chooseAccount()}
        >
          {busy ? "Consultando…" : "Conversa"}
        </button>
        {error && <ErrorBox message={error} />}
      </span>
      {accounts && createPortal(
        <Modal title="Escolher conta WhatsApp" onClose={() => setAccounts(undefined)}>
          <div className="modal-form">
            <p>Qual conta deseja usar para conversar com {lead.name}?</p>
            {accounts.map((account) => <button key={account.id} type="button" className="button secondary" onClick={() => void open(undefined, account.id)}>{account.name}</button>)}
          </div>
        </Modal>, document.body,
      )}
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
