# Prompt — QA operational run: order → triage → pick → tote → pack (mobile web first)

Paste this whole file as the first message of a fresh session on **avion**
(web + server). The native iOS/Android apps are NOT touched in this session;
they get ported after this run is green (see "After this session").

## Goal

On the iPhone Air's **Safari**, using the mobile web display (`/m/*`),
signed into the **QA Sandbox** org, one operator runs one test order through
the whole outbound floor loop with no manual database edits:

1. **Order** — a test order exists (created or fixture-seeded), server-projected.
2. **Triage** — it appears in the Triage view with its facts (paired, label,
   next action) and is acknowledged on route `PICK` (or `QC`); a `409
   NOT_READY` is shown as the named refusal it is.
3. **Allocate** — real sandbox units are reserved to it.
4. **Pick** — the pick list shows those units with bins.
5. **Tote pairing** — scanning a tote QR arms the tote; each confirmed unit
   lands in that tote and stamps tote↔order (one tote carries one order).
6. **Pick complete** — the paired tote moves OPEN → STAGED.
7. **Pack** — scanning that tote at pack opens **that** order.
8. **Order-information pairing at pack** — the pack screen shows and records
   the order's pack facts (checklist / packing checks / placement) against
   the same order. No postage is bought; the missing label stays a visible
   fact, never faked.

Every step must be reproducible from a clean sandbox state in under 5 minutes,
and every step must be a server route the native apps can later call as-is.

## Measured facts (2026-09-24, verify before relying on them)

**Where things run**
- `app.cycleforge.ai` (the deployed tree) answers **404** for
  `/api/developer/qa/capabilities`, `/api/v1/outbound/work` and
  `/api/orders/{id}/acknowledge`, for every org — org 1 included. These
  routes exist in the `v1-outbound` lane (`b7e7653a3`,
  "outbound triage acknowledgment, live-label facts, triage saved view").
- The `prod` lane is the checkpointed deploy tree, but it is not
  self-consistent: `prod/src/lib/picking/sessions.ts` imports
  `@/lib/picking/tote-scan`, which exists only in `v1-outbound`. Confirm
  which tree production actually builds from before any deploy.
- All lanes and production share one Neon database. Schema already
  present there: `organizations.environment`, `orders.acknowledged_at /
  acknowledged_by / fulfillment_route`, `handling_units.paired_order_id /
  paired_at / paired_by_staff_id`.

**The sandbox**
- QA Sandbox org: `00000000-0000-0000-0000-000000000002`
  "CycleForge QA Sandbox", `environment = 'sandbox'` (`QA_ORG_ID`).
- Test login: `qa-admin@cycleforge.test`, admin, single active membership
  (Test Iso A membership set to `removed`). The owner holds the password;
  never write it into a file or log.
- Stock: **1** `STOCKED` unit in the org (`QA-TOTE-0001`, SKU `QA-TOTE-SKU`,
  location `QA-BIN-1`). 54 units total, mostly `RECEIVED` / `LABELED`.
- Totes: `H-6` (OPEN, unpaired), `TOTE-QA-STAGED` (STAGED).
- This is why every QA order's pick says "Nothing to pick": nothing is
  allocated and there is no stock to allocate.

