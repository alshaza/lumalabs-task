import { parse } from "csv-parse/sync";
import type { ProductInput } from "./types.js";

interface CsvRow {
  SKU?: string;
  "Product Name"?: string;
  Category?: string;
  "Color / Finish"?: string;
  Material?: string;
  Price?: string;
  Photo?: string;
  "Shot Idea"?: string;
  Notes?: string;
}

export interface SkippedRow {
  row: number; // 1-indexed data row (excludes header), matches what a spreadsheet user sees as row (n + 1)
  sku?: string;
  reason: string;
}

export interface ParseCsvResult {
  products: ProductInput[];
  skipped: SkippedRow[];
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseCatalogCsv(csvContent: string): ParseCsvResult {
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const products: ProductInput[] = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const sku = clean(row.SKU);
    const name = clean(row["Product Name"]);
    const photoUrl = clean(row.Photo);

    if (!sku || !name || !photoUrl) {
      const missing: string[] = [];
      if (!sku) missing.push("SKU");
      if (!name) missing.push("Product Name");
      if (!photoUrl) missing.push("Photo");
      skipped.push({ row: rowNumber, sku, reason: `missing ${missing.join(", ")}` });
      return;
    }

    products.push({
      sku,
      name,
      category: clean(row.Category),
      color: clean(row["Color / Finish"]),
      material: clean(row.Material),
      price: clean(row.Price),
      photoUrl,
      shotIdea: clean(row["Shot Idea"]),
      notes: clean(row.Notes),
    });
  });

  return { products, skipped };
}
