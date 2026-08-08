# Throwable tasks — E2E proof, then scan-driven assignment (execution prompt)

**Read [`throwable-tasks-HANDOFF.md`](throwable-tasks-HANDOFF.md) first.** It is the
state of the lane. This file is the *next* job, and it is two jobs in order:

**A. Prove what exists actually works, end to end.** Nothing built so far has run
in a browser. It is unit-tested and guard-tested and completely unproven.

**B. Then build the thing the feature is actually for:** pre-assign a tracking
number, and have the **arrival scan** deliver it — *"give this to Maria for
unboxing"* — with the task closing off the scan rather than a click.

Do **A** before **B**. B builds on surfaces A is the only proof of.

| | |
|---|---|
| Lane | `/Users/icecube/repos/cycleforge-tasks` · branch `topic/tasks` · port **3160** |
| State | Phases 0–6 complete, **UNCOMMITTED**. 4 migrations **APPLIED** and therefore immutable. |
| Dev server | **Attach, never start.** The user's `:3050` is the *main* checkout and does **not** serve this lane. Starting 3160 is the user's call — ask. |

---

## 0. Three things that will bite you

1. **`npm run verify` is RED in this lane and none of it is this work.** Measured
   2026-08-08: typecheck **21**, knip **28**, lint **9 problems (3 errors)**,
   **55 `✖` test lines**. All inherited from `main` @ `aeaa12185`. Attribute every
   failure with `git diff --name-only HEAD` before assuming it is yours, and
   **never raise a baseline**.
2. **The rules files drift from the code.** This lane has caught it four times
   (`enforce_tenant_isolation` false negatives, `CompactActivityRow` documented
   but absent, the GlobalHeader zones table describing a layout that never
   existed, the Inbox "known gaps" block still claiming the Ably leg was never
   built three phases after it shipped). Treat `.claude/rules/*` as leads to
   verify, never as facts.
3. **The four applied migrations are immutable** — the runner keys
   `schema_migrations` on `(filename, sha256)`. Any fix is a **new** file.

---

# PART A — prove it works

Everything below has passing unit tests and has never been clicked.

## A1. What to exercise

| Surface | How to reach it | What "working" means |
|---|---|---|
| Throw panel | **⌘⇧U** anywhere, or spine ⋯ → **Throw a task** | Opens bottom-left; scan field autofocused |
| Resolve | Paste a QA PO number / carton handle → **Find** | A record row appears and auto-selects when there is exactly one |
| Recipient | The **Throw to…** list | Self is excluded; picking marks the row |
| Throw | **Throw** button | 201; toast names record → person; panel closes |
| Delivery | Recipient's session | Bell badge + a `work_task` row, live (no refresh) |
| Durable | Home → Inbox (`?mode=inbox`) | A `reason:'assigned'` row survives reload |
| Pace-and-next button | Header goal button | Ring face; work-order row leads its panel; panel is square-cornered |

## A2. Non-obvious things to actually check

- **Idempotency.** Double-click **Throw** (or replay the same `Idempotency-Key`).
  One task, not two. This is the wedge-double-fire case.
- **Self-throw** returns 409 and the panel says so in words.
- **A ticket task reports `notified: 'skipped_entity'`** — and the toast must say
  the recipient was *not* notified. This is not a bug (see B4); a flat success
  toast here would be a lie an operator acts on.
- **Urgency promotion is an amplifier.** Force a failure (bad entity id after
  resolve, or stub the helpdesk down) — the task must still land and report
  `urgency: 'failed'`.
- **The chord stands down inside a text field.** Focus the Unbox notes composer,
  press ⌘⇧U — the caret must stay put and the panel must not open.
- **A wedge cannot fire the chord** — scan a barcode into a non-editable page.
  Bare digits + Enter must never open the panel.
- **Closed-face honesty on the header button**: ring when a goal exists,
  clipboard glyph when there is no goal but a work order, nothing once both
  settle empty. Never a 0% ring on a day with no goal.

## A3. Write the specs on the QA org

`tests/e2e` has 165 specs to copy from; `tests/e2e/clipboard-history-chord.spec.ts`
is the closest sibling (a chord + a popover) — **read it first**.

