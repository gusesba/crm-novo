import type { WASocket } from "@whiskeysockets/baileys";
import { z } from "zod";
import { connectedSocket } from "../sessions/manager.js";
import { db } from "../storage/database.js";
import { saveContact } from "../storage/contacts.js";

export const contactChatSchema = z
  .string()
  .regex(/^\d{10,15}@s\.whatsapp\.net$/);
export const saveContactSchema = z.object({
  chatId: contactChatSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
});

export function getContact(user: string, chatId: string) {
  contactChatSchema.parse(chatId);
  const stored = db
    .prepare("SELECT name,priority FROM contacts WHERE user_id=? AND id=?")
    .get(user, chatId) as { name: string; priority: number } | undefined;
  const details = db
    .prepare(
      "SELECT first_name,last_name,full_name FROM contact_names WHERE user_id=? AND id=?",
    )
    .get(user, chatId) as
    { first_name: string; last_name: string; full_name: string } | undefined;
  const fullName = stored?.name || "";
  const sameName = details?.full_name === fullName;
  const [firstName = "", ...surname] = fullName.split(/\s+/);
  return {
    chatId,
    firstName: sameName ? details.first_name : firstName,
    lastName: sameName ? details.last_name : surname.join(" "),
    fullName,
    saved: (stored?.priority || 0) >= 4,
  };
}

export async function saveWhatsAppContact(
  user: string,
  input: z.input<typeof saveContactSchema>,
  getSocket: (
    user: string,
  ) => Pick<WASocket, "addOrEditContact"> = connectedSocket,
) {
  const { chatId, firstName, lastName } = saveContactSchema.parse(input);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const mapping = db
    .prepare("SELECT value FROM auth WHERE user_id=? AND key=?")
    .get(user, `lid-mapping-${chatId.split("@")[0]}`) as
    { value: string } | undefined;
  const mapped: unknown = mapping ? JSON.parse(mapping.value) : undefined;
  const lid =
    typeof mapped === "string" && /^\d+$/.test(mapped)
      ? `${mapped}@lid`
      : undefined;
  const socket = getSocket(user);
  try {
    await socket.addOrEditContact(chatId, {
      firstName,
      fullName,
      pnJid: chatId,
      lidJid: lid,
      saveOnPrimaryAddressbook: false,
    });
  } catch (error) {
    if ((error as Error).message?.includes("App state key not present"))
      throw Object.assign(
        new Error(
          "Aguarde a sincronização do WhatsApp antes de salvar o contato.",
        ),
        { statusCode: 409 },
      );
    throw error;
  }
  // Não anunciar sucesso local antes da confirmação do app-state remoto.
  db.exec("BEGIN IMMEDIATE");
  try {
    saveContact(user, { id: chatId, phoneNumber: chatId, lid, name: fullName });
    db.prepare(
      "INSERT INTO contact_names VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,full_name=excluded.full_name",
    ).run(user, chatId, firstName, lastName, fullName);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { chatId, firstName, lastName, fullName, saved: true };
}
