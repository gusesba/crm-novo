"use client";
import { createContext, useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/components/providers";
import { Empty, ErrorBox, Loading } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { WhatsAppAccountContext } from "./account-context";

export const BackupNumberContext = createContext("");
type BackupNumber = { id: string; phone: string | null; firstConnectedAt: number; lastConnectedAt: number };

export function BackupWorkspace({ children }: { children: ReactNode }) {
  const { user, catalog } = useApp();
  const [historyUser, setHistoryUser] = useState("");
  return <>
    {user?.isAdmin && <select className="history-user-select" aria-label="Usuário do histórico" value={historyUser} onChange={(event) => setHistoryUser(event.target.value)}>
      <option value="">Meu histórico</option>
      {catalog?.users.filter((item) => item.id !== user.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
    <NumberTabs key={`${user?.id}-${historyUser}`} userId={historyUser}>{children}</NumberTabs>
  </>;
}

function NumberTabs({ userId, children }: { userId: string; children: ReactNode }) {
  const numbers = useResource<BackupNumber[]>(`/whatsapp/backup/numbers${userId ? `?userId=${userId}` : ""}`, 10000);
  const [selected, setSelected] = useState("");
  const active = numbers.data?.find((number) => number.id === selected) || (!selected ? numbers.data?.[0] : undefined);
  useEffect(() => { if (!selected && active) setSelected(active.id); }, [active, selected]);
  return <>
    {numbers.error && <ErrorBox message={numbers.error} retry={numbers.reload} />}
    {numbers.loading && !numbers.data ? <Loading /> : !numbers.data?.length ? <Empty
      title="Nenhum número no backup"
      description="Os números conectados ao WhatsApp aparecerão aqui com seu histórico de mensagens, mesmo depois de desconectar."
    /> : <>
      <p className="form-note">Backup de mensagens por número. Fotos, vídeos, áudios e documentos não são armazenados neste backup.</p>
      <div className="whatsapp-accounts">
        <div className="whatsapp-account-tabs" role="tablist" aria-label="Números do backup">
          {numbers.data.map((number, index, items) => <button
            key={number.id} id={`backup-tab-${number.id}`} type="button" role="tab"
            aria-selected={active?.id === number.id} aria-controls="whatsapp-backup-panel" tabIndex={active?.id === number.id ? 0 : -1}
            onClick={() => setSelected(number.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
              setSelected(items[next].id);
              document.getElementById(`backup-tab-${items[next].id}`)?.focus();
            }}
          >{number.phone ? `+${number.phone}` : `Histórico anterior ${index + 1}`}</button>)}
        </div>
      </div>
      {active && <WhatsAppAccountContext.Provider key={active.id} value={{ accountId: "default", userId }}>
        <BackupNumberContext.Provider value={active.id}>
          <div role="tabpanel" id="whatsapp-backup-panel" aria-labelledby={`backup-tab-${active.id}`}>
            {!active.phone && <p className="form-note">O número deste histórico antigo não pôde ser identificado. Suas mensagens foram preservadas separadamente.</p>}
            {children}
          </div>
        </BackupNumberContext.Provider>
      </WhatsAppAccountContext.Provider>}
    </>}
  </>;
}
