import type { WebClient } from "@slack/web-api";
import { env } from "../config.js";

export interface UploadedImage {
  fileId: string;
  permalink: string;
  urlPrivate: string;
}

// client.files.uploadV2() returns { ok, files: completion } where `completion` is the
// array of raw files.completeUploadExternal responses (one per completion "job") — each
// of THOSE is itself { ok, files: [...] } wrapping the actual file object one level
// deeper than it looks. See @slack/web-api's WebClient.js filesUploadV2()/completeFileUploads().
interface UploadV2Result {
  files?: { ok?: boolean; files?: { id?: string; permalink?: string; url_private?: string }[] }[];
}

// Slack's completeUploadExternal (which uploadV2 wraps) can return success before the
// file has finished processing/thumbnailing — permalink/url_private are sometimes empty
// on the immediate response even though the upload itself succeeded. Poll files.info
// briefly to let that settle instead of treating it as a hard failure.
async function waitForFileMetadata(client: WebClient, fileId: string): Promise<{ permalink: string; urlPrivate: string } | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const info = (await client.files.info({ file: fileId })) as {
      file?: { permalink?: string; url_private?: string };
    };
    const { permalink, url_private: urlPrivate } = info.file ?? {};
    if (permalink && urlPrivate) {
      return { permalink, urlPrivate };
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return undefined;
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

  const uploaded = result.files?.[0]?.files?.[0];
  if (!uploaded?.id) {
    throw new Error("Slack file upload did not return a file ID");
  }

  const metadata =
    uploaded.permalink && uploaded.url_private
      ? { permalink: uploaded.permalink, urlPrivate: uploaded.url_private }
      : await waitForFileMetadata(client, uploaded.id);

  if (!metadata) {
    throw new Error(`Slack file ${uploaded.id} uploaded but permalink/url_private never became available`);
  }

  return { fileId: uploaded.id, ...metadata };
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
