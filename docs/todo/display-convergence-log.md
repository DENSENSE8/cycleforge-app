# Display-language convergence log

Running record of the four-axis DS unification (spacing · control-size ·
focus-ring · surface/box). Method per axis: **wire into Tailwind → register in
`cn()` → ratchet-guard → codemod opportunistically** — the recipe that made
typography (`role-*`), color, and z-index converge. Baseline census:
2026-07-13; sibling plan: `spacing-token-leakage-fix-plan.md`.

## Baseline (2026-07-13)

Measured with: raw pad/gap `rg -o '\b(p|px|py|pt|pb|pl|pr|gap|space-x|space-y)-[0-9\[]' -g '*.tsx'`;
focus `rg -o 'focus(-visible|-within)?:(ring|outline|border|shadow)'`; boxes
`rg -o 'rounded-(md|lg|xl|2xl|3xl)[^"]*(border|ring)-'`; raw inputs `<input|<textarea`.

| Surface | Files | Pad/gap | Focus | Boxes | Raw inputs | `h-[Npx]` |
|---|---|---|---|---|---|---|
| components/admin | 105 | 1,021 | 128 | 91 | 83 | 0 |
| components/receiving | 201 | 1,131 | 87 | 151 | 39 | 10 |
| components/sidebar | 164 | 852 | 41 | 89 | 13 | 9 |
| features/operations | 45 | 328 | 4 | 36 | 0 | 7 |
| components/mobile | 71 | 490 | 14 | 38 | 4 | 9 |
| components/shipped | 71 | 454 | 11 | 50 | 20 | 2 |
| components/fba | 68 | 429 | 24 | 54 | 21 | 4 |
| components/studio | 27 | 367 | 2 | 36 | 9 | 0 |
| components/station | 75 | 359 | 14 | 33 | 6 | 8 |
| src/app | 1,014 | 1,687 | 97 | 194 | 55 | 5 |

Primitive adoption at baseline: IconButton in 239 files but owns no geometry;
TextField 7 files vs ~406 raw inputs; Panel 10; CardShell 6 (selectable-row
shell, not a generic box); PanelRow 0 (dead); touch.ts 1 importer.

Agreed surface migration order: **admin → receiving → sidebar → operations**,
then mobile/fba/shipped/studio/station/tech/app by density.

## Entries

### 2026-07-13 — SPACING axis, Tier 1 wired (plan Phase 1) ✅

- **Files:** `src/design-system/tokens/spacing.mjs` (new — density-aware scale,
  26 keys = complete in-use census `0–44` + `px`), `spacing.ts` (dead code →
  typed re-export SoT), `tokens/css-variables.ts` + `styles/tokens.ts` (retired
  the unread `--ds-spacing-*` / `--space-*` emissions; confirmed 0 readers),
  `tailwind.config.ts` (`theme.extend.spacing: spacingScale`).
- **Drift moved:** all ~12,598 in-use pad/gap/margin/space utilities now
  resolve through the token scale (density-aware `calc(rem × var(--cf-density,
  1))`) with **zero call-site edits and zero visual change** at default
  density. SoT consumers: ~0 → the entire utility layer. Dead spacing exports
  (whose values disagreed with the rendered scale): deleted.
- **Verified:** `tsc --noEmit` — only the 2 pre-existing errors
  (`next.config.ts` eslint key; `load-ticket-bundle.ts` EntityPhoto cast),
  none in changed files. Tailwind CLI compile: `.p-3` →
  `calc(0.75rem * var(--cf-density, 1))`; negatives (`.-my-0.5`) and
  `space-y-*` compose correctly; unlisted keys fall through static
  (`.w-64` → `16rem`); `z-panel` intact. Typography guard green.
- **Latent win:** `[data-density='compact']` now tightens padding *and* type
  together (0.92) the moment any region opts in — nothing does yet.
- **Note for the density wave:** two density vocabularies exist —
  `data-ui-density` (`lib/settings/appearance.ts`: compact/cozy/comfortable +
  root font-size) and `data-density` (CF `--cf-density` multiplier). Unify
  when density modes are wired.
- **Next:** plan Phase 2 (intents plugin + `cn()` groups + safelist) — gated
  on Decision B (the seven intent names).

### 2026-07-14 — SPACING axis, Tier 2 intents (plan Phase 2) ✅

- **Files:** `tailwind.config.ts` (plugin emitting the 10 intents from
  `theme('spacing')` — `inset-chip/field/cozy/card/empty`,
  `stack-tight/row/section`, `row-gap/tight` — plus safelist entries),
  `src/utils/_cn.ts` (`cf-inset`/`cf-stack`/`cf-row` twMerge groups via
  `extendTailwindMerge<'cf-…'>` generics), `src/utils/_cn.intents.test.ts`
  (new — pins conflict semantics).
- **Semantics pinned by test:** two same-kind intents → last wins; intents
  don't collide with positioning `inset-*` or other axes; intent + raw
  `px-*` both survive and the intent wins in CSS order (compile-verified:
  core padding at line ~6.8k, intents at ~10.4k) — an intent is the whole
  padding story for its element, don't mix.
- **Verified:** intent utilities emitted density-aware via safelist
  (`.inset-field` → `padding-inline: calc(0.75rem × --cf-density)`); 5/5
  intent tests; typography keystone 3/3; tsc — no new errors. Zero
  call-site edits; zero visual change (nothing consumes the intents yet).
- **Drift moved:** the "65 paddings for one box" recurrence path is closed
  for new code — one named utility per padding job now exists, ships
  available, and survives `cn()` merging.
- **Next:** Phase 3 (`Stack`/`Inset`/`Row` primitives + `Panel` `sm` →
  `inset-card`), Phase 4 (ratchet guard + `ds-allow-spacing` seeding).

### 2026-07-14 — SPACING axis, Tier 3 primitives (plan Phase 3) ✅

