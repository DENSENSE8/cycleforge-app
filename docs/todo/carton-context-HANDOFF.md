# Handoff prompt — carton context header, continued

**Paste this whole file as your opening prompt.** It is written to be self-contained;
you should not need the previous conversation.

**Date handed off:** 2026-08-17
**Repo:** `/home/avion/cycleforge-app` (WSL2 Ubuntu-22.04, ext4) — branch `main`
**HEAD at handoff:** `6f883701c chore(mcp): register the code-graph server for this repo`

---

## 0. STOP — read this before touching anything

**Nothing in section 2 has been verified in a browser.** Not one pixel. The previous
session could not authenticate a dev session from its browser surface and shipped four
consecutive fixes to the same flashing bug on reasoning alone — three of which were
wrong. Treat every claim in §2 as *plausible and type-checked*, not *working*.

**Your first task is to look at it.** Everything else is secondary.

---

## 1. Environment — the parts that waste an hour if you learn them the hard way

- The repo is **only** at `/home/avion/cycleforge-app`. `E:\cycleforge-app` is an
  **empty** directory (0 files, no `.git`). If your working directory is `E:\`, file
  links will not resolve and you are in the wrong place.
- Dev server is **already running** on `:3050` inside WSL (`next dev --turbopack -p 3050`,
  cwd `/home/avion/cycleforge-app`). **Attach only. Never start, restart, or kill it.**
  If it is down, report it — do not repair it.
- Reachability from Windows: `localhost:3050` works, `127.0.0.1` does not.
- If you are driving WSL from a Windows shell:
  - Use `bash -lc`, **not** `bash -c`. A non-login shell has neither `node` nor
    `~/.local/bin` on PATH.
  - **`$?` is unreliable** through `wsl.exe` — the Windows-side shell expands it before
    WSL sees it, so it always reads `0`. Use `cmd && echo PASS || echo FAIL` instead.
    Several "verified exit 0" claims in the previous session were meaningless because
    of this.
  - Editing over `\\wsl.localhost\Ubuntu-22.04\...` works for Read/Write/Edit but
    **ripgrep times out** and file-send refuses UNC. Prefer running inside WSL.
- **Another session is actively editing this tree.** At handoff these files were
  modified by someone else — do not stage, revert, or "fix" them:
  `src/components/layout/{HeaderPageSwitcher,ResponsiveLayout,header-chrome-menu}.tsx`,
  `src/components/sidebar/{ContextPanelLayout,SidebarNavColumn,sidebar-spine.ts}`,
  `src/components/sidebar/master-nav/{SidebarNavList,SpineTopPins}.tsx`,
  `src/lib/nav/spine-section-accent.ts`.
  Several of them **fail typecheck**. Before assuming a red gate is yours, scope it:
  ```bash
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "<your files>"
  ```

---

## 2. What shipped, unverified

### 2a. The reflow loop (root cause of the flashing) — `useCartonContextBarLayout.ts`

The `ResizeObserver` was observing `[data-carton-bar-slot="classify"]` — the element whose
width is the **output** of the `classifyCompact` decision the hook makes. Closed loop:
measure → flip compact → labels become shortLabels → width changes → observer fires.
`CLASSIFY_EXPAND_HYSTERESIS_PX = 20` damps the steady state but any perturbation starts it
flapping, and while it flaps the pills move under a stationary pointer, firing `mouseleave`
and flashing their menus.

Fixes: (1) observe the **container only**; (2) `requestAnimationFrame`-batch the callback;
(3) new `frozen` param — `CartonContextCard` passes `openPicker != null` so the row cannot
reflow while a cell owns the pointer; (4) re-measure on unfreeze, since a resize landing
while frozen is dropped rather than queued.

### 2b. Four hover engines → one — `src/hooks/useHoverSurface.ts` (NEW)

One 28px row was running four engines with three different close delays (0 / 120 / 150ms),
none of them a token. Consolidated:

| Engine | Was | Now |
|---|---|---|
| `CopyChipHoverMenu` | own timer, `CLOSE_DELAY_MS = 120`, `transition-opacity duration-100` | delegates; constant + fade deleted |
| `useRailHoverPreview` | own timers + own module-scope singleton | 123 → 55 lines, same public API |
| `InlinePillPicker` | ad-hoc timers + a `document` `pointerover` listener | delegates; lifted open mirrored into the registry |
| `HoverTooltip` | — | **untouched on purpose**: 375 consumers, app-wide blast radius |

Contract: `HOVER_DELAYS = { OPEN_MS: 0, CLOSE_MS: 150 }`. Open fires **in the pointer
event**, not `setTimeout(fn, 0)` (which still defers a task ≈ one visible frame). Close is
asymmetric and must stay non-zero — it is the only thing letting the pointer cross the seam
onto the panel. One surface open at a time via a module-scope registry (optional
`HoverSurfaceProvider` scopes it to a subtree).

Guard: `src/hooks/hover-surface-single-engine.guard.test.ts` — fails on a raw `setTimeout`
in a migrated surface, a re-declared delay constant, `modal` returning to Radix's default,
the fade returning, or `ro.observe(classifyEl)` reappearing.

### 2c. Carton header UI changes

- Claim button: `claim` → **`Claim`** (sentence case; `Ticket` icon was already there).
- Lifecycle status dot moved to sit **between the back control and the order #**
  (was after tracking). Docblock on `STATION_IDENTITY_LEAD_COL_CLASS` updated to match.
- Hover seam `STATION_CHROME_CELL_HOVER_SEAM` on every interactive cell:
  `hover:ring-1 hover:ring-inset hover:ring-current/30`. `ring-inset` not `border` (a
  border shifts the row 1px); `ring-current` not a fixed grey, because a grey hairline is
  crisp on the white neutral cells and invisible on the Photos/Claim colour washes — which
  is why only Back-to-list and Listing appeared to have a hover box.
- Classify menus open on **hover**, `modal={false}` (Radix's default puts
  `pointer-events: none` on `<body>`, which alone guarantees a flashing loop).
- `HoverTooltip` and native `title` removed from the hover-opened trigger — a tooltip
  portals a layer under the cursor and fights the menu for the same gesture.
- `— click to change` removed from tooltip and `aria-label`.
- New **Edit colours** footer row on the Platform and Type menus (hairline + `PaintBucket`),
  opening `CatalogManagerPopover` — the real org catalog CRUD where `platforms.color_hex`
  lives. **Urgency deliberately has none**: it is `receiving.priority_tier`, not a catalog
  row, so there is nothing to edit and a dead row would be worse than its absence.
- `elev-overlay-right` registered in the `cn()` shadow group (`src/utils/_cn.ts`) —
  unregistered, twMerge misgroups it as a shadow-*colour*.

### 2d. Unrelated, also in the tree

`scripts/jscpd-gate.mjs` hardened to run the installed binary instead of `npx jscpd`
(with no `node_modules`, npx silently fetches a different major whose flags and clone
accounting don't match the baseline). `knip-baseline.json` shrunk 2549 → 2548.

---

## 3. YOUR FIRST TASK — verify §2 in a browser

Get an authenticated session at `http://localhost:3050`, open `/unbox`, open a carton with
at least one PO line, then check, in order:

1. **Hover a Priority / Platform / Type pill and hold still.** It must open instantly and
   **stay** open. Any flicker at all means §2a is wrong or incomplete.
   Decisive instrumentation if it still flashes:
   ```js
   $$('[data-inline-pill]').forEach(el =>
     new ResizeObserver(r => console.log('PILL RESIZE', el.getAttribute('aria-label'), r[0].contentRect.width))
       .observe(el))
   ```
   Widths logging while the pointer is stationary ⇒ still a reflow loop; go back to
   `useCartonContextBarLayout.ts`. Nothing logging ⇒ the cause is elsewhere and the
   hypothesis ranking in the briefing (§4) needs reordering.
2. **Cross from pill onto the panel.** Must not close mid-crossing.
3. **Hover a different pill.** The first must close — exactly one open at a time.
4. **Hover an order/tracking chip, then a rail row.** Cross-tree eviction should hold.
5. **Hover each cell** — Back-to-list, Listing, Photos, Claim. The hairline box must read
   at the *same weight* on the coloured cells as on the white ones.
6. **Status dot** sits between the back button and the order #.
7. **Claim** reads `Claim`, ticket icon, sentence case.
8. **Edit colours** on Platform and Type opens the catalog manager; Urgency has no such row.

---

## 4. Then: the open architectural question

