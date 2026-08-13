import "dotenv/config";

export interface Env {
  port: number;
  databaseUrl: string;
  slackBotToken: string;
  slackSigningSecret: string;
  catalogCsvPath: string;
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
  catalogCsvPath: process.env.CATALOG_CSV_PATH ?? "./data/catalog.csv",
};
