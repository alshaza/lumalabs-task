import { env } from "../config.js";
import type { GenerateImageInput, GenerateImageOutput } from "./types.js";

const LUMA_API_BASE = "https://agents.lumalabs.ai/v1";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

interface LumaGeneration {
  id: string;
  state: "completed" | "failed" | string;
  output?: { type: string; url: string }[];
  failure_reason?: string | null;
}

async function lumaRequest(path: string, init?: RequestInit): Promise<LumaGeneration> {
  if (!env.lumaApiKey) {
    throw new Error("Missing required env var: LUMA_AGENTS_API_KEY");
  }

  const response = await fetch(`${LUMA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.lumaApiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Luma API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<LumaGeneration>;
}

async function pollUntilDone(id: string): Promise<LumaGeneration> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const generation = await lumaRequest(`/generations/${id}`);
    if (generation.state === "completed" || generation.state === "failed") {
      return generation;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Luma generation ${id} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

/**
 * Fires one Luma image_edit generation and polls it to completion.
 * Real contract: docs.agents.lumalabs.ai/guides/images/editing
 */
async function generateOne({ sourceImageUrl, prompt }: GenerateImageInput): Promise<GenerateImageOutput> {
  try {
    const created = await lumaRequest("/generations", {
      method: "POST",
      body: JSON.stringify({
        type: "image_edit",
        prompt,
        source: { url: sourceImageUrl },
        model: "uni-1",
      }),
    });

    const finished = await pollUntilDone(created.id);

    if (finished.state === "completed" && finished.output?.length) {
      return {
        status: "completed",
        outputs: finished.output.map((o) => ({ url: o.url })),
      };
    }

    return {
      status: "failed",
      outputs: [],
      failureReason: finished.failure_reason ?? "Generation did not complete",
    };
  } catch (err) {
    return {
      status: "failed",
      outputs: [],
      failureReason: (err as Error).message,
    };
  }
}

/**
 * Requests multiple candidate images for a single shot idea. The Luma API returns one
 * image per generation call, so "2-3 candidates" (per README/scope ledger) means firing
 * that many parallel image_edit calls, not one call with a count parameter.
 */
export async function generateImage(
  input: GenerateImageInput,
  candidateCount = 2
): Promise<GenerateImageOutput> {
  const results = await Promise.all(
    Array.from({ length: candidateCount }, () => generateOne(input))
  );

  const outputs = results.flatMap((r) => r.outputs);

  if (outputs.length === 0) {
    return {
      status: "failed",
      outputs: [],
      failureReason: results.find((r) => r.failureReason)?.failureReason ?? "All candidates failed",
    };
  }

  return { status: "completed", outputs };
}
