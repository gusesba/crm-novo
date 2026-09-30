"use client";
import { Avatar, Empty, ErrorBox, Loading } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { api, post } from "@/lib/api";
import { date, time } from "@/lib/format";
import type { Chat, Message, SharedContact } from "@/lib/types";
import { Ban } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MessageComposer } from "./message-composer";
import { ForwardMessageModal } from "./forward-message-modal";
import { MessageActionsMenu } from "./message-actions-menu";
import { MessageAttachment } from "./message-attachment";
import { DeleteMessageModal } from "./delete-message-modal";
import { MessageText } from "./message-text";
export function Conversation({
  chatId,
  userId,
  backup,
  chats,
  onStartConversation,
}: {
  chatId: string;
  userId?: string;
  backup: boolean;
  chats: Chat[];
  onStartConversation: (contact: SharedContact) => void;
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
      setOlder((items) =>
        items.map((item) => item.id === message.id
          ? {
              ...item,
              kind: "deleted",
              text: "Mensagem apagada",
              attachment: undefined,
              contact: undefined,
              reactions: [],
              canDeleteForEveryone: false,
            }
          : item),
      );
      setNotice("A mensagem foi apagada para todos.");
    } else {
      setOlder((items) => items.filter((item) => item.id !== message.id));
    }
    if (reply?.id === message.id) setReply(undefined);
    if (editing?.id === message.id) setEditing(undefined);
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
            <div className={`message ${m.mine ? "mine" : ""} ${m.contact ? "contact-message" : ""}`} key={m.id}>
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
              {m.kind === "deleted" && (
                <div className="message-deleted">
                  <Ban size={16} />
                  <span>Mensagem apagada</span>
                </div>
              )}
              {m.kind !== "text" && m.kind !== "deleted" && !m.contact && (
                <MessageAttachment
                  message={m}
                  userId={userId}
                  onError={setError}
                />
              )}
              {m.contact && (
                <div className="message-contact-card">
                  <Avatar
                    name={m.contact.name}
                    src={m.contact.phone ? `/api/whatsapp/profile-picture?chatId=${encodeURIComponent(m.contact.phone.replace(/\D/g, "") + "@s.whatsapp.net")}${userId ? `&userId=${encodeURIComponent(userId)}` : ""}` : undefined}
                  />
                  <strong>{m.contact.name}</strong>
                </div>
              )}
              {!!m.text && m.kind !== "sticker" && m.kind !== "deleted" && !m.contact && (
                <MessageText
                  text={m.text}
                  onStartConversation={backup ? undefined : onStartConversation}
                  onError={setError}
                />
              )}
              <div className="message-meta">
                {m.contact ? time(m.timestamp) : `${date(m.timestamp)} · ${time(m.timestamp)}`}
              </div>
              {m.contact && !backup && (
                <button
                  type="button"
                  className="message-contact-action"
                  disabled={!/^\d{10,15}$/.test(m.contact.phone.replace(/\D/g, ""))}
                  onClick={() => onStartConversation(m.contact!)}
                >
                  Conversar
                </button>
              )}
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
          chats={chats}
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
