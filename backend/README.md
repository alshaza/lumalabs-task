# Backend

Node.js + TypeScript + Express, Postgres via Prisma, Slack via Bolt (optional until a Slack app exists). Image generation is stubbed for now — see `src/generation/lumaClient.ts`.

## Run it (one command)

```bash
cp .env.example .env   # fill in Slack creds later; safe to leave blank for now
docker compose up --build
```

This starts Postgres, runs Prisma migrations, imports `data/catalog.csv`, and serves the API on `:3000`.

## Endpoints

- `GET /health`
- `GET /api/products` / `GET /api/products/:sku`
- `POST /api/catalog/sync` — multipart `file` field, CSV re-sync (upsert by SKU)
- `POST /api/requests` — `{ sku, shotIdea, requestedBy }`, generates candidates (stubbed)
- `GET /api/requests/:id`
- `POST /slack/commands`, `POST /slack/interactions`, `POST /slack/events` — only mounted once `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` are set

## Local dev without Docker

```bash
npm install
npx prisma migrate dev   # needs a local/reachable Postgres via DATABASE_URL
npm run dev
```
