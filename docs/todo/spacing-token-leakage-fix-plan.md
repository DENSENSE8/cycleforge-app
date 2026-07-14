# Spacing-token leakage fix — plan

> **Status:** **Phase 1 SHIPPED 2026-07-13** — `spacing.mjs` wired into
> `theme.extend.spacing`; dead `spacing`/`density` exports + the unread
> `--ds-spacing-*`/`--space-*` var emissions retired; verified pixel-identical
> (calc × `--cf-density` defaults to 1; `[data-density='compact']` confirmed
> set by nothing — the appearance setting writes a *different* axis,
> `data-ui-density`). Decision A resolved = **override in place**; note
> `extend` *merges* per key, so a key omitted from `spacing.mjs` keeps its
> stock static value rather than vanishing (§1.1's warning applies only to a
> full `theme.spacing` replace).
> **Phase 2 SHIPPED 2026-07-14** — Decision B resolved as proposed (the ten
> intent utilities); plugin in `tailwind.config.ts` reads `theme('spacing')`
> (density-aware for free), intents safelisted, `cf-inset`/`cf-stack`/`cf-row`
> groups registered in `_cn.ts` (note: custom group ids need
> `extendTailwindMerge<'cf-…'>` generics), behavior pinned by
> `src/utils/_cn.intents.test.ts`. Emitted CSS places intents AFTER core
> padding utilities, so an intent wins over a raw `p-*`/`px-*` on the same
> element — an intent is the whole padding story; don't mix.
> **Phase 3 SHIPPED 2026-07-14** — `Stack`/`Inset`/`Row` primitives in
> `src/design-system/primitives/` (thin `forwardRef` divs over the intents;
> `Inset` deliberately omits `empty` — that recipe belongs to `EmptyState`),
> exported from the barrel; `Panel` `sm` → `inset-card` (pixel-identical;
> verified no consumer passes a raw padding className that would fight it).
> **Phase 4 SHIPPED 2026-07-14** — `spacing-tokens.guard.test.ts` (arbitrary-px
> gate + keystone pinning the tailwind import, `spacing: spacingScale`, plugin,
> safelist, and `cn()` groups in sync), wired into `test:ds-guards` +
> `test:spacing-guard`. Live offender set was 10 (not the census's 56 — the
> rest were margins/non-px arbitrary, out of scope): 2 migrated pixel-identical
> (`gap-[2px]`→`gap-0.5`, `p-[6px]`→`p-1.5`), 8 genuine geometry sites seeded
> `ds-allow-spacing`. Phase 4.2 box-drift report shipped as
> `scripts/audit-box-drift.mjs` (flat `audit-*` naming per repo convention);
> baseline 985 shell lines / 474 files.
> **Phase 5 SHIPPED 2026-07-14** — `scripts/codemods/spacing-intents.mjs`
> (adjacent pairs only, both orders, boundary-safe; skips comments,
> `ds-allow-spacing`, existing intents, `*.test.ts`, and git-dirty files by
> default so it never collides with in-flight work; WARN heuristic flags
> merged-className / residual-padding lines for human review). Applied to the
> four hot-spots: **278 lines / 127 files** (admin 75 · receiving 100 ·
> sidebar 88 · operations 15). Deliberately left raw: 3 identical
> `bg-scrim px-4 py-6` sync-dialog scrim lines (semantic mismatch with
> `inset-empty`; shared-recipe candidate) and ~13 pair lines in files dirty
> from other in-flight work (re-run the codemod after that lands). Gotcha
> fixed mid-run: the skip must match `inset-(chip|field|…)` intents, NOT bare
> `inset-` (which shadows positioning `inset-0` scrims); and pass 2 of a run
> sees pass 1's files as dirty — run per-folder once, or `--include-dirty`.
> **Phase 6 SHIPPED 2026-07-14** — rules captured: `ui-design-system.md`
> "Spacing from the density-aware scale" section, SoT rows in
> `source-of-truth.md` + `AGENTS.md` (one line, always-on-slim),
> `build-gotchas.md` generalized to both `.mjs` values modules, auto-memory
> current. **ALL PHASES COMPLETE — this plan is done.** Residual follow-ups
> live in `display-convergence-log.md`: re-run the codemod on the deferred
> dirty files once that work lands; the ×3 sync-dialog scrim recipe and the
> box-primitive adoption wave (baseline 985) are the next axes' work.
> **Owner model:** authored for execution by **Fable 5**. Self-contained — every
> file, snippet, and command needed is inline.
> **Scope:** spacing/padding/gap only. Sibling axes (control-height/`IconButton`,
> focus-ring, box-primitive adoption) share the same disease and the same cure;
> they are **explicit non-goals here** but referenced in §10 as the follow-on wave.

