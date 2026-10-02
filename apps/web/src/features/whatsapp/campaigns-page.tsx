"use client";
import { useApp } from "@/components/providers";
import {
  Badge,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post } from "@/lib/api";
import { statuses } from "@/lib/format";
import type { LeadGroup, Lead, LeadClassification, PageResult } from "@/lib/types";
import { Radio, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  CampaignMessageSequence,
  type CampaignMessageDraft,
} from "./campaign-message-sequence";
import { CampaignTracking } from "./campaign-tracking";
import { Connection } from "./connection";
export function CampaignsPage() {
  const { user, catalog, notify } = useApp();
  const groups = useResource<LeadGroup[]>("/groups");
  const classifications = useResource<LeadClassification[]>("/classifications");
  const [messages, setMessages] = useState<CampaignMessageDraft[]>([
    { id: "message-1", text: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("all");
  const [allSelected, setAllSelected] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    classificationId: "",
    serviceId: "",
    sellerId: "",
    branchId: "",
    groupId: "",
  });
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<{
    payload: Record<string, unknown>;
    leads: Lead[];
  }>();
  const [confirmedIds, setConfirmedIds] = useState<number[]>([]);
  const [trackingRevision, setTrackingRevision] = useState(0);
  function changeFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "branchId" ? { sellerId: "" } : {}),
    }));
    setSelected([]);
    setExcluded([]);
    setAllSelected(true);
    setPage(1);
  }
  const audience = {
    groupId: mode === "group" ? Number(filters.groupId) || null : null,
    status: filters.status || null,
    classificationId: Number(filters.classificationId) || null,
    serviceId: Number(filters.serviceId) || null,
    sellerId: Number(filters.sellerId) || null,
    branchId: Number(filters.branchId) || null,
    search: filters.search || null,
  };
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  Object.entries(audience).forEach(([key, value]) => {
    if (value !== null) params.set(key, String(value));
  });
  const leads = useResource<PageResult<Lead>>(
    mode === "group" && !filters.groupId
      ? null
      : `/whatsapp/campaign-recipients?${params}`,
  );
  const selectionCount = allSelected
    ? Math.max(0, (leads.data?.total || 0) - excluded.length)
    : selected.length;
  function toggleLead(id: number, checked: boolean) {
    if (!allSelected)
      setSelected((current) =>
        checked ? [...current, id] : current.filter((value) => value !== id),
      );
    else
      setExcluded((current) =>
        checked ? current.filter((value) => value !== id) : [...current, id],
      );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const invalidIndex = messages.findIndex(
      (message) => !message.text.trim() && !message.attachment,
    );
    if (invalidIndex >= 0) {
      setError(`Preencha ou remova a mensagem ${invalidIndex + 1}.`);
      return;
    }
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get("name"),
      messages: messages.map(({ text, attachment }) => ({ text, attachment })),
      leadIds: allSelected ? null : selected,
      excludedLeadIds: excluded,
      ...audience,
      intervalSeconds: Number(f.get("interval")),
      intervalVarianceSeconds: Number(f.get("intervalVariance")),
      pauseEvery: Number(f.get("pauseEvery")),
      pauseSeconds: Number(f.get("pauseSeconds")),
    };
    try {
      const recipients = await post<Lead[]>(
        "/whatsapp/campaigns/preview",
        payload,
      );
      setConfirmation({ payload, leads: recipients });
      setConfirmedIds(recipients.map((lead) => lead.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmSend() {
    if (!confirmation || !confirmedIds.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await post("/whatsapp/campaigns", {
        ...confirmation.payload,
        leadIds: confirmedIds,
      });
      notify("Disparo iniciado. Acompanhe o progresso ao lado.");
      setConfirmation(undefined);
      setTrackingRevision((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="ALCANCE COM INTENÇÃO"
        title="Uma sequência. Novas possibilidades."
        description="Prepare mensagens em etapas para os leads selecionados e acompanhe cada envio."
      />
      <Connection />
      <div className="campaign-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Preparar disparo</h2>
              <p>Sequência e público, no mesmo lugar</p>
            </div>
            <Radio size={19} />
          </div>
          <form className="campaign-form" onSubmit={submit}>
            {error && <ErrorBox message={error} />}
            <Field label="Nome do disparo *">
              <input
                name="name"
                required
                maxLength={160}
                placeholder="Ex.: Condições especiais de setembro"
              />
            </Field>
            <Field label="Selecionar destinatários">
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setSelected([]);
                  setExcluded([]);
                  setAllSelected(true);
                  setPage(1);
                }}
              >
                <option value="all">Todos os contatos</option>
                <option value="group">Grupos</option>
              </select>
            </Field>
            {mode === "group" && (
              <Field label="Grupo *">
                <select
                  required
                  value={filters.groupId}
                  onChange={(e) => changeFilter("groupId", e.target.value)}
                >
                  <option value="">Selecione</option>
                  {groups.data?.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.name} · {g.count} contatos
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="form-grid">
              <Field label="Status">
                <select
                  value={filters.status}
                  onChange={(e) => changeFilter("status", e.target.value)}
                >
                  <option value="">Todos os elegíveis</option>
                  {statuses
                    .filter((s) => s !== "Não Enviar Mais")
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
              </Field>
              <Field label="Classificação">
                <select
                  aria-label="Filtrar classificação"
                  value={filters.classificationId}
                  disabled={classifications.loading || !!classifications.error}
                  onChange={(e) => changeFilter("classificationId", e.target.value)}
                >
                  <option value="">
                    {classifications.loading ? "Carregando classificações…" : "Todas as classificações"}
                  </option>
                  {classifications.data?.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
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
              {user?.isAdmin && user.branchId === null && (
                <Field label="Sede">
                  <select
                    value={filters.branchId}
                    onChange={(e) => changeFilter("branchId", e.target.value)}
                  >
                    <option value="">Todas as sedes</option>
                    {catalog?.branches
                      .filter((branch) => branch.active)
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {user?.isAdmin && (
                <Field label="Vendedor">
                  <select
                    value={filters.sellerId}
                    onChange={(e) => changeFilter("sellerId", e.target.value)}
                  >
                    <option value="">Todos os vendedores</option>
                    {catalog?.users
                      .filter(
                        (seller) =>
                          (!user.branchId ||
                            seller.branchId === user.branchId) &&
                          (!filters.branchId ||
                            seller.branchId === Number(filters.branchId)),
                      )
                      .map((seller) => (
                        <option key={seller.id} value={seller.id}>
                          {seller.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </div>
            <Field
              label={`Buscar destinatários · ${mode === "group" && !filters.groupId ? 0 : selectionCount} selecionados`}
            >
              <input
                value={filters.search}
                onChange={(e) => changeFilter("search", e.target.value)}
                placeholder="Nome ou telefone"
              />
            </Field>
            {groups.error && (
              <ErrorBox message={groups.error} retry={groups.reload} />
            )}
            {classifications.error && (
              <ErrorBox message={classifications.error} retry={classifications.reload} />
            )}
            {leads.error && (
              <ErrorBox message={leads.error} retry={leads.reload} />
            )}
            {(mode !== "group" || filters.groupId) &&
              (leads.loading ? (
                <Loading />
              ) : (
                <>
                  <div className="table-wrap campaign-audience-table">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Selecionar ou desmarcar todos os contatos filtrados"
                              title="Selecionar ou desmarcar todos os contatos filtrados, em todas as páginas"
                              disabled={!leads.data?.total}
                              checked={
                                selectionCount > 0 &&
                                selectionCount === leads.data?.total
                              }
                              ref={(input) => {
                                if (input)
                                  input.indeterminate =
                                    selectionCount > 0 &&
                                    selectionCount < (leads.data?.total || 0);
                              }}
                              onChange={(e) => {
                                setAllSelected(e.target.checked);
                                setSelected([]);
                                setExcluded([]);
                              }}
                            />
                          </th>
                          <th>Lead</th>
                          <th>Telefone</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.data?.items.map((lead) => (
                          <tr key={lead.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${lead.name}`}
                                checked={
                                  allSelected
                                    ? !excluded.includes(lead.id)
                                    : selected.includes(lead.id)
                                }
                                onChange={(e) =>
                                  toggleLead(lead.id, e.target.checked)
                                }
                              />
                            </td>
                            <td>{lead.name}</td>
                            <td>{lead.phone}</td>
                            <td>
                              <Badge status={lead.status} />
                            </td>
                          </tr>
                        ))}
                        {!leads.data?.items.length && (
                          <tr>
                            <td colSpan={4}>
                              Nenhum lead encontrado com estes filtros.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="campaign-audience-pagination">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={page === 1}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      Anterior
                    </button>
                    <span>
                      Página {page} de{" "}
                      {Math.max(1, Math.ceil((leads.data?.total || 0) / 20))} ·{" "}
                      {leads.data?.total || 0} leads
                    </span>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={page * 20 >= (leads.data?.total || 0)}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      Próxima
                    </button>
                  </div>
                </>
              ))}
            <p className="form-note">
              Os filtros se aplicam a todos os contatos e grupos. A seleção no
              cabeçalho inclui todas as páginas. Desmarque os leads que não
              deseja incluir. “Não Enviar Mais” é sempre excluído, inclusive
              durante a execução. Até 500 contatos por lote. Não é necessário
              ter uma conversa: tentamos o telefone cadastrado e suas variantes
              com 55 e o nono dígito.
            </p>
            <CampaignMessageSequence
              messages={messages}
              onChange={setMessages}
              onError={setError}
            />
            <div className="form-grid">
              <Field label="Intervalo médio entre mensagens (seg.)">
                <input
                  name="interval"
                  type="number"
                  min={3}
                  max={3600}
                  defaultValue={10}
                  required
                />
              </Field>
              <Field label="Variação para mais ou menos (seg.)">
                <input
                  name="intervalVariance"
                  type="number"
                  min={0}
                  max={1800}
                  defaultValue={3}
                  required
                />
              </Field>
              <Field label="Pausar a cada X mensagens">
                <input
                  name="pauseEvery"
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={20}
                  required
                />
              </Field>
              <Field label="Duração da pausa (seg.)">
                <input
                  name="pauseSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  defaultValue={60}
                  required
                />
              </Field>
            </div>
            <p className="form-note campaign-interval-note">
              Exemplo: intervalo 10 e variação 3 espera aleatoriamente entre 7 e
              13 segundos depois de cada mensagem.
            </p>
            <button
              className="button primary"
              disabled={
                busy ||
                leads.loading ||
                selectionCount === 0 ||
                (mode === "group" && !filters.groupId)
              }
            >
              <Send size={16} />
              {busy ? "Preparando…" : "Enviar disparos"}
            </button>
          </form>
        </section>
        <CampaignTracking key={trackingRevision} />
      </div>
      {confirmation && (
        <Modal
          title="Confirmar disparo"
          description={`${confirmedIds.length} leads selecionados. Confira os destinatários e seus status antes de enviar.`}
          wide
          onClose={() => {
            if (!busy) setConfirmation(undefined);
          }}
        >
          <div className="modal-form">
            <div className="table-wrap campaign-confirmation-table">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Selecionar ou desmarcar todos os contatos da confirmação"
                        title="Selecionar ou desmarcar todos"
                        disabled={busy}
                        checked={
                          confirmedIds.length === confirmation.leads.length
                        }
                        ref={(input) => {
                          if (input)
                            input.indeterminate =
                              confirmedIds.length > 0 &&
                              confirmedIds.length < confirmation.leads.length;
                        }}
                        onChange={(e) =>
                          setConfirmedIds(
                            e.target.checked
                              ? confirmation.leads.map((lead) => lead.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>Lead</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th>Vendedor</th>
                    <th>Sede</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmation.leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={busy}
                          aria-label={`Enviar para ${lead.name}`}
                          checked={confirmedIds.includes(lead.id)}
                          onChange={(e) =>
                            setConfirmedIds((current) =>
                              e.target.checked
                                ? [...current, lead.id]
                                : current.filter((id) => id !== lead.id),
                            )
                          }
                        />
                      </td>
                      <td>{lead.name}</td>
                      <td>{lead.phone}</td>
                      <td>
                        <Badge status={lead.status} />
                      </td>
                      <td>
                        {catalog?.users.find(
                          (seller) => seller.id === lead.currentSellerId,
                        )?.name || "—"}
                      </td>
                      <td>
                        {catalog?.branches.find(
                          (branch) => branch.id === lead.branchId,
                        )?.name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirmation(undefined)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy || !confirmedIds.length}
                onClick={() => void confirmSend()}
              >
                <Send size={16} />
                {busy
                  ? "Enviando…"
                  : `Confirmar envio para ${confirmedIds.length} leads`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
