"use client";
import { Empty, ErrorBox, Loading } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { api, post } from "@/lib/api";
import { date, time } from "@/lib/format";
import type { Chat, Message } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import { MessageComposer } from "./message-composer";
import { ForwardMessageModal } from "./forward-message-modal";
import { MessageActionsMenu } from "./message-actions-menu";
import { MessageAttachment } from "./message-attachment";
import { DeleteMessageModal } from "./delete-message-modal";
export function Conversation({
  chatId,
  userId,
  backup,
  chats,
}: {
  chatId: string;
  userId?: string;
  backup: boolean;
  chats: Chat[];
}) {
  const path = `/whatsapp/messages?chatId=${encodeURIComponent(chatId)}${userId ? `&userId=${userId}` : ""}`;
  const result = useResource<Message[]>(path, backup ? undefined : 4000);
  const [older, setOlder] = useState<Message[]>([]);
  const [reply, setReply] = useState<Message>();
  const [editing, setEditing] = useState<Message>();
  const [forwarding, setForwarding] = useState<Message>();
  const [deleting, setDeleting] = useState<Message>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [result.data?.length]);
  async function loadOlder() {
    const first = older[0] || result.data?.[0];
    if (!first) return;
    try {
      const items = await api<Message[]>(
        `${path}&before=${first.timestamp}&beforeId=${encodeURIComponent(first.id)}`,
      );
      setOlder([...items, ...older]);
      if (!items.length) setError("Não há mensagens anteriores armazenadas.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function react(message: Message, emoji: string) {
    setError("");
    try {
      await post(`/whatsapp/messages/${message.id}/react`, { chatId, emoji });
      result.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(message: Message, forEveryone: boolean) {
    setNotice("");
    await api(`/whatsapp/messages/${message.id}`, {
      method: "DELETE",
      body: JSON.stringify({ chatId, forEveryone }),
    });
    if (forEveryone) {
      setNotice("Solicitação enviada ao WhatsApp. A mensagem permanece até o WhatsApp informar a revogação.");
    } else {
      setOlder((items) => items.filter((item) => item.id !== message.id));
      if (reply?.id === message.id) setReply(undefined);
      if (editing?.id === message.id) setEditing(undefined);
    }
    result.reload();
  }
  const messages = [...older, ...(result.data || [])].filter(
    (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
  );
  return (
    <>
      {(error || result.error) && <ErrorBox message={error || result.error} />}
      {notice && <p className="form-note">{notice}</p>}
      <div className="message-list">
        {messages.length >= 100 && (
          <button className="text-button" onClick={() => void loadOlder()}>
            Carregar mensagens anteriores
          </button>
        )}
        {result.loading && !result.data ? (
          <Loading />
        ) : !messages.length ? (
          <Empty
            title="Tudo pronto para a primeira mensagem"
            description={
              backup
                ? "Nenhuma mensagem armazenada nesta conversa."
                : "O histórico aparecerá aqui conforme as mensagens forem sincronizadas."
            }
          />
        ) : (
          messages.map((m) => (
            <div className={`message ${m.mine ? "mine" : ""}`} key={m.id}>
              {!backup && chatId.endsWith("@s.whatsapp.net") && (
                <MessageActionsMenu
                  message={m}
                  onReply={() => {
                    setReply(m);
                    setEditing(undefined);
                  }}
                  onEdit={() => {
                    setEditing(m);
                    setReply(undefined);
                  }}
                  onReact={(emoji) => react(m, emoji)}
                  onForward={() => setForwarding(m)}
                  onDelete={() => setDeleting(m)}
                />
              )}
              {m.kind !== "text" && (
                <MessageAttachment
                  message={m}
                  userId={userId}
                  onError={setError}
                />
              )}
              {!!m.text && m.kind !== "sticker" && (
                <div className="message-text">{m.text}</div>
              )}
              <div className="message-meta">
                {date(m.timestamp)} · {time(m.timestamp)}
              </div>
              {!!m.reactions?.length && (
                <div className="message-reactions">
                  {[
                    ...new Set(m.reactions.map((reaction) => reaction.emoji)),
                  ].map((emoji) => {
                    const reactions = m.reactions.filter(
                      (reaction) => reaction.emoji === emoji,
                    );
                    return (
                      <span
                        key={emoji}
                        className={
                          reactions.some((reaction) => reaction.mine)
                            ? "mine"
                            : ""
                        }
                      >
                        {emoji}
                        {reactions.length > 1 && (
                          <small>{reactions.length}</small>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      {!backup && chatId.endsWith("@s.whatsapp.net") ? (
        <MessageComposer
          key={editing?.id || "new"}
          chatId={chatId}
          reply={reply}
          editing={editing}
          clearSelection={() => {
            setReply(undefined);
            setEditing(undefined);
          }}
          onSent={result.reload}
        />
      ) : (
        <p className="form-note">
          {backup
            ? "Consulta ao histórico persistido. Anexos dependem da disponibilidade na sessão de origem."
            : "Esta conversa está disponível somente para consulta. Para atender, utilize o contato com telefone identificado."}
        </p>
      )}
      {forwarding && (
        <ForwardMessageModal
          message={forwarding}
          chats={chats}
          onClose={() => setForwarding(undefined)}
          onForwarded={(targetChatId) => {
            setForwarding(undefined);
            if (targetChatId === chatId) result.reload();
          }}
        />
      )}
      {deleting && (
        <DeleteMessageModal
          message={deleting}
          onClose={() => setDeleting(undefined)}
          onDelete={(forEveryone) => remove(deleting, forEveryone)}
        />
      )}
    </>
  );
}
