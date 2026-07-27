# Research briefing — page-count consolidation & "station-first" IA for a reseller-ops SaaS

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-26
**Deliverable:** (a) a benchmark of this app's surface count/shape against named industry systems, and (b) a specific, defended recommendation on whether to collapse the "main pages" into station-driven surfaces — including which pages to merge, which to keep, and which to delete.

---

## 0. How to use this brief

You do **not** have the codebase. Every fact below was measured from it today. Numbers are real counts, not estimates.

Answer **three separate questions**, in this order, and keep them separate:

1. **What is industry standard?** How do comparable operational products structure their top-level surface count and the page↔mode↔tab hierarchy? Name real products, cite sources, and state the conditions under which each pattern wins. Do not retreat into "it depends."
2. **Is this codebase's page count actually a problem?** Judged against that benchmark and against §4's measured duplication register — not against a general "fewer pages is better" instinct.
3. **Should the main pages collapse into stations?** This is the operator's actual question (verbatim in §7). Take a side. A defended "no, and here is the cheaper fix" is more useful than a generic "consider a hybrid."

Assume the reader is the engineer who will implement the answer. Prefer a concrete migration order over a framework-for-thinking.

---

## 1. Product & existing architecture

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant, "USAV"). One warehouse, a small crew, mixed roles — the same person may receive a carton in the morning and pack orders in the afternoon.

Scale of the codebase (measured):

| Metric | Count |
|---|---|
| Total `src` LOC (`.ts` + `.tsx`) | **670,111** |
| Total `src` files | 4,806 |
| Next.js `page.tsx` files | **137** |
| API route handlers (`route.ts`) | 881 |
| Desktop static pages | 81 |
| Desktop dynamic (`[param]`) pages | 21 |
| Mobile (`/m`) pages | 29 |
| Design-demo pages | 6 |

### 1a. The region-contract vocabulary (already ratified house law — please use it)

Every UI **region** (not page) is classified into exactly one of four contracts. A page with N jobs is N regions. This is enforced in code (`pickArchetype()`), not aspiration.

| Contract | Driven by | Job | Selection model | Density token |
|---|---|---|---|---|
| **Station** | barcode scanner / keyboard wedge | act-and-clear | **ephemeral**, never in the URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | **durable, URL-addressable** | `ops` |
| **Monitor** | filters over a stream | observe only, zero edit | none (filters only) | `rollup` |
| **Canvas** | pan / zoom / focus | reshape a *definition* (draft→publish) | durable focus in URL | `studio` |

The discriminator is a fixed question order: *scanner? → observe-only? → node-graph? → else Workbench (the fallthrough).*

**This matters enormously for question 3.** "Turn the main pages into stations" is, in this vocabulary, a proposal to convert **Workbench** regions into **Station** regions — i.e. to trade durable URL-addressable selection for ephemeral scan-driven act-and-clear. That is a semantic change, not a layout change. Please evaluate it as such.

### 1b. There is already a station-surface registry

A closed, compile-enforced registry (`SURFACE_REGISTRY`) declares 10 first-class operator surfaces, each with a semantic route, an archetype, a permission, and a binding to a workflow-engine node type:

| Surface key | Label | Route | Archetype | Engine node |
|---|---|---|---|---|
| `unbox` | Unbox | `/unbox` | station | receiving |
| `triage` | Arrival | `/triage` | station | receiving |
| `incoming` | Incoming | `/incoming` | **workbench** | receiving |
| `pickup` | Local Pickup | `/pickup` | **workbench** | receiving |
| `repair` | Repair | `/repair` | **workbench** | receiving |
| `history` | Receiving History | `/receiving/history` | **monitor** | receiving |
| `pack` | Packing | `/pack` | station | pack |
| `test` | Testing | `/test` | station | inspection |
| `outbound` | Shipping | `/shipping` | station | ship |
| `support` | Support | `/support` | station | — |

Note the shape: the "receiving station" is **one page_key with six mode_keys**, three of which are *not* stations. The station-vs-workbench line already cuts *through* a single operator surface family. Any recommendation that treats "station" as a page-level property will fight this.

There is also a **Station Workbench** shared anatomy — a 720px column with a sticky identity bookmark, section tabs, and a terminal action dock — mechanically enforced by CI guards, and already adopted by Unbox, Testing, Triage, Shipping, Pack, Pickup, Repair intake, Support. So the *chrome* for "everything is a station" already exists and is already shared. The open question is about **information architecture**, not component reuse.

---

## 2. Complete page inventory

### 2a. Visible in production nav today (the "dogfood surface")

