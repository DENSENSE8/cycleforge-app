# Handoff — Sidebar spine validation + simplification (protect nav SoT)

**For:** implementing / audit agent (Cursor / Claude Code)
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Status:** §1 map SUPERSEDED by the desk→domain split (2026-08-01); §2+ validation method still current
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/sidebar-spine-validation-simplification-HANDOFF.md and start at §2
(Validation). Confirm every claim against call sites in sidebar-navigation.ts +
SidebarNavList.tsx + MasterNav.tsx — not docblocks alone.

Protect the spine SoT (SPINE_SECTIONS / APP_SIDEBAR_NAV / SIDEBAR_PAGE_NAV /
spineSectionIdForPage / applyModeTarget). Simplify by composing and deleting
twins — never invent a second nav registry or a page-local route map.

Attach to :3050; never start/restart/kill the dev server. User owns commits.
npm run verify before done.
```

**Lineage (read when blocked, do not re-open closed decisions):**

| Doc | Role |
|---|---|
| `.claude/rules/display/workbench.md` § Section drills | Display law for spine |
| `.claude/rules/source-of-truth.md` (Stations / Main / Stock / Labels / Products rows) | SoT map |
| `docs/todo/master-nav-spine-display-HANDOFF.md` | Earlier spine ship (partially stale labels) |
| `docs/todo/home-icon-products-platforms-HANDOFF.md` | Home pin + Products out of Stock |
| `docs/todo/sidebar-routing-probe-BRIEF.md` | Measured mode-axis debt |
| `docs/todo/nav-routing-refactor-FINISH-PROMPT.md` | What landed vs what is left on URL isolation |
| `docs/todo/page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md` §4.5 | Three “Labels” jobs (not polyhierarchy) |
| Plan (executed): Labels spine + Chat rename | Print hub aliases; carrier Labels stay Desk |

---

## 0. One-sentence goal

**Validate** the current MasterNav spine (including Labels print hub + Chat top pin + Receiving page-style subgroup) against the SoT and live `:3050` UX, then **simplify** sidebar + routing so operators reach destinations with less nesting and zero twin registries — while **protecting** `sidebar-navigation.ts` as the only write path for L1/L2 membership, hrefs, and mode targets.

---

## 1. Locked spine map — SUPERSEDED 2026-08-01 by the domain split

> **This section's map is STALE.** `Triage Desk` and `Print Stations` were killed
> the same day and replaced with business-domain sections. The current locked map
> lives in
> [`desk-domain-spine-split-CLAUDE-CODE-PROMPT.md`](./desk-domain-spine-split-CLAUDE-CODE-PROMPT.md)
> §1.1 and in `.claude/rules/source-of-truth.md` → **Business-domain sections**.
> Everything below in §2+ (validation method, guard list, anti-twin rules) still
> applies — only the section names changed.

```text
TOP PIN
  Home · Search · Media · Chat                    (kind: 'top'; id ai-chat label "Chat")

SECTION DRILLS (SPINE_SECTIONS)
  Analytics Monitor  (mainGroup: monitor)
    Operations (modes: Live · Analytics · Insights · History · Signals · Reconcile)
  Scan Stations  (stationGroup: floor)          ← the ONLY station group
    Receiving  ← page-style header (icon + count) from STATION_SUBGROUPS
      Arrival · Unbox · Local Pickup · Repair Service   (stationSubgroup: receiving)
    Testing (modes: Testing · Shipping) · Packing · Scan out
  Inbound      (domainGroup: inbound)
    Inbound (modes: Incoming · Receiving Board)
  Catalog      (domainGroup: catalog)
    Catalog (modes: Reference · Manuals · Labels · Pairing · Catalog link · QC · Kit Parts)
  Inventory    (domainGroup: inventory)
    Inventory (modes: Ledger · Triage · Pulse · Graph · Replenish)
    Sourcing (modes: Queue · Scout · Watchlist · Searches · Suppliers)
    Locations (modes: Labels · Racks · Rooms · Bins · Map)   ← ex-Warehouse
  Fulfillment  (domainGroup: fulfillment)
    Shipping (modes: Orders · Labels · Ready · FBA · Packing Review)  ← CARRIER labels only
  Sales        (domainGroup: sales)
    Sales (modes: Sales Board · Local Pickup History)
  Support      (domainGroup: support)
    Support (modes: Tickets · Orders · Voicemail · Calls · Warranty · Issues)
  Workflow Studio  (mainGroup: studio)
    Studio · Catalog canvas

