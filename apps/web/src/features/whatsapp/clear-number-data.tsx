"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ErrorBox, Modal } from "@/components/ui";
import { api } from "@/lib/api";

export function ClearNumberData({ number, canClear, onCleared }: { number: string; canClear: boolean; onCleared: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = number.startsWith("legacy_") ? "Histórico anterior" : `+${number}`;
  async function clear() {
    setBusy(true);
    setError("");
    try {
      await api(`/whatsapp/backup/numbers/${encodeURIComponent(number)}`, { method: "DELETE" });
      setOpen(false);
      onCleared();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <>
    <div className="number-data-cleanup">
      <button type="button" className="button danger" disabled={!canClear || busy}
        title={canClear ? `Limpar dados: ${label}` : "Desconecte todas as contas deste número para limpar os dados."}
        onClick={() => { setError(""); setOpen(true); }}><Trash2 size={16} /> Limpar dados do número</button>
      {!canClear && <p className="form-note">Desconecte todas as contas deste número antes de limpar os dados.</p>}
    </div>
    {open && <Modal title="Limpar conversas e backup" onClose={() => { if (!busy) setOpen(false); }}>
      <div className="modal-form">
        <p>Excluir permanentemente as conversas, mensagens, contatos e mídias locais de <strong>{label}</strong> e seu backup neste CRM? A limpeza vale para todas as contas deste número no seu usuário.</p>
        <p>Esta ação não pode ser desfeita. Leads, dados comerciais e mensagens no celular serão preservados. Uma nova conexão poderá sincronizar mensagens novamente.</p>
        {error && <ErrorBox message={error} />}
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
          <button type="button" className="button danger" disabled={busy || !canClear} onClick={() => void clear()}>{busy ? "Limpando…" : "Excluir conversas e backup"}</button>
        </div>
      </div>
    </Modal>}
  </>;
}
