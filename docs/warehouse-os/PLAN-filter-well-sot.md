# Filter Well SoT — one feed, two faces, on every desk

**Status:** plan, not yet built. Wave 0 (Packed) is the reference implementation;
every later wave is a port of it, not a re-invention.

**Operator ruling (2026-08-27):** *"this must be ported as SoT to all pages not
just the packed page."*

---

## 1 · The contract

Five rules. A desk either satisfies all five or it has not been ported.

| # | Rule | Failure it prevents |
|---|---|---|
| **1** | **The find well is filter-first, and paste is the last glyph in the form.** L→R: search glyph · placeholder/query · exact-filter chips · clear (X) · funnel · **paste**. Nothing renders right of paste inside the form. A typed-query clear X sits *left* of paste. | Paste is a utility, not a filter. When it floats mid-row the operator's eye has to re-find the funnel on every desk. |
| **2** | **One feed per surface.** A single `use<Surface>Feed()` hook, keyed off the URL, is the only query the sheet, the KPI strip, the export and the chart read. No second query for the chart. | Two queries drift. The chart says 91, the sheet says 5, and neither is wrong on its own terms. |
| **3** | **The sheet shows every row the filter admits.** No client-side truncation to match a glanceable cap. Empty states name the active window in exact terms ("nothing packed AUG 23rd – 29th"), never "nothing here". | A capped sheet silently lies about the size of the set. |
| **4** | **The View rail shows the same set as a chart, with every bucket.** No top-N. Legend lists all buckets including `Unassigned`. Headline label + total match Band 2 for the same URL. | Band 2's 5-tile cap is glanceable by design; the operator still needs the complete breakdown somewhere. |
| **5** | **Chart selection is the same URL param the chips read.** Slice or legend click writes `?<facet>=`; clicking the active one clears it. Other params (date window, search) survive. | Chart-local state is a second selection model that the chips and sheet cannot see. |

**The invariant that ties them together, per surface, for one URL:**

```
chart total  ===  sheet row count  ===  Band 2 headline
```

---

## 2 · Built once (so a port is cheap)

| Artifact | Path | What it is |
|---|---|---|
| Facet summary | `src/lib/filters/summarize-facet.ts` | Generalizes `summarizePackedFilter`. `summarizeByFacet(rows, spec)` → `{ total, buckets: [{ key, label, value, share }] }`. The spec supplies key/label/dedupe. Packed's package-dedupe (`packedPackageKey`) becomes a spec, not a fork. |
| Rail face | `src/components/filters/FilterBreakdownRail.tsx` | Pie + legend + slice→param wiring. Props: `{ buckets, activeKey, onSelect, headline, total }`. Composes the existing `GaugeDonut` (`interactive`, `onSelect`, `activeKey` are already there) inside `KpiChartCard` chrome. |
| Feed shape | `src/lib/filters/surface-feed.ts` | `SurfaceFeed<TRow>` type: `{ records, query, params, summary }`. **Required prop, no default** — a rail that mounts without a feed will not compile (LAWS `X1` → `TYPE` enforcement). |
| Well order | `src/design-system/primitives/SearchField.tsx` | Already correct: `trailingPrefix → [persistent paste] → trailingControl → trailingSuffix`. The port is a *usage* rule — chips+funnel go in `trailingPrefix`; **no desk passes `trailingSuffix` alongside paste**. |

`summarizePackedFilter` stays as a thin wrapper so nothing in Packed changes
shape while the generalization lands.

---

## 3 · Wave 0 — Packed (the reference)

Files: `OutboundFilterStrip.tsx` (`usePackedFindFieldChrome`),
`OutboundWorkspaceHeader.tsx` (`OutboundPackedFindBar`), `PackedOrdersTable.tsx`,
`OutboundKpiStrip.tsx` (`PackedStrip`), `OrdersViewControlsRail.tsx`,
`usePackedOrdersFeed.ts`, `packed-filters.ts`.

1. **Paste last.** Packed already routes chips+funnel through `trailingPrefix`,
   so paste already trails them. The work is to *prove* it and to stop a
   `trailingSuffix` from ever landing right of paste on this bar.
   → `dateChip.x < funnel.x < paste.x`.
2. **Sheet completeness.** `PackedOrdersTable` already binds
   `usePackedOrdersFeed().records`. Keep it whole; rewrite the empty state to
   name the window.
