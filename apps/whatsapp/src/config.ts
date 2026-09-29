import { resolve } from "node:path";
export const config = {
  port: Number(process.env.PORT || 3080),
  host: process.env.HOST || "127.0.0.1",
  dataDir: resolve(process.env.DATA_DIR || "data"),
  secret: process.env.SERVICE_SECRET || "local-development-only-change-me",
  apiUrl: process.env.CRM_API_URL || "http://localhost:5080",
};
if (process.env.NODE_ENV === "production" && !process.env.SERVICE_SECRET)
  throw new Error("SERVICE_SECRET é obrigatório.");
