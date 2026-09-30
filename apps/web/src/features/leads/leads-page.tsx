"use client";
import { useApp } from "@/components/providers";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/api";
import { statuses } from "@/lib/format";
import type { Lead, PageResult } from "@/lib/types";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LeadForm } from "./lead-form";
import { LeadsTable } from "./leads-table";
import { TransferModal } from "./transfer-modal";
export function LeadsPage({
  mode = "all",
}: {
  mode?: "all" | "mine" | "sales";
}) {
  const { user, catalog } = useApp();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [seller, setSeller] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Lead>();
  const [create, setCreate] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = new URLSearchParams({
    search: debounced,
    page: String(page),
    pageSize: "10",
    mine: String(mode === "mine"),
    sales: String(mode === "sales"),
  });
  if (status) query.set("status", status);
  if (service) query.set("serviceId", service);
  if (seller) query.set("sellerId", seller);
  if (branch) query.set("branchId", branch);
  const result = useResource<PageResult<Lead>>(`/leads?${query}`);
  useEffect(() => {
    setSelected([]);
  }, [page, debounced, status, service, seller, branch]);
  const deepLink = searchParams.get("lead");
  useEffect(() => {
    if (deepLink)
      api<Lead>(`/leads/${deepLink}`)
        .then(setEditing)
        .catch((e) => setError(e.message));
  }, [deepLink]);
  const title =
    mode === "mine"
      ? "Sua próxima conquista está aqui."
      : mode === "sales"
        ? "Conversas que viraram conquistas."
        : "Cada lead, uma nova possibilidade.";
  return (
    <>
      <PageHeader
        eyebrow={
          mode === "sales" ? "VENDAS EFETIVADAS" : "RELACIONAMENTO COM DIREÇÃO"
        }
        title={title}
        description={
          mode === "sales"
            ? "Acompanhe as matrículas e os resultados da sua operação."
            : "Organize sua carteira, acompanhe negociações e mantenha o próximo passo à vista."
        }
        actions={
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            Novo lead
          </button>
        }
      />
      <section className="panel leads-panel">
        <div className="table-title">
          <div>
            <UsersRound size={19} />
            <h2>
              {mode === "mine"
                ? "Meus leads"
                : mode === "sales"
                  ? "Matrículas realizadas"
                  : "Carteira de leads"}
            </h2>
            <span className="count-pill">{result.data?.total || 0}</span>
          </div>
          {selected.length > 0 && user?.isAdmin && (
            <button
              className="button secondary compact"
              onClick={() => setTransfer(true)}
            >
              <ArrowLeftRight size={15} />
              Transferir {selected.length}
            </button>
          )}
        </div>
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Buscar leads"
              placeholder="Buscar por nome ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-row">
            <Filter size={16} />
            {mode !== "sales" && (
              <select
                aria-label="Filtrar status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os status</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
            <select
              aria-label="Filtrar serviço"
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os serviços</option>
              {catalog?.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {mode !== "mine" && (
              <select
                aria-label="Filtrar vendedor"
                value={seller}
                onChange={(e) => {
                  setSeller(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os vendedores</option>
                {catalog?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            {!user?.branchId && (
              <select
                aria-label="Filtrar sede"
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas as sedes</option>
                {catalog?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {(error || result.error) && (
          <ErrorBox message={error || result.error} retry={result.reload} />
        )}
        {result.loading ? (
          <Loading />
        ) : !result.data?.items.length ? (
          <Empty />
        ) : (
          <LeadsTable
            items={result.data.items}
            user={user}
            catalog={catalog}
            selected={selected}
            setSelected={setSelected}
            setEditing={setEditing}
          />
        )}
        <div className="table-pagination">
          <span>
            {result.data?.total
              ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, result.data.total)} de ${result.data.total} registros`
              : "0 registros"}
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
              disabled={!result.data || page * 10 >= result.data.total}
              onClick={() => setPage(page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      {(create || editing) && (
        <LeadForm
          lead={editing}
          onDeleted={() => {
            setEditing(undefined);
            setSelected([]);
            result.reload();
          }}
          onClose={() => {
            setCreate(false);
            setEditing(undefined);
          }}
          onSaved={() => {
            setCreate(false);
            setEditing(undefined);
            result.reload();
          }}
        />
      )}{" "}
      {transfer && (
        <TransferModal
          ids={selected}
          onClose={() => setTransfer(false)}
          onSaved={() => {
            setTransfer(false);
            setSelected([]);
            result.reload();
          }}
        />
      )}
    </>
  );
}
