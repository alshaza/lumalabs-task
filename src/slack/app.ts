import bolt from "@slack/bolt";
import { env } from "../config.js";

const { App, ExpressReceiver } = bolt;

export const slackEnabled = Boolean(env.slackBotToken && env.slackSigningSecret);

export const receiver = new ExpressReceiver({
  signingSecret: env.slackSigningSecret || "not-configured",
  endpoints: {
    events: "/slack/events",
    commands: "/slack/commands",
    actions: "/slack/interactions",
  },
});

export const slackApp = new App({
  token: env.slackBotToken || "not-configured",
  receiver,
});
