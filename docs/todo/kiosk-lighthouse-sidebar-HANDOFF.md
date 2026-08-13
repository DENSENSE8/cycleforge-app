# Handoff prompt — Kiosk Lighthouse + Cursor-grammar sidebar

**Paste this as the first user message for the next agent (Grok / Cursor).**  
Live law: root `AGENTS.md` + `node scripts/sot-lookup.mjs "<job>"`.  
Do **not** look for `.claude/legacy-rules-archive/` or deleted `*.guard.test.ts` proxies.

Reference screenshots (this chat): Cursor agent sidebar — **icon-only rail when closed**, **Search + named rows when open**, **smooth width**, not a hard snap. Steal **layout grammar only**. Do **not** copy Cursor’s dark zinc theme, avatars, timestamps, or “Main Coder” badges. Kiosk stays Kinetic Ledger + POS tokens (`kiosk-chrome.ts` / `kiosk-pos-surface.ts`).

---

## Task (one sentence)

Raise Lighthouse scores on `/kiosk` and `/kiosk/v2`, and rebuild the landscape mode spine so it **collapses to icons**, **expands to a top Search field + full tab names**, and **tweens width** via `motionRole.push.rail` — never a locked always-on labeled rail and never an instant 0↔N snap.

---

## Why (product)

The landscape shell just landed a **persistent `w-24` stacked icon+label rail** (no collapse, no tween). That still eats horizontal space, still shows labels when “closed,” and still **hard-locks** width. The operator reference is Cursor’s agent sidebar:

| State | Face |
|---|---|
| **Closed** | Narrow icon-only column. Active = inset rounded wash on the glyph. Tooltips carry the name. |
| **Open** | Wider column. **Search** is the first row (magnifying glass + placeholder). Tabs become **icon-leading + full name** (Repair · Buy / Sell · Pickup). Active = rounded row wash. |
| **Motion** | Width + label/search opacity **ease together**. No clip-to-zero, no one-frame snap. |

Lighthouse: neither `/kiosk` nor `/kiosk/v2` is in `scripts/lighthouse-audit.mjs` `ROUTES` today, so the tablet POS has **no ratchet**. Add them and actually move Performance / TBT / LCP — do not chase scores by stripping Kinetic Ledger density or inventing a second search engine.

---

## Explicit overrides of prior kiosk decisions

These **replace** comments in `kiosk-chrome.ts` / `KioskModeSpine.tsx` / the POS modernization handoff:

| Prior (do not restore) | Now |
|---|---|
| Spine always on at `w-24` with stacked micro-labels | Two widths: **collapsed icon rail** + **expanded named rail** |
| Closed = `width: 0` + `inert` (staff `SidebarNavColumn` clone) | Closed = **icons still visible** (~56px). Never off-screen. |
| No tween (staff MasterNav snap, 2026-08-08 cost test) | **Tween** `motionRole.push.rail` — user asked; kiosk is a customer-facing tablet, not the most-repeated staff nav |
| `KioskSpineToggle` deleted | Restore a toggle: collapsed = small control on the rail; expanded = trailing control in the Search row |
| Search only on the product browse stage | Expanded spine **hosts** Search at the top; it must **drive the existing ProductSelector `search` state** (one engine) |

Staff `SidebarNavColumn` **stays a snap**. Do not “fix” desk MasterNav to match this.

---

## Visual contract (implement this, not a screenshot clone)

```
COLLAPSED (~56px / w-14)              EXPANDED (~256px / w-64)
┌────┐                                ┌──────────────────────────┐
│ [☰]│  ← toggle                      │ 🔍 Search          [→|]  │
├────┤                                ├──────────────────────────┤
│ 🔧 │  Repair (tooltip)              │ 🔧  Repair               │
│ 💵 │  Buy / Sell                    │ 💵  Buy / Sell           │
│ 🛒 │  Pickup                        │ 🛒  Pickup               │
└────┘                                └──────────────────────────┘
        Catalog (w-64 pills) + product grid keep the floor.
```

- **Collapsed rows:** `flex-col` **or** icon-only centered cell — **no visible label**. `aria-label` stays the full `KIOSK_SERVICES[].label`.
- **Expanded rows:** `flex-row items-center gap-3`; name uses the short labels already in `KioskModeSpine` (`Repair` / `Buy / Sell` / `Pickup`).
- **Search:** `TextField` (design-system), `KIOSK_POS_SEARCH_INPUT` fill. Placeholder `Search` / `Search repairs`. **Do not** mount a second combobox / cmd-k / Fuse index.
- **Radius:** POS exception `rounded-xl` on spine cells (same as category pills). Ops chrome stays `cornerClass('flush')`.
- **Tokens only:** `bg-surface-card` / `bg-surface-accent` / `text-text-*`. No `bg-zinc-*`, no page-local hex.
- **Default:** **collapsed** (icon rail) so first paint maximizes the product grid and LCP.

