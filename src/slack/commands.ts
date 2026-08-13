import type { AnyBlock } from "@slack/types";
import {
  listAcceptedPromptsForSku,
  upsertAcceptedPrompt,
  upsertAcceptedPromptsFromCsv,
} from "../catalog/acceptedPrompts.js";
import { rewriteCatalogCsv } from "../catalog/csvWriter.js";
import { parseCatalogCsv } from "../catalog/parseCsv.js";
import { listProducts, upsertProducts } from "../catalog/service.js";
import { env } from "../config.js";
import {
  createRequest,
  listRecentShotIdeasForSku,
  ProductNotFoundError,
} from "../requests/service.js";
import { slackApp } from "./app.js";

const SHOT_REQUEST_CALLBACK_ID = "shot_request_submit";
const REUSE_PROMPT_NONE = "__none__";

interface SendToEllieValue {
  requestId: string;
  sku: string;
  shotIdea: string;
  imageUrl: string;
}

interface SelectOption {
  text: { type: "plain_text"; text: string };
  value: string;
  description?: { type: "plain_text"; text: string };
}

function productOption(sku: string, name: string, price: string | null): SelectOption {
  return {
    text: { type: "plain_text", text: `${name} (${sku})`.slice(0, 75) },
    value: sku,
    ...(price ? { description: { type: "plain_text", text: price } } : {}),
  };
}

interface ModalViewOptions {
  products: Awaited<ReturnType<typeof listProducts>>;
  selectedSku?: string;
  shotIdeaValue?: string;
  recentIdeas?: Awaited<ReturnType<typeof listRecentShotIdeasForSku>>;
  approvedPrompts?: Awaited<ReturnType<typeof listAcceptedPromptsForSku>>;
}

// Product picker is a static_select for now (Slack caps these at 100 options).
// At the full ~300-product catalog this needs to become an external_select backed by
// a search endpoint instead — noted as a v1 limit, not solved here.
function buildShotRequestView({ products, selectedSku, shotIdeaValue, recentIdeas, approvedPrompts }: ModalViewOptions) {
  const productOptions = products.slice(0, 100).map((p) => productOption(p.sku, p.name, p.price));
  const selectedOption = selectedSku ? productOptions.find((o) => o.value === selectedSku) : undefined;

  const blocks: AnyBlock[] = [
    {
      type: "input",
      block_id: "product_block",
      label: { type: "plain_text", text: "Product" },
      dispatch_action: true,
      element: {
        type: "static_select",
        action_id: "product_select",
        placeholder: { type: "plain_text", text: "Pick a product" },
        options: productOptions,
        ...(selectedOption ? { initial_option: selectedOption } : {}),
      },
    },
  ];

  if (selectedSku && approvedPrompts && approvedPrompts.length > 0) {
    blocks.push({
      type: "input",
      block_id: "approved_prompt_block",
      optional: true,
      label: { type: "plain_text", text: "Use a prompt already approved for this product" },
      dispatch_action: true,
      element: {
        type: "static_select",
        action_id: "approved_prompt_select",
        placeholder: { type: "plain_text", text: "Approved shot ideas" },
        options: [
          { text: { type: "plain_text" as const, text: "— write my own —" }, value: REUSE_PROMPT_NONE },
          ...approvedPrompts.map((p, i) => ({
            text: { type: "plain_text" as const, text: `"${p.shotIdea}"`.slice(0, 75) },
            value: String(i),
          })),
        ],
      },
    });
  }

  if (selectedSku && recentIdeas && recentIdeas.length > 0) {
    blocks.push({
      type: "input",
      block_id: "reuse_prompt_block",
      optional: true,
      label: { type: "plain_text", text: "Reuse a previous idea for this product" },
      dispatch_action: true,
      element: {
        type: "static_select",
        action_id: "reuse_prompt_select",
        placeholder: { type: "plain_text", text: "Or start from someone else's shot idea" },
        options: [
          { text: { type: "plain_text" as const, text: "— write my own —" }, value: REUSE_PROMPT_NONE },
          ...recentIdeas.map((r, i) => ({
            text: { type: "plain_text" as const, text: `"${r.shotIdea}" — <@${r.requestedBy}>`.slice(0, 75) },
            value: String(i),
          })),
        ],
      },
    });
  }

  blocks.push({
    type: "input",
    block_id: "shot_idea_block",
    label: { type: "plain_text", text: "Shot idea" },
    element: {
      type: "plain_text_input",
      action_id: "shot_idea_input",
      multiline: true,
      placeholder: { type: "plain_text", text: "e.g. morning kitchen counter, steam, warm light" },
      ...(shotIdeaValue ? { initial_value: shotIdeaValue } : {}),
    },
  });

  return {
    type: "modal" as const,
    callback_id: SHOT_REQUEST_CALLBACK_ID,
    private_metadata: JSON.stringify({
      selectedSku: selectedSku ?? "",
      recentIdeas: recentIdeas?.map((r) => r.shotIdea) ?? [],
      approvedIdeas: approvedPrompts?.map((p) => p.shotIdea) ?? [],
    }),
    title: { type: "plain_text" as const, text: "Request a styled shot" },
    submit: { type: "plain_text" as const, text: "Generate" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks,
  };
}

// /shot-request — opens a modal to pick a product + write a shot idea.
slackApp.command("/shot-request", async ({ ack, body, client, logger }) => {
  await ack();

  const products = await listProducts();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildShotRequestView({ products }),
    });
  } catch (err) {
    logger.error("Failed to open shot-request modal", err);
  }
});

