# Floor Control Tower — master plan

**Goal.** A manager opens Operations and sees every scan bench as a live tile —
who is on it, which carton, which procedure step, and whether it is stuck. They
click a tile and read the step feed. When a step is chronically slow, the system
says so, the suggestion becomes an assignable task, and approving it retunes the
bench without a deploy.

**Status.** Planned 2026-08-10. Nothing below is built. Phases 0–2 are the
product; 3–5 are the analytics and copilot loop that sit on top.

**Lane.** New worktree (`../cycleforge-floor` on `topic/floor`) — this crosses
receiving, operations, realtime and settings, and must not pile onto `main`.
Register in [`WORKTREE-LANES.md`](../portfolio/WORKTREE-LANES.md).

---

## 0. What already exists (read this before building anything)

Six of the pieces this plan needs are already shipped. The plan's job is to
connect them, not to rebuild them.

| Capability | Where it lives | State |
|---|---|---|
| Procedure vocabulary (steps, phases, flows, data lineage) | [`procedure.ts`](../../src/lib/stations/procedure.ts) | **Built** — `intake/capture/commit`, flows `found/unfound/return`, CI-guarded lineage. Declared for `unbox` (+ a `testing` sibling) |
| Active-step pointer | [`procedure-pointer.ts`](../../src/lib/receiving/procedure-pointer.ts) `resolveActiveStep` | **Built**, pure, unit-pinned |
| **Per-step read model — state + when + who** | [`procedure-receipt.ts`](../../src/lib/receiving/procedure-receipt.ts) `buildProcedureReceipt` | **Built.** Derives every step's `state`, server-attested `at`, `byStaffId`, `byStaffName`, `detail` from facts the carton already carries. Shares one derivation with the bench, guard-pinned |
| Step completion stamps in the DB | `receiving_unbox.contents_confirmed_at`, `receiving_line_testing.condition_graded_at` / `label_previewed_at` / `label_printed_at`, `receiving_line_putaway.staged_at`, photos/serial rows | **Built** — the acknowledgement stamps landed 2026-08-01c / 2026-08-02 / 2026-08-09c |
| Realtime transport | [`publish.ts`](../../src/lib/realtime/publish.ts) + [`channels.ts`](../../src/lib/realtime/channels.ts) | **Built** — ~30 typed publishers, per-org channels, debounced connection-health |
| Alerting core (hysteresis, cooldown, recovery, aging) | [`evaluate.ts`](../../src/lib/monitors/evaluate.ts) | **Built** — Phase 0 of view monitors |
| Plans / tasks / assignment / inbox | `src/lib/ops-plans/**`, `staff_inbox_items`, ⌘⇧U throw | **Built** |
| Physical bench as an entity | `locations.location_kind` (ROOM · DESK · STAGING · BIN) + `resolveWorkstationBench` | **Partial** — packing benches only |

### What is genuinely missing

1. **A scan bench is not an entity.** `station` is a `varchar(20)` string on
   `station_activity_logs` and `text` on `inventory_events`. There is no row you
   can point a tile at. `station_definitions` is keyed `page_key`/`mode_key` —
   that is the *surface*, not the desk.
2. **No station→carton binding.** Nothing records "carton 50354 is at bench 3".
   `receiving_unbox.opened_by` names a person, not a place.
3. **No `station_states` row.** Answering "what is every bench doing" today means
   aggregating logs — O(events), not O(benches).
4. **No `entered_at` per step**, no waiver/revert events. Completion stamps exist;
   *entry* does not.
5. **No per-station realtime channel.** `getStationChannelName(orgId)` is one
   org-wide channel — every bench hears every other bench.

### Correction to the earlier ordering

An earlier pass called `procedure_step_events` the keystone. That was wrong in
sequencing: because `buildProcedureReceipt` already yields per-step
`(state, at, by)`, the **real-time God-view needs no event table at all** — it
needs a bench entity and a state cache. The event log is the *analytics* half and
belongs in Phase 3, after the tiles prove which numbers matter.

**Simplified first task: Phase 0 + Phase 1. One CHECK redefinition, one new
table, one writer, one channel.**

---

## 1. Phases

Each phase is independently shippable and independently useful. Do not start a
phase until the previous one's exit criteria are green.

### Phase 0 — Bench identity (~1 day)

**Goal.** A scan bench is a row you can name, bind a terminal to, and point a
tile at.