FOOTER
  Admin · Settings                                (kind: 'bottom')
```

> **Desk → domain split executed 2026-08-01.** `Triage Desk` (the "everything
> pointer-driven" grab-bag) and `Print Stations` (the "everything that ends at a
> printer" task slice) are dead labels. `/dashboard` and `/review` own no spine
> row — their boards / lanes are modes on the domain that owns each job, resolved
> from `?mode=` by `getSidebarNavPageId`. `kind: 'stock' | 'products' | 'labels' |
> 'documents'` are retired; membership is `domainGroup`.

### 1.1 SoT symbols (compose — never twin)

| Concern | Symbol / file |
|---|---|
| Spine order | `SPINE_SECTIONS` in `src/lib/sidebar-navigation.ts` |
| Section membership | `spineSectionIdForPage` + `kind` / `mainGroup` / `stationGroup` |
| Flat L1 rows | `APP_SIDEBAR_NAV` |
| Mode registry + `to()` / `resolveMode` | `SIDEBAR_PAGE_NAV` |
| Receiving subgroup chrome | `STATION_SUBGROUPS` + `stationSubgroup` |
| Business-domain sections | `DOMAIN_GROUPS` + `kind: 'domain'` / `domainGroup` (Print Stations + its `labels`/`documents` kinds are DELETED) |
| Navigate write path | `useSidebarModeNav` → `applyModeTarget` / `getSidebarHref` |
| Render | `SidebarNavList.tsx` (drills; highlight is the page id alone — the print-alias predicate is deleted) |
| Auto-drill | `MasterNav.tsx` (cross-section enter; manual Back stays root) |
| Guards | `main-nav-groups.guard.test.ts`, `station-nav-groups.guard.test.ts` |

### 1.2 Hard protections (bugs if violated)

1. **One registry.** No second `APP_SIDEBAR_NAV` / hardcoded `'Scan Stations'` / `'Labels'` / `'Receiving'` strings in `SidebarNavList` (guards enforce).
2. **Labels hub ≠ carrier Labels.** Desk → Shipping → Labels stays `/shipping/labels`. Print hub never aliases carrier postage.
3. **Polyhierarchy with restraint.** Labels hub rows are **aliases** to canonical URLs; Products → Labels and Warehouse → Labels stay secondary. Do not clone workspaces.
4. **Receiving stays L1 stations** under a subgroup header — not a collapsed accordion of modes. Header chrome matches multi-mode page headers (icon + count); members indent as mode rows.
5. **Modes stay always-expanded** with pinned count — no accordion chevron return.
6. **Chat label only** on top pin (`label: 'Chat'`, `id: 'ai-chat'`). Do not rename routes or GlobalHeader “assistant” / CommandBar Ask AI unless a separate task asks.
7. **URL isolation** still flows through `applyModeTarget` + route param specs — do not reintroduce copy-all denylists. See `nav-routing-refactor-FINISH-PROMPT.md`.
8. **Never start/kill `:3050`.** Attach only.

---

## 2. Validation (do first — before simplify)

### 2a. Guard + SoT smoke

```bash
node --test --import tsx \
  src/components/sidebar/master-nav/main-nav-groups.guard.test.ts \
  src/components/sidebar/master-nav/station-nav-groups.guard.test.ts \
  src/lib/sidebar-navigation.test.ts
