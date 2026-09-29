import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";
import { restoreSessions, stopSessions } from "./sessions/manager.js";
import { stopCampaigns } from "./campaigns/worker.js";
import { db } from "./storage/database.js";

const app = Fastify({ logger: true, bodyLimit: 24_000_000 });
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
  const supplied = Buffer.from(String(req.headers["x-service-key"] || ""));
  const expected = Buffer.from(config.secret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return reply.code(401).send({ message: "Não autorizado." });
});
app.setErrorHandler((error, req, reply) => {
  if (error instanceof ZodError)
    return reply
      .code(400)
      .send({ message: error.issues.map((x) => x.message).join(" ") });
  const e = error as Error & { statusCode?: number };
  req.log.error({ err: e }, "Request failed");
  return reply.code(e.statusCode || 502).send({
    message: e.statusCode
      ? e.message
      : "Falha na integração WhatsApp. Verifique a conexão.",
  });
});
app.get("/health", async () => ({ status: "ok" }));
await registerRoutes(app);
await app.listen({ host: config.host, port: config.port });
void restoreSessions();
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    const draining = stopCampaigns();
    stopSessions();
    await app.close();
    await draining;
    db.close();
    process.exit(0);
  });
