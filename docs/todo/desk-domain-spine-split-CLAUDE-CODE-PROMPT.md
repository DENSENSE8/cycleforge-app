# Claude Code prompt — Desk → domain spine split (Gemini rulings)

**For:** Claude Code / Cursor Agent implementing session  
**From:** Cycle Forge engineering  
**Date:** 2026-08-01  
**Status:** **EXECUTED 2026-08-01** — Phases 0–3 landed in the nav SoT + guards. Two Phase-3 items deferred with reasons; the `:3050` matrix is BLOCKED on an unrelated broken dev server. Detail in §9.  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Research / lock docs (read, do not re-open):**

| Doc | Role |
|---|---|
| [`desk-domain-spine-split-GEMINI-RESEARCH-BRIEFING.md`](./desk-domain-spine-split-GEMINI-RESEARCH-BRIEFING.md) | Inventory + questions |
| *Gemini answer (user-pasted 2026-08-01)* | Locked rulings reproduced in §1 below |
| [`sidebar-spine-validation-simplification-HANDOFF.md`](./sidebar-spine-validation-simplification-HANDOFF.md) | Current spine grammar (partially stale after this ship) |
| `.claude/rules/source-of-truth.md` · `display/workbench.md` | Update one-liners when spine map changes |

---

## Paste this into a new Claude Code / Cursor session

```
Read docs/todo/desk-domain-spine-split-CLAUDE-CODE-PROMPT.md end-to-end.
Execute §3 Phase 0 → Phase 3 in order. Do not invent a second nav registry.
Do not re-open Floor vs Desk interaction contracts or carrier-vs-print Labels.

GOAL
Kill Triage Desk and Print Stations as root spine sections. Remap every former
Desk + Print L1 into domain sections:

  Monitor · Scan Stations · Inbound · Catalog · Inventory · Fulfillment ·
  Sales · Support · Studio

Dissolve Print into Catalog / Inventory (aliases only). Dissolve Dashboard boards
into domain homes. Split Review (packing QA → Fulfillment; pairing/catalog-link →
Catalog). Merge Sourcing + Warehouse under Inventory (Warehouse = Locations).

HARD LAWS
- AGENTS.md + .claude/rules/source-of-truth.md + display/workbench.md
- One SoT: sidebar-navigation.ts (SPINE_SECTIONS / APP_SIDEBAR_NAV /
  SIDEBAR_PAGE_NAV / spineSectionIdForPage). Never twin labels in SidebarNavList.
- Carrier Labels stay Fulfillment → Shipping Labels (/shipping/labels) — NEVER
  fold into Catalog product labels or Inventory bin labels
- Scan Stations (floor) stay scan-first — do NOT move Arrival / Unbox / Pack /
  Scan out into domain desk sections
- Polyhierarchy with restraint: aliases OK; do not clone workspaces
- Hollow domains forbidden: permission-filter empty sections out of the root
- Attach to :3050; never start/restart/kill the server
- User owns commits; no stash; no ratchet baseline raises
- npm run verify green before claiming done
- Run the §5 acceptance matrix on :3050 (all rows) before done

Start at §3 Phase 0 (nav SoT + guards). Gate each phase with verify --fast,
then full npm run verify at the end.
```

---

## 0. One-sentence goal

**Replace the Triage Desk grab-bag (and Print Stations task slice) with industry domain spine sections + Manage-* pages**, remapping existing URLs first, then dissolving Dashboard/Print and splitting Review — without touching Floor scan benches or inventing a second nav registry.

---

## 1. Locked target (Gemini — do not renegotiate)

### 1.1 Target spine

```text
TOP PIN:  Home · Search · Media · Chat

SECTIONS:
  Monitor        Operations (Live · Analytics · Insights · History · Signals · Reconcile)
  Scan Stations  Receiving (Arrival · Unbox · Local Pickup · Repair Service)
                 Testing · Packing · Scan out
  Inbound        Incoming · Receiving Board
  Catalog        Manage Products — Reference · Manuals · Labels · Pairing · QC · Kit Parts
  Inventory      Manage Inventory — Ledger · Triage · Pulse · Graph · Replenish ·
                 Sourcing · Locations (ex-Warehouse; includes bin/rack labels)
  Fulfillment    Manage Shipping — Labels · Ready · FBA · Packing Review
  Sales          Manage Sales — Sales Board · Local Pickup History
  Support        Manage Support — Tickets · Orders · Voicemail · Calls · Warranty · Issues
  Studio         Studio · Catalog Canvas

FOOTER:   Admin · Settings
```

