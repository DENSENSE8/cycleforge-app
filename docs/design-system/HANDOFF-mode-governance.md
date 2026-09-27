# Handoff prompt — design-system mode governance (triage · industrial · counter · assistant)

Paste everything below the line into a fresh session.

---

## Role and objective

You are a senior front-end engineer and design-system steward working in an all-in-one warehouse
operations codebase (CycleForge — Next.js App Router, React, Tailwind, a token package, and a
design-system MCP server). Operators triage many kinds of information on one platform: orders,
receiving, inventory, repair, pack, settings. Your job is **governance**: make every screen render
in exactly one declared visual mode, make mode-blind styling impossible or loudly rejected, and
consolidate the interaction patterns that already exist — so the codebase cannot drift or fork and
the operator sees one consistent display method everywhere.

Operating principles:

1. **Prevention over detection.** Make the invalid state unspellable (types, tokens, structure)
   before writing a lint rule; never write a regex over source text to assert behaviour. Read
   `skill://add-guard` first and follow its tier ladder.
2. **Consolidate, don't invent.** Most patterns below already exist; your work is to route every
   caller through the one implementation and guard it.
3. **Phase by phase.** The owner verifies each phase in the real browser before the next starts.
   After each phase: typecheck + lint the touched files, state exactly what changed and where, then
   stop. Do not run browser tests unless asked. Never commit without asking.

Work in the `prod` worktree (`/home/michaelgarisek/Projects/cycleforge-lanes/prod`). Read
`AGENTS.md` first (dev origin `http://localhost:3050` only; lane unit `cycleforge-lane@prod`;
`pnpm verify:fast` before calling a batch done).

## Required reading (in this order)

1. `docs/design-system/MODE-SPLIT-INVENTORY.md` — route → mode table, every mode-blind leak with
   file:line, record-header reach, keybinds, Floor rail. This is your map.
2. `skill://add-guard` — the guard tier ladder.
3. `eslint.config.mjs` — note the warning around the single merged `no-restricted-syntax` block
   and the burn-down "rule off" allowlist pattern (`DOGFOOD_ORG_ID`).
4. `tools/design-mcp/README.md` — design-mcp is an advisory lookup; **ESLint is the gate**.
5. `docs/design-system/BRIEF.md` §13 and `docs/design-system/HANDOFF-order-card-list.md` — owner
   rulings and the in-flight card-list work you must not disturb.

## Verified facts (2026-09-27)

- **Mode mechanism.** `ModeRegion mode="triage" | "industrial" | "counter" | "assistant"`
  (`src/design-system/providers/ModeRegion.tsx`) stamps `data-mode` and the task-mode CSS
  variables generated from `packages/design-tokens/src/modes.ts` (`MODE_REGISTRY` ~line 183):
  radius (`rounded-mode`, `-control`, `-pill`), surfaces/ink (`bg-mode-*`, `text-mode-*`,
  `border-mode-*`), label voice (`.mode-label`), hit targets (`--mode-hit`, `--mode-hit-cta`).
  Prop name is `mode`, not `look`.
- **Phones collapse triage → industrial**: `resolveRegionMode`
  (`src/design-system/providers/resolve-region-mode.ts:13`).
- **The leak mechanism for unwrapped routes.** `:root` declares only radius + label fallbacks
  (`packages/design-tokens/generated/tokens.css:332-353`, source `modes.ts` ~420-435). Surface and
  ink variables are absent, so on the ~120 routes with no `ModeRegion` every `bg-mode-*` /
  `text-mode-*` / `border-mode-*` resolves to nothing.
- **Only `/shipping` switches at runtime** (`src/app/shipping/layout.tsx:47`,
  `floor ? 'industrial' : 'triage'`). Pages usually inherit their mode from a LAYOUT or a frame
  (`InventoryDeskFrame.tsx:26` is conditional) — so "every page is wrapped" is a cross-file
  invariant. A per-file ESLint rule cannot see ancestors; do NOT write one.
- **Route registry precedent.** `src/lib/routing/registry.ts` (`routeParamsFor`, longest route
  first) with tests in `src/lib/routing/route-params.test.ts` — reuse this shape.
