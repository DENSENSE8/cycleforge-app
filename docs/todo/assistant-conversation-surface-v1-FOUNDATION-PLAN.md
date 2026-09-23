# Assistant conversation surface V1 foundation plan

**Status:** ready for execution, 2026-09-18  
**Surface:** `/ai-chat`, desktop and mobile projections  
**Priority:** V1 foundation, highest ROI first  
**Production origin:** `http://localhost:3050` only

## Executive decision

Build one chronological conversation surface. Do not make either the desktop
station shell or the mobile shell the source of truth.

The source of truth is a tenant-scoped, persisted conversation contract:

```text
session
  -> ordered turns
      -> one execution run
          -> ordered progress/tool events
      -> zero or more validated attachments
```

Desktop and mobile render that contract differently, but neither owns a second
message model, artifact model, export implementation, or assistant runtime.

For `/ai-chat`, the V1 display is:

```text
global app spine
┌──────────────────────────────────────────────────────────────┐
│ Chat                 [Orders] [Shipping] [Inventory] [More] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ User message                                                 │
│                                                              │
│ Worked 6s · 3 steps ▾                                        │
│ Assistant answer                                             │
│ ┌ Inline table/report attachment ─────────────────────────┐  │
│ │ preview rows                                             │  │
│ │ [Download CSV] [Open full view]                          │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                      [copy icon] [retry icon] │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ sticky OmnichannelComposerDock                               │
└──────────────────────────────────────────────────────────────┘
```

The route-specific capability sidebar and the always-open right artifact pane
both go away. A large artifact may open a temporary inspector only after the
operator asks for it. The inline attachment remains in the timeline as the
durable record of what the assistant produced.

## Why this is the best V1

This design keeps the operator's question, the assistant's work, the answer,
and the exported result in one readable sequence. It also gives the codebase a
stable waist:

- the model may change without changing the transcript;
- the desktop station may supply context without owning a desktop-only flow;
- mobile may begin with identity and later acquire context without a second
  conversation system;
- tables, reports, timelines, records, and future file exports are attachments
  on a turn rather than bespoke pages;
- an export is a deterministic serialization of a validated attachment, not a
  second query whose result can disagree with the answer;
- company-specific vocabulary, routes, workflows, and procedures stay data.

## Product locks

These are V1 acceptance rules, not suggestions.

- [ ] `/ai-chat` has no route-specific persistent left context rail.
- [ ] The existing global application spine may remain.
- [ ] The composer stays visible at the bottom of the route while the
  transcript scrolls.
- [ ] Orders, Shipping, Inventory, Repairs, and future scopes are compact
  prompt actions at the top. They seed the composer and never auto-submit.
- [ ] `Worked Ns · M steps` remains the compact disclosure for completed runs.
- [ ] Copy and retry use house `IconButton` controls with accessible labels and
  tooltips. They appear on pointer hover or keyboard focus and remain usable on
  touch devices.
- [ ] Results and exports render on the assistant turn that produced them.
- [ ] Inline attachments show a bounded preview. Large data opens on demand,
  never as a permanently reserved pane.
- [ ] Mobile and desktop load the same session, turns, runs, events, and
  attachments.
- [ ] The local provider on GEX45 remains a supported primary provider. A UI
  refactor cannot silently turn the product into cloud-only chat.
- [ ] No AI-created artifact is rendered or exported before schema validation.
- [ ] All session reads, writes, deletes, exports, and artifact reads are
  explicitly organization-scoped.

## Codebase findings

### What already works and should be retained

| Capability | Existing implementation | Decision |
|---|---|---|
| Streaming transcript | `src/components/ai/useAiChat.ts` | Retain behavior while moving it behind a canonical controller |
| Local-first provider and failover | `src/app/api/ai/chat/stream/route.ts` | Retain and expose through the canonical event grammar |
| Tool-capable assistant | `src/app/api/assistant/chat/route.ts` and `src/lib/assistant/agent-loop.ts` | Retain capabilities; do not keep a second client transcript model |
| Completed-run disclosure | `src/components/ai/AgentStepTimeline.tsx` | Preserve as the compact run-event renderer |
| Structured answers | `AiStructuredAnswer` and `AiAnswerCard` | Adapt into validated turn attachments where appropriate |
| Current table extraction/export | `src/lib/assistant/chat-artifacts.ts` and `src/components/ai/AiChatArtifactPane.tsx` | Keep as a compatibility bridge, then move rendering inline |
| House composer | `OmnichannelComposerDock` | Use through an assistant-specific adapter; retire the hand-built textarea |
| House icon control | `IconButton` | Use for copy, retry, stop, new chat, and history |
| Session persistence | `ai_chat_sessions` and `ai_chat_messages` | Expand in place; do not create a parallel conversation database |
| Canonical entity identity | `src/lib/surfaces/canonical-ref.ts` | Use for optional session/turn subject context |
| Validated artifact registry in main worktree | `cycleforge-app/src/lib/assistant/ui-artifacts.ts` | Port the schema and safe renderer leaves, not the permanent side-pane placement |
| Company-agnostic help-session plan | `docs/todo/company-agnostic-assistance-session-HARD-CHECKLIST.md` | Keep as a downstream consumer of this conversation foundation |

