"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { post, put } from "@/lib/api";
import type { Named, User } from "@/lib/types";
import { useState, type FormEvent } from "react";
import {
  settingsTitles as titles,
  type SettingsTab as Tab,
} from "./settings-types";
export function SettingsForm({
  tab,
  item,
  onClose,
  onSaved,
}: {
  tab: Tab;
  item?: Named | User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { catalog, user } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const u = item && "username" in item ? item : undefined;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload = {
      name: f.get("name"),
      active: f.get("active") === "on",
      ...(tab === "users"
        ? {
            username: f.get("username"),
            password: f.get("password") || null,
            isAdmin: f.get("isAdmin") === "on",
            branchId: f.get("branchId") ? Number(f.get("branchId")) : null,
          }
        : {}),
    };
    const path =
      tab === "services" || tab === "conditions"
        ? `/catalog/items/${item ? item.id : tab === "services" ? "service" : "condition"}`
        : `/catalog/${tab}${item ? `/${item.id}` : ""}`;
    try {
      if (item) await put(path, payload);
      else await post(path, payload);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${item ? "Editar" : "Novo cadastro"} · ${titles[tab]}`}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <Field label="Nome *">
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={item?.name}
          />
        </Field>
        {tab === "users" && (
          <>
            <Field label="Usuário de acesso *">
              <input
                name="username"
                required
                autoComplete="off"
                maxLength={100}
                defaultValue={u?.username}
              />
            </Field>
            <Field
              label={item ? "Nova senha (deixe vazio para manter)" : "Senha *"}
            >
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={10}
                required={!item}
              />
            </Field>
            <Field label="Sede">
              <select
                name="branchId"
                defaultValue={u?.branchId || user?.branchId || ""}
              >
                {!user?.branchId && (
                  <option value="">Global · somente administradores</option>
                )}
                {catalog?.branches
                  .filter((b) => b.active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </Field>
            <label className="person-cell field">
              <input
                type="checkbox"
                name="isAdmin"
                defaultChecked={u?.isAdmin}
              />
              Perfil de administrador
            </label>
          </>
        )}
        <label className="person-cell field">
          <input
            type="checkbox"
            name="active"
            defaultChecked={item?.active ?? true}
          />
          Cadastro ativo
        </label>
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar cadastro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
