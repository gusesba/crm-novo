"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Loading, Modal } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { api, post } from "@/lib/api";
import type { WhatsAppAccount } from "@/lib/whatsapp-account";
import { WhatsAppAccountContext } from "./account-context";

export function WhatsAppWorkspace({ children }: { children: ReactNode }) {
  const { user } = useApp();
  return <AccountTabs key={user?.id}>{children}</AccountTabs>;
}

function AccountTabs({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const { notify } = useApp();
  const accounts = useResource<WhatsAppAccount[]>("/whatsapp/accounts", 10000);
  const [selected, setSelected] = useState(params.get("accountId") || "default");
  const [created, setCreated] = useState<WhatsAppAccount[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [removing, setRemoving] = useState<WhatsAppAccount>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const requested = params.get("accountId");
    if (requested) setSelected(requested);
  }, [params]);
  useEffect(() => {
    if (accounts.data) setCreated((current) => current.filter((item) => !accounts.data!.some((saved) => saved.id === item.id)));
  }, [accounts.data]);
  const items = [...(accounts.data || []), ...created.filter((item) => !accounts.data?.some((saved) => saved.id === item.id))]
    .filter((item) => !removed.includes(item.id));
  const active = items.find((item) => item.id === selected) || items.find((item) => item.id === "default");
  useEffect(() => {
    if (active && selected !== active.id) setSelected(active.id);
  }, [active, selected]);
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
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/whatsapp/accounts/${encodeURIComponent(removing.id)}`, { method: "DELETE" });
      setRemoved((current) => [...current, removing.id]);
      setCreated((current) => current.filter((item) => item.id !== removing.id));
      if (selected === removing.id) setSelected("default");
      if (params.get("accountId") === removing.id) {
        const query = new URLSearchParams(params);
        query.delete("accountId");
        query.delete("phone");
        router.replace(`${path}${query.size ? `?${query}` : ""}`, { scroll: false });
      }
      setRemoving(undefined);
      accounts.reload();
      notify("Conta WhatsApp removida.");
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
            aria-selected={account.id === active?.id}
            aria-controls="whatsapp-account-panel"
            tabIndex={account.id === active?.id ? 0 : -1}
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
        {active && active.id !== "default" && <button
          type="button"
          className="button secondary compact"
          disabled={busy}
          onClick={() => { setError(""); setRemoving(active); }}
        >
          <Trash2 size={15} /> Remover conta
        </button>}
        <button type="button" className="button secondary compact" disabled={busy} onClick={() => { setError(""); setOpen(true); }}>
          <Plus size={15} /> Adicionar conta
        </button>
      </div>
      {active ? <WhatsAppAccountContext.Provider key={active.id} value={{ accountId: active.id, userId: "" }}>
        <div role="tabpanel" id="whatsapp-account-panel" aria-labelledby={`account-tab-${active.id}`}>{children}</div>
      </WhatsAppAccountContext.Provider> : accounts.data && <ErrorBox message="Conta WhatsApp não encontrada. Selecione uma das contas acima." />}
    </>}
    {removing && <Modal title="Remover conta WhatsApp" onClose={() => { if (!busy) setRemoving(undefined); }}>
      <div className="modal-form">
        <p>Remover a conta <strong>{removing.name}</strong>? Ela será desconectada e seus disparos em andamento serão cancelados. O histórico textual continuará disponível em Histórico e backup.</p>
        {error && <ErrorBox message={error} />}
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setRemoving(undefined)}>Cancelar</button>
          <button type="button" className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? "Removendo…" : "Remover conta"}</button>
        </div>
      </div>
    </Modal>}
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
