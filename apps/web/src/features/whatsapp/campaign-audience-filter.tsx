"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function CampaignAudienceFilter({ label, options, values, onChange, emptyLabel, disabled = false }: {
  label: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const summary = values.length ? options.filter((option) => values.includes(option.value)).map((option) => option.label).join(", ") : emptyLabel;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className="field campaign-multi-filter">
      <span id={labelId}>{label}</span>
      <div ref={root} className="campaign-filter-control"
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            button.current?.focus();
          }
        }}
      >
        <button ref={button} type="button" className="campaign-filter-toggle" disabled={disabled}
          aria-label={label + ": " + summary} aria-expanded={open} aria-controls={labelId + "-options"}
          onClick={() => setOpen((current) => !current)} title={summary}>
          <span>{summary}</span><ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div id={labelId + "-options"} className="campaign-multi-options" role="group" aria-labelledby={labelId}>
            <button type="button" className="text-button" disabled={disabled || !values.length} onClick={() => onChange([])}>Limpar filtro {label}</button>
            {options.map((option) => (
              <label key={option.value}>
                <input type="checkbox" aria-label={option.label} checked={values.includes(option.value)} disabled={disabled}
                  onChange={(event) => onChange(event.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value))} />
                <span>{option.label}</span>
              </label>
            ))}
            {!options.length && <p>Nenhuma opção disponível.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
