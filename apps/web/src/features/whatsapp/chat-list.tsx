import { Avatar, Empty } from "@/components/ui";
import { date } from "@/lib/format";
import type { Chat } from "@/lib/types";
import { Archive, ChevronDown, ChevronRight, Pin } from "lucide-react";
import { groupChats, type ChatGroup, type ChatView } from "@/lib/chat-groups";
import { useEffect, useState } from "react";
import { ClassificationDots } from "@/features/leads/classifications";

type Props = {
  chats: Chat[];
  views?: ChatView[];
  search: string;
  selected?: string;
  pictureUrl: (chatId: string) => string;
  onSelect: (chat: Chat) => void;
  onOpenPhoto: (chat: Chat) => void;
};

type ItemProps = Omit<Props, "chats" | "search" | "views"> & { chat: Chat };

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const query = props.search.trim().toLowerCase();
  const visible = props.chats.filter((chat) =>
    (chat.name + chat.id).toLowerCase().includes(query),
  );
  const views = props.views ?? ["whatsapp"];
  const groups = groupChats(visible, views);

  useEffect(() => {
    if (query) setExpanded({});
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
  function renderGroup(group: ChatGroup, parent: string[] = [], depth = 0) {
    const path = [...parent, `${group.view}:${group.key}`];
    const key = JSON.stringify(path);
    const isArchived = group.view === "whatsapp" && group.key === "archived";
    const open = expanded[key] ?? (!!query || !isArchived);
    const pinned = views.length === 1 && group.view === "whatsapp" && !isArchived
      ? group.chats.filter((chat) => chat.pinnedAt > 0) : [];
    return (
      <section className="chat-group" key={key} data-view={group.view}>
        <button
          type="button"
          className="chat-archived-toggle chat-group-toggle"
          style={{ paddingLeft: 16 + depth * 12 }}
          aria-expanded={open}
          onClick={() => setExpanded((current) => ({ ...current, [key]: !open }))}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {isArchived && <Archive size={13} />}
          {group.color && <i className="classification-dot" style={{ backgroundColor: group.color }} aria-hidden="true" />}
          <strong>{group.title}</strong><span>{group.chats.length}</span>
        </button>
        {open && (group.children.length ? group.children.map((child) => renderGroup(child, path, depth + 1)) : (
          <>
            {!!pinned.length && <section className="chat-section"><h3><Pin size={12} /> Fixadas</h3>{pinned.map(render)}</section>}
            {!!pinned.length && group.chats.length > pinned.length && <section className="chat-section"><h3>Conversas</h3>{group.chats.filter((chat) => chat.pinnedAt <= 0).map(render)}</section>}
            {!pinned.length && group.chats.map(render)}
          </>
        ))}
      </section>
    );
  }
  return (
    <>
      {groups.map((group) => renderGroup(group))}
    </>
  );
}