interface ShotRequestMetadata {
  selectedSku?: string;
  recentIdeas?: string[];
  approvedIdeas?: string[];
}

async function loadModalDependencies(sku: string) {
  const [products, recentIdeas, approvedPrompts] = await Promise.all([
    listProducts(),
    listRecentShotIdeasForSku(sku),
    listAcceptedPromptsForSku(sku),
  ]);
  return { products, recentIdeas, approvedPrompts };
}

// Picking a product re-renders the modal with that product's past shot ideas (if any)
// and approved shot ideas (if any), so people can see and start from each other's prompts.
slackApp.action("product_select", async ({ ack, body, client, logger }) => {
  await ack();
  if (body.type !== "block_actions" || !body.view) return;

  const action = body.actions[0];
  const sku = action?.type === "static_select" ? action.selected_option?.value : undefined;
  if (!sku) return;

  try {
    const { products, recentIdeas, approvedPrompts } = await loadModalDependencies(sku);
    const currentShotIdea = body.view.state.values.shot_idea_block?.shot_idea_input?.value ?? undefined;

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: buildShotRequestView({
        products,
        selectedSku: sku,
        shotIdeaValue: currentShotIdea,
        recentIdeas,
        approvedPrompts,
      }),
    });
  } catch (err) {
    logger.error("Failed to update shot-request modal after product select", err);
  }
});

// Picking a past prompt from the reuse dropdown fills the shot-idea field with it.
slackApp.action("reuse_prompt_select", async ({ ack, body, client, logger }) => {
  await ack();
  if (body.type !== "block_actions" || !body.view) return;

  const action = body.actions[0];
  const choiceIndex = action?.type === "static_select" ? action.selected_option?.value : undefined;
  if (choiceIndex === undefined || choiceIndex === REUSE_PROMPT_NONE) return;

  try {
    const metadata = JSON.parse(body.view.private_metadata || "{}") as ShotRequestMetadata;
    const chosenIdea = metadata.recentIdeas?.[Number(choiceIndex)];
    if (!metadata.selectedSku || chosenIdea === undefined) return;

    const { products, recentIdeas, approvedPrompts } = await loadModalDependencies(metadata.selectedSku);

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: buildShotRequestView({
        products,
        selectedSku: metadata.selectedSku,
        shotIdeaValue: chosenIdea,
        recentIdeas,
        approvedPrompts,
      }),
    });
  } catch (err) {
    logger.error("Failed to apply reused prompt", err);
  }
});

// Picking an approved prompt from the "already approved" dropdown fills the shot-idea field.
slackApp.action("approved_prompt_select", async ({ ack, body, client, logger }) => {
  await ack();
  if (body.type !== "block_actions" || !body.view) return;

  const action = body.actions[0];
  const choiceIndex = action?.type === "static_select" ? action.selected_option?.value : undefined;
  if (choiceIndex === undefined || choiceIndex === REUSE_PROMPT_NONE) return;

  try {
    const metadata = JSON.parse(body.view.private_metadata || "{}") as ShotRequestMetadata;
    const chosenIdea = metadata.approvedIdeas?.[Number(choiceIndex)];
    if (!metadata.selectedSku || chosenIdea === undefined) return;

    const { products, recentIdeas, approvedPrompts } = await loadModalDependencies(metadata.selectedSku);

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: buildShotRequestView({
        products,
        selectedSku: metadata.selectedSku,
        shotIdeaValue: chosenIdea,
        recentIdeas,
        approvedPrompts,
      }),
    });
  } catch (err) {
    logger.error("Failed to apply approved prompt", err);
  }
});

