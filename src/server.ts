import express from "express";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { catalogRouter } from "./catalog/routes.js";
import { requestsRouter } from "./requests/routes.js";

const app = express();
// Scoped to /api only — Bolt's ExpressReceiver needs the raw, unconsumed request
// body for Slack's signature verification. A global express.json() here would
// consume the body before Slack requests reach the receiver, breaking auth.
app.use("/api", express.json());

app.get("/", (_req, res) => {
  res.send("ok");
});

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

app.use("/api", catalogRouter);
app.use("/api", requestsRouter);

// Slack is optional at boot — the app runs and the REST API is fully usable before a
// Slack app/bot token exists (see the plan's Slack setup step).
if (env.slackBotToken && env.slackSigningSecret) {
  const { receiver } = await import("./slack/app.js");
  await import("./slack/commands.js");
  await import("./slack/home.js");
  app.use(receiver.router);
  console.log("Slack integration enabled");
} else {
  console.log("Slack env vars not set — Slack endpoints disabled, REST API still available");
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(env.port, () => {
  console.log(`Backend listening on :${env.port}`);
});
