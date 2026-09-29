"use client";
import { Empty, ErrorBox, Loading } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post } from "@/lib/api";
import { date } from "@/lib/format";
import type { Campaign, CampaignDelivery, PageResult } from "@/lib/types";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  MinusCircle,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";

const campaignLabels: Record<string, string> = {
  running: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  failed: "Falha",
  interrupted: "Interrompido",
};
const deliveryLabels: Record<CampaignDelivery["status"], string> = {
  pending: "Pendente",
  sent: "Enviado",
  skipped: "Ignorado",
  failed: "Falhou",
};
const deliveryDescriptions: Record<CampaignDelivery["status"], string> = {
  pending: "Aguardando processamento.",
  sent: "Envio confirmado pelo WhatsApp.",
  skipped: "O contato não estava mais elegível para receber o disparo.",
  failed: "O WhatsApp não confirmou o envio.",
};
const deliveryIcons = {
  pending: Clock3,
  sent: CheckCircle2,
  skipped: MinusCircle,
  failed: AlertTriangle,
};

export function CampaignTracking() {
  const pageSize = 6;
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string>();
  const [error, setError] = useState("");
  const result = useResource<PageResult<Campaign>>(
    `/whatsapp/campaigns?page=${page}&pageSize=${pageSize}`,
    4000,
  );
  useEffect(() => {
    if (result.data && page > 1 && !result.data.items.length) setPage(page - 1);
  }, [page, result.data]);

  async function cancel(campaign: Campaign) {
    try {
      setError("");
      await post(`/whatsapp/campaigns/${campaign.id}/cancel`);
      result.reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <section className="panel campaign-tracking">
      <div className="panel-heading">
        <div>
          <h2>Acompanhamento dos envios</h2>
          <p>Resultado de cada destinatário e histórico dos disparos</p>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {result.error && (
        <ErrorBox message={result.error} retry={result.reload} />
      )}
      {result.loading && !result.data ? (
        <Loading />
      ) : !result.data?.items.length ? (
        <Empty
          title="Pronto para seu primeiro disparo"
          description="Os disparos e seus resultados aparecerão aqui."
        />
      ) : (
        result.data.items.map((campaign) => {
          const processed = campaign.sent + campaign.failed + campaign.skipped;
          const isExpanded = expanded === campaign.id;
          return (
            <article className="campaign-item" key={campaign.id}>
              <div className="campaign-item-heading">
                <div>
                  <h3>{campaign.name}</h3>
                  <small>
                    {date(campaign.createdAt)} · {campaign.total} destinatários
                    · {campaign.messageCount}{" "}
                    {campaign.messageCount === 1 ? "mensagem" : "mensagens"} por
                    contato
                  </small>
                </div>
                <span className={`pill campaign-status ${campaign.status}`}>
                  {campaignLabels[campaign.status] || campaign.status}
                </span>
              </div>
              <div className="progress-track">
                <div
                  style={{
                    width: `${campaign.total ? (processed / campaign.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="campaign-counts">
                <span className="sent">{campaign.sent} enviados</span>
                <span className="skipped">{campaign.skipped} ignorados</span>
                <span className="failed">{campaign.failed} falhas</span>
                <span>{campaign.total - processed} pendentes</span>
              </div>
              {campaign.error && (
                <p className="campaign-error">{campaign.error}</p>
              )}
              <div className="campaign-actions">
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpanded(isExpanded ? undefined : campaign.id)
                  }
                >
                  {isExpanded ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                </button>
                {campaign.status === "running" && (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => void cancel(campaign)}
                  >
                    <Square size={12} />
                    Cancelar disparo
                  </button>
                )}
              </div>
              {isExpanded && <CampaignDeliveryList campaignId={campaign.id} />}
            </article>
          );
        })
      )}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={result.data?.total || 0}
        noun="disparos"
        onPage={setPage}
      />
    </section>
  );
}

function CampaignDeliveryList({ campaignId }: { campaignId: string }) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const queryStatus = status ? `&status=${status}` : "";
  const result = useResource<PageResult<CampaignDelivery>>(
    `/whatsapp/campaigns/${campaignId}/deliveries?page=${page}&pageSize=${pageSize}${queryStatus}`,
    4000,
  );
  useEffect(() => setPage(1), [status, campaignId]);

  return (
    <div className="campaign-deliveries">
      <div className="campaign-deliveries-heading">
        <strong>Destinatários</strong>
        <select
          aria-label="Filtrar resultado dos envios"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Todos os resultados</option>
          <option value="sent">Enviados</option>
          <option value="failed">Falhas</option>
          <option value="skipped">Ignorados</option>
          <option value="pending">Pendentes</option>
        </select>
      </div>
      {result.error && (
        <ErrorBox message={result.error} retry={result.reload} />
      )}
      {result.loading && !result.data ? (
        <Loading />
      ) : !result.data?.items.length ? (
        <p className="campaign-deliveries-empty">
          Nenhum destinatário registrado para este resultado.
        </p>
      ) : (
        <div className="campaign-delivery-list">
          {result.data.items.map((delivery) => {
            const Icon = deliveryIcons[delivery.status];
            return (
              <div className="campaign-delivery" key={delivery.leadId}>
                <span className={`delivery-icon ${delivery.status}`}>
                  <Icon size={15} />
                </span>
                <div>
                  <strong>{delivery.name}</strong>
                  <small>{delivery.phone}</small>
                  <p>
                    {delivery.error || deliveryDescriptions[delivery.status]}
                  </p>
                </div>
                <div className="campaign-delivery-result">
                  <span className={`delivery-status ${delivery.status}`}>
                    {deliveryLabels[delivery.status]}
                  </span>
                  {delivery.updatedAt && (
                    <small>{date(delivery.updatedAt)}</small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={result.data?.total || 0}
        noun="destinatários"
        onPage={setPage}
      />
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="table-pagination campaign-pagination">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total} ${noun}`
          : `0 ${noun}`}
      </span>
      <div>
        <button
          type="button"
          className="icon-button"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={17} />
        </button>
        <span className="page-number">{page}</span>
        <button
          type="button"
          className="icon-button"
          disabled={page * pageSize >= total}
          onClick={() => onPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
