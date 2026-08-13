# Luma Take-Home — Forward Deployed Engineer

Context extracted from README.md so it doesn't need re-reading every session. Do not modify README.md — it is the assignment brief, not project output.

## The problem (customer: six-person home-goods brand, ~300 products)

- Catalog lives in one shared spreadsheet (`data/catalog.csv`): SKU, name, category, color/finish, material, price, Photo (white-background product shot URL), Shot Idea (free text, often empty), Notes.
- When someone wants a styled photo, they write a "Shot Idea" in that row. That's the entire request mechanism today.
- Today's flow is manual and slow: Ellie (runs product content) batches requests 2–3x/year for a freelance photographer, waits weeks for a contact sheet, picks a winner in the team chat, drops approved finals in a shared drive, and the web person uploads roughly weekly.
- "Done" for a request = 2–3 approved images matching the shot idea, in the drive folder, on the product page.
- Steps 3–4 (batching + freelancer turnaround) are the bottleneck — everything else already works for them.

## Hard constraints (from Maya/Ellie, verbatim in README)

- **No new platform/dashboard.** They tried one; nobody logged in after week one. "If I can't do it from the chat, on my phone, it doesn't exist."
- Approval has to happen **inside the chat they already use** (Slack or Telegram — our choice).
- Generation costs money — **don't burn budget generating images Ellie will reject.**
- Maya wants visibility into status **without having to ask Ellie.**
- A 40-product drop lands next month — needs to be the first real test of the whole pipeline, driven by a fresh CSV export (same columns, new rows/photo URLs).

## What "done" looks like for this exercise

- Deployed, real (not localhost) — live URL and/or joinable chat workspace goes in APPROACH.md.
- New CSV exports need an ingestion path (design is ours; must be demoed in the video).
- Luma API key is in `.env.local` (gitignored) — docs at docs.agents.lumalabs.ai.
- Deliverables: working software, `ASSUMPTIONS.md`, `APPROACH.md` (incl. scope ledger + unit economics + failure modes), `video.md` with an ~8 min video link, AI session history via `./submit.sh`.

## Our current direction (subject to change — check APPROACH.md for the live version)

Slack app/plugin as the front end:
1. Someone edits/adds a Shot Idea in the sheet (or triggers via chat) → backend picks it up.
2. Backend calls the Luma API to generate candidate styled image(s) against the product's white-background photo + shot idea text.
3. Backend posts the generated image(s) back into the Slack channel for Ellie to approve/reject inline (phone-friendly, no login).
4. Approval in Slack drives status (and ideally writes back to the sheet / drive folder / product page pipeline).

Do not treat this as locked — `APPROACH.md` is the source of truth for current scope and decisions, and it changes as we build (see `.claude/rules/`).

## Working agreement

- Never edit `README.md`.
- Keep `APPROACH.md` updated as we go — see `.claude/rules/keep-approach-updated.md`.
- Assumptions made where the brief is silent belong in `ASSUMPTIONS.md`, not buried in code comments or chat.
