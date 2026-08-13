# Approach

## Initial thinking — why Slack

Ellie's constraint, verbatim from the founder's brief: she won't log into a new platform. "If I can't do it from the chat, on my phone, it doesn't exist." The README leaves the choice between Slack and Telegram open to us.

We decided to go with **Slack**.

Reasons: it's an assumption, not a confirmed fact — the README leaves Slack vs. Telegram open, and we can't interview the team to check. We're assuming Slack because it's the more common tool for a small team's internal chat. If it turns out they're actually on Telegram, the same approach (async generation surface, approval left exactly where it already lives) carries over — Slack is the implementation choice, not the design. Full writeup: [ASSUMPTIONS.md #1](ASSUMPTIONS.md#1-chat-platform-slack-not-telegram).

## What we built and why

A Slack app that can be installed into the team's own workspace, not a standalone tool they have to visit. It ships with a reusable app manifest (`slack-app-manifest.json`), so the same app definition can be installed into any workspace without rebuilding it from scratch each time.

We'd suggest going further than this exercise: publish the app (submit it for listing / share it with Luma's team) so it becomes a proper, reusable solution backed by Luma's own model — not a one-off integration built for a single customer.

## Key decisions and tradeoffs

- **No config dashboard.** They already rejected a dashboard once ("nobody logged in after week one"). Everything is pre-configured for their exact use case — no new surface, no process change.

## Scope ledger

**In:**
- Slack app with two slash commands: generate images for a product, and sync/extend the catalog with new products (so the 40-product drop and future exports go through the same path).
- Slack App Home tab — read-only status list of recent shot requests, so Maya can check status without asking Ellie.
- Ellie-only Approve/Disapprove flow (gated to one Slack user) with CSV write-back on approval.

**Out / deferred:**
- No dedicated chat app or standalone website for generating images — everything lives inside Slack, the tool they already use.
- No dedicated/continuous support build-out for their specific requirements — v1 is scoped to encourage them to lean on the service more over time, without forcing much change on them up front.
- Auto-write approved images to the actual product page / shared drive — CSV write-back covers the catalog record, not the image asset landing where the team already looks for it.
- Durable CSV export — current write-back targets local container disk, which Railway wipes on redeploy; an on-demand `/catalog-export` would be a durable fallback.
- Postgres read replica / backup strategy — single instance, no documented recovery path if it goes down. Not implemented: at this customer's scale (single small Postgres DB, ~300–3,000 products) we don't see a real need for it yet.

**Next:**
- **Prompt generation from product + history context.** Give a shot idea a headline and generate a good prompt from it, using the product's own context and previous generations for that product/category — instead of requiring someone to write a full prompt by hand.
- **v2: Slack Home settings per workspace.** Extend the App Home so admins can switch application config per workspace, once we have more than one customer to configure for (ties to "What we built and why" — publishing this as a reusable Slack app).
- **Later, once they're comfortable with the system: an optional login-gated dashboard** for things that don't fit well in Slack — switching the image model, tuning how many candidates get generated per request, etc. Deliberately sequenced after v1/v2, not before, so we don't repeat the "nobody logged in after week one" mistake by introducing a login surface too early.
- **A products dashboard** they can either use directly on their website or integrate with whatever tool they're already using to generate the CSV export — so the catalog sync stops being a manual file upload and becomes a live integration on their side.
- **Lock down `/api/*` to Slack-originated requests only.** Right now `/api/*` (`src/server.ts` — catalog + requests routers) has no auth: anyone with the deployed Railway URL can call `POST /api/requests` directly and trigger a paid Luma generation, or read/write catalog data, entirely bypassing Slack. `/slack/*` is already safe — Bolt's receiver verifies Slack's request signature on every call. Fix is either to require an internal auth token on `/api/*` (since the Slack handlers are the only legitimate caller, they can attach it themselves) or to remove the public REST surface entirely and route everything through Slack handlers calling the service layer in-process. Logged as v2, not implemented this session — flagging loudly since an open `/api/requests` endpoint is a real budget-drain risk, not just a hygiene issue.

## Unit economics

Per docs.agents.lumalabs.ai pricing: `uni-1` image editing is **$0.0434/image**. We default to `uni-1` (cheaper; `uni-1-max` at $0.1030/image is an env-level swap in `lumaClient.ts` if quality demands it) and generate 2 candidates per request (`candidateCount` in `lumaClient.ts`, matching the README's "2-3 approved images" definition of done).

- **Per request (2 candidates, uni-1): ~$0.087.** This is the real cost floor of every generate command.
- **Cost per approved image is not 1:1 with generation cost** — of the 2 candidates generated, typically only 1 gets sent to Ellie and approved, so the effective cost of an approved image is closer to the full request cost (~$0.087) than the per-image rate (~$0.043), before counting any re-runs.
- **40-product drop, one shot idea each: ~$3.47** if every product gets exactly one request.
- **What changes at 10×** (≈3,000 products instead of 300): generation cost scales linearly with request volume, not catalog size — a 10× catalog only costs 10× more if requesters actually submit 10× the shot ideas, which is unlikely (most of the catalog won't get a styled shot at all, same as today, per the README).

## What breaks first under pressure

- **No queue — generation runs inline in the request handler.** `/shot-request` calls Luma synchronously and blocks until candidates come back before DMing results. Fine at today's volume (a handful of requests at a time); under a burst (e.g. the whole 40-product drop submitted at once), requests pile up as sequential in-process work with no queue, no concurrency limit, and no retry/backoff — the first thing to visibly degrade is response time, then outright timeouts.

## Deployment

Deployed on **Railway** — quick to set up, fast to build/deploy, and gives us a domain + SSL out of the box with no extra infra work. The service is fully wired up to the Slack app (manifest + event/interactivity endpoints), so there's nothing else to stand up — no separate database host, no separate static site, no extra services to wire together. The current structure scales to whatever this customer's use case needs (300 products today, the 40-product drop, and beyond) without infra changes.

Live URL / Slack workspace link: (https://join.slack.com/t/elliesfamilycompany/shared_invite/zt-46rpodvj6-YCPtisIaKe3Asphkh8BAjg)

## Time spent

~6 hours building (design, implementation, deploy, and the production bug-fix pass covered above) + ~1 hour summarizing the docs and recording the two videos.
