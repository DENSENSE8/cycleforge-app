# IMPLEMENTATION PROMPT — Non-scan desk chrome + caged → released (To-ship first)

**Paste everything below the horizontal rule into a fresh Cursor / Claude / Fable agent.**  
Self-contained. Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`non-scan-desk-chrome-caged-release-PLAN.md`](./non-scan-desk-chrome-caged-release-PLAN.md).  
**Prerequisite chrome (tabs + fixed width):** [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) — implement or assume that plan; do not re-specify stage/nav here.  
**Form successor (acknowledge / parcel / assignment / bulk same schema):** [`order-intake-acknowledgment-IMPLEMENTATION-PROMPT.md`](./order-intake-acknowledgment-IMPLEMENTATION-PROMPT.md) — do not merge that ship into this one.

You are the **executor**. Ship **Add CTA + scroll triage form + caged → released** on To-ship. **Do not change scan-station chrome.** Do not rebuild in-page tabs / fixed-width stage — compose [`DeskPageChrome`](./desk-page-chrome-fixed-width-PLAN.md).

---

You are extending Cycle Forge Warehouse OS so To-ship gets a rightmost **Add** on the desk tab band, a **scroll-section triage form**, and a **caged → released** gate before orders enter the live queue.

This sits **above** desk chrome + the slot-based metadata table. Compose both; do not rebuild them.

Write production TypeScript/React: typed, small diffs, no drive-by refactors, no layout geometry animations, work on **`main` only**.

## Mission (this ship only)

