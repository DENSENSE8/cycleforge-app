# Research briefing — Stations L1 taxonomy (Floor / Desk) vs 2026 ops-nav practice

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject plan:** [`station-nav-floor-desk-PLAN.md`](./station-nav-floor-desk-PLAN.md) — add
**Floor** and **Desk** sub-eyebrows under the existing **Stations** parent in the desktop master-nav
spine, driven by a SoT field (`stationGroup`), without inventing new chrome.
**Status:** plan only; hairline chrome fix already shipped separately. This brief exists to
pressure-test the **taxonomy and depth** of that plan against industry standards before we grow
the nav SoT or over-split.

**Deliverable:** (a) a benchmark of top-level + secondary nav grouping in named 2025–2026 WMS /
3PL / warehouse / reseller / POS / B2B ops products; (b) a defended verdict on each decision in
§6; (c) answers to §7 with sources; (d) a concrete “what would change in the plan doc” list an
engineer can apply to `station-nav-floor-desk-PLAN.md`.

---

## 0. How to use this brief

You do **not** have the codebase. Every inventory fact below was measured from source on
2026-07-30. Where something is inferred, it is labeled **(inferred — verify)**.

Three deliverables, kept separate:

1. **What is industry standard (2026)** for grouping **operator stations / workcenters / floor
   apps** in a persistent left nav (or equivalent jump list) inside multi-workflow warehouse /
   fulfillment / reseller-ops software. Name real products. State when flat lists win vs
   2-level sectioning vs 3+ level trees vs role-filtered single lists.
2. **Take a side on each decision in §6.** Each states our proposed shape, the strongest case
   against it, and where we already admit uncertainty.
3. **Answer §7** with sources. Prefer a migration order and label vocabulary an engineer can
   paste into the plan — not a framework-for-thinking.

**Do not re-litigate** these older briefs (different questions):

| Prior brief | Question already scoped |
|---|---|
| `contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md` | Where *facts* live (spine vs context rail vs detail stack) |
| `page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` | Whether *Main pages* should collapse into stations |

This brief is only: **given Stations already exist as an L1 bucket, how should its members be
chunked?**

---

## 1. Product vocabulary (use these words in the answer)

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics
refurb/resale is the dogfood tenant). One small crew wears multiple hats in one day.

**Kinetic Ledger** — product UI identity: dense, state-colored, scan-aware; legible throughput
over document calm. Quiet chrome. No decorative card soup in nav.

**Region contracts** (house law — a *region*, not a page):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode / wedge | act-and-clear | ephemeral | `floor` |
| **Workbench** | pointer | pick → edit → persist | URL-durable | `ops` |
| **Monitor** | filters | observe only | none | `rollup` |
| **Canvas** | pan/zoom | reshape a definition | URL focus | `studio` |

Important tension for this brief: some nav rows are `kind: 'station'` in the **nav taxonomy**
but their *primary region* is Workbench-shaped (Review, parts of Support). The plan’s **Desk**
bucket is partly an admission of that mismatch. Tell us whether industry treats that as a
nav-group problem, a mis-kind problem, or both.

**Canonical unit lifecycle** (domain spine, not nav labels today):

```
EXPECTED → ARRIVED → MATCHED → UNBOXED → AWAITING_TEST → IN_TEST
  → PASSED → (list / pack / ship) → DONE
  → FAILED → RTV | SCRAP | rework
```

---

## 2. The job, restated as a research question

Strip product names and the task is:

> In a desktop app where operators jump between **physical floor benches** (scan-first) and
> **desk/gate workflows** (tickets, QA decide), how should a persistent left navigation
> **section and order** those destinations so find-time stays low as the list grows — without
> turning the nav into a deep tree or a second product map?

Comparable surfaces: WMS workcenter pickers, 3PL warehouse “apps” drawers, Amazon Seller /
eBay seller hub sidebars, Shopify admin + Shopify POS app switcher, Manhattan / Blue Yonder /
SAP EWM floor menus, ShipStation / ShipHero / Extensiv nav, Linear/Height team+view sidebars
(for IA pattern only — different domain).

