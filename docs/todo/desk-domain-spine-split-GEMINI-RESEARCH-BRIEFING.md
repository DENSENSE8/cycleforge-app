# Research briefing — split Triage Desk into domain top-level spine categories

**For:** Gemini Pro (deep research) — **you do not have the codebase.** Every inventory fact below was measured from source on **2026-08-01**. Do not invent file paths or claim to have inspected source.
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Subject:** How to **empty Triage Desk** by promoting its pages (and Print Stations) into **domain top-level MasterNav section drills** — Sales, Support, Catalog / Manage Products, Inventory, Shipping desk-work, etc. — matching **2026 industry IA** for reseller / marketplace / WMS / helpdesk ops products, including Amazon-style **one Manage Products surface that owns catalog + listings + related jobs**.
**Status:** Gemini answered 2026-08-01 — IA locked. **IMPLEMENTED 2026-08-01** (nav SoT + guards; see [`desk-domain-spine-split-CLAUDE-CODE-PROMPT.md`](./desk-domain-spine-split-CLAUDE-CODE-PROMPT.md) §9 for what shipped, what deferred, and why). Do not re-open D1–D14.
**Deliverable (research):** (a) industry survey; (b) target spine map; (c) D1–D14; (d) migration order — **received**. Implementation handoff carries the locked map + `:3050` acceptance matrix.

**This brief is NOT “add more root buttons.”** It is: **replace the overloaded Triage Desk grab-bag with domain sections that match how operators and industry name the work**, while **combining sibling jobs inside fewer pages** (Amazon Manage Inventory / Manage Products pattern) instead of one L1 row per micro-task.

---

## 0. Method

### 0.1 Your job

1. **Survey** how comparable 2025–2026 products structure **top-level nav domains** vs **one mega “desk / workspace / more” bucket**.
2. **Propose a target MasterNav root** that splits today’s Desk + Print Stations inventory into **named domains** (Sales, Support, Catalog, …). Cap root section count; defend the number.
3. **For each domain**, say which of today’s L1 pages become **modes / tabs inside one Manage-* page** vs stay separate L1 pages. Use Amazon Seller Central “Manage Inventory / Manage Products / Manage Orders” as a **pattern class**, not a literal clone.
4. **Reconcile** against Cycle Forge constraints in §1. Where industry conflicts with a constraint, pick a side and defend.
5. Answer §6 decisions **one by one** — no soft “hybrid / it depends” without a default.

### 0.2 Sources to cover (minimum)

| Class | Named examples (start here; expand) | Use for |
|---|---|---|
| **Marketplace seller consoles** | Amazon Seller Central, eBay Seller Hub, Walmart Seller Center, Etsy Shop Manager, Shopify Admin | Manage Products / Orders / Shipping / Customer service IA |
| **WMS / 3PL / fulfillment** | ShipBob, ShipStation, Extensiv / ShipHero, Linnworks, Skubana/Linnworks lineage, Fishbowl | Inventory vs warehouse vs shipping splits |
| **Helpdesk / CX** | Zendesk Agent Workspace, Gorgias, Freshdesk, Front, Plain | Support as its own top-level vs nested under Desk |
| **POS / front-of-house** | Square Dashboard, Lightspeed, Shopify POS | Sales / pickup / walk-in vs warehouse |
| **B2B ops SaaS nav** | Linear, Stripe Dashboard, Attio, Retool apps (patterns) | Domain sections vs flat lists vs mega-menus |
| **Research** | Nielsen Norman Group IA / navigation depth; Polar / Carbon / Polaris nav guidance | Depth caps, polyhierarchy cost |

Where industry splits, give **both** positions, conditions each wins under, then pick one for **this** product.

### 0.3 Scoring axes (mandatory for every proposed domain / merge)

Score 1–5 on each; report a table. No sixth axis.

| Axis | Meaning |
|---|---|
| **Findability** | New hire finds Sales / Support / Products without learning “Triage Desk” folklore |
| **Task fit** | Section name matches the job the operator is about to do |
| **Combine ROI** | Putting jobs under one Manage-* page reduces hops more than it adds mode overload |
| **Fit** | Compounds on existing spine drills + modes + Desk/Floor contracts |
| **Blast radius** | Nav SoT only vs route remounts vs permission model vs shell chrome |

**ROI ≈ (Findability × Task fit × Combine ROI × Fit) / (6 − Blast radius).** Rank descending. State cut line.

### 0.4 Closed forever (do not recommend unless Ask-first with strong evidence)