### Search wiring (one engine)

Lift or callback the existing `search` state from `ProductSelector` (`layout="kiosk-split"`) into `KioskShell` **or** pass a render prop / `catalogSearchSlot` into the expanded spine. Collapsed: spine search unmounts or `opacity-0` + `aria-hidden`; the browse-stage search bar may remain (do not duplicate two visible fields — pick **one** visible Search: spine when expanded, browse stage when collapsed).

---

## Motion (non-negotiable)

```ts
import { motion, motionRole, useMotionRole } from '@/design-system/motion';
// NEVER import `motion/react` or `framer-motion` outside design-system/motion/framer.ts

const { transition } = useMotionRole(motionRole.push.rail);
// animate the spine width with `transition` — tween, never a spring
```

- Animate **width** of the spine host between `KIOSK_MODE_SPINE_COLLAPSED_W_PX` (~56) and `KIOSK_MODE_SPINE_EXPANDED_W_PX` (~256) with **`motionRole.push.rail`** (`framerTransition.sidebarNavColumnMount` — tween, `motionBezier.layout`, **never a spring**).
- Labels + Search: opacity (and optional `overflow-hidden` clip) on the same transition. Do not `x`-translate the column out of its reserved slot (`push.rail` presence is opacity-only on purpose).
- `useReducedMotion`: duration 0 (instant). Still icon-vs-named states — just no tween.
- Guard: `src/design-system/foundations/motion-boundary.guard.test.ts` — app files must not import `motion/react`.

Lookup first: `node scripts/sot-lookup.mjs "push rail"` and `node scripts/sot-lookup.mjs "motionRole"`.

---

## Lighthouse (measure, then cut)

Runbook: [`docs/performance/LIGHTHOUSE.md`](../performance/LIGHTHOUSE.md).

**Never start/kill the user’s `:3050` dev server.** Isolated prod build:

```bash
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
export LH_BASE_URL=http://localhost:3100
```

Kiosk is a **device principal** (`cf_kiosk`), not staff `cf_sid`. `lighthouse-mint-session.mjs` is the **staff** cookie. For `/kiosk*`:

1. Pair via existing `POST /api/kiosk/dev-autopair` (dev/non-prod) **or** document a kiosk mint helper.
2. Audit with that cookie. A run that lands on the pair screen is `⚠ redirected` — discard it.

Add to `ROUTES` in `scripts/lighthouse-audit.mjs`:

```js
{ path: '/kiosk',    tier: 2, auth: true, formFactor: 'desktop' },
{ path: '/kiosk/v2', tier: 2, auth: true, formFactor: 'desktop' },
```

Tablet POS is landscape — **desktop** form factor, same reason as `/unbox`. Do **not** mobile-emulate 412px for this route.

Targets (new floors — measure first, then set `min` **at or below** median; ratchet only moves up):

| Category | Aim |
|---|---|
| Performance | ≥ 70 on `/kiosk` welcome; ≥ 50–70 on `/kiosk/v2` after catalog hydrate (honest) |
| Accessibility | ≥ 90 |
| Best Practices | ≥ 90 |
| LCP | ≤ 2.5 s (welcome tiles / Catalog header — not the 40th product image) |
| TBT | ≤ 600 ms |
| CLS | ≤ 0.1 (collapsed default width helps) |

`pnpm lighthouse:audit -- --routes /kiosk,/kiosk/v2 --desktop --runs 3`  
Then `--update-baseline` **only** after a real win.

### Known score killers on this surface (fix what the trace shows)

| Issue | Where | Direction |
|---|---|---|
| Entire `/kiosk/v2` is `'use client'` | `src/app/kiosk/v2/page.tsx` | Split pair chrome vs `KioskShell`; `dynamic()` AttractLoop + shell like proven `/kiosk` already does for intake forms |
| Attract video/img loaded even when not in attract | `AttractLoop.tsx` | Mount media **only** in `mode === 'attract'` |
| `mousemove` idle reset | `v2/page.tsx` | Throttle / pointerdown+keydown only — mousemove on a kiosk is TBT poison |
| No `loading.tsx` | `src/app/kiosk/**` | Skeleton that matches Catalog + icon rail (CLS) |
| Product tiles use raw `<img>` | `ProductSelector.tsx` ~778 | Keep lazy/async; add width/height or `next/image` **if** URLs are allowed (Ecwid CDN — check `images.remotePatterns`). LCP candidate = first tile or Catalog header, not every thumb |
| Catalog waterfall | `ProductSelector` fetch categories + all products on mount | Don’t block first paint on the full product grid; paint rail + search + skeleton grid first |
| Idle `setInterval` 1s | `v2/page.tsx` | Fine; don’t also rAF-poll |

