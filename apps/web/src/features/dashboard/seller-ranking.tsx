"use client";
import { Avatar, Empty } from "@/components/ui";
import { money } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
export function SellerRanking({ d }: { d: DashboardData }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Quem faz acontecer</h2>
          <p>Resultados por consultor comercial</p>
        </div>
        <Link className="text-button" href="/leads">
          Ver carteira
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {!d.sellers.length ? (
        <Empty />
      ) : (
        <div className="table-scroll">
          <table className="seller-table">
            <thead>
              <tr>
                <th>CONSULTOR</th>
                <th>LEADS</th>
                <th>MATRÍCULAS</th>
                <th>VENDAS</th>
              </tr>
            </thead>
            <tbody>
              {d.sellers.map((s, i) => (
                <tr key={s.id}>
                  <td>
                    <div className="person-cell">
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Avatar small name={s.name} />
                      <strong>{s.name}</strong>
                    </div>
                  </td>
                  <td>{s.leads}</td>
                  <td>
                    <span className="sales-count">{s.sales}</span>
                  </td>
                  <td className="money-cell">{money(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
