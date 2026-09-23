# Company-agnostic operational assistance sessions — hard checklist

> Status: execution checklist. The product pieces exist; this document defines
> the thinnest connective seam and the proof required before the capability is
> marketable. A checked box needs the named artifact plus passing evidence. A UI
> impression, a mocked-only happy path, or a prose claim is not completion.

## Marketable promise

From any mobile task or desktop station, an operator can type `@Name` or press
**Need help**. The named person receives the request, joins the same operational
session with a recorded reason and timestamp, and collaborates in a familiar
message timeline. Messages, joins, workflow transitions, diagnostic results,
decisions, repairs, and the final outcome remain attached to the work and are
searchable later as one operational history.

The capability is:

- **company agnostic** — tenant vocabulary, purposes, procedures, workflows,
  staff, and integrations are data;
- **station agnostic** — mobile may begin with identity only, while a desktop
  station supplies preselected context; both join the same session;
- **workflow native** — the active published workflow node explains why help
  was requested and what may happen next;
- **auditable** — joining, leaving, messaging, approving, repairing, testing,
  and closing are durable facts with server timestamps;
- **grounded** — AI guidance cites an approved procedure, imported diagnostic
  result, or reviewed prior repair. Missing evidence is stated, never invented.

## Existing pieces to connect, not replace

| Existing asset | Reuse |
|---|---|
| `work_sessions` + `work_session_intervals` | Session lifecycle, ownership, elapsed work, optimistic concurrency |
| `work_session_purposes` | Tenant-defined reason bucket; `staff-assist` is already seeded and custom purposes require no deploy |
| `entity_threads` + `thread_messages` | Entity-anchored conversation, optimistic/idempotent posting, edit/delete, provider-neutral messages |
| `ThreadPanel` + `ThreadNoteComposer` | Familiar message presentation and composer |
| `thread_assignments` + staff picker | Named human ownership using the established staff identity UI |
| `staff_inbox_items` | Immediate, explainable delivery (`assigned` / `mentioned`) and existing inbox triage |
| realtime DB events | Open-session refresh without making delivery correctness depend on realtime availability |
| `ops_events` | Append-only operational facts and workflow-node attribution |
| Master Operations Journey + `threadMessagesToTimeline` | Cross-station searchable timeline; no second timeline component |
| workflow definitions/nodes/edges | Tenant-owned procedural source of truth |
| workflow diagnostics + draft mutations | AI-editable drafts with publish-blocking validation and human publication |
| AI chat sessions/messages | Conversational authoring and retained assistant context |
| identification grammar authoring | Existing precedent for brief -> validated draft -> human publish |

## One narrow missing persistence seam

`work_sessions.staff_id` identifies one current owner and intervals identify who
worked each active stretch. Neither represents simultaneous collaboration or
answers “Taylor joined Jordan's repair session to review a power failure at
14:07.” Do not overload intervals or infer participation from messages.

- [ ] Add a tenant-scoped session-participation relation or equivalent durable
  event model with: session, staff, role, reason, requested-by, joined-at,
  left-at, and idempotency key.
- [ ] Permit multiple simultaneous participants and only one open membership
  per `(organization, session, staff)`.
- [ ] Bind the session to its canonical work subject and active workflow node
  using the platform's polymorphic identity contract; do not add repair-only or
  station-only columns.
- [ ] Bind or resolve one entity thread for the session's work subject. Keep
  messages in `thread_messages`; do not birth a second chat table.
- [ ] Emit append-only session events (`HELP_REQUESTED`, `PARTICIPANT_JOINED`,
  `PARTICIPANT_LEFT`, `HELP_RESOLVED`) with server time and actor.
- [ ] Add expand/contract migrations, Drizzle mappings, RLS/tenant coverage,
  idempotency indexes, and rollback/verification notes.

### Persistence exit gate

- Two supervisors can join concurrently without replacing the operator.
- Retrying the same join produces one membership and one join event.
- A staff member in another organization cannot read, join, or infer the
  session, even with valid IDs.
