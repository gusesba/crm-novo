"use client";
import { useApp } from "@/components/providers";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { api, put } from "@/lib/api";
import { date, time } from "@/lib/format";
import type { Appointment, Lead, PageResult } from "@/lib/types";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppointmentForm } from "./appointment-form";

const pageSize = 10;

export function AppointmentsPage() {
  const { user, catalog, notify } = useApp();
  const params = useSearchParams();
  const leadId = params.get("lead");
  const [mine, setMine] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<Appointment>();
  const [error, setError] = useState("");
  const selectedLead = useResource<Lead>(leadId ? `/leads/${leadId}` : null);
  const result = useResource<PageResult<Appointment>>(
    `/appointments?mine=${mine}&includeCompleted=${completed}&page=${page}&pageSize=${pageSize}${leadId ? `&leadId=${leadId}` : ""}`,
  );
  useEffect(() => setPage(1), [leadId]);
  useEffect(() => {
    if (result.data && !result.data.items.length && result.data.total > 0 && page > 1)
      setPage(page - 1);
  }, [page, result.data]);
  async function toggle(a: Appointment) {
    try {
      await put(`/appointments/${a.id}`, {
        ...a,
        dueAt: a.dueAt.endsWith("Z") ? a.dueAt : a.dueAt + "Z",
        completed: !a.completed,
      });
      result.reload();
      notify(a.completed ? "Retorno reaberto." : "Retorno concluído.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(a: Appointment) {
    if (!window.confirm(`Excluir o retorno de ${a.leadName}?`)) return;
    try {
      await api(`/appointments/${a.id}`, { method: "DELETE" });
      result.reload();
      notify("Retorno excluído.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CADA CONTATO NO TEMPO CERTO"
        title="Seu próximo passo, organizado."
        description="Retornos comerciais para manter as oportunidades em movimento."
        actions={
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            Agendar retorno
          </button>
        }
      />
      <div className="overview-toolbar">
        <div className="tabs">
          <button
            className={!mine ? "active" : ""}
            onClick={() => {
              setMine(false);
              setPage(1);
            }}
          >
            Agenda da unidade
          </button>
          <button
            className={mine ? "active" : ""}
            onClick={() => {
              setMine(true);
              setPage(1);
            }}
          >
            Minha agenda
          </button>
        </div>
        <label className="person-cell muted">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => {
              setCompleted(e.target.checked);
              setPage(1);
            }}
          />
          Mostrar concluídos
        </label>
      </div>
      {leadId && (
        <p className="form-note">
          Exibindo retornos do lead {selectedLead.data?.name || "selecionado"}.{" "}
          <Link href="/appointments" className="text-button">
            Ver toda a agenda
          </Link>
        </p>
      )}
      {(error || result.error) && (
        <ErrorBox message={error || result.error} retry={result.reload} />
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Agenda de relacionamento</h2>
            <p>{result.data?.total || 0} retornos encontrados</p>
          </div>
          <CalendarDays size={20} />
        </div>
        {result.loading ? (
          <Loading />
        ) : !result.data?.items.length ? (
          <Empty
            title="Espaço para o próximo contato"
            description="Agende um retorno para continuar uma boa conversa."
          />
        ) : (
          <div className="appointment-list">
            {result.data.items.map((a) => (
              <div
                className={`appointment-row ${a.completed ? "completed" : ""}`}
                key={a.id}
              >
                <div className="appointment-date">
                  <strong>{time(a.dueAt)}</strong>
                  {date(a.dueAt)}
                </div>
                <div className="appointment-info">
                  <Link href={`/leads?lead=${a.leadId}`}>
                    <h3>{a.leadName}</h3>
                  </Link>
                  <p>{a.note || "Retorno comercial"}</p>
                  <small>
                    {catalog?.users.find((u) => u.id === a.currentSellerId)
                      ?.name || "Consultor"}
                    {!a.completed &&
                      new Date(
                        a.dueAt.endsWith("Z") ? a.dueAt : a.dueAt + "Z",
                      ) < new Date() && (
                        <span className="overdue"> · Retorno pendente</span>
                      )}
                  </small>
                </div>
                {(user?.isAdmin || a.currentSellerId === user?.id) && (
                  <div className="row-actions">
                    <button
                      className="button secondary compact"
                      onClick={() => void toggle(a)}
                    >
                      {a.completed ? (
                        <RotateCcw size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      {a.completed ? "Reabrir" : "Concluir"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Editar retorno de ${a.leadName}`}
                      onClick={() => setEdit(a)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Excluir retorno de ${a.leadName}`}
                      onClick={() => void remove(a)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="table-pagination">
          <span>
            {result.data?.total
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, result.data.total)} de ${result.data.total} retornos`
              : "0 retornos"}
          </span>
          <div>
            <button
              className="icon-button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="page-number">{page}</span>
            <button
              className="icon-button"
              disabled={!result.data || page * pageSize >= result.data.total}
              onClick={() => setPage(page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      {(create || edit) && (
        <AppointmentForm
          appointment={edit}
          initialLeadId={leadId}
          onClose={() => {
            setCreate(false);
            setEdit(undefined);
          }}
          onSaved={() => {
            setCreate(false);
            setEdit(undefined);
            result.reload();
          }}
        />
      )}
    </>
  );
}
