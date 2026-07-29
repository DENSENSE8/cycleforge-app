# Revision request — Cycle Forge Home: Triage & Subscriptions plan (v2)

> **Paste this whole file to Gemini in the same session as `implementation_plan.md`.**
> This is a targeted revision, not a restart. Your v1 was independently validated against `main`
> on 2026-07-28. Two of your corrections were **confirmed and my briefing was wrong** — keep them.
> Eight defects were found; four are blocking. Produce **v2 of the same document**, same D1–D8
> structure, with the changes below applied and a short changelog at the top.

---

## 0. What you got right — keep, don't re-litigate

Verified against the repo, both of your D1 corrections stand:

- **`src/features/my-day/MyDayWorkspace.tsx:80` is the real Home body** — confirmed.
- **A per-staff realtime channel already exists** — `src/lib/realtime/channels.ts:137`
  `getInboxChannelName(orgId, staffId)` → `org:{orgId}:inbox:{staffId}`, and
  `src/app/api/realtime/token/route.ts:95` already grants `['subscribe','publish']` on the caller's
  own inbox channel. My briefing's "no per-staff channel" claim was wrong. **D4.6 needs no change.**

Also keep, unchanged:
- Deriving the event vocabulary from `ops_events.event_type` + `SIGNAL_KINDS` — do not invent a third registry (D4.2).
- Mirroring the `entity_search_outbox` → cron-worker pattern (D4.4).
- Hardcoded SLA evaluators for v1 (your Open Question) — that matches how Datadog Monitors and
  PagerDuty rulesets both evolved. **But see §7 for the one amendment.**
- Building in-house rather than adopting Knock/Courier (your User Review item) — accepted. The
  realtime half already exists and a vendor would duplicate the tenant boundary. Keep **email
  digest** swappable behind `src/lib/email/send.ts`; that is the one seam where buy may later win.

### 0.1 One correction to your correction

You concluded *"compose over `MyDayWorkspace` rather than rebuilding a new `features/home`."*
That framing is wrong. `src/app/page.tsx:3` mounts `HomeWorkspace` from `@/features/home`, which
renders `<MyDayWorkspace/>` **only for `mode === 'today'`** (`HomeWorkspace.tsx:57`). So
`features/home` is the live shell and owns the mode rail — which is exactly where a new Inbox tab
must be registered (`src/features/home/home-modes.ts`). Your separate claim that `TaskInbox.tsx` is
orphaned is true and unrelated. Fix this framing in D1.

### 0.2 The fact you missed that breaks your Phase 3

**`/` is parked.** `src/app/page.tsx:26–29`: unless `isParkedSurfaceLive()` (`DOGFOOD_FULL_SURFACE`)
is set, bare `/` **redirects to `/dashboard`**; only `?welcome=1` or an explicit `?mode=` reaches
Home. Your Phase 3 therefore ships a surface nobody lands on. Add the un-park decision (nav re-add +
redirect removal) as an explicit prerequisite with an owner and a phase.

---

## 1. BLOCKING — model all three subscription kinds

Your D4.1 declares three kinds. **Your D4.3 schema models one.** The two missing kinds are the
entire reason this project exists — *"notify me on every unbox update for SKU `LEN-T480-i5`"* and
*"notify me when a carton is delivered but not received within 24h"* are both unbuildable on
`staff_subscriptions` as written, because that table can only answer "who watches this exact row id."
It structurally cannot express a predicate.

Rewrite D4.3 as **one discriminated table**, not three tables:

```
subscription_kind   CHECK IN ('entity','rule','sla')
entity_type/entity_id     -- NOT NULL only when kind='entity'
match_event_keys    TEXT[]   -- which notifiable event keys this sub cares about
match_sku           TEXT     -- promote queryable business facts to REAL COLUMNS
match_platform      TEXT
match_station       TEXT
match_severity_min  SMALLINT
sla_event_key       TEXT     -- kind='sla': the arming event
sla_breach_after    INTERVAL
sla_resolve_event_key TEXT   -- the event that disarms it
```

