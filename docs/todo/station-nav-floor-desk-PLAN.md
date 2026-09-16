> **SUPERSEDED 2026-09-14 — DO NOT EXECUTE.** This plan targets a spine of
> `Main · Stations · More` with `stationGroup: 'floor' | 'desk'`. That spine is gone: the live SoT
> is `STATION_GROUPS` (Scan Stations) + `DESK_GROUPS` (Workspaces) + `DOMAIN_GROUPS` (7 domains)
> composed into `SPINE_SECTIONS` (`src/lib/sidebar-navigation.ts`). Current nav work lives in
> [`nav-lanes-reports-IA-PLAN.md`](./nav-lanes-reports-IA-PLAN.md). Kept for the research record
> (§1 verdicts, §7 briefing map) only.

# Station nav — Floor / Desk sub-headers under Stations

**Status:** Research absorbed 2026-07-30 — ready to implement. Gemini KEEP on all §1
decisions; no Phase 4 overrides.
**Lane:** current checkout — no ad-hoc branch.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.
**Sibling research:** [`station-nav-floor-desk-GEMINI-RESEARCH-BRIEFING.md`](./station-nav-floor-desk-GEMINI-RESEARCH-BRIEFING.md)
(results pasted 2026-07-30 — Floor/Desk net-positive at N=6 for interaction-contract
grouping; Linear sidebar for static group headers; ShipHero for pipeline mental model).

**Paste for a new session:**

> Read `docs/todo/station-nav-floor-desk-PLAN.md` and start at §3.
> §1–§2 are locked (research KEEP). Do not re-open without a research override.
> Verify claims by **call sites** in `sidebar-navigation.ts` + `SidebarNavList.tsx`, not docblocks.

---

## 0. Verdict

The master-nav spine lists six `kind: 'station'` pages under one flat **Stations** eyebrow.
That mixes **floor scan benches** (Receiving → Testing → Packing → Shipping) with **desk/gate
surfaces** (Review, Support). Highest-ROI fix is **not** a visual redesign and **not** five
lifecycle subheads — it is a **two-level Stations taxonomy in the nav SoT**, reusing the Admin
`mode.group` eyebrow recipe already in `SidebarNavList`.

> **Stations keeps its parent eyebrow. Under it: Floor, then Desk. Data in SoT; list renders
> sub-eyebrows; TypeScript requires every station to declare a group.**

Research note: at N=6 grouping is net-positive because it encodes *interaction contract*
(scan-first vs pointer-first), not item count.

---

## 1. Decisions locked — do not re-open without research override

| Decision | Verdict |
|---|---|
| Parent L1 groups | Keep **Main · Stations · More** (`kind`) |
| Stations sub-taxonomy (v1) | **Floor** + **Desk** only |
| Label vocabulary | Operator language (**Floor / Desk**), not Studio lifecycle labels |
| Floor row order | Pipeline: Receiving → Testing → Packing → Shipping |
| Desk membership | Review, Support |
| Main subheads | **Picked up** — [`main-nav-overview-stock-HANDOFF.md`](./main-nav-overview-stock-HANDOFF.md) (Overview / Stock / Library) |
| Lifecycle split (Intake / Line / Outbound / …) | **Deferred** until Floor **N > 8** (e.g. parked stations reactivated) |
| Collapsible sub-sections | **No** — static eyebrows only (Kinetic Ledger quiet chrome) |
| Visual chrome | Reuse existing `text-role-micro` uppercase eyebrow — no cards, no icons-per-group |

---

## 2. Current inventory (measured 2026-07-30)

### 2.1 Spine groups today

`SidebarNavList.tsx` `SCROLL_GROUPS`:

| `kind` | Label | Role |
|---|---|---|
| `main` | Main | Workbench / monitor / commerce hubs |
| `station` | Stations | Operator benches (flat list → Floor / Desk) |
| `bottom` | More | Admin, Settings |

### 2.2 Station pages (both `APP_SIDEBAR_NAV` + `SIDEBAR_PAGE_NAV`)

| id | Label | `stationGroup` | Notes |
|---|---|---|---|
| `receiving` | Receiving | `floor` | Scan family; floor glyphs |
| `tech` | Testing | `floor` | Scan family |
| `packer` | Packing | `floor` | Scan family |
| `outbound` | Shipping | `floor` | Scan family |
| `review` | Review | `desk` | Workbench-as-station; lucide icon, no floor glyph |
| `support` | Support | `desk` | Desk tickets; promoted More → Stations |

Floor SoT order (pipeline): `['receiving', 'tech', 'packer', 'outbound']`.
Desk SoT order: `['review', 'support']`.

### 2.3 Precedent already in-repo

Admin L2 modes already use `mode.group` + the same micro eyebrow in `SidebarNavList`
(`showGroupHeader`). **Compose that recipe at Stations page-group altitude** — do not fork a
second eyebrow component.

---

## 3. Implementation phases

### Phase 0 — SoT field (small, ship first)

