"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, PageHeader } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post } from "@/lib/api";
import { statuses } from "@/lib/format";
import type { ContactGroup, Lead, PageResult } from "@/lib/types";
import { Radio, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  CampaignMessageSequence,
  type CampaignMessageDraft,
} from "./campaign-message-sequence";
import { CampaignTracking } from "./campaign-tracking";
import { Connection } from "./connection";
export function CampaignsPage() {
  const { catalog, notify } = useApp();
  const groups = useResource<ContactGroup[]>("/groups");
  const [messages, setMessages] = useState<CampaignMessageDraft[]>([
    { id: "message-1", text: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("filters");
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [trackingRevision, setTrackingRevision] = useState(0);
  const leads = useResource<PageResult<Lead>>(
    mode === "manual"
      ? `/leads?mine=true&pageSize=100&search=${encodeURIComponent(search)}`
      : null,
  );
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
      leadIds: mode === "manual" ? selected : null,
      groupId: mode === "group" ? Number(f.get("groupId")) : null,
      status: mode === "filters" ? f.get("status") || null : null,
      serviceId:
        mode === "filters" && f.get("serviceId")
          ? Number(f.get("serviceId"))
          : null,
      intervalSeconds: Number(f.get("interval")),
      intervalVarianceSeconds: Number(f.get("intervalVariance")),
      pauseEvery: Number(f.get("pauseEvery")),
      pauseSeconds: Number(f.get("pauseSeconds")),
    };
    try {
      await post("/whatsapp/campaigns", payload);
      notify("Disparo iniciado. Acompanhe o progresso ao lado.");
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
        description="Prepare mensagens em etapas para os contatos da sua carteira e acompanhe cada envio."
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
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="filters">Por filtros da carteira</option>
                <option value="group">Grupo de contatos</option>
                <option value="manual">Selecionar individualmente</option>
              </select>
            </Field>
            {mode === "filters" ? (
              <div className="form-grid">
                <Field label="Status">
                  <select name="status">
                    <option value="">Todos os elegíveis</option>
                    {statuses
                      .filter((s) => s !== "Não Enviar Mais")
                      .map((s) => (
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
              </div>
            ) : mode === "group" ? (
              <Field label="Grupo *">
                <select name="groupId" required>
                  <option value="">Selecione</option>
                  {groups.data?.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.name} · {g.count} contatos
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field
                  label={`Buscar destinatários · ${selected.length} selecionados`}
                >
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nome ou telefone"
                  />
                </Field>
                <div className="check-list">
                  {leads.data?.items
                    .filter((l) => l.status !== "Não Enviar Mais")
                    .map((l) => (
                      <label key={l.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(l.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, l.id]
                                : selected.filter((id) => id !== l.id),
                            )
                          }
                        />
                        {l.name}
                      </label>
                    ))}
                </div>
              </>
            )}
            <p className="form-note">
              Somente sua carteira atual. “Não Enviar Mais” é sempre excluído,
              inclusive durante a execução. Até 500 contatos por lote.
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
            <button className="button primary" disabled={busy}>
              <Send size={16} />
              {busy ? "Preparando…" : "Iniciar disparo"}
            </button>
          </form>
        </section>
        <CampaignTracking key={trackingRevision} />
      </div>
    </>
  );
}