---

## 1. The problem, in numbers

A four-axis DS census (2026-07-13) scored spacing **High** severity. The spacing
facts:

| Metric | Value |
|---|---|
| Raw padding utilities (`p-/px-/py-/pt-/…`) in `src/` | **9,575** |
| Raw `gap-*` utilities | **3,023** |
| Distinct `px-N py-M` combinations in use | **95** |
| Distinct paddings applied to **one** visual archetype (rounded surface + ring/border box) | **65** |
| Arbitrary hardcoded-px spacing (`p-[…px]`, `gap-[…px]`, `space-y-[…px]`) | **56** (mostly safe-area insets) |
| Real consumers of `src/design-system/tokens/spacing.ts` | **1** (whose only output — CSS vars — is read by **0** downstream code) |
| `theme.spacing` / `theme.extend.spacing` house tokens in `tailwind.config.ts` | **none** |
| Padding utilities that scale with `--cf-density` | **0** (type is density-aware; padding is density-blind) |

**Five different paddings each clear 60+ occurrences** for the same "card/box"
job (`px-3 py-2` ×504, `p-3`, `p-4`, `px-4 py-6`, `px-4 py-3`). This is not
scattered noise — it is teams hand-picking among several unadjudicated
"house-standard" paddings with **no source of truth to pick from**.

## 2. Root-cause diagnosis

The system was **built but never wired and never enforced.** Compare the axes
that succeeded vs. the ones that leaked:

| Axis | SoT exists? | Wired into Tailwind? | `cn()`/twMerge registered? | Ratchet guard? | Adoption |
|---|---|---|---|---|---|
| **Typography** | ✅ `role-*` | ✅ `theme.fontSize` | ✅ `_cn.ts` | ✅ `typography-tokens.guard.test.ts` | **~4,100 migrated** |
| Color | ✅ `themed()` | ✅ `theme.colors` | n/a | ✅ `color-tokens.guard.test.ts` | high |
| Z-index | ✅ `z-index.mjs` | ✅ `theme.zIndex` | n/a | (build-gotcha doc) | high |
| **Spacing** | ⚠️ `spacing.ts` **dead** | ❌ **none** | ❌ | ❌ | **~1%** |

The lesson is unambiguous and comes from this repo's own history: **a token file
that is not Tailwind-wired and not guard-enforced reaches ~1% adoption and stays
there.** Prose rules did not move spacing; the `role-*` migration succeeded only
because it was wired + registered + guarded + codemodded. This plan replicates
that exact four-part recipe for spacing.

## 3. Design principles (mirror the type system exactly)

1. **Density-aware by construction.** Every spacing value is
   `calc(<rem> * var(--cf-density, 1))`, identical to the `role-*` fontSize
   tokens. Padding must breathe with density like type does (Carbon principle:
   the *scale* scales; semantics don't).
2. **Additive, zero-visual-change at default density.** `--cf-density` defaults
   to `1`, so wrapping today's rem values in the `calc()` renders **pixel-for-pixel
   identical** at the default density. No migration is required for the win in
   Phase 1 to land.
3. **Values live in a `.mjs` module** imported by the Tailwind config, mirroring
   `z-index.mjs` (config runs under Node — a `.ts` ESM import triggers reparsing;
   see `.claude/rules/build-gotchas.md`). `spacing.ts` re-exports with types for
   app code.
4. **Intents over values.** The "65 paddings for one box" problem is solved by
   giving callers *named intents* (`inset-card`, `inset-field`, `inset-chip`,
   `stack`, `row`) — the spacing analog of picking a type *role*, not a px.
5. **Ratchet, don't sweep.** Guard **new** arbitrary-px spacing (the 56, minus a
   `ds-allow-spacing` escape for genuine safe-area insets). Migrate the 12,598
   existing utilities **opportunistically**, never big-bang.

## 4. The token model (3 tiers)

```
Tier 1  PRIMITIVE SCALE      density-aware numeric steps  →  theme.spacing (p-3, gap-2, …)
Tier 2  SEMANTIC INTENTS     named recipes                →  .inset-card / .stack / .row  (plugin)
Tier 3  COMPONENT            baked into primitives        →  <Panel padding> / <Inset> / <Stack>
```

