## Starting point (Ellie's constraint, verbatim from the founder's brief)

Ellie is an old school manager, she doesn't want a new platform. she want to use the one she already knows. (Telegram or Slack)

What I'm thinking is why having a dedicated chat project where people need to go log in and chat, and Ellie will need to go and login and approves. she clearly doesn't like that. and people won't do that either.

"Nobody logged in after week one."

---

## What we're building (v1)

A Slack app/plugin backed by our own service. It does three things:

1. **Owns the catalog.** Persists all ~300 products (SKU-keyed), kept current via CSV re-sync (see below). This is the source of truth, not the spreadsheet itself.
2. **Turns a Shot Idea into candidates, async.** Anyone can open the bot, pick a product from the catalog, and type a shot idea (free text — people already know how to prompt; prompt suggestions are a v2 nice-to-have, not required to unblock this team). The backend calls the Luma API and returns candidate images to that person privately, on their own time.
3. **Leaves approval exactly where it already lives.** The requester picks their preferred candidate(s) and posts them into the existing team chat, the same way anyone would drop a photo in today. Ellie approves the same way she already does — no new buttons, no new step for her. We are not touching her workflow at all in v1; we're only collapsing the freelancer-turnaround bottleneck (steps 3–4 in the README) from weeks to minutes.

New catalog exports (e.g. the 40-product drop) come in via a Slack slash command with the CSV attached — stays inside the chat, no external tool, upserted by SKU so in-flight requests/history aren't lost on re-sync.

## Key decisions and tradeoffs

- **Slack over Telegram.** README left this open; a real engagement would've confirmed it with the customer first. We're assuming Slack for its richer bot/interactivity surface, and treating "we didn't get to ask" as a flag, not a fact — see ASSUMPTIONS.md #1.
- **Decouple generation from approval.** Generation happens in a private, async surface (DM/modal with the bot); approval stays 100% in the existing team chat, untouched. This directly serves "don't burn budget on stuff she'll reject" — a requester can look at candidates before anything reaches Ellie — without adding any new step to *her* side. See ASSUMPTIONS.md #2–3.
- **No structured approve/reject in v1.** Deliberately deferred (below) so Ellie's process stays byte-for-byte what it is today. Costs us: no bot-tracked approval state, so Maya's "see status without asking Ellie" ask isn't fully answered yet in v1.
- **Backend, not the sheet, is the source of truth.** CSV is an import format, not the live datastore — upsert by SKU on each sync. See ASSUMPTIONS.md #4.
- **CSV re-sync via Slack slash command + file upload.** Keeps the one admin action that isn't "approve a photo" still inside chat. See ASSUMPTIONS.md #7.

## Scope ledger