- **Already implemented (consolidate, don't rebuild):**
  - wedge scanner — `useGlobalWedgeScanner` (`src/hooks/useGlobalWedgeScanner.ts`), mounted once by
    `GlobalWedgeScannerMount` (`src/components/layout/scan-mounts.tsx:26`);
  - audio / haptic / visual confirmation — `src/lib/scan-feedback/` (`play.ts`: `playScanTone`,
    `vibrateScan`, `vibratePress`; `useScanFeedback.ts`: org master switch + per-staff toggles;
    `visual.ts`). Drift: `src/components/mobile/repair/RepairScanCompanion.tsx:29` and
    `src/components/wipe/useDataWipeController.ts:48` call `navigator.vibrate` / `AudioContext`
    directly; `useScanFeedback` reads the `receiving` page settings for every station;
  - hit targets — `--mode-hit` 32px (fine pointer) / 48px (coarse) in both triage and industrial;
    sized by INPUT, not mode. Keep it that way (gloved use = touch = already 48px);
  - orthogonal exception flags — `src/lib/orders/order-row-flags.ts` (persisted `order_flags.flag`,
    separate from lifecycle; tests enforce unique wash and no blue);
  - ambient watcher pill — held "N new orders" (`useHeldNewOrders`,
    `src/components/outbound/orders/cards/order-card-list-state.ts`).
- **Mode-blind leaks** (full list in the inventory): `.state-badge-*` has no radius
  (`packages/design-tokens/src/state.ts:68-71`, `stateBadgeClass` in
  `src/design-system/tokens/industrial-record.ts:63`); `StaffAvatar shape="square"` at
  `outbound-orders-ledger-editors.tsx:181`, `OrderAutoAssignSlot.tsx:66`, `AgendaRecord.tsx:159`,
  `SkuExceptionsLedger.tsx:281`; `IdentityMark.tsx:82` turns `square` into radius 0 + mono caps;
  dashed `cornerClass('flush')` placeholders; `rounded-none` search fields; mono-uppercase labels
  outside `.mode-label`; `LabelIntakeLedger.tsx:54`.
- **design-mcp.** The engine is Garisek-OS's (`ds.mjs` launches
  `$GARISEK_OS_ROOT/tools/design-mcp/run-mcp.sh`); THIS repo owns only the law:
  `tools/design-mcp/design-mcp.profile.json` and `src/design-system/pinned.json`. `ds_critique` is
  heuristic text matching — advisory, never a gate. Adding a NEW tool command means editing
  Garisek-OS — a cross-repo change: propose it, get the owner's yes, do not do it silently.
- **No DOM test stack** (no testing-library / vitest / jest). Runtime-rendered assertions
  ("renders rounded in triage") have no home; say so rather than faking them. Playwright exists —
  adding a style probe is a new test layer: ask first.

## Phases

### Phase A — Mode-following primitives (Tier 3: no guard needed)

1. State badges take the mode radius: `.state-badge-*` (or `stateBadgeClass`) uses the mode radius
   variable so triage renders rounded and industrial stays 0. Edit the token SOURCE
   (`packages/design-tokens/src/state.ts`), regenerate with `pnpm tokens:build`, confirm
   `pnpm tokens:check`.
2. Staff marks follow the mode: remove the ability to force `shape="square"` on `StaffAvatar` /
   `IdentityMark` in business components; the corner comes from the mode radius. Update the four
   callers and `IdentityMark.tsx:82`.
3. Unassigned placeholders (`border-dashed` + `cornerClass('flush')`) use the mode control radius.
4. Run `find_symbol` + `impact_analysis` (code-graph) on each changed primitive before editing.

Acceptance: no caller passes a shape/corner override for these primitives; Floor (industrial) is
visually unchanged; triage records show rounded badges and marks. Owner verifies
`/shipping/orders` (cards + Floor), `/incoming`, `/repair`, `/`.

### Phase B — Unwrapped routes degrade to triage (prevention)

Declare triage surface + ink fallbacks on `:root` in `packages/design-tokens/src/modes.ts` (the
generator that writes `generated/tokens.css`), so a page with no `ModeRegion` renders as triage
instead of unstyled. Coarse-pointer fallbacks keep today's behaviour. Regenerate, `tokens:check`.