**Prerequisite:** Desk chrome from [`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) is present (flat To-ship L1, Orders|FBA tabs, fixed-width stage). If missing, implement that plan first — do not duplicate it here.

**To-ship verification for THIS prompt.** When done:

1. **Add** CTA is the **rightmost control on the tab band** (uses DeskPageChrome’s right slot).
2. Add opens a **scroll-section triage form** (identity, link docs, link/buy label, release).
3. Orders stay **caged** until release gates pass; only then **released** into the actionable To-ship Orders grid.
4. **Scan stations unchanged.**
5. `npm run verify` green.

## Release gate (v1 hard rule — locked)

**Release** is enabled only when **all** gates are green:

| Gate | Rule |
|---|---|
| **G1 Identity triangle** | **Item number** linked to **order number** AND **tracking number** |
| **G2 Documents** | Documents linked to the item number (manuals / paperwork via `documents` + `document_entity_links`) **OR** explicit **“Item number does not require documents”** |
| **G3 Shipping** | Shipping label **linked** **OR** **bought** via existing label APIs (no second buy engine) |

UI must list which gates fail. Silent disabled Release is not enough.

States: intake → **CAGED** → **RELEASED** → existing lifecycle (test/pack/ship). Released rows feed the normal To-ship Orders tab grid.

## Non-goals (refuse)

- Rewriting Unbox / Pack / Scan-out / Test / other scan-station chrome
- Putting Orders/FBA back under a spine dropdown
- Edge-to-edge desk grids as the default
- Org-authored custom gate types
- Replacing ShipStation / Labels buy path
- Porting every non-scan desk in one PR (To-ship first; leave a checklist)
- Slot-column picker work (separate plan) unless a one-line compose is required
- Committing unless asked; `git stash`; branches off `main`
- Restarting `:3050` / `usav-dev`

## Read first (in order)

1. `docs/todo/non-scan-desk-chrome-caged-release-PLAN.md` — full contract  
2. `AGENTS.md` — verify gate, no layout animations, orgId from ctx, interaction budget  
3. `docs/warehouse-os/` — shell / desk context (skim)  
4. Current To-ship mount: `OutboundOrdersDeskShell`, `UnshippedTable`, `useOrdersSpreadsheet`, dashboard/outbound routes  
5. Nav: `SIDEBAR_PAGE_NAV` / spine children for outbound / To-ship — **these children move into page tabs**  
6. FBA board entry: existing `/fba` or outbound FBA surface to embed as a tab body  
7. Add order precedent: `docs/todo/import-add-order-right-rail-HANDOFF.md`, `NewOrderEntryOverlay`, `/api/orders/add`  
8. Documents: `docs/todo/jit-pack-documents-plan.md`, `document_entity_links`, product manuals bridge  
9. Label buy: `/api/shipping/labels`, Labels workbench — **reuse**  
10. Scan-station measure: `src/lib/station/workbench-layout.ts` — **do not** reuse `STATION_WORKBENCH_LOCK_PX` as desk max-width  
11. Slot table (compose only): `docs/todo/slot-based-metadata-table-PLAN.md`

## Architecture (locked)

```text
MasterNav: To-ship (leaf)
    ↓
DeskPageChrome
  [ Orders | FBA | … ] .............. [ Add ]
  [ stage header .................... [ Fullscreen ] ]
  [ Mac-width stage | fullscreen stage              ]
       ↓ Orders tab              ↓ FBA tab
  slot DataTable                 FBA board
       ↑
  only RELEASED rows (caged elsewhere / filtered)

Add → scroll-section form → evaluate G1–G3 → Release
```

| Rule | Lock |
|---|---|
| Scan vs desk | `DeskPageChrome` **never** mounts on scan stations |
| Stage default | Fixed max width + center gutters (`DESK_STAGE_MAX_PX` constant) |
| Fullscreen | Top-right; expands stage only; no layout tweens |
| Tabs | In-page; URL SoT; not spine children |
| Add | Rightmost on **tab band** |
| Gates | Product-coded G1–G3; pure `evaluateReleaseGates(order)`; unit-tested |
| Docs SoT | Existing documents stack — no parallel “attachments” table |

## Implementation order

### Phase A — Desk chrome on To-ship

1. Add `DeskPageChrome` (or equivalent under `src/components/layout/` / `src/components/desk/`):
   - props: `tabs`, `activeTab`, `onTabChange`, `addSlot` / `onAdd`, `fullscreen`, `onToggleFullscreen`, `children`
   - stage wrapper with `DESK_STAGE_MAX_PX` when not fullscreen
2. Mount on To-ship / outbound orders desk only.
3. Flatten spine: To-ship L1 has **no children**; tab map = Orders → current unshipped grid, FBA → existing FBA body (route or embedded).
4. URL deep-link for tab (`?desk=orders|fba` or path — one SoT).
5. Fullscreen control top-right of desk chrome.
6. Add button rightmost on tab band → temporarily open existing New Order rail if form not ready; replace in Phase B.
7. Prove scan stations unchanged (no import of DeskPageChrome).
8. `npm run verify:fast` then continue.

### Phase B — Scroll triage form + caged/released

1. Migration (expand first): release state + gate fields / JSONB checklist on orders (or dedicated table). Nullable safe.
2. Pure `evaluateReleaseGates` + unit tests for G1–G3 matrix (docs exempt vs linked; label linked vs bought).
3. Scroll-section form UI:
   - Identity (order #, item #, tracking, title/qty/condition as needed)
   - Link documents to item # **or** “does not require documents”
   - Link shipping label **or** buy shipping label (existing APIs)
   - Review checklist + **Release** (disabled with per-gate reasons until green)
4. Caged visibility: filter/chip on Orders tab — ≤2 interactions to see caged set.
5. Released rows are what the default To-ship Orders grid shows (or default filter = released).
6. Audit who/when released.
7. Wire Add CTA → this form (scroll sections, not a cramped modal). Prefer non-modal right rail / desk panel per import-add-order handoff — **one** intake shell.
8. `npm run verify`

### Phase C — Propagation note only

Document checklist for next non-scan desks. **Do not** port them in this ship.

## Interaction budgets

- See primary Orders info: ≤2 (open To-ship + optional tab already deep-linked counts as entry).  
- Expand fullscreen: 1.  
- Add → fill → Release: form typing is the work; Release itself ≤3 from form open once data is present (open Add, jump to Review, Release).  
- Distinguish caged vs released: ≤2.

## Ultra-code bar

- One `DeskPageChrome`; desks pass data.  
- One gate evaluator; UI only renders results.  
- No `height`/`width`/`layout` framer tweens for expand — instant class swap / CSS.  
- `orgId` from auth ctx on all writes.  
- Stage only files you change; commit only if asked.

## Report back when done

1. Files created/changed (paths only)  
2. `DESK_STAGE_MAX_PX` value chosen and why  
3. URL shape for Orders vs FBA tabs  
4. How Add / form / Release are opened (exact UI path)  
5. Gate persistence shape (migration name)  
6. Proof scan stations untouched  
7. `npm run verify` result  
8. Propagation checklist left for other desks  

Start with Phase A chrome on To-ship, then Phase B gates + form. Do not open a PR unless asked.
