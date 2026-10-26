"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { post } from "@/lib/api";
import { useState, type FormEvent } from "react";
export function TransferModal({
  ids,
  sourceBranchIds,
  onClose,
  onSaved,
}: {
  ids: number[];
  sourceBranchIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, catalog, notify } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [branch, setBranch] = useState("");
  const [seller, setSeller] = useState("");
  const canChooseBranch = user?.isAdmin && !user.branchId;
  const destinationBranch = canChooseBranch && permanent ? branch : "";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await post("/leads/transfer", {
        leadIds: ids,
        sellerId: Number(f.get("seller")),
        permanent: f.get("type") === "permanent",
        branchId: destinationBranch ? Number(destinationBranch) : null,
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
      description={`${ids.length} lead(s) selecionado(s). ${canChooseBranch ? "A troca de sede está disponível apenas na transferência permanente." : "O destino deve pertencer à mesma sede."}`}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <Field label="Tipo de transferência">
          <select
            name="type"
            value={permanent ? "permanent" : "temporary"}
            onChange={(e) => {
              setPermanent(e.target.value === "permanent");
              setBranch("");
              setSeller("");
            }}
          >
            <option value="temporary">
              Temporária · preservar responsável original
            </option>
            <option value="permanent">
              Permanente · alterar responsável e atual
            </option>
          </select>
        </Field>
        {canChooseBranch && permanent && (
          <Field label="Sede de destino">
            <select
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setSeller("");
              }}
            >
              <option value="">Manter sede de cada lead</option>
              {catalog?.branches.filter((b) => b.active).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Novo vendedor">
          <select name="seller" required value={seller} onChange={(e) => setSeller(e.target.value)}>
            <option value="">Selecione</option>
            {catalog?.users
              .filter((u) => u.active && ((u.isAdmin && !u.branchId) || (destinationBranch
                ? u.branchId === Number(destinationBranch)
                : sourceBranchIds.every((id) => u.branchId === id))))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{canChooseBranch ? ` · ${catalog?.branches.find((b) => b.id === u.branchId)?.name || "Global"}` : ""}
                </option>
              ))}
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
