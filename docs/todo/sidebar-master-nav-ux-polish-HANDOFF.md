# Handoff — MasterNav sidebar UX / UI polish (icons · type · color · motion)

**For:** implementing agent (Cursor / Claude Code / improve-ui skill)
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Status:** ready to execute — **IA / membership locked**; this pass is visual + kinetic polish only
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/sidebar-master-nav-ux-polish-HANDOFF.md and start at §2
(Locked map) then §3 (Work). Confirm icons / motion / type against call sites
in sidebar-navigation.ts + SidebarNavList.tsx + Icons SoT — not docblocks alone.

Do NOT reopen spine membership (Monitor / Scan Stations / Desk / Studio order,
Dashboard under Desk, Labels aliases, carrier Labels). Polish the MasterNav
chrome only: section icons, type comfort, richer active/hover color, more
delightful motion — still Kinetic Ledger tokens + named framer SoT.

Attach to :3050; never start/restart/kill the dev server. User owns commits.
npm run verify before done.
```

**Lineage (read when blocked; do not re-open closed IA):**

| Doc | Role |
|---|---|
| [`sidebar-spine-validation-simplification-HANDOFF.md`](sidebar-spine-validation-simplification-HANDOFF.md) | Locked spine membership + Labels / Chat rules |
| `.claude/rules/display/workbench.md` § Section drills | Spine grammar + type ladder |
| `.claude/rules/kinetic-ledger.md` | House identity — no second visual language |
| `.claude/rules/ui-design-system.md` § Type | IBM Plex one-family law (600 cap) |
| `src/design-system/foundations/motion-framer.ts` | Named motion SoT (`spineDrill`, …) |
| `src/components/Icons.tsx` + `src/components/icons/*` | Glyph SoT — add icons here, never page-local SVG |

---

## 0. One-sentence goal

Make the MasterNav **easier on the eyes and more fun to use** — clearer section icons, warmer type/color, richer active/hover (not only blue wash), and more intentional motion — **without** inventing a second design language or a second nav registry.

---

## 1. Operator ask (translate → house)

| Operator language | House translation |
|---|---|
| “Google fonts / easier on the eyes” | Improve **spine readability** via IBM Plex role/tracking/size — **Ask-first** before loading a second foundry (Inter / Geist / etc.). Kinetic Ledger = one family. |
| “More detailed colors / more fun / not just blue highlight” | Grow **section-aware accent tones** from theme tokens (wash + icon tint + hairline), keep SemanticToken SoT — no page-local hex. |
| “More animation and motion” | Grow **named** `framerPresence` / `framerTransition` entries for spine (hover, active, filter reveal, staggered root). Still honor reduced-motion + no heavy x-slide on the 240px push spine. |
| Icon swaps (below) | Wire through `MAIN_GROUPS` / `STATION_GROUPS` `icon` fields + Icons SoT. |

---

## 2. Locked map (do not change membership)

```text
TOP PIN
  Home · Search · Media · Chat

SECTION DRILLS (order locked)
  Analytics Monitor
  Scan Stations
  Triage Desk
  Workflow Studio

FOOTER
  Admin · Settings
```

Membership (Desk flat L1, Operations under Monitor, etc.) stays as shipped in
`sidebar-navigation.ts`. This handoff only changes **how sections look and feel**.

Drill already has a compact `SearchField` (“Filter pages…”) — keep it; polish
its presence (motion / focus tone), do not replace with banned `SidebarSearchBar`.

---

## 3. Work (priority order)

### 3.1 Section icons (must ship)

Update `MAIN_GROUPS` / `STATION_GROUPS` icons in [`src/lib/sidebar-navigation.ts`](../../src/lib/sidebar-navigation.ts).
Add missing glyphs to the Icons SoT (`src/components/icons/nav.tsx` or matching module) — prefer lucide wraps like `Warehouse` / `ShelvingUnit` when a glyph is missing.

| Section id | Label (keep) | Icon ask | Suggested SoT name | Notes |
|---|---|---|---|---|
| `monitor` | Analytics Monitor | **chart-pie** | `ChartPie` (or `PieChart`) | Today: `Monitor`. Analytics/TV observe signal. |
| `floor` | Scan Stations | **scan** (like Scan out) | Reuse scan-out family — e.g. wrap `Barcode` / `ShippingModeScanOut` base, or add `ScanBarcode` | Must read as scanner, not generic package. |
| `desk` | Triage Desk | **sheet** | `FileSpreadsheet` or `Sheet` | Today: `ClipboardList`. Spreadsheet / triage table cue. |
| `studio` | Workflow Studio | **workflow** | `Workflow` (lucide `Workflow`) | Today: `Share2`. Canvas / definition graph cue. |

Guards already assert `typeof section.icon === 'function'` — extend
`main-nav-groups.guard.test.ts` / `station-nav-groups.guard.test.ts` to pin the
**exact** icon component identity (same pattern as Home → `Home`).

Eyeball on `:3050`: root shows icon left of every section label; drill back title
can stay text-only (or quiet leading icon — optional, Ask if crowded).

### 3.2 Type comfort (spine only first)

Current ladder (law): `MasterNavHeader` = `text-role-body`; destinations =
`text-role-caption`; counts = `text-role-micro` (condensed).

Polish options that stay legal:

1. Soften whisper: inactive section/page rows use a slightly higher contrast
   muted (still `text-text-*` tokens) so IBM Plex caption doesn’t feel washed out.
2. Tracking / letter-spacing only via existing type roles — don’t invent
   `tracking-[…]` one-offs.
3. **Ask-first:** if still hard to read after (1–2), propose a **spine-only** role
   tweak in `families.ts` / CF Type plugin — **not** a second Google font.

Never load Inter / Roboto / system as a parallel face. Never raise weight above 600.

### 3.3 Color — richer than blue-only

Today active page = `bg-blue-600` / `text-white`; modes = blue wash. Fun ≠ random.

Ship a **section accent map** composed from tokens (grow SoT if needed):

| Section | Accent personality (token direction) |
|---|---|
| Analytics Monitor | cool info / slate-cyan observe |
| Scan Stations | amber / scan-floor energy |
| Triage Desk | emerald or indigo workbench |
| Workflow Studio | violet / canvas (use existing purple theme tokens if present) |

Rules:

- Active page fill / icon tint / hover wash read the **current drill’s** accent
  (or root row’s section accent when on root).
- Top pin + footer stay neutral (don’t rainbow every row).
- No raw hex; no new “brand purple gradient” landing look.
- Extend guards so `SidebarNavList` does not hardcode `bg-blue-600` alone once
  the accent SoT exists (or keep blue as default fallback with one named helper).

### 3.4 Motion — more delight, still ops-safe

Compose from [`motion-framer.ts`](../../src/design-system/foundations/motion-framer.ts); grow named entries — never inline springs in `SidebarNavList`.

| Moment | Direction |
|---|---|
| Root ⇄ drill swap | Keep **opacity-only** `spineDrill` (no heavy x-slide on 240px spine). Optional: very slight blur or scale `0.98→1` **Ask-first** if it stays ≤150ms and reduced-motion collapses to opacity. |
| Root section hover | Icon nudge / color fade via token transition (CSS ok if ≤150ms). |
| Active page enter | Soft wash fade (named presence) instead of hard pop. |
| Drill filter field | Mount fade when entering drill; clear on Back (already resets state). |
| Mode rows | Optional 1-step stagger on first expand only — cap total ≤200ms; honor `prefers-reduced-motion`. |

Auto-drill must **not** steal focus (existing guard). Prefer `useMotionPresence` /
`useMotionTransition`.

### 3.5 Explicit non-goals

- Reordering or renaming sections again (Analytics Monitor / Scan Stations /
  Triage Desk / Workflow Studio labels stay).
- Moving Dashboard / Stock / Products / Labels membership.
- Reviving `SidebarSearchBar` / `SidebarShell.search`.
- Second typeface without Ask-first + SoT update.
- Mobile `/m` tree redesign.
- Starting / killing `:3050`; committing / pushing (user owns).

---

## 4. Files to touch

| Layer | Paths |
|---|---|
| Icons SoT | `src/components/icons/nav.tsx` (or stations) + barrel `Icons.tsx` |
| Membership icons | `src/lib/sidebar-navigation.ts` (`MAIN_GROUPS` / `STATION_GROUPS`) |
| Render | `src/components/sidebar/master-nav/SidebarNavList.tsx` |
| Motion SoT | `src/design-system/foundations/motion-framer.ts` (+ hooks consumers) |
| Optional accent SoT | new small helper under `src/lib/nav/` or `design-system/tokens` — one module |
| Guards | `main-nav-groups.guard.test.ts`, `station-nav-groups.guard.test.ts` |
| Law one-liners | `.claude/rules/display/workbench.md`, `source-of-truth.md` if accents become SoT |

---

## 5. Done when

- [ ] Section icons match the table in §3.1 (ChartPie / scan / sheet / Workflow)
- [ ] Root + drill feel easier on the eyes (type contrast) without a second foundry
- [ ] Active/hover color is section-aware — not only global blue
- [ ] At least 2–3 intentional spine motions beyond today’s opacity drill swap
- [ ] Guards green; `npm run verify` green; no knip / DS baseline raised
- [ ] Short agent-log + `:3050` eyeball (Show sidebar → root icons → each drill → filter)

---

## 6. Execution prompt (copy)

```
You are polishing Cycle Forge MasterNav UX/UI only.

1. Read docs/todo/sidebar-master-nav-ux-polish-HANDOFF.md §2–§3.
2. Swap section icons per §3.1 via Icons SoT + MAIN_GROUPS / STATION_GROUPS.
3. Soften type contrast + add section accent color (tokens only) + grow named
   framer spine motion — no second font, no SidebarSearchBar, no IA reopen.
4. Extend guards; eyeball :3050; npm run verify before done.
```
