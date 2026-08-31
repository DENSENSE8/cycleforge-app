# Propagation checklist — caged → released on the next non-scan desk

**Written:** 2026-08-30 · **Status:** checklist only — nothing here is scheduled
**Plans:** [`non-scan-desk-chrome-caged-release-PLAN.md`](./non-scan-desk-chrome-caged-release-PLAN.md) · [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md)

Phase C of the caged→released ship is **documentation, not a port**. To-ship is
the verification surface; the next desk is a checklist, one desk per change set,
after To-ship sign-off.

---

## What already exists (do not rebuild)

| Piece | Where | Reusable as-is? |
|---|---|---|
| Desk frame (tab band · stage · fullscreen) | `src/components/desk/DeskPageChrome.tsx` | **Yes** — tabs and the CTA are props |
| Stage measure | `src/lib/desk/desk-stage.ts` (`DESK_STAGE_MAX_PX` = 1152) | **Yes** — one product constant; do not add a per-desk width |
| Nav → tabs adapter | `src/components/desk/useDeskPageChromeTabs.ts` | **Yes** — reads `SIDEBAR_PAGE_NAV` children |
| Chrome opt-in flag | `deskChrome: true` on the page's `SIDEBAR_PAGE_NAV` entry | **Yes** |
| CTA seam | `src/components/desk/DeskActionSlot.tsx` | **Yes** — the desk registers, the frame renders |
| Gate rule | `src/lib/orders/release-gates.ts` | **Only for orders** — see below |
| Cage reads/writes | `src/lib/orders/caged-orders.ts` | **Only for orders** |

---

## Porting a desk's CHROME (cheap — this is the checklist port)

1. Set `deskChrome: true` on the L1's `SIDEBAR_PAGE_NAV` entry. The spine goes
   flat and the header face becomes an identity chip automatically.
2. Put the desk's route segments inside a route **group** with one
   `layout.tsx` that mounts `DeskPageChrome` — see
   [`src/app/shipping/(desk)/layout.tsx`](../../src/app/shipping/(desk)/layout.tsx).
   Sharing one mount across sibling segments is what makes fullscreen survive a
   tab switch.
3. **Scan stations stay outside the group.** `/shipping/scan-out` is the worked
   example. A `kind: 'station'` surface never opts in and never imports
   `DeskPageChrome`.
4. If the desk has a primary CTA, render a `<DeskActionSlotRegistrar>` from the
   desk body. Do not import the CTA into the shared layout.
5. `npm run verify`.

That is the whole chrome port. Nothing below is required to get the frame.

---

## Porting the CAGE (expensive — only where the concept is real)

The cage is **not** generic UI. It is a claim that a record can exist before it
is workable, and that a specific, named set of facts is what makes it workable.
Port it only to a desk where an operator can already name those facts. If the
answer to "what would be caged, and why?" is vague, the desk does not want a
cage — it wants better validation on its create form.

When it is real:

1. **Migration first, always.** Additive, nullable/defaulted columns on the
   desk's own table, following
   [`2026-08-30c_order_release_gates.sql`](../../src/lib/migrations/2026-08-30c_order_release_gates.sql).
   **`NULL` must mean "already released."** Every row that predates the cage is
   real working stock; a default of `caged` empties the desk's queue on deploy.
   This is the single most important line in this document.
2. **Its own pure evaluator**, alongside `release-gates.ts` — not a
   generalization of it. G1/G2/G3 are the *order* gates (identity triangle,
   documents, shipping label); another desk's gates are different facts, and a
   config-driven "gate engine" shared between two desks is how a product rule
   becomes a schema nobody can read. Unit-test the matrix DB-free.
3. **Enforce in the transaction, not in the button.** The API re-evaluates from
   the row's own facts and 409s a stale green preview. See
   `releaseOrder()` and the `GATES_NOT_MET` branch in
   `src/app/api/orders/[id]/cage-release/route.ts`.
4. **Name failures.** A disabled action with no reason is not a gate. The
   evaluator returns every gate with its own reason; the UI renders the list.
5. **Reuse the desk's existing create path.** To-ship cages by calling
   `/api/orders/add` and then stamping `caged` — deliberately NOT a flag on
   `add`, so every other caller (CSV import, mobile verification, sync
   backfill) keeps landing straight in the working set.
6. **A facet, not a second table.** The caged set rides the desk's existing
   grid via a row mapper (`cagedRecordToQueueRow`). A second table display for
   held rows is the fork the one-table teardown removed.
7. **Audit the release.** `AUDIT_ACTION.ORDER_RELEASE` is the worked example —
   who, when, and the gate snapshot that was green.

---

## Traps found while doing To-ship

- **The live queue can't show caged rows.** `/api/orders?fulfillmentScope=true`
  requires `shipment_id IS NOT NULL` and non-blank tracking, so no client-side
  predicate can surface a caged order from that payload. The caged set needs its
  own endpoint. Any desk whose queue filters on the very facts the cage is
  waiting for has this problem.
- **`release` was already taken.** `POST /api/orders/[id]/release` unwinds
  allocations. The cage route is `cage-release`. Grep the route tree for your
  verb before naming it.
- **Undeclared params get stripped.** `useSurfaceParamHygiene` drops anything
  the route spec does not declare, on the next param change. `?triage` and
  `?cage` are declared in `ORDERS_ROUTE_PARAMS`; a new desk's params need the
  same.
- **The band is 28px.** `PRIMARY_CHROME_ROW_FACE` is `h-7`; the smallest DS
  `Button` is `h-8`. A CTA on the tab band is a band cell, not a `<Button>`.

---

## Deliberately not done

- **No guard proving scan stations never import `DeskPageChrome`.** AGENTS.md
  forbids re-adding source-text guards. The structural proof is that the only
  mount is the `(desk)` route group. If it is ever worth pinning, it has to be a
  mounted-DOM test or an ESLint AST rule — never a `readFileSync` + regex.
- **No org-authored gate types.** Product-coded only, per the plan's v1 lock.
- **No second label buy path.** The triage form links into the Labels
  workbench and re-reads the gates on return.