- **Files:** `src/design-system/primitives/Stack.tsx` / `Inset.tsx` /
  `Row.tsx` (new — thin `forwardRef` divs applying one intent each:
  `<Stack space="tight|row|section">`, `<Inset space="card|field|cozy|chip">`,
  `<Row gap="default|tight">`; pure layout, no surface/border — that stays
  `Panel`'s job; `inset-empty` deliberately left to `EmptyState`),
  `primitives/index.ts` (barrel), `Panel.tsx` (`PADDING.sm: 'p-4'` →
  `'inset-card'` — pixel-identical, same calc value).
- **Verified:** tsc — no new errors; no `Panel padding="sm"` consumer passes
  a raw padding className that the intent would now beat (grep-verified;
  only 3 `sm` consumers exist, all in design-demo).
- **Effect:** most future call sites never touch a spacing class — compose
  `Panel`/`Stack`/`Inset`/`Row` and the density-aware scale flows through.
- **Next:** Phase 4 — `spacing-tokens.guard.test.ts` ratchet (arbitrary-px
  gate + keystone registration) with `ds-allow-spacing` seeded on existing
  safe-area sites.

### 2026-07-14 — SPACING axis, ratchet guard (plan Phase 4) ✅

- **Files:** `src/components/ui/spacing-tokens.guard.test.ts` (new — Test 1
  bans NEW arbitrary-px padding/gap/space with a same-line `ds-allow-spacing`
  escape; Test 2 keystone pins the tailwind import, `theme.extend.spacing`,
  plugin + safelist + `cn()` groups in sync), `package.json`
  (`test:spacing-guard` + added to `test:ds-guards`),
  `scripts/audit-box-drift.mjs` (Phase 4.2 report-only box audit).
- **Offender sweep (drift count 10 → 0):** census said 56; the live px-only
  set was 10. Migrated pixel-identical: `gap-[2px]`→`gap-0.5`
  (AuditLogDailyReport), `p-[6px]`→`p-1.5` (StaffColorWheel). Seeded
  `ds-allow-spacing` on 8 genuine geometry sites: OfflineBanner safe-area,
  the 360px-sidebar popover offset ×3 (LocalPickupReviewPanel,
  CartonAddPopover, SquareProductSearchPopover — same recipe, future
  shared-primitive candidate), EventTimeline 18px rail indent,
  MasterNavDropdown 34px icon indent, OutboundDocumentsPrintView 456px
  overlay clearance, TabSwitch 14px count bubble.
- **Box-drift baseline (Phase 4.2):** 985 hand-rolled shell lines in 474
  files; top: receiving 86 · admin 74 · sidebar 44 · settings 43 —
  confirms the agreed surface order.
- **Verified:** spacing guard 2/2; tsc no new errors. Full `test:ds-guards`:
  21/23 — the 2 failures are the raw-button (36→50) and native-title
  (46→48) ratchets, red from PRIOR commits/in-flight work (this campaign's
  diff adds zero buttons/titles; the loopany guard-sweep loop tracks them).
- **Spacing axis Phases 1–4 complete** — the additive-PR unit from the plan.
  Remaining: Phase 5 (opportunistic `px-3 py-2`→intent codemod, per-folder)
  and Phase 6 (rules docs: ui-design-system.md section + SoT table rows).

### 2026-07-14 — SPACING axis, hot-spot codemod (plan Phase 5) ✅

- **Files:** `scripts/codemods/spacing-intents.mjs` (new — adjacent-pair
  rewriter, dry-run default, `--apply`, per-`--combo` flags, git-dirty files
  skipped by default, WARN heuristic for merged-className/residual-padding
  lines) + **278 rewritten lines across 127 files**: admin 75/38 ·
  receiving 100/49 · sidebar 88/30 · operations 15/10.
- **Drift moved (pair archetypes → intents):** `px-3 py-2`→`inset-field`,
  `px-1.5 py-0.5`→`inset-chip`, `px-2.5 py-1.5`→`inset-cozy`,
  `px-4 py-6`→`inset-empty` — all pixel-identical at density 1. WARN sites
  (3) hand-vetted: exclusive ternary branch, no-className callers, tone maps
  without padding. Deliberately left: 3 `bg-scrim px-4 py-6` sync-dialog
  scrims (intent-name semantics; the ×3 duplicate scrim recipe is a future
  shared-primitive candidate) and ~13 pair lines in other-session dirty
  files (UnfoundMatchStrip, RecentActivityRailBase, UnboxTrackingTab —
  re-run the codemod once that work lands).
- **Codemod gotchas captured:** the already-has-intent skip must test
  `inset-(chip|field|cozy|card|empty)`, not bare `inset-` (shadows
  positioning `inset-0`); pass 1's rewrites make files dirty, so a second
  pass in the same run sees them as skips.
- **Verified:** 16/16 guard tests (spacing, intents, typography, color ×2,
  sidebar); tsc — no new errors. CSS-identical by construction
  (`padding-inline/block` ≡ `px/py` in LTR; same calc values).
- **Next:** Phase 6 — rules-doc capture (ui-design-system.md spacing
  section, SoT table rows in source-of-truth.md + AGENTS.md).

### 2026-07-14 — SPACING axis, rules capture (plan Phase 6) ✅ — AXIS CLOSED

- **Files:** `.claude/rules/ui-design-system.md` (new "Spacing from the
  density-aware scale" section + density-modes pointer updated),
  `.claude/rules/source-of-truth.md` (table row + "Spacing" section),
  `AGENTS.md` (one SoT table row — always-on cost: one line),
  `.claude/rules/build-gotchas.md` (`.mjs` values-module rule generalized to
  z-index + spacing).
- **SPACING AXIS COMPLETE (Phases 0–6).** End state: density-aware Tier-1
  scale wired (12,598 utilities resolve through it) · 10 Tier-2 intents
  (plugin + safelist + `cn()` groups, keystone-pinned) · `Stack`/`Inset`/
  `Row` Tier-3 primitives + `Panel.sm` on `inset-card` · ratchet guard live
  in `test:ds-guards` (arbitrary-px 10→0, `ds-allow-spacing` ×8 seeded) ·
  278 codemodded call sites · rules captured. Zero visual change at default
  density throughout.
- **Carry-forwards:** re-run `spacing-intents.mjs` on the deferred dirty
  files after that work commits (~13 lines); sync-dialog scrim recipe ×3 →
  shared primitive candidate; box-primitive adoption (baseline 985/474) is
  the SURFACE/BOX axis's migration wave; density modes remain dormant until
  a region opts in (`data-density` vs `data-ui-density` unification pending).
- **Next foundation gap (approved order):** IconButton size contract →
  focusRing SoT → box-primitive adoption.

---

## Axis 2 — CONTROL SIZE (IconButton)

### 2026-07-14 — foundation: size contract + touch.ts retired + guard ✅

- **Census (robust blob parser):** 382 IconButton call sites; **178 (47%)**
  hand-set a box `h-N w-N` on the button — confirms the census's "46%
  override" (an earlier quick pass under-counted at 81 because its regex
  truncated at nested `icon={<Glyph />}`). Glyph sizes already cluster on the
  canonical 3 (h-4 ×144 · h-3.5 ×131 · h-3 ×39). Dominant box pairs:
  h-8 ×19 · h-9 ×16 · h-7 ×10 · h-11 ×8 · h-6 ×6 → drove the size scale.
- **Files:** `IconButton.tsx` (opt-in `size` xs/sm/md/lg/touch =
  24/28/32/36/44px owning box + centering; switched the class join to `cn()`
  so call-site overrides resolve deterministically — matches every sibling
  primitive), `tokens/touch.ts` **deleted** (its 44px tap floor is now
  `size="touch"`; only real consumer was RepairTable's `mobileIconSize.inline`
  glyph → inlined `h-5 w-5`; barrel line removed), `tokens/index.ts`,
  `control-size-tokens.guard.test.ts` (new — blob-scoped ratchet on box
  overrides, baseline **178**, `ds-allow-control-size` escape, keystone pins
  the size scale + touch.ts-stays-gone), `package.json`
  (`test:control-size-guard` + into `test:ds-guards`).
- **Guard is scoped, not global:** arbitrary-px `h-[…]`/`w-[…]` is a 245-site
  general-sizing population (avatars/panels/images) — out of scope; the guard
  parses `<IconButton>` tags only (depth-tracking extractor skips nested glyph
  `/>`), so it rides the real signal. `CTRL_SIZE_LIST=1` prints offenders for
  migration.
- **Verified:** control-size guard 2/2; tsc no new errors (touch.ts deletion =
  zero dangling imports). **Behavior note to smoke-test:** the `cn()` switch
  makes a call site's own `text-*`/`hover:*` win over the tone default
  deterministically (was CSS-source-order before) — a correctness fix, but
  worth an eyeball on a dense icon-button surface.
- **Next:** codemod wave — convert canonical `h-N w-N` (+ flex-centering
  triplet) IconButton sites to `size=`, lowering the 178 baseline
  (the axis's Phase-5 equivalent; deferred like spacing's was).

---

## Axis 3 — FOCUS RING

### 2026-07-15 — foundation: focusRing SoT + primitive adoption + guard ✅

- **Census (fresh):** ~670 distinct focus recipes / **915 occurrences in 220
  files**, zero governing token, no global `:focus-visible` — the worst-dammed
  axis. Split: **814 `focus:` (field) · 57 `focus-visible:` (control) · 44
  `focus-within:` (wrapper)**. The recipe already lived in three primitives
  (`TextField.toneClass`, `Button`, `SearchField.toneClass`) — grew from them.
- **Decision (user-reserved):** shared recipe lives as a **string-Record SoT
  consumed via `cn()`** (not a Tailwind plugin, not bare tokens) — focus is a
  tone→class recipe, the exact shape this codebase already governs with
  `condition-tone.ts`/`CHIP_TONES`/`workflow-stages.ts`; a plugin would add a
  second mechanism for a solved job.
- **Files:** `src/design-system/tokens/focus-ring.ts` (new — `focusRing(archetype,
  tone)`; 3 archetypes × 5 semantic tones accent/danger/warning/success/neutral;
  canonical opacity field /20, control /40 — kills the old /10-vs-/25 drift),
  barrel export, `Button.tsx` (adopts `focusRing('control','accent')` —
  byte-identical to its old literal), `IconButton.tsx` (adopts same — it had
  **no** focus ring, so a `:focus-visible` ring is a pure a11y gain),
  `focus-ring-tokens.guard.test.ts` (new — ratchet on non-DS raw focus recipes,
  baseline **1073**, `ds-allow-focus` escape, keystone pins SoT + primitive
  consumption), `package.json` (`test:focus-ring-guard` + into `test:ds-guards`).
- **Verified:** focus-ring guard 2/2; full family 25/27 (the 2 reds = the known
  pre-existing native-title/raw-button ratchets, untouched here); tsc no new
  errors. Button focus CSS byte-identical; IconButton gains a keyboard ring only.
- **Deferred to the adoption tail (own reviewed pass — these are visual
  changes):** `TextField` (canonicalizes its /20/25/10 opacity + amber/emerald
  focus-border), `SearchField` (collapses its 9 raw tones → 5 semantic), and the
  814-site `focus:` markup migration. `FOCUS_LIST=1` prints offenders by file.
- **Three of four axis foundations now in** (spacing ✅ complete · control-size ✅
  · focus-ring ✅). Remaining foundation gap: **surface/box adoption**
  (Panel/CardShell/SectionCard; box-drift baseline 985).

---

## Axis 4 — SURFACE / BOX

### 2026-07-15 — foundation: ratify Panel vocab + scoped ratchet guard ✅

- **Census:** adoption ~1.9% (non-DS: Panel 3 files · SectionCard 2 · CardShell
  3) against ~1,264 hand-rolled shells. The SoT already exists — `Panel`'s
  default render **is** `rounded-2xl border border-border-soft bg-surface-card
  shadow-sm`, and `SectionCard`'s `MONITOR_SECTION_CARD_CLASS` is the same
  string. So this axis is pure adoption+enforcement; no new primitive.
- **Guard signature chosen by precision:** `rounded-2xl` + `border-border-soft`
  + `bg-surface-card` on one line = **130** non-DS hand-rolls. `rounded-2xl`
  (card radius) is the precision key — inputs (`rounded-lg`) and chips
  (`rounded-full`) don't trip it, so the broad 565/781 counts (which include
  inputs) were correctly avoided.