- Deleting or archiving a staff member preserves historical attribution without
  leaving an active ghost participant.
- `pnpm db:migrate:dry` reports zero pending after application.

## Increment 1 — assistance domain waist

- [ ] Implement one domain command for `requestHelp`; all mobile, desktop, AI,
  and workflow callers use it.
- [ ] Input is subject + session/workflow context + requested staff/role +
  reason + urgency + client event ID. Organization and actor come only from the
  authenticated context.
- [ ] Reuse the existing entity thread or create it through
  `getOrCreateThread`; post the initial request as an internal message.
- [ ] Deliver explicit recipients directly to the inbox with reason
  `mentioned` or `assigned`; do not wait for a subscription resolver.
- [ ] Implement `joinAssistanceSession`, `leaveAssistanceSession`, and
  `resolveAssistanceSession` as idempotent domain commands.
- [ ] Insert system messages for join/leave/resolve through the thread writer so
  chat and timeline cannot disagree.
- [ ] Record audit and ops events in the same transaction/outbox boundary used
  by adjacent writers.

### Domain exit gate

- Duplicate request, message, join, leave, and resolve calls are no-ops with the
  original result returned.
- Two simultaneous resolvers cannot produce two terminal outcomes.
- Ably/realtime failure does not lose the request, membership, message, inbox
  item, or audit fact.
- An absent AI provider does not block human assistance.
- A missing helpdesk connection does not block the internal thread.

## Increment 2 — familiar conversation UX

- [ ] Extend the existing composer with `@` staff resolution; reuse the
  established staff combobox/avatar primitives and never invent a second staff
  search.
- [ ] Add a large **Need help** action to the generic workflow-task renderer,
  not individually to Repair, Test, Pack, or Unbox.
- [ ] Populate the request from current identity, entity, workflow node,
  procedure step, station/device context, and diagnostic summary.
- [ ] Render system messages in the same chronological conversation:
  “Taylor requested help,” “Alex joined to review power failure,” “Alex left,”
  and “Help resolved.”
- [ ] On the invited staff member's phone, expose **Acknowledge**, **Join**,
  **Open work**, and **Decline** without navigating through a manager desk.
- [ ] Make keyboard, touch, camera, and wedge input coexist; an armed scanner
  must not submit the chat composer and Enter in the composer must not trigger a
  station scan.

### UX exit gate

- The same request started with `@Alex` and with **Need help** produces the same
  domain record shape.
- Mobile and desktop show the same participants, reason, messages, and status.
- Refresh, reconnect, back/forward, and switching devices preserve the session.
- Optimistic messages reconcile once; a flaky-network retry never paints a
  duplicate bubble.
- Screen reader output identifies author, timestamp, message, join reason, and
  available actions.

## Increment 3 — workflow and procedure grounding

- [ ] A workflow node may declare help policy as data: eligible roles/staff,
  urgency rules, required evidence, timeout/escalation, and allowed outcomes.
- [ ] A request records the exact workflow-definition version, node instance,
  and procedure version active when it was raised.
- [ ] Import procedures into versioned drafts; preserve source document,
  section/page anchors, model applicability, safety gates, checks, outputs, and
  required evidence.
- [ ] Ingest external diagnostic output as immutable raw evidence plus a
  normalized finding. Never replace the raw payload with the model's summary.
- [ ] AI answers from the active procedure, diagnostic evidence, parts catalog,
  and reviewed repair history. Every recommended action carries sources,
  confidence, conflicts, and missing checks.
- [ ] `QC pass -> Prepack` is a tenant-owned graph edge/output, not a hard-coded
  application branch.
- [ ] Novel issues create repair cases and knowledge candidates. They never
  modify a published procedure automatically.

### Grounding exit gate

- With no approved source, the assistant says it lacks a verified procedure and
  requests escalation; it does not manufacture repair instructions.
