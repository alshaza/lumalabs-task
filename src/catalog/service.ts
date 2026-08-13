import { prisma } from "../db.js";
import type { ProductInput } from "./types.js";

export async function upsertProducts(products: ProductInput[]): Promise<{ count: number }> {
  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      create: product,
      update: {
        name: product.name,
        category: product.category,
        color: product.color,
        material: product.material,
        price: product.price,
        photoUrl: product.photoUrl,
        notes: product.notes,
      },
    });
  }
  return { count: products.length };
}

export function listProducts() {
  return prisma.product.findMany({ orderBy: { sku: "asc" } });
}

export function getProductBySku(sku: string) {
  return prisma.product.findUnique({ where: { sku } });
}