---

## 3. What shipped — measured anatomy

### 3.1 Desktop frame (post-2026 nav relocation)

```
┌──────────────┬─────────────────────────────────────────┐
│ Nav spine    │ GlobalHeader (40px) — Mode + Recents +… │
│ (push column)├─────────────────────────────────────────┤
│ MasterNav    │ Context panel card │ Workspace          │
│ identity 40px│ (route-keyed)      │                    │
│ + page list  │                    │                    │
└──────────────┴─────────────────────────────────────────┘
```

- L2 **Mode + Recents** live in **GlobalHeader**, not the spine (locked).
- Spine identity band shows “name of now” only (display).
- Page list groups today: **Main · Stations · More** via `kind` on each nav item.

### 3.2 Stations inventory (flat under one eyebrow)

| id | Label | Modes (L2) | Floor glyph? | Proposed group |
|---|---|---|---|---|
| `receiving` | Receiving | Incoming, Arrival, Unbox, Local Pickup, Repair | yes | Floor |
| `tech` | Testing | Testing, Shipping | yes | Floor |
| `packer` | Packing | Standard, Fragile, Multi-Item | yes | Floor |
| `outbound` | Shipping | Labels, Ready, FBA, Scan out | yes | Floor |
| `review` | Review | Packing, Pairing, Catalog link | **no** (ClipboardList) | Desk |
| `support` | Support | Tickets, Orders, … | **no** (AlertCircle) | Desk |

**Count:** 6 station pages. Parent eyebrow label: `Stations`. No sub-eyebrows today.

**Main** (separate parent): Dashboard, Sales, Products, Inventory, Warehouse, Media library,
plus parked Home / Operations / Studio catalog when unlocked — also flat. **Out of scope** for
the implementation plan’s v1.

**More:** Admin (with its own L2 `mode.group` subheads: People / Data sources / System),
Settings.

### 3.3 Existing sub-header precedent (compose, don’t fork)

Admin L2 modes already render **group eyebrows** inside an expanded page row
(`SidebarModeItem.group` → micro uppercase label). The Stations plan proposes the **same visual
altitude** for page-level chunks under Stations — not a new component family.

### 3.4 Critique verdict already taken in-house (floor for you to attack)

Internal design critique (2026-07-30) ranked ROI as:

1. Floor / Desk under Stations (highest clarity per line of code)
2. Pipeline sort inside Floor
3. SoT + guard
4. Finer Intake / Line / Outbound — only after list growth
5. Main subheads — defer

**Strongest self-doubt we already have:** six items may not *need* subheads; Recents + Mode in
the header may already be the real jump path for daily work. Subheads might be premature
structure for a list that only hurts when parked stations return (Data Wipe, etc.).

---

## 4. Proposed target shape (under review)

```
MAIN
  …unchanged flat list…

STATIONS
  Floor
    Receiving
    Testing
    Packing
    Shipping
  Desk
    Review
    Support

MORE
  Admin
  Settings
```

Mechanics:

- New SoT field: `stationGroup?: 'floor' | 'desk'` required when `kind === 'station'`.
- Ordered registry `STATION_GROUPS = [{ id: 'floor', label: 'Floor' }, { id: 'desk', label: 'Desk' }]`.
- Empty groups omitted after permission filtering.
- Static eyebrows (not collapsible folders).
- No per-group icons / colored headers / cards.

---

## 5. Deep research questions — answer with named systems and sources

1. **When do flat station lists beat grouped ones?** For operator jump lists of size N (here
   N=6, potentially N=8–12 after un-parking), what do WMS/3PL/POS products actually do? Cite
   products and, where possible, published IA / UX guidance (NN/g, Aptean, Manhattan docs,
   Shopify Polaris admin nav principles, Apple HIG sidebar, etc.). What is the typical
   threshold where a second heading level pays for itself?