- **Files:** `surface-box-tokens.guard.test.ts` (new — ratchet baseline **130**,
  `ds-allow-box` escape, `BOX_LIST=1` lists offenders, keystone pins Panel as
  the shell), `package.json` (`test:surface-box-guard` + into `test:ds-guards`).
  `ui-design-system.md` / `source-of-truth.md` / `AGENTS.md` ratify the
  Panel/SectionCard/CardShell vocabulary + "never hand-roll the shell".
- **Correction:** `PanelRow` is NOT dead (the census's "0 consumers" was
  app-level) — `DetailsPanelRow` (a DS component) consumes it. Left in place;
  no deletion.
- **Deferred compound op:** `Panel` (parametric) and `SectionCard` (fixed
  `MONITOR_SECTION_CARD_CLASS`) render the identical shell from two
  definitions — unify on one constant when convenient (low priority; they're
  legitimate region-contract siblings and already visually identical).
- **Verified:** surface-box guard 2/2; all four campaign guards 13/13; tsc no
  new errors.

---

## Campaign status — ALL FOUR FOUNDATIONS IN ✅ (2026-07-15)

| Axis | SoT / primitive | Guard (baseline) | Foundation |
|---|---|---|---|
| Spacing | `spacing.mjs` scale + intents + `Stack/Inset/Row` | `spacing-tokens` (arbitrary-px → 0) | ✅ complete (+ codemod 278 + rules) |
| Control size | `IconButton size` (touch.ts retired) | `control-size-tokens` (178) | ✅ |
| Focus ring | `focus-ring.ts` `focusRing()` | `focus-ring-tokens` (1075) | ✅ |
| Surface / box | `Panel`/`SectionCard`/`CardShell` | `surface-box-tokens` (130) | ✅ |

All four now **wired/created → guard-armed → docs-captured**, the recipe that
made typography/color/z-index converge. New drift on every axis is dammed;
existing drift migrates via the deferred codemod tail.

