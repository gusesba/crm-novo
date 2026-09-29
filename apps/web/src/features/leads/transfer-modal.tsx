"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { post } from "@/lib/api";
import { useState, type FormEvent } from "react";
export function TransferModal({
  ids,
  onClose,
  onSaved,
}: {
  ids: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { catalog, notify } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await post("/leads/transfer", {
        leadIds: ids,
        sellerId: Number(f.get("seller")),
        permanent: f.get("type") === "permanent",
      });
      notify("Carteira transferida com sucesso.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Transferir atendimentos"
      description={`${ids.length} lead(s) selecionado(s). O destino deve pertencer à mesma sede.`}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <Field label="Novo vendedor">
          <select name="seller" required>
            <option value="">Selecione</option>
            {catalog?.users
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Tipo de transferência">
          <select name="type">
            <option value="temporary">
              Temporária · preservar responsável original
            </option>
            <option value="permanent">
              Permanente · alterar responsável e atual
            </option>
          </select>
        </Field>
        <p className="form-note">
          O vínculo com a sessão WhatsApp anterior será removido. O histórico
          permanece no usuário de origem.
        </p>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Transferindo…" : "Confirmar transferência"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
