import { z } from "zod";

// A conta principal mantém a chave legada; contas adicionais incluem o dono do CRM.
export const sessionIdSchema = z.string().regex(/^\d+(?:_[a-f0-9]{32})?$/);

export function sessionOwner(session: string) {
  return sessionIdSchema.parse(session).split("_")[0];
}
