import { Router } from "express";
import multer from "multer";
import { parseCatalogCsv } from "./parseCsv.js";
import { getProductBySku, listProducts, upsertProducts } from "./service.js";

const upload = multer({ storage: multer.memoryStorage() });

export const catalogRouter = Router();

catalogRouter.get("/products", async (_req, res) => {
  const products = await listProducts();
  res.json(products);
});

catalogRouter.get("/products/:sku", async (req, res) => {
  const product = await getProductBySku(req.params.sku);
  if (!product) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(product);
});

catalogRouter.post("/catalog/sync", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "missing_file", message: "Attach a CSV under the 'file' field." });
    return;
  }

  const csvContent = req.file.buffer.toString("utf-8");
  const products = parseCatalogCsv(csvContent);

  if (products.length === 0) {
    res.status(400).json({ error: "no_valid_rows" });
    return;
  }

  const result = await upsertProducts(products);
  res.json({ synced: result.count });
});