1. Discriminate `SidebarNavItem` so `stationGroup` is **required at the type level** when
   `kind === 'station'` (not an optional field + CI-only guard):
   ```ts
   type SidebarNavItemBase = { id: string; label: string; href: string; /* … */ };
   type SidebarNavItem =
     | (SidebarNavItemBase & { kind?: 'main' | 'bottom' })
     | (SidebarNavItemBase & { kind: 'station'; stationGroup: 'floor' | 'desk' });
   ```
2. Set `stationGroup` on every `kind: 'station'` row in **both** `APP_SIDEBAR_NAV` and
   `SIDEBAR_PAGE_NAV` (keep arrays in lockstep — existing tests already couple them).
3. Reorder station rows so filtered Stations order is pipeline then desk (see §2.2).
4. Export ordered registry (prefer SoT module, list imports it):
   ```ts
   export const STATION_GROUPS = [
     { id: 'floor', label: 'Floor' },
     { id: 'desk', label: 'Desk' },
   ] as const;
   ```

**Done when:** typecheck + existing `sidebar-navigation.test.ts` still pass; every station row
has a group; Floor ids appear in pipeline order.

### Phase 1 — Render sub-eyebrows

1. In `SidebarNavList`, when rendering `kind === 'station'`, nest `STATION_GROUPS` and filter
   pages by `stationGroup`. Skip empty groups (permission-filtered users).
2. Keep parent **Stations** eyebrow.
3. Floor order = SoT pipeline `['receiving', 'tech', 'packer', 'outbound']`, then Desk
   `['review', 'support']` — not alpha.
4. **A11y:** each sub-eyebrow gets a stable `id` (e.g. `station-group-floor`); wrap children in
   `<ul role="group" aria-labelledby={id}>`; rows are `<li>`. Standard ARIA list-grouping.

**Done when:** open nav spine → Stations shows Floor then Desk; hairline/chrome unchanged;
permission-gated user missing all Desk stations sees Floor only (no empty Desk eyebrow);
screen readers announce Floor/Desk grouping.

### Phase 2 — Guard

Add `station-nav-groups.guard.test.ts` (sibling to `header-mode.guard.test.ts`):

- Every `SIDEBAR_PAGE_NAV` / `APP_SIDEBAR_NAV` item with `kind: 'station'` has `stationGroup`.
- `stationGroup` ∈ `{ floor, desk }`.
- Floor filtered ids === pipeline order; Desk === `review`, `support`.
- `SidebarNavList` imports `STATION_GROUPS` (no hard-coded `"Floor"` / `"Desk"` twin).

**Done when:** guard green under `npm run verify`.

### Phase 3 — Display law (one paragraph)

Add a short paragraph to `.claude/rules/display/workbench.md` (master-nav / L1 section) or a
sidebar-nav note in `source-of-truth.md`:

> Station pages under the Stations parent use required `stationGroup` (`floor` | `desk`).
> Floor = scan benches in pipeline order; Desk = gate/ticket stations. Do not invent
> page-local station folders or collapsible groups. Finer splits (Intake / Line / Outbound)
> only after Floor **N > 8** + research override.

**Done when:** law paragraph + guard reference each other.

### Research absorbed — no Phase 4

Gemini returned **KEEP** on all §1 decisions (2026-07-30). No label renames, no Review
Floor↔Desk move, no third group, no Main split. Do not pre-build deferred APIs.

---

## 4. Explicit non-goals

- Redesigning MasterNav / GlobalHeader chrome.
- Collapsing Main into Stations (see older
  [`page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md`](./page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md)).
- Moving L2 Mode back into the sidebar.
- Accordion / collapsible station folders.
- Per-group icons, colored section headers, or card wrappers around groups.
- Intake / Line / Outbound Floor splits until Floor **N > 8**.

---

## 5. File map

| Concern | Path |
|---|---|
| Nav SoT | `src/lib/sidebar-navigation.ts` |
| Spine list UI | `src/components/sidebar/master-nav/SidebarNavList.tsx` |
| Existing group eyebrow (Admin modes) | same file, `mode.group` branch |
| Round-trip / kind tests | `src/lib/sidebar-navigation.test.ts` |
| Station group guard | `src/components/sidebar/master-nav/station-nav-groups.guard.test.ts` |
| Workbench L2 law | `.claude/rules/display/workbench.md` |

---

## 6. Verify

```bash
npm run verify
# or inner loop:
node --test --import tsx src/lib/sidebar-navigation.test.ts
node --test --import tsx src/components/sidebar/master-nav/station-nav-groups.guard.test.ts
```

Manual: open spine on a modeful station → confirm Floor / Desk eyebrows; collapse/expand a
Receiving row → modes still work; sign in as a packing-only role → Desk absent if no Review/Support
perms.

---

## 7. Relationship to prior research

| Brief | Question it answered | Do not re-ask |
|---|---|---|
| `contextual-sidebar-ia-GEMINI-RESEARCH-BRIEFING.md` | Where facts live (spine vs context panel vs detail) | Surface altitude |
| `page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` | Whether Main collapses into Stations | Page-count consolidation |
| **This plan + briefing** | How to **chunk Stations** once they exist | — |
