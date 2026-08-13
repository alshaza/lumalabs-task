import type { GenerateImageInput, GenerateImageOutput } from "./types.js";

/**
 * STUB. Real Luma Agents API call comes later, per explicit instruction —
 * user is providing exact step-by-step for this integration separately.
 *
 * Real shape (docs.agents.lumalabs.ai), for reference when wiring this up:
 *   POST https://agents.lumalabs.ai/v1/generations
 *     { type: "image_edit", model: "uni-1", prompt, source: { url: sourceImageUrl } }
 *   -> { id, state: "queued" }
 *   then poll GET /v1/generations/{id} until state is "completed" | "failed"
 *   -> output[0].url on success
 *
 * Signature below (sourceImageUrl + prompt in; status + outputs[].url out) is intentionally
 * the real contract already, so only this file's body changes when we implement it for real —
 * nothing upstream (request service, routes, Slack handlers) needs to change.
 */
export async function generateImage({ sourceImageUrl }: GenerateImageInput): Promise<GenerateImageOutput> {
  return {
    status: "completed",
    outputs: [{ url: sourceImageUrl }],
  };
}