```bash
pnpm provision:qa-org                                   # idempotent
npx playwright test <spec> --project=qa-desktop          # storage tests/.auth/qa-admin.json
```

Assert against `QA_FIXTURE_*` in `src/lib/tenancy/qa-org.ts` — **never** against
whatever the dogfood org happens to hold today. A throw needs two staff, so
check the QA org has a second active staffer and extend the fixtures if not.

**Suggested specs**
- `throw-task-chord.spec.ts` — chord opens/closes · stands down in an input · a
  wedge burst does not fire it · the ⋯ row opens the same single panel.
- `throw-task-flow.spec.ts` — resolve → pick → throw → 201 → recipient's inbox row
  (durable), on the QA org.
- `header-pace-and-next.spec.ts` — one button, three faces; panel is
  `rounded-none`; the work-order row leads.

**Deliverable for Part A:** green specs, plus a short note in the handoff of
anything that did not work — *especially* anything that unit tests said was fine.

---

# PART B — pre-assigned tracking, delivered by the scan

The target flow, in the user's words:

> someone assigns a tracking number to be unboxed → the arrival scan scans that
> tracking → it shows up on their screen: *give this to this staff member for
> unboxing*

## B1. The blocking gap, verified

**A tracking number cannot be thrown today.** Two independent reasons:

1. **`/api/scan/resolve` has no tracking → carton lookup.** Its tracking arm
   (`lookupOrdersByTracking`) joins `orders` via `shipping_tracking_numbers` and
   returns **order** matches. The only carton arms are the printed handle
   (`/m/r/{id}`) and a plain **PO number** (`lookupReceivingByPoNumber`). So
   `resolveThrowTargets` correctly yields no carton for a carrier number —
   it is not a bug in the adapter, there is nothing upstream to read.
2. **A not-yet-arrived carton has no id to point at.** `POST /api/tasks` requires
   a positive-int `entityId`, and `work_assignments.entity_id` is `BIGINT NOT
   NULL`. An inbound tracking number that has not been scanned has no
   `receiving_carton` row.

So B is **not** "wire the panel up". It is a schema + resolution decision first.

## B2. Decision to make FIRST — what does a pre-arrival task point at?

Do not start coding until this is answered and written down.

| Option | Shape | Cost | Risk |
|---|---|---|---|
| **(a) Anchor on the shipment** — `shipping_tracking_numbers.id` | `work_entity_type_enum += SHIPMENT`; widen the `staff_inbox_items.entity_type` CHECK; delete trigger on STN | one migration pair + an `ENTITY_VIEW_PERMISSION` entry | STN row must exist pre-arrival — **verify this**, it is the whole premise |
| **(b) Create the carton early** as `EXPECTED` and anchor `receiving` | no enum change; the throw panel works as-is once resolve can find it | manufactures carton rows for parcels that may never arrive; pollutes every carton count and lane | high — `delivered-unscanned.ts` already exists to clean up synthetic rows |
| **(c) A new "watched tracking" table** | its own store | — | **rejected by existing rule** — source-of-truth.md → Inbox surfaces: *do not grow a third store for task assignment* |

