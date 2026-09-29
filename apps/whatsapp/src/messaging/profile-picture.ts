import { connectedSocket } from "../sessions/manager.js";
import {
  saveProfilePicture,
  storedProfilePicture,
  type StoredProfilePicture,
} from "../storage/profile-pictures.js";

const refreshAfterMs = 6 * 60 * 60 * 1000;
const maxPictureBytes = 5 * 1024 * 1024;

export async function profilePicture(
  user: string,
  chatId: string,
): Promise<StoredProfilePicture | undefined> {
  const cached = storedProfilePicture(user, chatId);
  if (cached && Date.now() - cached.updatedAt < refreshAfterMs) return cached;

  try {
    const url = await connectedSocket(user).profilePictureUrl(
      chatId,
      "preview",
      10_000,
    );
    if (!url) {
      saveProfilePicture(user, chatId, null, null);
      return storedProfilePicture(user, chatId);
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const mime = response.headers.get("content-type")?.split(";")[0];
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (
      !response.ok ||
      !mime?.startsWith("image/") ||
      declaredSize > maxPictureBytes
    )
      throw new Error("Foto de perfil indisponível.");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > maxPictureBytes)
      throw new Error("Foto de perfil excede o limite permitido.");
    saveProfilePicture(user, chatId, mime, data);
    return storedProfilePicture(user, chatId);
  } catch {
    return cached;
  }
}
