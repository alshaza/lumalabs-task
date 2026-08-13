import { readFile } from "node:fs/promises";
import express from "express";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { catalogRouter } from "./catalog/routes.js";
import { parseCatalogCsv } from "./catalog/parseCsv.js";
import { upsertProducts } from "./catalog/service.js";
import { requestsRouter } from "./requests/routes.js";

const app = express();
app.use(express.json());

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
  app.use(receiver.router);
  console.log("Slack integration enabled");
} else {
  console.log("Slack env vars not set — Slack endpoints disabled, REST API still available");
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

async function importInitialCatalog() {
  try {
    const csvContent = await readFile(env.catalogCsvPath, "utf-8");
    const products = parseCatalogCsv(csvContent);
    const result = await upsertProducts(products);
    console.log(`Imported ${result.count} products from ${env.catalogCsvPath}`);
  } catch (err) {
    console.warn(`Skipping initial catalog import (${env.catalogCsvPath}):`, (err as Error).message);
  }
}

await importInitialCatalog();

app.listen(env.port, () => {
  console.log(`Backend listening on :${env.port}`);
});