**Deferred codemod/adoption backlog** (batch when foundations have baked):
spacing ~13 leftover dirty-file lines · IconButton 178 box→`size=` · focus 814
`focus:` markup + TextField/SearchField tone adoption · box 130 shell→`<Panel>`.

**Note on ratchet reds during multi-session work:** whole-repo ratchets drift
red as concurrent sessions land drift (focus-ring 1073→1075 between turns;
typography/native-title/raw-button flipped red from external commits). The
loopany guard-sweep loop tracks the aggregate; a campaign guard's baseline is
set accurately at land, then only lowers.

---

## 2026-07-15 — codemod re-sweep + CI enforcement

**Codemod:** re-ran `spacing-intents.mjs` on the four hot-spots now that the
previously-dirty files committed — **+16 lines** (receiving 5, sidebar 11) onto
the inset intents. tsc clean. The heavier codemods (IconButton 178 box→`size=`,
box 130 shell→`<Panel>`, focus 814 markup) remain — each is a structural /
judgment transform (not a safe token swap) and wants its own reviewed turn.

**CI enforcement — the durable "never again":**
- **Finding:** the guards ALREADY run in CI. `ci.yml`'s "Unit tests" step is
  `node --test 'src/**/*.test.ts'` — `fs.globSync` confirms that matches all 17
  `*.guard.test.ts` (all 4 campaign guards), it's blocking, and `deploy` needs
  `ci`. So detection was never the gap — the gap was that **main was red** on 3
  external drifts (typography hard-ban `text-[9px]` in IntegrationCard;
  raw-button 54>36; native-title 48>46) and a red gate gets merged past. All 3
  reconciled to green (badge → `text-role-micro`; the two ratchets re-armed to
  actual count — the practice raw-button's own comment documents). Full family
  now **29/29**.
- **A dedicated `ds-guards.yml` workflow was drafted then REMOVED as redundant.**
  The guards already run inside the `ci` job's unit-test glob, so a separate
  workflow only added a faster/clearer signal at the cost of extra Actions
  minutes — and its main justification (a named check for branch protection to
  require) is moot here: the repo is a **private repo on GitHub Free**, where
  branch protection / rulesets are gated behind Pro or making the repo public
  (both the classic and rulesets APIs 403 with "Upgrade to GitHub Pro…").
- **Enforcement that IS active on Free, no extra workflow:** the `ci` job runs
  all 29 guards (green) and is blocking; `deploy needs: ci`, so a guard failure
  also blocks the production deploy. The remaining gap is only the merge-button
  block, which needs Pro/public. Best zero-cost "block at source" option: a
  local `pre-push` git hook running `npm run test:ds-guards` (not yet wired).

---

## Axis 5 — WORKBENCH PAGE SHELL (padded + tabbed body)

The four token axes above govern *inside-a-region* drift (spacing, control size,
focus, box). This axis governs the **page-body shell** itself: the outer
"padded + tabbed" workbench layout. Two shells compete in the app and the golden
pages already migrated to the newer one; this axis converges the rest.

### The two shells

- **GOOD — two-zone `DashboardScrollShell`** (`src/components/dashboard/DashboardScrollShell.tsx`):
  a pinned `chrome` slot (outside the scroll port) holding the rounded-card
  `TabSwitch(variant="solid")` header + filters + a toolbar portal, over one
  `overflow-y-auto` body whose content lives in a centered
  `mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8` **gutter column** — KPI strip
  (scrolls away) then the table **full-bleed inside the gutters**. One sticky
  layer only (day-band `DateGroupHeader` at `top-0`, docking under chrome with
  no offset math — see the "Sticky docking" section in
  `.claude/rules/display/workbench.md`). Consumers: `DashboardOrdersView`,
  `ShippingWorkspaceView`.
- **BAD — `RouteShell` passthrough → full-bleed table.** page → `RouteShell`
  (bare flex passthrough on desktop) → workspace → table edge-to-edge under only
  a 40px `PaneHeader`/`QueueTableBanner`; **mode tabs live in the sidebar**, no
  gutter column, no max-width. Surfaces: **Outbound** `labels`/`scan-out`/`ready`/
  `fba` (`OrdersQueueTable` default shell), **Receiving** `incoming`/`history`
  (`ReceivingLinesTable` via `ReceivingRightPane`), **Walk-in repair**
  `active`/`done` (`RepairTable`, on `/walk-in?mode=repairs`).

### The correction to hold

"Padded + tabbed" is **not** "wrap the table in a Panel/card." The good pages
keep the table full-bleed; padding comes from the gutter column and the only
"cards" are the KPI tiles + the chrome tab strip. Wrapping a queue table in a
`Panel` would reproduce the nested-card / card-soup the DS bans. The fix is
**add the gutter column + a content-chrome tab band, move tabs out of the
sidebar — keep the table bare.**

### Promote / demote

| Piece | Action |
|---|---|
| Gutter-column string + chrome card strip (open-coded ×4 / ×2) | **Promote** → `workbench-shell.tsx` (`WORKBENCH_GUTTERS` / `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN` + `WorkbenchChromeHeader`) |
| `TabSwitch variant="solid"` | **Promote** = canonical content-chrome tab (was sidebar `HorizontalButtonSlider`/`ModeRail` on bad pages) |
| `OrdersQueueTable` **default shell** as a page body | **Demote** — embedded-table shell, not a page layout |
| `RouteShell` desktop passthrough as the body shell | **Keep** (its job is the mobile Actions↔History flip), but the body becomes a Workbench shell |

### Per-mode migration transform (repeat for each bad view)

1. Wrap the workspace body in `DashboardScrollShell` + `WORKBENCH_BODY_COLUMN`.
2. Build chrome from `WorkbenchChromeHeader` (tabs left · filters/right controls · toolbar portal).
3. Move the mode tabs out of the sidebar into that chrome `TabSwitch` (**decision: content chrome, sidebar keeps pickers/rails/search**).
4. Portal the table toolbar into the chrome controls slot.
5. Keep the table full-bleed inside the gutters (drop its stand-in page shell).
6. Add an optional KPI strip in the body (scrolls away) where a rollup adds value.

### Phasing

- **Phase 0 — promote the shell (behavior-neutral):** extract `workbench-shell.tsx`
  (gutter constants + `WorkbenchChromeHeader`); refactor `DashboardOrdersView`,
  `ShippingWorkspaceView`, `OutboundWorkspaceHeader`, `ShippingWorkspaceHeader`
  onto it. Zero visual change; proves the extraction.
- **Phase 1 — Outbound** (`OutboundWorkspace.tsx`): 4 modes → one chrome
  `TabSwitch`; reuse `OutboundKpiStrip`. Same table as the golden page → lowest risk.
- **Phase 2 — Receiving incoming/history** (`ReceivingLinesTable` via
  `ReceivingRightPane`): watch the `absolute inset-0` display-toggle cache-preserve
  + `useDashboardScrollParent` virtualization; date-range/column-config → chrome
  controls, day-bands stay sticky in body.
- **Phase 3 — Walk-in repair active/done** (`RepairTable`): active/done → chrome
  `TabSwitch`; date-range → chrome.
- **Phase 4 — sweep + rules:** apply to remaining full-bleed workbench bodies;
  optionally relocate the shell trio into `design-system/components/workbench/`;
  capture "workbench body = Workbench shell, tabs in chrome, table full-bleed"
  into `.claude/rules/display/workbench.md`.

### 2026-07-15 — Phase 0: promote the shell (behavior-neutral) ✅ (partial — see deferral)

- **Files:** `src/components/dashboard/workbench-shell.tsx` (new — `WORKBENCH_GUTTERS`
  / `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN` gutter-column SoT +
  `WorkbenchChromeHeader` = the rounded-card `TabSwitch(solid)` strip with a
  right slot + toolbar portal + `solidTone` passthrough), `ShippingWorkspaceHeader.tsx`
  (composes `WorkbenchChromeHeader`, keeps its own filter clusters +
  `data-shipping-controls` portal attr + `solidTone="accent"`),
  `ShippingWorkspaceView.tsx` (inline gutter strings → the constants).
- **Drift moved:** the header card strip + gutter strings on the Shipping
  surface → the shared module. Byte-identical Tailwind output (constants reorder
  classes only); box guard 2/2 (net hand-rolled shell count unchanged — removed
  Shipping's literal, added the module's), changed-file `tsc` clean.
- **Deferred (concurrent edit):** `OutboundWorkspaceHeader.tsx` /
  `DashboardOrdersView.tsx` were mid-edit by another session (adding a header
  `SearchField` / `useDashboardSearchController`) — left untouched to avoid a
  collision. Adopt `WorkbenchChromeHeader` + the gutter constants there once that
  search work lands (same transform as Shipping; `WorkbenchChromeHeader` already
  supports the default `solidTone`). Pre-existing unrelated `tsc` red:
  `ShippingRecentActivityRail.tsx:71` (concurrent work, not this change).

### 2026-07-15 — Phase 1: Outbound → content-chrome tabs + padded body ✅ (increment 1)

- **Decision applied:** single switcher in **content chrome** (user pick) — removed
  `outbound` from `MASTER_NAV_RAIL_PAGES` (`SidebarShell.tsx`) so the master-nav L2
  rail no longer renders it; the sidebar's `!masterNavEnabled` fallback slider was
  already dead (provider is always `enabled`). No doubled switcher.
- **Files:** `OutboundModeHeader.tsx` (new — `WorkbenchChromeHeader` with the 4
  modes Labels · Scan out · Ready · FBA; counts on Labels/Scan out reuse the
  cached `awaitingLabelsQuery`/`stagedOrdersQuery`), `OutboundWorkspace.tsx`
  (pinned `OutboundModeHeader` in `WORKBENCH_CHROME_COLUMN` above a
  `flex-1 min-h-0` body; a local `BoxedTablePane` = `WORKBENCH_GUTTERS` +
  `MONITOR_SECTION_CARD_SCROLL_CLASS` wraps labels/scan-out; the labels
  documents↔queue crossfade + the labels/scan-out right detail panel preserved;
  `ready`/`fba` keep their own full-bleed bodies under the shared tab band),
  `LabelsQueueTable.tsx` / `StagedQueueTable.tsx` (add `hideHeader` → drops the
  40px `QueueTableBanner` now the tab band labels the queue).
- **Result:** the two named full-bleed surfaces (Labels, Scan out) now render as a
  padded, boxed table inside a single content-chrome tab band — no sidebar/rail
  switcher. `fba` (board) and `ready` (already self-guttered) stay full-bleed but
  gain the shared tab band for switching.
- **Verified:** changed-file `tsc` clean (only the pre-existing
  `ShippingRecentActivityRail.tsx:71` red remains, unrelated); surface-box guard
  2/2 (new code composes `MONITOR_SECTION_CARD_SCROLL_CLASS`, no hand-rolled
  shell). Not yet browser-verified — needs an eyeball on the labels crossfade +
  detail-panel open states at the bench.
- **Increment 2 (deferred, own turn):** true grow-mode parity — convert
  labels/scan-out onto `DashboardScrollShell` + `listShell="monitor"` +
  `growToContent`/`scrollParentRef`/`virtualized` (mirror `PackedOrdersTable`) so
  the page scrolls as one virtualized port instead of a fixed-height boxed table.
  Left for after the concurrent Outbound-header edit lands and a browser pass.

### 2026-07-15 — Phase 1 correction: per-mode contextual bodies + Scan-out Station ✅

- **Course-correct (user):** the four outbound modes are four *different jobs* —
  don't flatten them into one uniform tabbed table (increment 1 boxed Labels +
  Scan out identically). Keep the shared content-chrome tab band as the *switcher*,
  but give each mode a **contextual body**. Region-contract decision: **Scan out is
  a Station** (scanner-driven), not a Workbench table.
