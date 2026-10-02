"use client";
import { Avatar, Badge } from "@/components/ui";
import { date, money, phone } from "@/lib/format";
import type { Catalog, Lead, User } from "@/lib/types";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { LeadConversationButton } from "./lead-conversation-button";
export function LeadsTable({
  items,
  user,
  catalog,
  selected,
  setSelected,
  setEditing,
}: {
  items: Lead[];
  user: User | null;
  catalog?: Catalog;
  selected: number[];
  setSelected: (ids: number[]) => void;
  setEditing: (lead: Lead) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {user?.isAdmin && (
              <th>
                <input
                  type="checkbox"
                  aria-label="Selecionar página"
                  checked={selected.length === items.length}
                  onChange={(e) =>
                    setSelected(e.target.checked ? items.map((l) => l.id) : [])
                  }
                />
              </th>
            )}
            <th>CLIENTE</th>
            <th>SERVIÇO / ORIGEM</th>
            <th>STATUS</th>
            <th>CLASSIFICAÇÕES</th>
            <th>VENDEDOR ATUAL</th>
            <th>VALOR</th>
            <th>ENTRADA</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              {user?.isAdmin && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${l.name}`}
                    checked={selected.includes(l.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, l.id]
                          : selected.filter((id) => id !== l.id),
                      )
                    }
                  />
                </td>
              )}
              <td>
                <button
                  className="person-cell row-link"
                  onClick={() => setEditing(l)}
                >
                  <Avatar name={l.name} />
                  <span>
                    <strong>{l.name}</strong>
                    <small>{phone(l.phone)}</small>
                  </span>
                </button>
              </td>
              <td>
                <div className="stack-cell">
                  <span>
                    {catalog?.services.find((s) => s.id === l.serviceId)
                      ?.name || "Não informado"}
                  </span>
                  <small>{l.origin}</small>
                </div>
              </td>
              <td>
                <Badge status={l.status} />
              </td>
              <td>
                {l.classifications?.length ? (
                  <div className="lead-classification-list">
                    {l.classifications.map((item) => (
                      <span
                        key={item.id}
                        className="badge lead-classification-badge"
                        style={{ backgroundColor: `${item.color}22`, borderColor: `${item.color}66` }}
                      >
                        <i style={{ backgroundColor: item.color }} aria-hidden="true" />
                        {item.name}
                      </span>
                    ))}
                  </div>
                ) : <span className="muted" aria-label="Sem classificação">—</span>}
              </td>
              <td>
                <div className="person-cell">
                  <Avatar
                    small
                    name={
                      catalog?.users.find((u) => u.id === l.currentSellerId)
                        ?.name || "Vendedor"
                    }
                  />
                  <span>
                    {catalog?.users
                      .find((u) => u.id === l.currentSellerId)
                      ?.name.split(" ")[0] || "—"}
                  </span>
                </div>
              </td>
              <td className="money-cell">{money(l.value)}</td>
              <td className="muted">{date(l.createdAt)}</td>
              <td>
                <div className="row-actions">
                  {l.currentSellerId === user?.id && l.status !== "Não Enviar Mais" && (
                    <LeadConversationButton lead={l} />
                  )}
                  <button
                    className="icon-button"
                    onClick={() => setEditing(l)}
                    aria-label={`Abrir ${l.name}`}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                  <Link
                    className="text-button"
                    href={`/appointments?lead=${l.id}`}
                    aria-label={`Retornos de ${l.name}`}
                  >
                    Agenda
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