- Changing the tenant workflow reroutes the same test output without a code
  deployment.
- Replaying a historical session continues to cite the procedure version that
  was active then, not today's edited version.
- A proposed knowledge update lists its supporting cases, outcomes, author, and
  reviewer before publication.

## Increment 4 — one operational timeline and search

- [ ] Extend the existing journey read model with session lifecycle events and
  participant joins; keep `EventTimeline` as the renderer.
- [ ] Include thread messages through the existing timeline adapter rather than
  duplicating message rows into another read model.
- [ ] Search resolves session title, purpose, participant, join reason, message
  text, serial, SKU, order, repair, workflow node, procedure, and date range.
- [ ] Desktop hierarchy supports Company -> workflow -> node/station -> session
  -> participant/message/event without changing the underlying event order.
- [ ] Mobile history shows the same events in a compact chronological view.
- [ ] Respect message visibility and permissions in search results, snippets,
  exports, AI retrieval, and timeline hydration.

### Timeline exit gate

Given one assistance session, a search for the serial, supervisor, symptom,
session purpose, or repair action reaches the same canonical timeline and shows:

1. help requested;
2. recipient notified;
3. participant joined, including reason and server timestamp;
4. messages and diagnostic evidence in chronological order;
5. decision/approval;
6. repair and retest;
7. QC outcome and workflow transition;
8. participant departure and session wrap-up.

## Increment 5 — AI flow authoring harness

- [ ] Add a high-level compiler tool that accepts a conversation/SOP and emits
  a complete template package, instead of requiring the model to issue dozens
  of uncoordinated single-node mutations.
- [ ] The compiler introspects available node capabilities, schemas,
  integrations, identification methods, station blocks, and mobile interaction
  primitives before proposing a graph.
- [ ] Validate package shape, tenant-neutral keys, node config, inputs/outputs,
  permissions, lineage, mobile completeness, station compatibility,
  integrations, and diagnostics before persistence.
- [ ] Install only as a reversible draft. AI cannot publish.
- [ ] Simulate representative subjects through every edge before a human can
  publish; record the trace and expected terminal state.
- [ ] When a required capability is absent, create a build request rather than
  inventing an endpoint, SQL statement, or successful result.

### Compiler exit gate

The same natural-language procedure compiles for two organizations with
different staff names, vocabulary, integrations, stations, and approval rules.
The exported package contains no organization IDs, staff IDs, secrets, route
assumptions, or company names. Installation resolves logical references locally.

## Extreme company-agnostic and station-agnostic test matrix

Every row is required in automated tests or a recorded QA-browser scenario.

| Axis | Required adversarial cases | Pass condition |
|---|---|---|
| Company vocabulary | “Technician” renamed “Evaluator”; “Prepack” renamed “Ready shelf” | No code/config key depends on display labels |
| Workflow | pass->prepack, pass->manager review, pass->external ERP approval | Published graph alone determines the next node |
| Subject | serial unit, carton, order, repair, anonymous/unidentified scan | No serial-only assumption in session/help commands |
| Context | mobile identity-first, desktop repair station, desktop QC station, context moved mid-session | One canonical session and thread survive every presentation |
| Staff | direct person mention, role mention, two supervisors, invited user offline, staff disabled mid-session | Deterministic recipients and preserved audit history |
| Concurrency | double tap, two devices, delayed retry, simultaneous join/resolve, reordered realtime events | One durable outcome; clients reconcile from DB truth |
| Network | offline compose, dropped response after commit, Ably unavailable, slow database | Retry-safe writes; eventual UI convergence |
| AI | provider unavailable, malformed output, unsupported recommendation, conflicting sources | Human workflow continues; unsafe output is rejected |
| Integration | diagnostic provider absent/stale, parts system unavailable, helpdesk disconnected | Visible degraded state; internal session remains usable |
| Permissions | unauthorized participant, hidden message, cross-org IDs, revoked role | Fail closed without leaking existence or content |
| Knowledge | first occurrence, repeated failed fix, repeated successful fix, superseded procedure | Case captured; publication always human-reviewed/versioned |
| Lifecycle | join/leave/rejoin, park/resume, reassignment, session close with participant online | Exact intervals, memberships, messages, and terminal state |

