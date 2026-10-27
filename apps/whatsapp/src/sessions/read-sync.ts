import { areJidsSameUser, proto, type AuthenticationState, type WASocket } from "@whiskeysockets/baileys";
import { syncMessageRead } from "../storage/chat-states.js";

export function syncReadEvents(user: string, socket: Pick<WASocket, "ev">, state: AuthenticationState, isCurrent = () => true) {
  socket.ev.on("messages.update", (updates) => {
    if (!isCurrent()) return;
    for (const { key, update } of updates)
      if (update.status === proto.WebMessageInfo.Status.READ) syncMessageRead(user, key);
  });
  socket.ev.on("message-receipt.update", (updates) => {
    if (!isCurrent()) return;
    for (const { key, receipt } of updates) {
      const me = state.creds.me;
      const sender = receipt.userJid;
      if (!receipt.readTimestamp || !sender ||
          ![me?.id, me?.lid].some((id) => id && areJidsSameUser(id, sender))) continue;
      // Recibos de grupo trazem o participante; somente a própria conta confirma leitura local.
      syncMessageRead(user, { ...key, fromMe: false });
    }
  });
}
