"use client";
import { Field } from "@/components/ui";
import { statuses } from "@/lib/format";
import type { Catalog, Lead, User } from "@/lib/types";
export function CommercialFields({
  lead,
  branch,
  setBranch,
  user,
  catalog,
  sellers,
}: {
  lead?: Lead;
  branch: string;
  setBranch: (value: string) => void;
  user: User;
  catalog: Catalog;
  sellers: User[];
}) {
  return (
    <div className="form-grid">
      <Field label="Sede *">
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          disabled={!!lead}
          required
        >
          {catalog.branches
            .filter((b) => b.active || b.id === lead?.branchId)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Vendedor responsável *">
        <select
          name="sellerId"
          key={branch}
          defaultValue={
            lead?.sellerId ||
            (sellers.some((s) => s.id === user.id) ? user.id : sellers[0]?.id)
          }
          required
          disabled={!!lead || !user.isAdmin}
        >
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Serviço de interesse">
        <select name="serviceId" defaultValue={lead?.serviceId || ""}>
          <option value="">Selecione um serviço</option>
          {catalog.services
            .filter((s) => s.active || s.id === lead?.serviceId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Status do atendimento *">
        <select
          name="status"
          defaultValue={lead?.status || statuses[0]}
          required
        >
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Valor da venda (R$)">
        <input
          name="value"
          type="number"
          step="0.01"
          min="0"
          max="100000000"
          defaultValue={lead?.value || 0}
        />
      </Field>
      <Field label="Condição de venda">
        <select name="conditionId" defaultValue={lead?.conditionId || ""}>
          <option value="">Selecione uma condição</option>
          {catalog.conditions
            .filter((s) => s.active || s.id === lead?.conditionId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Indicação">
        <input
          name="referral"
          defaultValue={lead?.referral || ""}
          maxLength={200}
        />
      </Field>
      <Field label="Como conheceu">
        <input
          name="discovery"
          defaultValue={lead?.discovery || ""}
          maxLength={500}
        />
      </Field>
      <Field label="Motivo da escolha" wide>
        <input
          name="choiceReason"
          defaultValue={lead?.choiceReason || ""}
          maxLength={500}
        />
      </Field>
      <Field label="Observações" wide>
        <textarea
          name="notes"
          rows={3}
          defaultValue={lead?.notes || ""}
          placeholder="Contexto, dúvidas e informações relevantes…"
          maxLength={5000}
        />
      </Field>
    </div>
  );
}
