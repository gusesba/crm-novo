"use client";
import { initials, statusClass } from "@/lib/format";
import { Inbox, LoaderCircle, X } from "lucide-react";
import { useApp } from "./providers";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function Avatar({
  name,
  small = false,
  src,
  eager = false,
}: {
  name: string;
  small?: boolean;
  src?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`avatar ${small ? "small" : ""} tone-${name.length % 5}`}>
      {initials(name)}
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${statusClass(status)}`}>
      <i />
      {status}
    </span>
  );
}
export function Loading() {
  return (
    <div className="state">
      <LoaderCircle className="spin" size={25} />
      <span>Carregando seu espaço…</span>
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { notify } = useApp();
  const lastMessage = useRef("");
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    if (message && message !== lastMessage.current)
      notify(message, "error", retryRef.current ? () => retryRef.current?.() : undefined);
    lastMessage.current = message;
  }, [message, notify]);
  return null;
}
export function Empty({
  title = "Nenhum registro encontrado",
  description = "Adicione um registro ou ajuste os filtros para continuar.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
