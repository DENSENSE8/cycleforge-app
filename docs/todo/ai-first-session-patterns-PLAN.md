# AI-First Session Surface — Pattern Backlog (with validation plans)

Written 2026-09-06. The session surface (`/` — `src/components/session/`, artifact
contract `src/lib/assistant/ui-artifacts.ts`, loops `src/lib/assistant/agent-loop.ts`
+ `grok-agent-loop.ts`, cohort `src/lib/assistant/session-surface-cohort.ts`) is live.
This file is the queue of patterns that build directly on it. Each entry names what
already exists, the implementation sketch, and the validation gate it must ship with.
**No pattern is done without its validation row shipped.**

Working laws these patterns inherit (do not re-litigate):
- Artifacts carry DATA, never behavior; client zod-validates before rendering.
- The artifact plane is read-only; writes are `propose_mutation` or human-Enter sends.
- Chat text is PROSE in markdown; tables/charts display only on the panel
  (leaked tables are intercepted by `extractGfmTables` and moved).
- Every verb is a registered tool (`src/lib/assistant/tools/`), never page code.
- Keyboard-first: every interactive element reachable without the mouse.

---

## 1. Artifact drill-down (slice → rows)

**Idea.** A chart wedge or timeline entry is a filter. Click/Enter it and the agent
re-queries with that facet — "show me the rows behind Thursday" is one tool call.

**Builds on.** Chart/timeline renderers already hold structured series; the composer
seed store (`requestComposerSeed`) is the reference channel.

**Sketch.** Add optional `facet: { label: string; filter: string }` to chart series
and timeline items in the contract (sanitizer coerces). Renderer dispatches the
facet as a seeded question ("Break down <subject> by <facet.label>") on
Enter/click. Zero new backend — the agent answers with its existing read tools.

**Validation.**
- Cohort: facet payloads sanitize + validate (extend the sanitizer test).
- Unit: facet seed text builder.
- e2e (keyboard): Enter on a wedge/bar produces a composer draft, Enter sends,
  an artifact returns.

## 2. Proposal cards with diffs (generalize propose_mutation rendering)

**Idea.** Every write is a before/after card in the artifact panel — Enter applies,
Esc discards — instead of a tray entry. The ticket-reply draft generalizes.

**Builds on.** `propose_mutation` trust classes, `apply-agent-mutation.ts`
chokepoint, `ArtifactTicketReplyDraft` as the card precedent.

**Sketch.** New artifact kind `mutation_proposal` (targetRef, before fields,
after fields, mutationId). Loop's write tool returns the payload; renderer adds
the card; Enter POSTs to the existing mutations apply route under the user's
session. Trust class decides whether the card says "applied" or needs the human
Enter — the model never chooses.

**Validation.**
- Cohort: proposal cards route ONLY through the mutations chokepoint (forbid raw
  fetches in the artifact plane); trust-class label present.
- Unit: card payload from each trust class (auto / draft_scoped / review).
- e2e: apply + Esc-discard paths, keyboard-only.

## 3. Follow-up suggestion chips

**Idea.** After each artifact the agent proposes 2–3 next questions as chips.

**Builds on.** Suggestion chips already exist on the start surface; artifact stack
in `useSessionArtifacts`.

**Sketch.** `suggest_followups` read tool (input: last tool + artifact kind → 3
short questions, cheap model call). Loops emit it as part of the turn; panel
renders chips under the latest artifact; Enter number keys 1–3 send.

**Validation.**
- Unit: tool returns ≤3 suggestions, plain strings, keys 1–3 bound.
- e2e: chips render after an artifact; pressing `1` sends.

## 4. Voice push-to-talk

**Idea.** Global hotkey → mic → transcript lands as an EDITABLE composer draft.

**Builds on.** `globalShortcut` patterns in `electron/main.js` (scan hotkey at
~line 387), `src/lib/ai/transcribe.ts` + `/api/ai/transcribe`, the composer's
`labelValue`/draft contract.