Justify the real-column choice explicitly against `polymorphic-tables.md` ("promote queryable
business facts to real columns; keep only true variant config in jsonb") — and note the operational
reason: real columns let the fan-out worker do **one indexed join** instead of evaluating N jsonb
predicates in application code per event.

Then propagate the three kinds through D4.4 (worker join), D5 (API shape), D6, and D7 — right now
all four sections only implement the entity case.

---

## 2. BLOCKING — the DDL violates `polymorphic-tables.md` in six places

That doc is a hard rule, not a style guide. Re-issue the DDL fixing all six:

| # | Defect in v1 | Required |
|---|---|---|
| 1 | `entity_id TEXT` | **BIGINT.** Your stated rationale ("like `ops_events`") is unverified — check the column; `entity_signals.entity_id` is `bigint`. TEXT also destroys index selectivity. |
| 2 | **No parent-delete integrity at all** | The contract says "pick one, don't ship neither": a real FK, **or** a trigger family — one `CREATE TRIGGER` per parent the discriminator can name, sharing one `TG_ARGV[0]`-dispatch function. Your CHECK names 6 parents with 0 triggers. This is **verbatim the `work_assignments` bug that rules doc calls out by name** (5 enum values, 2 triggers, 3 silently dead for months). Also `staff_id INT NOT NULL` has no FK — `staff_messages` uses `REFERENCES staff(id) ON DELETE CASCADE`; match it. |
| 3 | `SELECT enforce_tenant_isolation(...)` | `PERFORM` inside `DO $$ … IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='enforce_tenant_isolation') … END $$;` |
| 4 | No `CREATE TABLE IF NOT EXISTS`, no `BEGIN`/`COMMIT`, no `DO $$ … EXCEPTION WHEN duplicate_object` guard on the CHECK | Use the canonical skeleton verbatim — migrations are idempotent by contract |
| 5 | `is_active BOOLEAN DEFAULT true` | **Design flaw, not style.** Combined with your Phase 2 auto-subscribe, a boolean cannot distinguish *never subscribed* from *explicitly muted* — so the auto-subscriber re-subscribes a user to the entity they just muted, on their next action. GitHub uses three states (`subscribed`/`ignored`/none); Jira makes explicit watcher removal block auto-add. Use `state CHECK IN ('subscribed','auto','muted')`. |
| 6 | No `reason` column | GitHub's `reason` (`assigned`/`mentioned`/`subscribed`/`state_change`/`manual`) is what makes an inbox row explainable and is the primary per-category mute axis. Cheap now, expensive to backfill. |

Keep what was already correct: `organization_id UUID NOT NULL` with no DEFAULT, org-led indexes, named CHECK.

---

## 3. BLOCKING — do not reuse `staff_messages` as the delivery ledger

I read `src/lib/migrations/2026-06-13_staff_messages.sql`. It cannot carry this load:

- `sender_id INTEGER NOT NULL REFERENCES staff(id)` — system notifications have **no sender**.
- `body TEXT NOT NULL` + `CHECK (length(btrim(body)) > 0)` — forces **prerendered text at write
  time**, so a row goes stale when the entity changes. GitHub, Linear, and ActivityStreams 2.0 all
  store a structured `(actor, verb, object, target)` reference and render at read.
- **No entity anchor columns** (only `context JSONB`) — so "all inbox rows for carton 4412" is
  unindexable, which makes your own D4.4 collapse design unimplementable.
- **No dedupe key** — at-least-once worker + no unique key = duplicate notifications on every retry.
  Violates the house `client_event_id` discipline (`backend-patterns.md`) and is the single most
  common outbox bug. PagerDuty's `dedup_key` exists for exactly this.
- **No snooze column** — your D4.8 promises "Snooze (hides for 24h)"; `read_at` + `archived_at`
  cannot express it.
- **Unread and Done are conflated** — your own D2 verdict is *"Separate Done from Unread/Active."*
  That needs three states; this table has two. v1 contradicts itself here.
- Hot index `idx_staff_messages_recipient_inbox (recipient_id, created_at DESC)` is **not org-led**.
- Its RLS came from the wave-2 **backstop** (`2026-06-27b_enforce_tenant_isolation_backstop_wave2.sql:57`),
  not tenant-from-birth.

**Required:** a new `staff_inbox_items` table, tenant-from-birth and org-led, carrying at minimum
`(organization_id, staff_id, subscription_id, entity_type, entity_id, event_key, reason,
collapse_key, dedup_key UNIQUE, state CHECK IN ('unread','read','done','snoozed'), snoozed_until,
occurred_at)`. Leave `staff_messages` as the human-DM store it was designed to be — two genuinely
different jobs get sibling tables, which `AGENTS.md` explicitly permits ("two shapes for two
genuinely different jobs is correct").

---

## 4. BLOCKING — the permission check leaks

D4.7 labels the worker check "read-time." **It is write-time** for the inbox row. If a staffer's
permission is revoked *after* delivery, the rows persist and remain visible — the exact leak the
section claims to prevent.

GitHub filters notifications at **render**. Require **both**: the worker as a cheap prefilter, and
`GET /api/inbox` as the authoritative gate against `src/lib/auth/permission-registry.ts`. Name the
specific permission ids per entity type.

---

## 5. Fan-out pipeline — right shape, four missing pieces

Keep the trigger → outbox → cron-worker design. Add:

1. **Fix the label.** You wrote *"Fan-out on Read/Cron"* but described inserting one row per
   recipient — that is **fan-out-on-write**. The cost model is inverted. For 5–50 staff per tenant
   fan-out-on-write is the right call; just name it correctly and justify it at that scale.
2. **Claim window.** The reference implementation has `claimed_at` + `attempts` +
   `FOR UPDATE SKIP LOCKED` (`2026-07-04a_search_outbox_claim_window.sql:44`,
   `src/lib/search/search-outbox-worker.ts`). Without it, overlapping cron runs double-deliver.
3. **Where does "notifiable" live?** You wrote the trigger fires "only if the event type is flagged
   as notifiable" without saying where the flag lives. A DB-side list drifts from the code SoT.
   Require a **pinning test** asserting the DB list matches the code list — the same discipline
   `ops-events.test.ts` applies to `OPS_EVENT_ENTITY_TYPES`, and the search-outbox migration header
   applies to its column lists.
4. **Concrete collapse key.** "5 unbox events on 1 carton = 1 notification" is aspirational until you
   name the key and window. Specify something like
   `collapse_key = {entity_type}:{entity_id}:{event_family}`, a ~60s window, newest-wins with an
   `n×` count. **Model the worse case you skipped:** a *rule* subscription on a SKU matches every
   line of a 200-line PO receive, so the collapse must key on the **carton**, not the line.

---

## 6. Rebuild D3 (information architecture)

D3 is currently four table rows and one line of URL contract. The briefing asked for substantially
more. Add:

- **`pickArchetype()` Q1→Q4 reasoning per region** — you declared the entire Home a Workbench without
  running the discriminator.
- **A Monitor region.** You dropped the org-wide rollup entirely, but "overall to-do list" is in the
  product ask. Per `contextual-display.md` a page may host several contracts, one per region — so
  Home should be a Workbench triage region **plus** a Monitor rollup region composed from
  `@/design-system/components/monitor` (`KpiStrip` / `SectionCard`), not a second `/operations`.
- **Typed states**: first-use vs no-results vs errored vs no-permission (you only covered empty).
  Use `EmptyState` — it exists at `src/design-system/primitives/EmptyState.tsx`.
- **Motion**: name the single region that crossfades (`motion-crossfade.md` requires exactly one);
  the collection map must not.
- **Mobile/floor variant** (`src/app/m/`) and a note on the wall TV — `/operations?tv=1` already
  exists; do not duplicate it.
- **Density per tab**, argued, not all `ops` by default.
- **A param-ownership table**: which tab owns which param, what clears on switch, how a deep link
  reproduces a view.

**And fix a breaking change you didn't flag.** The shipped rail is
`HOME_MODE_ITEMS = today | tasks | collab | forge | brief` (`src/features/home/home-modes.ts`).
Your D3 proposes `Today | Inbox | Tasks | Collab`, silently dropping `forge` and `brief` — but
`src/app/page.tsx` deep-links `?mode=` specifically so `/forge → /?mode=forge&view=live` lands, and
`HomeWorkspace.tsx` renders that console. Either keep them or state the migration explicitly.

**Resolve the tension in your own D2.** You reject customizable views because "operators need muscle
memory" — yet per-staff subscriptions *are* per-user views. State the resolution: a **fixed tab set**,
with user-defined subscriptions acting as **filter chips feeding the fixed Inbox tab**, not as saved tabs.

---

## 7. Rebuild D2 (industry comparison)

Four products, no citations, no scoring. It omits exactly the references that would have fixed your
own gaps. Add, with citations, and score as a matrix:

| Add | What it fixes in your plan |
|---|---|
| **PagerDuty / Opsgenie** | `dedup_key` + alert grouping windows → the §5.4 collapse gap; routing rules + escalation → SLA design |
| **Novu / Knock / Courier** | The preference matrix (category × channel × frequency), digest windows, quiet hours — D4.5 has none |
| **ActivityStreams 2.0** | `(actor, verb, object, target)` — the exact ledger shape §3 says you're missing |
| **Slack batching · Jira watchers** | Batching windows; explicit watcher removal that survives auto-add (the §2 defect #5 bug) |

Then extend D4.5 and D8: your only fatigue mitigations are "debounce + unsubscribe." Industry
standard also requires **per-category frequency**, **quiet hours**, **priority tiers** (only SLA
breaches may interrupt), and a **default-off posture for rule subscriptions** — one bad rule floods
an operator.

**Amendment to your Open Question answer:** hardcoded SLA evaluators for v1 is correct — but ship the
`kind='sla'` rows in the table from day one, so v2's user-authored rules are a UI change rather than
a migration.

---

## 8. D5 / D6 / D7 fixes

**D5** — add, all explicitly required by the briefing and all currently absent: the
`permission-registry.ts` ids you're introducing, the matching `route-permission-manifest.test.ts`
rows, `after()` for side-effects, `Deps` injection so domain helpers test DB-free, `clientEventId`
idempotency on `POST /api/subscriptions`, and the 409 mapping.

**D6** — one row is a category error: *"Inbox Row composes `ActivityInboxContext` + `TimelineSection`."*
`ActivityInboxContext` is a React context (`src/contexts/ActivityInboxContext.tsx`), not a row
primitive; `TimelineSection` is the read-only history block, not an actionable row. Correct
composition: house one-row anatomy + `RowMetaColumns` + `CopyChip` family + `HoverTooltip` — or
`LedgerGrid` via `useGridSurface` if it is genuinely a grid. Re-verify every other row the same way:
open the file before naming it.

**D7** — Phase 1 (DB + pipeline + APIs, no UI) delivers zero user value and violates the briefing's
"Phase 1 must be shippable on its own." Re-cut as **one entity type, end-to-end**: subscribe toggle
on cartons → outbox → worker → inbox list, behind a per-org flag via `resolveForOrg()` (the repo's
staged-rollout helper — you named no flag at all). Also add: per-phase rollback, the `/` un-park
prerequisite from §0.2, and an **injectable clock in the SLA evaluator's `Deps`** — without it your
Phase 4 "time-travel simulation" E2E cannot be written.

---

## 9. Output requirements for v2

- Same D1–D8 structure. Lead with a **changelog** listing each item above as applied / rejected —
  and if you reject one, argue it; do not silently drop it.
- **Cite file paths and line numbers** for every claim about current code, and say which files you
  actually opened. Where you infer, mark it as inference.
- Decision tables over prose.
- Every "don't" paired with a concrete "do X instead."
- Keep the closing **Compound opportunities** block in the house format.
- Flag remaining ambiguity as an open question **with a recommended default**, not a silent choice.
