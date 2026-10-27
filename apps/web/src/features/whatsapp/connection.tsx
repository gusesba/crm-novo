"use client";
import { useWhatsAppApi } from "./account-context";
import { ErrorBox, Loading, Modal } from "@/components/ui";
import { useWhatsAppResource as useResource } from "./account-context";
import { MessageCircle, QrCode, Unplug } from "lucide-react";
import { useState } from "react";
export function Connection() {
  const { post } = useWhatsAppApi();
  const status = useResource<{ status: string; qr?: string; phone?: string }>(
    "/whatsapp/status",
    5000,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unknown = !status.data;
  const connected = status.data?.status === "connected";
  async function action(disconnect = false) {
    setBusy(true);
    setError("");
    try {
      await post(`/whatsapp/${disconnect ? "disconnect" : "connect"}`);
      status.reload();
      if (!disconnect) setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {(error || status.error) && (
        <ErrorBox message={error || status.error} retry={status.reload} />
      )}
      <div className="connection-panel">
        <MessageCircle size={28} />
        <div>
          <h3>
            {unknown
              ? status.loading ? "Verificando conexão…" : "Status da conexão indisponível"
              : connected
              ? "Seu WhatsApp está conectado"
              : "Boas conversas começam por uma conexão"}
          </h3>
          <p>
            {unknown
              ? "Consultando o estado desta conta do WhatsApp."
              : connected
              ? `Conta ${status.data?.phone ? "+" + status.data.phone : "WhatsApp"} pronta para atender e enviar mensagens.`
              : "Conecte sua conta pelo QR Code para começar os atendimentos."}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy || (unknown && status.loading)}
          onClick={() =>
            unknown
              ? status.reload()
              : connected
              ? window.confirm("Desconectar esta sessão do WhatsApp?") &&
                void action(true)
              : void action()
          }
        >
          {connected ? <Unplug size={16} /> : <QrCode size={16} />}{" "}
          {busy ? "Aguarde…" : unknown ? status.loading ? "Verificando…" : "Verificar conexão" : connected ? "Desconectar" : "Conectar WhatsApp"}
        </button>
      </div>
      {open && (
        <Modal
          title={connected ? "Tudo pronto para conversar" : "Conectar WhatsApp"}
          description="No celular: WhatsApp → Aparelhos conectados → Conectar aparelho."
          onClose={() => setOpen(false)}
        >
          <div className="qr-panel">
            {connected ? (
              <>
                <MessageCircle size={44} />
                <p>
                  Sua conta está conectada. As conversas disponíveis começarão a
                  aparecer.
                </p>
                <button
                  className="button primary"
                  onClick={() => setOpen(false)}
                >
                  Ir para as conversas
                </button>
              </>
            ) : status.data?.qr ? (
              <>
                <img
                  src={status.data.qr}
                  alt="QR Code para conectar a sessão WhatsApp"
                />
                <p>Escaneie este código com o aplicativo do WhatsApp.</p>
              </>
            ) : (
              <>
                <Loading />
                {status.data?.status === "disconnected" && (
                  <button
                    className="button secondary"
                    onClick={() => void action()}
                  >
                    Gerar novo código
                  </button>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
