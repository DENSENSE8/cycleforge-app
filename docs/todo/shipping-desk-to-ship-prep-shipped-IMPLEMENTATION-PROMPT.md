# IMPLEMENTATION PROMPT — Shipping desk: To ship · Amazon Prep · Shipped

**Paste everything below the horizontal rule into a fresh Cursor / Claude / Fable agent.**  
Self-contained. Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`shipping-desk-to-ship-prep-shipped-PLAN.md`](./shipping-desk-to-ship-prep-shipped-PLAN.md).

**Compose — do not reimplement:**  
[`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) · [`shipping-desk-fixed-width-FIX-IMPLEMENTATION-PROMPT.md`](./shipping-desk-fixed-width-FIX-IMPLEMENTATION-PROMPT.md) · [`slot-based-metadata-table-PLAN.md`](./slot-based-metadata-table-PLAN.md) · [`non-scan-desk-chrome-caged-release-PLAN.md`](./non-scan-desk-chrome-caged-release-PLAN.md)

You are the **executor**. Finish Waves **0–2** end-to-end. Do not invent a narrower success criterion. Do not put KPI compare tabs on To ship “temporarily.”

---

You are implementing the **long-term Shipping desk IA** for Cycle Forge Warehouse OS:

| Desk | Path | Job |
|---|---|---|
| **To ship** | `/shipping/orders` | Act on **open** outbound work (all platforms aggregated) + lightweight **today** strip |
| **Amazon Prep** | `/shipping/fba` | FBA **process** + prep suggestions (not a marketplace filter) |
| **Shipped** | `/shipping/shipped` | **History / lookup** across platforms (+ room for KPI/compare later) |

**Product law:** To ship = act on open work · Amazon Prep = plan FBA · Shipped = find and measure what already left.

**Scan out** (`/shipping/scan-out`) stays a **scan station** — edge-to-edge; **not** a desk tab twin.

Write production TypeScript/React: typed, small diffs, no drive-by refactors, no layout geometry animations (`height`/`width`/`top`/`left`/framer `layout`). Work on **`main`** only. Do not restart `:3050` / `usav-dev`. Commit only if asked. Stage only files you change.

## Operator locks (non-negotiable)

1. **Three peer desk tabs** under Shipping: To ship · Amazon Prep · Shipped. Spine stays flat (`deskChrome: true`).
2. **Platforms aggregate** inside To ship and Shipped (facets/filters). Do **not** add Amazon/eBay/Shopify as spine or desk peers.
3. **FBA stays Amazon Prep** — process fork. Do not merge the FBA board into the To-ship page component.
4. **Shipped is history-shaped** — date/week window + find first; never unbounded “all shipments” as first paint.
5. **To ship is open-work-shaped** — default paint is the unshipped/open queue. Do not keep Shipped as a peer lifecycle board on `/shipping/orders`.
6. **Today strip on To ship** — open / at-risk / shipped-today counts (≤1 interaction status overview). “Shipped today” navigates to Shipped with today’s window — does **not** swap the main table to archive mode inline.
7. **Legacy URLs redirect** — `/shipping/orders?shipped=`, `/dashboard?shipped=`, assistant shipped hrefs → `/shipping/shipped` with params preserved via existing shipped param SoT.
8. **Packed history** — move under Shipped (inner mode/tab) **or** redirect-only interim documented in the report; do not leave two competing history homes.
9. **Waves 3–4 out of this gate** — Compare / Products / heavy KPI tabs are **specified in the plan** but **not** required to pass Waves 0–2. Do **not** build them on To ship instead.
10. **Compose desk chrome** — fixed-width stage, rail-less Pattern E for desk segments; do not put `DeskPageChrome` on Scan out.

## Outcome (done when — Waves 0–2)

Prove against the working tree and commands:

1. Desk tab strip shows **To ship · Amazon Prep · Shipped**; URLs deep-link; `resolveChild` lights the correct tab.
2. `/shipping/shipped` exists under `shipping/(desk)` layout and mounts the shipped history body (`DashboardShippedTable` + filter well / existing shipped params).
3. `/shipping/orders` defaults to **open work only**; no Shipped peer board as the primary desk mode.
4. Today strip present on To ship (Wave 2) with shipped-today → Shipped navigation.
5. Redirect matrix works (orders/dashboard `?shipped=` → shipped desk; AI hrefs updated).
6. Scan out unchanged and still a Scan Stations surface.
7. Support `?context=support` on orders still resolves to Support, not Shipped.
8. `npm run verify` green.

If any item is unproven, the goal is **not** done.

## Working tree — start from reality

Inspect before editing. Prefer remount + redirect over rewrite.

| Area | Expectation |
|---|---|
| `src/app/shipping/(desk)/layout.tsx` | Desk chrome host — add shipped segment sibling |
| `src/app/shipping/orders/page.tsx`, `fba/page.tsx` | Existing tab bodies — keep |
| `src/components/shipped/DashboardShippedTable.tsx` | History table — remount on new page |
| `src/lib/shipped-dashboard-params.ts` | **Param SoT** — do not fork |
| `src/lib/shipping/orders-desk.ts` | Twin: add `shipped-desk.ts` with `SHIPPING_SHIPPED_PATH` |
| `src/lib/sidebar-navigation.ts` | Add Shipped child; fix `resolveChild` |
| `src/components/desk/useDeskPageChromeTabs.ts` | Tabs follow nav children |
| `src/utils/dashboard-search-state.ts` | Order view flags — stop treating shipped as home on orders desk |
| `src/lib/ai/ops-assistant.ts`, `src/components/ai/ai-answer-enrich.ts` | Update shipped hrefs |
| `src/components/outbound/outbound-sidebar-shared.ts` | Labels already retired; do not revive |

## Build — wave order (locked)

### Wave 0 — IA + path + tabs

1. Add `src/lib/shipping/shipped-desk.ts` — `SHIPPING_SHIPPED_PATH = '/shipping/shipped'`, href helper(s).
2. Add `src/app/shipping/shipped/page.tsx` under the desk layout (stub OK if Wave 1 immediately fills it in the same change set).
3. Register desk child `{ id: 'shipped', label: 'Shipped', … }` next to To ship / Amazon Prep.
4. Update `resolveChild` so `/shipping/shipped` highlights Shipped; orders + support alias rules unchanged.
5. Prove tab strip shows three peers.

### Wave 1 — Promote history body

1. Mount existing shipped table + filter toolbar / well on `/shipping/shipped`.
2. Wire URL state through `resolveShippedQueryArgs` only.
3. Implement redirects:
   - `/shipping/orders?shipped=` → `/shipping/shipped` (+ param map)
   - `/dashboard?shipped=` → `/shipping/shipped` (+ param map)
4. Update assistant / enrich links that hard-code `?shipped=` or `/dashboard?shipped=`.
5. Confirm saved-view surface `dashboard_shipped` still functions (retarget path if the surface resolver keys off pathname).

### Wave 2 — Tighten To ship

1. Ensure default `/shipping/orders` is open-work only (unshipped feed). Remove or redirect any UI that presents Shipped as a peer lifecycle board on this path.
2. Add **today strip**: Open · at-risk/due (existing truth) · Shipped today (click → shipped desk with today window).
3. **Packed:** either
   - mount as Shipped inner mode (`?view=packed` or equivalent) + 307 from `/shipping/orders?packed=`, **or**
   - redirect-only interim + explicit “Wave 2.1 remaining” in the report — **not** silent dual homes.
4. Cross-link: optional compact “Amazon Prep” affordance if FBA ready count exists — must not embed the FBA board.
5. `npm run verify`.

### Waves 3–4 — do not implement in this gate unless operator expands scope

Plan locks IA only: Shipped inner tabs **Shipments | Compare | Products | Exceptions**; KPI band; top products. If you finish 0–2 early, **stop and report** — do not freestyle BI on To ship.

## Non-goals

- Slot-catalog port of Shipped (`tableId: 'shipped'`) — later  
- Redesigning FBA suggestion algorithms  
- Restoring Labels desk tab  
- Platform-named desk tabs  
- Fullscreen/chrome redesign (compose existing)  
- Branches; `:3050` repair; `git stash`; committing secrets  

## Verification (manual + automated)

```bash
npm run verify
```

Manual against the operator’s server (report, do not restart):

1. `/shipping/orders` — open queue + today strip + tabs include Shipped.  
2. Tab **Shipped** — history table + week/date well.  
3. Tab **Amazon Prep** — FBA board.  
4. `/shipping/orders?shipped=` — ends on `/shipping/shipped`.  
5. Scan out from Scan Stations — edge-to-edge.  
6. `/shipping/orders?context=support` — Support pin, not Shipped.

Optional: Playwright path assert for shipped desk (only if auth fixtures already work; do not block on owner 401 — pinless fallback is fine).

## Report back

- Paths changed  
- Tab URL map  
- Redirect matrix (what was tested)  
- Packed decision (moved vs interim redirect)  
- Today strip contents  
- Verify result  
- Explicitly list Waves 3–4 still open  
