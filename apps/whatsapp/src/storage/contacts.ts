import type {
  AuthenticationState,
  Contact,
  WASocket,
} from "@whiskeysockets/baileys";
import { db } from "./database.js";

function saveName(user: string, id: string, name: string, priority: number) {
  if (!id || !name.trim()) return;
  db.prepare(
    `INSERT INTO contacts VALUES(?,?,?,?)
     ON CONFLICT(user_id,id) DO UPDATE SET
       name=CASE WHEN excluded.priority >= contacts.priority THEN excluded.name ELSE contacts.name END,
       priority=MAX(contacts.priority,excluded.priority)`,
  ).run(user, id, name.trim(), priority);
  const resolvedName = contactName(user, id);
  if (resolvedName)
    db.prepare("UPDATE chats SET name=? WHERE user_id=? AND id=?").run(
      resolvedName,
      user,
      id,
    );
}

export function saveContact(user: string, contact: Partial<Contact>) {
  const candidate = contact.name
    ? { value: contact.name, priority: 4 }
    : contact.verifiedName
      ? { value: contact.verifiedName, priority: 3 }
      : contact.notify
        ? { value: contact.notify, priority: 2 }
        : contact.username
          ? { value: contact.username, priority: 1 }
          : undefined;
  if (!candidate) return;
  for (const id of new Set(
    [contact.id, contact.phoneNumber, contact.lid].filter(Boolean) as string[],
  ))
    saveName(user, id, candidate.value, candidate.priority);
}

export function savePushName(user: string, id: string, name?: string | null) {
  if (name) saveName(user, id, name, 1);
}

export function saveConversationName(
  user: string,
  id: string,
  name?: string | null,
) {
  if (name) saveName(user, id, name, 5);
}

export function contactName(user: string, id: string): string | undefined {
  return (
    db
      .prepare("SELECT name FROM contacts WHERE user_id=? AND id=?")
      .get(user, id) as { name: string } | undefined
  )?.name;
}

export function conversationName(user: string, id: string): string | undefined {
  const stored = db
    .prepare("SELECT name,priority FROM contacts WHERE user_id=? AND id=?")
    .get(user, id) as { name: string; priority: number } | undefined;
  return id.endsWith("@g.us") && (!stored || stored.priority < 5)
    ? undefined
    : stored?.name;
}

export async function syncGroupNames(user: string, socket: WASocket) {
  const groups = await socket.groupFetchAllParticipating();
  for (const group of Object.values(groups))
    saveConversationName(user, group.id, group.subject);
}

export async function backfillSavedContacts(
  user: string,
  socket: WASocket,
  state: AuthenticationState,
) {
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM chats WHERE user_id=?) AS chats,
         (SELECT COUNT(*) FROM contacts WHERE user_id=?) AS contacts,
         (SELECT COUNT(*) FROM service_state WHERE user_id=? AND key='contacts-snapshot') AS completed`,
    )
    .get(user, user, user) as {
    chats: number;
    contacts: number;
    completed: number;
  };
  if (!counts.chats || counts.contacts || counts.completed) return;

  await state.keys.set({
    "app-state-sync-version": { critical_unblock_low: null },
  });
  await socket.resyncAppState(["critical_unblock_low"], true);
  db.prepare("INSERT OR REPLACE INTO service_state VALUES(?,?,?)").run(
    user,
    "contacts-snapshot",
    new Date().toISOString(),
  );
}
