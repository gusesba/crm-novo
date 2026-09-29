"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post, put } from "@/lib/api";
import { statuses } from "@/lib/format";
import type { ContactGroup, Lead, PageResult } from "@/lib/types";
import { useState, type FormEvent } from "react";
export function GroupForm({
  group,
  onClose,
  onSaved,
}: {
  group?: ContactGroup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { catalog, notify } = useApp();
  const [filterMode, setFilterMode] = useState(!group);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const members = useResource<{ members: Lead[] }>(
    group ? `/groups/${group.id}` : null,
  );
  const leads = useResource<PageResult<Lead>>(
    `/leads?mine=true&pageSize=100&search=${encodeURIComponent(search)}`,
  );
  const ids = selected ?? members.data?.members.map((l) => l.id) ?? [];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get("name"),
      leadIds: filterMode ? null : ids,
      status: filterMode ? f.get("status") || null : null,
      serviceId:
        filterMode && f.get("serviceId") ? Number(f.get("serviceId")) : null,
    };
    try {
      if (group) await put(`/groups/${group.id}`, payload);
      else await post("/groups", payload);
      notify("Grupo de contatos salvo.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={group ? "Participantes do grupo" : "Criar grupo de contatos"}
      description="Grupos internos do CRM, sem criar conversas coletivas no WhatsApp."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <Field label="Nome do grupo *">
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={group?.name}
            placeholder="Ex.: Interessados em primeira habilitação"
          />
        </Field>
        <div className="tabs">
          <button
            type="button"
            className={filterMode ? "active" : ""}
            onClick={() => setFilterMode(true)}
          >
            Gerar por filtros
          </button>
          <button
            type="button"
            className={!filterMode ? "active" : ""}
            onClick={() => setFilterMode(false)}
          >
            Selecionar contatos
          </button>
        </div>
        {filterMode ? (
          <>
            <Field label="Status">
              <select name="status">
                <option value="">Todos os status</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Serviço">
              <select name="serviceId">
                <option value="">Todos os serviços</option>
                {catalog?.services.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="form-note">
              Ao salvar, o grupo receberá os contatos atuais que correspondem
              aos filtros. Contatos bloqueados nunca recebem disparos.
            </p>
          </>
        ) : (
          <>
            <Field label={`Buscar contatos · ${ids.length} selecionados`}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar na sua carteira"
              />
            </Field>
            <div className="check-list">
              {leads.data?.items.map((l) => (
                <label key={l.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(l.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...ids, l.id]
                          : ids.filter((id) => id !== l.id),
                      )
                    }
                  />
                  <span>
                    {l.name}
                    <small className="muted"> · {l.phone}</small>
                  </span>
                </label>
              ))}
            </div>
            {!leads.data?.items.length && (
              <p className="form-note">Nenhum contato encontrado.</p>
            )}
          </>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={busy || (!!group && members.loading)}
          >
            {busy ? "Salvando…" : "Salvar grupo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