npm run verify -- --fast
```

Expect:

| Assert | Pass condition |
|---|---|
| `SPINE_SECTIONS` ids | `monitor → floor → desk → print → studio` |
| Chat top pin | `ai-chat` label === `'Chat'` |
| Print Stations | `print-labels` modes Product → `/products?view=labels`, Warehouse → `/warehouse`, Receiving → `/unbox`; `print-documents` → `/products` |
| No label twins in list | `SidebarNavList` has no hardcoded Overview/Labels/Receiving/Print Stations strings |
| Receiving subgroup | `STATION_SUBGROUPS[0]` has `icon`; list uses `renderPageHeader` for subgroup |

### 2b. Eyeball on `:3050` (Show sidebar)

| Check | Expect |
|---|---|
| Top pin | Home · Search · Media · **Chat** (not “AI Chat”) |
| Root drills | Overview · Scan Stations · Desk · Stock · **Labels** · Products · Library |
| Labels drill | Product / Warehouse / Receiving labels; click lands on canonical URLs above |
| Products → Labels | Same URL as Labels → Product labels; both paths work |
| Warehouse → Labels | Same as Labels → Warehouse labels |
| Desk → Shipping → Labels | Still **carrier** queue (`/shipping/labels`) — not print hub |
| Scan Stations → Receiving | Header looks like Testing page row (icon + **4**); children indented |
| Auto-drill | Cross-section nav opens matching drill; Back returns root without URL force |
| Header Mode | Still owns L2 for modeful pages; spine does not remount mode rail |

### 2c. Alias active-state check

On `/products?view=labels`, open Labels drill manually: **Product labels** row should highlight (`isLabelsAliasActive`). Same for `/warehouse` (Warehouse labels) and `/unbox` (Receiving labels). Canonical Products / Scan Stations sections still auto-drill from `spineSectionIdForPage` (Labels is discovery hub; do not silently steal auto-drill unless a follow-up explicitly prefers Labels as canonical section for print URLs).

### 2d. File inventory to re-read if anything fails

- `src/lib/sidebar-navigation.ts` — SoT
- `src/components/sidebar/master-nav/SidebarNavList.tsx` — render + alias highlight
- `src/components/sidebar/master-nav/MasterNav.tsx` — auto-drill
- `src/components/sidebar/master-nav/useSidebarModeNav.ts` — write path
- `src/lib/sidebar-titles.ts` — Chat title
- `.claude/rules/display/workbench.md` + `source-of-truth.md` — law

---

### 2e. Validation result — 2026-08-01 (measured, not asserted)

Guards 53/53. §2b/§2c driven in a real Chromium against the running `:3050` with the
`qa-desktop` storage state (`tests/.auth/qa-admin.json`), reading the live spine DOM.

| Check | Result |
|---|---|
| `SPINE_SECTIONS` order | ✅ overview → floor → desk → stock → labels → products → library |
| Top pin | ✅ Home · Search · Media · **Chat** |
| Root drills | ✅ all 7, in order |
| Labels drill + destinations | ✅ `/products?view=labels` · `/warehouse` · `/unbox` |
| Desk → Shipping → Labels | ✅ still `/shipping/labels` (carrier, un-aliased) |
| Receiving subgroup | ✅ page-style header, icon + count **4**, members mode-indented |
| §2c alias highlight | ✅ all three (`products?view=labels` · `/warehouse` · `/unbox`) |
| Auto-drill | ✅ `/unbox`→Scan Stations, `/warehouse`→Stock, `/studio`→Library, `/dashboard`→Overview |
| Manual Back stays root | ✅ no URL force-reopen |
| No hardcoded section labels in render | ✅ `SidebarNavList` reads `SPINE_SECTIONS` / `STATION_SUBGROUPS` |
| `prefetchNavData` tolerates `?view=` hrefs | ✅ exact-key lookup, unregistered href is a no-op (see caveat below) |

**One real finding — §1's own map was wrong (fixed).** `sourcing` declared membership in
*both* registries with different answers: `APP_SIDEBAR_NAV` said `kind: 'main'` /
`mainGroup: 'overview'`, `SIDEBAR_PAGE_NAV` said `kind: 'stock'`. `toPageNav` merges as
`{ ...page, icon, label }`, so the mode registry **silently won** — the spine has always
rendered Sourcing under Stock, and the Overview declaration (plus the comment justifying it)
was dead text. Both per-registry guards passed the whole time because neither compared the two.
Resolved to `'stock'` (matches live — **zero behavior change**); parity across all six
membership fields is now pinned by `main-nav-groups.guard.test.ts`.

**Caveat, not a bug:** `NAV_DATA_PREFETCHERS` is keyed by *exact* href. `/unbox` matches
(so Receiving labels warms), `/products?view=labels` simply has no entry. But if anyone ever
registers a prefetcher for `/products`, the Labels-hub row will silently miss it. Worth a
normalize-then-lookup if that registry grows past one entry.

---

## 3. Simplification mandate (after §2 green)

Simplify the **whole** sidebar + routing experience under these rules. Prefer delete/merge over new altitude.

### 3.1 Decision rule

| Symptom | Action |
|---|---|
| Same job, two URLs, two workspaces | Consolidate to one URL; second nav entry becomes alias (Labels hub pattern) **or** delete the weaker entry |
| Same job, one URL, two SoT rows with different `kind` | Keep polyhierarchy only when mental models diverge (NN/g); otherwise one parent |
| Mode axis uses a one-off param (`?tab=`, `?view=`, `?packMode=`) | Prefer migrating to route-param **spec** + `applyModeTarget` construct (already the isolation SoT) — do not invent a seventh mechanism |
| Page exists only for deep-link / legacy | Keep `SIDEBAR_PAGE_NAV` if needed; **omit** from `APP_SIDEBAR_NAV` (already true for legacy `receiving`) |
| Hardcoded section/page label in render | Move to SoT constant; extend guard |
| Context panel twin of MasterNav | Kill the twin; panels stay route-key dispatched via `getSidebarRouteKey` |
| “Labels” word on carrier + print | Carrier stays “Labels” under Shipping; print hub rows stay **Product / Warehouse / Receiving labels** (already disambiguated) |

### 3.2 Simplification lanes (priority order)

**Lane A — Validate + doc sync (this handoff §2)**  
Bring stale handoffs (`master-nav-spine-display-HANDOFF`, `home-icon-products-platforms-HANDOFF`) into line with Scan Stations / Labels / Chat / Receiving page-style header — or mark them SUPERSEDED with a pointer here. No IA changes.

**Lane B — Labels hub follow-through (small)**  
- Confirm prefetch (`prefetchNavData`) tolerates `/products?view=labels` hrefs.  
- Optional Ask-first: when on product/warehouse print URLs, prefer auto-drill into **Labels** section (today Products/Stock win). Only if validation shows operators lose the hub.  
- Receiving labels still land on Unbox (station). Do **not** invent a fake `/labels/receiving` page without a real print-first surface.  
- FNSKU print: omit until a real route exists.

**Lane C — Mode-axis consistency (medium — compose from finish prompt)**  
Continue `nav-routing-refactor-FINISH-PROMPT.md` migrations: every modeful page declares a route param spec so `applyModeTarget` **constructs** instead of copy-then-delete. Highest leak risk still wins first. Do not reopen namespaced mode ids (disproved).

**Lane D — Spine cognitive load (Ask-first before cutting)**  
Candidates to evaluate with card-sort / operator language — **do not cut without approval**:

| Candidate | Tension |
|---|---|
| Overview vs Dashboard home | Overview drill may be thin if Dashboard absorbs boards |
| Library Catalog vs Products Catalog | Known §4.7 duplication |
| Sourcing in Overview | Was stock-shaped; confirm mental model |
| Testing’s “Shipping” mode vs Desk Shipping | Different job; keep separate unless evidence collapses them |
| Products modes count (6) | Pairing / QC / Kit may belong under platform Phase 2 |

**Lane E — Protecting tests**  
Any membership change updates:

- `main-nav-groups.guard.test.ts`
- `station-nav-groups.guard.test.ts`
- `sidebar-navigation.test.ts` (mode round-trips)
- SoT + workbench one-liners

Never raise knip / DS baselines to land nav cleanup.

### 3.3 Explicit non-goals

- Merging product / warehouse / receiving / carrier printers into one mega-Labels page
- Moving carrier Shipping Labels into the Labels spine
- Reintroducing mode accordion / second Mode rail in the spine
- Putting GlobalHeaderSearch or assistant controls into MasterNav
- Collapsing Arrival/Unbox/Pickup/Repair into one Receiving page with modes (L1 stations stay)
- Mobile `/m` tree redesign (desktop spine only unless asked)
- Committing / pushing / starting the dev server

---

## 4. Execution prompt (copy for implementer after §2)

```
You are simplifying Cycle Forge MasterNav + routing while protecting the SoT.