- A second nav registry outside `sidebar-navigation.ts` / `SPINE_SECTIONS`
- Folding **carrier shipping labels** into the product/bin **print hub** (already ruled: three Labels jobs stay distinct)
- Converting Workbench browse surfaces into scanner-first Stations (selection must stay URL-durable)
- Role-gated **different root maps** that reinvent the entire IA per role (permission filter on rows is OK; a second spine grammar is not)
- Reintroducing parked `/manuals` as a third manuals home

---

## 1. Product constraints (ground truth)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb is the dogfood tenant only — do not frame recommendations as “USAV internal tool”). Mixed roles: one operator may receive, pack, print labels, then answer a ticket in one shift.

### 1a. Region contracts (already house law — use these words)

| Contract | Driven by | Selection |
|---|---|---|
| **Station** | barcode / keyboard wedge | ephemeral, not in URL |
| **Workbench** | pointer | durable, URL-addressable |
| **Monitor** | observe stream | filters only |
| **Canvas** | pan/zoom definition | durable focus |

**Scan Stations (`floor`)** stay scan-first benches. This brief is about **Desk + Print**, not rewriting Arrival/Unbox/Pack/Scan-out.

### 1b. Current spine (live 2026-08-01)

```text
TOP PIN:  Home · Search · Media · Chat
SECTIONS: Analytics Monitor → Scan Stations → Triage Desk → Print Stations → Workflow Studio
FOOTER:   Admin · Settings
```

**Triage Desk today is the problem statement:** it mixes inbound browse, outbound desk shipping, support, review, dashboard boards, stock, and products — then Print Stations was carved out for print tasks. The operator now wants the **rest of Desk** split the same way: **domain sections**, not one overloaded Desk.

### 1c. Hard laws that survive any recommendation

1. **One nav SoT** — `APP_SIDEBAR_NAV` + `SIDEBAR_PAGE_NAV` + `SPINE_SECTIONS` + `spineSectionIdForPage`.
2. **Carrier Labels ≠ print hub** — Desk Shipping → Labels (`/shipping/labels`) stays postage; product/bin/receiving stickers are print jobs.
3. **Polyhierarchy with restraint** — aliases OK; do not clone workspaces.
4. **Modes stay always-expanded** under a page (pinned count, no accordion return).
5. **Permission filter** — rows/modes with `requires` disappear when the staff lacks them; empty domains must not show as hollow sections.

---

## 2. Complete inventory to re-home (measured)

Every row below must appear in your target map under **exactly one primary section** (alias secondary OK if you name both).

### 2a. Triage Desk — L1 pages (in spine order)

| # | Nav id | Label | Route (canonical) | Modes / children (L2) | Job in one line |
|---|---|---|---|---|---|
| D1 | `incoming` | Incoming | `/incoming` | *(modeless)* | Browse / prioritize inbound POs before floor Arrival |
| D2 | `review` | Review | `/review` | Packing · Pairing · Catalog link | Approve packed work; serial/SKU pairing; import↔catalog link |
| D3 | `support` | Support | `/support` | Tickets · Orders · Voicemail · Calls · Warranty · Issues | Helpdesk + warranty + exception orders |
| D4 | `outbound` | Shipping | `/shipping/labels` (+ ready/fba paths) | Labels · Ready · FBA | Carrier labels, ready-to-ship queue, FBA prep (**not** Scan out) |
| D5 | `dashboard` | Dashboard | `/dashboard` | Receiving · Shipping · Sales · Local Pickup | Domain triage **boards** (tables + KPI), not floor stations |
| D6 | `sourcing` | Sourcing | `/sourcing` | Queue · Scout · Watchlist · Searches · Suppliers | Demand / buy-side acquisition |
| D7 | `inventory` | Inventory | `/inventory` | Ledger · Triage · Pulse · Graph · Replenish | Stock ledger, exceptions, pulse, graph, replenish |
| D8 | `warehouse` | Warehouse | `/warehouse` | Labels · Racks · Rooms · Bins · Map | Physical layout + bin/rack label print UI |
| D9 | `products` | Products | `/products` | Catalog · Manuals · Labels · Pairing · QC · Kit Parts | Catalog + manuals + product labels + pairing + QC + kits |

**Desk L1 count = 9 pages. Mode count under Desk ≈ 4+3+6+3+4+5+5+5+6 = 41 L2 modes** (plus modeless Incoming).

### 2b. Print Stations — L1 pages (already split out of Desk)

| # | Nav id | Label | Route | Modes / children | Job in one line |
|---|---|---|---|---|---|
| P1 | `print-labels` | Print Labels | `/products?view=labels` (default) | Product · Warehouse · Receiving | Task drill for sticker print; aliases into Products Labels / Warehouse Labels / Unbox |
| P2 | `print-documents` | Print Documents | `/products` (manuals default) | *(modeless alias)* | Task drill for manuals / document print |

