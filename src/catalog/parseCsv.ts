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

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseCatalogCsv(csvContent: string): ProductInput[] {
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const products: ProductInput[] = [];

  for (const row of rows) {
    const sku = clean(row.SKU);
    const name = clean(row["Product Name"]);
    const photoUrl = clean(row.Photo);

    // Quirky export, quirks included: skip rows missing the fields we treat as required.
    if (!sku || !name || !photoUrl) {
      continue;
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
  }

  return products;
}
