# Research briefing — Master-nav Vercel-style drill-in (spine)

**For:** Gemini Pro (deep research) — optional pressure-test; **engineering default below is already the
in-repo UX verdict** and is what we ship unless Gemini overturns it with named product evidence.
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject:** Replace *some* always-expanded L1 clusters with a Vercel Observability-style
**drill-in** (root row + chevron → replace list with back + children), without destroying the
floor station jump map.
**Status:** Hybrid default **RATIFIED** (Gemini 2026-07-30) and **implemented** for Stock;
Stations/Main stay static nests. Motion polish: opacity-only `framerPresence.spineDrill`
(≤150ms) — no horizontal slide. Auto-drill must not steal focus.

**Do not re-litigate:**

| Prior brief / plan | Already decided |
|---|---|
| `contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md` | Spine vs context rail vs detail stack |
| `page-consolidation-station-first-…` | Do not collapse Main into Stations |
| `station-nav-floor-desk-…` | Floor / Desk membership + static micro-eyebrows |
| `main-nav-overview-stock-HANDOFF.md` | Stock is its own L1 after Stations (not a Main nest) |

---

## 0. How to use this brief

You do **not** have the codebase. Facts below were measured 2026-07-30.

Three deliverables:

1. **Industry pattern** — When do Vercel/Linear-style drill-in left navs win vs always-expanded
   section eyebrows in ops / seller / WMS / B2B console products? Name products.
2. **Take a side on §6** — especially whether our hybrid default is right for *scan-floor* crews.
3. **Answer §7** with sources. Prefer a migration order an engineer can paste — not a framework.

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS (USAV = dogfood only). Kinetic Ledger UI:
dense, scan-aware, quiet chrome.

| Contract | Job |
|---|---|
| **Station** | barcode act-and-clear |
| **Workbench** | pointer pick → edit |
| **Monitor** | observe only |
| **Canvas** | graph reshape |

**Spine** = 240px resident **push** column (`SidebarNavColumn`) — page list only. L2 **Mode +
Recents** live in **GlobalHeader** (locked — never move back into the spine).

---

## 2. Measured anatomy (2026-07-30)

```
Root (before Stock drill-in):
  MAIN
    Overview → Dashboard (+ Home/Ops when unparked)
    Library  → Media (+ Catalog when unparked)
  ── hairline ──
  STATIONS
    Floor → Receiving → Testing → Packing → Shipping
    Desk  → Review, Support
  ── hairline ──
  STOCK (flat) → Products → Inventory → Warehouse
  footer pin → Settings / Admin
```

- Mode depth today = **in-place accordion** (`expandedKey` + `ChevronDown` + spline) — **not**
  list-replace drill-in.
- Closest back+replace UX in-app: repair `ProductSelector` (domain picker), not master-nav.
- Former Media folder drill was **removed** (two-shapes-for-one-job).

---

## 3. Engineering UX verdict (shipped default)

**Do not full-Vercel-drill the spine.** Hybrid:

| Cluster | Treatment | Why |
|---|---|---|
| **Stations (Floor/Desk)** | Keep **static nests** — all benches visible on root | Floor operators need one-tap Receiving↔Packing↔Shipping. Hiding the pipeline behind a drill **replaces the map** (Workbench anti-mix). N≈6 is below typical drill thresholds. |
| **Main (Overview/Library)** | Keep **static nests** | Mostly leaves (Dashboard, Media). Drill buys almost nothing. |
| **Stock** | **Vercel drill-in** — root row + `ChevronRight` → back + Products / Inventory / Warehouse | Secondary catalog/bin cluster; collapses three modeful workbenches into one root affordance; auto-opens when URL is a stock page. Matches Vercel “Observability” for a multi-child *non-floor* section. |
| **Page → modes** | Keep **header Mode** + optional accordion on the page row | Never a second drill altitude for modes. |

```
Root after Stock drill:
  MAIN … (unchanged nests)
  ── hairline ──
  STATIONS … (unchanged nests)
  ── hairline ──
  Stock          >     ← single drill row (active tint if URL is stock)
  footer Settings/Admin

Stock drill:
  < Stock
  Products / Inventory / Warehouse  (+ mode accordion as today)
  footer Settings/Admin
```

**Strongest case against this default:** Inventory is a daily jump for some roles — one extra tap
(or rely on auto-drill when already on `/inventory`). Acceptable: Recents/Mode in the header
already cover cross-page jumps; root stays readable.

**What we reject:** Drill-in for Stations; drill-in for page→modes; full root flat of every page
with chevrons on every parent (Vercel-pure) for this product.

