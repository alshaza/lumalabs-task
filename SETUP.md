# Setup

## 1. Environment

```
cp .env.example .env
```

Fill in:
- `DATABASE_URL` — leave the docker-compose default if running via Docker.
- `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` — from the Slack app (see §3). Safe to leave blank for local API-only work; `/slack/*` routes only mount once both are set.
- `LUMA_AGENTS_API_KEY` — from docs.agents.lumalabs.ai. Also required in `.env.local` if you're relying on that file instead (see `.env.local`'s existing comment).
- `SLACK_ADMIN_USER_ID` — Ellie's Slack user ID (find it via her profile → "Copy member ID"). Only this user can click Approve/Disapprove; safe to leave blank locally, the buttons just won't work for anyone until it's set.
- `SLACK_APPROVAL_CHANNEL_ID` — the channel the bot posts candidates into once a requester clicks "Send to Ellie for approval". Safe to leave blank for local API-only work.
- `SLACK_RESTRICT_APPROVAL_TO_ADMIN` — defaults to `false` (anyone can click Approve/Disapprove, for easy testing). Set to `true` to actually restrict it to `SLACK_ADMIN_USER_ID` — **must be `true` in any real deploy**, the unrestricted default is a testing convenience only.

## 2. Run the backend

**Docker (recommended):**
```
docker compose up --build
```
Starts Postgres, runs Prisma migrations, serves on `:3000`. The DB starts empty — there's no boot-time file import anymore (see §4); products only get in via a Slack-uploaded CSV.

**Local, no Docker** (needs a reachable Postgres via `DATABASE_URL`):
```
npm install
npx prisma migrate dev
npm run dev
```

**Verify it's up:**
```
curl localhost:3000/health
curl localhost:3000/api/products
```

## 3. Create / update the Slack app

The app is defined declaratively in `slack-app-manifest.json` — that file is the source of truth for scopes, slash commands, and event subscriptions, and currently mirrors what's actually installed on Slack (**Lumalabs Bot**). Whenever it changes, push the change to Slack manually (Slack has no CLI/API access wired into this repo — see APPROACH.md for why):

**First-time creation:**
1. Go to https://api.slack.com/apps → **Create New App** → **From an app manifest**.
2. Pick the target workspace, paste in the contents of `slack-app-manifest.json` (Slack's manifest editor accepts either YAML or JSON — pick the JSON tab), confirm.
3. Under **OAuth & Permissions**, click **Install to Workspace** and approve the requested scopes.
4. Copy the **Bot User OAuth Token** (`xoxb-...`) into `SLACK_BOT_TOKEN`, and the **Signing Secret** (Basic Information page) into `SLACK_SIGNING_SECRET`.

**Updating an existing app after editing the manifest:**
1. https://api.slack.com/apps → select the app (**Lumalabs Bot**) → **App Manifest** in the left sidebar.
2. Paste in the current contents of `slack-app-manifest.json`, click **Save Changes**. Slack diffs it and flags what's new (e.g. an added scope or event subscription).
3. If scopes changed, go to **OAuth & Permissions** and click **Reinstall to Workspace**. New scopes don't take effect until reinstalled, even though the manifest save succeeds. The bot token stays the same after reinstall, no `.env` change needed.
4. If event subscriptions changed, confirm the **Request URL** under **Event Subscriptions** still shows "Verified" — Slack re-pings it on save.

**Pending:** the manifest already includes `app_home_opened` (bot event), `features.app_home.home_tab_enabled` for the Home tab status dashboard, and `files:write` (scope, required by `client.files.uploadV2` in `src/slack/files.ts` — without it, candidate image uploads fail after generation completes and the requester gets a generic "something went wrong" DM instead of their images), but still needs `im:history` (scope) and `message.im` (bot event) added for DM-based `/catalog-sync` (see APPROACH.md). Add all of these, then follow the update steps above and reinstall — the reinstall also picks up the Home tab config in the same pass.

**Request URLs point at the deployed instance** (`https://lumalabs-task-production.up.railway.app/...`), not localhost — Slack can't reach a local dev server without a tunnel (e.g. ngrok), which isn't set up in this repo. Slash commands / events / interactivity only work end-to-end against the deployed app.

## 4. Catalog import / re-sync

The only way products get into the DB is via a Slack-uploaded CSV — once the Slack app is installed, DM the bot with `/catalog-sync` and attach a CSV (same columns as `data/catalog.csv`, which is now purely a sample/format reference and a write-back target, not something the server reads at startup) to import or re-sync — upserts by SKU, safe to re-run.