15 rows survive permission + parking filters. `kind` is the nav grouping already in the code.

| # | Nav label | Route | `kind` | Modes (L2) |
|---|---|---|---|---|
| 1 | Dashboard | `/dashboard` | main | 3 |
| 2 | Sales | `/walk-in` | main | 2 |
| 3 | Products | `/products` | main | 6 |
| 4 | Inventory | `/inventory` | main | 5 (but see §4.11) |
| 5 | Warehouse | `/warehouse` | main | 5 |
| 6 | Receiving | `/unbox` | **station** | 5 |
| 7 | Shipping | `/shipping` | **station** | 4 |
| 8 | Testing | `/test` | **station** | 2 |
| 9 | Packing | `/pack` | **station** | 3 |
| 10 | Review | `/review` | **station** | 3 |
| 11 | Support | `/support` | **station** | 6 |
| 12 | Media library | `/ops/photos` | main | 0 |
| 13 | Catalog | `/studio/catalog` | main | 0 (hidden while Studio parked) |
| 14 | Admin | `/admin` | bottom | **17 sections** |
| 15 | Settings | `/settings` | bottom | 8 sub-routes |

### 2b. Parked — hidden from production nav, routes still live

A dogfood soft-gate (`PARKED_SURFACE_KEYS`) removes these from nav and renders a "we're still building this" stand-in unless `DOGFOOD_FULL_SURFACE=1` is set (topic worktrees only). **These are the "hidden from production" surfaces the operator asked about.**

| Key | Label | Route | Modes | Why parked |
|---|---|---|---|---|
| `home` | Home | `/` | — | personal triage / "My Day" — in-flight |
| `operations` | Operations | `/operations` | **5** (Live · Analytics · Insights · History · Signals) | in-flight |
| `sourcing` | Sourcing | `/sourcing` | **5** (Queue · Scout · Watchlist · Searches · Suppliers) | in-flight |
| `fba` | FBA prep | `/fba` | **3** (Plan · Combine · Shipped) | **already relocated** under `/shipping?mode=fba` |
| `studio` | Studio | `/studio` | — (Canvas) | in-flight |
| `ai-chat` | AI Chat | `/ai-chat` | — | in-flight |

Each parked surface has its own git worktree lane and its own dev port. **The parking mechanism is working**: it is how the team ships a focused prod surface while 6 large builds continue in parallel. Any recommendation should treat parking as an asset, not debt.

### 2c. Orphan pages — live routes with **zero** inbound links in the codebase

Measured by grepping every `href`/route literal in `src`. These are reachable only by typing the URL:

| Route | LOC | Notes |
|---|---|---|
| `/reports` | 217 | overlaps Operations→Analytics + Admin→Goals/Quality |
| `/release-notes` | 143 | |
| `/calendar` | 25 (+ WorkOrderCalendar tree) | overlaps Admin→Staff schedule |
| `/open-links` | 38 | |
| `/search` + `/search/history` | 31 | overlaps `/dashboard?mode=search` and ⌘K |
| `/tracking-exceptions` | 19 | overlaps Support→Orders |
| `/admin/inventory/**` | **3,127** (8 pages) | a whole second inventory admin app: bulk-allocate, cycle-counts, events, holds, returns, sku/[sku], throughput, units/[ref] |
| `/design-demo/**` | 661 (6 pages) | dev-only demos shipped in the app router |
| `/photos` | 176 | raw NAS browser; overlaps `/ops/photos` Media library |

**~4,400 LOC across 20 pages that no navigation path reaches.** This is the cheapest, least controversial win available and is independent of the station question.

### 2d. Legacy alias / redirect pages (correct, keep)

`/receiving` → `/unbox`, `/packer` → `/pack`, `/tech` → `/test`, `/outbound` → `/shipping`, `/replenish` → `/inventory?section=replenish`, `/signals` → `/operations?mode=signals`, `/manuals` → `/products`. These preserve bookmarks and are ~11–19 LOC each. Not a problem.

### 2e. Scan / deep-link resolver pages (correct, keep)

`/l/[ref]`, `/s/[sku]`, `/o/[orderId]`, `/p/[tracking]`, `/q/[payload]`, `/serial/[id]`, `/bin/[barcode]`, `/01/[gtin]/21/[serial]` and `/414/[gln]/254/[code]` (GS1 Digital Link). These exist so a physical barcode resolves to a canonical surface. They are infrastructure, not IA.

### 2f. Mobile (`/m`) — a parallel 29-page app