2. **Floor vs Desk vs lifecycle labels.** Compare operator-facing labels:
   - **Floor / Desk** (physical posture / interaction contract)
   - **Inbound / Outbound / QC** (direction of goods)
   - **Intake / Prep / Ship / Gate / Service** (lifecycle stage)
   Which vocabulary dominates in 2026 warehouse UIs and seller hubs? Under what conditions
   does each win? Is mixing region-contract language (“Station”) with posture language
   (“Floor”) coherent or confusing?

3. **Mis-kind rows (Review, Support).** Industry pattern for destinations that are *nav-
   adjacent* to floor apps but are pointer-first QA/ticket work: keep them in the same parent
   with a Desk subhead, move them to Main/More, or give them a third parent (e.g. “Quality” /
   “Service”)? Name examples.

4. **Ordering.** Pipeline order (receive → test → pack → ship) vs frequency/recency vs
   alphabetical vs role-personalized order. What is standard for workcenter lists? Should
   Recents (already in GlobalHeader) own frequency so the static list stays pipeline-stable?

5. **Depth limits.** Is a **parent eyebrow + one sub-eyebrow + expandable page → modes**
   (3 levels of finding) within industry norms for warehouse apps, or one level too deep?
   Compare to products that put modes as peer top-level items (flattening) vs nested.

6. **Role filtering vs structural grouping.** Many WMS UIs simply **hide** unauthorized
   workcenters and leave one flat list. Given we already permission-filter rows, is Floor/Desk
   redundant for small crews? When does structural grouping still help after role filtering?

7. **Growth triggers.** What concrete signals (item count, mixed interaction contracts,
   onboarding time, support tickets about “where is X”) justify moving from Floor/Desk to a
   finer taxonomy — or justify *not* shipping Floor/Desk at all yet?

8. **Design-system / SoT governance.** Storing `stationGroup` on the nav SoT + a CI guard
   that every station declares a group — is that aligned with how mature admin shells encode
   nav IA (config schemas, CMS-driven nav, code registries)? Any anti-patterns (over-
   schematizing 6 rows)?

9. **AI-agent maintainability.** This repo’s coding agents read prose law + fail CI guards.
   For nav IA specifically, is a closed enum (`floor` | `desk`) + guard better than free-text
   group labels (like Admin’s `mode.group` strings)? Trade-offs for multi-tenant white-label
   later **(inferred — verify)** if tenants ever customize station menus.

10. **Accessibility.** Do static sub-eyebrows need to be `role="group"` / labelled regions for
    screen-reader nav lists? What do Polaris / Carbon / Primer sidebars do for section
    headings inside a menu?

---

## 6. Decisions to take a side on

For each: state **keep / change / defer**, with one paragraph of reasoning tied to §5
evidence.

### D1 — Parent stays Main / Stations / More
**Plan:** keep.  
**Attack:** Stations is a jargon umbrella; some products use “Warehouse,” “Work,” “Apps.”  
**Admit:** “Stations” matches our region-contract vocabulary and existing operator training.

### D2 — Exactly two sub-groups: Floor + Desk
**Plan:** ship v1 with only these two.  
**Attack:** six items don’t need subheads; or Review belongs on Floor as end-of-line gate.  
**Admit:** Desk is partly a polite parking lot for non-glyph stations.

### D3 — Label pair is “Floor” / “Desk”
**Plan:** those strings.  
**Attack:** “Floor” collides with density token `floor`; “Desk” undersells Review-as-QA.  
**Alternatives to score:** Operations / Support · Scan / Decide · Inbound+Line+Ship vs Desk.

### D4 — Floor order is pipeline (Receiving → Testing → Packing → Shipping)
**Plan:** fixed pipeline order in SoT array.  
**Attack:** packers want Packing first; personalization belongs in the static list.  
**Admit:** GlobalHeader Recents already covers personal frequency.

### D5 — Review and Support are Desk
**Plan:** both Desk.  
**Attack:** Review is packing-adjacent (should Floor); Support should return to More.  
**Admit:** Support was recently promoted More → Stations for a reason — don’t silently demote
without evidence.

### D6 — No collapsible station folders
**Plan:** static eyebrows only.  
**Attack:** long lists need disclosure; Amazon-style “Apps” drawers collapse.  
**Admit:** Kinetic Ledger bans size-shifting chrome for ambient nav.

