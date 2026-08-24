# HANDOFF — Work sessions: start, end, attribution, duration

Scope: the **work session lifecycle per staff, per org** — what a session is, how it starts
and ends, what it links to, what was produced inside it, and how long everything took.

Paste everything below the line into a fresh Claude Code session on this worktree.

---

You are completing the **work-session domain** for the Cycle Forge Warehouse OS refactor in
`/home/michaelgarisek/Projects/cycleforge-app/.claude/worktrees/warehouse-os-refactor-8f2dc3`
(git worktree, branch `claude/warehouse-os-refactor-8f2dc3`).

Background reading: `docs/warehouse-os/` — especially `02-target-architecture.md` and
`03-decisions.md`. Do not re-derive the architecture; it is settled.

## What already exists — do not rebuild it

A previous pass landed the table, the domain module, and the API. **Read these first.**

| Path | What it is |
|---|---|
| `src/lib/migrations/2026-08-22b_work_sessions.sql` | The `work_sessions` table. **Written, NOT applied.** |
| `src/lib/sessions/types.ts` | Vocabularies + the `WorkSession` type |
| `src/lib/sessions/work-sessions.ts` | Domain: start / arm / park / resume / end |
| `src/lib/sessions/work-sessions.test.ts` | DB-free unit tests with injected fakes |
| `src/app/api/sessions/route.ts`, `[id]/route.ts` | HTTP surface |
| `src/lib/migrations/2026-08-23b_ops_events_session_columns.sql` | Adds nullable `session_id` + `session_type` to `ops_events`. **Written, NOT applied.** |

### `work_sessions` — the exact shape shipped

```sql
work_sessions (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,          -- no DDL default; enforce_tenant_isolation installs it
  kind                TEXT NOT NULL,          -- 'scan' | 'task'
  scan_type           TEXT,                   -- NOT NULL iff kind='scan'
  armed               BOOLEAN NOT NULL DEFAULT false,
  surface_key         TEXT,                   -- SURFACE_REGISTRY key; code registry, not a FK
  status              TEXT NOT NULL DEFAULT 'open',
  version             INTEGER NOT NULL DEFAULT 0,
  staff_id            INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claimed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claim_expires_at    TIMESTAMPTZ,
  device_id           TEXT,
  client_event_id     UUID NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ,
  state               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Constraints already in place — respect them, do not weaken them:**

| Constraint | Rule |
|---|---|
| `work_sessions_kind_chk` | `kind IN ('scan','task')` |
| `work_sessions_scan_type_chk` | `(kind = 'scan') = (scan_type IS NOT NULL)` — biconditional |
| `work_sessions_status_chk` | `status IN ('open','parked','ended')` |
| `work_sessions_armed_chk` | `armed = false OR (kind='scan' AND status='open')` |
| `work_sessions_ended_at_chk` | `(status = 'ended') = (ended_at IS NOT NULL)` — biconditional |
| `ux_work_sessions_armed_scan` | **UNIQUE partial index on `(organization_id) WHERE kind='scan' AND armed=true`** |
| `ux_work_sessions_client_event` | idempotency |

> The armed index is the load-bearing one. **Exactly one armed scan session per org is a
> database guarantee, not application logic** — a concurrent write cannot defeat it. Never
> replace it with an application check.

### Vocabularies — the closed sets

```
SESSION_KINDS      = ['scan', 'task']
SESSION_STATUSES   = ['open', 'parked', 'ended']
SCAN_SESSION_TYPES = ['unbox', 'triage', 'pickup', 'test', 'pack', 'outbound']
```

`SCAN_SESSION_TYPES` is mirrored by `SURFACE_REGISTRY[key].session` in
`src/lib/stations/surface-keys.ts` — a closed `Record` where a missing entry is a type
error. **Adding a scan type means adding it in both places**, and the compiler enforces the
second.

### Status transitions — the only legal moves

```
              start()                    end()
                │                          │
                ▼        park()            ▼
   (none) ──▶ open ◀───────────────────▶ parked ──▶ ended
                │        resume()                     ▲
                └─────────────────────────────────────┘