### Current duplication that must converge

There are two client and route stacks today:

| Stack | Strength | Gap |
|---|---|---|
| `useAiChat` -> `/api/ai/chat/stream` | steps, retry, edit, stop, structured local ops, Bose RAG, local-first failover | no tools, no durable artifacts/runs, no visible session history |
| `useAssistantChat` -> `/api/assistant/chat` | server tools, UI tools, page context, Anthropic agent loop | separate message type, no durable run display, no retry/edit/history, Hermes fallback is less capable |

Do not merge their React components. Define one transport-neutral contract,
teach both routes to emit it temporarily, move all consumers onto one client
controller, then retire the duplicate route and hook.

### P0 tenancy defects discovered during the audit

These must be fixed before exposing session history.

- `GET /api/ai/chat-sessions` lists from the global Drizzle client without an
  explicit `organization_id` predicate.
- `DELETE /api/ai/chat-sessions?id=...` deletes by session ID without an
  explicit organization predicate.
- `src/lib/ai/chat-persistence.ts` looks up and updates sessions by session ID
  alone and uses the global client. It must use the same tenant-query seam as
  `src/lib/assistant/chat-persistence.ts`.
- The message-history route is already explicit and tenant-scoped. It is the
  pattern to preserve.

The fact that session IDs are difficult to guess is not isolation. Tests must
prove that a valid user from organization B cannot list, load, mutate, delete,
or export organization A's conversation, even when given exact IDs.

## Canonical V1 domain contract

The contract below is the waist between database, stream, and UI. Names may be
adjusted to repository conventions, but the separation must remain.

```ts
type AssistantSession = {
  id: string;
  organizationId: string;
  title: string | null;
  subjectRef: string | null;
  contextSnapshot: AssistantContextSnapshot | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

type AssistantTurn = {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'pending' | 'complete' | 'stopped' | 'error';
  replyToTurnId: number | null;
  createdAt: string;
};

type AssistantRun = {
  id: string;
  assistantTurnId: number;
  status: 'running' | 'complete' | 'stopped' | 'error';
  mode: string | null;
  provider: string | null;
  model: string | null;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
};

type AssistantRunEvent = {
  id: number;
  runId: string;
  sequence: number;
  kind: 'step' | 'tool_start' | 'tool_end' | 'notice';
  label: string;
  toolKey: string | null;
  status: 'running' | 'complete' | 'error' | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AssistantAttachment = {
  id: string;
  assistantTurnId: number;
  runId: string | null;
  sequence: number;
  kind: SessionArtifactKind;
  schemaVersion: number;
  title: string;
  payload: SessionArtifact;
  sourceTool: string | null;
  createdAt: string;
};
```

### Identity and station agnosticism

`subjectRef` uses the existing canonical-ref grammar. A session may be about an
order, serial unit, repair, workflow instance, shipment, SKU, or another
registered entity without adding a column for every company workflow.

`contextSnapshot` records the context supplied to the run, such as route,
station, workflow node, selection, procedure version, and client form factor.
It is evidence, not identity. The canonical subject remains `subjectRef`.

The desktop station can create a session with a preselected subject and
station. Mobile can create the same shape with only user identity and add a
subject later. Both use the same commands and records.

## Database expansion

Keep `ai_chat_sessions` and `ai_chat_messages`. Add only the relations required
to preserve execution and artifacts.

### Expand migration

- [ ] Add `subject_ref`, `context_snapshot`, and `created_by` to
  `ai_chat_sessions` if repository tenancy review approves session-level
  context.