A separate route tree with its own shell, its own 5-tab bottom nav (`home · picks · scan · receiving · packing`), its own drawer nav, and its own immersive photo-capture routes. The desktop nav has a `MOBILE_ALLOWED_PREFIXES` allowlist and a `MOBILE_RESTRICTED_SIDEBAR_IDS` denylist, so several desktop pages are hard-blocked on touch devices.

**The mobile tree is already station-first** — 5 destinations, scan pinned at the top, everything else a drill-down. It is a useful existence proof for question 3, and worth benchmarking separately.

---

## 3. Mode inventory (L2) — the real surface count

The nav is 3-level: **page (L1) → mode (L2) → section tab (L3)**. Modes are URL search-params (`?mode=`, `?view=`, `?tab=`, `?section=`, `?packMode=`, `?fbaMode=`) with a strict round-trip invariant (`resolveMode(to(mode)) === mode`) enforced by tests. Switching a mode clears the other modes' scoped params so each opens clean.

| Page | Param | Modes |
|---|---|---|
| Dashboard | `?mode=` | Search · Receiving · Shipping |
| Operations *(parked)* | `?mode=` | Live · Analytics · Insights · History · Signals |
| Receiving | path-based | Incoming · Arrival · Unbox · Local Pickup · Repair |
| Sourcing *(parked)* | `?mode=` | Queue · Scout · Watchlist · Searches · Suppliers |
| FBA *(parked, hosted on Shipping)* | `?fbaMode=` | Plan · Combine · Shipped |
| Shipping | `?mode=` | Labels · Ready · FBA · Scan out |
| Packing | `?packMode=` | Standard · Fragile · Multi-Item |
| Review | `?mode=` | Packing · Pairing · Catalog link |
| Inventory | path + `?section=` | Ledger · Triage · Pulse · Graph · Replenish |
| Warehouse | `?tab=` | Labels · Racks · Rooms · Bins · Map |
| Products | `?view=` | Catalog · Manuals · Labels · Pairing · QC · Kit Parts |
| Testing | `?view=` | Testing · Shipping |
| Sales | `?mode=` | Local Pickup · Sales |
| Support | `?mode=` | Tickets · Orders · Voicemail · Calls · Warranty · Issues |
| Admin | `?section=` | 17 sections in 4 groups (Performance · Operations · Data & catalogs · System) |

**74 L2 modes across 15 modeful pages.** Plus L3: e.g. the Unbox station's right pane has 10 section tabs (Unbox · Classify · Listings · Ticket · Units · PO note · Checklist · Support · Tracking · Timeline).

So the honest surface count is not "15 pages" — it is **~15 pages × ~5 modes × up-to-10 tabs**. When the operator says "too many pages," the L2/L3 explosion may be the actual felt problem. Please address which level is over-subscribed.

---

## 4. Duplication register — the measured crux

These are the same *entity or job* appearing on multiple surfaces. This, not raw page count, is our strongest evidence that consolidation is warranted. **Each row needs a verdict from you: is this legitimate multi-context access (industry-normal) or a fork to eliminate?**