3. **Pie on the View rail.** When Packed is the lane and the View shell is open
   (`detail:orders-view`, no row selected), `OrdersViewControlsRail` renders
   `FilterBreakdownRail` over `summarizePackedFilter(records).byStaff` — every
   packer, package counts, share. Same `records` as the sheet.
4. **Slice ↔ `?staff=`.** Slice/legend click writes `staff`; active slice or an
   "All staff" legend row clears it. `dateFrom`/`dateTo`/`search` untouched.
5. **Occupancy.** A selected order (`context="packed"`, Root Index) still wins
   the rail. Pie is View-rail content, not a second Band 2, and not inside a
   single order. If Packed lands with the inspector already open, the pie shows
   there until a row is clicked.

---

## 4 · Port waves

Each surface names its **facet** (what the pie slices by) and its **feed hook**.
A wave is done when the five rules hold and its e2e passes.

| Wave | Surface | Route | Facet | Feed |
|---|---|---|---|---|
| **0** | To Ship · Packed | `/shipping/orders?packed=` | packer (`?staff=`) | `usePackedOrdersFeed` |
| **1** | To Ship · Pending / Tested / Shipped | `/shipping/orders` | tester / packer / carrier | `unshippedOrdersQuery` feed |
| **1** | Labels · FBA · Scan-out | `/shipping/*` | carrier / plan / station | per-surface |
| **2** | Unbox · Triage · History · Incoming · Pickup | `/receiving/*` | receiver / exception code / source | receiving feeds |
| **3** | Photos · Support tickets | `/photos`, `/support` | scope / assignee | existing queries |
| **4** | Inventory · Locations · Warehouse | `/inventory*`, `/warehouse` | location kind / bin | existing queries |
| **5** | Repair · Walk-in · Pack station · Search | `/repair`, `/walk-in`, `/pack`, `/search` | technician / desk / kind | existing queries |

Scope check: **48** files mount `TechRailSearchBar` today; ~20 are real
workbench headers with a sheet + rail. The rest are sidebars and pickers and are
**out of scope** — they have no sheet to keep honest.

---

## 5 · Enforcement (LAWS `X1`: no regex-over-source guards)

| Invariant | How it is pinned |
|---|---|
| One feed | `SurfaceFeed<TRow>` required prop, no default — `TYPE` |
| Paste last | Mounted DOM test on `SearchField`: with `trailingPrefix` set, paste is the last child of the trailing row — `TYPE`/DOM |
| Chart total === sheet count | Unit test on `summarizeByFacet` + per-surface e2e — `TOOLING` |
| Slice ↔ param | Per-surface e2e (click slice → URL param → chip appears) — `TOOLING` |

Proposed laws to append to `LAWS.md` § Q (next free numbers **Q5–Q8**), one per
contract rule that outlives this plan.

---

## 6 · Verification — what to click, per wave

Run against `http://localhost:3050` with `tests/.auth/qa-admin.json`.
**Not `127.0.0.1`** — the session cookie is scoped to `localhost` and the first
probe there is a false fail.

### Wave 0 · Packed

| # | Do this | Expect |
|---|---|---|
| 1 | Open `/shipping/orders?packed=` | URL gains `dateFrom=<Sun>&dateTo=<Sat>`; well shows `AUG 23rd - 29th` · X · funnel · paste |
| 2 | Look at the well, left to right | chips → X → funnel → **paste last**; nothing right of paste |
| 3 | Open the View rail with no row selected | Pie + legend, one entry per packer in the window |
| 4 | Compare pie centre total vs Band 2 headline vs sheet rows | All three equal |
| 5 | Click a slice | `?staff=` appears; sheet narrows; staff chip appears in the well; date window unchanged |
| 6 | Click the same slice again | `staff` gone; sheet and pie return to all packers |
| 7 | Type in find | Sheet **and** pie narrow together |
| 8 | Click a row | Packed inspector takes the rail; pie yields |
| 9 | Dismiss the date chip (X) | `allDates=1`; week does not re-seed |

```bash
npx playwright test tests/e2e/to-ship-packed-sheet.spec.ts --project=qa-desktop
```

### Every later wave

Same nine steps with that surface's facet substituted, plus:

```bash
npm run verify
```

---

## 7 · Sequencing

Wave 0 lands first and alone — it is the thing every later wave copies, so it
is worth getting wrong once rather than seven times. Waves 1–5 are independent
of each other and can land in any order, one surface per commit, each with its
e2e. No wave starts before the shared primitives in § 2 exist.
