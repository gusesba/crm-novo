import assert from "node:assert/strict";
import test from "node:test";
import {
  groupChats,
  type ChatGroup,
  type ChatView,
} from "../src/lib/chat-groups";
import type { Chat } from "../src/lib/types";

const important = { id: 1, name: "Importante", color: "#ffc0cb" };
const negotiating = { id: 2, name: "Em negociação", color: "#ffcc00" };
const chats: Chat[] = [
  {
    id: "a",
    name: "Ana",
    lastText: "",
    updatedAt: 10,
    archived: false,
    pinnedAt: 0,
    leadId: 1,
    leadStatus: "Agendar Contato",
    classifications: [important, negotiating],
  },
  {
    id: "b",
    name: "Bruno",
    lastText: "",
    updatedAt: 20,
    archived: true,
    pinnedAt: 0,
    leadId: 2,
    leadStatus: "Venda Efetivada",
    classifications: [important],
  },
  {
    id: "c",
    name: "Carlos",
    lastText: "",
    updatedAt: 30,
    archived: false,
    pinnedAt: 50,
    leadId: 3,
    leadStatus: "Agendar Contato",
    classifications: [],
  },
  {
    id: "d",
    name: "Diana",
    lastText: "",
    updatedAt: 40,
    archived: true,
    pinnedAt: 60,
  },
  { id: "e", name: "Eduardo", lastText: "", updatedAt: 50, archived: false },
];
const ids = (group: ChatGroup) => group.chats.map((chat) => chat.id);
function leaves(groups: ChatGroup[]): string[] {
  return groups.flatMap((group) =>
    group.children.length ? leaves(group.children) : ids(group),
  );
}

test("WhatsApp separa todas as arquivadas, inclusive fixadas, e prioriza fixadas", () => {
  const groups = groupChats(chats, ["whatsapp"]);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["Arquivadas", "Conversas"],
  );
  assert.deepEqual(ids(groups[0]), ["d", "b"]);
  assert.deepEqual(ids(groups[1]), ["c", "e", "a"]);
});

test("classificações são grupos múltiplos, com Sem classificação no final", () => {
  const groups = groupChats(chats, ["classification"]);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["Em negociação", "Importante", "Sem classificação"],
  );
  assert.deepEqual(ids(groups[0]), ["a"]);
  assert.deepEqual(ids(groups[1]), ["b", "a"]);
  assert.deepEqual(new Set(ids(groups[2])), new Set(["c", "d", "e"]));
  assert.equal(groups[0].color, negotiating.color);
});

test("status reúne leads pelo status atual e conserva conversas sem lead", () => {
  const groups = groupChats(chats, ["status"]);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["Agendar Contato", "Venda Efetivada", "Sem lead"],
  );
  assert.deepEqual(ids(groups[0]), ["c", "a"]);
  assert.deepEqual(ids(groups[1]), ["b"]);
  assert.deepEqual(ids(groups[2]), ["d", "e"]);
});

test("as sete combinações preservam conversas e a precedência independentemente da ordem de ativação", () => {
  const order: ChatView[] = ["whatsapp", "status", "classification"];
  for (let mask = 1; mask < 8; mask++) {
    const active = order.filter((_, index) => mask & (1 << index));
    const groups = groupChats(chats, [...active].reverse());
    assert.deepEqual(
      new Set(leaves(groups)),
      new Set(chats.map((chat) => chat.id)),
    );
    function check(nodes: ChatGroup[], depth: number) {
      for (const node of nodes) {
        assert.equal(node.view, active[depth]);
        assert.equal(node.chats.length, new Set(ids(node)).size);
        assert.equal(node.children.length > 0, depth < active.length - 1);
        check(node.children, depth + 1);
      }
    }
    check(groups, 0);
  }
  const all = groupChats(chats, order);
  const normal = all.find((group) => group.title === "Conversas")!;
  const status = normal.children.find(
    (group) => group.title === "Agendar Contato",
  )!;
  assert.deepEqual(
    status.children.map((group) => group.title),
    ["Em negociação", "Importante", "Sem classificação"],
  );
  assert.equal(normal.chats.length, 3);
  assert.equal(status.chats.length, 2);
});

test("dados novos do polling mudam grupos e contagens sem deixar grupos vazios", () => {
  const updated = chats.map((chat) =>
    chat.id === "a"
      ? { ...chat, leadStatus: "Venda Efetivada", classifications: [] }
      : chat,
  );
  const groups = groupChats(updated, ["status", "classification"]);
  const sales = groups.find((group) => group.title === "Venda Efetivada")!;
  assert.deepEqual(
    sales.children.map((group) => group.title),
    ["Importante", "Sem classificação"],
  );
  assert.deepEqual(ids(sales.children[1]), ["a"]);
  assert.deepEqual(
    groupChats([], ["whatsapp", "status", "classification"]),
    [],
  );
});
