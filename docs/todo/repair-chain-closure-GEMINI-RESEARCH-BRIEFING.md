# Repair chain closure — scan-in → work → scan-out → money → ticket

**Type:** research briefing (the **question**, not the answer — see the convention note below)
**Created:** 2026-07-29
**Author:** ground-truthed against the working tree at `22f3d6bda` + uncommitted lanes
**Sibling:** [`kiosk-sales-intake-GEMINI-RESEARCH-BRIEFING.md`](./kiosk-sales-intake-GEMINI-RESEARCH-BRIEFING.md) → answered by [`kiosk-counter-transaction-PLAN.md`](./kiosk-counter-transaction-PLAN.md)

> **Convention.** In this repo a `*-GEMINI-RESEARCH-BRIEFING.md` is the **question document**: verified
> ground truth + the open decisions, written so a deep-research run can answer it. The resulting
> `*-PLAN.md` is the **answer and the SoT**. That pairing worked on the intake half; this briefing is
> the same instrument pointed at the **release half**.
>
> **Read `kiosk-counter-transaction-PLAN.md` §0 first.** The last research run marked seven claims
> "High (Verified)" and **two were wrong**, both because a stale *code comment* was treated as
> evidence about the *database*. Every claim below is tagged with how it was verified. Do not
> re-derive from prose.

---

## 0. The request, decomposed

> "on pick of repair services on a product scan to be scanned out on pick up then the sales
> transaction via square would be linked in the system all connected via ticket #, SKU product,
> customer, who repaired it what was repaired and $ and linking the square transaction id … and then
> updating the ticket with what was picked up on what date and time and what was paired"

That is **one chain with seven joins**. Splitting it into the joins is what makes it tractable, because
they are in wildly different states — three are live, two are built-but-unlanded, and two do not exist:

| # | Join | State |
|---|---|---|
| J1 | product **scan** → repair-services pick | ⚠️ pick exists, **scan entry does not** |
| J2 | picked services → **$ per service** | ❌ **lossy at the write boundary** |
| J3 | repair → **who repaired it / what was repaired** | ✅ live (`repair_actions`) — but no money, not in Drizzle |
| J4 | repair → **scan-out at pickup** | ✅ live (`/api/repair-service/pickup`) |
| J5 | pickup → **Square transaction id** | ❌ **does not exist** |
| J6 | visit → **ticket # / customer / SKU** | 🔨 built, uncommitted, migrations unapplied |
| J7 | pickup → **ticket reply** (what/when/who) | ❌ **does not exist** — capability does |

**The headline:** this is not a greenfield build. The two hardest pieces — a durable ticket-work
outbox and a transaction header that joins a Square receipt to a repair work record — are **already
written and tested** in the uncommitted counter lane. The chain breaks at the **release** end, and
the single most damaging break is J2, which destroys data the operator already typed in.

---

## 1. Ground truth — what exists

### 1.1 Intake half — BUILT, uncommitted, migrations UNAPPLIED

*Verified: `git status --short`, file reads, `wc -l`.*

| Artifact | Path | Notes |
|---|---|---|
| `counter_transactions` | `src/lib/migrations/2026-07-29d_counter_transactions.sql` | **untracked**; header joining an optional `square_transactions` receipt to an optional `repair_service` work record. Carries `customer_id`, `support_ticket_id`, `prior_order_ref`, `staged_square_order_id`, `subtotal_cents`, `total_cents`, `status`, `client_event_id` |
| `ticket_work_outbox` | same migration | `CREATE_TICKET \| ATTACH_TICKET \| POST_REPLY` × `REPAIR \| RECEIVING \| RECEIVING_LINE \| SHIPMENT \| ORDER`, claim → attempts → dead-letter |
| Orchestrator | `src/lib/counter/submit-counter-transaction.ts` (529 L) + 500 L of tests | composes `submitRepairIntake` unmodified; `stageSquareOrder` stages and **never charges** |
| Form | `src/components/counter/CounterIntakeForm.tsx` (531 L) | |
| Priced projection | `src/lib/repair/catalog-projection.ts` + `2026-07-29e_platform_listings_price_projection.sql` | local priced mirror on `platform_listings.listing_price_cents`; exists because a cold vendor catalog walk is ~16 s |
| Repair as ticket anchor | `src/lib/support/ticket-link.ts:51-52` | `{ type: 'repair'; repairId: number }` — plan **D6 is done** |