## Performance and reliability release bars

- [ ] Help request durable commit: local production p95 <= 500 ms excluding
  third-party notification delivery.
- [ ] Message durable commit: p95 <= 350 ms; optimistic paint <= 100 ms.
- [ ] Inbox/realtime indication after commit: p95 <= 1 second on a healthy
  connection; DB refresh recovers when realtime is down.
- [ ] Opening an existing 500-message session uses cursor pagination and does
  not fetch the full operational journey before first paint.
- [ ] Mobile and desktop critical routes meet Lighthouse Performance,
  Accessibility, and Best Practices >= 95, LCP <= 2.5 s, TBT <= 200 ms, and
  CLS <= 0.1 on the controlled production-build harness.
- [ ] Request-shape gates report zero duplicate requests, zero wasteful count
  probes, and zero immediate focus-refetch requests.
- [ ] 100 concurrent help requests across multiple organizations produce no
  cross-tenant rows, duplicate memberships, duplicate messages, or lost inbox
  deliveries.

## Required test layers

- [ ] Pure tests: mention parsing, recipient resolution, state machine,
  idempotency keys, permission decisions, event-to-timeline mapping, workflow
  policy evaluation, compiler validation.
- [ ] Transaction tests: request+thread+message+membership+event atomicity,
  concurrent join/resolve, RLS, rollback, retry after unknown commit result.
- [ ] Contract tests: mobile and desktop adapters submit the same domain command
  and consume the same DTO.
- [ ] Property/fuzz tests: arbitrary tenant labels, slugs, Unicode staff names,
  workflow sizes, reordered events, duplicate client event IDs, invalid graphs.
- [ ] Integration tests: notification outbox/direct inbox, realtime refetch,
  workflow transition, diagnostic ingestion, search indexing.
- [ ] Playwright at `http://localhost:3050`: two authenticated staff contexts,
  one mobile and one desktop, exercising the complete assistance lifecycle in
  the QA organization.
- [ ] Production-build performance: isolated `NEXT_DIST_DIR` for measurement;
  final functional verification through `http://localhost:3050` only.

## Marketable proof scenario

Record this exact scenario from the QA organization with no request mocking:

1. An operator identifies an arbitrary refurbished item on mobile.
2. The published workflow opens its QC task and displays the imported procedure.
3. The operator enters “red power LED; no startup” and types `@Supervisor`, or
   presses **Need help** and chooses the same person.
4. The supervisor's phone receives the reason and opens the same work.
5. The supervisor joins; both screens immediately show who joined, why, and
   when.
6. A diagnostic result is attached. The assistant distinguishes evidence,
   hypothesis, missing checks, and sourced next action.
7. Staff exchange messages, record a decision, perform/reject the proposed
   action, and retest.
8. A passing QC output follows the tenant graph to its tenant-named prepack
   step. A failure follows the configured exception edge.
9. The session closes with a wrap-up. Desktop search finds one timeline by
   serial, symptom, participant, and session purpose.
10. If the issue was novel, the system proposes—but does not publish—a
    reusable knowledge/procedure update with the case as evidence.

## Final release gate

No item is complete until all of the following pass from the production
worktree:

```bash
pnpm db:migrate:dry
pnpm test:stations
pnpm test:perf
npx tsx scripts/mobile-first-guard.ts
pnpm verify:fast
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --full
```

Then run the dedicated two-user Playwright assistance spec through `:3050`, the
critical-route request-shape ratchet, and median Lighthouse audits. Preserve the
QA session IDs, event IDs, screenshots, trace, performance summary, and database
assertions as the release evidence bundle.

