import { db } from "./database.js";

export type StoredProfilePicture = {
  mime: string | null;
  data: Uint8Array | null;
  updatedAt: number;
};

export function storedProfilePicture(
  user: string,
  chatId: string,
): StoredProfilePicture | undefined {
  return db
    .prepare(
      `SELECT mime,data,updated_at AS updatedAt
       FROM profile_pictures WHERE user_id=? AND chat_id=?`,
    )
    .get(user, chatId) as StoredProfilePicture | undefined;
}

export function saveProfilePicture(
  user: string,
  chatId: string,
  mime: string | null,
  data: Uint8Array | null,
) {
  db.prepare(
    `INSERT INTO profile_pictures VALUES(?,?,?,?,?)
     ON CONFLICT(user_id,chat_id) DO UPDATE SET
       mime=excluded.mime,data=excluded.data,updated_at=excluded.updated_at`,
  ).run(user, chatId, mime, data, Date.now());
}