**Dead labels (must not appear as root drills):** `Triage Desk`, `Print Stations`, `Desk`, `Floor` (as a section label — Scan Stations stays).

### 1.2 Manage-* consolidation (locked)

| Domain | L1 page | L2 modes | Absorbed former L1 |
|---|---|---|---|
| Catalog | Manage Products (`products` / label **Catalog**) | Reference · Manuals · Labels · Pairing · QC · Kit Parts | Print Labels (product) · Print Documents · Review Pairing · Review Catalog link |
| Inventory | Manage Inventory (`inventory`) | Ledger · Triage · Pulse · Graph · Replenish · Sourcing · Locations | Sourcing L1 · Warehouse L1 · Print warehouse labels |
| Fulfillment | Manage Shipping (`outbound`) | Labels · Ready · FBA · Packing Review | Shipping L1 rename home · Review Packing |
| Inbound | Manage Inbound | Incoming · Receiving Board | Dashboard Receiving |
| Sales | Manage Sales | Sales Board · Local Pickup History | Dashboard Sales · Dashboard Pickup |
| Support | Manage Support (`support`) | existing 6 modes | elevated to own root (was Desk child) |

### 1.3 Forced rulings (copy)

| ID | Ruling |
|---|---|
| D1 | Triage Desk **dies** — no residual misc bucket |
| D2 | Print Stations **dissolves** into Catalog / Inventory / Floor Unbox alias |
| D3 | Support = **own root** |
| D4 | Sales = **own root** (not under Orders/Fulfillment) |
| D5 | Dashboard **dies** as an L1 — boards become domain modes/homes |
| D6 | Incoming stays **Inbound** (not under Scan Stations Receiving) |
| D7 | Carrier shipping desk = **Fulfillment**; Scan out stays Floor |
| D8 | Warehouse **merges** into Inventory as **Locations** |
| D9 | Sourcing **under Inventory** |
| D10 | Review **splits**: packing → Fulfillment; pairing/catalog-link → Catalog |
| D11 | Products relabel **Catalog**; mode Catalog → **Reference** |
| D12 | **9** root sections (list in §1.1) |
| D13 | Phases in §3 |
| D14 | Dup table in §1.4 |

### 1.4 Duplication rulings

| Dup | Ruling |
|---|---|
| Product labels vs Print→Product | **Merge** — Catalog → Labels only |
| Warehouse labels vs Print→Warehouse | **Merge** — Inventory → Locations (labels tab) |
| Receiving stickers vs Print→Receiving | **Alias** — Floor Unbox owns work; optional Inbound/Catalog entry OK |
| Manuals vs Print Documents | **Merge** — Catalog → Manuals |
| Products Pairing vs Review Pairing | **Merge** — Catalog → Pairing |
| Products Catalog vs Studio Catalog | **Alias** — ops Reference vs Canvas definition |
| Dashboard Sales vs Floor Pickup | Sales board = Sales home; Floor intake stays Floor |
| Outbound multi-door | **Alias** OK (context doors) |

---

## 2. SoT implementation sketch (compose — do not fork)

Primary write path: [`src/lib/sidebar-navigation.ts`](../../src/lib/sidebar-navigation.ts).

### 2.1 Spine registries

Replace `STATION_GROUPS` desk + `PRINT_GROUPS` membership with domain sections. Preferred shape (adjust names only if guards force clarity):

```ts
// Keep:
MAIN_GROUPS     = monitor · studio
STATION_GROUPS  = floor only   // OR keep desk id unused — prefer delete desk from STATION_GROUPS
DOMAIN_GROUPS   = inbound · catalog · inventory · fulfillment · sales · support

SPINE_SECTIONS = [
  MAIN_GROUPS.monitor,
  STATION_GROUPS.floor,          // Scan Stations
  ...DOMAIN_GROUPS,              // Inbound → … → Support
  MAIN_GROUPS.studio,
]
```

`spineSectionIdForPage`:

| kind / field | section |
|---|---|
| `main` + mainGroup | monitor / studio |
| `station` + stationGroup `floor` | floor |
| new `domainGroup` (or kind per domain) | inbound / catalog / inventory / fulfillment / sales / support |
| **Remove** mapping `kind: 'labels'\|'documents'\|'stock'\|'products'` → desk/print | those kinds either die or remap to domainGroup |

