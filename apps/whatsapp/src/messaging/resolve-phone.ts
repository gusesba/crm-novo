export function phoneVariants(phone: string): string[] {
  const variants = new Set([phone]);
  const national = phone.startsWith("55") && [12, 13].includes(phone.length)
    ? phone.slice(2)
    : [10, 11].includes(phone.length) ? phone : undefined;
  if (national) {
    variants.add("55" + national);
    variants.add(national);
    const alternate = national.length === 11 && national[2] === "9"
      ? national.slice(0, 2) + national.slice(3)
      : national.length === 10 && /^[6-9]/.test(national.slice(2))
        ? national.slice(0, 2) + "9" + national.slice(2)
        : undefined;
    if (alternate) {
      variants.add("55" + alternate);
      variants.add(alternate);
    }
  }
  return [...variants];
}

export async function resolvePhone(
  phone: string,
  lookup: (phone: string) => Promise<{ exists: boolean; jid: string }[] | undefined>,
) {
  for (const candidate of phoneVariants(phone)) {
    const results = await lookup(candidate);
    const match = results?.find((result) => result.exists && /^\d+@s\.whatsapp\.net$/.test(result.jid));
    if (match) {
      const foundPhone = match.jid.split("@")[0];
      return { phone: foundPhone, chatId: match.jid, requiresConfirmation: foundPhone !== phone };
    }
  }
  return null;
}
