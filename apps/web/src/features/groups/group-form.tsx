"use client";
import { useApp } from "@/components/providers";
import { Badge, ErrorBox, Field, Loading, Modal } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post, put } from "@/lib/api";
import { date, phone, statuses } from "@/lib/format";
import type { LeadGroup, Lead } from "@/lib/types";
import { useState, type FormEvent } from "react";

export function GroupForm({
  group,
  onClose,
  onSaved,
}: {
  group?: LeadGroup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, catalog, notify } = useApp();
  const [selected, setSelected] = useState<number[] | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    serviceId: "",
    sellerId: "",
    branchId: "",
    createdFrom: "",
    createdTo: "",
  });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const members = useResource<{ members: Lead[] }>(
    group ? `/groups/${group.id}` : null,
  );
  const query = new URLSearchParams();
  for (const key of [
    "search",
    "status",
    "serviceId",
    "sellerId",
    "branchId",
  ] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  if (filters.createdFrom)
    query.set(
      "createdFrom",
      new Date(`${filters.createdFrom}T00:00:00`).toISOString(),
    );
  if (filters.createdTo) {
    const end = new Date(`${filters.createdTo}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query.set("createdTo", end.toISOString());
  }
  const invalidDates = !!(
    filters.createdFrom &&
    filters.createdTo &&
    filters.createdFrom > filters.createdTo
  );
  const leads = useResource<Lead[]>(
    invalidDates ? null : `/groups/leads?${query}`,
  );
  const items = invalidDates ? [] : (leads.data ?? []);
  const memberIds = new Set(members.data?.members.map((l) => l.id) ?? []);
  const orderedItems = group
    ? [...items].sort(
        (a, b) => Number(memberIds.has(b.id)) - Number(memberIds.has(a.id)),
      )
    : items;
  const filteredIds = new Set(items.map((l) => l.id));
  const ids = (selected ?? members.data?.members.map((l) => l.id) ?? []).filter(
    (id) => filteredIds.has(id),
  );
  const selectedIds = new Set(ids);
  const filteredSelectionCount = items.filter((l) =>
    selectedIds.has(l.id),
  ).length;
  const selectionDisabled =
    busy ||
    leads.loading ||
    !!leads.error ||
    invalidDates ||
    (!!group && (members.loading || !!members.error));
  const sellers = catalog?.users.filter((seller) =>
    user?.branchId != null
      ? seller.branchId === user.branchId
      : !filters.branchId || seller.branchId === Number(filters.branchId),
  );
  function changeFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "branchId" ? { sellerId: "" } : {}),
    }));
    setSelected([]);
    setPage(1);
  }
  function selectAll(checked: boolean) {
    setSelected(checked ? [...filteredIds] : []);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get("name"),
      leadIds: ids,
      search: filters.search || null,
      status: filters.status || null,
      serviceId: filters.serviceId ? Number(filters.serviceId) : null,
      sellerId: filters.sellerId ? Number(filters.sellerId) : null,
      branchId: filters.branchId ? Number(filters.branchId) : null,
      createdFrom: query.get("createdFrom"),
      createdTo: query.get("createdTo"),
    };
    try {
      if (group) await put(`/groups/${group.id}`, payload);
      else await post("/groups", payload);
      notify("Grupo de leads salvo.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={group ? "Participantes do grupo de leads" : "Criar grupo de leads"}
      description="Filtre e selecione leads, mesmo sem vínculo com um contato ou conversa no WhatsApp."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {(error || members.error || leads.error) && (
          <ErrorBox message={error || members.error || leads.error} />
        )}
        <Field label="Nome do grupo *">
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={group?.name}
            placeholder="Ex.: Interessados em primeira habilitação"
          />
        </Field>
        <Field label="Buscar leads">
          <input
            value={filters.search}
            onChange={(e) => changeFilter("search", e.target.value)}
            placeholder="Buscar por nome ou telefone"
          />
        </Field>
        <div className="form-grid">
          <Field label="Status">
            <select
              value={filters.status}
              onChange={(e) => changeFilter("status", e.target.value)}
            >
              <option value="">Todos os status</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Serviço">
            <select
              value={filters.serviceId}
              onChange={(e) => changeFilter("serviceId", e.target.value)}
            >
              <option value="">Todos os serviços</option>
              {catalog?.services.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {user?.isAdmin && (
            <Field label="Vendedor">
              <select
                value={filters.sellerId}
                onChange={(e) => changeFilter("sellerId", e.target.value)}
              >
                <option value="">Todos os vendedores</option>
                {sellers?.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {user?.isAdmin && user.branchId == null && (
            <Field label="Sede">
              <select
                value={filters.branchId}
                onChange={(e) => changeFilter("branchId", e.target.value)}
              >
                <option value="">Todas as sedes</option>
                {catalog?.branches.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Data de cadastro · de">
            <input
              type="date"
              value={filters.createdFrom}
              max={filters.createdTo || undefined}
              onChange={(e) => changeFilter("createdFrom", e.target.value)}
            />
          </Field>
          <Field label="Data de cadastro · até">
            <input
              type="date"
              value={filters.createdTo}
              min={filters.createdFrom || undefined}
              onChange={(e) => changeFilter("createdTo", e.target.value)}
            />
          </Field>
        </div>
        {invalidDates && (
          <p className="form-note" role="alert">
            A data inicial deve ser anterior ou igual à data final.
          </p>
        )}
        <div className="table-title">
          <div>
            <h2>Selecionar leads</h2>
            <span className="count-pill">{ids.length} selecionados</span>
          </div>
          <div>
            <button
              type="button"
              className="text-button"
              disabled={selectionDisabled || !items.length}
              onClick={() => selectAll(true)}
            >
              Selecionar tudo
            </button>
            <button
              type="button"
              className="text-button"
              disabled={selectionDisabled || !filteredSelectionCount}
              onClick={() => selectAll(false)}
            >
              Desmarcar tudo
            </button>
          </div>
        </div>
        <p className="form-note">
          Selecionar e desmarcar tudo se aplica aos resultados filtrados em
          todas as páginas. Ao alterar os filtros, a seleção é desmarcada.
          Apenas leads da filtragem atual podem entrar no grupo. Leads bloqueados
          não recebem disparos.
        </p>
        {leads.loading || (!!group && members.loading) ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Selecionar ou desmarcar todos os leads filtrados"
                      disabled={selectionDisabled || !items.length}
                      checked={
                        items.length > 0 &&
                        filteredSelectionCount === items.length
                      }
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            filteredSelectionCount > 0 &&
                            filteredSelectionCount < items.length;
                      }}
                      onChange={(e) => selectAll(e.target.checked)}
                    />
                  </th>
                  <th>Lead</th>
                  <th>Status</th>
                  <th>Serviço</th>
                  <th>Vendedor</th>
                  <th>Sede</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {orderedItems.slice((page - 1) * 20, page * 20).map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${lead.name}`}
                        disabled={selectionDisabled}
                        checked={selectedIds.has(lead.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...ids, lead.id]
                              : ids.filter((id) => id !== lead.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="stack-cell">
                        <strong>{lead.name}</strong>
                        <small>{phone(lead.phone)}</small>
                      </div>
                    </td>
                    <td>
                      <Badge status={lead.status} />
                    </td>
                    <td>
                      {catalog?.services.find((s) => s.id === lead.serviceId)
                        ?.name || "—"}
                    </td>
                    <td>
                      {catalog?.users.find((s) => s.id === lead.currentSellerId)
                        ?.name || "—"}
                    </td>
                    <td>
                      {catalog?.branches.find((b) => b.id === lead.branchId)
                        ?.name || "—"}
                    </td>
                    <td>
                      {date(lead.createdAt, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={7}>
                      Nenhum lead encontrado com estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-pagination">
          <span>
            {items.length} leads · Página {page} de{" "}
            {Math.max(1, Math.ceil(items.length / 20))}
          </span>
          <div>
            <button
              type="button"
              className="text-button"
              disabled={selectionDisabled || page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="text-button"
              disabled={selectionDisabled || page * 20 >= items.length}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={selectionDisabled}>
            {busy ? "Salvando…" : "Salvar grupo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