- [ ] Add stable turn status and reply lineage to `ai_chat_messages`.
- [ ] Add `ai_chat_runs`, tenant stamped and linked to one assistant turn.
- [ ] Add `ai_chat_run_events`, tenant stamped, ordered uniquely by
  `(organization_id, run_id, sequence)`.
- [ ] Add `ai_chat_artifacts`, tenant stamped, linked to one assistant turn and
  optionally its run, ordered uniquely per turn.
- [ ] Add check constraints for roles, statuses, event kinds, positive schema
  versions, and non-negative sequence values.
- [ ] Add indexes for organization/session recency, turn ordering, run lookup,
  and artifact ordering.
- [ ] Add composite tenant-preserving foreign keys where adjacent schema law
  requires them.
- [ ] Enable and force RLS through the repository's normal tenant migration
  path.
- [ ] Add Drizzle mappings and inferred types in `src/lib/drizzle/schema.ts`.

Do not create an `exports` table in V1. CSV is a deterministic serialization of
an artifact payload. If future compliance requires export audit, record an
append-only audit or ops event rather than storing another copy of the file.

### Compatibility and backfill

- Existing messages remain readable with `status = complete` inferred when the
  new column is null during the expand window.
- Existing `analysis` JSON remains a supported compatibility attachment until
  it is migrated or naturally aged out.
- Existing assistant markdown tables are parsed by `chat-artifacts.ts` only as
  a fallback. New tool-produced tables arrive as validated artifacts.
- No historical prose is rewritten by a migration.
- Contract migration occurs only after every reader uses the new shape.

### Migration proof

For every new SQL migration:

```bash
pnpm db:migrate:dry
pnpm db:migrate -- --only <exact-migration-file.sql>
pnpm db:migrate:dry
```

The first dry run must name the expected file. The apply must use `--only` in
the dirty multi-lane worktree. The final dry run must report that exact file as
applied. Never apply every pending lane migration as a side effect of this
work.

## One stream event grammar

The canonical client controller accepts these SSE events:

| Event | Required payload | UI effect |
|---|---|---|
| `session` | session ID and optional title | binds URL and history |
| `turn` | stable user/assistant turn IDs | reconciles optimistic messages |
| `run` | run ID, provider/mode, start state | starts progress disclosure |
| `step` | run ID, sequence, label | appends ordered visible work step |
| `tool_start` | run ID, sequence, registered tool key | appends safe tool activity |
| `tool_end` | matching tool event and status | closes activity |
| `delta` | assistant turn ID and text | appends prose |
| `attachment` | assistant turn ID and validated artifact envelope | appends inline artifact |
| `error` | run ID, code, safe message | ends run visibly |
| `done` | run ID, final status and timestamps | collapses to `Worked Ns · M steps` |

Rules:

- Streamed payloads and reloaded REST payloads hydrate the same client types.
- Every event after `run` includes the run ID.
- Ordered events carry a server sequence number; client arrival time is not
  used as durable ordering.
- UI tool events are validated commands, not arbitrary callbacks or HTML.
- Provider names and chain details may be recorded for diagnostics but are not
  promoted into noisy transcript chrome.
- The server persists final turn/run state synchronously enough that refresh
  after `done` cannot lose the completed answer.

## Inline attachment contract

Port the validated artifact union from the main worktree, including its URL
scheme checks, route checks, size limits, sanitization, and discriminated
`kind`. Reuse renderer leaves where they meet the current design system.

Do not port the main worktree's permanent right-panel placement.

### V1 attachment kinds

- `table`
- `report`
- `timeline`
- `record`
- `chart`
- `document`
- ticket-related kinds already covered by the registry

### Inline presentation rules

- Show attachment title, source/provenance where useful, and a bounded preview.
- A table preview shows at most the first 10 rows inline and scrolls
  horizontally on narrow screens.
- `Download CSV` serializes the full validated table payload, not visible DOM
  text and not a new API query.
- `Open full view` is available only when the preview is insufficient. It opens
  a modal, sheet, or transient inspector that can be dismissed without losing
  transcript position.
- Attachments remain visible after refresh and session resume.
- Invalid or unsupported attachments render a safe one-line error and are not
  exported.
- Markdown table extraction is a compatibility adapter. It must not become the
  long-term artifact protocol.

## UI component boundary

Target ownership after V1:

```text
AiChatWorkspace
  AssistantHeader
    AssistantSessionTrigger
    AssistantPromptActions
  AssistantTranscript
    AssistantTurnView
      AgentStepTimeline
      AssistantProse
      InlineAttachmentList
        ArtifactRenderer
      AssistantTurnActions
  AssistantComposer
    OmnichannelComposerDock
```

The route component owns geometry only. The controller owns state and commands.
The turn renderer owns message anatomy. Artifact renderers receive validated
data only. Export serializers live outside React and have direct unit tests.

### Header behavior

- New chat is an icon action with a tooltip and accessible label.
- History opens as a popover on desktop and a sheet on mobile. It is not a
  permanent rail.
- The session ID is reflected in the URL as `?session=<id>` so refresh and
  back/forward are predictable.
- Prompt actions seed text such as `Show open orders` or `Show shipments due
  today`. They do not encode route-specific backend behavior.
- At mobile widths, prompt actions scroll horizontally with no wrapping into a
  tall toolbar.

### Turn actions

- Copy and retry use icon-only controls.
- Tooltips are supplementary; accessible names are mandatory.
- Keyboard focus reveals the same action row as pointer hover.
- Touch layouts keep the actions available without depending on hover.
- Retry is available only for the last retryable assistant turn in V1.
- Retry creates a new run linked to the same user turn. It does not destructively
  overwrite audit history in the database.

### Composer

- Replace the local textarea/send shell with an assistant adapter around
  `OmnichannelComposerDock`.
- Enter sends, Shift+Enter inserts a newline, Escape stops an active run.
- Editing a previous message creates a branch or truncation command with an
  explicit server contract. Client-only truncation is not durable enough for
  resumed history.
- A scanner wedge must not accidentally submit the chat composer on station
  hosts.

## Execution increments

Each increment is independently testable and may ship behind the existing
route. Do not start the next increment while its exit gate is red.

### Increment 0: secure the existing session seam

**Change**

- Replace global Drizzle access in session list/delete and
  `src/lib/ai/chat-persistence.ts` with tenant-scoped query helpers.
- Require the authenticated organization on every predicate.
- Align route permission policy. `/ai-chat` should not read with
  `dashboard.view` while the tool-capable route writes with `assistant.chat`
  unless that is an explicit product decision recorded in the permission map.
- Add session ID ownership checks for load, retry, delete, and future export.

**Proof**

- [ ] Cross-tenant list returns only the caller's sessions.
- [ ] Cross-tenant exact-ID load returns 404 or the house non-disclosure
  response.
- [ ] Cross-tenant exact-ID delete changes zero rows.
- [ ] A colliding or supplied session ID cannot update another tenant's title
  or timestamp.
- [ ] Tenancy guard and route-permission audit pass.

### Increment 1: ship the railless single-thread shell

**Change**

- Remove `ai-chat` from `CONTEXT_PANEL_ROUTE_KEYS` and delete the corresponding
  `SidebarContextPanel` branch/import.
- Replace the split `AiChatWorkspace` with one centered transcript column.
- Move capability starters into `AssistantPromptActions` at the top.
- Move the current artifact preview inline on the producing assistant turn.
- Replace text Copy/Retry buttons with `IconButton` controls.
- Replace the hand-built composer with the house composer adapter.
- Preserve `AgentStepTimeline` and `Worked Ns · M steps` behavior.

**Proof**

- [ ] Desktop 1440x900 has no contextual left rail or persistent artifact pane.
- [ ] Mobile 390x844 shows the same turn order and inline result.
- [ ] Composer remains visible after enough turns to scroll.
- [ ] Keyboard focus can reach prompt actions, progress disclosure, artifact
  actions, copy, retry, and composer in a coherent order.
- [ ] Existing live GEX45 answer still streams to completion.
- [ ] Existing CSV bytes still match the displayed validated rows.

### Increment 2: persist runs, steps, and attachments

**Change**

- Apply the expand migration.
- Persist a run row and ordered events for every assistant attempt.
- Persist validated artifacts and link them to the producing assistant turn.
- Hydrate session history into the exact same turn view used for a live stream.
- Add the header history trigger and `?session=` URL state.

**Proof**

- [ ] Refresh during a completed conversation reproduces prose, step summary,
  attachments, and available exports.
- [ ] Stop and error states survive refresh honestly.
- [ ] Retrying produces a second run with its own timing and event trail.
- [ ] Back/forward moves between sessions without losing the active draft.
- [ ] Cross-tenant tests cover every new table.