| # | Job / entity | Appears at | Notes |
|---|---|---|---|
| 4.1 | **Outbound orders** | `/shipping` (station, 4 modes) · `/dashboard?mode=outbound` · `/test?view=shipping` · `/support?mode=orders` · `/o/[orderId]` | **Four** places to look at an unshipped order. Testing's second mode is literally "Shipping." |
| 4.2 | **Inbound cartons** | `/unbox` · `/triage` · `/incoming` · `/dashboard?mode=inbound` · `/receiving/history` · Admin→PO Mailbox | Six. Dashboard's Receiving mode is a table of the same cartons the station works. |
| 4.3 | **Local Pickup / Repair** | `/pickup` + `/repair` (receiving modes) **and** `/walk-in?mode=pickup` (Sales) | A deliberate front-of-house / back-of-house split. Is FOH/BOH separation industry-standard, or a smell? |
| 4.4 | **FBA prep** | `/fba` (parked page, 3 modes) **and** `/shipping?mode=fba&fbaMode=` | Mid-migration; the page is parked but its nav entry still resolves. A **completed** consolidation we can hold up as the template — or a warning. |
| 4.5 | **Label printing** | `/products?view=labels` · `/shipping?mode=labels` · `/warehouse?tab=labels` | Three "Labels." Different label *kinds* (product / shipping / bin) — legitimate, or should there be one Labels surface with a kind switch? |
| 4.6 | **Serial↔SKU pairing** | `/products?view=pairing` **and** `/review?mode=pairing` | |
| 4.7 | **Product catalog** | `/products?view=catalog` **and** `/studio/catalog` | |
| 4.8 | **Photo / media** | `/ops/photos` (Media library) · `/photos` (raw NAS, orphan) · Admin→Receiving Photos · 9 immersive `/m` photo routes | |
| 4.9 | **History / audit trail** | `/receiving/history` · `/operations?mode=history` · `/search/history` · Admin→Operations log · `/settings/audit` · `/audit-log` · Inventory→Activity | **Seven.** There is one shared `EventTimeline` primitive underneath, so this is an IA fork, not a component fork. |
| 4.10 | **Analytics / KPI** | `/operations?mode=analytics` · `/reports` (orphan) · Admin→Goals · Admin→Quality · `/inventory/pulse` · Dashboard KPI strip | Six. |
| 4.11 | **Inventory tabs** | Nav mode rail exposes **5** (Ledger · Triage · Pulse · Graph · Replenish); the code's `INVENTORY_TABS` SoT declares **8** (activity · bins · skus · units · alerts · counts · triage · pulse), each with its own `page.tsx` | Three tabs (bins, skus/units, alerts/counts) have real routes and real search-field configs but **no nav entry**. Nav and data model disagree. |
| 4.12 | **Second inventory admin app** | `/admin/inventory/**` — 8 orphan pages, 3,127 LOC: bulk-allocate, cycle-counts, holds, returns, throughput, events, per-SKU, per-unit | Overlaps `/inventory` (5 modes) and `/warehouse` (5 modes) wholesale. |

---

## 5. The specific proposal to evaluate

The operator's hypothesis: **collapse the "main" pages into the stations, so the app is station-driven end-to-end rather than split between "main pages" and "station pages."**

Concretely, the nav already splits into `kind: 'main'` (9 rows) vs `kind: 'station'` (6 rows) vs `kind: 'bottom'` (2). The proposal is to shrink or eliminate the `main` tier.

### 5a. Arguments in favor (from the codebase's own evidence)

- **The station chrome is already the shared waist.** The Station Workbench anatomy (identity bookmark → section tabs → terminal dock) is CI-enforced and adopted by 8 surfaces. Pushing more surfaces onto it costs less than it would in a codebase without that waist.
- **Modes already do the work of pages.** 74 L2 modes vs 15 pages: the app has *already* consolidated once (Unbox/Triage/Incoming/Pickup/Repair share one page_key; FBA moved under Shipping; Warranty moved under Support; `/replenish` and `/signals` became modes).
- **The mobile app is already 5 destinations** and works.
- **Duplication register §4** shows the main-tier pages (Dashboard, Products, Inventory, Warehouse, Sales) are where most of the overlap lives.

### 5b. Arguments against (constraints that must be respected)

- **Station selection is ephemeral by contract; Workbench selection is durable and URL-addressable.** Collapsing a Workbench into a Station means giving up deep-linkable `?skuId=`/`?open=` state. Products, Inventory, Support, Review, and the order workspace all rely on it. Converting them is a **capability loss**, not a reskin.
- **A Station must not host a browsable list.** House law: "don't put a browsable, clickable list in the scan column — it competes with scan focus." A "Products station" is a contradiction in the current vocabulary unless the browse region is split out as its own Workbench region.
- **Mixed roles are the real user.** A one-warehouse reseller has a single operator doing receiving, then packing, then answering a support ticket. Role-based navigation (which is what a pure station model implies) may not match a crew where roles are not partitioned.
- **The parked surfaces will come back.** Home, Operations, Sourcing, Studio, AI Chat are all funded, in-flight builds with their own worktrees. A consolidation designed around today's 15 rows must survive +6 surfaces and +13 modes returning. **Design for 21 pages, not 15.**
- **Some "main" pages are genuinely reference data**, not operator work: Admin's 17 sections, Settings' 8, Products' Catalog/QC/Kit-Parts. Those are configuration surfaces. Making them stations would be a category error.

### 5c. Middle paths worth evaluating explicitly

Please score these against each other, don't just pick one:

- **(A) Full station-first.** Kill the `main` tier; every operator job becomes a station surface with modes; reference data becomes settings-like config screens.
- **(B) Keep the two tiers, kill the duplication.** Leave main-vs-station; merge the §4 forks; delete the §2c orphans; reconcile §4.11. Roughly: −20 orphan pages, −6 duplicated jobs, no contract changes.
- **(C) Role/lane-based entry.** Replace the flat nav with a small set of *lanes* (Inbound · Bench · Outbound · Desk · Admin), each of which owns its stations and its reference surfaces. Page count unchanged; the *nav* shrinks to ~5 top-level entries.
- **(D) Command-first.** Keep the pages, demote the nav. ⌘K + scan-to-resolve become the primary navigation; the sidebar becomes a short MRU list. (The app already has a ⌘K palette, an F2-bound global scan hotkey, and 9 barcode deep-link resolver routes — the substrate exists.)
- **(E) Do nothing structural; fix the L2/L3 explosion instead** — e.g. cap modes per page, or flatten Admin's 17 sections.

---

## 6. Hard constraints (a recommendation that violates these is unusable)

1. **Multi-tenant.** Nav is permission-filtered per staff role; every surface has a `requires` permission and a route-level middleware gate. A recommendation must survive a tenant where half the surfaces are invisible.
2. **The four region contracts are ratified law.** You may argue a specific region is mis-classified. You may not propose a fifth contract without justifying it against the existing four.
3. **URL is the state SoT for Workbench and Canvas.** Selection, mode, and (increasingly) filters live in search params. Deep links and reload-safety are non-negotiable for those contracts.
4. **Scanner-driven regions short-circuit to Station.** Hands-busy operators, focus-locked scan bar, F2 global refocus. Anything that steals scan focus is a regression.
5. **Legacy routes keep resolving.** Bookmarks and printed barcodes point at old URLs; consolidation happens via redirect aliases, never by deleting a route.
6. **Parking is the shipping mechanism.** Six surfaces are mid-build in parallel worktrees. A big-bang IA change that requires all six to land first is not actionable.
7. **The engine binding is real.** Surfaces bind to workflow-engine node types (`receiving`, `pack`, `inspection`, `ship`). Merging two surfaces that bind to different engine nodes has backend consequences.

---

## 7. The questions, verbatim

The operator asked:

> Compare this codebase against industry standard. What pages would I be able to simplify and shrink down? Would it be worthwhile to shrink down the main pages and condense the main pages into stations and have entirely more focused and station-driven, instead of having a main/station page split? Currently there's just too many pages.

Decompose it into these, and answer each:

**Q1 — Benchmark.** For operational/warehouse/ops-console software, what is the industry-standard top-level surface count and hierarchy depth? Name systems (WMS: Fishbowl, Sortly, ShipHero, Katana; ops consoles: Linear, Stripe Dashboard, Shopify Admin, Retool; POS/floor: Square, Toast, Lightspeed). Where does 15 nav rows / 74 modes / 137 routes actually sit — normal, high, or extreme? Cite sources.

**Q2 — Is "too many pages" the right diagnosis?** Given §3 (3-level hierarchy) and §4 (duplication), is the felt problem the page count, the mode count, the duplication, or the *navigation* (how you get there)? If the operator's stated diagnosis is wrong, say so and name the real one.

**Q3 — Station-first: yes or no?** Evaluate (A)–(E) from §5c. Pick one primary path. Where the industry answer conflicts with a §6 constraint, say so explicitly and choose a side with reasoning — a defended deviation beats a generic hybrid.

**Q4 — The concrete merge list.** For each of the 12 duplication rows in §4, give a verdict: **MERGE** (into which surface), **KEEP-BOTH** (with the justification), or **DELETE**. Then order the merges by (value ÷ risk).

**Q5 — The delete list.** Which of the 20 orphan pages in §2c should be deleted outright vs. wired into nav vs. left as unlinked utilities? Is shipping dev-only demo pages in the production app router a real problem or cosmetic?

**Q6 — Target-state nav.** Give the actual proposed top-level nav — the literal row list — for the dogfood surface today **and** for the state after the 6 parked surfaces return. If your answer is a lane/role model (path C), specify the lanes and their membership.

**Q7 — What breaks.** Name the top 3 things that go wrong if this consolidation is done badly, and the leading indicator for each.

---

## 8. What a good answer looks like

- **Named systems and citations**, not "many products do X."
- **A single primary recommendation**, with the runners-up scored and the tradeoff stated.
- **The §4 table filled in** with a verdict per row.
- **A literal target nav list**, not a description of one.
- **An ordered migration sequence** — what ships first, what can wait, what must never be attempted in one PR.
- **Explicit conflicts flagged.** Where industry standard fights a §6 constraint, we want the conflict named and a side taken.
- Uses the Station / Workbench / Monitor / Canvas vocabulary throughout.

What we do **not** want: a maturity model, a "consider your users' needs" framework, a recommendation that requires the 6 parked surfaces to land first, or a plan whose first step is a rewrite.
