import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(join(config.dataDir, "whatsapp.db"));
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS auth (user_id TEXT, key TEXT, value TEXT, PRIMARY KEY(user_id,key));
  CREATE TABLE IF NOT EXISTS contacts (user_id TEXT, id TEXT, name TEXT, priority INTEGER, PRIMARY KEY(user_id,id));
  CREATE TABLE IF NOT EXISTS contact_names (user_id TEXT, id TEXT, first_name TEXT, last_name TEXT, full_name TEXT, PRIMARY KEY(user_id,id));
  CREATE TABLE IF NOT EXISTS service_state (user_id TEXT, key TEXT, value TEXT, PRIMARY KEY(user_id,key));
  CREATE TABLE IF NOT EXISTS chats (user_id TEXT, id TEXT, name TEXT, last_text TEXT, updated_at INTEGER, PRIMARY KEY(user_id,id));
  CREATE TABLE IF NOT EXISTS chat_states (user_id TEXT, id TEXT, archived INTEGER NOT NULL DEFAULT 0, pinned_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,id));
  CREATE TABLE IF NOT EXISTS messages (user_id TEXT, id TEXT, chat_id TEXT, text TEXT, mine INTEGER, kind TEXT, timestamp INTEGER, raw TEXT, PRIMARY KEY(user_id,id));
  CREATE TABLE IF NOT EXISTS pending_message_edits (user_id TEXT,id TEXT,chat_id TEXT,target_id TEXT,timestamp INTEGER,raw TEXT,PRIMARY KEY(user_id,id));
  CREATE INDEX IF NOT EXISTS pending_message_edits_target ON pending_message_edits(user_id,chat_id,target_id,timestamp);
  CREATE INDEX IF NOT EXISTS messages_chat ON messages(user_id,chat_id,timestamp);
  CREATE INDEX IF NOT EXISTS messages_stickers ON messages(user_id,kind,timestamp DESC);
  CREATE TABLE IF NOT EXISTS message_reactions (user_id TEXT, message_id TEXT, sender TEXT, emoji TEXT, PRIMARY KEY(user_id,message_id,sender));
  CREATE TABLE IF NOT EXISTS profile_pictures (user_id TEXT, chat_id TEXT, mime TEXT, data BLOB, updated_at INTEGER, PRIMARY KEY(user_id,chat_id));
  CREATE TABLE IF NOT EXISTS media_cache (user_id TEXT, message_id TEXT, mime TEXT, name TEXT, data BLOB NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,message_id));
  CREATE INDEX IF NOT EXISTS media_cache_age ON media_cache(created_at);
  CREATE TABLE IF NOT EXISTS media_settings (id INTEGER PRIMARY KEY CHECK(id=1), retention_enabled INTEGER NOT NULL DEFAULT 0, retention_days INTEGER NOT NULL DEFAULT 30, purged_before INTEGER NOT NULL DEFAULT 0);
  INSERT OR IGNORE INTO media_settings(id) VALUES(1);
  CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, user_id TEXT, payload TEXT, status TEXT, sent INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, skipped INTEGER DEFAULT 0, error TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS campaign_deliveries (
    campaign_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    lead_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    external_message_id TEXT,
    updated_at INTEGER,
    PRIMARY KEY(campaign_id, position)
  );
  CREATE INDEX IF NOT EXISTS campaign_deliveries_status ON campaign_deliveries(campaign_id,status,position);
`);
const chatStateColumns = db.prepare("PRAGMA table_info(chat_states)").all() as { name: string }[];
if (!chatStateColumns.some((column) => column.name === "unread_count"))
  db.exec("ALTER TABLE chat_states ADD COLUMN unread_count INTEGER NOT NULL DEFAULT 0");
if (!chatStateColumns.some((column) => column.name === "unread_updated_at"))
  db.exec("ALTER TABLE chat_states ADD COLUMN unread_updated_at INTEGER NOT NULL DEFAULT 0");
// Um envio interrompido pode ter sido aceito pelo WhatsApp. Não reenviar automaticamente.
db.prepare(
  "UPDATE campaigns SET status='interrupted', error='Serviço reiniciado. Confira o histórico antes de criar outro lote.' WHERE status IN ('running','queued')",
).run();