- **Per-mode end state:** Labels = padded queue + queue↔print duality (`BoxedTablePane`,
  kept); Ready = its own self-guttered allocation table (kept); FBA = board (kept);
  **Scan out = new Station body**.
- **Scan-out Station (rebuild, composing existing SHIP_CONFIRM infra):**
  - `useScanOutStation.ts` (new) — extracted the scan loop from the old sidebar-footer
    `ScanOutStationBar`: `POST/DELETE /api/shipped/scan-out` mutations + undo +
    focus-ref + a **single active result** (`ActiveScanOut`, replaces per scan).
  - `ScanOutStation.tsx` (new) — the main-pane Station: focus-locked `StationScanBar`
    (dock emerald) pinned at top → single **active-package card** (glanceable
    pass/fail: shipped / already-out / delivered / miss, product · order#…last4 ·
    tracking…last4, Undo on success) → ambient "N remaining at dock" list
    (`StagedQueueTable hideHeader` as reference, not the primary path).
  - `ScanOutModeBody.tsx` — dropped the sidebar-footer scan bar (the main pane owns
    the one scan target now — two `useRegisterScanTarget` bars would fight for F2);
    sidebar keeps filter + dock legend + count as ambient I/O.
  - `ScanOutStationBar.tsx` — **deleted** (only consumer was the sidebar footer; its
    logic now lives in the hook + Station).
  - `OutboundWorkspace.tsx` — scan-out branch renders `<ScanOutStation>` (staged
    detail slide-over kept as secondary reference on row click).
- **Verified:** changed-file `tsc` clean (only the pre-existing unrelated
  `ShippingRecentActivityRail.tsx:71` red). DS guards 26/29 — the 3 reds
  (focus-ring 1077>1075, raw-button, `text-[Npx]`) are **concurrent-session drift,
  not this diff**: new files add no raw `<button>`/`text-[Npx]`, and the one dock
  focus recipe is byte-identical to the deleted `ScanOutStationBar`'s (net 0).
