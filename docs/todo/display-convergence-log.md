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