Do **not** shrink body/input type below ~16px (iOS zoom + arm’s-length). Do **not** drop `applyStreamBudget` patterns elsewhere to “help” kiosk.

---

## Files to touch (expected)

| File | Job |
|---|---|
| `src/app/kiosk/kiosk-chrome.ts` | Collapsed/expanded width tokens; row recipes for icon-only vs icon+label |
| `src/app/kiosk/KioskModeSpine.tsx` | Two-state rail + Search slot + `motionRole.push.rail` width |
| `src/app/kiosk/KioskShell.tsx` | `spineExpanded` state; search lift; toggle |
| Restore `src/app/kiosk/KioskSpineToggle.tsx` (or inline IconButton) | Collapse control |
| `src/components/repair/ProductSelector.tsx` | One search owner; hide duplicate field when spine expanded |
| `src/app/kiosk/v2/page.tsx` | Idle listeners, dynamic AttractLoop/shell |
| `src/app/kiosk/AttractLoop.tsx` | Media only when visible |
| `scripts/lighthouse-audit.mjs` + `lighthouse-baseline.json` | Routes + floors |
| `src/app/kiosk/kiosk-pos-surface.test.ts` | Width tokens, no `w-24` locked labeled rail |
| `src/components/repair/ProductSelector.kiosk-split.test.ts` | Toggle restored |
| `tests/e2e/kiosk-intake-flow.spec.ts` | Collapsed icons visible; expand → Search + named tabs; mode switch still works |

Do **not** silently cut over main `/kiosk` welcome tiles. Proven `/kiosk` Lighthouse work is **bundle/idle only**, not this sidebar.

---

## Tests

Source:

- Collapsed width ≠ 0 and ≠ 240; expanded > collapsed.
- Spine rows collapsed: no visible shortLabel in the DOM **or** `sr-only` / opacity-0 (prefer visually hidden with `aria-label` on the tab).
- Expanded: Search textbox in the spine; tabs still `role="tab"`.
- `motion/react` not imported from `KioskModeSpine`.
- ProductSelector still the only catalog search state.

E2E (`kiosk-intake-flow.spec.ts` landscape shell test):

1. After pair on `/kiosk/v2`, `kiosk-mode-spine` visible, **no** Search in spine (collapsed).
2. Toggle expand → Search visible, tabs named Repair / Buy / Sell / Pickup.
3. Click Buy / Sell → All items. Pickup → pickup details.
4. Collapse → icons remain, product grid wider (optional bounding-box assert).

`npm run verify` before done. Do not raise knip/jscpd ratchets to pass.

---

## Compose — do not invent

| Need | Use |
|---|---|
| Mode list | `KIOSK_SERVICES` · `src/lib/kiosk/services.ts` |
| Chrome / pills | `kiosk-chrome.ts` |
| Category / tiles | `kiosk-pos-surface.ts` + `ProductSelector` `kiosk-split` |
| Search field | `TextField` + `KIOSK_POS_SEARCH_INPUT` |
| Width tween | `motionRole.push.rail` via `@/design-system/motion` |
| Tooltip on collapsed icons | `HoverTooltip` |
| Toggle glyph | Same sidebar-rect SVG as deleted `KioskSpineToggle` / staff `SidebarCollapseControl` |

---

## Out of scope

- Bottom mode dock (still banned — palm hazard).
- Cutting over `/kiosk` → v2 shell.
- History / PIN reprint (Phase 4 of POS modernization handoff).
- Copying Cursor dark theme, agent avatars, timestamps, Drive pills.
- Animating staff MasterNav.
- `db:push`, force-push, starting the user’s `:3050` server.

---

## Done when

1. `/kiosk/v2` collapsed = icon rail; expanded = Search + named tabs; **smooth** tween (reduced-motion = instant).
2. Catalog search is one state.
3. `/kiosk` and `/kiosk/v2` are in the Lighthouse manifest; desktop medians recorded; Performance not worse than first honest run after the perf cuts.
4. E2E landscape shell test green; `npm run verify` green on **this change’s files** (do not boil the dirty worktree).