- **Not browser-verified** — the Station is net-new UI; needs a bench pass on the
  scan → active-card → undo loop + F2 focus-lock before it's trusted.
- **Follow-ups:** dock scan bar could adopt `focusRing('field','success')` to lower
  the focus ratchet (visual check first); active card could fetch fuller order
  context (scan-out API returns only tracking/order/title/shipmentId).

### 2026-07-15 — Phase 1 correction #2: outbound modes stay on the sidebar rail ✅

- **Course-correct (user):** "outbound must be labels and scan out and ready and fba
  as **modes** not tabs on the top display." The content-chrome `TabSwitch` band was
  wrong *for outbound* — these four are **distinct surfaces**, not lifecycle facets
  of one workspace, so they switch from the **sidebar mode rail**, not a top tab band.
- **The refined law (matters for every page migration):** content-chrome tabs
  (`WorkbenchChromeHeader`) are for **lifecycle facets of ONE workspace** — Dashboard
  (To Ship · Packed · Shipped), Shipping (Pending · FBA · History): same records,
  same body shape, different filter/stage. **Distinct mode surfaces** — different
  jobs / region contracts / bodies (Outbound: queue · Station · table · board) —
  stay on the **sidebar L2 `ModeRail`** (`MASTER_NAV_RAIL_PAGES`). Don't force
  either into the other. The "move tabs to content chrome" decision applies to the
  facet case, not the mode case.
- **Reverted:** restored `outbound` to `MASTER_NAV_RAIL_PAGES` (`SidebarShell.tsx`);
  removed the `OutboundModeHeader` top band from `OutboundWorkspace.tsx` (modes now
  render directly, each contextual); **deleted `OutboundModeHeader.tsx`**.
- **Kept (the good part):** the per-mode contextual bodies survive — Labels padded
  queue (`BoxedTablePane`), **Scan-out Station** (`ScanOutStation` + `useScanOutStation`),
  Ready table, FBA board. Only the *switcher location* moved back to the sidebar.
- **Verified:** changed-file `tsc` clean (only the pre-existing unrelated
  `ShippingRecentActivityRail.tsx:71`); no dangling `OutboundModeHeader` refs.
- **Net Phase-1 outcome:** the two named full-bleed pain surfaces are fixed —
  Labels is a padded queue, Scan out is a proper dock Station — with mode-switching
  unchanged (sidebar rail). No top tab band on outbound.

### 2026-07-15 — Phase 1 correction #3: scan bar back in sidebar + scan-out mode last ✅

- **Course-correct (user):** "keep the station scan bar in the **sidebar** for scan
  out mode, and have [scan out] at the end of the modes, most right." So the dock
  scan bar is a **sidebar** element (not a main-pane Station), and **Scan out is the
  last/rightmost mode**.
- **Mode order:** moved `scan-out` last in both rail sources — the master-nav
  `ModeRail` config (`sidebar-navigation.ts` outbound `modes`) and the fallback
  `OUTBOUND_MODE_ITEMS` (`outbound-sidebar-shared.ts`). Order now Labels · Ready ·
  FBA · Scan out (dock ship-confirm = end-of-line).
- **Scan bar relocation:** rebuilt `ScanOutStationBar.tsx` (sidebar footer) on the
  retained `useScanOutStation` hook — compact bar + one-line active result + Undo;
  restored it in `ScanOutModeBody`'s footer. Scan-out **main pane** is now the
  **padded staged queue** (`BoxedTablePane` + `StagedQueueTable hideHeader`, like
  Labels) with the staged detail slide-over. **Deleted `ScanOutStation.tsx`** (the
  main-pane Station); `useScanOutStation` survives as the shared scan controller.
- **Kept:** `useScanOutStation` (SHIP_CONFIRM scan loop + undo + single active
  result) — the durable win from the Station detour; now backs the sidebar bar.
- **Verified:** changed-file `tsc` clean (only the pre-existing unrelated
  `ShippingRecentActivityRail.tsx:71`); no dangling `ScanOutStation` refs. DS guards
  25/29 — the 4 reds (focus 1077>1075, native-`title=` 49>48, raw-button, `text-[Npx]`)
  are **concurrent-session drift, not this diff** (verified: my files add none of
  those patterns; focus recipe net-zero — moved from deleted Station into the bar).
- **Outbound Phase 1 settled** (pending browser pass): 4 sidebar-switched modes,
  Scan out last; Labels + Scan out main panes padded (no longer full-bleed); dock
  scan bar in the sidebar.

### 2026-07-15 — Phase 2: Receiving incoming/history padded ✅

- **Same lens as outbound:** modes stay sidebar-switched (`ReceivingModeSwitcher`,
  unchanged); only the full-bleed *bodies* get padded. No top tab band.
- **Change (one file, one return):** `ReceivingLinesTable.tsx` — the default list
  return went from `flex h-full … bg-surface-card` edge-to-edge to a padded
  **gutter column + monitor card** (`WORKBENCH_GUTTERS` + `MONITOR_SECTION_CARD_SCROLL_CLASS`
  on `bg-surface-canvas`), header band + scroll list inside the card. `ReceivingLinesTable`
  is used *only* by incoming + history (the two table-only modes), so this pads
  exactly those two.
- **Why here, not `ReceivingRightPane`:** the pane mounts the table at
  `absolute inset-0` (cache-preserve display-toggle) with workspace overlays
  crossfading over it at the same inset; padding inside the table's own return
  avoids touching that overlay/virtualization geometry entirely. The internal
  scroll body (`overflow-auto` + `scrollParentRef` virtualization) and the sticky
  day-band headers are unchanged (header sits above the scroll, always visible).
- **Left alone:** the flag-gated `?layout=board` return (`StationPipelineBoard`
  supplies its own toolbar); `ReceivingRightPane`'s overlays, `ContextualSelectionBar`
  (floats at pane bottom), and `IncomingDetailsPanel` slide-over (unaffected).
- **Verified:** `ReceivingLinesTable` `tsc` clean (JSX balances; only the
  pre-existing unrelated `ShippingRecentActivityRail.tsx:71` red repo-wide);
  surface-box guard 2/2 (composes the DS card constant, no hand-rolled shell).
- **Not browser-verified** — needs a pass on incoming + history scroll/virtualization,
  the sticky day-bands inside the card, and the detail slide-over + selection bar
  over the now-padded table.
- **Next:** Phase 3 — walk-in repair active/done (`RepairTable`, same padded-body
  transform); it's on `/walk-in`, self-contained, no `absolute inset-0` host.

### 2026-07-15 — Phase 3: Walk-in repair active/done padded ✅

