import { Avatar, Empty } from "@/components/ui";
import { date } from "@/lib/format";
import type { Chat } from "@/lib/types";
import { Archive, Pin } from "lucide-react";
import { useEffect, useState } from "react";
import { ClassificationDots } from "@/features/leads/classifications";

type Props = {
  chats: Chat[];
  search: string;
  selected?: string;
  pictureUrl: (chatId: string) => string;
  onSelect: (chat: Chat) => void;
  onOpenPhoto: (chat: Chat) => void;
};

type ItemProps = Omit<Props, "chats" | "search"> & { chat: Chat };

function ChatItem({ chat, selected, pictureUrl, onSelect, onOpenPhoto }: ItemProps) {
  const name = chat.name.includes("@") ? chat.name.split("@")[0] : chat.name;
  return (
    <div
      className={`chat-item ${selected === chat.id ? "active" : ""}`}
    >
      <button
        type="button"
        className="profile-photo-button"
        aria-label={`Abrir foto de perfil de ${name}`}
        onClick={() => onOpenPhoto(chat)}
      >
        <Avatar name={name} src={pictureUrl(chat.id)} />
      </button>
      <button
        type="button"
        className="chat-item-select"
        onClick={() => onSelect(chat)}
      >
        <div>
          <div className="chat-name"><strong>{name}</strong><ClassificationDots items={chat.classifications} /></div>
          <p>{chat.lastText}</p>
        </div>
        <span className="chat-item-meta">
          {chat.pinnedAt > 0 && <Pin size={11} aria-label="Conversa fixada" />}
          <small>{date(chat.updatedAt)}</small>
        </span>
      </button>
    </div>
  );
}

export function ChatList(props: Props) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const query = props.search.trim().toLowerCase();
  const visible = props.chats.filter((chat) =>
    (chat.name + chat.id).toLowerCase().includes(query),
  );
  const pinned = visible.filter((chat) => chat.pinnedAt > 0);
  const regular = visible.filter((chat) => !chat.archived && !chat.pinnedAt);
  const archived = visible.filter(
    (chat) => chat.archived && chat.pinnedAt <= 0,
  );

  useEffect(() => {
    if (query) setArchivedOpen(true);
  }, [query]);

  if (!visible.length)
    return (
      <Empty
        title="Nenhuma conversa encontrada"
        description="Tente buscar por outro nome ou número."
      />
    );

  const render = (chat: Chat) => (
    <ChatItem key={chat.id} chat={chat} {...props} />
  );
  return (
    <>
      {!!archived.length && (
        <section className="chat-archived">
          <button
            className="chat-archived-toggle"
            aria-expanded={archivedOpen}
            onClick={() => setArchivedOpen((open) => !open)}
          >
            <Archive size={13} /> Arquivadas <span>{archived.length}</span>
          </button>
          {archivedOpen && archived.map(render)}
        </section>
      )}
      {!!pinned.length && (
        <section className="chat-section">
          <h3>
            <Pin size={12} /> Fixadas
          </h3>
          {pinned.map(render)}
        </section>
      )}
      {!!regular.length && (
        <section className="chat-section">
          <h3>Conversas</h3>
          {regular.map(render)}
        </section>
      )}
    </>
  );
}
