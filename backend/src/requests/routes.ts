import { Router } from "express";
import { createRequest, getRequestById, ProductNotFoundError } from "./service.js";

export const requestsRouter = Router();

requestsRouter.post("/requests", async (req, res) => {
  const { sku, shotIdea, requestedBy } = req.body ?? {};

  if (!sku || !shotIdea || !requestedBy) {
    res.status(400).json({ error: "missing_fields", required: ["sku", "shotIdea", "requestedBy"] });
    return;
  }

  try {
    const request = await createRequest({ sku, shotIdea, requestedBy });
    res.status(201).json(request);
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      res.status(404).json({ error: "product_not_found", sku });
      return;
    }
    throw err;
  }
});

requestsRouter.get("/requests/:id", async (req, res) => {
  const request = await getRequestById(req.params.id);
  if (!request) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(request);
});