**The routes the loop is made of** (read the handlers, don't trust this list)
- Create: `POST /api/orders/add` — `orders.create`; `Idempotency-Key` +
  body `idempotencyKey`; canonical `condition`; non-5xx answers cached by key.
- Triage read: `GET /api/v1/outbound/work?view=triage&query=…` (strict zod
  contract in `src/lib/outbound/work-contract.ts`).
- Acknowledge: `POST /api/orders/{id}/acknowledge` `{ route: 'PICK'|'QC' }`
  → `409 { error:'NOT_READY', missing:['pairing'|'label'] }`.
- Allocate: `POST /api/orders/{id}/allocate` — FIFO over pickable `STOCKED`
  `serial_units` where `su.sku` = order canonical SKU, org-scoped;
  `409 'no STOCKED serial_units available for sku'`.
- Pick: `GET /api/orders/{id}/pick-tasks`, `POST /api/picking/session`,
  `POST /api/picking/session/{id}/confirm-pick`
  `{ allocation_id, client_event_id, tote_scan? }`,
  `POST /api/picking/session/{id}/complete`.
- Tote scan forms accepted server-side (`src/lib/picking/tote-scan.ts`):
  `H-{id}`, the `/m/h/{id}` QR, a numeric id, or an external
  `handling_units.code`. 409 when the tote is paired to another order or not
  OPEN/STAGED. Totes are minted by `POST /api/handling-units`.
- **Gap:** `resolveToteScan` and `releasePackedTotes` in `tote-scan.ts` have
  **no route caller**. The pack-side "scan the tote → open THE order"
  contract is described but not wired. Step 7 is therefore new server work.
- Pack surfaces: `/m/pack`, `/api/orders/{id}/pack-checklist`,
  `/api/orders/{id}/packing-checks`, `/api/orders/pack-placement`,
  `/api/pack/ship` (ship = out of scope here).
- QA tooling: `/api/developer/qa/fixtures`, `/api/developer/qa/scenarios`,
  scenario `fixtures.e2e-outbound` (deterministic `QA-TEST-*` orders),
  `src/lib/qa/fixtures/reset.ts`.

**Mobile web pages** (`src/app/m/(shell)/`): `orders`, `triage`, `pick`,
`pick/[orderId]`, `h/[id]`, `pack`, `scan`, `scan-out`, `work`.

## Implement

1. **One sandbox fixture, not SQL.** Extend the QA fixture/scenario system
   with an `outbound.order-to-pack` scenario that, in the QA org only
   (refuse any `environment !== 'sandbox'`), creates: N `QA-TEST-*` orders
   whose SKUs have matching pickable `STOCKED` units in a named QA bin, and
   M OPEN unpaired totes. Idempotent by run id; `reset` returns the org to
   the same starting state (release allocations, unpair and reopen totes,
   remove the run's orders/units). Callable from the QA Console.
2. **Triage on mobile.** `/m/triage` shows the work projection's facts for
   the order and the PICK/QC acknowledge actions, rendering `NOT_READY`
   missing gates plainly.
3. **Allocate from the pick screen.** When `pick-tasks` is empty, `/m/pick/[orderId]`
   offers ALLOCATE (existing route) and re-reads tasks; the 409 is shown
   verbatim, never "nothing to pick".
4. **Tote on the pick screen.** Camera + hardware wedge both accept every
   tote form above; the armed tote is shown; every confirm sends
   `tote_scan`; pairing refusals are shown per unit. Decide with the owner
   whether a tote is REQUIRED before the first confirm (today it is not
   enforced) — ask, don't assume.
5. **Pack opens the order from the tote.** Add the route that calls
   `resolveToteScan` (and `releasePackedTotes` at the right pack step) and
   wire `/m/pack` so a tote scan opens exactly its paired order, refuses an
   unpaired/other-order tote by name, and shows the order's pack facts.
6. **Order-information pairing at pack.** Record the pack checklist /
   packing checks / placement against that order through the existing
   routes; show the missing shipping label as a fact. No postage, no label
   purchase, no scan-out.
7. **Contracts.** Every request/response the loop uses gets a strict zod
   schema, and the Swift generator (`pnpm contracts:swift`) emits it. That
   file is the port's input.

## Constraints

- QA Sandbox org only. Never mutate org 1 (USAV Solutions) or any
  `customer` org; every new write path checks `environment = 'sandbox'`
  when it is QA tooling.
- The server owns every rule (pickability, pairing, NOT_READY, tote bind).
  Pages render server answers; no client-side lifecycle derivation.
- Idempotent writes (client event ids / idempotency keys) on every mutation.
- No shipping label purchase, no carrier calls, no scan-out.
- Run the dev lane against the shared DB only with sandbox-scoped writes;
  do not apply unreleased migrations without the owner's go-ahead.

## Acceptance — run it on the Air

A written run log (`docs/handoff/RUN-qa-order-to-pack-<date>.md`) with, per
step: the page, the tap/scan, the route + status, and the proving read
(e.g. `handling_units.paired_order_id`, allocation state, tote status).

- [ ] Fixture seeds; reset restores the identical starting state (run twice).
- [ ] Order visible in `/m/orders` and `/m/triage` with server facts.
- [ ] Acknowledge PICK: success refreshes; a label-less order shows `NOT_READY — missing: label` if that gate applies.
- [ ] ALLOCATE reserves units; pick list shows bins.
- [ ] Tote QR scan (camera) arms the tote; confirm pairs; a second order on the same tote is refused by name.
- [ ] Complete moves the tote to STAGED.
- [ ] Pack: tote scan opens exactly that order; an unpaired tote is refused by name.
- [ ] Pack facts recorded against the order; label shown as missing.
- [ ] Web tests for new routes (sandbox refusal, idempotency, tote refusals, pack resolution) green; lane typecheck green.
- [ ] Contract file regenerated and listed.

## After this session (not now)

Port screen by screen to the native apps against the generated contracts,
and test there only what the web cannot: hardware wedge, camera, offline
queue, keychain, wrong-org sessions. The iOS app today already has: QA
test-order create + triage + PICK/QC acknowledge (capability-gated), a pick
screen that arms `H-…` totes by wedge and sends `tote_scan`, workspace
switching, 44pt row thumbnails. Missing natively: ALLOCATE, `/m/h/{id}` QR
parsing, camera on the pick screen, and everything pack-side.
