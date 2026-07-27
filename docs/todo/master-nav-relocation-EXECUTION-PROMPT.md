# Handoff — master-nav relocation + conditional context sidebar

**Goal:** move navigation out of the 360px context sidebar into `GlobalHeader`, so the sidebar can be conditional/absent without stranding routes.

**Lane:** `main` (WS-DOGFOOD). Rules: `AGENTS.md`, `.claude/rules/display/workbench.md`.

---

## Phase 1 — ⌘K covers L2 modes ✅ DONE (2026-07-27)

`filterPageModes` promoted to `src/lib/sidebar-navigation.ts`; `CommandBar` gained a `Modes` group (47 rows / 12 pages) dispatching via `useSidebarModeNav`. Query-gated so the palette isn't buried at rest. This was the safety net — every deletion below is now non-destructive.

---

## Two traps (these set the order — do not reorder)

**A — mobile drawer.** Mobile-allowed non-`/m` routes reach nav *only* through the drawer (`ResponsiveLayout.tsx:271` → `DashboardSidebar inDrawer` → `SidebarShell` → `MasterNav`). `GlobalHeader` is desktop-only and returns `null` on public paths. **Relocation is desktop-path-only; the drawer keeps rendering the full `MasterNav`.**

**B — collapse ordering.** `sidebarCollapsed` unmounts the sidebar *including the nav band*. Phase 4 is only safe after Phase 2.

---

## Phase 2 — Relocate the nav band (desktop only)

- Mount `MasterNavHeader` (40px: chevron · name-of-now · MRU chips) in `GlobalHeader`'s **left cluster**, after the collapse toggle, before `HeaderTopWorkOrderChip`. **Not** `panelContent` — that slot is page-owned via `useHeader()`.
- Both menus already have a working no-context anchoring branch (`MasterNavView.tsx:269+`, used by the design-demo). Reuse it; write no new positioning.
- State hooks (`useActiveSidebarMode`, `useSidebarModeNav`, `useRecentModes`) move with the band — all router-driven, so they work unchanged.
- Icon stroke: header/MRU chips use native SVG stroke (`TOP_CHROME_ICON_GLYPH` / `SIDEBAR_MRU_GLYPH`) — do **not** layer `navIconStrokeClass`.

**Accept:** desktop menus + MRU work from the header; sidebar shows only its context panel; mobile drawer unchanged; `/operations` (no collapse toggle) still navigable; no double-mounted nav at any viewport.

## Phase 3 — Sidebar becomes pure context

- `SidebarShell` renders `SidebarContextPanel` directly on the docked-desktop path.
- **Keep `MasterNavProvider`** — 14 panels read it to suppress their own mode pills.

## Phase 4 — Conditional collapse *(gated on Phase 2)*

- Route-driven default for `sidebarCollapsed` (`ResponsiveLayout.tsx:141`) where the context panel is `null` — start with `ops-photos`. Handle `dashboard` inbound only if it falls out cleanly (it's dynamic).
- Persist a user override per route. Existing left-edge dwell restore is unchanged.

**Accept:** `/ops/photos` opens full-width; dwell-restore works; manual open persists on return; no first-paint layout shift (the sidebar chunk ships a fixed-width placeholder — verify it respects the collapsed default).

## Phase 5 — Prune duplicated dropdown depth

- Drop `expandedKey` / `onToggleRow` + the per-row `AnimatePresence` (`MasterNavDropdown.tsx:111-153`) — ⌘K now owns mode depth. Also removes a `height: 0 → auto` layout animation.
- **Keep the flat page list.** It's the browsable index for staff who don't know a mode's name. Don't delete the dropdown wholesale.
- Clean dead props off `MasterNavView` / `MasterNav`; clear `knip` fallout.

---

## Verify

```bash
npm run verify
```

**Known-red baseline (pre-existing, not yours):** `Route-permission drift` + `Route-auth enforce` fail on committed `main`. They scan `src/app/api/**` only — if your diff touches no API file, ignore them. Everything else must be green. **Never raise a DS-ratchet baseline or `--no-verify`.**

Phases 2–4 are chrome — unit tests can't cover them. **Browser-verify each** at desktop + narrow viewport.

---

## Out of scope

- Right detail-stack modality (backdrop + scroll-lock + `fixed`-position occlusion). Separate, larger change.
- Moving mode switchers into content-chrome tabs. Law 2 stands — this relocates *where the rail lives*, not what's in it.
- A 48px icon-rail sidebar variant. Phase 4 reuses full-collapse instead.

## When done

`pnpm worklog "<action>" --result <r>` per phase. If Phase 2 or 4 changes where the mode rail lives, update `.claude/rules/display/workbench.md` + the SoT row in `.claude/rules/source-of-truth.md` in the same change — code first, then doc.
