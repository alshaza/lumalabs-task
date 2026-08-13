# Assumptions

Format: the question we'd ask this team if we could, the assumption we proceeded on instead, and what that assumption changed about what we built. Ordered roughly by how load-bearing each one is.

---

### 1. Chat platform: Slack, not Telegram

**Question we'd ask:** Which one does the team actually live in day to day?
**Assumption:** Slack. The README leaves it open ("assume Slack or Telegram, whichever you prefer"), but a real engagement would have gotten this answered before writing code — we're treating it as something that *should* have been confirmed with Maya/Ellie up front, and picking Slack because it has the richer bot/Block Kit/interactivity surface for what we need to build (product picker, inline approve/reject, image previews).
**What it changed:** Everything about the integration layer — Slack Bolt SDK, slash commands / modals, Block Kit messages, OAuth install flow — instead of a Telegram bot API integration. If this assumption is wrong, the chat-layer code is the part that needs to be swapped; the backend (catalog store, generation, approval state) shouldn't need to change.

### 2. Ellie's review habit doesn't change at all — v1 keeps her exact current process

**Question we'd ask:** Is the current "eyeball a few images in the group chat and say 'that one'" pattern good enough, or does she actually want more structure (e.g. side-by-side compare, buttons)?
**Assumption:** Locked by explicit direction: v1 does **not** introduce approve/reject buttons or any new interaction pattern for Ellie. Candidates land in the team group chat as plain messages/images and she picks the same way she does today — informally, in her own words, in the thread. We only fix the bottleneck (weeks-long freelancer turnaround), not her review habit.
**What it changed:** No structured "approval" state machine in v1 — there's no bot-parsed accept/reject signal at all. "Approved" is a social fact that happens in the chat, same as today; our system's job ends at getting candidates in front of her fast and cheap. Buttons/reactions for a structured, bot-tracked approval are explicitly **v2** (see APPROACH.md scope ledger) — deferred so Maya's "see status without asking Ellie" ask can eventually be answered without changing how Ellie works.

### 3. Generation is decoupled from Ellie's channel — someone drafts async, then posts their pick to the team chat

**Question we'd ask:** Should every generated image go straight into the shared channel, or should there be a lightweight "does this look right before I show Ellie" step?
**Assumption:** The person filling in a Shot Idea (picking a product + typing the shot idea) interacts with the bot first, async and on their own time — product picker, shot idea text, generation happens, results come back to *them* privately. They then post their preferred candidate(s) into the team chat for Ellie the same way a person would today, rather than every generation landing in front of Ellie automatically.
**What it changed:** Two logical surfaces instead of one: a private/async "request" surface (anyone, picks product + writes shot idea, reviews results on their own) and the existing team chat as the unchanged "approval" surface. This also gives us a natural point to enforce budget guardrails (README: "don't burn our budget on stuff she'll reject") — e.g. capping variants per request to the 2–3 the README defines as "done," and not auto-generating for every blank Shot Idea in the sheet.

### 4. The backend is the source of truth for the catalog; CSV exports are just a sync mechanism

**Question we'd ask:** Do new exports fully replace the catalog, or should previously-tracked status (requested / generating / awaiting approval / approved) survive when Ellie's team re-exports the sheet?
**Assumption:** The backend keeps its own persistent catalog (SKU-keyed). New CSV uploads upsert by SKU — new rows get added, existing rows get their sheet-owned fields (name, price, photo, shot idea, notes) refreshed, but state we own (request/approval status, generated image history) is not clobbered by a re-export.
**What it changed:** We need a real ingestion step (parse → upsert by SKU) instead of treating the CSV as the live datastore. This is also the mechanism the README calls out explicitly for the 40-product drop next month.

### 5. Anyone on the team can request a shot; only Ellie approves

**Question we'd ask:** Is requesting restricted to specific people (e.g. only Ellie or Maya), or is it genuinely open to whoever notices a product needs a styled shot — which is closer to how the Shot Idea column works today (anyone can write in that column)?
**Assumption:** Open — anyone in the Slack workspace/channel can pick a product and submit a shot idea, mirroring today's spreadsheet where the Shot Idea column isn't gated. Approval, however, stays Ellie's call, per the README ("Her pick is the decision; there is no other approval step").
**What it changed:** No request-side auth/role system needed — just Slack workspace membership. Approval-side does need to know who "Ellie" is (or an approver role) so random reactions from other people don't count as approval.

### 6. Prompt suggestions are v2, not MVP

**Question we'd ask:** How much do people actually struggle writing a Shot Idea today, versus it just being slow to *action* what's already written?
**Assumption:** The bottleneck the README describes is turnaround (steps 3–4: batching + freelancer weeks), not prompt quality — people are already writing reasonable Shot Ideas in the sheet unassisted. Prompt suggestions are a nice-to-have layered on top later, not required to prove the core loop.
**What it changed:** Cut from the initial build. Logged in APPROACH.md's scope ledger as a "next," not built now.

---

### 7. CSV re-ingestion happens via a Slack slash command with a file attached

**Question we'd ask:** Should new exports (like the 40-product drop) sync in automatically from Drive/Sheets, or is a manual step fine?
**Assumption:** A slash command (e.g. `/catalog-sync`) where someone attaches the new CSV, run from inside Slack. Keeps the "if I can't do it from the chat, on my phone, it doesn't exist" constraint intact for this admin action too, and is simplest to demo live.
**What it changed:** No external polling/webhook infrastructure needed for v1. Upsert-by-SKU logic (assumption 4) triggers off this command instead of a scheduled job.

---

## Resolved — now locked

- ~~Exactly which Slack primitive Ellie uses to approve~~ → resolved: **none in v1**, see assumption 2.
- ~~How a fresh CSV export gets ingested~~ → resolved: **slash command file upload**, see assumption 7.