**Do not create a `stations` table.** `locations` already carries the typed
hierarchy, and pack placement already ruled that benches are `locations` rows —
a parallel table is the exact anti-pattern that ruling exists to prevent
([`source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Pack placement).

| Change | Detail |
|---|---|
| Migration `2026-08-11_locations_scan_station_kind.sql` | **Redefine** `locations_location_kind_check` with the full union plus `SCAN_STATION` — never append. Precedent for why: the `reason_codes_flow_context_chk` regression ([`polymorphic-tables.md`](../../.claude/rules/polymorphic-tables.md)) |
| Device binding | Extend [`workstation.ts`](../../src/lib/settings/workstation.ts) with `scanStationLocationId`; add `resolveWorkstationStation()` as a sibling of `resolveWorkstationBench` in a new `src/lib/stations/station-binding.ts` |
| Settings UI | One `SelectField` in [`WorkstationSection.tsx`](../../src/components/settings/sections/WorkstationSection.tsx), beside the existing pack-bench picker |

**Device-local on purpose**, same reasoning as the pack bench: the binding says
where the *terminal* is, so a staffer at another bench's terminal inherits that
bench. A binding naming a location the live list no longer carries resolves to
`null` rather than pointing a tile at a ghost.

**Exit criteria**
- A bench appears in Settings → Workstation and persists across reload.
- `npm run verify` green; schema-drift clean.

---

### Phase 1 — `station_states`, the God-view nexus (~2–3 days)

**Goal.** One indexed row per bench that answers the whole tile, so the floor
view is `SELECT … WHERE organization_id = $1` and nothing more.

#### Table

Migration `2026-08-11b_station_states.sql`. Tenant-from-birth: `organization_id
UUID NOT NULL` with **no DDL default**, then `enforce_tenant_isolation('station_states')`
in the same migration. Drizzle model in the same PR.

```sql
CREATE TABLE IF NOT EXISTS station_states (
  station_location_id   INTEGER PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL,
  -- who
  staff_id              INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- what work (polymorphic, per polymorphic-tables.md)
  entity_type           TEXT,            -- named CHECK: 'RECEIVING' | 'ORDER' | 'SERIAL_UNIT'
  entity_id             BIGINT,
  -- which procedure, which beat
  surface               TEXT,            -- SurfaceKey, e.g. 'unbox'
  flow_id               TEXT,            -- 'found' | 'unfound' | 'return'
  step_key              TEXT,
  step_phase            TEXT,            -- 'intake' | 'capture' | 'commit'
  step_entered_at       TIMESTAMPTZ,
  -- liveness
  status                TEXT NOT NULL DEFAULT 'idle',  -- CHECK: 'active'|'idle'|'blocked'
  last_activity_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Every discriminator gets a **named** CHECK in the idempotent `DO $$ … EXCEPTION
WHEN duplicate_object` guard. Index `(organization_id, status)` and
`(organization_id, last_activity_at)`.

**It is a CACHE, never a source of truth.** The domain answer stays
`resolveActiveStep` over `deriveProcedureSteps`. The moment this row becomes
independently writable there are two answers to "what step is this carton on".

#### Writer

`src/lib/stations/station-state.ts` → `upsertStationState(orgId, input)`, one
`INSERT … ON CONFLICT (station_location_id) DO UPDATE`. Called from exactly three
places on the bench:

1. carton open (`receiving-select-line` / `receiving-workspace-open`)
2. procedure pointer move — the existing `useUnboxProcedureSteps` derivation
3. carton close / receive

**Cost discipline** (this is the shape `neon-cost-reviewer` exists to catch):
the UPSERT runs **synchronously** (single indexed row, <5ms); the broadcast and
any future event append ride `after()`. Never poll — the tile subscribes.

#### Realtime

Add `getStationStateChannelName(orgId, stationLocationId)` to
[`channels.ts`](../../src/lib/realtime/channels.ts) and `publishStationState()`
to `publish.ts`, following the existing typed-payload pattern. Keep the org-wide
station channel for the floor grid's fan-out; the per-station channel is for the
drill-down panel.

#### API

`GET /api/operations/floor` — `withAuth` + a permission from the registry, one
tenant query, returns every tile. Wire the permission into
`permission-registry.ts` **and** `route-permission-manifest.test.ts` in the same
change (use the `/new-route` skill).

**Exit criteria**
- Scanning at a bound bench flips its row inside one round trip.
- `GET /api/operations/floor` returns N rows in one query at any carton volume.
- Guard: `station-state-cache.guard.test.ts` — the writer is the only module that
  writes the table, and it never reads back as a domain answer.

---

### Phase 2 — The floor grid (~3–4 days)

**Goal.** The manager surface.

**Region contract: Operations Live is a Monitor** — observe-only, no durable
selection, filters ephemeral ([`contextual-display.md`](../../.claude/rules/display/contextual-display.md)).
Every fix action deep-links *out* to the station workbench. An edit affordance on
this grid splits the archetype and is the single most likely way this phase goes
wrong.

| Piece | Contract |
|---|---|
| `StationFloorGrid` | Mounted in [`OperationsDashboard.tsx`](../../src/features/operations/components/OperationsDashboard.tsx) above `PrimaryKpiGrid`. Named rollup zone ⇒ responsive CSS grid is allowed |
| Tile anatomy | Bench name · staff (`StaffAvatar`, resolved by id — never from a name) · carton `PoChip`/`OrderIdChip` · step label · status dot from the lifecycle registry (`workflowStageDot`) — never an ad-hoc hue |
| Status | `active` / `idle` / `blocked` computed **client-side** from `last_activity_at`, so idle costs zero queries |
| Unbound bench | Honest absence — a tile that says "no terminal bound", never a fake-green tile |
| Degraded | Reuse `GridDegradedBox` (the fourth settled state), as Live already does |
| Drill-down | `RightRailHost` occupant, **stable** id `detail:station` (per-station ids would play exit→empty→enter on every tile click) |
| Live feed | The drill panel subscribes to that bench's channel and renders `CompactActivityRow` — status mark · title · one fact · short age (`formatLaneAgeCompact`) |
| Motion | None on the grid. Tiles update in place; a Monitor stream never crossfades |

**Exit criteria**
- 12 tiles render and update live with no polling.
- E2E on the **QA org** (`qa-desktop`): bind a bench, scan a fixture carton,
  assert the tile's step label changes.
- Guard: the grid mounts no durable selection and no mutation control.

---

### Phase 3 — `procedure_step_events`, the analytics spine (~3 days)

**Only now.** Phases 1–2 ship the whole real-time product without it.

**Goal.** Exact dwell, waivers, reverts — the things completion stamps cannot
express.

#### The ruling this collides with, and how it is resolved

[`station-workbench.md`](../../.claude/rules/display/station-workbench.md)
currently refuses per-step durations, on two grounds:

> there is no `step_started_at`; the gap between completions is not time-on-step,
> and timing an operator who can waive steps corrupts the evidence trail.

Both objections are answerable, and the answers change the design:

| Objection | Resolution |
|---|---|
| Gap ≠ time-on-step | Record `entered_at` explicitly. The derived gap stays available but is named `gapSeconds`, never `timeOnStep` |
| Timing a person corrupts evidence | Attribute dwell to the **station and the work item**, not to operator speed. `outcome` distinguishes `waived` from `advanced`, so a waiver can never read as a slow completion |
| Evidence-trail contamination | This is **telemetry, in its own table** — never `inventory_events`, which is the append-only evidence spine `transition()` writes and the timeline adapters read |

**Amend the rule file in the same PR.** A plan that silently contradicts a
written ruling is how the next agent reverts it.

#### Table

Migration `2026-08-12_procedure_step_events.sql`, append-only:

```sql
station_location_id, organization_id, staff_id,
entity_type, entity_id,              -- polymorphic, named CHECK
surface, flow_id, step_key, step_phase,
entered_at, left_at,
outcome                              -- CHECK: 'advanced'|'waived'|'reverted'|'abandoned'
```

Indexes lead with `organization_id`. Written from the same three call sites as
Phase 1, via `after()` so it never blocks a scan. Idempotent on a
`client_event_id`-shaped key so a wedge double-fire is a no-op.

**Considered and rejected: riding `inventory_events`.** It has the right columns
(`station`, `actor_staff_id`, `receiving_id`, `event_type`, `payload`). Rejected
because it is the evidence spine every timeline adapter reads — 10–20 telemetry
rows per carton would flood the operator-facing history and grow the hottest
table in the schema to answer a question no operator asks.

**Exit criteria**
- `p50/p90 dwell per (surface, step_key, station)` in one query.
- Waiver rate per step queryable and visibly distinct from completion.
- Zero measurable latency added to a scan (assert the write is off the hot path).

---

### Phase 4 — Bottleneck detection (~2 days)

**Reuse `view_monitors`. Do not build a second alerting engine** — hysteresis,
cooldown, recovery bands and the alert-fatigue ruling are already decided.

| Piece | Detail |
|---|---|
| `expectedSeconds?` on `ProcedureStep` | **Declared first, learned later.** A constant makes stuck-detection work on day one with no query; swap for a rolling p50 from Phase 3 once there is data. Learned-first means no alerts for weeks |
| New resolver `station_step_stuck` | A resolver, not a subsystem. Feeds the existing `item_aging` evaluator |
| Alert target | The **work item at a bench**, never the operator |

**Exit criteria**
- A carton parked past its step's expected time fires exactly once, recovers when
  it moves, and does not re-fire while still breached.

---

### Phase 5 — Insight → task → retune (~1 week)

**Goal.** Close the loop natively: Detect → Suggest → Assign → Deploy → Measure.

| Piece | Reuse |
|---|---|
| Insight card | `entity_signals` + an `ops_plans` task. Zero new stores |
| Assignment | `staff_inbox_items` + `publishInboxItem` + the ⌘⇧U throw surface |
| The retune | **Widen the org override that already exists.** `receiving.unboxFlowCaptureOrder` is applied inside `resolveProcedureSteps`; extend it to carry `expectedSeconds` and required/optional per step. Tenant-tunable SOPs with no new SoT |
| AI authoring | Drafts **within** the code-declared step vocabulary — never invents a step |

**The vocabulary constraint is the moat, not a limitation.** Because
`procedure.ts` is a PR-reviewed capability declaration and `composed: true` is
CI-guarded, an AI-drafted revision structurally cannot emit a procedure the bench
has no code to run. That is the difference between this and a text file full of
suggestions.

**Full data-driven procedure versioning** (draft→publish rows keyed like
`station_definitions`) is deliberately **out of scope** until an org has actually
outgrown the override. Do not build it speculatively.

**Exit criteria**
- An insight becomes an assignable task in one click.
- Approving a tuning change lands on the bench without a deploy.
- The monitor that raised it goes quiet, and the plan task closes against a
  measured before/after.

---

## 2. End goals

**Operator.** Nothing changes at the bench. Every write in this plan is a
by-product of a scan that already happens. If a bench operator notices this
project at all, something is wrong.

**Manager.** Answers four questions in under five seconds, without walking the
floor: *is every bench working · which carton is where · what is stuck · who do I
send.*

**Product.** Cycle Forge stops being a system that records what happened and
becomes one that says what to fix. That is the line between an ops tool and an
ops platform, and it is the reason this is worth five phases.

### Success metrics

| Metric | Baseline | Target |
|---|---|---|
| Time to answer "what is bench 3 doing" | walk the floor | < 5s, from a desk |
| Query cost of the floor view | O(events) | O(benches), one indexed read |
| Added scan latency | — | 0 measurable (writes off the hot path) |
| Stuck carton → manager alerted | never (no signal) | < 2× the step's expected time |
| Insight → assigned task | manual retype | one click |
| Suggested retune → live on the bench | code change + deploy | approval, no deploy |

---

## 3. Non-goals

- **A `stations` table.** Benches are `locations` rows.
- **Operator speed scoring / leaderboards.** Dwell attaches to the work item and
  the station. This is a deliberate product decision, not an oversight.
- **A second alerting engine, search engine, or right-edge region.** All three are
  tempting when building a God-view; all three are already ruled on.
- **`station_states` as a writable domain store.** It is a cache of a derivation.
- **Local print daemon / Web Serial.** Real pain, genuinely useful, and the one
  adjacent item *not* unlocked by any of this. Separate lane.
- **Procedure versioning as data.** Phase 5's override is the cheap 80%.

---

## 4. Risks

| Risk | Mitigation |
|---|---|
| **Realtime + UPSERT cost at N benches** | Per-station channels so a tile subscribes to one; UPSERT sync, event append via `after()`; run `neon-cost-reviewer` on Phases 1 and 3 |
| **Two answers to "what step is this on"** | The cache is written from the one derivation and never read as a domain answer. Guard-pinned |
| **Phase 3 reverted by the existing ruling** | Amend `station-workbench.md` in the same PR, with the station-dwell framing recorded |
| **Monitor archetype drift** | Guard that the floor grid mounts no mutation control; the fix path is a deep-link |
| **Tiles that lie** | A bench with no binding, a stale binding, or a failed snapshot renders honest absence / `GridDegradedBox` — never a green tile |
| **Scope creep into procedure versioning** | Phase 5 widens an existing override. Full versioning needs its own ruling |

---

## 5. Sequencing

```
Phase 0 ──► Phase 1 ──► Phase 2   ← the product; ship and use it
                 └────► Phase 3 ──► Phase 4 ──► Phase 5   ← the loop
```

Phases 0–2 are worth shipping alone. Do not start Phase 3 until a manager has
used the grid for a week and can say which numbers they actually want.

**Gate on every phase:** `npm run verify` green, E2E against the QA org, no
ratchet baseline raised.
