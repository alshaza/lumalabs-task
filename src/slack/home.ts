import { listRecentRequests } from "../requests/service.js";
import { slackApp } from "./app.js";

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  generating: "🎨",
  ready: "✅",
  failed: "⚠️",
};

function statusLine(status: string): string {
  return `${STATUS_EMOJI[status] ?? "•"} ${status}`;
}

slackApp.event("app_home_opened", async ({ event, client, logger }) => {
  if (event.tab !== "home") return;

  try {
    const requests = await listRecentRequests(20);

    const blocks = requests.length
      ? requests.flatMap((r) => [
          {
            type: "section" as const,
            text: {
              type: "mrkdwn" as const,
              text: `*${r.product.name}* (${r.sku})\n"${r.shotIdea}"\n${statusLine(r.status)} · requested by <@${r.requestedBy}> · ${r.createdAt.toLocaleString()}`,
            },
          },
          { type: "divider" as const },
        ])
      : [
          {
            type: "section" as const,
            text: { type: "mrkdwn" as const, text: "No shot requests yet — run `/shot-request` to create one." },
          },
        ];

    await client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Styled shot requests" },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Most recent 20 requests, across everyone. Use `/shot-request` to start a new one." }],
          },
          { type: "divider" },
          ...blocks,
        ],
      },
    });
  } catch (err) {
    logger.error("Failed to publish Home tab", err);
  }
});