```

`armed` is orthogonal to status: only an `open` scan session may be armed, and arming one
disarms every other in the org, in the same transaction.

---

## What is MISSING — this is your work

The session exists and can start, park, resume, and end. **Nothing yet answers the three
questions the operator actually asked.**

### Gap 1 · "What was added during the session?"

`ops_events` now carries a nullable `session_id` + `session_type` — but **nothing writes
them**, and `ops_events` is only one of four event spines. Critically,
**`inventory_events` has no session column at all**, and it is where unit lifecycle lives.

`inventory_events` today (relevant columns):
```sql
inventory_events (
  id, occurred_at, event_type, actor_staff_id, station,
  receiving_id, receiving_line_id, serial_unit_id, sku,   -- explicit FKs, NOT polymorphic
  bin_id, prev_bin_id, prev_status, next_status,
  client_event_id UNIQUE, ...
)
```

Note the shape difference and design for it: `ops_events` is **polymorphic**
(`entity_type` + `entity_id BIGINT`), `inventory_events` is **explicit-FK**. Do not try to
unify them in this pass — thread the session onto both.

### Gap 2 · "How long did it take, session to session?"

Two distinct measurements, and they are not the same thing:

- **Session duration** — `ended_at − started_at`, minus parked intervals. Parked time is
  not work time, and today parks are not recorded as intervals at all: `park()` flips a
  status and loses when it happened.
- **Gap between sessions** — the idle span between one session's `ended_at` and the same
  staffer's next `started_at`. This is the metric the operator named
  ("how long it took from session to session") and **nothing computes it.**

Also relevant: sign-in already opens a payroll row in `time_punches`. Session time and
clock time are different numbers and must never be conflated in the UI.

### Gap 3 · Per-staff, per-org rollup

There is no read model. `src/lib/operations/journey.ts` currently answers "who did what,
when" by hand-unioning **13 tables** across 699 lines. Session attribution is what lets that
collapse into one indexed query.


### Gap 4 · Every session write must be ASYNC relative to the scan

**This is the constraint that governs D1 and D2, and it is the easiest one to get wrong.**

A barcode wedge delivers ~20 characters plus Enter as a burst of synthetic keystrokes. The
next scan can land while the previous one is still being processed. **Session attribution
must never be on that path.** If stamping `session_id` adds a round-trip before the operator
sees their scan land, the bench slows down and operators start double-scanning — which is
how duplicate rows get created.

The repo already has every primitive for this. Use them; do not invent parallel machinery.

#### The existing scan altitude — do not violate it

`src/lib/keyboard/wedge-scan-listener.ts` (157 LOC) documents its own contract:

1. Classify keys via the pure `wedgeReduce` machine
2. Enqueue accepted payloads on `createScanCommitQueue`
3. **Yield the main thread before `onScan`** so the next wedge character lands
4. **Never read or write focus**

So: the keydown handler returns *before* any React state, routing, or sink dispatch runs.
**Anything you add for session attribution goes after that yield, never inside the handler.**

| Primitive | Path | Use it for |
|---|---|---|
| `yieldToInput` | `src/lib/perf/yield-to-input.ts` | Give the main thread back before doing session work |
| `applyStreamBudget` | `src/lib/perf/stream-apply.ts` | Batch applies — `STREAM_APPLY_BATCH_SIZE = 16`, `STREAM_APPLY_TIME_BUDGET_MS = 8` |
| `createFrameCoalescer` | same family | Never `setState` per scan during a burst |
| `queueOrFetch` | `src/lib/offline/write-queue.ts` | IndexedDB write queue — survives connectivity loss, replays with the idempotency key |
| `claimOrReplay` | `src/lib/api-idempotency.ts` | Server-side claim-or-replay; a retry returns the cached response |
| `after()` | Next.js, already used in **70 API routes** | Fire-and-forget server side-effects that must not block the response |
| `redisAdvanceLock` | `src/lib/workflow/lock.ts` | Best-effort, **fail-open** — never block a scan on infrastructure |

#### The required shape

```
wedge keydown  ──▶ wedgeReduce ──▶ commit queue ──▶ [YIELD] ──▶ onScan
                                                                  │
                                        ┌─────────────────────────┤
                                        ▼                         ▼
                              optimistic UI (hit marker)   enqueue session write
                              — operator sees it NOW       — never awaited by the UI
                                                                  │
                                                                  ▼
                                                    POST (idempotent, client_event_id)
                                                                  │
                                              route: withAuth → validate → transition
                                                                  │
                                                    after(): stamp session_id,
                                                             emit ops_event, Ably nudge
