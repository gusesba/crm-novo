"use client";
import type { DashboardData } from "@/lib/types";
import { ArrowDownRight } from "lucide-react";
export function PipelineCard({ d }: { d: DashboardData }) {
  return (
    <section className="panel funnel-panel">
      <div className="panel-heading">
        <div>
          <h2>O pulso da sua carteira</h2>
          <p>Distribuição dos atendimentos</p>
        </div>
      </div>
      <div className="funnel-total">
        <strong>{d.total}</strong>
        <span>leads no período</span>
      </div>
      <div className="stacked-bar">
        {d.statuses.map((s, i) => (
          <span
            key={s.status}
            className={`segment segment-${i}`}
            style={{ flex: s.count }}
            title={`${s.status}: ${s.count}`}
          />
        ))}
      </div>
      <div className="status-list">
        {d.statuses.map((s, i) => (
          <div key={s.status}>
            <span>
              <i className={`legend-dot segment-${i}`} />
              {s.status}
            </span>
            <strong>
              {s.count}
              <small>
                {d.total ? Math.round((s.count / d.total) * 100) : 0}%
              </small>
            </strong>
          </div>
        ))}
      </div>
      <div className="funnel-foot">
        <ArrowDownRight size={16} />
        {d.lost} atendimentos sem conversão
      </div>
    </section>
  );
}
