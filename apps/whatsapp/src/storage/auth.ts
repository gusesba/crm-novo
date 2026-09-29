import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import { db } from "./database.js";

export function sqliteAuth(userId: string) {
  const read = (key: string) => {
    const row = db
      .prepare("SELECT value FROM auth WHERE user_id=? AND key=?")
      .get(userId, key) as { value: string } | undefined;
    return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
  };
  const write = (key: string, value: unknown) => {
    if (value == null)
      db.prepare("DELETE FROM auth WHERE user_id=? AND key=?").run(userId, key);
    else
      db.prepare("INSERT OR REPLACE INTO auth VALUES(?,?,?)").run(
        userId,
        key,
        JSON.stringify(value, BufferJSON.replacer),
      );
  };
  const creds = read("creds") || initAuthCreds();
  const state: AuthenticationState = {
    creds,
    keys: {
      async get(type, ids) {
        const result: Record<string, any> = {};
        for (const id of ids) {
          let value = read(`${type}-${id}`);
          if (type === "app-state-sync-key" && value)
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          result[id] = value;
        }
        return result;
      },
      async set(data) {
        db.exec("BEGIN");
        try {
          for (const [type, values] of Object.entries(data))
            for (const [id, value] of Object.entries(values || {}))
              write(`${type}-${id}`, value);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  return { state, saveCreds: () => write("creds", creds) };
}
