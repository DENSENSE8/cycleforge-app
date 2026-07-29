# Gemini deep-scan briefing — Cycle Forge Home: all-in-one triage + to-do surface with per-staff event subscriptions

> **Paste this whole file to Gemini (deep research / long-context mode) with the repo attached or mounted.**
> Deliverable is a **research + design report + phased build plan**, not code.
> Grounded scan of `/Users/icecube/repos/cycleforge-app` (branch `main`) already done by Claude on
> 2026-07-28; §2 is verified fact, not speculation. **Verify every claim in §2 yourself before
> designing on top of it** — if a claim is wrong, say so explicitly in your report.

---

## 0. Your task in one paragraph

Cycle Forge is a **multi-tenant, reseller-operations SaaS** (used-goods reseller: receive → unbox →
triage → test → repair → list → pack → ship → returns/warranty). Today it has ~40 operator surfaces
and **no real home page** — `/` is a thin, half-built "My Day" shell. I want you to design a
**2026 best-in-class, production-grade Home**: a single all-in-one entry surface that is
simultaneously (a) a **personal triage inbox**, (b) an **org-wide to-do / work board**, and
(c) a **subscription feed** where each staff member subscribes to precisely the event streams they
care about — including **many-to-one** (many staff watch one entity/SKU) and **one-to-many**
(one staff watches a whole class of entities via a rule) relationships. Example subscriptions a
staffer must be able to create: *"notify me on every unbox update for SKU `LEN-T480-i5`"*,
*"notify me when any carton is marked delivered but has not been received within 24h"*,
*"notify me when any unit I tested comes back as a return"*, *"notify me when order #X ships."*
Produce an **industry-standard comparison**, a **concrete information architecture with tabs**,
a **subscription data model + delivery pipeline design**, and a **phased execution plan** that
composes this codebase's existing source-of-truth modules rather than forking new ones.

---

## 1. Non-negotiable house rules you must design within

Read these files **first** — they are the constitution and they override any generic best practice
you would otherwise recommend:

| File | What it governs |
|---|---|
| `AGENTS.md` | Hard rules, SoT invariant table, "compose → grow the SoT → compound", Ask-first / Never lists |
| `CLAUDE.md` | Which deep rules load on demand |
| `.claude/rules/contextual-display.md` | **Region contracts**: Station / Workbench / Monitor / Canvas + `pickArchetype()` |
| `.claude/rules/display/workbench.md` | Workbench recipe (select → edit → persist; URL-as-state; degrade-not-fail) |
| `.claude/rules/display/monitor-and-canvas.md` + `display/monitor-rollup-blocks.md` | Monitor observe contract + rollup block registry |
| `.claude/rules/display/reference-timeline.md` | `EventTimeline` / `TimelineSection` — the ONLY timeline primitive |
| `.claude/rules/ui-design-system.md` | Kinetic Ledger identity, density modes, one-row anatomy, chips, tokens |
| `.claude/rules/source-of-truth.md` | Full SoT table (dates, conditions, z-index, spacing, focus ring, surfaces, search) |
| `.claude/rules/backend-patterns.md` | Route skeleton (`withAuth` → validate → domain helper → status map → `recordAudit` → `after()`), `transition()`, tenant GUC, `Deps` injection, idempotency |
| `.claude/rules/polymorphic-tables.md` | **Contract any new subscription table MUST satisfy** — named CHECK discriminator, BIGINT `entity_id`, `entity_type`/`entity_id` naming, org-led indexes, parent-delete integrity, `enforce_tenant_isolation()` in the birth migration, Drizzle model in the same PR |

Design constraints that follow from those and that your report must respect:

1. **Kinetic Ledger identity only** — dense, state-colored, data-first ops UI. No foreign design kit,
   no second visual language, no card soup, no nested `SectionCard`s as rows.
2. **One region contract per region.** A page with N jobs is N regions. Home will mix a
   **Workbench** region (pick a task → act) with a **Monitor** region (rollup/stream, observe-only).
   Say explicitly which region each proposed block is, and why, using `pickArchetype()` Q1→Q4.
3. **URL is the state SoT** — `?mode=`, `?tab=`, `?open=`, filters. Never `useState` for durable view state.
4. **Compose existing primitives**, never fork: `LedgerGrid` + `useGridSurface` for any tabular
   surface, `EventTimeline`/`TimelineSection` for any history, `MonitorPageShell`/`KpiStrip`/
   `SectionCard` for rollups, `SidebarShell`/`SidebarRailShell` for pickers, `Panel`/`CardShell`
   for shells, `focusRing()`, `elevationClass()`, spacing intents, `text-role-*`.
