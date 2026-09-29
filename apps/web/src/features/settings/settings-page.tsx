"use client";
import { useApp } from "@/components/providers";
import { Avatar, Empty, PageHeader } from "@/components/ui";
import type { Named, User } from "@/lib/types";
import { Building2, Pencil, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { SettingsForm } from "./settings-form";
import {
  settingsTitles as titles,
  type SettingsTab as Tab,
} from "./settings-types";
export function SettingsPage() {
  const { user, catalog, refresh, notify } = useApp();
  const [tab, setTab] = useState<Tab>("users");
  const [editing, setEditing] = useState<Named | User>();
  const [open, setOpen] = useState(false);
  if (!user?.isAdmin)
    return (
      <Empty
        title="Acesso administrativo"
        description="Este espaço está reservado à administração."
      />
    );
  const items: (Named | User)[] = catalog?.[tab] || [];
  const canManage = !user.branchId || tab === "users" || tab === "branches";
  return (
    <>
      <PageHeader
        eyebrow="UMA OPERAÇÃO BEM ESTRUTURADA"
        title="Tudo no seu devido lugar."
        description="Gerencie sua equipe, unidades e os cadastros que apoiam cada atendimento."
        actions={
          canManage &&
          !(user.branchId && tab === "branches") && (
            <button
              className="button primary"
              onClick={() => {
                setEditing(undefined);
                setOpen(true);
              }}
            >
              <Plus size={17} />
              Adicionar cadastro
            </button>
          )
        }
      />
      <div className="tabs">
        {(Object.keys(titles) as Tab[]).map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {titles[t]}
          </button>
        ))}
      </div>
      {!canManage && (
        <p className="form-note">
          Este catálogo é compartilhado entre as unidades e gerido pelo
          administrador global.
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{titles[tab]}</h2>
            <p>{items.length} cadastros na sua operação</p>
          </div>
          <Settings2 size={18} />
        </div>
        <div className="settings-list">
          {items.map((item) => (
            <div className="settings-row" key={item.id}>
              {tab === "users" ? (
                <Avatar name={item.name} />
              ) : (
                <span className="workspace-icon">
                  <Building2 size={18} />
                </span>
              )}
              <div>
                <strong>{item.name}</strong>
                {"username" in item && (
                  <p>
                    {item.username} ·{" "}
                    {item.isAdmin ? "Administrador" : "Vendedor"} ·{" "}
                    {catalog?.branches.find((b) => b.id === item.branchId)
                      ?.name || "Global"}
                  </p>
                )}
              </div>
              <span className={`pill ${item.active ? "" : "inactive"}`}>
                {item.active ? "Ativo" : "Inativo"}
              </span>
              {canManage && (
                <button
                  className="icon-button"
                  aria-label={`Editar ${item.name}`}
                  onClick={() => {
                    setEditing(item);
                    setOpen(true);
                  }}
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        {!items.length && <Empty />}
      </section>
      {open && (
        <SettingsForm
          tab={tab}
          item={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await refresh();
            notify("Cadastro salvo com sucesso.");
          }}
        />
      )}
    </>
  );
}
