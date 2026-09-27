# Handoff prompt — mode governance, part 2 (remaining phases)

Paste everything below the line into a fresh session.

---

## Role and objective

You are a senior front-end engineer and design-system steward on CycleForge (Next.js App Router,
Tailwind v4, `@cycleforge/design-tokens`, design-mcp). Continue the governance work in
`docs/design-system/HANDOFF-mode-governance.md` (part 1 — read it for the law and principles).
Goal: every screen renders in one declared mode, mode-blind styling is rejected by lint, and the
existing patterns are the path of least resistance.

Rules of engagement:

1. **Prevention over detection** — `skill://add-guard` tier ladder. ESLint (Tier 2) is the gate;
   never a regex over source text for behaviour.
2. **Consolidate, don't invent.** Before building UI, follow `.claude/skills/new-ui-surface`
   (`node tools/design-mcp/ds.mjs contract "<the job>"` first).
3. **Phase by phase.** After each phase: eslint + typecheck the touched files, `pnpm verify:fast`,
   report exactly what changed and what to look at on `http://localhost:3050`, then stop.
4. **Test the feature yourself** on `:3050` (the owner asked the agent to exercise what it
   builds). Do NOT add a DOM / testing-library / Playwright test layer — owner ruling. Throwaway
   probes are fine; delete them after.
5. Never commit without asking. The tree carries other sessions' edits — stage by path or hunk.
   Do not touch `src/components/receiving/incoming/cards/*` or the contextual left sidebar
   beyond what a phase names.

Read first: `AGENTS.md`, `src/design-system/DESIGN_SYSTEM.md` (§ Task modes, § Disclosure
ladder), `docs/design-system/MODE-SPLIT-INVENTORY.md`, `eslint.config.mjs` (the ONE merged
`no-restricted-syntax` block ~144-195 and its burn-down allowlist ~200-316 — a second block for
the same files silently disables the tenancy guards).

## Done in part 1 (do not redo)

- **Phase A** — `.state-badge-*` take `var(--mode-radius-control)` (`packages/design-tokens/src/state.ts`);
  `IdentityMark`/`StaffAvatar` `shape` removed → `face="round" | "record"` (record = mode corner +
  label voice); `UNASSIGNED_MARK_CLASS` (`outbound-orders-ledger-editors.tsx`).
- **Phase B** — `:root` carries every `--mode-*` var from the triage spec (`modes.ts`
  `modeRegistryCssText`); coarse pointer keeps square + caps + 48px hit.
- **Phase C** — declared registry `src/lib/routing/mode-registry.ts` (`modeRouteFor`; `/shipping` =
  `runtime`; `/kiosk` = `counter` in its own `KIOSK_ROUTES` block, kept separate by owner
  ruling), applied once by `RouteModeRegion` in `AppShellSwitch`; every `page.*` must resolve
  (`mode-registry.test.ts`). Page/frame-level regions removed. `ModeRegion`: re-declaring the
  enclosing mode is not a new level (`ModeRegion.test.ts`).
- **Header** — keys/pin chips = 32px `rounded-mode-control` keys (`header-shell.ts`); dropdowns
  (`header-chrome-menu.tsx`: Pins · Daily tasks · page switcher) = `HEADER_MENU_PANEL_CORNER` /
  `HEADER_MENU_ROW_CORNER`, pressable rows, captions `HEADER_MENU_CAPTION_CLASS` (`mode-label`);
  inbox popover controls + `QuickAccessPanelShell` corner ported.
- **Disclosure ladder** — law in `DESIGN_SYSTEM.md` + `pinned.json` (`AnchoredLayer` L2,
  `HoverTooltip` L1, `DeskRecordPlane` L3). `DeskRecordPlane` seats focus in the record on open
  (both views); `AnchoredLayer` returns focus to its opener when a close drops it.
- **Agent tooling** — `tools/design-mcp/new-component-nudge.mjs` (Claude PostToolUse, non-blocking)
  + `.claude/skills/new-ui-surface/`.

## Owner rulings (2026-09-27)

- A record opens **in place** by default; Split is the staffer's choice (setting
  `desk.<id>.view`, default `in-place`).
- Kiosk `counter` mode stays in the registry, separate from desk routes.
- First desk where a scan opens a record: **To ship** (`/shipping/orders`).
- No DOM test layer; the agent verifies features live.
- New components are allowed (young codebase) — no `no-new-component` gate. Pin a component in
  `pinned.json` once a second place uses it.

## Phases

### Phase D — ESLint gates (Tier 2)

Add selectors to the ONE existing `no-restricted-syntax` block; every pre-existing violation goes
into a burn-down "rule off" block with a comment (same pattern as `DOGFOOD_ORG_ID`); delete an
entry when its file is fixed.

1. Literal `rounded-none` in a `className` string under `src/components/**`.
2. `navigator.vibrate` and `new AudioContext` outside `src/lib/scan-feedback/**`.
3. `ModeRegion` outside `src/design-system/providers/**`, `src/app/shipping/layout.tsx`, and the
   kept in-component / portal regions (census: `grep -rn "<ModeRegion" src`).