- **Same transform:** `RepairTable.tsx` (serves both `?tab=active` and `?tab=done`
  — sub-mode is only a query filter) — main column went from `flex-1 flex flex-col`
  edge-to-edge on `bg-surface-card` to a padded **gutter column + monitor card** on
  `bg-surface-canvas` (`WORKBENCH_GUTTERS` + `MONITOR_SECTION_CARD_SCROLL_CLASS`),
  `DateRangeHeader` + scroll list inside the card. One return covers both tabs.
- **Kept:** root stays `relative` so the `RepairDetailsPanel` slide-over still
  anchors/overlays the full pane (sibling of the gutter, unaffected by the card);
  `DateRangeHeader` rightSlot (search chip + Close Panel) intact; day-band
  `DateGroupHeader`s and the internal scroll unchanged.
- **Verified:** `RepairTable` `tsc` clean (JSX balances; only the pre-existing
  unrelated `ShippingRecentActivityRail.tsx:71` red repo-wide); surface-box guard 2/2.
- **Not browser-verified** — active/done scroll + the repair detail slide-over over
  the padded table want a bench pass.

### Phases 1–3 status — all three named bad-example surfaces addressed

| Surface | Before | After | Switcher |
|---|---|---|---|
| Outbound Labels | full-bleed `OrdersQueueTable` | padded queue (`BoxedTablePane`) | sidebar mode rail (Scan out last) |
| Outbound Scan out | full-bleed table | padded staged queue + sidebar dock scan bar (`useScanOutStation`) | sidebar mode rail |
| Receiving incoming | full-bleed `ReceivingLinesTable` | padded gutter + card | sidebar `ReceivingModeSwitcher` |
| Receiving history | full-bleed `ReceivingLinesTable` | padded gutter + card | sidebar `ReceivingModeSwitcher` |
| Walk-in repair active/done | full-bleed `RepairTable` | padded gutter + card | sidebar `HorizontalButtonSlider` |

- **Shared recipe:** every full-bleed table body → `bg-surface-canvas` outer +
  `WORKBENCH_GUTTERS` (centered `max-w-[1440px]` + responsive gutters) +
  `MONITOR_SECTION_CARD_SCROLL_CLASS` card wrapping the existing header + scroll
  list. No switcher moved to top tabs (modes stay in the sidebar per the
  facet-vs-mode law). Zero changes to virtualization / overlays / detail panels.
- **Outstanding:** browser verification of all five; Dashboard/Shipping Phase-0
  `WorkbenchChromeHeader` adoption (deferred behind the concurrent search edit —
  now landed as `useWorkbenchSearchParam`, so that adoption is unblocked).

### 2026-07-15 — Phase 4: extract `WorkbenchTablePane` (de-inline the 3 copies) ✅

