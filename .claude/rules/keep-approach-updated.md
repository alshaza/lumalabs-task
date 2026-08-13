# Rule: keep APPROACH.md current as we build

APPROACH.md is a living deliverable for this exercise, not a document to fill in at the end. Update it in the same turn as any change that affects it — don't batch it up for later.

Update APPROACH.md whenever:
- A real architectural or product decision gets made or reversed (e.g. Slack vs Telegram, how approval maps back to the sheet, how the CSV ingestion works).
- Scope changes — something moves in, out, or gets deferred to "next." Reflect it in the scope ledger with the reasoning, not just the outcome.
- A tradeoff is chosen between two viable approaches — capture what was rejected and why, not just what was picked.
- Something is deployed or the live URL/workspace changes.
- Unit economics change (cost per approved image, generation cost assumptions, etc).

Do not:
- Modify README.md — it's the assignment brief, not our output.
- Let APPROACH.md drift out of sync with what's actually built. If in doubt whether a decision is "real" enough to log, log it — a stale APPROACH.md is worse than an over-detailed one.
- Put assumptions here — those belong in ASSUMPTIONS.md. APPROACH.md is decisions/tradeoffs/status, ASSUMPTIONS.md is "the brief was silent here, so we assumed X."