slackApp.view(SHOT_REQUEST_CALLBACK_ID, async ({ ack, view, body, client, logger }) => {
  await ack();

  const sku = view.state.values.product_block?.product_select?.selected_option?.value;
  const shotIdea = view.state.values.shot_idea_block?.shot_idea_input?.value;
  const requestedBy = body.user.id;

  if (!sku || !shotIdea) {
    return;
  }

  try {
    await client.chat.postMessage({
      channel: requestedBy,
      text: `Generating a styled shot for ${sku} — this can take a minute or two, I'll DM you when it's ready.`,
    });

    const request = await createRequest({ sku, shotIdea, requestedBy });
    const outputUrls = Array.isArray(request.outputs)
      ? (request.outputs as { url: string }[]).map((o) => o.url)
      : [];

    await client.chat.postMessage({
      channel: requestedBy,
      text: `Your styled shot${outputUrls.length > 1 ? "s" : ""} for ${sku} ${outputUrls.length > 1 ? "are" : "is"} ready.`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*${sku}* — "${shotIdea}"\nStatus: *${request.status}*` },
        },
      ],
    });

    // Each candidate goes out as its own message (not bundled into one) so it can be
    // forwarded/shared on its own — forwarding a multi-image message forwards all of it.
    // Each also gets a "Send to Ellie" button that posts it into the approval channel.
    for (const [i, url] of outputUrls.entries()) {
      const sendValue: SendToEllieValue = { requestId: request.id, sku, shotIdea, imageUrl: url };
      await client.chat.postMessage({
        channel: requestedBy,
        text: `${sku} — candidate ${i + 1}`,
        blocks: [
          {
            type: "image",
            image_url: url,
            alt_text: `${shotIdea} (candidate ${i + 1})`,
          },
          {
            type: "actions",
            block_id: "send_to_ellie_block",
            elements: [
              {
                type: "button",
                action_id: "send_to_ellie",
                text: { type: "plain_text", text: "Send to Ellie for approval" },
                value: JSON.stringify(sendValue),
              },
            ],
          },
        ],
      });
    }

    await client.chat.postMessage({
      channel: requestedBy,
      text: "Post your pick in the team channel for Ellie the same way you would today.",
      blocks: [
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Post your pick in the team channel for Ellie the same way you would today.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof ProductNotFoundError) {
      await client.chat.postMessage({ channel: requestedBy, text: `Couldn't find product ${sku}.` });
      return;
    }
    logger.error("Failed to create request", err);
    await client.chat.postMessage({
      channel: requestedBy,
      text: "Something went wrong generating that shot — try again in a bit.",
    });
  }
});

// Requester clicks this in their own DM to send a specific candidate to Ellie for
// approval. Swaps the button out for a static "sent" state immediately — that swap is
// the guard against double-sending, not a separate DB flag.
slackApp.action("send_to_ellie", async ({ ack, body, client, logger }) => {
  await ack();
  if (body.type !== "block_actions") return;
  const action = body.actions[0];
  if (action?.type !== "button" || !action.value) return;

  if (!env.slackApprovalChannelId) {
    logger.error("SLACK_APPROVAL_CHANNEL_ID not configured; cannot send candidate for approval");
    return;
  }

  const payload = JSON.parse(action.value) as SendToEllieValue;

  try {
    await client.chat.update({
      channel: body.channel!.id!,
      ts: body.message!.ts!,
      text: `${payload.sku} — sent to Ellie for approval`,
      blocks: [
        { type: "image", image_url: payload.imageUrl, alt_text: `${payload.shotIdea} candidate` },
        { type: "context", elements: [{ type: "mrkdwn", text: "✅ Sent to Ellie for approval" }] },
      ],
    });

    await client.chat.postMessage({
      channel: env.slackApprovalChannelId,
      text: `New shot idea for ${payload.sku} awaiting approval`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${payload.sku}*\n"${payload.shotIdea}"\nRequested by <@${body.user.id}>`,
          },
        },
        { type: "image", image_url: payload.imageUrl, alt_text: payload.shotIdea },
        {
          type: "actions",
          block_id: "approval_actions",
          elements: [
            {
              type: "button",
              action_id: "approve_prompt",
              style: "primary",
              text: { type: "plain_text", text: "Approve" },
              value: action.value,
            },
            {
              type: "button",
              action_id: "disapprove_prompt",
              style: "danger",
              text: { type: "plain_text", text: "Disapprove" },
              value: action.value,
            },
          ],
        },
      ],
    });
  } catch (err) {
    logger.error("Failed to send candidate to Ellie", err);
  }
});

async function requireAdmin(
  userId: string,
  channel: string,
  client: Parameters<Parameters<typeof slackApp.action>[1]>[0]["client"]
): Promise<boolean> {
  if (env.slackAdminUserId && userId === env.slackAdminUserId) {
    return true;
  }
  await client.chat.postEphemeral({
    channel,
    user: userId,
    text: "Only Ellie can approve or disapprove shot ideas.",
  });
  return false;
}

// Approve/Disapprove — restricted to SLACK_ADMIN_USER_ID (Ellie). Approving records the
// shot idea as an accepted prompt for the product and rewrites data/catalog.csv;
// disapproving just updates the message, no DB write.
slackApp.action("approve_prompt", async ({ ack, body, client, logger }) => {
  await ack();
  if (body.type !== "block_actions") return;
  const action = body.actions[0];
  if (action?.type !== "button" || !action.value) return;
  const channel = body.channel?.id;
  if (!channel) return;

  if (!(await requireAdmin(body.user.id, channel, client))) return;

  const payload = JSON.parse(action.value) as SendToEllieValue;

  try {
    await upsertAcceptedPrompt({
      sku: payload.sku,
      shotIdea: payload.shotIdea,
      imageUrl: payload.imageUrl,
      source: "slack",
      approvedBy: body.user.id,
      requestId: payload.requestId,
    });

    try {
      await rewriteCatalogCsv();
    } catch (err) {
      logger.error("Failed to rewrite catalog.csv after approval", err);
    }

    await client.chat.update({
      channel,
      ts: body.message!.ts!,
      text: `${payload.sku} — approved`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${payload.sku}*\n"${payload.shotIdea}"` } },
        { type: "image", image_url: payload.imageUrl, alt_text: payload.shotIdea },
        { type: "context", elements: [{ type: "mrkdwn", text: "✅ Approved by Ellie" }] },
      ],
    });
  } catch (err) {
    logger.error("Failed to approve prompt", err);
  }
});

