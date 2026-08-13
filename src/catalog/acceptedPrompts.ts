import { prisma } from "../db.js";
import type { CsvShotIdea } from "./types.js";

export type PromptSource = "csv" | "slack";

export interface AcceptedPromptInput {
  sku: string;
  shotIdea: string;
  imageUrl?: string | null;
  source: PromptSource;
  approvedBy: string;
  requestId?: string | null;
}

// Idempotent on (sku, shotIdea) — first writer wins, later writes for the same text are
// a no-op. Used by CSV re-sync (source "csv") and Slack approval (source "slack").
export function upsertAcceptedPrompt(input: AcceptedPromptInput) {
  return prisma.acceptedPrompt.upsert({
    where: { sku_shotIdea: { sku: input.sku, shotIdea: input.shotIdea } },
    create: {
      sku: input.sku,
      shotIdea: input.shotIdea,
      imageUrl: input.imageUrl ?? null,
      source: input.source,
      approvedBy: input.approvedBy,
      requestId: input.requestId ?? null,
    },
    update: {},
  });
}

export async function upsertAcceptedPromptsFromCsv(entries: CsvShotIdea[]): Promise<{ count: number }> {
  for (const entry of entries) {
    await upsertAcceptedPrompt({
      sku: entry.sku,
      shotIdea: entry.shotIdea,
      source: "csv",
      approvedBy: "csv-import",
    });
  }
  return { count: entries.length };
}

export function listAcceptedPromptsForSku(sku: string) {
  return prisma.acceptedPrompt.findMany({ where: { sku }, orderBy: { createdAt: "desc" } });
}

export function listAllAcceptedPromptsWithProduct() {
  return prisma.acceptedPrompt.findMany({
    include: { product: true },
    orderBy: [{ sku: "asc" }, { createdAt: "asc" }],
  });
}