### D7 — Defer Main subheads and lifecycle (Intake/Prep/Ship) splits
**Plan:** out of scope until growth or research override.  
**Attack:** do the “right” taxonomy once; avoid a second migration.  
**Admit:** we would rather ship Floor/Desk and re-split than invent five empty buckets.

### D8 — Compose Admin `mode.group` eyebrow visual; new field at page altitude
**Plan:** same micro eyebrow classes; new `stationGroup` on pages.  
**Attack:** one generic `navGroup` tree replaces `kind` + `stationGroup`.  
**Admit:** replacing `kind` is a larger IA migration than this plan’s blast radius.

---

## 7. Open questions (short answers + sources)

1. At N=6 station destinations, is Floor/Desk **net positive** or **chrome theater**?
2. If only one change ships this month, should it be **Floor/Desk**, **pipeline reordering
   without subheads**, or **wait for un-parked stations**?
3. Should `stationGroup` be required in TypeScript (`kind: 'station'` discriminated union) or
   only enforced by a guard test?
4. Any named product whose nav you would treat as the **golden reference** for Cycle Forge’s
   spine — and what specifically to copy vs refuse?
5. What would you delete from `station-nav-floor-desk-PLAN.md` after this research?

---

## 8. Constraints the recommendation must respect

- Do **not** move L2 Mode/Recents out of GlobalHeader.
- Do **not** invent a second visual language for group headers (tokens + existing micro
  eyebrow only).
- Do **not** require a visual-regression toolchain the repo doesn’t have; structural guard +
  unit tests are the enforcement shape.
- Prefer **compose → grow SoT → guard** over page-local markup.
- Multi-tenant SaaS: operator copy uses capability nouns; don’t hardcode dogfood tenant
  (“USAV”) into nav labels.
- E2E / CI culture: changes must keep `npm run verify` green; guards ratchet down only.

---

## 9. What a useful answer looks like

A strong response:

1. Names **3–6 real products** and what their workcenter/app nav does at ~5–15 destinations.
2. Gives a **keep / change / defer** table for D1–D8.
3. Ends with a **patch list** for `station-nav-floor-desk-PLAN.md` (section-level: “replace §1
   row X with …”, “add Phase 0.5 …”, “delete Phase 4 option Y”).
4. Separates **IA taxonomy** advice from **visual design** advice.

A weak response: generic “consider user research” / “it depends on personas” with no named
systems and no edit list for the plan.

---

## Appendix A — file map

| Concern | Path |
|---|---|
| Plan under review | `docs/todo/station-nav-floor-desk-PLAN.md` |
| Nav SoT | `src/lib/sidebar-navigation.ts` |
| Spine list UI | `src/components/sidebar/master-nav/SidebarNavList.tsx` |
| Admin mode group precedent | `SidebarModeItem.group` in same SoT + list UI |
| Region contracts | `.claude/rules/contextual-display.md` |
| Pattern evolution | `.claude/rules/pattern-evolution.md` |
| Workbench / L2 Mode law | `.claude/rules/display/workbench.md` |
| Prior IA brief (different Q) | `docs/todo/contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md` |
| Prior consolidation brief (different Q) | `docs/todo/page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` |
| Reseller lifecycle vocabulary | `.claude/skills/reseller-flow/SKILL.md` |

## Appendix B — proposed Phase 0 sketch (for cost estimation only; not executed)

```ts
// SidebarNavItem
kind?: 'main' | 'station' | 'bottom';
stationGroup?: 'floor' | 'desk'; // required when kind === 'station'

export const STATION_GROUPS = [
  { id: 'floor', label: 'Floor' },
  { id: 'desk', label: 'Desk' },
] as const;
```

Render sketch: under Stations parent, map `STATION_GROUPS` → filter pages → same eyebrow
classes as Admin `mode.group` headers → existing `renderRow`.

Estimated blast radius: **2 SoT arrays + 1 list component + 1 guard + 1 law paragraph**.
No route, permission, or Mode/Recents changes.
