"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Plus, Tags } from "lucide-react";
import { Field } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post, put } from "@/lib/api";
import type { LeadClassification } from "@/lib/types";

export function ClassificationDots({
  items = [],
}: {
  items?: LeadClassification[];
}) {
  return (
    <span className="classification-dots">
      {items.map((item) => (
        <span
          key={item.id}
          className="classification-dot"
          style={{ backgroundColor: item.color }}
          title={item.name}
          role="img"
          aria-label={`Classificação: ${item.name}`}
        />
      ))}
    </span>
  );
}

export function Classifications({
  leadId,
  onSaved,
}: {
  leadId: number;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const assigned = useResource<LeadClassification[]>(
    `/leads/${leadId}/classifications`,
  );
  return (
    <>
      <button
        ref={button}
        type="button"
        className="button secondary compact"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Tags size={15} /> Classificações{" "}
        <ClassificationDots items={assigned.data} />
      </button>
      {open && (
        <ClassificationEditor
          leadId={leadId}
          anchor={button}
          onClose={() => setOpen(false)}
          onSaved={() => {
            assigned.reload();
            onSaved?.();
          }}
        />
      )}
    </>
  );
}

function ClassificationEditor({
  leadId,
  anchor,
  onClose,
  onSaved,
}: {
  leadId: number;
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const catalog = useResource<LeadClassification[]>("/classifications");
  const assigned = useResource<LeadClassification[]>(
    `/leads/${leadId}/classifications`,
  );
  const [selection, setSelection] = useState<number[]>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#56c5ff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = selection ?? assigned.data?.map((item) => item.id) ?? [];
  const loadError = catalog.error || assigned.error;
  const loading = !catalog.data || !assigned.data;

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    function position() {
      const dialog = dialogRef.current;
      const button = anchor.current;
      if (!dialog || !button) return;
      const rect = button.getBoundingClientRect();
      dialog.style.left = `${Math.max(12, Math.min(rect.right - dialog.offsetWidth, window.innerWidth - dialog.offsetWidth - 12))}px`;
      dialog.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - dialog.offsetHeight - 12))}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [anchor, catalog.data, assigned.data, creating, error]);

  async function toggle(id: number) {
    if (saving.current || loading || loadError) return;
    const previous = selected;
    const next = previous.includes(id)
      ? previous.filter((item) => item !== id)
      : [...previous, id];
    if (next.length > 100) {
      setError("Selecione no máximo 100 classificações.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setSelection(next);
    try {
      await put(`/leads/${leadId}/classifications`, {
        classificationIds: next,
      });
      onSaved();
    } catch (e) {
      setSelection(previous);
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function create() {
    if (saving.current || !name.trim()) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await post<LeadClassification>("/classifications", {
        name: name.trim(),
        color,
      });
      setName("");
      setCreating(false);
      catalog.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function close() {
    if (!saving.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="classification-menu"
      aria-label="Classificações do lead"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
    >
      {(error || loadError) && (
        <p role="alert" className="classification-error">
          {error || loadError}
        </p>
      )}
      {loadError && (
        <button
          type="button"
          className="classification-option"
          onClick={() => {
            catalog.reload();
            assigned.reload();
          }}
        >
          Tentar novamente
        </button>
      )}
      {loading && !loadError ? (
        <p className="classification-notice">Carregando classificações…</p>
      ) : (
        <div
          className="classification-options"
          role="group"
          aria-label="Minhas classificações"
        >
          {catalog.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              className="classification-option"
              aria-pressed={selected.includes(item.id)}
              disabled={loading || !!loadError}
              aria-disabled={busy || loading || !!loadError}
              onClick={() => void toggle(item.id)}
            >
              <ClassificationDots items={[item]} />
              <span>{item.name}</span>
            </button>
          ))}
          {catalog.data?.length === 0 && (
            <p className="classification-notice">
              Nenhuma classificação criada.
            </p>
          )}
        </div>
      )}
      <span role="status" className="classification-save-status">
        {busy ? "Salvando…" : ""}
      </span>
      <div className="classification-new">
        {creating ? (
          <div className="classification-create">
            <Field label="Nome">
              <input
                autoFocus
                value={name}
                maxLength={80}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nova classificação"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void create();
                  }
                }}
              />
            </Field>
            <Field label="Cor">
              <input
                type="color"
                value={color}
                disabled={busy}
                onChange={(event) => setColor(event.target.value)}
              />
            </Field>
            <div className="classification-create-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setCreating(false);
                  setName("");
                  setError("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button secondary compact"
                disabled={busy || !name.trim()}
                onClick={() => void create()}
              >
                Criar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="classification-option"
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            <span>Nova classificação</span>
          </button>
        )}
      </div>
    </dialog>
  );
}
