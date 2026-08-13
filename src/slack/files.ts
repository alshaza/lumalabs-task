import type { WebClient } from "@slack/web-api";
import { env } from "../config.js";

export interface UploadedImage {
  fileId: string;
  permalink: string;
  urlPrivate: string;
}

interface UploadV2Result {
  files?: { id?: string; permalink?: string; url_private?: string }[];
}

async function uploadBuffer(
  client: WebClient,
  { channelId, buffer, filename, initialComment }: { channelId: string; buffer: Buffer; filename: string; initialComment?: string }
): Promise<UploadedImage> {
  const result = (await client.files.uploadV2({
    channel_id: channelId,
    file: buffer,
    filename,
    ...(initialComment ? { initial_comment: initialComment } : {}),
  })) as UploadV2Result;

  const uploaded = result.files?.[0];
  if (!uploaded?.id || !uploaded.permalink || !uploaded.url_private) {
    throw new Error("Slack file upload did not return expected file metadata");
  }

  return { fileId: uploaded.id, permalink: uploaded.permalink, urlPrivate: uploaded.url_private };
}

// Downloads bytes from a source URL and uploads them to Slack as a real file, so the
// image survives after the source expires — Luma's generation output URLs are
// temporary/signed and eventually stop resolving.
export async function uploadImageFromUrl(
  client: WebClient,
  { channelId, url, filename, initialComment }: { channelId: string; url: string; filename: string; initialComment?: string }
): Promise<UploadedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image (HTTP ${response.status}): ${url}`);
  }
  return uploadBuffer(client, { channelId, buffer: Buffer.from(await response.arrayBuffer()), filename, initialComment });
}

// Re-shares an already-uploaded Slack file into another channel by re-downloading it
// (via the bot's own auth) and uploading a fresh copy. Slack has no "move file to
// channel" API — this is the supported workaround, and it depends only on Slack's own
// durable storage, not on the original (possibly-expired) source URL.
export async function reuploadSlackFile(
  client: WebClient,
  { channelId, urlPrivate, filename, initialComment }: { channelId: string; urlPrivate: string; filename: string; initialComment?: string }
): Promise<UploadedImage> {
  const response = await fetch(urlPrivate, {
    headers: { Authorization: `Bearer ${env.slackBotToken}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to re-download Slack file (HTTP ${response.status})`);
  }
  return uploadBuffer(client, { channelId, buffer: Buffer.from(await response.arrayBuffer()), filename, initialComment });
}