**Do not** leave `stationGroup: 'desk'` on pages that now live under domains — update APP + PAGE parity (guard already enforces field agreement).

### 2.2 Page id / href remaps (Phase 0–1)

| Former | Target |
|---|---|
| `products` label Products | label **Catalog**; modes: rename `catalog` → `reference` (or keep id `catalog` with label Reference — prefer **stable ids**, label change only) |
| `print-labels` / `print-documents` | **delete** APP rows; URLs still resolve via Catalog / Inventory / Unbox |
| `warehouse` | under Inventory section; Phase 3 may fold into `inventory` mode `locations` — Phase 0 may keep id `warehouse` as Inventory-section L1 labeled **Locations** |
| `sourcing` | Inventory-section L1 (Phase 0) or mode under `inventory` (Phase 3) — Phase 0: L1 under Inventory OK if Locations/Sourcing remain separate rows |
| `outbound` | Fulfillment section; add mode **Packing Review** → `/review` (packing default) after Phase 2 |
| `review` | delete as standalone Fulfillment sibling after split; until Phase 2, may sit under Fulfillment as Packing Review only |
| `incoming` | Inbound |
| `support` | Support section (same page) |
| `dashboard` | Phase 1: remove L1; expose Receiving Board / Sales Board / Local Pickup History / (Shipping board if still needed) as domain modes pointing at existing `?mode=` URLs, then dedicated routes if cheap |

### 2.3 Accents

Extend [`src/lib/nav/spine-section-accent.ts`](../../src/lib/nav/spine-section-accent.ts) for every new `SpineSectionId`. Keep existing monitor/floor/studio hues. Assign distinct hues for inbound / catalog / inventory / fulfillment / sales / support (token hues only — no page-local hex). Update SoT one-liner + guard that every section has an accent + inset ring.

### 2.4 Consumers that must move in lockstep

| File | Change |
|---|---|
| `SidebarNavList.tsx` | No hardcoded section labels; remove Print alias helpers if Print rows gone; domain membership via `spineSectionIdForPage` only |
| `MasterNav.tsx` | Auto-drill still uses `spineSectionIdForPage` — verify cross-domain enter |
| `command-bar-nav-groups.ts` (+ test) | Follows `SPINE_SECTIONS` — update Desk/Print assertions |
| `main-nav-groups.guard.test.ts` | Rewrite locked spine order + domain flat orders; ban `'Triage Desk'` / `'Print Stations'` twins |
| `station-nav-groups.guard.test.ts` | Floor-only station pipeline; Desk station list removed or empty |
| `sidebar-navigation.test.ts` | Round-trips + `getSidebarNavPageId` (Products Labels no longer forces `print-labels`) |
| `useActiveSidebarMode.ts` / `useSidebarModeNav.ts` | Drop print-labels special-case when Print dies |
| SoT + `workbench.md` + handoff locked map | One-line updates |

### 2.5 Out of scope this prompt

