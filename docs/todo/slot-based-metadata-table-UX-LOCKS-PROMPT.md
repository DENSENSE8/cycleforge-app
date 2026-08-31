# HANDOFF PROMPT — Slot table UX locks (To-ship slice 2)

**Paste everything below the horizontal rule into a fresh Cursor / Claude / Fable agent.**
Self-contained. Repo: `cycleforge-app` on **`main`**.
Plan of record: [`slot-based-metadata-table-PLAN.md`](./slot-based-metadata-table-PLAN.md) ·
prior slice: [`slot-based-metadata-table-IMPLEMENTATION-PROMPT.md`](./slot-based-metadata-table-IMPLEMENTATION-PROMPT.md) ·
manual checks: [`slot-based-metadata-table-VERIFY.md`](./slot-based-metadata-table-VERIFY.md).

---

You are the **executor** finishing the operator's UX locks on the slot-based To-ship table.
The foundation SHIPPED and is green — do not rebuild it, do not fork it. Close the gaps below.

## What already exists (audited 2026-08-30 — do not re-prove, do not reinvent)

| Shipped | Where |
|---|---|
| SlotLayout Zod + budgets 10/5, tolerant reader | `src/lib/tables/slot-layout.ts` / `slot-layout-core.ts` |
| Cascade `savedView ?? staff ?? org ?? product`, whole-document, stale/dupe drop | `src/lib/tables/resolve-effective-layout.ts` |
| `materializeTracks` → `status:N` slot keys (never field ids) | `src/lib/tables/materialize-tracks.ts` |
| Orders catalog + resolvers (tested/packed/scanned_out stage_events, item_number, qty, condition, notes, amount) | `src/lib/tables/field-catalog/orders.ts` + `orders-resolve.ts` |
| To-ship mount: no hand-spliced `tested`; `status:1 ← orders.tested` | `ordersCompoundColumnsFor` in `src/lib/dashboard-order-row-layout.ts` |
| Layout hook (org GET, staff prefs write, org save, settled-gating) | `src/components/dashboard/orders-queue/useOrdersTableLayout.ts` |
| **+** Popover (shadcn `radix-popover`), limit copy, identity locked, aria-pressed | `DataTableFieldsMenu` in `src/components/tables/DataTable.tsx` |
| Org persistence `organizations.settings.tableLayouts.orders` (GET/PUT, `admin.manage_features`, morph allowlist) | `src/app/api/tables/layouts/route.ts` + `src/lib/tables/org-table-layouts.ts` |
| Staff persistence `prefs.tableLayouts.orders` (strict schema, capped 32) | `src/lib/schemas/staff-preferences.ts` |
| Stage cell: 28px `StaffAvatar` (photo → initials on staff colour, colour ring), verb faces from `stageLabels`, name in tooltip, dashed unclaimed circle | `CompoundStageStep` in `src/components/tables/compound/CompoundCells.tsx` |
| Subtitle parts: qty = bare number + `orderRowQtyTone`, condition grade tone, binding order = display order | `ordersSubtitleParts` in `orders-resolve.ts` |

Polymorphism law holds: shared chrome branches on `displayType` / slot key only.
Unit suites are green; `npm run verify` passed on the shipped tree.

## Outcome (done when — audit every line)

1. **Status pill shows the LAST status, never the next.** The To-ship state pill for a
   packed-and-staged row must read **“Packed”**, not “Packed · Staged”. A status names what
   HAS happened; the next step is the queue's job. SoT: `src/lib/labels/registry.ts:69` —
   the `unshipped` kind's `PACKED_STAGED.label` (keep the STATE KEY `PACKED_STAGED`; keep the
   description's staging detail; the `outbound` kind's `'In Staging'` at :73 is a different
   desk and stays). Blast radius to check: `src/lib/labels/resolve.test.ts:42` (asserts the
   two kinds stay DISTINCT — 'Packed' vs 'In Staging' still passes, update its comment),
   `src/lib/orders/orders-compound-view.test.ts:35` (`ordersStateTone('Packed · Staged')` —
   retest with 'Packed'; tone derives from the PACKED substring so it stays `done`). Labels
   are tenant-overridable via `buildStateMeta` — verify no stored tenant override masks the
   new seed on the dev org, and sweep the seeded vocabulary for any other forward-looking
   label while you are in there.
