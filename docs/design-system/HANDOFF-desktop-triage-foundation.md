# HANDOFF — desktop triage foundation (written 2026-09-26)

Law: BRIEF §12 "industrial on phones, triage on desktop" (owner, 2026-09-26). Read it first.

## Verified facts (don't re-survey)

- Modes live in `packages/design-tokens/src/modes.ts`: `OPERATIONAL_BASE` (warm greys,
  radius 0) is spread into BOTH `industrial` and `triage`; `counter`/`assistant` already carry
  12 px + pill on `SLATE_SURFACES`. Emitted as `--mode-radius`, `--mode-radius-pill`, … per
  `[data-mode]`. The `Design tokens` gate requires the committed `tokens.css`,
  `DesignTokens.swift` and design-mcp `tokens.json` to match — regenerate after edits.
- `src/design-system/providers/ModeRegion.tsx` — `data-mode` wrapper, max 2 levels; 23
  `src/app` files mount it. No device awareness yet.
- shadcn: `components.json` = new-york, neutral, CSS variables, `@/components/ui`. Radix
  dialog/popover/dropdown/checkbox/switch/slot + `class-variance-authority` installed.
- Motion: `motion` 12.42 + Motion+ (`motion-plus`), `lenis`, `animejs` 4 installed. House wrapper
  `@/design-system/motion` (roles, `use-motion-role`, `use-pointer-fine`, reduced-motion).
- Selection: `src/design-system/components/SelectionActionBar.tsx` (+ `StickyActionBar`)
  already uses `AnimatePresence`/`motion` and `useTableSelection(scope)` /
  `emitToggleAll` (`src/lib/selection/table-selection`). Used by testing history + receiving.
- To-ship desk row: `src/components/outbound/orders/OutboundOrdersLedger.tsx` (QTY at ~l.692
  and ~l.1087) on `record-ledger/RecordLedger.tsx` + `IndustrialRecord.tsx`. **Another
  session has both files modified and uncommitted** — coordinate (commit theirs or wait);
  never `git add -A`.
- Another agent owns the left nav/sidebar and another owns Cloudflare AI Gateway
  (`src/lib/ai/**`) — out of scope here. `/api/v1` consolidation: `docs/HANDOFF-v1-api-consolidation.md`.

## Build order (highest ROI first — one face per commit, screenshot at :3050, push)

1. **Tokens: triage becomes its own system.** In `modes.ts` give `triage` its own spec:
   shadcn neutral surfaces, `radius: '0.625rem'` (derive card 10 / control 8 / chip pill),
   triage motion (feedback 120–200 ms, enter/exit springs). Keep industrial untouched.
   Regenerate token artifacts; update `DesignTokens.swift` expectations. Every desktop
   surface that reads `--mode-*` changes at once — that's the leverage.
2. **Device resolution in `ModeRegion`.** Desktop (fine pointer / non-`/m`) renders triage;
   `/m/*` and coarse pointer render industrial. An explicit `mode="industrial"` inside a
   desktop page is Mode C (hardware mirror) and must stay industrial 1:1. Unit-test the
   resolution; no per-page forks.
3. **Selection foundation (owner's first face).** Desktop row selection: checkbox + row
   highlight + range/⌘ select, and a **fixed-width floating** selection bar (centred,
   bottom, not full-width sticky) built on `SelectionActionBar`. motion.dev: bar
   spring-in/out, count tick on change, check pop — all through `@/design-system/motion`
   roles, reduced-motion respected, 0 ms inside industrial. Adopt on the To-ship ledger
   first, then every `RecordLedger` list.
4. **To-ship triage row** (spec below) — after the other session's `RecordLedger` /
   `OutboundOrdersLedger` edits land.
5. **Phone pick screens edge-to-edge** — `docs/design-system/HANDOFF-pick-edge-to-edge.md`
   (industrial, mobile).

## To-ship triage row spec (owner, 2026-09-26)

- **Top:** status badge (RDY/PKD) + channel tag (EBAY/ECW) + platform order number; buyer
  name + location stacked beside them in muted secondary type.
- **Middle:** full width for the product title; multi-line titles stay legible.
- **Bottom-left:** `[QTY n]` as a bold, prominent badge, then `SKU`, then `BIN`.
- **Bottom-centre:** picker/packer log (PICK Cuong, PACK Thuy).
- **Right edge:** stage action (→ PICK / → SCAN OUT) and date+age (SEP 9 · 17D) in one stable
  column across rows. QTY never sits alone at the far right of the title line.

## Constraints

- Never `git checkout main -- <shared dir>`: main has no token package, mode system or ledger
  (see `docs/HANDOFF-next-session.md` Phase 3). Port single files only when the owner names them.
- Commit own files by name; `git push --no-verify` fine; report what is red.

## Paste-ready prompt

```text
CycleForge prod lane, dogfood speed mode. Read AGENTS.md, docs/design-system/BRIEF.md §12
(newest owner ruling: industrial on phones, triage on desktop) and
docs/design-system/HANDOFF-desktop-triage-foundation.md — nothing else until a face needs it.
The handoff's facts are verified; do not re-survey. Build steps 1→3 in order, one face per
commit: triage tokens (shadcn neutral, 0.625rem) → ModeRegion device resolution (+ Mode C
mirror stays industrial) → desktop row selection + fixed-width floating selection bar with
motion.dev. Screenshot each at :3050, commit your own files by name, push (--no-verify fine;
say what is red). Stay out of src/lib/ai/**, the sidebar/nav files, and /api/v1.
```