- **Tier 1** makes *every existing utility* density-aware and on-scale, for free.
- **Tier 2** gives new code one class per intent so the "same box, N paddings"
  drift cannot recur.
- **Tier 3** is where `Panel`/`Stack`/`Inset` consume Tier 2 so most call sites
  never touch a spacing class at all.

---

## 5. Phases & deliverables

### Phase 0 — Ratify the canonical scale *(gate — requires sign-off)*

Deliverable: a short decision table in this doc, filled in and approved, before
any code. Two things to decide:

**0.1 — The numeric step scale.** The census's dominant real paddings collapse
cleanly onto an 8-step rem scale (values below are today's Tailwind defaults, so
Tier 1 is invisible at density 1):

| Token | rem @ density 1 | Retires (census combos) |
|---|---|---|
| `space-0` | 0 | — |
| `space-0.5` | 0.125rem | chip `py-0.5` |
| `space-1` | 0.25rem | `py-1`, `gap-1` |
| `space-1.5` | 0.375rem | `px-1.5`, `py-1.5` |
| `space-2` | 0.5rem | `px-2`, `py-2`, `gap-2` |
| `space-2.5` | 0.625rem | `px-2.5` |
| `space-3` | 0.75rem | `px-3`, `py-3`, `gap-3` |
| `space-4` | 1rem | `px-4`, `py-4` |
| `space-5` | 1.25rem | `px-5` |
| `space-6` | 1.5rem | `px-6`, empty-state `py-6` |

> **Decision A:** override Tailwind's existing numeric keys in place (so `p-3`
> becomes density-aware with no class rename — **recommended**, maximum reach,
> zero churn), **or** namespace new keys (`p-space-3`). Recommend **override in
> place**; it makes 12,598 utilities density-aware in one commit.

**0.2 — The semantic intents** (Tier 2). Proposed starting set, each mapping to
Tier-1 steps:

| Intent utility | padding | Replaces |
|---|---|---|
| `inset-chip` | `px-1.5 py-0.5` | chip/badge anatomy (314 + 141 sites) |
| `inset-field` | `px-3 py-2` | the dominant control/box padding (504 sites) |
| `inset-cozy` | `px-2.5 py-1.5` | compact list rows / notice lines |
| `inset-card` | `p-4` (→ `p-5` roomy) | card bodies |
| `inset-empty` | `px-4 py-6` | dashed empty/error boxes |
| `stack-tight`/`-row`/`-section` | `gap-1.5` / `gap-2` / `gap-6` | vertical rhythm |
| `row-tight`/`-gap` | `gap-1.5` / `gap-2` | horizontal rows |

> **Decision B:** confirm these seven intents + names. These are the *only* new
> vocabulary; everything else stays raw Tier-1 utilities.

### Phase 1 — Wire the density-aware scale into Tailwind *(the keystone)*

**1.1** Create `src/design-system/tokens/spacing.mjs` — the values module (Node-
safe, mirrors `z-index.mjs`):

```js
// src/design-system/tokens/spacing.mjs
// Density-aware spacing scale. Every value = base × var(--cf-density, 1),
// identical to the role-* fontSize tokens (tailwind.config.ts). At the default
// density (1) these render pixel-identical to Tailwind's stock scale, so wiring
// them in is additive and invisible; a [data-density="compact"] container
// tightens padding + gap the same way it tightens type. Weight-analog (radii,
// borders) do NOT live here — only length spacing.
const d = (rem) => `calc(${rem} * var(--cf-density, 1))`;

export const spacingScale = {
  0: '0px',
  px: '1px',
  0.5: d('0.125rem'),
  1: d('0.25rem'),
  1.5: d('0.375rem'),
  2: d('0.5rem'),
  2.5: d('0.625rem'),
  3: d('0.75rem'),
  3.5: d('0.875rem'),
  4: d('1rem'),
  5: d('1.25rem'),
  6: d('1.5rem'),
  7: d('1.75rem'),
  8: d('2rem'),
  10: d('2.5rem'),
  12: d('3rem'),
  14: d('3.5rem'),
  16: d('4rem'),
  20: d('5rem'),
  24: d('6rem'),
};
```

> Keep every key Tailwind ships that the app actually uses (grep first — see
> §9). Any key **omitted** here disappears from the utility set, so the module
> must be a **superset** of in-use numeric spacing keys. `0`/`px` stay literal
> (never scale a hairline).

