"use client";
import { money } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import {
  ArrowUpRight,
  CheckCheck,
  CircleDollarSign,
  ContactRound,
  Target,
  TrendingUp,
} from "lucide-react";
export function StatsCards({ d }: { d: DashboardData }) {
  return (
    <div className="stats-grid">
      {[
        {
          label: "Total de leads",
          value: d.total,
          icon: ContactRound,
          note: "Oportunidades recebidas",
          tone: "mint",
        },
        {
          label: "Matrículas realizadas",
          value: d.sales,
          icon: CheckCheck,
          note: `${d.conversion}% de conversão`,
          tone: "purple",
        },
        {
          label: "Em negociação",
          value: d.open,
          icon: Target,
          note: "Conversas com potencial",
          tone: "orange",
        },
        {
          label: "Receita de vendas",
          value: money(d.revenue),
          icon: CircleDollarSign,
          note: `${d.sales} vendas efetivadas`,
          tone: "green",
        },
      ].map((s, i) => (
        <section
          className={`stat-card ${i === 3 ? "featured" : ""}`}
          key={s.label}
        >
          <div className="stat-top">
            <span>{s.label}</span>
            <span className={`stat-icon ${s.tone}`}>
              <s.icon size={19} />
            </span>
          </div>
          <strong className="stat-value">{s.value}</strong>
          <div className="stat-note">
            {i === 1 ? (
              <TrendingUp size={14} />
            ) : i === 3 ? (
              <ArrowUpRight size={14} />
            ) : (
              <span className="small-dot" />
            )}
            {s.note}
          </div>
          <svg className="stat-spark" viewBox="0 0 110 35" aria-hidden="true">
            <path
              d={
                i % 2
                  ? "M0 29L15 22L28 25L40 17L55 20L69 11L85 15L108 3"
                  : "M0 30L15 27L28 29L40 19L55 22L69 15L85 18L108 5"
              }
            />
          </svg>
        </section>
      ))}
    </div>
  );
}
