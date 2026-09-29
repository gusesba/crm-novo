"use client";
import { Empty, ErrorBox } from "@/components/ui";
import { date, time } from "@/lib/format";
import type { Appointment, PageResult } from "@/lib/types";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
export function AgendaCard({
  agenda,
  branch,
}: {
  agenda: { data?: PageResult<Appointment>; error: string };
  branch: string;
}) {
  return (
    <section className="panel agenda-panel">
      <div className="panel-heading">
        <div>
          <h2>Próximos passos</h2>
          <p>Retornos que merecem atenção</p>
        </div>
        <Link
          className="icon-button"
          href="/appointments"
          aria-label="Ver agenda"
        >
          <ArrowUpRight size={19} />
        </Link>
      </div>
      {agenda.error ? (
        <ErrorBox message={agenda.error} />
      ) : !agenda.data?.items.length ? (
        <Empty
          title="Agenda em dia"
          description="Seus próximos retornos aparecem aqui."
        />
      ) : (
        <div className="agenda-list">
          {agenda.data.items
            .filter((a) => !branch || a.branchId === Number(branch))
            .slice(0, 3)
            .map((a) => (
              <Link
                href={`/leads?lead=${a.leadId}`}
                key={a.id}
                className="agenda-item"
              >
                <span className="agenda-time">
                  {time(a.dueAt)}
                  <small>{date(a.dueAt)}</small>
                </span>
                <div>
                  <strong>{a.leadName}</strong>
                  <p>{a.note || "Retorno comercial"}</p>
                </div>
                <span className="agenda-dot" />
              </Link>
            ))}
        </div>
      )}
      <Link href="/appointments" className="agenda-link">
        Abrir minha agenda
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}
