import { prisma } from "../db.js";
import { getProductBySku } from "../catalog/service.js";
import { generateImage } from "../generation/lumaClient.js";
import type { CreateRequestInput } from "./types.js";

export class ProductNotFoundError extends Error {
  constructor(sku: string) {
    super(`Product not found: ${sku}`);
  }
}

export async function createRequest(input: CreateRequestInput) {
  const product = await getProductBySku(input.sku);
  if (!product) {
    throw new ProductNotFoundError(input.sku);
  }

  const request = await prisma.generationRequest.create({
    data: {
      sku: input.sku,
      shotIdea: input.shotIdea,
      requestedBy: input.requestedBy,
      status: "generating",
    },
  });

  const result = await generateImage({
    sourceImageUrl: product.photoUrl,
    prompt: input.shotIdea,
  });

  return prisma.generationRequest.update({
    where: { id: request.id },
    data: {
      status: result.status,
      outputs: result.outputs,
    },
  });
}

export function getRequestById(id: string) {
  return prisma.generationRequest.findUnique({ where: { id } });
}

export function listRecentRequests(limit = 20) {
  return prisma.generationRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { product: { select: { name: true } } },
  });
}

// Past shot ideas for a product, most-recent-first, deduped by exact text so the same
// prompt run twice doesn't crowd out other people's ideas in the reuse list.
export async function listRecentShotIdeasForSku(sku: string, limit = 5) {
  const requests = await prisma.generationRequest.findMany({
    where: { sku },
    orderBy: { createdAt: "desc" },
    select: { shotIdea: true, requestedBy: true, createdAt: true },
    take: 50,
  });

  const seen = new Set<string>();
  const deduped: typeof requests = [];
  for (const r of requests) {
    if (seen.has(r.shotIdea)) continue;
    seen.add(r.shotIdea);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }
  return deduped;
}