- Desk-contract LedgerGrid rebuild ([`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](./desk-contract-unification-CLAUDE-CODE-PROMPT.md)) — do not start unless a Phase 3 workspace merge **requires** it
- Moving Floor Receiving members into Inbound
- Merging Studio Catalog Canvas into Catalog Reference
- Carrier label redesign

---

## 3. Phased execution (gates)

### Phase 0 — Nav SoT remap (must ship first)

**Done when:**

1. `SPINE_SECTIONS` ids =  
   `monitor → floor → inbound → catalog → inventory → fulfillment → sales → support → studio`
2. No APP row with `stationGroup: 'desk'` or `kind: 'labels'|'documents'` print hub
3. Incoming under Inbound; Catalog (= products) under Catalog; Inventory+Sourcing+Locations(warehouse) under Inventory; Shipping under Fulfillment; Support under Support; Sales stub OK if boards still on dashboard URLs
4. Print Stations rows deleted; Catalog → Labels / Inventory → Locations cover former print URLs
5. Guards + `command-bar-nav-groups` tests green
6. `npm run verify -- --fast` green

**Acceptance:** `:3050` root shows 9 domain drills; Triage Desk / Print Stations gone; each former Desk page reachable under its domain.

### Phase 1 — Dashboard + Print dissolution

**Done when:**

1. No `dashboard` L1 in APP_SIDEBAR_NAV (deep links `/dashboard?mode=*` still work or redirect to domain homes)
2. Inbound has **Receiving Board** → former dashboard inbound
3. Sales has **Sales Board** + **Local Pickup History** → former dashboard sales/pickup
4. Fulfillment owns shipping board content if it was only on Dashboard (or prove Shipping modes already cover it — document in PR notes)
5. Zero Print Stations references in nav SoT / guards / SoT prose
6. `getSidebarNavPageId('/products', view=labels)` returns Catalog page id (`products`), not `print-labels`

**Acceptance:** matrix §5 rows D / P / S pass.

### Phase 2 — Review split

**Done when:**

1. Fulfillment → Packing Review lands on `/review` packing mode only
2. Catalog → Pairing owns serial/SKU pairing (Review pairing mode redirects or nav-only points at Products pairing)
3. Catalog → Pairing / Catalog link absorbs Review `catalog-link` (redirect `/review?mode=catalog-link` → products pairing/catalog-link view if needed)
4. No standalone Review L1 under Fulfillment except Packing Review mode on Manage Shipping **or** a single Packing Review L1 — pick one, guard it

**Acceptance:** matrix §5 row R passes; packing photo QA still works on `:3050`.

### Phase 3 — Workspace merges (Inventory / Catalog waist)

**Done when:**

1. Sourcing is an Inventory **mode** (not a separate Inventory-section L1) **or** documented defer with nav already under Inventory — prefer real mode if blast radius allows
2. Warehouse is Inventory mode **Locations** (tabs Labels/Racks/Rooms/Bins/Map preserved under that mode or as Locations sub-nav — do not lose bin printer)
3. Catalog mode labels match §1.2 (Reference not “Catalog” colliding with section name)
4. Unified permission filtering: empty domain sections omit from root; empty modes omit from page

**Acceptance:** matrix §5 rows I / C pass; `npm run verify` full green.

---

## 4. Implementation checklist (engineer)

- [ ] Phase 0 SoT + accents + guards + command-bar
- [ ] Phase 0 `:3050` smoke (§5 A–B)
- [ ] Phase 1 Dashboard/Print
- [ ] Phase 1 `:3050` (§5 D / P / S)
- [ ] Phase 2 Review split + redirects
- [ ] Phase 2 `:3050` (§5 R)
- [ ] Phase 3 Inventory/Catalog merges
- [ ] Phase 3 `:3050` (§5 I / C)
- [ ] Update SoT + workbench.md + `sidebar-spine-validation-simplification-HANDOFF.md` locked map
- [ ] Update research briefing status line to **executed** (or add “implemented” note)
- [ ] `npm run verify` full
- [ ] §5 full matrix signed off

---

## 5. Acceptance matrix — test **all of it together** on `:3050`

Attach only. Sign each row before claiming done.

### A. Root spine

| # | Check | Expect |
|---|---|---|
| A1 | Root section list | Monitor · Scan Stations · Inbound · Catalog · Inventory · Fulfillment · Sales · Support · Studio — **no** Triage Desk, **no** Print Stations |
| A2 | Filter “desk” / “print” | No hollow hits on dead labels |
| A3 | ⌘K palette bands | Same section order/labels as spine SoT |
| A4 | Permission strip | Staff without `integrations.zendesk` loses Support section entirely |

### B. Scan Stations unchanged

| # | Check | Expect |
|---|---|---|
| B1 | Receiving subgroup | Arrival · Unbox · Local Pickup · Repair Service |
| B2 | Packing / Testing / Scan out | Still Floor; Scan out ≠ Fulfillment Labels |
| B3 | Unbox print stickers | Still works in-station |

### C. Catalog

| # | Check | Expect |
|---|---|---|
| C1 | Open Catalog | Modes: Reference · Manuals · Labels · Pairing · QC · Kit Parts |
| C2 | Labels | Product label workspace (former Print Labels → Product) |
| C3 | Manuals | Manuals library (former Print Documents) |
| C4 | Pairing | Works; Review pairing deep link lands here (after Phase 2) |

### D. Inventory

| # | Check | Expect |
|---|---|---|
| D1 | Section contains stock work | Ledger / triage / pulse / graph / replenish reachable |
| D2 | Sourcing | Under Inventory (L1 or mode) |
| D3 | Locations | Warehouse UI + bin/rack label print (former Print warehouse) |
| D4 | No Print Stations | Warehouse labels not a root print drill |

### E. Inbound / Fulfillment / Sales / Support

| # | Check | Expect |
|---|---|---|
| E1 | Inbound → Incoming | Former desk Incoming |
| E2 | Inbound → Receiving Board | Former dashboard inbound (Phase 1+) |
| E3 | Fulfillment → Labels/Ready/FBA | Carrier postage only; `/shipping/*` |
| E4 | Fulfillment → Packing Review | Packing photo QA (Phase 2+) |
| E5 | Sales boards | Sales + Local Pickup history (Phase 1+) |
| E6 | Support | All 6 modes; own root drill |

### F. Regressions

| # | Check | Expect |
|---|---|---|
| F1 | Studio → Catalog | Canvas definition still Studio — not confused with Catalog Reference |
| F2 | `/dashboard` bookmark | Redirects or still renders via domain home — no orphan nav highlight on dead Desk |
| F3 | Auto-drill | Navigating into a domain page opens that domain drill (not a dead desk/print id) |
| F4 | `npm run verify` | All blocking gates green |

---

## 6. Verify commands

```bash
# Inner loop after each phase
node --test --import tsx \
  src/components/sidebar/master-nav/main-nav-groups.guard.test.ts \
  src/components/sidebar/master-nav/station-nav-groups.guard.test.ts \
  src/lib/sidebar-navigation.test.ts \
  src/lib/nav/command-bar-nav-groups.test.ts
npm run verify -- --fast

# Before done
npm run verify
```

---

## 7. Definition of done

1. Target spine §1.1 live in SoT + UI + ⌘K  
2. Triage Desk + Print Stations gone from root  
3. Phases 0–3 complete (or Phase 3 deferrals explicitly listed with nav already under the right domain)  
4. §5 matrix all rows checked on `:3050`  
5. SoT / workbench / spine handoff docs updated  
6. `npm run verify` green  
7. Short agent-log note of what shipped (user owns commit)

---

## 8. Anti-patterns (instant fail)

- Keeping a “Misc / Desk / Other” residual section  
- Recreating Print Stations under another name  
- Putting Arrival / Unbox / Scan out under Inbound or Fulfillment  
- Folding `/shipping/labels` into Catalog Labels  
- Hardcoding section title strings in `SidebarNavList`  
- Raising knip / DS baselines to pass  
- Starting or killing `:3050`

---

## 9. Execution record — 2026-08-01

### What shipped

| Phase | Outcome |
|---|---|
| **0 — Nav SoT remap** | `SPINE_SECTIONS` = `monitor · floor · inbound · catalog · inventory · fulfillment · sales · support · studio`. New `DOMAIN_GROUPS` + `kind: 'domain'` / `domainGroup`. `STATION_GROUPS` is floor-only; `PRINT_GROUPS` deleted; `kind: 'stock' \| 'products' \| 'labels' \| 'documents'` retired. Print rows deleted (APP + PAGE). Accents extended to all nine sections (total `Record`, so a hueless section is a type error). |
| **1 — Dashboard + Print dissolution** | No `dashboard` L1. `getSidebarNavPageId` reads the `?mode=` DOMAIN: `inbound`/`receiving` → Inbound › **Receiving Board**, `sales`/`pickup` → **Sales** (own root, Sales Board · Local Pickup History), else → Fulfillment › Shipping › **Orders**. `getSidebarNavPageId('/products?view=labels')` → `products`. |
| **2 — Review split** | No `review` L1 and no `review` page-nav entry. Bare `/review` → Fulfillment › Shipping › **Packing Review**; `?mode=pairing` / `?mode=catalog-link` → **Catalog** › Pairing / Catalog link. |
| **3 — Catalog / Inventory waist** | Catalog mode `catalog` relabelled **Reference** (stable id). Hollow-section + hollow-page filtering unified: a pageless section renders nothing, and `isSidebarPageReachable` drops a page whose every mode was permission-filtered (composed by `MasterNav` **and** `buildCommandBarNavGroups`). |

### Two deviations from §1.2, both deliberate

1. **Fulfillment has a fifth mode, `Orders` → `/dashboard`.** §1.2 lists four. The Shipping modes do NOT already cover the dashboard outbound board: Labels / Ready / FBA are carrier-postage lanes, the board is the Pending · Tested · Packed · Shipped order queue. D5 requires it to land in a domain home, and Fulfillment owns orders leaving the building (Phase 1 done-when #4 explicitly allows this).
2. **Catalog has a seventh mode, `Catalog link` → `/review?mode=catalog-link`.** §1.2 says Catalog absorbs Review catalog-link; §1.1's six-mode list has no slot for it. Absorbing it as an alias mode is the absorption — the chore workspace stays on `/review` (no redirect, no clone), Catalog is just its nav home. A redirect into `/products?view=pairing` was rejected: they are different LedgerGrid surfaces over different row types, so it would have sent the operator to a different tool.

### Two Phase-3 items DEFERRED (nav already under Inventory)

**Sourcing and Locations stay Inventory-section L1 rows rather than becoming `inventory` modes.**
Phase 3 done-when #1 sanctions this for Sourcing outright; #2 is taken the same way for
Locations, for a structural reason:

> **The spine has exactly two altitudes — page → mode.** A page that owns its own
> modes cannot be demoted to a mode without either (a) losing those modes from the
> spine, or (b) orphaning its highlight. Sourcing carries Queue · Scout · Watchlist ·
> Searches · Suppliers; Locations carries Labels · Racks · Rooms · Bins · Map — and
> Locations' `labels` tab **is** the bin/rack printer that #2 says must not be lost.
> Demoting them would also leave `/sourcing` and `/warehouse` with no highlighted
> row (their page ids would no longer be in the spine's page list), which is exactly
> the `F3` regression the matrix guards against.

Both are already inside the Inventory drill and both keep their sub-nav, so the operator
outcome §1.1 asks for ("Manage Inventory — … Sourcing · Locations") is met at the row
altitude. Promoting them into real modes needs a workspace merge (Inventory absorbing the
two pages' bodies), which is the out-of-scope
[`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](./desk-contract-unification-CLAUDE-CODE-PROMPT.md) job.

### One permission shape worth knowing

A nav row carries a single `requires`, but Sales needs two gates: `dashboard.view` (the
route — `/dashboard` 403s without it) and `walk_in.view` (the front desk). The row takes the
route gate and the two feeds take the front-desk gate, so a `receiver` (walk_in without
dashboard) never sees a row that 403s, and a `packer` (dashboard without walk_in) has both
feeds filtered — at which point `isSidebarPageReachable` drops the whole row rather than
shipping a dead header. Widening `requires` to an all-of list was rejected as ask-first: it
would touch the admin access matrix, the role editor and the landing-page card, none of
which can express a second permission.

### Verification status — read this before trusting a green

- **The nav slice's own gates are green.** 86 tests across
  `main-nav-groups.guard`, `station-nav-groups.guard`, `sidebar-navigation`,
  `command-bar-nav-groups`, `mobile-context-navigation`, `route-mode-registry.guard`,
  `org-nav` — 0 failures. ESLint clean on every file this change touched. `npm run verify --fast`
  passed green after Phases 0, 1 and 2.
- **`npm run verify` (full) is RED, and none of the red is this change.** The working tree
  carries another session's in-flight `@/design-system/motion` role-barrel migration. It fails
  typecheck (`MobileSwipePhotoViewer` imports `animate` / `useMotionValue` / `useTransform`
  from a barrel that does not export them; `UnboxLineWorkspace`, `RightRailHost` and
  `ProcedureStack` call `useMotionRole` / `motionRole` without importing them), which cascades
  into the `right-rail-push.guard` unit tests and ten knip findings under
  `design-system/motion/*` + `design-system/components/procedure/*`. The one knip finding this
  change DID create — an orphaned `FileSpreadsheet` icon export, dead once Triage Desk's
  section glyph went — was deleted rather than baselined. No baseline was raised.
- **The §5 `:3050` acceptance matrix could NOT be run.** The same motion migration takes the
  dev server to a hard 500 on every route (`Export animate doesn't exist in target module`), so
  the spine cannot be rendered at all. Per `workflow-safety.md` a broken dev server is reported,
  not repaired, and the fix belongs to the session that owns those files. **Re-run §5 in full
  once that migration lands and the operator restarts `:3050`** — every row is still unverified
  in a browser.

### Files changed

`src/lib/sidebar-navigation.ts` · `src/lib/nav/spine-section-accent.ts` ·
`src/lib/nav/command-bar-nav-groups.ts` · `src/components/sidebar/master-nav/{MasterNav,SidebarNavList}.tsx` ·
`src/components/icons/nav.tsx` · guards + tests
(`main-nav-groups.guard`, `station-nav-groups.guard`, `sidebar-navigation`,
`command-bar-nav-groups`, `mobile-context-navigation`) ·
`.claude/rules/{source-of-truth,ui-design-system,display/workbench}.md` ·
`docs/todo/sidebar-spine-validation-simplification-HANDOFF.md` (§1 marked superseded).
