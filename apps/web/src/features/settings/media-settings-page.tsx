"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { Empty, ErrorBox, Field, Loading, Modal } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { post, put } from "@/lib/api";

type Usage = { bytes: number; count: number };
type Settings = { retentionEnabled: boolean; retentionDays: number };
type Status = {
  settings: Settings;
  chat: Usage;
  campaign: Usage;
  profiles: Usage;
  totalBytes: number;
  totalCount: number;
  databaseBytes: number;
};
type Preview = {
  days: number;
  before: number;
  chat: Usage;
  campaign: Usage;
  profiles: Usage;
  totalBytes: number;
  totalCount: number;
};

export function storageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** unit).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${["B", "KB", "MB", "GB"][unit]}`;
}

export function MediaSettingsPage() {
  const { user, notify } = useApp();
  const allowed = !!user?.isAdmin && user.branchId == null;
  const result = useResource<Status>(allowed ? "/settings/media" : null);
  const [draft, setDraft] = useState<{
    retentionEnabled: boolean;
    retentionDays: string;
  }>();
  const [days, setDays] = useState("30");
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settings = draft || {
    retentionEnabled: result.data?.settings.retentionEnabled || false,
    retentionDays: String(result.data?.settings.retentionDays || 30),
  };
  const validDays = (value: string) =>
    /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 3650;

  if (!allowed)
    return (
      <Empty
        title="Acesso do administrador global"
        description="A mídia é compartilhada entre as contas e gerida pelo administrador global."
      />
    );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!validDays(settings.retentionDays)) return;
    setBusy(true);
    setError("");
    try {
      await put("/settings/media", {
        ...settings,
        retentionDays: Number(settings.retentionDays),
      });
      notify("Configuração de mídia salva.");
      result.reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepareCleanup(event: FormEvent) {
    event.preventDefault();
    if (!validDays(days)) return;
    setBusy(true);
    setError("");
    try {
      setPreview(
        await post<Preview>("/settings/media/cleanup-preview", {
          days: Number(days),
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cleanup() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const cleaned = await post<Preview>("/settings/media/cleanup", {
        days: preview.days,
        confirmed: true,
      });
      setPreview(undefined);
      result.reload();
      notify(
        `${cleaned.totalCount} arquivos removidos (${storageSize(cleaned.totalBytes)}). Mensagens preservadas.`,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-settings">
      <div className="overview-toolbar">
        <Link href="/settings" className="button secondary">
          <ArrowLeft size={16} />
          Configurações
        </Link>
        <button
          className="button secondary"
          disabled={busy || result.loading}
          onClick={result.reload}
        >
          <RefreshCw size={16} />
          Atualizar uso
        </button>
      </div>
      <div className="media-settings-title">
        <HardDrive size={24} />
        <div>
          <h2>Mídia e armazenamento</h2>
          <p>Arquivos locais de todas as contas do CRM.</p>
        </div>
      </div>
      {(error || result.error) && (
        <ErrorBox
          message={error || result.error}
          retry={result.error ? result.reload : undefined}
        />
      )}
      {result.loading && !result.data ? (
        <Loading />
      ) : !result.data ? (
        <Empty
          title="Não foi possível consultar o armazenamento"
          action={
            <button className="button secondary" onClick={result.reload}>
              Tentar novamente
            </button>
          }
        />
      ) : (
        <>
          <section className="panel media-storage-summary">
            <div className="panel-heading">
              <div>
                <h2>Mídia armazenada</h2>
                <p>{result.data.totalCount} {result.data.totalCount === 1 ? "arquivo" : "arquivos"} · todas as contas</p>
              </div>
              <strong className="media-storage-total">
                {storageSize(result.data.totalBytes)}
              </strong>
            </div>
            <div className="media-storage-breakdown">
              {(
                [
                  ["Arquivos do chat", result.data.chat],
                  ["Anexos dos disparos", result.data.campaign],
                  ["Fotos de perfil", result.data.profiles],
                ] as [string, Usage][]
              ).map(([label, usage]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{storageSize(usage.bytes)}</strong>
                  <small>{usage.count} {usage.count === 1 ? "arquivo" : "arquivos"}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Prazo de armazenamento</h2>
                <p>As mensagens e os textos permanecem no histórico.</p>
              </div>
            </div>
            <form className="media-settings-form" onSubmit={save}>
              <label className="media-retention-toggle">
                <input
                  type="checkbox"
                  checked={settings.retentionEnabled}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({
                      ...settings,
                      retentionEnabled: event.target.checked,
                      retentionDays: !event.target.checked && !validDays(settings.retentionDays)
                        ? String(result.data?.settings.retentionDays || 30)
                        : settings.retentionDays,
                    })
                  }
                />
                <span>Excluir mídia antiga automaticamente</span>
              </label>
              <Field label="Guardar mídia por quantos dias? (1 a 3650)">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  required
                  value={settings.retentionDays}
                  disabled={!settings.retentionEnabled || busy}
                  onChange={(event) =>
                    setDraft({ ...settings, retentionDays: event.target.value })
                  }
                />
              </Field>
              <p className="form-note">
                {settings.retentionEnabled
                  ? "A limpeza roda a cada hora e na inicialização do serviço. O prazo conta a partir do envio/recebimento da mensagem, da criação do disparo ou da atualização da foto de perfil. Arquivos já antigos também serão removidos."
                  : "Desligado: os arquivos ficam guardados sem prazo de exclusão automática."}{" "}
                Disparos em andamento não serão limpos.
              </p>
              <button
                className="button primary"
                disabled={
                  busy || !!result.error || !validDays(settings.retentionDays)
                }
              >
                {busy ? "Aguarde…" : "Salvar configuração"}
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Limpar mídia antiga agora</h2>
                <p>Revise a quantidade antes de confirmar a exclusão.</p>
              </div>
            </div>
            <form className="media-settings-form" onSubmit={prepareCleanup}>
              <Field label="Excluir arquivos de mídia com mais de quantos dias?">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  required
                  value={days}
                  disabled={busy}
                  onChange={(event) => setDays(event.target.value)}
                />
              </Field>
              <button
                className="button secondary"
                disabled={busy || !!result.error || !validDays(days)}
              >
                <Trash2 size={16} />
                Revisar limpeza
              </button>
            </form>
          </section>
        </>
      )}
      {preview && (
        <Modal
          title="Confirmar limpeza de mídia"
          onClose={() => {
            if (!busy) setPreview(undefined);
          }}
        >
          <div className="modal-form">
            {error && <p role="alert" className="form-note">{error}</p>}
            <p>
              Excluir {preview.totalCount} arquivos com mais de {preview.days}{" "}
              dias, ocupando {storageSize(preview.totalBytes)}?
            </p>
            <p className="form-note">
              {preview.chat.count} arquivos do chat · {preview.campaign.count}{" "}
              anexos de disparos · {preview.profiles.count} fotos de perfil.
            </p>
            <p className="form-note">
              As mensagens e os textos serão mantidos. A cópia local dos
              arquivos será apagada; recuperá-los depois dependerá da
              disponibilidade no WhatsApp.
            </p>
            <div className="modal-footer">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setPreview(undefined)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={busy || !preview.totalCount}
                onClick={cleanup}
              >
                {busy ? "Excluindo…" : "Excluir arquivos"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