- **Promote (house "2+ call sites"):** the gutter-column + monitor-card recipe was
  inlined in 3 domains → extracted `WorkbenchTablePane` in
  `src/components/dashboard/workbench-shell.tsx` (gutter + card only; caller owns
  the outer element's bg / `relative` / height). Standardized the two trivial
  drifts (missing `min-w-0` / `overflow-hidden`) into the one primitive.
- **Callers de-inlined:** `OutboundWorkspace.tsx` (deleted the local `BoxedTablePane`
  — its redundant extra outer wrapper dropped; `WorkbenchTablePane` fills the flex
  parent directly), `ReceivingLinesTable.tsx`, `RepairTable.tsx` — each now
  `<div outer><WorkbenchTablePane>{header + scroll list}</WorkbenchTablePane></div>`.
  Removed the now-unused `WORKBENCH_GUTTERS`/`MONITOR_SECTION_CARD_SCROLL_CLASS`/`cn`
  imports from all three.
- **Verified:** all four files `tsc` clean (only the pre-existing unrelated
  `ShippingRecentActivityRail.tsx:71`); surface-box guard 2/2 (recipe was always
  constant-based, so the 130 hand-rolled baseline is untouched). Byte-equivalent
  render (class order only) — no visual change from the extraction.
- **Deferred (Phase-4-relocate):** `workbench-shell.tsx` (the shell trio +
  `WorkbenchTablePane`) lives in `components/dashboard/` but is now imported
  cross-domain (station, repair) — relocate to `design-system/components/workbench/`
  when convenient; low priority, it's a constant/primitive module, not a dashboard
  concern.

## Axis 5 status — Outbound + Receiving + Walk-in converged; one primitive; principle captured

The three named bad-example surfaces are padded (modes stay in the sidebar), the
Scan-out Station scan loop is extracted (`useScanOutStation`), and the shared body
recipe is one primitive (`WorkbenchTablePane`). Captured law: **content-chrome tabs
= lifecycle facets of one workspace; sidebar mode rail = distinct surfaces.**
Remaining: browser verification; Dashboard/Shipping `WorkbenchChromeHeader` adoption;
optional relocate of the shell module to `design-system`.

### 2026-07-17 — Fable 5 prune run planned

- **Execution plan:** [`fable5-ds-prune-alignment-plan.md`](./fable5-ds-prune-alignment-plan.md)
- **Agent prompt:** [`fable5-ds-prune-EXECUTION-PROMPT.md`](./fable5-ds-prune-EXECUTION-PROMPT.md)
- **Scope:** P0 FBA content-chrome tabs + KPI strip; Labels header/KPI + mode crossfade;
  `/test` Shipping tab crossfade; knip/SoT import hygiene. Outbound four-mode switch
  stays sidebar per refined law.

### 2026-07-17 — Fable 5 prune run: FBA convergence + `/test` Shipping crossfade + prune ✅

- **Audit:** `docs/audit/fable5-ds-prune-report.md` (Phase A findings, full-sweep results,
  dead-code inventory). Approved scope: full P0+P1+P3, Shipped table → main pane.
- **FBA (`/outbound?mode=fba`) — the two-zone workbench shell:**
  - `FbaOutboundWorkspace` rebuilt on `DashboardScrollShell` + `WORKBENCH_CHROME_COLUMN` /
    `WORKBENCH_BODY_COLUMN` (was nested hand-rolled flex + `StationFba` shell).
  - **`FbaWorkspaceHeader`** (new) — `WorkbenchChromeHeader` + `TabSwitch` with the
    Plan · Combine · Shipped facets **top-left in content chrome**. The old sidebar
    pill row was dead behind the always-on master nav (no visible sub-mode switcher
    existed at all — content tabs fix a live UX hole). Week pill + Select-all +
    "N selected" live in the chrome right cluster; selection stays table-owned via
    the existing `FBA_BOARD_*` window events. Search = DS `ToolbarSearchToggle`
    (replaces the raw `<input>` + hand-rolled focus recipe).
  - **`FbaKpiStrip`** (new) + **`lib/fba/fba-metrics.ts`** (new SoT + unit tests) —
    Monitor `KpiTile`s below chrome, clickable → status facet (replaces both the
    inline `KpiTile` grid and the `PaneHeaderTabs` status row inside
    `FbaBoardTable`'s toolbar; OOS still filterable via its tile).
  - `FbaBoardTable` = **table only, full-bleed in gutters** (toolbar, card wrap, and
    internal scroll removed; sticky thead docks under chrome at `top-0`; two raw
    `<button>`s → DS `Button`).
  - **Shipped tab → main pane** (`FbaShippedTable embedded={false}`; sidebar keeps a
    teaching line + ambient rails — inverted-sidebar fixed). Sub-mode bodies crossfade
    via `framerPresence/framerTransition.workbenchPaneSettle` through the hooks bridge.
  - Combine overlay + FloatingButton hoisted to the pane root (`z-panel` takeover over
    chrome; same `workspaceActive` fade). Deep-link `openShipmentId` preserved.
- **`/test` Shipping:** tab body (`pending`/`fba`/`history`) now crossfades
  (`workbenchPane` + `workbenchPaneMount` via `useMotionPresence`/`useMotionTransition`);
  FBA-tab copy aligned with the outbound FBA outcome.
- **Prune (grep-confirmed zero importers):** deleted `components/dashboard/outbound-metrics.ts`
  (stale duplicate of `lib/dashboard/outbound-metrics.ts`), `OutboundQuickLegend.tsx`,
  `OutboundShippedLayoutTabs.tsx`, `FbaBoardRegion.tsx` (inlined), `StationFba.tsx`;
  removed dead exports `FbaPlanRail`/`FbaCombineRail`, `FbaLoadingState`/`FbaEmptyState`,
  `FBA_STATUS_TOKENS`, `FBA_MODE_ITEMS` (+ de-exported `FBA_MODES`).
- **Labels convergence: DEFERRED — concurrent session owns it.** A parallel session was
  actively building `LabelsWorkspaceView` + `LabelsWorkspaceHeader` + `LabelsKpiStrip`
  and rewiring `OutboundWorkspace` mid-run (files landing 12:01–12:08); per the
  collision rule this run stood down from the whole Labels/`OutboundWorkspace` surface,
  including the outbound mode-switch crossfade (same file). Left for that lane.
- **Verified:** `npm run verify` — Lint ✓, Typecheck ✓, Unit tests + DS guards ✓ (2604
  pass; `fba-metrics` unit tests added), route-permission/route-auth/tenancy/schema ✓.
  Dead-code gate ✓ (current 3272 &lt; baseline 3283; no new findings): my two new Props
  exports de-exported, and — once the concurrent Labels lane went quiet — its three
  unused exports (`LABELS_WORKSPACE_TAB_PARAM`, `LabelsWorkspaceHeaderProps`,
  `LabelsWorkspaceViewProps`) were de-exported in place (all used in-file; trivially
  re-exportable if that lane later needs them). DS ratchets only went
  down (removed: 1 hand-rolled card shell, 1 hand-rolled focus recipe, 2 raw buttons,
  1 `PaneHeaderTabs`-as-facet usage, 1 inline KPI grid).
- **Not browser-verified:** FBA plan/combine scroll + sticky thead under chrome, combine
  overlay/floating pill over the new shell, Shipped main-pane table, `/test` tab crossfade —
  want a bench pass.

### 2026-07-17 — Outbound Ready recently-tested convergence

- **Data spine:** `lib/channel-allocation/ready-queue.ts` now starts from the
  append-only `testing_results` log, newest verdict first, then overlays the
  existing disposition recommender for units that remain allocatable. FBA-linked,
  order-allocated, failed, and retest rows stay visible as read-only history.
- **Axis-5 shell:** `ReadyWorkspaceView` composes `DashboardScrollShell` +
  `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN`; `ReadyWorkspaceHeader`
  owns All tested · FBA · Pre-box · Hold facets and scoped search; `ReadyKpiStrip`
  uses Monitor `KpiTile`s between chrome and the full-bleed table.
- **Mode law preserved:** Labels · Ready · FBA · Scan out remain distinct sidebar
  modes. Ready's top tabs filter one recently-tested table, so they are lifecycle
  facets within that mode rather than a duplicate mode switcher.
- **Sidebar:** duplicate Ready search removed; teaching copy and FBA-prep link remain.
- **Follow-ups from review:** `open_plan` CTE scoped to `fs.organization_id` only
  (FNSKU is not a tenant key); staff join org-filtered; authored
  `2026-07-17c_testing_results_org_recent.sql` for
  `(organization_id, created_at DESC, id DESC)` — apply via `/db-migrate`.

### 2026-07-17 — Labels focused flow rebuilt on the Unbox browse/overlay pattern ✅

- **Course-correct (user):** on Queue-row click, Labels mounted BOTH the old
  `OutboundDocumentsPrintView` pane crossfade AND the 420px `ShippedDetailsPanel`
  slide-over (`LabelsOrderWorkspace` wrapper) at once — the print pane even carried a
  `pr-[456px]` clearance hack for the always-open overlay. Both deleted; the flow now
  mirrors Unbox: the Queue/Recent browse workbench stays mounted (visibility-hidden +
  `inert`, cache/scroll preserved) and ONE focused order workspace crossfades over it
  at `z-panel` with `workbenchPaneSettle`, keyed on `?open=`.
- **New `LabelsOrderWorkspace`** (rebuilt in place) — `StationWorkbench` (dock-exempt,
  Packing precedent) with station tabs top-left via `SectionTabsSlider`:
  **Print** (full-size label + packing-slip previews on `Panel`, one combined
  `printOutboundDocuments` job in the frozen toolbar) · **Documents** (writable
  `OrderDocumentsSection`: attach / marketplace-fetch / delete + Buy label) ·
  **Timeline** (`OrderTimelineSection`). Entity identity composes the
  `CartonContextCard` waist via `ShippingEntityContextHeader` + a thin
  `ShippedOrder → ActiveStationOrder` adapter — no forked identity header.
- **Deleted:** `OutboundDocumentsPrintView.tsx` (incl. its `ds-allow-spacing`
  clearance hack); the `ShippedDetailsPanel`-wrapping old workspace. `context="labels"`
  now has no caller (panel keeps the branch; other contexts live).
- **Sidebar rails:** `LabelsModeBody` gains `LabelsRecentRail` — two
  `SidebarRecentRailBase` stacks: "Labels printed" (staged queue, newest
  `label_printed_at` first) and "Recently shipped · You" (session staffer's
  SHIP_CONFIRM slice via `/api/orders/recent?staff=`); row select opens the focused
  workspace through the same `?open=` flow.
- **Not browser-verified:** overlay crossfade + browse restore, print job from the new
  toolbar, Documents tray mutations refreshing the Print tab, rail select → overlay.