2. **Pending verb copy = the operator's “still needs this” semantics.** `stageLabels.pending`
   currently reads as imperatives (Test / Pack / Scan). The operator's lock is Needed-class
   wording (“need to test”), ONE word, width-matched with the done face. This is catalog DATA
   only — edit `stageLabels` in `field-catalog/orders.ts`; the one-word + width guard test in
   `orders.test.ts` must keep passing. **Confirm the exact words with the operator before
   landing** (candidates: `Needed`, or keep verb forms — do not guess silently).
3. **Product default under-title = `qty · condition · notes`.** The operator stated this
   order. Set `ORDERS_PRODUCT_LAYOUT.subtitleBindings` accordingly (`orders.qty`,
   `orders.condition`, `orders.notes`) so orgs with no override see it without binding
   anything. Update the parity assertions (`orders.test.ts` product-default test; any e2e
   that assumed an empty secondary line).
4. **Subtitle reorder affordance.** Order currently = bind sequence (append); once bound,
   reordering means unbind/rebind. Add explicit reorder (↑/↓ on bound rows inside the +
   Popover is enough — no drag) that rewrites the `subtitleBindings` array. Status band gets
   the same for free if it falls out naturally, but subtitle order is the lock. Track keys
   stay positional (`subtitle:N`) — reordering changes bindings, never keys. Budget: within
   the already-open popover.
5. **Condition CHANGEABLE under the title.** The compound subtitle condition part is
   preview-only today. Make it editable in place: reuse the existing condition write path
   (`useOrderAssignment` already patches `condition`; the flat grid's in-cell condition
   editor was the precedent) and the house condition-grade options SoT
   (`conditionGradeOptions` / `conditionLabel` in `src/lib/conditions.ts`). Capability
   pattern: presence-of-handler = editable, absence = read-only (the repo law — never a
   second component). This is a scalar field PATCH, not a lifecycle transition — but keep
   any confirm affordance the flat editor had. The edit must not add a keyboard trap on the
   row (row owns Enter/Space — see the old `CompoundItem` note-editor docblock for the
   click-only pattern).
6. **`npm run verify` green** (full gate — lint + typecheck + unit).
7. **To-ship only.** No pickup/receiving/customers mounts; kernel stays generic.

## Nice-to-have (do only if cheap, after 1–6)

- Settings → Tables editor (floor + Popover + org save already satisfy the plan's floor).
- Saved-view layout layer: `saved_views.filters` is an open JSONB bag — carry
  `filters.layout`, read via `readStoredSlotLayout`, thread as `savedViewLayout`; note
  `toClientView`/`saveView` currently DROP unknown filters keys (read-modify-write or you
  build a layout destroyer).
- Amount through the catalog resolver (compound amount cell still paints `sale_amount` via
  the adapter; `amountFieldId` is declarative — the catalog docblock says so).

## Non-goals (refuse)

- Porting other `PRODUCT_TABLES` / families; schema-per-tenant / EAV / DDL from the picker
- Unlimited columns; deep-merge of partial binding arrays
- Recolouring status verbs by staff colour (person = avatar mark, state = quiet tones — locked)
- Resurrecting deleted Sheets picker chrome or regex-over-source guard tests
- Committing unless asked; never `git stash`; `main` only; `:3050` / `usav-dev` untouched
- No geometry tweens (height/width/layout) — AGENTS.md law

## Read first

1. `AGENTS.md` (verify gate, interaction budget, orgId-from-ctx, no layout animations)
2. The shipped-foundation files in the table above (read before touching)
3. `src/lib/labels/registry.ts` + `src/lib/labels/resolve.ts` (label seeds + tenant overrides)
4. `src/lib/conditions.ts` + `src/lib/condition-tone.ts` + `src/hooks/useOrderAssignment.ts`
5. `tests/e2e/to-ship-pending-grid.spec.ts` (derives assertions from `ORDERS_COMPOUND_COLUMNS`)

Concurrent sessions share this worktree — re-read files before editing, stage only what you
change, and treat a surprising red gate as possibly another session's in-flight fan-out.

## Report back

1. Files changed (paths only)
2. The exact status-pill vocabulary after the change (all unshipped states)
3. The pending/done verb pairs as landed (and operator confirmation of the copy)
4. Default product bindings (status + subtitle, in order)
5. Full `npm run verify` result
6. What stayed open (nice-to-haves not taken)
