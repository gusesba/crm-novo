"use client";
import { useApp } from "@/components/providers";
import { Avatar, Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { LeadForm } from "@/features/leads/lead-form";
import { useResource } from "@/hooks/use-resource";
import { post } from "@/lib/api";
import type { Chat, Lead, PageResult } from "@/lib/types";
import { Link2, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Connection } from "./connection";
import { Conversation } from "./conversation";
import { ChatList } from "./chat-list";

export function ChatPage({ backup = false }: { backup?: boolean }) {
  const { user, catalog, notify } = useApp();
  const params = useSearchParams();
  const [historyUser, setHistoryUser] = useState("");
  const [chat, setChat] = useState<Chat>();
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead>();
  const [error, setError] = useState("");
  const suffix = backup && historyUser ? `?userId=${historyUser}` : "";
  const pictureUrl = (chatId: string) =>
    `/api/whatsapp/profile-picture?chatId=${encodeURIComponent(chatId)}${
      backup && historyUser ? `&userId=${historyUser}` : ""
    }`;
  const chats = useResource<Chat[]>(`/whatsapp/chats${suffix}`, 5000);
  const leadMatch = useResource<PageResult<Lead>>(
    chat && !backup && chat.id.endsWith("@s.whatsapp.net")
      ? `/leads?mine=true&search=${chat.id.split("@")[0]}`
      : null,
  );
  const matchedLead = leadMatch.data?.items.find(
    (l) => l.phone === chat?.id.split("@")[0],
  );
  const linkedLead =
    matchedLead &&
    matchedLead.chatId === chat?.id &&
    matchedLead.chatUserId === user?.id
      ? matchedLead
      : undefined;
  useEffect(() => {
    const phone = params.get("phone");
    if (phone && /^\d{10,15}$/.test(phone))
      setChat({
        id: phone + "@s.whatsapp.net",
        name: phone,
        lastText: "",
        updatedAt: Date.now(),
        archived: false,
        pinnedAt: 0,
      });
  }, [params]);
  async function link() {
    if (!matchedLead || !chat) return;
    try {
      await post(`/leads/${matchedLead.id}/link`, { chatId: chat.id });
      leadMatch.reload();
      chats.reload();
      notify("Conversa vinculada ao lead.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={
          backup ? "CONTEXTO QUE PERMANECE" : "PROXIMIDADE EM CADA MENSAGEM"
        }
        title={
          backup
            ? "O histórico da sua relação."
            : "Sua melhor conexão com o cliente."
        }
        description={
          backup
            ? "Consulte as mensagens persistidas no CRM, por sessão de atendimento."
            : "Converse, reconheça oportunidades e mantenha tudo conectado à sua carteira."
        }
        actions={
          backup &&
          user?.isAdmin && (
            <select
              aria-label="Usuário do histórico"
              value={historyUser}
              onChange={(e) => {
                setHistoryUser(e.target.value);
                setChat(undefined);
              }}
            >
              <option value="">Meu histórico</option>
              {catalog?.users
                .filter((u) => u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          )
        }
      />
      {!backup && <Connection />}
      {(error || chats.error) && (
        <ErrorBox message={error || chats.error} retry={chats.reload} />
      )}
      <section className="panel chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-search">
            <div className="search-field">
              <Search size={16} />
              <input
                placeholder="Buscar conversa…"
                aria-label="Buscar conversa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!backup && (
              <button
                className="text-button"
                style={{ marginTop: 10 }}
                onClick={() => {
                  const phone = window.prompt(
                    "Telefone com DDI e DDD (ex.: 5551999999999)",
                  );
                  if (phone && /^\d{12,15}$/.test(phone.replace(/\D/g, "")))
                    setChat({
                      id: phone.replace(/\D/g, "") + "@s.whatsapp.net",
                      name: phone,
                      lastText: "",
                      updatedAt: Date.now(),
                      archived: false,
                      pinnedAt: 0,
                    });
                  else if (phone)
                    setError("Informe um telefone válido com DDI e DDD.");
                }}
              >
                <Plus size={13} />
                Nova conversa
              </button>
            )}
          </div>
          <div className="chat-items">
            {chats.loading && !chats.data ? (
              <Loading />
            ) : !chats.data?.length ? (
              <Empty
                title="Sem conversas ainda"
                description={
                  backup
                    ? "As mensagens armazenadas aparecem aqui."
                    : "Conecte o WhatsApp para sincronizar suas conversas."
                }
              />
            ) : (
              <ChatList
                chats={chats.data}
                search={search}
                selected={chat?.id}
                pictureUrl={pictureUrl}
                onSelect={setChat}
              />
            )}
          </div>
        </aside>
        {chat ? (
          <div className="chat-main">
            <div className="chat-top">
              <Avatar name={chat.name} src={pictureUrl(chat.id)} eager />
              <div>
                <h3>{linkedLead?.name || chat.name.split("@")[0]}</h3>
                <p>
                  {chat.id.split("@")[0]}{" "}
                  {linkedLead ? "· Vinculado ao CRM" : ""}
                </p>
              </div>
              {!backup &&
                chat.id.endsWith("@s.whatsapp.net") &&
                (matchedLead ? (
                  <>
                    <button
                      className="text-button"
                      onClick={() => setEditingLead(matchedLead)}
                    >
                      Abrir lead
                    </button>
                    {!matchedLead.chatId && (
                      <button
                        className="icon-button"
                        aria-label="Vincular lead"
                        onClick={() => void link()}
                      >
                        <Link2 size={17} />
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="button secondary compact"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={14} />
                    Criar lead
                  </button>
                ))}
            </div>
            <Conversation
              key={`${chat.id}-${historyUser}`}
              chatId={chat.id}
              userId={backup ? historyUser : undefined}
              backup={backup}
              chats={chats.data || []}
            />
          </div>
        ) : (
          <div className="chat-main">
            <Empty
              title={
                backup
                  ? "Uma história em cada conversa"
                  : "Vamos começar uma boa conversa?"
              }
              description="Selecione um contato ao lado para consultar o histórico de mensagens."
            />
          </div>
        )}
      </section>
      {(create || editingLead) && chat && (
        <LeadForm
          lead={editingLead}
          initial={{
            name: chat.name.includes("@") ? "" : chat.name,
            phone: chat.id.split("@")[0],
          }}
          onClose={() => {
            setCreate(false);
            setEditingLead(undefined);
          }}
          onSaved={async (lead) => {
            setCreate(false);
            setEditingLead(undefined);
            if (lead.currentSellerId === user?.id && !lead.chatId) {
              try {
                await post(`/leads/${lead.id}/link`, { chatId: chat.id });
              } catch (e) {
                setError((e as Error).message);
              }
            }
            leadMatch.reload();
          }}
        />
      )}
    </>
  );
}