**Both migrations (29d, 29e) are untracked files and per project memory are UNAPPLIED.** Everything
in §1.1 is therefore dark. Any plan that answers this briefing must state its dependency on that
lane landing rather than duplicating it.

### 1.2 Work half — LIVE

*Verified: migration DDL read, route reads, writer grep.*

**`repair_actions` is the answer to "who repaired it / what was repaired", and it already exists.**
This is the finding most likely to be missed — the table is **absent from
`src/lib/drizzle/schema.ts`**, so a schema-first reader concludes there is no home for repair work.

```sql
-- src/lib/migrations/2026-05-19_repair_actions.sql
repair_actions (
  id, repair_id → repair_service(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL,   -- validated app-side by VALID_ACTION_TYPES
  part_name, old_sku, new_sku, old_serial, new_serial,
  duration_min  INTEGER,
  notes,
  staff_id      → staff(id),
  created_at, deleted_at         -- soft delete
)
```

- Writers: `src/app/api/repair/actions/route.ts`, `.../actions/[id]/route.ts`
- Readers: `src/app/api/repair-service/print/[id]/route.tsx` ("Internal Use" block on the paper), mobile `/m/rs/[id]`
- Org-scoped + FORCE RLS: listed in `2026-06-22e_enforce_tenant_isolation_core_usav_fallback.sql`
- Per-tech reporting index already present (`idx_repair_actions_staff_id`)
- **No money column** — `grep 'cents\|price'` over the route returns nothing

`work_assignments` (`schema.ts:1808-1836`) carries the coarser attribution: `assigned_tech_id`,
`completed_by_tech_id`, free-text `repair_outcome`, plus `ux_work_assignments_active_entity`
guaranteeing one active row per `(entity_type, entity_id, work_type)`.

### 1.3 Release half — LIVE

*Verified: full read of `src/app/api/repair-service/pickup/route.ts`.*

`POST /api/repair-service/pickup` — `withAuth(..., { permission: 'repair.pickup_sign', feature: 'repair' })`:

1. Resolves the repair from a scan (`RS-125` / `125` / a ticket #) **or** an explicit `repairId`, `FOR UPDATE`
2. `status = 'Done'`, appends `status_history`, stamps `pickup_signed_at` + `pickup_staff_id`
3. Closes the active `REPAIR` `work_assignments` row (or back-fills a DONE one)
4. Uploads the signature PNG to blob, inserts `documents` (`document_type='pickup_agreement'`) **inside the same transaction**, so an upload failure rolls the status back
5. Records an explicit signature **refusal** (`declinedReason`) as its own document row
6. `invalidateCacheTags(['repair-service'])` + `publishRepairChanged(...)`

UI: `src/components/repair/RepairPickupFlow.tsx` (223 L), sign → receipt, re-openable when already Done.

**This is a well-built scan-out.** J4 is genuinely done and should not be rewritten.

### 1.4 Money — LIVE, and thinner than it looks

*Verified: DDL read of `2026-04-07_create_square_transactions.sql` + header of `2026-07-29a`.*

`square_transactions` mirrors Square orders: `square_order_id` (**globally** UNIQUE),
`square_payment_id`, customer name/email/phone, `line_items` JSONB, `subtotal`/`tax`/`total`/`discount`
in cents, `payment_method`, `receipt_url`, and — already in the vocabulary —
`order_source DEFAULT 'walk_in_sale'` with `'repair_payment'` a declared value.

`2026-07-29a_square_transactions_tenant_contract.sql` is the model for how to write a migration here:
it states the live DB shape it verified, marks steps 1–2 as replay-only no-ops, and names the one
genuinely outstanding follow-up (the upsert still conflicts on the **global** unique, which under
FORCE RLS is a hard failure for a second tenant rather than a merge). The composite unique is added
alongside; the legacy drop is the separate `.gated` contract migration.

Payment link today: `src/app/api/repair/square-payment-link/route.ts`. Webhook: `src/app/api/webhooks/square/route.ts`.

---

## 2. The breaks — where the chain parts

### G1 · Pickup tells the ticket nothing *(J7)*

`grep -c 'addComment\|getHelpdeskProvider\|enqueueTicketWork'` over the pickup route → **0**.

The route *reads* `repair_service.ticket_number` and returns it in the response, then never uses it.
The customer's ticket is the only surface they can see, and it is silent on the single event they
care most about.

Everything needed is present: `HelpdeskProvider.addComment` (`src/lib/integrations/helpdesk/types.ts:104`,
Zendesk adapter at `zendesk-adapter.ts:39`) and `ticket_work_outbox` with a `POST_REPLY` work type.
**This is a composition, not new infrastructure** — and it must go through the outbox, not a
fire-and-forget call, for the reason the outbox's own schema comment gives: `submit-repair-intake.ts`
wraps its ticket call in a log-and-continue `catch`, which produced repairs with `ticket_number = NULL`,
no retry, and no reconciliation surface.

### G2 · Pickup captures no Square transaction *(J5)*

There is no `square_transaction_id` or `counter_transaction_id` on the pickup write path. The
`counter_transactions` header (§1.1) links the **intake** visit. The overwhelmingly common retail
pattern for high-value service — deposit at intake, **balance due at pickup** — has no home at all:
no second staged order, no link from the release event to the payment that released it.

`order_source = 'repair_payment'` shows this was anticipated.

### G3 · Money is destroyed at the write boundary *(J2)* — **the most damaging break**

*Verified: read of `ProductSelector.tsx` + grep of `submit-repair-intake.ts`.*

`ProductSelector` (`src/components/repair/ProductSelector.tsx`) maintains
`selectedItems: { id, name, price, sku }[]` — **N services, each already carrying its own SKU and
price**. On confirm it calls:

```ts
onSelect({ type: rootName, model, sourceSku: deriveSourceSku(items) })
```

and `submitRepairIntake` persists (`submit-repair-intake.ts:91-93, 149-154`):

```ts
const normalizedPrice     = String(price || '').trim();   // ONE text price
const normalizedSourceSku = String(product?.sourceSku || '').trim();  // ONE sku
```

So: **N priced services collapse into one `TEXT` price and one SKU string.** The per-service breakdown
the operator selected is never written anywhere. `repair_service.price` is `TEXT`, not cents. The
kiosk compounds it — `buildInitialFormData` in `src/components/repair/repair-intake-logic.ts` seeds
`price: initialData?.price || '130'`, a hardcoded default.

**Consequence for this request:** "what was repaired and $" is **not reconstructable from the database
today** — not for a receipt, not for a ticket reply, not for revenue-per-service reporting. And
`repair_actions` (which records what the tech *did*) has no money column either, so neither the
**quoted** side nor the **performed** side carries structured money.

This also means the request cannot be satisfied by wiring alone. It needs a schema answer.

### G4 · No scan entry to the service picker *(J1)*

`ProductSelector` is **browse + text search** — category breadcrumb trail, `showAllProducts`
toggle, `p.name.includes(q) || p.sku.includes(q)`. There is no barcode/scan path into it, and
`src/components/layout/GlobalDesktopSkuScanner.tsx` has **no repair branch** (`grep -c repair` → 0).

The user's phrasing — "on pick of repair services **on a product scan**" — asks for the scan to
*seed* the picker: scan the customer's device or a service barcode, get the applicable services
pre-filtered. The pick half exists; the scan half is absent.

Relevant house constraint: the scan-hotkey SoT (`src/lib/scan-hotkey/store.ts`, default **F2**,
last-registered-target-wins) and `.claude/rules/display/station.md` — a scan surface is a **Station**
region and must not grow a browse list competing with scan focus. A repair-services picker driven by
a scan is a legitimate Station-with-a-fact-stack; bolting a scanner onto the existing browse grid is
the anti-pattern that doc opens with.

### G5 · The pickup write is unaudited

`grep -c 'recordAudit'` over the pickup route → **0**.

`.claude/rules/backend-patterns.md` puts `await recordAudit(...)` in the required route skeleton. This
write takes a **legal signature**, closes a work assignment, and is about to become money-adjacent
(G2). It is the last write in the repo that should be missing from `audit_logs`.

### G6 · Repair status is free text and bypasses the state machine

`REPAIR_STATUS_OPTIONS` (`src/lib/neon/repair-service-queries.ts:45`) = `'Pending Repair'`,
`'Awaiting Pickup'`, … ; `REPAIR_DONE_TAB_STATUSES` (`:60`) = `['Done', 'Picked Up', 'Shipped']`.

The pickup route writes `status = 'Done'` — while `'Picked Up'` exists as a **separate** status in the
same vocabulary. **Two spellings of one fact**, decided by which writer ran. There is no CHECK
constraint on the column, and the write is a raw `UPDATE`, not `transition()`.

`AGENTS.md` hard law: *"Status changes only via `transition()` — never a raw `UPDATE … current_status`."*
Whether `repair_service.status` is in scope for that law (it is not `serial_units.current_status`) is a
**real open question**, not an obvious violation — see Q4.

### G7 · Drizzle models are stale — the same defect class the last run got burned by

- **`repair_actions` is entirely absent** from `schema.ts` despite being live, org-scoped, and having two API routes.
- **`repair_service` carries no `orgIdCol()`** in its pgTable (`schema.ts:1877-1903`) despite the live table being org-scoped under FORCE RLS (`2026-06-22e`, `2026-06-14_org_id_phase_b_domain_children.sql:33`).

This is precisely the `sku_catalog` staleness that `kiosk-counter-transaction-PLAN.md` §0 flagged, and
it is why **§0's warning must be honored**: a reader who trusts `schema.ts` will conclude
`repair_service` has a tenancy hole (it does not) and that repair work has no structured home (it does).
House rule from `.claude/rules/polymorphic-tables.md` point 8: model it in Drizzle in the same PR.

### G8 · Two repair work models, and the richer one cannot serve customers

`unit_repairs` (`schema.ts:3274-3292`) has exactly the shape this request wants —
`partsUsed` JSONB, `laborMinutes`, `costCents`, `startedByStaffId`, `completedByStaffId`, cross-links to
`REPAIR_STARTED`/`REPAIR_COMPLETED` inventory events, plus `repair_failure_resolutions` → `failure_modes`
for structured "what was wrong".

But `serialUnitId` is **NOT NULL** → inventory units only. The `repair_service` schema comment
(`schema.ts:1886-1888`) states the split deliberately: *"`repair_service` is the customer-repair domain,
**NOT** a consolidation onto `unit_repairs`."* A nullable `repair_service_id` bridge column exists on
`unit_repairs`.

So the codebase has a well-modeled repair record with cost and labor that is **structurally unavailable**
to customer-owned devices, and a customer-repair record with a `TEXT` price. Whether to bridge, mirror,
or keep them separate is the central schema decision this briefing needs answered (Q1).

---

## 3. What a plan must decide

Ordered by blast radius. **Q1 and Q2 are the ones that need research; the rest are mostly mechanical.**

### Q1 — Where does per-service money live? *(blocks G3, G2, J2)*

The chain needs **two distinct money facts** and today has neither structurally:

- **Quoted** — the N services the customer picked, each with SKU + price, at intake
- **Performed** — what the tech actually did (`repair_actions`), and what it cost

Candidate shapes:

| Option | Sketch | Tension |
|---|---|---|
| **A** — line-item child of `repair_service` | new `repair_service_lines (repair_id, sku, name, unit_price_cents, qty, kind)` | a third repair table; but it is the only one that matches what `ProductSelector` already produces |
| **B** — money columns on `repair_actions` | add `price_cents` / `billable` | conflates quote with work performed; `repair_actions` is a tech log, not a bill |
| **C** — lean on `counter_transactions` + Square `line_items` | the receipt is already itemized | Square is authoritative for **money** but the projection doc says it is authoritative for money *at charge time* — a staged/unpaid or cash visit has no receipt, and pre-payment quoting still needs local lines |
| **D** — bridge to `unit_repairs` | relax `serial_unit_id`, use `cost_cents` | contradicts an explicit, documented design decision (§G8); ask-first |

Note the existing precedent: `platform_listings.listing_price_cents` was chosen as the **price home**
in the counter plan (D3) precisely because sell price is per-channel and `sku_catalog` is identity.
A service's *quoted* price on a specific visit is neither — it is a transaction fact.

**Also settle:** `repair_service.price` is `TEXT`. Migrate to `price_cents INTEGER`, or leave it as a
legacy display field and make the new lines authoritative? (Expand/contract, per `2026-07-29a`.)

### Q2 — What is the release event, as a record? *(blocks G2, G6, J5)*

Today pickup is a **mutation of `repair_service`** (status + two timestamps + a document). The request
wants it to be a **linkable event** — something a Square transaction id, a ticket reply, and a set of
released items can all point at.

- Does pickup get its own row (a second `counter_transactions` with `status='paid'`? a
  `repair_releases` table?), or does it stay columns-on-`repair_service` plus links?
- Deposit-at-intake + balance-at-pickup means **one repair can have two Square transactions**. A single
  `square_transaction_id` column cannot express that. `square_transactions.counter_transaction_id`
  (added by 29d) already points the right way — the header can fan out to N receipts.
- Cash pickup produces **no** Square transaction. The link must be optional, and "paid" must not be
  inferred from its presence.

### Q3 — What exactly does the ticket reply say? *(J7)*

The request names the payload: *what was picked up, date + time, what was repaired*. Constraints that
shape it:

- **Via the outbox** (`POST_REPLY`), never a direct call (§G1's rationale)
- **Public vs internal.** `repair_actions` records `old_serial`/`new_serial`/`part_name` — internal detail.
  The customer-visible reply and the internal note are different documents. `HelpdeskProvider.addComment`
  takes options; the Zendesk internal-note path already exists elsewhere (see
  `receiving-photo-internal-note` precedent).
- **Vendor-noun ban.** `AGENTS.md` + `.claude/rules/source-of-truth.md`: operator/customer copy uses
  `capabilityNoun` / `connectedProviderLabel`, never a hardcoded "Zendesk"/"Square" sentence.
- **Civil day vs instant.** "what date and time" must use `src/utils/date.ts` — `formatDateTimePST` for
  the instant; never a bare `toLocaleDateString()` (`date-civil.guard.test.ts` enforces this).
- Idempotency: a re-opened pickup (the flow explicitly supports re-printing) must not post a second reply.
  The outbox's `ux_ticket_work_outbox_pending` partial unique is the lever.

### Q4 — Is `repair_service.status` inside the `transition()` law? *(G6)*

The hard law names `serial_units.current_status`. `repair_service` is a different machine with its own
`status_history` JSONB. A plan must either (a) bring it under `transition()`/`applyTransition()`,
(b) give it a named CHECK + a small dedicated transition helper, or (c) explicitly scope it out and say
why. What is **not** acceptable is the status quo: free text with two live spellings of "released".

Minimum viable fix regardless: pick one of `'Done'` / `'Picked Up'` and add the CHECK.

### Q5 — Scan-driven service pick: which region contract? *(G4, J1)*

Scanning a *product* to get *services* means resolving a scanned identifier → SKU → applicable service
listings. Open:

- What is scannable — the customer's device serial, a printed service barcode, an internal SKU label?
  `detectStationScanType` (`src/lib/station-scan-routing.ts`) classifies `TRACKING | SERIAL | FNSKU | SKU | REPAIR | COMMAND`; `REPAIR` already exists as a class (`RS-#` shape).
- Does the projection support "services applicable to SKU X"? The projection carries
  `categoryExternalIds` and the repair-root filter (`filterRepairRootProducts`), but a *device → services*
  mapping is a different relation. Does one exist, or is this a new join?
- Station vs Workbench: per `.claude/rules/display/station.md` Q1, scanner-driven ⇒ Station. The counter
  intake form is a 4-step Workbench-ish form. **Which region owns the scan** decides whether this is a
  new surface or a seeded field on an existing one.

### Q6 — Sequencing against the unlanded counter lane

`counter_transactions` + `ticket_work_outbox` are the natural spine for J5/J6/J7, and they are
**uncommitted with unapplied migrations**. Does the release work:

- **(a)** depend on that lane landing first (cleanest, but blocked on someone applying 29d/29e), or
- **(b)** ship the release half against `repair_service` + `square_transactions` alone and adopt the
  header later (unblocked, risks a second integration seam), or
- **(c)** land 29d/29e as part of this work?

Note the memory-recorded caution: *phase docs lag the live DB — ground-truth first.* Whichever path a
plan picks, it must verify applied state against the live database before writing DDL, exactly as
`2026-07-29a`'s header does.

---

## 4. Non-negotiable constraints (any answer must satisfy these)

From `AGENTS.md` and `.claude/rules/*` — these are the rails, not preferences:

- **Tenancy.** `orgId` from `ctx`, never the body; org-scoped writes via `withTenantTransaction`. New tables:
  `organization_id UUID NOT NULL` with **no DEFAULT in raw DDL** + `enforce_tenant_isolation('<t>')` in the
  **birth** migration. Org-led indexes (`(organization_id, …)`), never a global unique on the natural key —
  the exact bug `2026-07-29a` is still unwinding on `square_transactions`.
- **Polymorphic contract.** `.claude/rules/polymorphic-tables.md`: named CHECK discriminator (not free text),
  `entity_type`/`entity_id` naming, BIGINT ids, parent-delete integrity via a real FK **or** a
  dispatch-on-`TG_ARGV[0]` trigger family — *never neither* — and modeled in Drizzle in the same PR.
- **`ON DELETE SET NULL`, not CASCADE, on the transaction links.** Plan §3's rationale: *a signed
  agreement must survive its transaction header.* The pickup signature is a legal record.
- **Route skeleton.** `withAuth(handler, { permission })` → validate → **domain helper** → 404/409/200 →
  `recordAudit` → `after()` for side-effects. Business logic in `src/lib/**`, never inline in the route.
- **Kiosk never charges.** Plan D4 — payment completes on a physical Terminal or behind a staff PIN
  step-up. No card data in-app, ever. A balance-due-at-pickup design must respect this.
- **Facades, not vendors.** Square via the capability facade (`squareFetchForOrg`), helpdesk via
  `getHelpdeskProvider`. No vendor imports in product code, no vendor nouns in customer copy.
- **Idempotency.** `clientEventId` threaded through mutations; `counter_transactions.client_event_id` is
  the whole-transaction anchor. A double-scan at pickup must be a no-op.
- **Compose, don't fork.** `submitRepairIntake` is composed unmodified by the counter orchestrator —
  hold that line for any release orchestrator. Two device-authed write paths for one visit is the fork
  D5 exists to prevent.
- **`npm run verify`** before done; **never raise a ratchet baseline** to pass.

---

## 5. Suggested shape of the answer

Not a prescription — the research run should feel free to restructure — but the seams suggest:

| Phase | Content | Gates |
|---|---|---|
| **P0** | Ground-truth the live DB (applied migrations, `repair_service`/`repair_actions` real columns, RLS state). Fix the Drizzle models (G7). Add the status CHECK, pick one release spelling (G6 minimum). | none — pure de-risking, and it prevents the §0 class of error |
| **P1** | **Money model** (Q1). Migration + Drizzle + backfill story for `price` TEXT. | needs Q1 answered |
| **P2** | **Release event** (Q2) — the linkable record, `recordAudit` on the pickup route (G5), Square link (J5/G2). | P1 |
| **P3** | **Ticket write-back** (Q3) via `POST_REPLY` outbox; public reply + internal note split. | P2, and the counter lane (Q6) |
| **P4** | **Scan → services** (Q5). | independent of P1–P3; can run in parallel |

P0 is worth doing regardless of how Q1–Q6 resolve, and it is the cheapest possible insurance against
the failure mode that damaged the last run.

---

## 6. Open ambiguity in the request

One phrase is genuinely unresolved and should be confirmed with the user rather than guessed:

> "updating the ticket with what was picked up on what date and time and **what was paired**"

Two readings:

1. **"what was repaired"** — a typo; the reply enumerates the services performed. Consistent with the
   rest of the sentence and with `repair_actions`.
2. **"what was paired"** — literal. This repo has a real serial↔label **pairing** concept
   (`docs/todo/` serial-label-pairing work) and `repair_actions.old_serial` / `new_serial` records a
   **swap** — a device pairing fact. If a repair replaced a unit, "what was paired" would mean the
   old↔new serial pair in the reply.

Reading 2 is technically coherent in this codebase, so this is not safely inferable. Both readings are
served by the same underlying data (`repair_actions`); only the reply copy differs.

---

## 7. Evidence index

Every claim above, and how it was checked. Tag meanings: **DDL** = migration SQL read directly ·
**CODE** = source read · **GREP** = absence/presence proven by search · **GIT** = working-tree state.

| Claim | Method | Location |
|---|---|---|
| `counter_transactions` / `ticket_work_outbox` exist, untracked | GIT + CODE | `git status`; `schema.ts:5031-5117`; `2026-07-29d_*.sql` |
| Counter orchestrator built + tested | CODE | `src/lib/counter/submit-counter-transaction.ts` (529 L), `.test.ts` (500 L) |
| Repair is a typed ticket anchor | CODE | `src/lib/support/ticket-link.ts:51-52` |
| `repair_actions` is live, org-scoped, absent from Drizzle | DDL + GREP | `2026-05-19_repair_actions.sql`; `2026-06-22e`; `grep repairActions schema.ts` → 0 |
| `repair_actions` has no money column | GREP | `grep 'cents\|price' src/app/api/repair/actions/route.ts` → 0 |
| Pickup route behavior (status, signature, assignment, realtime) | CODE | `src/app/api/repair-service/pickup/route.ts`, full read |
| Pickup posts nothing to the ticket | GREP | `grep -c 'addComment\|getHelpdeskProvider\|enqueueTicketWork'` → 0 |
| Pickup does not audit | GREP | `grep -c 'recordAudit'` → 0 |
| `addComment` capability exists | CODE | `helpdesk/types.ts:104`; `zendesk-adapter.ts:39` |
| N services flatten to one price + one SKU | CODE | `ProductSelector.tsx:286,296`; `submit-repair-intake.ts:91-93,149-154` |
| Kiosk hardcodes `'130'` | CODE | `repair-intake-logic.ts` `buildInitialFormData` |
| `ProductSelector` is browse/search, not scan | CODE | `ProductSelector.tsx:281,343,394` |
| No repair branch in the desktop SKU scanner | GREP | `grep -c repair GlobalDesktopSkuScanner.tsx` → 0 |
| Two live spellings of "released" | CODE | `repair-service-queries.ts:45-60` vs pickup route `status='Done'` |
| `repair_service` model lacks `orgIdCol()`; live table is org-scoped | CODE + DDL | `schema.ts:1877-1903` vs `2026-06-22e:36`, `2026-06-14_..._domain_children.sql:33` |
| `unit_repairs.serial_unit_id` NOT NULL; split is deliberate | CODE | `schema.ts:3274-3292`; comment at `1886-1888` |
| `square_transactions` shape; `'repair_payment'` declared | DDL | `2026-04-07_create_square_transactions.sql` |
| Global-unique upsert is the outstanding tenancy follow-up | DDL | `2026-07-29a_*.sql` header |

**Not verified — flagged, not asserted:** whether 29d/29e are applied to the live DB (project memory
says no; this briefing did not query the database); the real live column list of `repair_service` and
`repair_actions` beyond what migrations declare. **P0 exists to close exactly these.**