Acceptance: `bg-mode-*` / `text-mode-*` / `border-mode-*` resolve to triage values on an unwrapped
route (e.g. `/settings`); wrapped routes unchanged.

### Phase C — Declared route → mode registry, applied by the shell (Tier 3)

1. Add a declared registry (e.g. `src/lib/routing/mode-registry.ts`): route prefix → mode, longest
   prefix first, mirroring `routeParamsFor`. Seed it from the inventory's route table. `/shipping`
   keeps its runtime Floor switch — model it as a declared "runtime" entry resolved by the shipping
   layout, not a static mode.
2. Apply it once, in the app frame, so pages cannot forget a mode. Portals that escape the region
   (`RightRailHost.tsx:65`, `command.tsx:150`, sheets/dialogs) keep their explicit re-declarations.
3. Test (node:test, like `route-params.test.ts`): every `page.tsx` under `src/app` resolves to a
   registry entry (a directory listing is fine — it is about route structure, not source text).
4. Remove page/layout-level `ModeRegion`s the registry now covers, one area per change.

Acceptance: every route resolves; no route renders unstyled; `/m/*` phone collapse unchanged.
This touches the shell (`src/components/layout/DesktopRouteShell.tsx`) — a shared file other
sessions edit: keep the diff minimal and name it for the commit split.

### Phase D — ESLint gates (Tier 2)

Add selectors to the ONE existing merged `no-restricted-syntax` block in `eslint.config.mjs` (a
second block for the same files silently disables the tenancy guards — this happened 2026-09-15):

- `shape="square"` on `StaffAvatar` / `IdentityMark` outside `src/design-system/**`;
- literal `rounded-none` in `className` under `src/components/**`;
- `navigator.vibrate` and `new AudioContext` outside `src/lib/scan-feedback/**`;
- (after Phase C) `ModeRegion` outside the registry applier, the shipping layout, and the known
  portal files.

Every pre-existing violation goes into a burn-down "rule off" block with a comment, the same
pattern as the `DOGFOOD_ORG_ID` allowlist. Delete an entry when its file is fixed.

Acceptance: `pnpm lint` passes; each rule fires on a deliberately planted violation (plant, run,
remove — never commit the plant).

### Phase E — Consolidate scan feedback

Route `RepairScanCompanion.tsx:29` and `useDataWipeController.ts:48` through
`src/lib/scan-feedback`; move `useScanFeedback`'s settings out of the `receiving`-only bucket so
each station reads the same org switch + staff toggles. Phase D's rule then has zero allowlist
entries for these.

### Phase F — design-mcp law (this repo only)

In `src/design-system/pinned.json` / `tools/design-mcp/design-mcp.profile.json`, add curated law so
`ds_contract` returns the one implementation for: record header, list select-bar, order card,
status badge, staff mark, watcher pill, scan feedback, mode registry — each with a "use when" /
"do not" sentence. Verify with `node tools/design-mcp/ds.mjs contract "<intent>"`.

Proposals only (Garisek-OS engine, owner approval required): a `ds_mode_for <route>` tool reading
the registry; `ds_critique` flags for the leak patterns.

## Non-goals and pushbacks already settled

- No per-file ESLint "page must be wrapped" rule — cross-file invariant; Phases B + C replace it.
- No mode-scaled tap targets — hit size follows input (fine vs coarse), which already covers gloves.
- No re-showing the list's search bar over an open record — owner ruled the record hides the list
  chrome; ⌘K global search in the header is the permanent anchor.
- No new exception model — reuse `order-row-flags`.
- Do not edit the contextual left sidebar (another session). Do not touch
  `src/components/receiving/incoming/cards/*` (another session's WIP).

## Verification per phase

`npx tsc --noEmit -p tsconfig.json` (filter to touched files) · `npx eslint <touched> --quiet` ·
`pnpm tokens:check` when tokens changed · `pnpm verify:fast` before handing a batch back. Report
exactly what changed (files, behaviour) and what the owner should look at on `:3050`.