`docs/todo/carton-context-hover-unification-GEMINI-RESEARCH-BRIEFING.md` is a deep-research
brief written for this exact scope. Its §5 decisions are **not yet answered**, and the most
important one was never seriously considered:

> **D4 — should hover-open exist on this row at all?** The operator's hands are on a
> scanner. Hover-open means the menu fires when the pointer merely *crosses* a cell on its
> way somewhere else. The alternative is click-to-open everywhere, with hover reserved for
> tooltips.

If verification in §3 shows hover-open is still fragile, D4 is the answer, not a fifth fix.

Also open: **D1** — whether `HoverTooltip` (375 consumers) should eventually join the hook,
or stay a separate tooltip primitive over shared timing.

---

## 5. Guardrails (house law — a violation gets the change rejected)

- `npm run verify` before calling anything done. **Never raise a ratchet baseline.**
  Regenerate `sot-manifest.json` (`node scripts/build-sot-manifest.mjs`) when line numbers
  shift — it is a generated catalog, not a baseline.
- Never `git stash`. Stage only your own files. The user manages commits. Do not create branches.
- Never start/restart/kill the dev server.
- No `alert()` / `window.confirm` on station surfaces.
- Error copy states WHY and WHAT NEXT — never a bare status code, a raw `Error.message`,
  or "Something went wrong".
- **No motion on this row.** Opening is instant; there is no appear animation to match.
- **Never steal keyboard focus** — the barcode wedge owns it, and the failure is silent.
- **No layout shift on hover** — inset rings, not borders.
- When you retire a pattern, DELETE it or add a shrink-only guard naming the survivors
  (`.claude/rules/pattern-evolution.md` §6). A fix that leaves all engines in place and adds
  a coordinator is a failure.

---

## 6. Files this work owns

```
NEW  src/hooks/useHoverSurface.ts
NEW  src/hooks/hover-surface-single-engine.guard.test.ts
NEW  docs/todo/carton-context-hover-unification-GEMINI-RESEARCH-BRIEFING.md
NEW  docs/todo/carton-context-HANDOFF.md            (this file)
     src/components/station/entity-context/CartonContextCard.tsx
     src/components/station/entity-context/useCartonContextBarLayout.ts
     src/components/station/entity-context/station-identity-chrome.ts
     src/components/station/entity-context/station-context-action-pill.ts
     src/components/station/entity-context/StationContextActionCell.tsx
     src/components/receiving/workspace/line-edit/InlinePillPicker.tsx
     src/components/ui/CopyChipHoverMenu.tsx
     src/components/sidebar/rail-shell/{useRailHoverPreview.ts,RailPopover.tsx,RailRow.tsx}
     src/components/sidebar/tech/left-dock-toggle.tsx
     src/utils/_cn.ts
     scripts/jscpd-gate.mjs · knip-baseline.json · sot-manifest.json
```

Verified at handoff: `tsc` clean on these files · `eslint` clean (2 pre-existing warnings) ·
`hover-surface-single-engine.guard.test.ts` 4/4 · `carton-context-bar-layout.test.ts` 3/3 ·
`sidebar-rail-shared.test.ts` pass. **Full `npm run verify` was NOT run green** — the tree
carries another session's failing files.
