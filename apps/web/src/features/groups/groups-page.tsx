"use client";
import { useApp } from "@/components/providers";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/api";
import type { ContactGroup } from "@/lib/types";
import { ArrowUpRight, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { GroupForm } from "./group-form";
export function GroupsPage() {
  const { notify } = useApp();
  const result = useResource<ContactGroup[]>("/groups");
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<ContactGroup>();
  const [error, setError] = useState("");
  async function remove(group: ContactGroup) {
    if (
      !window.confirm(
        `Excluir o grupo ${group.name}? Os leads serão preservados.`,
      )
    )
      return;
    try {
      await api(`/groups/${group.id}`, { method: "DELETE" });
      result.reload();
      notify("Grupo excluído.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CONVERSAS COM ALGO EM COMUM"
        title="Públicos certos. Mais proximidade."
        description="Organize contatos da sua carteira em grupos internos para facilitar os disparos."
        actions={
          <button className="button primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            Criar grupo
          </button>
        }
      />
      {(error || result.error) && (
        <ErrorBox message={error || result.error} retry={result.reload} />
      )}{" "}
      {result.loading ? (
        <Loading />
      ) : !result.data?.length ? (
        <section className="panel">
          <Empty
            title="Seu primeiro público começa aqui"
            description="Crie grupos por serviço, status ou selecionando os contatos da sua carteira."
            action={
              <button
                className="button secondary"
                onClick={() => setCreate(true)}
              >
                Criar meu primeiro grupo
              </button>
            }
          />
        </section>
      ) : (
        <div className="cards-grid">
          {result.data.map((g) => (
            <section className="panel group-card" key={g.id}>
              <div className="group-card-top">
                <span className="group-icon">
                  <UsersRound size={23} />
                </span>
                <button
                  className="icon-button"
                  aria-label={`Excluir ${g.name}`}
                  onClick={() => void remove(g)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <h3>{g.name}</h3>
              <p>{g.count} contatos na sua carteira</p>
              <div className="group-card-footer">
                <span className="pill">Grupo interno</span>
                <button className="text-button" onClick={() => setEdit(g)}>
                  Ver participantes
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {(create || edit) && (
        <GroupForm
          group={edit}
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