**1.2** Convert `src/design-system/tokens/spacing.ts` from dead code into the
typed re-export SoT (delete the unused `density` preset map and the CSS-var
emission path that nothing reads — confirm via §9 grep first):

```ts
// src/design-system/tokens/spacing.ts
export { spacingScale } from './spacing.mjs';
export type SpacingKey = keyof typeof import('./spacing.mjs').spacingScale;
```

**1.3** Wire into `tailwind.config.ts` (`theme.extend`), next to the existing
`fontSize` role block:

```ts
import { spacingScale } from "./src/design-system/tokens/spacing.mjs"; // .mjs — see build-gotchas
// …
theme: {
  extend: {
    spacing: spacingScale,   // ← density-aware; drives p-*, m-*, gap-*, space-*, inset-*
    // fontSize: { 'role-*': … }  (unchanged)
  },
},
```

**1.4** Verify no visual change: `npx tsc --noEmit` + a dev-server smoke of one
dense page (receiving unbox) at default density — pixels must match `main`.

### Phase 2 — Semantic intents (Tier 2 plugin) + `cn()`/safelist registration

**2.1** Add a tiny Tailwind plugin (config currently has `plugins: []`) that
registers the Phase-0.2 intents as single utilities built from Tier-1 steps:

```ts
// tailwind.config.ts
import plugin from 'tailwindcss/plugin';
// …
plugins: [
  plugin(({ addUtilities, theme }) => {
    const s = theme('spacing');
    addUtilities({
      '.inset-chip':  { paddingInline: s['1.5'], paddingBlock: s['0.5'] },
      '.inset-field': { paddingInline: s['3'],   paddingBlock: s['2'] },
      '.inset-cozy':  { paddingInline: s['2.5'], paddingBlock: s['1.5'] },
      '.inset-card':  { padding: s['4'] },
      '.inset-empty': { paddingInline: s['4'],   paddingBlock: s['6'] },
      '.stack-tight':   { display: 'flex', flexDirection: 'column', gap: s['1.5'] },
      '.stack-row':     { display: 'flex', flexDirection: 'column', gap: s['2'] },
      '.stack-section': { display: 'flex', flexDirection: 'column', gap: s['6'] },
      '.row-gap':   { display: 'flex', alignItems: 'center', gap: s['2'] },
      '.row-tight': { display: 'flex', alignItems: 'center', gap: s['1.5'] },
    });
  }),
],
```

Because these read `theme('spacing')`, they inherit density-awareness
automatically.

**2.2** Register the intent utilities where they can be applied dynamically. The
intents are **not** font-size, so they do **not** go in `_cn.ts`'s `font-size`
group — but any intent used via a computed/merged className needs
`tailwind-merge` to keep it. Add a `classGroups` entry so `cn()` treats
`inset-*`/`stack-*`/`row-*` as their own groups (prevents two intents silently
merging):

```ts
// src/utils/_cn.ts — extend alongside the existing 'font-size' group
classGroups: {
  'font-size': [{ text: [...CUSTOM_FONT_SIZES] }],
  'cf-inset': ['inset-chip', 'inset-field', 'inset-cozy', 'inset-card', 'inset-empty'],
  'cf-stack': ['stack-tight', 'stack-row', 'stack-section'],
  'cf-row':   ['row-gap', 'row-tight'],
},
```

**2.3** Safelist the intents in `tailwind.config.ts` (mirror the `role-*`
safelist block) so they ship available for adoption before every call site uses
them, and survive any dynamic construction.

### Phase 3 — Tier-3 layout primitives

**3.1** Add `Stack`, `Inset`, `Row` to `src/design-system/primitives/` (thin, so
callers compose intents rather than classes). Signatures:

```tsx
// <Stack space="section|row|tight">   → column flex + gap
// <Inset space="card|field|cozy|chip"> → padded box (no surface/border of its own)
// <Row gap="tight|default">           → items-center flex + gap
```

Each is a `forwardRef` div applying the matching Tier-2 class via `cn()`, with a
`className` passthrough. ~15 lines each. Export from `primitives/index.ts`.

**3.2** Point `Panel`'s `PADDING` map at the intents so the one primitive that
already does it right stays consistent:

```ts
// src/design-system/primitives/Panel.tsx
const PADDING = { none: 'p-0', sm: 'inset-card', md: 'p-5', lg: 'p-6' };
```

(Leave `md`/`lg` as scale utilities; only align `sm` → `inset-card`. Do not
change default rendered padding.)