slackApp.action("disapprove_prompt", async ({ ack, body, client, logger }) => {
  await ack();
  if (body.type !== "block_actions") return;
  const action = body.actions[0];
  if (action?.type !== "button" || !action.value) return;
  const channel = body.channel?.id;
  if (!channel) return;

  if (!(await requireAdmin(body.user.id, channel, client))) return;

  const payload = JSON.parse(action.value) as SendToEllieValue;

  try {
    await client.chat.update({
      channel,
      ts: body.message!.ts!,
      text: `${payload.sku} — rejected`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${payload.sku}*\n"${payload.shotIdea}"` } },
        { type: "image", image_url: payload.imageUrl, alt_text: payload.shotIdea },
        { type: "context", elements: [{ type: "mrkdwn", text: "❌ Rejected by Ellie" }] },
      ],
    });
  } catch (err) {
    logger.error("Failed to reject prompt", err);
  }
});

// /catalog-sync — Slack slash commands can't carry file attachments, so this points the
// user at a follow-up step: share the CSV as a message in the same channel, which the
// `message` listener below picks up and syncs.
slackApp.command("/catalog-sync", async ({ ack, respond }) => {
  await ack();
  await respond({
    response_type: "ephemeral",
    text: "Drop the new catalog CSV into this channel as a file and I'll sync it automatically.",
  });
});

slackApp.event("message", async ({ event, client, logger }) => {
  const msg = event as { channel: string; files?: { url_private: string; name: string; mimetype: string }[] };
  const csvFile = msg.files?.find(
    (f) => f.mimetype === "text/csv" || f.name?.toLowerCase().endsWith(".csv")
  );
  if (!csvFile) return;

  try {
    await client.chat.postMessage({
      channel: msg.channel,
      text: `Syncing catalog from *${csvFile.name}*...`,
    });

    const response = await fetch(csvFile.url_private, {
      headers: { Authorization: `Bearer ${env.slackBotToken}` },
    });
    if (!response.ok) {
      throw new Error(`Couldn't download the file from Slack (HTTP ${response.status})`);
    }
    const csvContent = await response.text();
    const { products, shotIdeas, skipped } = parseCatalogCsv(csvContent);

    if (products.length === 0) {
      await client.chat.postMessage({
        channel: msg.channel,
        text: `That CSV didn't have any valid rows. ${skipped.length} row(s) were skipped:\n${formatSkipped(skipped)}`,
      });
      return;
    }

    const result = await upsertProducts(products);
    const promptResult = await upsertAcceptedPromptsFromCsv(shotIdeas);

    const lines = [
      `Catalog synced — ${result.count} of ${products.length + skipped.length} product rows updated from *${csvFile.name}*` +
        ` (${promptResult.count} shot idea(s) recorded as approved prompts).`,
    ];
    if (skipped.length > 0) {
      lines.push(`Skipped ${skipped.length} row(s), fix and re-upload to include them:\n${formatSkipped(skipped)}`);
    }

    await client.chat.postMessage({ channel: msg.channel, text: lines.join("\n") });
  } catch (err) {
    logger.error("Failed to sync catalog from Slack file", err);
    await client.chat.postMessage({
      channel: msg.channel,
      text: `Couldn't sync that CSV: ${(err as Error).message}`,
    });
  }
});

function formatSkipped(skipped: { row: number; sku?: string; reason: string }[]): string {
  return skipped
    .slice(0, 10)
    .map((s) => `• row ${s.row}${s.sku ? ` (${s.sku})` : ""}: ${s.reason}`)
    .join("\n") + (skipped.length > 10 ? `\n...and ${skipped.length - 10} more` : "");
}