**Sketch.** Electron main registers push-to-talk (mirrored keybindings grammar),
renderer captures via getUserMedia on hold, posts to transcribe, inserts the
transcript as the composer draft — never auto-sends. STT mangles SKUs; the draft
step is the fix.

**Validation.**
- Unit: transcript → draft insertion (no auto-send).
- Manual/e2e in Electron: hotkey works unfocused (sendInputEvent path), draft
  editable, Enter sends.

## 5. Scan wedge as chat input

**Idea.** A barcode scan inserts a reference chip into the composer
("look up tracking …") instead of navigating. Kills the per-station scan
classifiers' last reason to exist.

**Builds on.** `useGlobalWedgeScanner` app-root waist, `routeScan` (the ONE
decoder), composer seed store, `resolve-shipment-for-scan`.

**Sketch.** Session surface registers as a scan sink; a decoded scan becomes a
seeded question from the scan TYPE (state-driven — extend `interpretScan` when it
lands). No navigation.

**Validation.**
- Unit: decoded scan → seed text per ScanType.
- e2e (keyboard-injected scan): chip appears in composer, Enter sends, artifact
  returns. This is the tripwire that per-station classifiers stay dead.

## 6. Session as the audit trail

**Idea.** Agent tool calls append timeline events per entity, so "show me the
timeline of this order" already includes what the agent did and why.

**Builds on.** `chat-persistence` (session/message rows), mutation history table,
`entity-history.ts` stitcher, `ops_events`/`inventory_events` writers.

**Sketch.** One writer: after each turn, record tool_use rows (tool name, target
refs from the read result, sessionId) into an agent-events table OR reuse
`ops_events` with `entity_type: 'agent_action'`. Timeline adapters pick it up
automatically — zero reader changes.

**Validation.**
- Unit: turn → one event per tool call, org-scoped, idempotent on retry
  (`client_event_id` discipline).
- Cohort: timeline artifact renders agent events with actor = "agent".

## 7. Cross-device handoff (phone scan → desktop session)

**Idea.** Phone scans → the desktop's open session receives the artifact live.
"Desktop paired to mobile" with zero new infrastructure.

**Builds on.** Ably org channels + `ai:assist:{sessionId}` family, capability-
scoped tokens from `/api/realtime/token`, mobile `/m` shell already
authenticated to the same org+staff channels.

**Sketch.** Mobile page POSTs the question/scan to the SAME session id;
desktop subscribes to `ai:assist:{sessionId}` and renders incoming artifacts
and deltas. Channel naming is the whole feature.

**Validation.**
- Unit: token scope cannot subscribe to another org's session channel (extend
  the realtime token test).
- e2e (two clients): phone submit → desktop artifact within a beat; no new
  transport introduced.

---

## Order of attack

1. **#3 follow-up chips** — smallest, most felt, ships with its own tool.
2. **#5 scan-as-chat-input** — kills the last hardcoded classifiers; state-driven
   scans land here too.
3. **#1 drill-down** — makes the panel interactive without new backend.
4. **#2 proposal cards** — the write-surface generalization.
5. **#6 audit trail** — one writer, unbounded payoff.
6. **#4 voice** — Electron-only, last.
7. **#7 handoff** — after #4, shares the multi-client plumbing.

## Repo-wide notes

- The `session` cohort (`src/lib/assistant/session-surface-cohort.test.ts`) is the
  tripwire home for all of these — extend it per pattern; keep `verify-profile.mjs`
  inputs declared.
- Keyboard-only Playwright specs belong beside the existing e2e specs
  (`tests/e2e/`), driven with `page.keyboard` only.
- Deletion bookkeeping: the desk teardown continues via `pnpm run eval:discover`
  + `dead-code:report`; `src/features/{home,my-day,tasks}` trees are the next
  candidates once their registered table bindings are resolved.