### Phase 4 — Ratchet guard

**4.1** Add `src/components/ui/spacing-tokens.guard.test.ts`, cloned structurally
from `typography-tokens.guard.test.ts` (same walker, same comment-line skip, same
`node:test` shape). Two tests:

- **Test 1 — no NEW arbitrary-px spacing.** Fail on standalone
  `p-[Npx]`/`px-[…]`/`py-[…]`/`pt-…pr-[…]`/`gap-[Npx]`/`space-{x,y}-[Npx]`, with a
  boundary-safe regex mirroring `ARBITRARY_PX_RE`. **Escape hatch:** a line
  carrying a `// ds-allow-spacing` comment (or an inline `/* ds-allow-spacing */`)
  is exempt — this is where the ~40 genuine safe-area/viewport insets
  (`pt-[calc(env(safe-area-inset-top)+…)]`, `min-h-[100dvh]`-adjacent) live. Seed
  the allow-comments in the same PR so the guard lands green.
- **Test 2 — keystone registration.** Assert `spacing.mjs` is imported by
  `tailwind.config.ts` and that `_cn.ts` registers the `cf-inset`/`cf-stack`/
  `cf-row` groups — the analog of the type guard's "`cn()` registers the roles"
  keystone test, so the wiring can't silently regress.

**4.2** *(Recommend-only, not a hard fail this wave)* a soft lint/report that
flags a hand-rolled box (`rounded-{lg,xl,2xl}` + `bg-surface-*` + `border`/`ring`)
outside `src/design-system/**` and points at `Panel`/`Inset`. Ship as a
non-blocking script first (`scripts/audit/box-drift.mjs`) so it doesn't wall off
the 550 existing files; promote to a ratchet later once the count trends down.

### Phase 5 — Codemod the dominant combos (opportunistic, reversible)

**5.1** `scripts/codemods/spacing-intents.mjs` — a conservative,
comment-preserving AST/regex codemod that rewrites **only** the unambiguous
intent matches, one combo at a time behind flags:

- `px-1.5 py-0.5` → `inset-chip`
- `px-3 py-2` → `inset-field`
- `px-2.5 py-1.5` → `inset-cozy`
- `px-4 py-6` → `inset-empty`

Rules: only rewrite when the two classes are **adjacent** and **not** already
inside an intent; never touch a line with `ds-allow-spacing`; run per-combo with
a dry-run diff + count. Do **not** codemod `p-3`/`p-4`/`gap-*` (Tier-1 already
density-aware — no benefit to churn).

**5.2** Run the codemod folder-by-folder starting at the census hot-spots
(`components/admin`, `components/receiving`, `components/sidebar`,
`features/operations`), `tsc --noEmit` + smoke after each folder. This is
optional cleanup — the guard already prevents *new* leakage regardless.

### Phase 6 — Documentation + rule capture