**Print is already a task-axis section.** Decide whether it **stays**, **folds into Catalog / Warehouse Manage pages**, or **becomes a mode under those Manage pages** with Print Stations removed.

### 2c. Not in scope for re-homing (context only — do not move into Desk domains)

**Scan Stations (`floor`):** Receiving subgroup Arrival · Unbox · Local Pickup · Repair Service; then Testing · Packing · Scan out.  
**Monitor:** Operations (Live · Analytics · Insights · History · Signals · Reconcile).  
**Studio:** Studio · Catalog (definition Canvas — distinct from Products Catalog).  
**Pins / footer:** Home · Search · Media · Chat · Admin · Settings.

### 2d. Known duplication (must rule keep-as-alias vs merge)

| Dup | Surfaces | Tension |
|---|---|---|
| Product labels | Products → Labels **and** Print Labels → Product | Same URL; intentional polyhierarchy today |
| Warehouse labels | Warehouse → Labels **and** Print Labels → Warehouse | Same |
| Receiving stickers | Unbox (floor) **and** Print Labels → Receiving | Floor owns work; Print is entry |
| Manuals | Products → Manuals **and** Print Documents | Same URL |
| Pairing | Products → Pairing **and** Review → Pairing | Two jobs or one? |
| Catalog | Products → Catalog **and** Studio → Catalog | Reference vs definition Canvas |
| Sales history | Dashboard → Sales / Local Pickup; floor Pickup/Repair for intake | FOH history vs BOH intake |
| Outbound orders | Shipping desk modes · Dashboard Shipping · Testing→Shipping · Support→Orders | Four doors (prior brief §4.1) |

---

## 3. Operator hypothesis (verbatim intent)

> Triage Desk holds too much. Print was carved into its own top drill because printing is a different **task**. The same should happen for the rest: top-level categories like **Sales** and **Support**, with pages that exist for that exact reason — matching industry standards. Combine multiple actions inside one page the way **Amazon Manage Products** combines catalog, listings, and related management — not one nav row per micro-action.

Translate for research:

1. **Kill or shrink Triage Desk** as a semantic bucket (“pointer work”) if industry uses **domain names** instead.
2. Prefer **Manage X** pages with internal modes over many L1 siblings when jobs share entity + permission + mental model.
3. Keep **Scan Stations** as the floor pipeline; domain sections own **browse / decide / configure / print-from-desk** work.

---

## 4. Strawman domains (attack these — do not rubber-stamp)

Propose better names if industry disagrees. Strawman only:

| Strawman section | Candidate contents from §2 |
|---|---|
| **Sales** | Dashboard Sales + Local Pickup history; maybe counter-facing pieces of Support Orders; **not** floor Pickup/Repair intake unless you defend FOH merge |
| **Support** | Entire Support page (Tickets · Orders · Voicemail · Calls · Warranty · Issues) as its own root section (single page or thin L1) |
| **Catalog / Manage Products** | Products modes collapsed Amazon-style: Catalog + Listings/Pairing + QC + Kit + Manuals; product label print as a mode, not a separate Print Stations row |
| **Inventory** | Inventory modes; decide Warehouse merge vs keep Warehouse as **Locations** under Inventory or its own **Warehouse** section |
| **Sourcing** | Sourcing modes — own section or under Inventory/Catalog? |
| **Shipping (desk)** | Shipping Labels · Ready · FBA — own section vs stay near Scan out somehow |
| **Inbound desk** | Incoming (+ maybe Dashboard Receiving board) — own section vs under a Receiving desk umbrella |
| **Review / QA** | Review modes — own section vs under Packing/Outbound |
| **Print** | Keep Print Stations **or** dissolve into Manage Products + Warehouse Locations + Unbox |

**Root budget:** industry often ships **5–8** primary domains. Today we already have **5** sections + pins. Adding Sales + Support + Catalog + Inventory without removing Desk can explode the root. **Your target root must name what dies** (almost certainly: Triage Desk as a label, and possibly Print Stations).

---

## 5. Amazon-style “Manage Products” pattern (evaluate explicitly)

### 5a. Pattern class

Amazon Seller Central (and peers) typically:

- Expose a **small set of top domains** (Inventory, Orders, Advertising, …).
- Put **many jobs inside one Manage Inventory / Manage Products** surface via tabs/filters/secondary nav — listings, pricing, shipping templates, search terms — rather than one left-nav row per job.
- Keep **fulfillment / shipping** and **messaging / buyer-seller messages** as sibling domains, not nested under Products.

### 5b. Questions you must answer for Cycle Forge Products