**In (v1):**
- Slack app: product picker + shot-idea capture, async/private to the requester.
- Luma generation, 2–3 candidates per request (matches README's definition of "done").
- Requester manually posts chosen candidate(s) to the team chat — no automation here, matches today's behavior exactly.
- Catalog persistence + CSV re-sync via slash command, upsert by SKU.
- Deployed, live instance (not localhost).

**Out / deferred to v2 — logged here because it was explicitly cut, not forgotten:**
- **Structured approve/reject (buttons or reactions) on candidate messages in the team chat**, with bot-tracked approval state. Cut for v1 specifically because Ellie's stated ask is "don't change how I work" — this would change it. Worth revisiting once the async request loop is proven, since it's what would let Maya see status without asking Ellie.
- **Prompt suggestions** for the shot-idea field. Cut because the bottleneck this team described is turnaround time, not prompt quality — people already write reasonable shot ideas unassisted today.
- **Auto-write approved images back to the product page / shared drive.** Out of scope for v1; "approved" stays a social fact in chat, same as today, with the drive/upload step still manual.
- Automatic/webhook-based CSV ingestion (polling Drive/Sheets) instead of a manual slash-command upload.

**Next (not started, candidate order):**
1. Structured approval + status visibility for Maya (the biggest gap left by v1).
2. Write-back to the drive folder / product page once something's approved.
3. Prompt suggestions.

## Build status

**Backend is built and verified locally.** Node.js + TypeScript (strict) + Express, PostgreSQL via Prisma (chosen over a JSON-file store for real scalability — durable, migratable, handles 10x catalog growth), Slack via `@slack/bolt` (mounted only once `SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET` are set, so the REST API works standalone before a Slack app exists).

**Run it:** `cp .env.example .env` (fill in Slack creds later, safe to leave blank for now) → `docker compose up --build` from the repo root. Starts Postgres, runs Prisma migrations, imports `data/catalog.csv`, serves on `:3000` (`GET /`, `GET /health`, `GET /api/products[/:sku]`, `POST /api/catalog/sync`, `POST /api/requests`, `GET /api/requests/:id`, plus `/slack/*` once Slack env vars are set). Local dev without Docker: `npm install && npx prisma migrate dev && npm run dev` (needs a reachable Postgres via `DATABASE_URL`).

Implemented: catalog CRUD + CSV upsert-by-SKU sync, the full request lifecycle (`POST /api/requests` → `GET /api/requests/:id`), and Slack handlers (`/shot-request` modal → DM with result; `/catalog-sync` → prompts for a file share, synced via a `message` event listener since Slack slash commands can't carry attachments — a wrinkle the original plan glossed over). Verified end-to-end against the sample 40-product CSV: health check, product list/lookup, idempotent re-sync, and a full create-request round trip.

**Generation is live** (`src/generation/lumaClient.ts`) — calls the real Luma Agents API (`POST /v1/generations`, `type: "image_edit"`, `model: "uni-1"`), polls `GET /v1/generations/{id}` every 2s up to a 2-minute timeout, per docs.agents.lumalabs.ai. The API returns one image per call, so "2–3 candidates" (scope ledger) means firing 2 parallel `image_edit` calls per request and merging their outputs — not a single call with a count param, since the API doesn't support that. If some candidates fail and others succeed, we still return the successful ones; only an all-fail case marks the request `failed`. Slack DM now renders every candidate image, not just the first. Requires `LUMA_AGENTS_API_KEY` set (Railway + local `.env`); the function signature/contract from the earlier stub was preserved so no upstream code (request service, routes, Slack handlers) needed to change beyond rendering multiple images.

**Repo layout: backend lives at repo root, not `backend/`.** Originally built under `backend/`, but Railway's GitHub-integration deploy builds from the repo root by default and doesn't auto-detect a Dockerfile in a subdirectory — it needs "Root Directory" set explicitly in the dashboard, and the first deploy failed without it. Moving `package.json`/`Dockerfile`/`docker-compose.yml`/`src/`/`prisma/` to the repo root sidesteps that entirely: Railway (and anyone else) finds the Dockerfile where it looks by default. `data/catalog.csv` was already at the repo root, so `CATALOG_CSV_PATH=./data/catalog.csv` needed no change. Re-verified end-to-end after the move (`docker compose up --build` from root, health check + product list + request round-trip all still pass).

Not yet done: real Luma generation, Slack app not yet created in a workspace (see plan's step-by-step), deployment.

## Unit economics

Per docs.agents.lumalabs.ai pricing: `uni-1` image editing is **$0.0434/image**, `uni-1-max` is **$0.1030/image**. We default to `uni-1` (cheaper; `uni-1-max` is an easy env-level swap in `lumaClient.ts` if quality demands it).

- **Per request (2 candidates, uni-1): ~$0.0868.** This is the real cost floor of every `/shot-request` submission, since both candidates fire in parallel unconditionally — there's no cheaper single-candidate path today.
- **40-product drop, one shot idea each: ~$3.47** if every product gets exactly one request. Real usage will be higher since requesters can re-run a shot idea if they don't like either candidate.
- **Where budget actually leaks:** not per-image cost, but *repeat requests* — a requester unhappy with both candidates just runs `/shot-request` again, doubling cost with no guardrail today. Nothing currently caps retries per SKU or warns a requester that they're about to spend again. Worth a v2 guardrail (e.g. show a re-generate confirmation, or track spend per SKU) once real usage data exists.

## What breaks first under pressure

*To be filled in as the build progresses — will cover the 10× catalog scenario and where the async-request / manual-post design is most likely to strain.*

## Deployment

*Live URL / Slack workspace link goes here once deployed.*