**6.1** Update `.claude/rules/ui-design-system.md` (§ "Color only from semantic
tokens" neighborhood): add a **"Spacing from the density-aware scale"** section —
"pick a Tier-2 intent (`inset-*`/`stack-*`/`row-*`) or a Tier-1 step; never a raw
`p-[…px]`; the scale is density-aware, so padding tightens with `data-density`."

**6.2** Add a one-line SoT row to `.claude/rules/source-of-truth.md` and
`AGENTS.md`'s SoT table: `Spacing → src/design-system/tokens/spacing.mjs`.

**6.3** Add an auto-memory entry (`spacing-token-scale.md`) mirroring the
`typography-token-scale.md` memory, noting: density-aware scale wired in Tailwind,
intents via plugin, guard bans raw `p-[Npx]`, `ds-allow-spacing` escape.

---

## 6. Rollout order & safety

```
Phase 0 (sign-off) → 1 (wire scale, invisible) → 2 (intents+cn+safelist)
   → 3 (primitives) → 4 (guard, seed allow-comments) → 5 (codemod, opportunistic) → 6 (docs)
```

- **Phases 1–4 are shippable as one additive PR** with zero visual change and no
  call-site edits (beyond seeding `ds-allow-spacing` on the existing 56). The
  guard turns green in the same PR.
- **Phase 5 is N follow-up PRs**, one per hot-spot folder, each independently
  revertible.
- **Kill switch:** if Tier-1 causes any regression, revert the one-line
  `spacing: spacingScale` from the config — everything falls back to Tailwind's
  stock scale instantly.

## 7. Density payoff (latent win)

`--cf-density` is defined in `globals.css` and read by the `role-*` type tokens,
but **no component sets `data-density="compact"` today** — the density axis is
wired yet dormant. Once Tier-1 lands, the moment any Station/`floor` or ops table
opts into `data-density="compact"` on its container, **both type and padding
tighten together**, coherently. This plan does not wire density modes (that's the
`floor`/`ops`/`rollup`/`studio` density follow-on), but it makes spacing *ready*
for it — closing the "type is density-aware, padding isn't" gap called out in the
census.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Omitting an in-use numeric spacing key → that utility silently vanishes (Tailwind content-glob-style invisible failure) | §9 grep produces the **complete** in-use key set; `spacingScale` must be a superset. Smoke-test dense pages. |
| `calc(var())` in a spacing value breaks a Tailwind feature (e.g. negative margins, JIT arbitrary) | Keep `0`/`px` literal; test `-m-*`, `space-*`, and `gap-*` explicitly in the Phase-1 smoke. |
| `data-density` scoping unexpectedly tightens a comfortable region | Density is opt-in per container and **still unused**; no region tightens until someone adds the attribute. Zero blast radius at ship. |
| twMerge drops an intent when merged with a raw padding | The `cf-inset`/`cf-stack`/`cf-row` class groups (Phase 2.2) make intents first-class in conflict resolution. Unit-test `cn('inset-field','px-6')`. |
| Guard false-positives on legit safe-area insets | `ds-allow-spacing` escape comment, seeded on all 56 existing sites in the guard's PR. |
| Codemod mangles a dynamic/partial className | Codemod only rewrites adjacent literal pairs, dry-run diffed, per-folder `tsc` gate; Tier-1 already delivers the density win without it. |

## 9. Pre-flight commands (run before Phase 1)

```bash
# Complete set of in-use numeric spacing keys (spacingScale MUST be a superset):
grep -rhoE '\b-?(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-[0-9.]+' \
  src --include=*.tsx --include=*.ts | sed -E 's/^-?[a-z-]+-//' | sort -u

# Confirm nothing reads the vars spacing.ts currently emits (safe to delete that path):
grep -rn "var(--space-" src | grep -v tokens/

# Baseline the arbitrary-px sites the guard will gate (seed ds-allow-spacing here):
grep -rnE '\b(p|px|py|pt|pb|pl|pr|gap)-\[[^]]*px\]|space-[xy]-\[[^]]*px\]' src --include=*.tsx
```

## 10. Non-goals (this wave) — and the follow-on

Explicitly **out of scope**, to keep the waist change tractable:

- **Control-height / sizing axis** (`IconButton` owns no height; 46% override
  rate; dead `touch.ts`). *Severe* per census — its own plan, **same recipe**
  (density-aware height tokens + primitive size contract + guard).
- **Focus-ring axis** (206 recipes, no SoT). Its own plan (a `focusRing` recipe +
  `TextField` adoption + guard).
- **Box-primitive adoption** (`CardShell`/`PanelRow` at 0 consumers; ~1.9%
  adoption). Phase 4.2 seeds the *detection*; the migration is its own wave.
- **Wiring density modes** (`floor`/`ops`/`rollup`/`studio` → `data-density`).
  This plan makes spacing *ready* for it; it doesn't turn it on.

Each of the four leaked axes shares the identical fix shape — **wire into
Tailwind → register in `cn()` → ratchet-guard → codemod opportunistically** — so
this spacing plan doubles as the template for the other three.

## 11. Definition of done (Phases 1–4 PR)

- [ ] `spacing.mjs` created; `spacing.ts` re-exports; dead `density` map + CSS-var
      path removed (confirmed unread).
- [ ] `tailwind.config.ts` extends `theme.spacing` from `spacing.mjs`; intents
      plugin added; intents safelisted.
- [ ] `_cn.ts` registers `cf-inset`/`cf-stack`/`cf-row` groups.
- [ ] `Stack`/`Inset`/`Row` primitives exported; `Panel` `sm` → `inset-card`.
- [ ] `spacing-tokens.guard.test.ts` passes (arbitrary-px gate + keystone
      registration), with `ds-allow-spacing` seeded on all pre-existing arbitrary
      sites.
- [ ] `npx tsc --noEmit` clean; dense-page smoke shows **pixel-identical** render
      at default density vs. `main`.
- [ ] Docs: `ui-design-system.md` + SoT tables + auto-memory updated.