---

## 4. Implementation touchpoints (compose)

| Concern | Where |
|---|---|
| Drill state | `MasterNav` — `drillId: 'stock' \| null`; auto-enter when `activePage.kind === 'stock'` |
| Render | `SidebarNavList` — root Stock row vs drill body with back header |
| SoT | `kind: 'stock'` rows already in `sidebar-navigation.ts`; label from a small `STOCK_DRILL` const |
| Guard | `main-nav-groups.guard.test.ts` — Stock drill chrome, no label twin |
| Display law | `.claude/rules/display/workbench.md` + `source-of-truth.md` |

---

## 5. Deep research questions

1. **Floor map vs drill.** For standing scan-floor apps with ≤8 workcenters, do named WMS/POS
   products keep benches always visible or hide them behind a section drill? Cite products.
2. **Secondary clusters.** Do seller hubs / Shopify Admin / Amazon Seller Central put catalog /
   inventory / warehouse behind a single parent row with drill or slide, while leaving
   “Orders / Home” flat?
3. **Auto-drill on route.** When the URL is inside a drilled section, is auto-opening that
   section on nav open industry-standard? Any a11y/focus pitfalls?
4. **Anti-mix.** Does replacing the L1 list with section children violate “don’t replace the
   map,” or is the root still the map when Stations remain expanded?
5. **Threshold N.** At what child count does a static nest lose to drill-in? Our Stock N=3,
   Stations N=6.
6. **Motion.** Horizontal slide vs crossfade vs instant for 240px push spines — what do
   Linear / Vercel / Stripe Dashboard actually do?
7. **Overturn test.** What evidence would justify drilling **Stations** anyway (or *not*
   drilling Stock)?

---

## 6. Decisions to ratify or overturn

| # | Default | Overturn if… |
|---|---|---|
| D1 | Stock drills; Stations/Main do not | Named floor apps prove drill-in for workcenters reduces errors |
| D2 | Auto-drill when `kind === 'stock'` | Evidence that sticky root + active tint alone is enough |
| D3 | Modes stay accordion + header Mode — never a mode drill level | — (locked house law) |
| D4 | Footer Settings/Admin stay pinned during Stock drill | Industry keeps utility links only on root |
| D5 | No URL param for drill level (UI state + route kind) | Deep-link share of “spine on Stock list” becomes a real ask |

---

## 7. Out of scope

- Moving Mode/Recents into the spine
- Collapsing Main → Stations
- Changing Floor/Desk labels or membership
- Reintroducing MasterNav flyout
- Media facet-rail drill (already removed)

---

## 8. Paste checklist for implementer (done for Stock)

1. `STOCK_DRILL` SoT label; root Stock row + `ChevronRight`.
2. Drill body: back (`ChevronLeft`) + stock pages; keep mode accordion.
3. Auto-enter/leave from `activePage.kind`.
4. Guard + display/SoT row.
5. `npm run verify`.
6. Drill swap = named opacity-only SoT (`spineDrill`); no `x` slide; no focus steal on auto-drill.

---

## 9. Gemini ratification (2026-07-30)

Industry: WMS/POS (Odoo, ShipBob, Shopify POS) keep floor workcenters always visible; seller
hubs leave Orders flat and put catalog/inventory behind a parent. Vercel-style auto-drill on
route is standard — **a11y:** do not steal keyboard focus on page load.

| Decision | Verdict | Rationale |
|---|---|---|
| **D1** Stock drills; Stations/Main do not | **RATIFY** | Floor apps need 1-tap workcenters + spatial map; Stock is a secondary admin domain. |
| **D2** Auto-drill when `kind === 'stock'` | **RATIFY** | Contextual sidebar norm (e.g. Vercel project scope). |
| **D3** Modes stay accordion + header Mode | **RATIFY** | Avoid drill fatigue; single-drill constraint. |
| **D4** Footer Settings/Admin stay pinned | **RATIFY** | Shopify Admin–style utility pin. |
| **D5** No URL param for drill level | **RATIFY** | UI derived from `activePage.kind`; no shareable value. |

**Motion:** Prefer fast crossfade (&lt;150ms) or instant on a 240px push spine — **not** horizontal
slide (Vercel-like; Linear often instant). Implemented as `framerPresence.spineDrill` /
`framerTransition.spineDrill`.

**Overturn test (Stations):** Only if workers are strictly siloed *and* station count &gt; 8–10.
Cycle Forge needs Receiving↔Packing 1-tap — Stations must not drill.