5. **Tenant-from-birth**: `organization_id UUID NOT NULL`, no DEFAULT in raw DDL,
   `enforce_tenant_isolation('<table>')` in the same migration.
6. **Ask-first items** (flag them, do not assume approval): new migrations, anything touching the
   status machine / audit / search waist, introducing a second visual language, public API changes
   to widely-used primitives.

---

## 2. Verified current state (scan results — confirm, then build on)

### 2.1 Home surface — what actually exists

| Path | State |
|---|---|
| `src/app/page.tsx` | `/` route entry |
| `src/features/home/home-modes.ts` | Mode SoT: `today \| tasks \| collab \| forge \| brief`; `HOME_MODE_SCOPED_PARAMS = ['task','plan','view','q','open','scope']` |
| `src/features/home/HomeWorkspace.tsx` (69 L) · `HomeModePanels.tsx` (114 L) · `HomeTasksMode.tsx` (258 L) · `TaskInbox.tsx` (234 L) · `useHomeMode.ts` · `useHomeTasks.ts` | Thin shell; only `today`/`tasks` have real bodies |
| `src/lib/my-day/aggregate-my-day.ts` (192 L), `my-day-types.ts`, `my-day-href.ts` | The aggregator |
| `GET /api/my-day` | Current endpoint |
| `GET /api/home/feed` | **Deprecated** shim still consumed by `TaskInbox.tsx` — a live inconsistency |

`MyDayFeed` shape today: `{ doNext: WorkOrderRow \| null, assigned: WorkOrderRow[], interrupts:
MyDayInterrupt[], queueCards: MyDayQueueCard[], counts }`. `MyDayInterruptKind` is a hardcoded
3-value union: `return_pending_test | order_ready_ship | support_followup`. **This union is the
seed of the subscription vocabulary and is far too narrow.**

### 2.2 The `home` worktree lane — IMPORTANT

`../cycleforge-home` (branch `topic/home`, WS-HOME, port :3040, HEAD `dfd5f517f`) is **stale and
contains no home surface**. It sits ~891 files / +44k/−35k lines divergent from `main`'s merge base,
predating the repo SoT transfer; `grep -i "my day"` in it returns nothing. **All real Home code
lives in `main`.** Your plan must state whether WS-HOME should be (a) reset from `main` and used as
the build lane, or (b) retired with the work done in `main`. Do not assume the lane holds anything.

### 2.3 Event / signal spine that a subscription system would ride on

| Store | File | Role |
|---|---|---|
| `ops_events` | `src/lib/ops-events.ts` (`recordOpsEvent`, `OPS_EVENT_ENTITY_TYPES` — 9 values, DB CHECK pinned by `ops-events.test.ts`) | Append-only ops event spine, two axes: `entity_type/entity_id` + `workflow_node_id` |
| `entity_signals` | schema ~L4179; `src/lib/surfaces/record-entity-signal.ts`; kinds in `src/lib/surfaces/registry.ts` `SIGNAL_KINDS` | Structured "why" facts. Kinds today: `return_reason`, `warranty_denial`, `exception_why`, `triage_outcome`, `test_fail_reason`, `buyer_note`. Every insert also emits an `ops_event`. |
| `inventory_events` | `src/lib/inventory/state-machine.ts` `transition()` | Unit lifecycle; `UNIQUE(client_event_id)` idempotency |
| `station_activity_logs` | `src/lib/timeline/station-activity-events.ts` | Station scans |
| `work_assignments` | schema ~L1726 | Unified assignment queue (ORDER / RECEIVING / REPAIR / FBA_SHIPMENT / SKU_STOCK), pg ENUM discriminator, delete-triggers |
| `entity_threads` / `entity_notes` | schema ~L4293 / ~L937 | Ticket-optional conversation anchored to a canonical entity; status `open\|snoozed\|resolved` |
| `audit_logs` | `src/lib/audit-logs.ts` `recordAudit` | Actor-attributed audit |
| `pack_verification_events`, `user_reported_issues` | schema | Outcome + signal stores |

**Realtime:** Ably, org-namespaced. `src/lib/realtime/channels.ts` — every channel is
`org:{uuid}:{suffix}`; `orgChannelPrefix()` throws on a non-UUID org; the token endpoint
(`src/app/api/realtime/token/route.ts`) grants capability only for the caller's own org.
Existing suffixes: `orders:changes`, `repair:changes`, `station:changes`, `staff:changes`,
`dashboard:operations`, `ops_plans:changes`, `fba:changes`, `walkin:changes`, `forge:master-plan`,
`forge:runs`, `db:*`. **There is no per-staff channel today.**