1. Finish §2 validation in docs/todo/sidebar-spine-validation-simplification-HANDOFF.md
   on :3050. File gaps as a short §2 findings list at the top of your reply.

2. Only then take Lane A (stale handoff sync) and any clear Lane B bugs.
   Lane C only if URL leak evidence is current. Lane D requires Ask-first.

3. Compose from:
   - src/lib/sidebar-navigation.ts (only membership / href / mode write path)
   - SidebarNavList / MasterNav / useSidebarModeNav
   - .claude/rules/display/workbench.md + source-of-truth.md

4. Every change: extend the matching guard; never twin labels in render;
   never alias carrier /shipping/labels into the Labels print hub.

5. Done when: §2 table green, guards green, npm run verify green,
   and simplification diff is explainable in ≤5 bullets of operator value.
```

---

## 5. Done when

- [x] §2a–§2c validation green (guards + eyeball + alias highlight) — see §2e
- [x] Stale spine handoffs updated or marked SUPERSEDED → this file
      (`master-nav-spine-display-HANDOFF` = SUPERSEDED; `home-icon-products-platforms-HANDOFF`
      = spine-delta banner, its Phase 2 Channels work left open)
- [x] Any simplify lanes taken are SoT-composed (no second registry) — Lane A only;
      the `sourcing` fix **removed** a contradictory declaration rather than adding one
- [x] Carrier Labels still only under Desk → Shipping (`/shipping/labels`, verified live)
- [x] `npm run verify` green (no baseline raised; the 22 tenancy-isolation findings are
      advisory + pre-existing, none in nav)
- [x] Short agent-log + reply: validated §2 end-to-end; simplified the `sourcing` double
      declaration + added the registry-parity guard; **deferred Ask-first:** Lane C
      (mode-axis migrations), Lane D (Overview-vs-Dashboard, Library-vs-Products Catalog,
      Products' 6 modes, and — now with evidence — whether Sourcing *should* live in
      Overview rather than Stock), Lane B's optional Labels auto-drill preference

---

## 6. Current known deltas vs older handoffs

| Older claim | Reality now |
|---|---|
| §1 above: Overview = Dashboard · Operations · **Sourcing** | **Wrong — corrected 2026-08-01.** Overview = Dashboard · Operations; **Sourcing sits in Stock**. `APP_SIDEBAR_NAV` said `mainGroup: 'overview'` while `SIDEBAR_PAGE_NAV` said `kind: 'stock'`; `toPageNav` spreads `...page`, so the mode registry always won and the spine has *never* rendered Sourcing in Overview. Both registries now agree on `'stock'` (zero behavior change) and parity is guarded |
| Top pin ends at Media / “AI Chat” | Ends at **Chat** (`ai-chat`) |
| Spine stops at Stock → Products | **Labels** sits between Stock and Products |
| Receiving = quiet micro label | Receiving = **page-style** subgroup header (icon + count; members mode-indented) |
| Floor label “Floor” | **Scan Stations** (`id` still `floor`) |
| Three “Labels” = one surface? | **No** — three jobs; print hub aliases product/warehouse/receiving only |
