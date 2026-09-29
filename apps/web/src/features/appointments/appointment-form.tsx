"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field, Modal } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post, put } from "@/lib/api";
import type { Appointment, Lead, PageResult } from "@/lib/types";
import { useState, type FormEvent } from "react";
export function AppointmentForm({
  appointment,
  initialLeadId,
  onClose,
  onSaved,
}: {
  appointment?: Appointment;
  initialLeadId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, notify } = useApp();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const leads = useResource<PageResult<Lead>>(
    `/leads?mine=${!user?.isAdmin}&pageSize=100&search=${encodeURIComponent(search)}`,
  );
  const exact = useResource<Lead>(
    initialLeadId ? `/leads/${initialLeadId}` : null,
  );
  const items = leads.data?.items || [];
  const options =
    exact.data && !items.some((x) => x.id === exact.data!.id)
      ? [exact.data, ...items]
      : items;
  const localDate = appointment
    ? new Date(
        new Date(
          appointment.dueAt.endsWith("Z")
            ? appointment.dueAt
            : appointment.dueAt + "Z",
        ).getTime() -
          new Date().getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const payload = {
      leadId: appointment?.leadId || Number(f.get("leadId")),
      dueAt: new Date(String(f.get("dueAt"))).toISOString(),
      note: f.get("note"),
      completed: appointment?.completed || false,
    };
    try {
      if (appointment) await put(`/appointments/${appointment.id}`, payload);
      else await post("/appointments", payload);
      notify("Retorno salvo na agenda.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={appointment ? "Editar retorno" : "Agendar próximo contato"}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}{" "}
        {!appointment && (
          <>
            <Field label="Buscar cliente">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite o nome para localizar"
              />
            </Field>
            <Field label="Cliente *">
              <select name="leadId" required defaultValue={initialLeadId || ""}>
                <option value="">Selecione o lead</option>
                {options.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Data e horário *">
          <input
            name="dueAt"
            type="datetime-local"
            required
            defaultValue={localDate}
          />
        </Field>
        <Field label="Observação">
          <textarea
            name="note"
            rows={3}
            maxLength={2000}
            defaultValue={appointment?.note || ""}
          />
        </Field>
        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar retorno"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
