"use client";
import { date } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export function ActivityChart({ d }: { d: DashboardData }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Oportunidades que viram conquistas</h2>
          <p>Novos leads e matrículas por dia de captação</p>
        </div>
        <span className="panel-icon">
          <TrendingUp size={19} />
        </span>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-dot leads" />
          Leads recebidos
        </span>
        <span>
          <i className="legend-dot sales" />
          Matrículas
        </span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={d.daily}
            margin={{ left: -25, right: 8, top: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#72b79d" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#72b79d" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 6"
              vertical={false}
              stroke="#e9eeeb"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => v.slice(8) + "/" + v.slice(5, 7)}
              tickLine={false}
              axisLine={false}
              minTickGap={38}
              tick={{ fill: "#919b96", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#919b96", fontSize: 11 }}
            />
            <Tooltip
              labelFormatter={(label) => date(String(label) + "T12:00:00Z")}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e7ece9",
                fontSize: 12,
              }}
            />
            <Area
              name="Leads"
              type="monotone"
              dataKey="leads"
              stroke="#4a9578"
              strokeWidth={2.5}
              fill="url(#leadFill)"
            />
            <Area
              name="Matrículas"
              type="monotone"
              dataKey="sales"
              stroke="#b0a4d4"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="transparent"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
