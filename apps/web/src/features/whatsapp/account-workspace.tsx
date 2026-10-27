"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Loading, Modal } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post } from "@/lib/api";
import type { WhatsAppAccount } from "@/lib/whatsapp-account";
import { WhatsAppAccountContext } from "./account-context";

export function WhatsAppWorkspace({ backup = false, children }: { backup?: boolean; children: ReactNode }) {
  const { user, catalog } = useApp();
  const [historyUser, setHistoryUser] = useState("");
  return <>
    {backup && user?.isAdmin && <select
      className="history-user-select"
      aria-label="Usuário do histórico"
      value={historyUser}
      onChange={(event) => setHistoryUser(event.target.value)}
    >
      <option value="">Meu histórico</option>
      {catalog?.users.filter((item) => item.id !== user.id).map((item) =>
        <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
    <AccountTabs key={`${user?.id}-${historyUser}`} userId={historyUser} backup={backup}>{children}</AccountTabs>
  </>;
}

function AccountTabs({ userId, backup, children }: { userId: string; backup: boolean; children: ReactNode }) {
  const params = useSearchParams();
  const accounts = useResource<WhatsAppAccount[]>(`/whatsapp/accounts${userId ? `?userId=${userId}` : ""}`, 10000);
  const [selected, setSelected] = useState(!userId ? params.get("accountId") || "default" : "default");
  const [created, setCreated] = useState<WhatsAppAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const requested = params.get("accountId");
    if (!userId && requested) setSelected(requested);
  }, [params, userId]);
  const items = [...(accounts.data || []), ...created.filter((item) => !accounts.data?.some((saved) => saved.id === item.id))];
  const active = items.find((item) => item.id === selected);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const account = await post<WhatsAppAccount>("/whatsapp/accounts", { name: name.trim() });
      setCreated((current) => [...current, account]);
      setSelected(account.id);
      setOpen(false);
      setName("");
      accounts.reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <>
    {accounts.error && <ErrorBox message={accounts.error} retry={accounts.reload} />}
    {!accounts.data && accounts.loading ? <Loading /> : <>
      <div className="whatsapp-accounts">
        <div className="whatsapp-account-tabs" role="tablist" aria-label="Contas WhatsApp">
          {items.map((account) => <button
            key={account.id}
            id={`account-tab-${account.id}`}
            role="tab"
            type="button"
            aria-selected={account.id === selected}
            aria-controls="whatsapp-account-panel"
            tabIndex={account.id === selected || (!active && account.id === "default") ? 0 : -1}
            onClick={() => setSelected(account.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = items.findIndex((item) => item.id === account.id);
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
              setSelected(items[next].id);
              document.getElementById(`account-tab-${items[next].id}`)?.focus();
            }}
          >{account.name}</button>)}
        </div>
        {!backup && <button type="button" className="button secondary compact" onClick={() => { setError(""); setOpen(true); }}>
          <Plus size={15} /> Adicionar conta
        </button>}
      </div>
      {active ? <WhatsAppAccountContext.Provider key={active.id} value={{ accountId: active.id, userId }}>
        <div role="tabpanel" id="whatsapp-account-panel" aria-labelledby={`account-tab-${active.id}`}>{children}</div>
      </WhatsAppAccountContext.Provider> : accounts.data && <ErrorBox message="Conta WhatsApp não encontrada. Selecione uma das contas acima." />}
    </>}
    {open && <Modal title="Adicionar conta WhatsApp" onClose={() => { if (!busy) setOpen(false); }}>
      <form className="modal-form" onSubmit={(event) => void create(event)}>
        <p>Dê um nome à conta. Depois, conecte o WhatsApp pelo QR Code nesta aba.</p>
        <Field label="Nome da conta"><input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atendimento" /></Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy || !name.trim()}>{busy ? "Adicionando…" : "Adicionar conta"}</button>
        </div>
      </form>
    </Modal>}
  </>;
}