### Increment 3: unify the client and event protocol

**Change**

- Introduce one `useAssistantConversation` controller with a transport adapter.
- Teach both current routes to emit the canonical event grammar during the
  transition.
- Move retry, stop, edit/branch, session loading, tools, page context, local
  ops, RAG, and provider failover behind the controller.
- Select one canonical server route after parity tests. Prefer extending
  `/api/assistant/chat` because it already owns tools and context, but only
  after it demonstrates local-first GEX45 parity with `/api/ai/chat/stream`.
- Remove the retired hook and route only after no production consumer imports
  them.

**Proof**

- [ ] One TypeScript message/turn type is imported by all assistant surfaces.
- [ ] One SSE parser has contract fixtures for every event kind.
- [ ] Local ops, Bose RAG, local model, cloud failover, read tools, and UI tools
  pass through the same controller.
- [ ] No answer is duplicated when a tool-capable route falls back to Hermes.
- [ ] Code graph shows no live consumer of the retired hook/route.

### Increment 4: mobile and station projection

**Change**

- Add the mobile route or mobile host projection using the shared controller
  and turn renderers.
- Allow a station to seed canonical context without forking the conversation
  model.
- Render history in a mobile sheet and large attachments in a full-height
  mobile sheet.
- Link assistance-session messages and operational subjects through canonical
  references rather than copying rows between chat tables.

**Proof**

- [ ] A session begun on a desktop scan station opens on a phone with the same
  subject, messages, steps, and artifacts.
- [ ] A session begun on mobile with identity only may attach a subject later.
- [ ] Device switching never changes session ownership or provider behavior.
- [ ] No desktop-only operator verb is introduced.

### Increment 5: contract and delete transitional code

**Change**

- Stop generating new parser-only artifacts after tool/artifact parity exists.
- Backfill only metadata needed for safe reads; do not rewrite old prose.
- Remove the permanent `AiChatArtifactPane`, duplicate hook, duplicate SSE
  parser, unused sidebar, and compatibility adapters whose usage is zero.
- Add a rule module, tripwire test, CLI guard, and design-MCP face if this
  conversation contract becomes a new repository law.

**Proof**

- [ ] `rg` and code graph show one controller, one turn contract, one artifact
  registry, and one export serializer per format.
- [ ] No hidden permanent pane or route-specific chat rail remains.
- [ ] Full eval and production browser suite pass after deletion.

## Verification harness

### Unit and contract tests

- Tenant predicates for session list/load/delete/write.
- SSE parser fragmentation, multi-line data, unknown events, reordered events,
  disconnects, and duplicate event delivery.
- Run state transitions and retry lineage.
- Artifact schema valid/invalid boundaries, invisible control stripping, URL
  restrictions, row/column caps, and schema versions.
- CSV escaping for commas, quotes, newlines, nulls, formulas, Unicode, and
  stable column order. Spreadsheet-formula injection must be neutralized or
  explicitly rejected by the export contract.
- Markdown-table fallback parsing, including malformed and oversized tables.
- Session URL state and history hydration.
- Icon action accessible names and keyboard visibility.

### API and database tests

- Organization A and B use the same known session ID attempts.
- Exact-ID cross-tenant load/delete/export attempts.
- Duplicate client event or retry ID is idempotent.
- Refresh immediately after `done` sees the persisted completion.
- Failed provider, stopped stream, malformed tool artifact, and disconnect
  leave one honest terminal run state.
- RLS and explicit predicates cover sessions, messages, runs, events, and
  artifacts.

### Native browser matrix through `:3050`

Run against the QA organization and use native browser automation for the
visible flows.

| View | Required scenario |
|---|---|
| Desktop 1440x900 | railless shell, top actions, long transcript, sticky composer, inline table, CSV download, history resume |
| Laptop 1280x720 | composer and latest answer remain usable without permanent side panes |
| Mobile 390x844 | horizontally scrollable actions, readable turns, inline preview, full-view sheet, touch actions |
| Keyboard only | seed prompt, send, disclose steps, copy, retry, download, open history, resume |
| Reduced motion | no required information depends on animation |
| Live GEX45 | real local-model stream, no mocked completion, final tail preserved |
| Provider failure | safe in-thread error and retry, no hanging streaming state |

Record for each run:

- exact URL and QA organization;
- session ID and assistant run ID;
- screenshot or trace at desktop and mobile width;
- downloaded filename, byte size, header, and representative row;
- response `x-switch-target`, `x-switch-lane`, and cookie scope from `:3050`;
- test command and exit code.

### Performance gate

Lighthouse is measured with the repository's isolated production-build harness,
then the route is smoke-tested again through `http://localhost:3050`.

Targets for desktop and mobile:

- Performance: 95 or higher on the agreed authenticated test fixture.
- Accessibility: 95 or higher.
- Best Practices: 95 or higher.
- No route-level load of sidebar capability cards or full artifact renderer
  families that are not present in the current session.
- No duplicate chat runtime, composer, or table engine in the initial route
  chunk.
- Streaming first feedback appears before the model's first prose token through
  the persisted `run` or `step` event.

The score is evidence, not the architecture. Do not remove accessibility,
history, validation, or tenant checks to make the number green.

### Repository gates before each merge

```bash
node tools/design-mcp/ds.mjs contract "<increment job>"
node tools/design-mcp/ds.mjs critique <each changed UI file>
npx tsx scripts/mobile-first-guard.ts
pnpm verify:fast
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

For the cross-cutting runtime consolidation and transitional-code deletion, use
the full eval instead of the fast eval.

## Marketable V1 acceptance checklist

A V1 claim is allowed only when one uninterrupted QA demonstration proves all
of the following:

- [ ] An authenticated operator opens `/ai-chat` and sees one calm conversation
  surface, not three competing columns.
- [ ] The operator selects Orders at the top, edits the seeded prompt, and
  sends from the sticky composer.
- [ ] The local GEX45 model or deterministic local-ops path emits visible work
  steps, followed by a complete answer.
- [ ] The collapsed run label reports elapsed time and step count.
- [ ] A table appears inline on the answer that produced it.
- [ ] Download CSV creates a correct file from the same validated payload.
- [ ] Copy and retry are compact icon controls and fully keyboard accessible.
- [ ] Refresh restores the conversation, run summary, and attachment.
- [ ] History resumes the same session from its URL.
- [ ] The same session renders on mobile without a desktop-only control.
- [ ] A second organization cannot discover or access the session with exact
  identifiers.
- [ ] All migrations for this increment are recorded and the scoped migration
  dry run reports no missing assistant migration.
- [ ] Desktop and mobile Lighthouse targets are met in the production harness.
- [ ] `pnpm verify:fast` and the required eval finish green.

## Explicit non-goals for this V1

- A general no-code workflow builder inside the chat transcript.
- Autonomous publication of procedures or workflows.
- Automatic repair advice without approved evidence and citations.
- A second message store for human assistance sessions.
- A permanent analytics dashboard disguised as a chat attachment.
- Hard-coded company, warehouse, station, order, or repair branches in the
  conversation schema.
- Replacing the existing global application spine.
- Deleting either server route before protocol and provider parity is proven.

## Relationship to existing plans

- `docs/todo/tauri-native-operator-assistant-V1-HARD-CHECKLIST.md` defines how
  this conversation contract is transported, rendered, secured, packaged, and
  verified when the signed Tauri application is the primary operator product.
- This document supersedes
  `docs/todo/ai-chat-odysseus-display-HANDOFF.md` for `/ai-chat` layout and
  foundation decisions.
- `docs/todo/company-agnostic-assistance-session-HARD-CHECKLIST.md` remains the
  source for human help requests, participants, joins, messages, and the
  operational timeline. It consumes this shared conversation/attachment
  foundation where appropriate but keeps human thread messages in the existing
  entity-thread system.
- The artifact registry in the main worktree is a contract and renderer source,
  not authority for a permanent split-pane layout.

## First executable slice

The first production change should combine Increment 0 and the smallest safe
part of Increment 1:

1. fix tenant scoping and prove cross-organization denial;
2. remove the `/ai-chat` context rail through the route registry;
3. collapse `AiChatWorkspace` to one transcript column;
4. render the already-supported table/export inline on its assistant turn;
5. replace Copy/Retry with icon controls;
6. adapt the house composer;
7. run focused tests, `verify:fast`, native desktop/mobile QA browser tests,
   live GEX45 streaming, CSV byte verification, and the production Lighthouse
   harness.

That slice is visibly better, removes code, closes a security gap, preserves
the working model path, and creates the exact UI seam needed for durable runs
and artifacts in the next migration.