```

**The operator's confirmation is optimistic and immediate.** The session write is a
consequence of the scan, not a precondition for acknowledging it.

#### Seven rules to encode

1. **Never await a session write on the scan path.** Enqueue and return. The `hitMarker`
   motion role exists precisely to confirm a scan landed without waiting for the server.

2. **Ordering is by `occurred_at` minted at scan time on the client, not by arrival.**
   Async writes arrive out of order. Stamp the timestamp when the wedge fires and carry it
   through, or a burst of six scans will report in whatever order the network delivered.
   Ordering ties break by `client_event_id`, never by insertion id.

3. **Idempotency is mandatory, not optional.** Every session-attributed write carries a
   `client_event_id`. `inventory_events` and `ops_events` both already have a `UNIQUE`
   constraint on it, and `work_sessions` has `ux_work_sessions_client_event`. A replay
   after a flaky-network retry must be a no-op that returns the original result — this is
   what makes "enqueue and forget" safe.

4. **Fail open, never block the floor.** If the session service is unreachable, the scan
   still succeeds and the attribution is queued. An unattributed event is a reporting gap;
   a blocked scan is a stopped warehouse. Follow `redisAdvanceLock`'s stance: correctness
   comes from event-gated idempotency, not from the lock.

5. **Bursts coalesce.** A PO receive fires many scans in seconds. Session counters, the
   header's live context, and any "N items this session" readout apply through
   `applyStreamBudget` / `createFrameCoalescer` — **never `setState` per scan**. This repo
   has already paid for that: a publish effect once flooded the realtime channel at
   >1000 msg/s and had to be re-architected.

6. **Offline is a first-class path, not an error.** `queueOrFetch` already implements an
   IndexedDB queue keyed by the request's idempotency key — and it currently has **exactly
   one consumer**. Session writes should be its second. Design for: scan offline, queue,
   reconnect, drain, and the server correctly recognising already-processed replays.

7. **Arming is async too, and the DB still guarantees the invariant.** Two devices may
   race to arm a scan session. `ux_work_sessions_armed_scan` makes the loser fail at the
   database, not at a check. Handle that failure as a **normal outcome** — re-read and
   report which session is armed — not as a `500`.

#### What the operator must be able to see

Async attribution is invisible when it works and dangerous when it silently does not. Surface:

- **queue depth** — writes pending, from the existing offline-queue depth signal
- **unattributed events** — scans that landed with no `session_id`, which is the symptom
  of a broken stamp
- **the armed session**, always — the operator must know where the next scan lands without
  looking away from the carton

`src/lib/realtime/connection-health.ts` already models three independent facts — browser
online state, realtime connection state, and offline-queue depth — and its own docblock
notes there is **no app-root banner today**. The always-visible global header is the
natural home for that indicator, and it is the one thing in this design the existing code
was explicitly built for and never got.

---

## Deliverables

### D1 · Session attribution on the event spines
**Migration** (next free slot — `2026-08-22b` and `2026-08-23a/b/c` are taken; use
`2026-08-23d` or later):

- `inventory_events`: `ADD COLUMN session_id BIGINT` (nullable) + index
  `(organization_id, session_id, occurred_at DESC)` if the table carries `organization_id`;
  otherwise index `(session_id, occurred_at DESC)` and note the tenancy gap.
- Nullable `ADD COLUMN` only. **Expand → code → contract**: the migration lands before any
  reader. Never the reverse — between the two deploys, every query naming the column throws.

**Code:** stamp `session_id` at the **earliest write on the path**, not the most obvious
one. A shared resolver that writes before your gated branch will silently produce unattributed
rows — this repo has already paid for that exact mistake once, where a memoized lookup helper
wrote attribution before the branch that was supposed to decide it.

Make the session argument **required with no default** on the write helpers. A default is a
silent opt-out that every call site you did not visit takes automatically, and the compiler
stays quiet about exactly the ones you missed.

### D2 · Park intervals — make parked time measurable
**Migration:** `work_session_intervals`

```sql
work_session_intervals (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,        -- no DDL default
  session_id       BIGINT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,        -- CHECK ('active','parked')
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,          -- NULL = currently in this interval
  staff_id         INTEGER REFERENCES staff(id) ON DELETE SET NULL
)
```

- `enforce_tenant_isolation('work_session_intervals')` **in the same migration**.
- Partial unique index: at most one open interval per session —
  `UNIQUE (session_id) WHERE ended_at IS NULL`.
- `park()` closes the active interval and opens a parked one; `resume()` does the inverse;
  `end()` closes whatever is open. All inside the existing transaction, bumping `version`.

**Why a table and not two timestamp columns:** a session can be parked and resumed many
times, and a lead can resume someone else's parked session — which is why
`claimed_by_staff_id` exists separately from `staff_id`. Carry `staff_id` on the interval
so a resumed session attributes each stretch to whoever actually worked it.

### D3 · Duration and gap — one pure module
`src/lib/sessions/session-metrics.ts`, **pure functions over rows, zero DB**, so they unit
test without a database:

```ts
activeDuration(session, intervals): Duration        // total minus parked
parkedDuration(session, intervals): Duration
gapBetween(previousSession, nextSession): Duration  // ended_at → started_at
sessionSeries(sessions, intervals): SessionMetric[] // ordered, with gaps interleaved
```

Rules to encode, and state them in the docblock:
- An **open** session has no duration — return a live elapsed value flagged as provisional,
  never a fabricated end.
- A gap **before the first session of a shift** is not a gap; do not report one.
- A gap that spans a shift boundary (`time_punches`) is **off-clock**, not idle. Reading
  it as idle time makes a report that accuses staff of doing nothing overnight.
- Clock skew: intervals come from the DB clock; never mix in a client timestamp.

### D4 · Read model — per staff, per org
`src/lib/sessions/session-rollup.ts` — tenant-scoped via `withTenantTransaction`, `orgId`
from `ctx.organizationId` and **never from a request body**:

```ts
listSessionsForStaff(orgId, staffId, range): WorkSessionWithMetrics[]
listSessionsForOrg(orgId, range, filters): WorkSessionWithMetrics[]
sessionContents(orgId, sessionId): SessionContents
```

`SessionContents` is the answer to "what was added during this session" — read from the
event spines by `session_id`, resolved into:
- entities **touched** (cartons, lines, units, orders) with their type and identifier
- entities **created** vs merely **updated** — these are different facts and the UI must
  distinguish them
- scans performed, counted by scan type
- exceptions raised
- photos captured

Cap and paginate. A busy unbox session produces thousands of events; an uncapped read on
a manager dashboard is an outage.

### D5 · API
Extend `src/app/api/sessions/`, following the existing house skeleton
(`withAuth` → validate → domain helper → 404/409/200 map → `recordAudit` → respond):

```
GET  /api/sessions/[id]/contents      → SessionContents
GET  /api/sessions/summary?staffId&from&to  → per-staff series with durations and gaps
POST /api/sessions/[id]/park          → park (idempotent)
POST /api/sessions/[id]/resume        → resume (409 if claimed by another live lease)
```

Thread `clientEventId` so a retry on a flaky floor network is a no-op rather than a double
park. Return `409` with the current `version` on an optimistic-concurrency loss so the
client can reconcile rather than guess.

### D6 · Tests — DB-free, injected fakes
Follow the existing pattern in `work-sessions.test.ts`. Cover at minimum:

- park → resume → park → end produces **exactly** the expected interval sequence
- `activeDuration` excludes parked stretches
- a session resumed by a different staffer attributes each interval to the right person
- `gapBetween` returns nothing before the first session of a shift
- a gap crossing a shift boundary is classified **off-clock**, not idle
- ending an already-ended session is idempotent, not an error
- arming a second scan session disarms the first *(already covered — keep it passing)*
- a `task` session never carries a `scan_type`
- a stale `version` loses and reports the current one


### D7 · The async scan-attribution path
Implement Gap 4 concretely:

- A **client-side session-write queue** that the scan path enqueues to and never awaits.
  Reuse `queueOrFetch` (`src/lib/offline/write-queue.ts`) rather than writing a third
  queue — the repo already has one offline queue with a single consumer, and a parallel
  mechanism beside it is exactly the fork this refactor exists to end.
- **Server-side**, stamp attribution and emit the `ops_event` inside `after()` so the
  response returns before the side-effect runs. 70 routes already do this — copy the shape.
- A **pure ordering/coalescing module**, DB-free and unit-testable:
  `orderScanWrites(pending): ScanWrite[]` sorting by client-minted `occurred_at` with
  `client_event_id` as the tiebreak, and a burst coalescer for session counters.
- **Tests** (DB-free, injected fakes) covering: out-of-order arrival still reports in scan
  order · a replayed `client_event_id` is a no-op returning the original result · a session
  write failing does NOT fail the scan · a burst of 50 scans produces one coalesced counter
  update, not 50 · an offline scan queues and drains correctly on reconnect · losing the
  arm race surfaces as a normal outcome, not a 500.


---

## Rules

- **Do not apply migrations.** Write the files; the operator applies them. Use the next
  free `YYYY-MM-DD<letter>` slot and **check what is already taken** — filenames are
  immutable once applied, and two files in one slot are ordered by *description*
  alphabetically, which has already inverted an expand/contract pair once in this repo.
- **Every new table:** `organization_id UUID NOT NULL` with **no DDL default**, plus
  `enforce_tenant_isolation('<table>')` in the same migration. `work_sessions` is the root
  object of the whole application; a tenancy hole here is a cross-tenant leak.
- **Never start, restart or kill a dev server.** The operator owns `:3050`.
- **Do not commit, stage, stash, or checkout.** Other sessions share this tree; never
  `git add -A`.
- Status changes on units still route through the existing state machine
  (`src/lib/inventory/state-machine.ts` → `transition()`). Sessions **annotate** work; they
  do not become a second way to change unit status.
- Do not re-add house laws, guards, ratchets or SoT doctrine — that corpus was deliberately
  deleted 2026-08-21. No `*.guard.test.ts`.
- `node_modules` is absent in this worktree; `npx` resolves up to the parent repo.

## Two traps worth naming

**`audit_logs` has no `organization_id`.** If you reach for it as a reporting source, you
inherit a tenant-scoping workaround. Use `ops_events` and `inventory_events`.

**Session ≠ auth session ≠ shift.** Three different clocks:
`work_sessions` (a unit of work) · `staff_sessions` (authentication) · `time_punches`
(payroll, opened at sign-in). Name them distinctly in code and in every operator-facing
string. Conflating the first two is how a UI ends up claiming someone worked eight hours
because their browser tab stayed open.