**Search waist:** `src/lib/search/hybrid-retrieval.ts` (`hybridSearch`) → `SearchHit`
(`src/lib/search/search-hit.ts`); freshness via `entity_search_outbox` + cron worker. Never build a
second search engine.

### 2.4 The gap — subscriptions do not exist at all

A full grep of `src/lib`, `src/features`, `src/components` and `src/lib/drizzle/schema.ts` for
`subscribe / subscription / watch / watcher / follow / notification` found **zero** entity-level
subscription or notification concept. What exists:

- `stripe_subscription_id` (billing — unrelated).
- `usps-subscription.ts` (carrier webhook — unrelated).
- `staff_preferences` (`src/lib/schemas/staff-preferences.ts`, `src/lib/neon/staff-preferences-queries.ts`,
  migration `2026-06-21_staff_preferences.sql`, hook `useStaffPreferences`) — a per-staff Zod-validated
  JSON prefs bag (theme, time format, scan hotkey, grid column deltas, board lane prefs). This is the
  natural home for *display* prefs but **not** for subscription rows (they need indexing, fan-out, and
  a delivery ledger).
- `src/lib/email/send.ts` — the only outbound channel. **No web-push, no service-worker push, no
  Slack/SMS.** `src/app/offline/` and an offline write queue exist (PWA-ish), so a service worker may
  be present — verify.
- `staff_messages` (migration `2026-06-13_staff_messages.sql`) — closest existing person-addressed store.

**So: the subscription engine is greenfield.** Design it from scratch, but *anchored* on
`ops_events` / `entity_signals` as the event source and the polymorphic-table contract as the schema law.

### 2.5 Prior planning docs (read, reconcile, supersede — do not fork a third)

- `docs/todo/contextual-my-day-home-plan.md` — "My Day" ranking proposal, status **Proposal, needs
  validation**. Argues `/` = My Day for everyone; specialists deep-land on `/pack` / `/test`.
- `docs/todo/home-ops-tv-collab-surfaces-plan.md` — the larger plan: Home = personal triage + tasks +
  collab + Forge (Yjs/CRDT live plan) + AI Brief; `/operations` = TV/floor Monitor; `/forge` redirects
  into a Home mode. Contains §21–30 grounded codebase deltas.
- `docs/todo/page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` + WS-NAV-IA lane — an
  in-flight effort to collapse ~15 flat nav rows into ~6 lanes. **Your Home IA must be consistent
  with that nav consolidation** — read it and say how Home fits the lane model.
- `docs/portfolio/WORKTREE-LANES.md`, `docs/agent-log/README.md`, `docs/agent-fs/README.md`.

---

## 3. What to research — industry-standard comparison

Produce a rigorous comparison, with citations, of how 2025–2026 best-in-class products solve the
three problems Home has to solve at once. Cover at minimum:

**A. Personal work inbox / triage**
GitHub notification inbox (reason codes: `subscribed`/`mention`/`review_requested`/`state_change`,
per-repo + per-thread watch levels, "Done"/"Saved" triage), Linear Inbox + subscriber model, Jira
"Watch", Slack thread-follow, Superhuman/Missive split inbox, Height, Height/Sunsama "My Day".
Extract: what makes an inbox actionable rather than a firehose; the *unsubscribe from this thread*
affordance; read/unread vs done/snoozed as **separate** axes.

