# HANDOFF — Order intake, Ecwid pull, and the exceptions workbench

**Written:** 2026-08-31 · **Branch:** `main` · **State:** working, one open design decision

Paste this into a fresh session. It is self-contained. Read
`CLAUDE.md` first — it now mandates the `design-mcp` server before any UI code.

---

## 1. What this build is

Three connected pieces, all landed and verified in the browser:

| Piece | Where | State |
|---|---|---|
| Order Intake & Acknowledgment (caged intake, G1–G3 release) | `?triage=` overlay | done |
| Ecwid pull — cron + paced batch import | `pnpm ecwid:batch` / `ecwid:connect` | done |
| **Order exceptions workbench** — the active surface | `/shipping/exceptions` | done, 1 open decision |

The operator's sentence is the model: *"I only care about my order and linking
it, so it's not an exception within the system, and so it's paired to a SKU."*
The row is an ORDER; blockers are the reasons it is stuck; work continues until
there are none left.

## 2. Live data state

- **22 caged orders**, **19 still unpaired** to `sku_catalog`.
- Ecwid: **5,005 orders all-time**, ~450 in the DB. The rest are NOT imported.
- 3 orders have a catalog row that merely isn't linked — the fastest wins:
  **5012** (`01029` → catalog #2425, **fans out to 10 more**), **5004**
  (`01361-N` → #2424), **4989** (`00097` → #364).

## 3. The decision — SETTLED 2026-08-31: **(a)**

The desk CTA is `SlicedActionDock` — one integrated track,
`[🔄 Sync Google Sheet │ ▾]`, matching Unbox's **Print · Receive** control.
Its built-in menu rendered items in **ALL CAPS**, which contradicted the
operator's explicit "no caps lock" direction from the same day.

Resolved by option **(a)**: `SlicedActionDock` gained `menuChrome`, defaulting
to `'ops'` (the historic Popover + caps — Unbox is untouched). To-ship passes
`menuChrome="dropdown"`, which renders the chevron's items through the house
`DropdownMenu` (Radix / shadcn lineage): sentence case at the CTA label's own
`text-role-caption`, on a `COMPOSER_SHELL_CORNER` panel matching the pill
track. The integrated one-track CTA is unchanged; only the menu's voice is.

The dock's menu was NOT restyled globally — that was the trap, since the caps
are Print · Receive's existing look.

## 4. `npm run verify` is RED — and it is NOT this build

Two failures, both in a **concurrent session's** in-flight files. Confirm they
are still theirs (`git status`) before touching anything:

- `src/components/ui/color-neutrals.test.ts` — ratchet trips on
  `hover:bg-black/[0.05]` in `src/components/labels/LabelFaceSlotOverlay.tsx`
  (untracked, not ours).
- `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` — missing
  `useMemo` / `copyToClipboard` imports, mid-edit.

This surface's own gates are green: typecheck clean, `order-exception-types`
8/8, `sidebar-navigation` 28/28, `order-exceptions-workbench.spec.ts` passing.

**A peer is actively editing** `tools/design-mcp/*`, `pinned.json`,
`design-system/components/*`. Re-read shared files before editing; a red tsc
there is usually their fan-out, not yours.

## 5. Hard-won gotchas — do not rediscover these

**The MCP design server has real gaps.** All three are reproducible:
- `ds_tokens` returns EMPTY on every axis. It scans `.css` files; this repo's
  tokens are generated at runtime by `design-system/themes/registry.ts`. Use
  `cornerClass()` / `focusRing()` / the `surface-*`·`text-*` scale instead of
  `var(--token)`.
- `ds_contract` did NOT surface `SlicedActionDock` for either "split button" or
  "print button with dropdown" — it returns generic `Button`/`DropdownMenu`.
  That gap directly caused an ugly two-pill first attempt. **Fix worth doing:**
  add a `pinned.json` entry for `SlicedActionDock`.
- `ds_critique` only sees literals + file size. It cannot see "these two
  buttons should be one control."

**Catalog search must use `/api/sku-catalog?q=`, never
`/api/sku-catalog/search`.** The latter's default mode returns `sp.id` — a
`sku_platform_ids` row id, NOT `sku_catalog.id`. Feeding it to `/pair` binds
the order to an unrelated catalog row. For SKU `01029` it returns 15967/2983
while the real row is **2425**. This was caught pre-ship; do not regress it.

**`batchPair` already fans out.** Pairing an item number backfills
`orders.sku_catalog_id` for every order sharing it, org-scoped, and reports
`ordersBackfilled`. "Pair once, clears all" is domain behaviour, not UI.

**Postgres NULL ordering.** `ORDER BY (release_state = 'caged') DESC` is NULL
for legacy rows and `DESC` is NULLS FIRST — it pushed the entire caged set past
the LIMIT and the queue rendered empty while holding 22 rows. Always
`COALESCE(release_state,'')`.

**Bundle altitude.** Client components must import exception types from
`order-exception-types.ts` (pure), never `order-exceptions.ts` (reaches
`@/lib/db` → `server-only`, breaks the build).

**`/shipping/(desk)/layout.tsx` renders ABOVE the `QueryClientProvider`.** A
react-query hook there throws "No QueryClient set" and takes down To ship,
Amazon Prep and Shipped. The Exceptions tab count uses a plain `fetch` for this
reason — keep it that way.

**`useSurfaceParamHygiene` strips undeclared URL params.** Anything new must be
registered in `ORDERS_ROUTE_PARAMS`, or use local state (the Add-caret's chosen
method does).

**Ecwid `actionable` scope = caged only.** "Every order with a blocker" was
measured at **3,526 of 4,217 orders** — a wall, not a worklist. `all` is the
opt-in backlog sweep.

## 6. Where things live

```
/shipping/exceptions                      OUTSIDE (desk) — that stage caps at 1152px
  OrderExceptionsWorkbench                queue left (22rem) + editor (flex-1)
    ExceptionQueueList                    blockers as chips, ↑↓/j/k
    ExceptionEditor                       TriageScrollLayout knobs
      ExceptionCatalogPairing             link (Command combobox) OR create+pair
      ExceptionOrderFields                item#/SKU/title/qty/tracking/condition
      ExceptionReleaseSection             G1–G3 rendered + Release
GET /api/orders/exceptions                the ONE new route; everything else composes
src/lib/orders/order-exceptions.ts        query (server) — pure half in -types.ts
src/design-system/components/TriageScrollKnobs.tsx   NEW, edge rail + IO readout
```

Writes all compose existing endpoints: `PATCH /api/orders/[id]`,
`POST /api/orders/[id]/tracking`, `POST /api/sku-catalog`,
`POST /api/sku-catalog/pair`, `POST /api/orders/[id]/cage-release`.

## 7. Suggested next steps

1. **Settle §3** (menu case), then re-run `order-exceptions-workbench.spec.ts`.
2. **Pair the 3 easy orders** (5012 / 5004 / 4989) and watch the queue drop
   from 22 → ~11. This is the first real end-to-end proof of the fan-out.
3. **Add the `pinned.json` entry for `SlicedActionDock`** so the next agent is
   routed to it (§5).
4. **Backfill Ecwid history** — `pnpm ecwid:batch -- --limit=N` in dated
   batches. Dry-run by default; `--apply` writes. ~4,555 orders outstanding.
5. **Vault the Google Sheets credential.** Sheets sync works for the dogfood
   org only, via a hardcoded `DOGFOOD_SOURCE_SPREADSHEET_ID` constant; any
   other tenant gets "No Google Sheets source configured".
6. Deploy for the Ecwid cron to fire — `vercel.json` crons are read at deploy
   time and git deploys are disabled here.

## 8. House rules that still bind

`AGENTS.md` was **deleted** on operator instruction (fresh context each
session). These are not written down anywhere else and are not inferable from
the code:

- Never commit `.env`.
- `orgId` from `ctx.organizationId`, **never** the request body; org-scoped
  writes go through `withTenantTransaction`.
- Migrations land before the code that reads them (expand → code → contract).
- **Work on `main` only** — never create a branch. The operator manages
  commits; stage only files you changed.
- No layout animations — nothing tweens `height`/`width`/`top`/`left`/margin/
  padding or framer `layout`. Opacity and colour are fine.
- `npm run verify` before done.
