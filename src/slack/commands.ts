import { parseCatalogCsv } from "../catalog/parseCsv.js";
import { listProducts, upsertProducts } from "../catalog/service.js";
import { env } from "../config.js";
import { createRequest, ProductNotFoundError } from "../requests/service.js";
import { slackApp } from "./app.js";

const SHOT_REQUEST_CALLBACK_ID = "shot_request_submit";

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

// /shot-request — opens a modal to pick a product + write a shot idea.
// Product picker is a static_select for now (Slack caps these at 100 options).
// At the full ~300-product catalog this needs to become an external_select backed by
// a search endpoint instead — noted as a v1 limit, not solved here.
slackApp.command("/shot-request", async ({ ack, body, client, logger }) => {
  await ack();

  const products = await listProducts();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: SHOT_REQUEST_CALLBACK_ID,
        title: { type: "plain_text", text: "Request a styled shot" },
        submit: { type: "plain_text", text: "Generate" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "product_block",
            label: { type: "plain_text", text: "Product" },
            element: {
              type: "static_select",
              action_id: "product_select",
              placeholder: { type: "plain_text", text: "Pick a product" },
              options: products
                .slice(0, 100)
                .map((p) => productOption(p.sku, p.name, p.price)),
            },
          },
          {
            type: "input",
            block_id: "shot_idea_block",
            label: { type: "plain_text", text: "Shot idea" },
            element: {
              type: "plain_text_input",
              action_id: "shot_idea_input",
              multiline: true,
              placeholder: { type: "plain_text", text: "e.g. morning kitchen counter, steam, warm light" },
            },
          },
        ],
      },
    });
  } catch (err) {
    logger.error("Failed to open shot-request modal", err);
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
    const request = await createRequest({ sku, shotIdea, requestedBy });
    const outputUrl = Array.isArray(request.outputs)
      ? (request.outputs as { url: string }[])[0]?.url
      : undefined;

    await client.chat.postMessage({
      channel: requestedBy,
      text: `Your styled shot for ${sku} is ready.`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*${sku}* — "${shotIdea}"\nStatus: *${request.status}*` },
        },
        ...(outputUrl
          ? [{ type: "image" as const, image_url: outputUrl, alt_text: shotIdea }]
          : []),
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
    const response = await fetch(csvFile.url_private, {
      headers: { Authorization: `Bearer ${env.slackBotToken}` },
    });
    const csvContent = await response.text();
    const products = parseCatalogCsv(csvContent);

    if (products.length === 0) {
      await client.chat.postMessage({ channel: msg.channel, text: "That CSV didn't have any valid rows." });
      return;
    }

    const result = await upsertProducts(products);
    await client.chat.postMessage({
      channel: msg.channel,
      text: `Catalog synced — ${result.count} products updated.`,
    });
  } catch (err) {
    logger.error("Failed to sync catalog from Slack file", err);
    await client.chat.postMessage({ channel: msg.channel, text: "Couldn't sync that CSV — check the format and try again." });
  }
});