**Recommendation: (a).** STN is already "the tracking source of record"
(`record-scan.ts`'s own words), `shipment_links` is the established polymorphic
linkage SoT, and it keeps a task pointing at a thing that genuinely exists before
arrival. **Confirm first** that an inbound tracking gets an STN row before it is
scanned — if it only appears at scan time, (a) collapses and this needs
re-deciding, not patching.

Whatever you pick, `/api/scan/resolve` needs a **tracking → throwable target**
arm so the panel can resolve one. That arm is also what makes the feature
demonstrable.

## B3. The delivery leg — copy the precedent, do not invent one

**`/api/receiving/lookup-po/route.ts` is the arrival-scan chokepoint, and it
already does exactly this shape for a different reason.** When a door-scanned
carton matches a SKU a pending order needs, it:

- persists the durable half (`markReceivingPriority` → `receiving.is_priority` +
  `priority_lane`), and
- pushes the live half — **`publishPriorityUnbox`, called at four sites in that
  file** — which lands as the `priority_unbox` kind in `ActivityInboxContext`.

The new behaviour is the same hook at the same moment, addressed to **one named
staffer** instead of derived from stock pressure:

1. On arrival scan, look for an OPEN `FOLLOW_UP` task on that tracking/shipment.
2. **Re-anchor it** onto the carton the scan just resolved (this is the migration
   from "a tracking number" to "a carton"), and
3. Notify — reuse `assign-inbox-item.ts` + `publishInboxItem` (the Ably leg
   phase 3 built), not a fourth notification path.
4. Show the scanning operator the handoff on the station surface:
   **"Give this to <name> for unboxing."**

**Degrade-not-fail applies** (Station contract): a notification failure must
never fail the scan. The scan is the commitment; the nudge is the amplifier —
the same split `create-task-core.ts` already documents.

## B4. "Checked off on scans themselves"

Completion by scan, not by a click. Two rules before writing it:

- **`POST /api/tasks` is a sibling of `/api/assignments`, not a fork** — that
  route does find-active-and-update. Closing a task from a scan is much closer to
  *its* job; read it before adding a third path.
- **Which scan closes which task is a product decision.** Does the *arrival*
  scan close "unbox this", or does opening the carton
  (`applyUnboxCartonOpened`, the unbox-open chokepoint) close it? They are
  different moments and only one is "unboxed". Decide it explicitly and write it
  down — do not let the first hook you find decide it silently.

## B5. Ticket numbers

The panel accepts `support_ticket` and the task is created, but
**`notified: 'skipped_entity'`** — the inbox cannot anchor it. That is an
**authorization** decision, not a wiring gap: `ENTITY_VIEW_PERMISSION` would need
a `support.*` permission and **no role in `scripts/seed-roles.mjs` holds one**, so
the rows would be written visible to nobody. Ticket tasks are half-built until
someone decides which role may see a ticket. Do not "fix" it by widening the
CHECK and leaving the permission alone — that ships invisible rows.

---

## Traps already paid for

- **The migration runner wraps every file in `BEGIN/COMMIT`**, so
  `ALTER TYPE … ADD VALUE` and any *use* of that label must be in **separate
  files**. Adding an enum value is irreversible.
- **A CHECK is REDEFINED with the full union, never appended to**
  (`polymorphic-tables.md`) — `reason_codes_flow_context_chk` lost values twice
  this way.
- **Grepping migrations for `enforce_tenant_isolation('<table>')` gives false
  negatives** — bulk sweeps used DO-block loops. Check
  `pg_class.relforcerowsecurity`.
- **The carton table is `receiving_carton`**; the entity-type *string* is
  `receiving`. The mismatch is intentional.
- **node-postgres returns BIGINT as a STRING** — `Number()` it.
- **`handleType: 'receiving'` is not always a carton** — the repair short-form
  redirects to `/m/rs/{id}`, a repair id. `resolveThrowTargets` anchors on
  `^/m/r/(\d+)$`; keep any new arm as strict.
- **`/api/scan/resolve` reads `input`, not `value`.**
- **Resolve is gated `sku_stock.view`, throwing is `work_orders.claim`** — a role
  can hold one and not the other.
- **`| tail` masks a command's exit code.** Capture to a file.
- **Do not export ahead of a consumer** — knip flags it; prefer un-exporting to
  adding an ignore.

## Commands

```bash
cd /Users/icecube/repos/cycleforge-tasks

npx tsx --test src/lib/tasks/*.test.ts src/lib/urgency/*.test.ts \
  src/lib/notifications/*.test.ts src/lib/migrations/*.test.ts \
  src/components/layout/header-mode.guard.test.ts \
  src/components/quick-access/*.guard.test.ts            # 109 pass

npm run verify > /tmp/verify.log 2>&1; echo $?           # compare to §0.1
node scripts/knip-gate.mjs                                # 28 = inherited baseline
pnpm provision:qa-org && npx playwright test --project=qa-desktop
```

The lane has **no `.env`** (gitignored). DB scripts need one:

```bash
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' ../cycleforge-app/.env | cut -d= -f2- | tr -d '"')" \
  node scripts/run-pending-migrations.mjs --dry
```

Applying is the **user's** call via `/db-migrate`.
