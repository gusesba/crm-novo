"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { api, post, put } from "@/lib/api";
import type { Lead } from "@/lib/types";
import { CalendarDays, Check, ContactRound, FileText, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CommercialFields } from "./commercial-fields";
import { CustomerFields } from "./customer-fields";
import { LeadConversationButton } from "./lead-conversation-button";
export function LeadForm({
  lead,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  lead?: Lead;
  initial?: { name: string; phone: string };
  onClose: () => void;
  onSaved: (lead: Lead) => void;
  onDeleted?: () => void;
}) {
  const { user, catalog, notify } = useApp();
  const [branch, setBranch] = useState(
    String(
      lead?.branchId ||
        user?.branchId ||
        catalog?.branches.find((b) => b.active)?.id ||
        "",
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!catalog || !user) return null;
  const canEdit = !lead || user.isAdmin || lead.currentSellerId === user.id;
  const sellers = catalog.users.filter(
    (u) =>
      (u.active || u.id === lead?.sellerId) &&
      (u.branchId === Number(branch) || (u.isAdmin && !u.branchId)),
  );
  async function remove() {
    if (!lead || !user?.isAdmin || !window.confirm(`Excluir o lead ${lead.name}? Os retornos e vínculos com grupos também serão excluídos.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/leads/${lead.id}`, { method: "DELETE" });
      notify("Lead excluído.");
      if (onDeleted) onDeleted();
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    const raw = Object.fromEntries(f);
    const payload = {
      ...raw,
      branchId: Number(branch),
      sellerId: lead?.sellerId || Number(raw.sellerId || user!.id),
      serviceId: raw.serviceId ? Number(raw.serviceId) : null,
      conditionId: raw.conditionId ? Number(raw.conditionId) : null,
      value: Number(raw.value || 0),
      birthDate: raw.birthDate || null,
      gender: raw.gender || null,
      email: raw.email || null,
      returnAt: raw.returnAt
        ? new Date(String(raw.returnAt)).toISOString()
        : null,
      revision: lead?.revision || 0,
    };
    try {
      const saved = lead
        ? await put<Lead>(`/leads/${lead.id}`, payload)
        : await post<Lead>("/leads", payload);
      notify(lead ? "Atendimento atualizado." : "Novo lead cadastrado.");
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={lead ? lead.name : "Um novo caminho começa aqui"}
      description={
        lead
          ? "Informações do cliente e acompanhamento comercial."
          : "Cadastre o interessado e prepare o próximo contato."
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className="modal-form">
        {error && <ErrorBox message={error} />}
        <fieldset disabled={!canEdit || busy}>
          <div className="form-section-title">
            <ContactRound size={18} />
            <h3>Informações do cliente</h3>
          </div>
          <CustomerFields lead={lead} initial={initial} readOnly={!!lead && !user.isAdmin} />
          {lead && !user.isAdmin && (
            <p className="form-note">Somente o administrador pode editar os dados de contato.</p>
          )}
          <div className="form-section-title">
            <FileText size={18} />
            <h3>Atendimento e negociação</h3>
          </div>
          <CommercialFields
            lead={lead}
            branch={branch}
            setBranch={setBranch}
            user={user}
            catalog={catalog}
            sellers={sellers}
          />
          <div className="form-section-title">
            <CalendarDays size={18} />
            <h3>
              {lead ? "Adicionar um retorno" : "Planejar o próximo passo"}
            </h3>
          </div>
          <div className="form-grid">
            <Field label="Data e horário do retorno">
              <input name="returnAt" type="datetime-local" />
            </Field>
            <Field label="Observação do retorno">
              <input
                name="returnNote"
                placeholder="O que precisamos conversar?"
                maxLength={2000}
              />
            </Field>
          </div>
          {lead && (
            <p className="form-note">
              Vendedor atual:{" "}
              {catalog.users.find((u) => u.id === lead.currentSellerId)?.name ||
                "—"}
              . Agendamentos existentes estão disponíveis na agenda.
            </p>
          )}
        </fieldset>
        <div className="modal-footer">
          {lead && user.isAdmin && (
            <button type="button" className="button secondary" disabled={busy} onClick={remove}>
              <Trash2 size={17} />
              Excluir lead
            </button>
          )}
          {lead && lead.currentSellerId === user.id && lead.status !== "Não Enviar Mais" && !busy && (
            <LeadConversationButton lead={lead} />
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar
          </button>
          {canEdit && (
            <button className="button primary" disabled={busy}>
              <Check size={17} />
              {busy
                ? "Salvando…"
                : lead
                  ? "Salvar alterações"
                  : "Cadastrar lead"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
