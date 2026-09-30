"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import { LeadForm } from "@/features/leads/lead-form";
import { useResource } from "@/hooks/use-resource";
import type { Appointment, DashboardData, PageResult } from "@/lib/types";
import { ArrowRight, CalendarDays, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivityChart } from "./activity-chart";
import { AgendaCard } from "./agenda-card";
import { PipelineCard } from "./pipeline-card";
import { SellerRanking } from "./seller-ranking";
import { StatsCards } from "./stats-cards";

export function Overview() {
  const { user, catalog } = useApp();
  const router = useRouter();
  const [days, setDays] = useState("30");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const periodError =
    days !== "custom"
      ? ""
      : !startDate || !endDate
        ? "Selecione a data inicial e a data final."
        : startDate > endDate
          ? "A data inicial deve ser anterior ou igual à data final."
          : "";
  const periodQuery =
    days === "custom"
      ? `startDate=${startDate}&endDate=${endDate}`
      : `days=${days}`;
  const [selectedBranch, setBranch] = useState("");
  const branch = user?.branchId != null ? String(user.branchId) : selectedBranch;
  const [create, setCreate] = useState(false);
  useEffect(() => {
    if (user && !user.isAdmin) router.replace("/my-leads");
  }, [user, router]);
  const result = useResource<DashboardData>(
    user?.isAdmin && !periodError
      ? `/dashboard?${periodQuery}${branch ? `&branchId=${branch}` : ""}`
      : null,
  );
  const agenda = useResource<PageResult<Appointment>>(
    user?.isAdmin
      ? `/appointments?pageSize=3${branch ? `&branchId=${branch}` : ""}`
      : null,
  );
  if (!user?.isAdmin) return null;
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
          {user.branchId == null && (
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
          )}
          <div className="select-icon">
            <CalendarDays size={15} />
            <select
              aria-label="Período"
              value={days}
              onChange={(e) => {
                if (e.target.value === "custom" && (!startDate || !endDate)) {
                  const end = new Date();
                  const start = new Date(end);
                  start.setDate(start.getDate() - 29);
                  const dateValue = (date: Date) =>
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  setStartDate(dateValue(start));
                  setEndDate(dateValue(end));
                }
                setDays(e.target.value);
              }}
            >
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Último ano</option>
              <option value="custom">Período personalizado</option>
            </select>
          </div>
          {days === "custom" && (
            <>
              <label className="dashboard-date-filter">
                <span>De</span>
                <input
                  type="date"
                  aria-label="Data inicial"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="dashboard-date-filter">
                <span>Até</span>
                <input
                  type="date"
                  aria-label="Data final"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </div>
      {periodError ? (
        <p className="form-note" role="alert">
          {periodError}
        </p>
      ) : result.error ? (
        <ErrorBox message={result.error} retry={result.reload} />
      ) : result.loading || !d ? (
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
