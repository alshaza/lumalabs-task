import "dotenv/config";

export interface Env {
  port: number;
  databaseUrl: string;
  slackBotToken: string;
  slackSigningSecret: string;
  lumaApiKey: string;
  slackAdminUserId: string;
  slackApprovalChannelId: string;
  restrictApprovalToAdmin: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env: Env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  lumaApiKey: process.env.LUMA_AGENTS_API_KEY ?? "",
  slackAdminUserId: process.env.SLACK_ADMIN_USER_ID ?? "",
  slackApprovalChannelId: process.env.SLACK_APPROVAL_CHANNEL_ID ?? "",
  // Defaults to unrestricted (testing convenience) — set to "true" to actually restrict
  // Approve/Disapprove to SLACK_ADMIN_USER_ID. Must be explicitly "true" in any real deploy.
  restrictApprovalToAdmin: process.env.SLACK_RESTRICT_APPROVAL_TO_ADMIN === "true",
};