Today Products already has **6 modes** (Catalog · Manuals · Labels · Pairing · QC · Kit Parts). That is already a Manage Products embryo.

1. Should **Print Labels → Product** and **Print Documents** **dissolve** into Products modes (and Print Stations shrink or vanish)?
2. Should **Review → Catalog link** and **Review → Pairing** move under Manage Products, leaving Review as packing-photo QA only?
3. Should **Studio → Catalog** stay Canvas-definition forever, with Products Catalog as the operational Manage surface (recommended default unless you prove otherwise)?
4. What is the **operator-facing label**: Products · Catalog · Inventory · Manage Products · Listings? Pick one primary; aliases secondary.

### 5c. Apply the same pattern to other domains

For each domain you propose, name the **Manage-* page** (if any) and the **max L2 mode count** you allow before splitting again. Cap recommendation: industry often soft-caps ~5–7 tabs before cognitive failure — our Support already has 6; Inventory 5; Products 6.

---

## 6. Forced decisions (answer every row)

| ID | Decision | Default if you abstain |
|---|---|---|
| **D1** | Does the label **Triage Desk** die, or remain as a thin residual for “misc pointer work”? | Dies; residual forbidden |
| **D2** | Does **Print Stations** stay as a task-axis root, or dissolve into domain Manage pages? | Take a side |
| **D3** | Is **Support** its own root section? | Yes |
| **D4** | Is **Sales** its own root section (Dashboard Sales/Pickup + related), or a mode under a broader **Orders** domain? | Take a side |
| **D5** | Do **Dashboard** boards dissolve into domain homes (Receiving board → Inbound, Shipping board → Shipping, Sales board → Sales)? | Prefer dissolve |
| **D6** | **Incoming** primary home: Inbound desk section vs under Scan Stations Receiving subgroup? | Desk/Inbound section (browse ≠ floor Arrival) |
| **D7** | **Shipping** desk (Labels/Ready/FBA): own root vs under Outbound with Scan out still on Floor? | Own desk domain; Scan out stays Floor |
| **D8** | **Warehouse** vs **Inventory**: merge under one Manage Inventory, or two sections (Stock vs Locations)? | Take a side |
| **D9** | **Sourcing** primary: own section vs under Catalog vs under Inventory | Take a side |
| **D10** | **Review**: own section vs Packing domain vs split (packing review vs catalog pairing) | Take a side |
| **D11** | Products label + mode set for Amazon-style Manage Products (list final modes) | Required |
| **D12** | Max **root section** count (including Monitor, Scan Stations, Studio) | Number + list |
| **D13** | Migration phase 1 (nav-only remaps) vs phase 2 (workspace merges) | Ordered list |
| **D14** | Which §2d duplications stay as deliberate aliases vs must merge | Per-row table |

---

## 7. Deliverable format (stick to this)

1. **Industry findings** (≤1 page) — named systems, citation links, when domain nav wins vs mega-Desk.
2. **Target spine map** — ASCII tree like §1b, every §2a/§2b row assigned.
3. **Manage-* consolidation table** — per domain: page name, modes, what was deleted as L1.
4. **D1–D14 rulings** — table.
5. **Migration order** — Phase 0 nav SoT only; Phase 1 dissolve Dashboard; Phase 2 Products/Print; … with blast radius.
6. **What not to do** — anti-patterns (e.g. “Sales Stations” that are scan benches; nesting Support under Shipping).

---

## 8. Prior briefs (do not re-litigate; cite if you extend)

| Brief | Already decided / scoped |
|---|---|
| `station-nav-floor-desk-GEMINI-RESEARCH-BRIEFING.md` | Floor vs Desk interaction split |
| `page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` | Station-first vs main-tier; duplication register |
| `sidebar-spine-validation-simplification-HANDOFF.md` | Current spine grammar + Print Stations ship |
| Print Stations plan (executed) | Print Labels vs Print Documents below Desk |

This brief’s only question: **given Floor vs Desk already exists, how do we replace the Desk grab-bag with industry-shaped domain sections and Manage-* pages?**

---

## 9. Paste prompt for Gemini

```
Read docs/todo/desk-domain-spine-split-GEMINI-RESEARCH-BRIEFING.md end-to-end.
You do not have the codebase — treat §1–§2 as ground truth.

Deliver §7 exactly. Force D1–D14. Prefer a concrete target spine + Manage-*
mode lists over frameworks. Cap root sections; say what dies (especially
Triage Desk and possibly Print Stations). Use Amazon Manage Products as a
pattern class for combining catalog/listings/related jobs inside one page,
not as a pixel clone. Cite named 2024–2026 systems.
```
