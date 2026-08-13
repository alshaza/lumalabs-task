# Assumptions


### 1. Chat platform: Slack, not Telegram
README leaves this open and we can't ask the team. Picked Slack for its richer bot/Block Kit surface. Implementation choice, not a design choice — swapping to Telegram would only touch the chat-integration layer, not the backend (catalog, generation, approval state).

### 2. Generation is decoupled from Ellie's channel
Requesters interact with the bot privately/async (pick product, write shot idea, review results themselves) before posting their pick into the team chat — not every generation lands in front of Ellie automatically.

### 3. Anyone can request a shot; only Ellie approves
Mirrors today's spreadsheet, where the Shot Idea column isn't gated. Approval stays Ellie's call per the README ("her pick is the decision").