4. `createPortal` imported outside `src/design-system/**` and `src/components/ui/**` (21 files
   today).
5. Direct `@radix-ui/react-popover|dropdown-menu|hover-card|tooltip` imports outside those two
   homes (8 files: `SwimlaneBoard`, `AddTrackingPopover`, `PhotoLibraryScopeBand`,
   `PhotoLibraryFindRow`, `LabelEditPopover`, `StaffAccountFooter`, `AccessModeSwitch`,
   `ContextUsageRing`).

(The part-1 `shape="square"` rule is moot — the prop no longer exists.)

Acceptance: `pnpm lint` passes; plant one violation per rule, see it fire, remove the plant.

### Phase D2 — literal-radius burn-down

`src/design-system/tokens/radius.ts` still exports literal corners (`SIDEBAR_CONTROL_CORNER`
`rounded-md` — the ⌘K search well's 6px beside the 8px header keys; `DATA_TABLE_TOOLBAR_CORNER`;
`DROPDOWN_SHELL_CORNER`; `DROPDOWN_ITEM_CORNER`; others). Map each to the mode rung
(`rounded-mode` / `-control` / `-pill`, or `HEADER_MENU_ROW_CORNER`'s half-control) one constant
per change; check consumers with code-graph `impact_analysis`. Acceptance: triage visuals equal
or within 2px; the Floor goes square where it was rounded.

### Phase E — consolidate scan feedback

Route `src/components/mobile/repair/RepairScanCompanion.tsx:29` and
`src/components/wipe/useDataWipeController.ts:48` through `src/lib/scan-feedback`
(`playScanTone`, `vibrateScan`, `vibratePress`). Move `useScanFeedback`'s settings out of the
`receiving`-only bucket so every station reads the same org master switch + per-staff toggles.
Phase D rule 2 then has zero allowlist entries for these. Verify: a scan on `/m/repair-scan` and
the wipe station still beeps/vibrates; toggling the staff setting silences both.

### Phase F — design-mcp law (this repo only)

In `src/design-system/pinned.json` (keys = component FILENAME ids) add `useWhen` / `doNot` / `law`
so `ds_contract` returns the one implementation for: record header (`DeskStageRecordHeader`),
list select-bar, order card (`OrderCard`), status badge (`LifecycleCode` / `stateBadgeClass`),
staff mark (`StaffAvatar` face=record), watcher pill (`useHeldNewOrders`), scan feedback
(`src/lib/scan-feedback`), mode registry (`mode-registry.ts` / `RouteModeRegion`). Keep entries
short — point at `DESIGN_SYSTEM.md` instead of repeating it. Verify each with
`node tools/design-mcp/ds.mjs contract "<intent>"`. Proposals only (Garisek-OS, owner approval):
`ds_mode_for <route>`, `ds_critique` flags for literal radius / hard caps.

### Phase G — sentence case outside the header

`text-role-eyebrow … uppercase tracking-widest` is a repeated idiom. Preferred fix: make the
eyebrow typography preset read the mode label voice (`mode-label-case`) so triage renders
sentence case everywhere at once — present the visual diff to the owner before landing. Known
sites: `ClipboardHistoryPopover`, `FeedbackWidget`, `ThrowTaskPanel`, `PhoneHistoryPopover`,
`StaffRecipientList`, `quick-access/Row.tsx`, `QuickAccessPopover` role line,
`PhoneHandoffQrDialog`, `PhoneSignInQrButton`, plus the inventory's mono-caps list
(`industrial-record.ts:79,88,93`, `ReplenishmentNeedTable.tsx:193`, `RepairRecordStatus.tsx:137`,
`DeskActionSlot.tsx:55`, `CompoundCells.tsx:1264`, `outbound/ready/grid/cells/index.tsx:79`) and
`LabelIntakeLedger.tsx:57-58`.

### Phase H — scan opens the record (To ship)

On `/shipping/orders`, a wedge scan of an order number or tracking number opens that order's
record in place (L3 of the disclosure ladder) and moves focus into it; Esc returns focus to the
row. Nothing registers a desk scan-dock policy today (`registerScanDockPolicy` callers are only in
`src/lib/scan-dock/store.test.ts`; `useGlobalWedgeScanner` routes to `/m/*` or station inputs).
Build: a scan-dock policy (or wedge sink) registered by the To ship list that resolves the scanned
value against the loaded orders (then the order lookup API if not loaded) and opens it through the
list's existing record-open path (`OrderCardList` / `useRecordCursor` intent `'scan'`,
`src/lib/record-cursor/cursor-model.ts:20`). Unknown scan → a toast, list untouched.
Verify live on `:3050`: scan (or type into the scan dock + Enter) a known order and a tracking
number; confirm the record opens in place with focus inside; Esc returns to the row.

## Verification per phase

`npx eslint <touched> --quiet` · `npx tsc --noEmit -p tsconfig.json` (filter to touched files;
typecheck errors in other sessions' files — assistant/session artifacts, `WelcomeAssembly`,
order-payments — are known and not yours) · `pnpm tokens:check` when tokens change ·
`pnpm verify:fast` · exercise the feature on `:3050` yourself. Report files, behaviour, and what
the owner should look at.
