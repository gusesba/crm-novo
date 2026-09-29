"use client";
import { useApp } from "@/components/providers";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { LeadForm } from "@/features/leads/lead-form";
import { useResource } from "@/hooks/use-resource";
import type { Appointment, DashboardData, PageResult } from "@/lib/types";
import { ArrowRight, CalendarDays, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityChart } from "./activity-chart";
import { AgendaCard } from "./agenda-card";
import { PipelineCard } from "./pipeline-card";
import { SellerRanking } from "./seller-ranking";
import { StatsCards } from "./stats-cards";

export function Overview() {
  const { user, catalog } = useApp();
  const [days, setDays] = useState("30");
  const [branch, setBranch] = useState("");
  const [create, setCreate] = useState(false);
  const result = useResource<DashboardData>(
    user?.isAdmin
      ? `/dashboard?days=${days}${branch ? `&branchId=${branch}` : ""}`
      : null,
  );
  const agenda = useResource<PageResult<Appointment>>(
    `/appointments?pageSize=3${branch ? `&branchId=${branch}` : ""}`,
  );
  if (!user?.isAdmin)
    return (
      <Empty
        title="Visão reservada à administração"
        description="Acompanhe sua carteira na área Meus leads."
        action={
          <Link className="button primary" href="/my-leads">
            Ir para meus leads
          </Link>
        }
      />
    );
  const d = result.data;
  return (
    <>
      <PageHeader
        eyebrow="SEU NEGÓCIO EM MOVIMENTO"
        title={`Um bom dia começa por aqui${user.name !== "Administrador" ? `, ${user.name.split(" ")[0]}` : ""}.`}
        description="Uma visão clara dos seus resultados e das próximas oportunidades."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => setCreate(true)}
            >
              <Plus size={17} />
              Novo lead
            </button>
          </>
        }
      />
      <div className="overview-toolbar">
        <div className="live-label">
          <span className="online-dot" /> Visão geral da operação
        </div>
        <div className="filter-row">
          <select
            aria-label="Unidade"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          >
            <option value="">Todas as unidades</option>
            {catalog?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="select-icon">
            <CalendarDays size={15} />
            <select
              aria-label="Período"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Último ano</option>
            </select>
          </div>
        </div>
      </div>
      {result.error ? (
        <ErrorBox message={result.error} retry={result.reload} />
      ) : !d ? (
        <Loading />
      ) : (
        <>
          <StatsCards d={d} />
          <div className="dashboard-middle">
            <ActivityChart d={d} />
            <PipelineCard d={d} />
          </div>
          <div className="dashboard-bottom">
            <SellerRanking d={d} />
            <AgendaCard agenda={agenda} branch={branch} />
          </div>
          <div className="insight-banner">
            <span>
              <Sparkles size={20} />
            </span>
            <div>
              <strong>Seu próximo resultado começa com uma conversa.</strong>
              <p>
                Mantenha os retornos em dia e transforme interesse em novas
                matrículas.
              </p>
            </div>
            <Link href="/my-leads">
              Cuidar dos meus leads
              <ArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
      {create && (
        <LeadForm
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            result.reload();
            agenda.reload();
          }}
        />
      )}
    </>
  );
}
