export type WhatsAppAccount = { id: string; name: string };

export function whatsappAccountPath(path: string, accountId: string) {
  if (!path.startsWith("/whatsapp/") || accountId === "default") return path;
  return `${path}${path.includes("?") ? "&" : "?"}accountId=${encodeURIComponent(accountId)}`;
}