**B. Warehouse / ops control towers**
Flexport control tower, project44 / FourKites exception alerts, ShipBob & Shipium dashboards, Fishbowl
/ Cin7 / Zoho Inventory alert rules, Samsara / Motive fleet alerting, PagerDuty & Opsgenie routing
rules + escalation policies, Datadog Monitors (the "monitor = query + condition + notification
targets" model). Extract: rule-based vs entity-based subscription; threshold/latency alerts
("delivered but not received in 24h" is a **latency SLA alert**, not an event subscription — this
distinction matters and your design must handle both).

**C. Feed / fan-out architecture**
Fan-out-on-write vs fan-out-on-read for notification feeds; the "notification object + actor +
verb + target" activity-stream model (ActivityStreams 2.0); digest/batching & dedupe strategies
(GitHub's collapse, Slack's batching, Novu/Knock/Courier as reference implementations of a
notification workflow layer); idempotency & at-least-once delivery; per-user preference matrices
(channel × category × frequency); quiet hours; escalation.

**D. Tabbed all-in-one home patterns**
Compare tab-based (Linear inbox tabs, GitHub Inbox filters, Notion "My tasks") vs saved-view-based
(Linear views, Airtable views, Retool). Decide and argue: **fixed tabs vs user-savable views** — and
whether Cycle Forge subscriptions should *be* the views.

For each: what Cycle Forge should adopt, what it should reject, and **why**, in terms of a warehouse
floor operator with a scanner in one hand — not a knowledge worker at a desk.

---

## 4. Deliverables — produce all of these

### D1. Grounded current-state audit
Verify §2. List every file you actually read. Flag any claim above that is wrong. Include a table of
every existing surface that Home would aggregate from (`/dashboard`, `/receiving`, `/unbox`,
`/triage`, `/test`, `/pack`, `/shipping`, `/pickup`, `/repair`, `/fba`, `/support`, `/operations`,
`/signals`, `/products`) with: its region contract, its primary data query, and what a Home tile
would need from it.

### D2. Industry comparison matrix
Per §3, a scored matrix (product × capability) plus a short "what we steal / what we skip" verdict.

### D3. Information architecture for `/` (the tab design)
- Exact tab set, with the **job** of each tab in one sentence, its **region contract**, its
  **primary surface** (per the data-shape → surface table), and its **density mode**.
- Candidate tabs to evaluate (add/remove/merge — argue, don't just accept):
  `Today` (ranked next work + interrupts) · `Triage` (needs-a-decision queue) · `Tasks`
  (assigned work orders / to-do) · `Watching` (subscription feed) · `Board` (org rollup, Monitor) ·
  `Collab` (threads/mentions) · `Brief` (AI shift summary).
- URL contract: which params each tab owns, what clears on tab change, how a deep link reproduces a view.
- Empty / loading / error states **branched by type** (first-use vs no-results vs errored vs
  no-permission), per `workbench.md`.
- Mobile / floor variant: what Home looks like on a phone at a bench (`src/app/m/`), and what it
  looks like on the wall TV (`/operations?tv=1` already exists — do not duplicate it).
- **Motion**: which single region crossfades (per `motion-crossfade.md`); the collection map must not.

### D4. Subscription system design (the core deliverable)
Design a **first-class subscription engine**. Must cover:

**D4.1 Subscription taxonomy.** At minimum distinguish:
- **Entity subscription** (many-to-one): N staff watch one `(entity_type, entity_id)` — e.g. carton
  #4412, order #X, repair RS-88. Auto-subscribe rules (like GitHub: you acted on it → you watch it)
  plus explicit watch/unwatch.
- **Scope/rule subscription** (one-to-many): one staff watches a *predicate* over a class —
  `SKU = LEN-T480-i5 AND event IN (unbox.*, receive.*)`; `platform = eBay AND event = order.priority`;
  `station = testing AND severity >= 2`.
- **SLA / latency subscription**: fires on an *absence* — "delivered ≥24h ago and still not received",
  "packed but not scanned out by EOD", "test failed and no repair opened in 48h". These need a
  **scheduled evaluator**, not an event tap. Design that evaluator (cron cadence, idempotency,
  re-arm/resolve semantics, no duplicate-alert storms).
- **Digest vs realtime vs both** per subscription.

**D4.2 Event vocabulary.** Propose the canonical `event_key` namespace (e.g.
`receiving.carton.delivered`, `receiving.line.unboxed`, `unit.test.failed`, `order.shipped`,
`order.returned`, `repair.opened`). Show explicitly how it maps onto **existing** emitters —
`recordOpsEvent`, `recordEntitySignal`, `transition()`, `station_activity_logs` — and argue whether
the vocabulary should be **derived from** `ops_events.event_type` + `SIGNAL_KINDS` (preferred: one
waist) or be a new registry that those map into. Whichever you pick, it must be a single code SoT
module with a pinning test, like `OPS_EVENT_ENTITY_TYPES` is today.

**D4.3 Schema.** Propose the DDL for (at least) `staff_subscriptions` and a delivery ledger
(`notification_deliveries` / `staff_inbox_items`). **It must satisfy `polymorphic-tables.md`
verbatim**: named CHECK discriminator, BIGINT `entity_id`, `entity_type`/`entity_id` naming, org-led
unique + lookup indexes, parent-delete integrity (real FK or a `TG_ARGV[0]`-dispatch trigger family —
name every parent the discriminator can reach), `enforce_tenant_isolation()` in the birth migration,
Drizzle model in the same PR. Include the idempotent `DO $$ … EXCEPTION WHEN duplicate_object` guards.
State how a rule subscription's predicate is stored (typed columns vs jsonb) and justify it against
the doc's jsonb taxonomy rule ("promote queryable business facts to real columns").

**D4.4 Fan-out pipeline.** Where the tap goes (which chokepoint functions), fan-out-on-write vs
-on-read for this scale (a tenant has ~5–50 staff; volume is thousands of events/day), dedupe +
collapse rules, at-least-once + `client_event_id` idempotency, backpressure, and how it uses
`after()` so a mutation is never blocked. Whether it needs a queue (Vercel Queues / outbox table +
cron, mirroring the existing `entity_search_outbox` worker — **strongly prefer mirroring the pattern
already proven in this repo**).

**D4.5 Delivery channels.** In-app inbox (must-have, Ably-realtime), email (`src/lib/email/send.ts`
exists), and a recommendation on web-push / Slack. Design the per-staff **preference matrix**
(category × channel × frequency + quiet hours) and say where it lives — `staff_preferences` JSON vs
its own table — with a reason.

**D4.6 Realtime.** Propose the per-staff Ably channel (`org:{orgId}:staff:{staffId}:inbox`) and
confirm it works with the existing token-capability grant in
`src/app/api/realtime/token/route.ts` — **check whether that endpoint's capability string would even
permit a per-staff channel today, and if not, exactly what must change**, including the tenant-safety
argument for that change.

**D4.7 Permissions.** How subscription visibility interacts with `src/lib/auth/permission-registry.ts`
— a staffer must never receive a notification about an entity they cannot see. Name the permission
ids involved and where the filter belongs (write-time vs read-time).

**D4.8 UX.** The subscribe affordance on every entity surface (one shared primitive — propose it,
don't let each page invent a bell icon); the "manage my subscriptions" settings surface (fits
`src/lib/settings/registry.ts`, the declarative settings framework); the triage actions on an inbox
row (done / snooze / unsubscribe / assign / open); unread vs done as separate axes; and how a
subscription becomes a **saved tab/view** on Home.

### D5. API + backend surface
Every route you'd add, in the house skeleton (`withAuth(handler, { permission })` → Zod validate →
domain helper → 404/409/200 → `recordAudit` → `after()`), plus the permission-registry entries and
the matching `route-permission-manifest.test.ts` rows. Domain helpers must take an injectable `Deps`
so tests run DB-free.

### D6. Component inventory
For every UI block in D3, name the **existing** primitive it composes (`LedgerGrid`,
`TimelineSection`, `KpiStrip`, `SectionCard`, `MonitorListBlock`, `CardShell`, `SidebarRailShell`,
`CopyChip` family, `HoverTooltip`, `DateTimeValue`, `LedgerValue`, `DetailStack` overlay shell…).
Where nothing fits, propose a **new sibling that composes the shared primitive** and justify it under
the "compose → grow the SoT" law. Explicitly list anything that is Ask-first.

### D7. Phased execution plan
Phases with: scope, files touched, migration(s), flag gate, verification (`npm run verify` = lint +
typecheck + unit + DS-ratchet guards + knip + route-auth drift + schema drift), rollback, and the
Playwright E2E spec for each phase (`tests/e2e/`, conventions in `.claude/agents/e2e-spec-writer`).
Phase 1 must be shippable on its own. Call out which lane each phase belongs in (WS-HOME vs
WS-DOGFOOD `main` vs WS-NAV-IA) per `docs/portfolio/WORKTREE-LANES.md`.

### D8. Risk register
Notification fatigue and the mitigation; N+1 / Neon CU-hour cost of feed queries (this repo has a
`neon-cost-reviewer` agent for a reason — model the query cost); fan-out storms on bulk operations
(a 200-line PO receive must not emit 200 notifications to 5 watchers = 1000 rows — design the
collapse); cross-tenant leakage; permission drift; the deprecated `/api/home/feed` shim cleanup;
and the stale `topic/home` worktree decision.

---

## 5. Ground rules for your output

- **Cite real file paths and line numbers** for every claim about the current code. If you did not
  open the file, say so.
- **No invented APIs.** If you reference `LedgerGrid`, `useGridSurface`, `recordEntitySignal`,
  `transition()`, `withAuth`, `hybridSearch`, `EventTimeline` — read them first and match the real
  signature.
- Prefer **decision tables over prose essays** (house preference).
- Every hard "don't" must be paired with a concrete "do this instead".
- End with a **Compound opportunities** section in the house format:

  ```markdown
  ### Compound opportunities
  - Do now (in scope / low blast radius): …
  - Promote to DS next (2+ call sites): …
  - Deferred (ask first / multi-page): …
  ```

- Flag anything that is genuinely ambiguous as an **open question with a recommended default**,
  rather than silently choosing.
