import { statuses } from "./format";
import type { Chat } from "./types";

export type ChatView = "whatsapp" | "status" | "classification";
export const chatViews: { id: ChatView; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "status", label: "Status" },
  { id: "classification", label: "Classificação" },
];

export interface ChatGroup {
  key: string;
  title: string;
  view: ChatView;
  color?: string;
  chats: Chat[];
  children: ChatGroup[];
}

export function groupChats(chats: Chat[], views: ChatView[]): ChatGroup[] {
  const dimensions = chatViews
    .map((view) => view.id)
    .filter((id) => views.includes(id));
  const ordered = [...chats].sort(
    (a, b) =>
      Number(b.pinnedAt > 0) - Number(a.pinnedAt > 0) ||
      b.pinnedAt - a.pinnedAt ||
      b.updatedAt - a.updatedAt ||
      a.id.localeCompare(b.id),
  );

  function group(items: Chat[], depth: number): ChatGroup[] {
    const view = dimensions[depth];
    if (!view) return [];
    let groups: Omit<ChatGroup, "children">[];
    if (view === "whatsapp") {
      groups = [
        {
          key: "archived",
          title: "Arquivadas",
          view,
          chats: items.filter((chat) => chat.archived),
        },
        {
          key: "regular",
          title: "Conversas",
          view,
          chats: items.filter((chat) => !chat.archived),
        },
      ];
    } else if (view === "status") {
      const names = [
        ...new Set(
          items.flatMap((chat) => (chat.leadStatus ? [chat.leadStatus] : [])),
        ),
      ];
      names.sort((a, b) => {
        const first = statuses.indexOf(a),
          second = statuses.indexOf(b);
        return (
          (first < 0 ? statuses.length : first) -
            (second < 0 ? statuses.length : second) ||
          a.localeCompare(b, "pt-BR")
        );
      });
      groups = names.map((status) => ({
        key: status,
        title: status,
        view,
        chats: items.filter((chat) => chat.leadStatus === status),
      }));
      groups.push({
        key: "unlinked",
        title: "Sem lead",
        view,
        chats: items.filter((chat) => !chat.leadStatus),
      });
    } else {
      const labels = new Map(
        items.flatMap((chat) =>
          (chat.classifications ?? []).map(
            (label) => [label.id, label] as const,
          ),
        ),
      );
      groups = [...labels.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id - b.id)
        .map((label) => ({
          key: String(label.id),
          title: label.name,
          color: label.color,
          view,
          chats: items.filter((chat) =>
            chat.classifications?.some((item) => item.id === label.id),
          ),
        }));
      groups.push({
        key: "unclassified",
        title: "Sem classificação",
        view,
        chats: items.filter((chat) => !chat.classifications?.length),
      });
    }
    return groups
      .filter((entry) => entry.chats.length)
      .map((entry) => ({ ...entry, children: group(entry.chats, depth + 1) }));
  }
  return group(ordered, 0);
}
