import { writeFile } from "node:fs/promises";
import { stringify } from "csv-stringify/sync";
import { listAllAcceptedPromptsWithProduct } from "./acceptedPrompts.js";
import { listProducts } from "./service.js";

const HEADERS = ["SKU", "Product Name", "Category", "Color / Finish", "Material", "Price", "Photo", "Shot Idea", "Notes"];
const CATALOG_CSV_PATH = "./data/catalog.csv";

// Rebuilds the whole catalog CSV from current DB state: one row per product per accepted
// prompt (or one row with an empty Shot Idea for products with none), so the file always
// represents the complete catalog and stays round-trippable through parseCatalogCsv.
// Writes to local disk — ephemeral on Railway (wiped every redeploy). The AcceptedPrompt
// table is the real source of truth; this is a best-effort export, not durable storage.
// No longer configurable via env — the catalog now only ever gets *into* the DB via a
// Slack-uploaded CSV (/catalog-sync or DM), so there's no separate "path to seed from"
// to keep in sync with this write target.
export async function rewriteCatalogCsv(): Promise<void> {
  const [products, prompts] = await Promise.all([listProducts(), listAllAcceptedPromptsWithProduct()]);

  const promptsBySku = new Map<string, string[]>();
  for (const prompt of prompts) {
    const list = promptsBySku.get(prompt.sku) ?? [];
    list.push(prompt.shotIdea);
    promptsBySku.set(prompt.sku, list);
  }

  const rows: string[][] = [];
  for (const product of products) {
    const shotIdeas = promptsBySku.get(product.sku) ?? [""];
    for (const shotIdea of shotIdeas) {
      rows.push([
        product.sku,
        product.name,
        product.category ?? "",
        product.color ?? "",
        product.material ?? "",
        product.price ?? "",
        product.photoUrl,
        shotIdea,
        product.notes ?? "",
      ]);
    }
  }

  const csv = stringify([HEADERS, ...rows]);
  await writeFile(CATALOG_CSV_PATH, csv, "utf-8");
}
