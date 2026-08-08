# Token system consolidation — collapsing four emitters into one source of truth

> **Status:** amended draft, verification pass complete (2026-07-26).
> **Lane:** WS-TOKENS (registered in [`docs/portfolio/WORKTREE-LANES.md`](../portfolio/WORKTREE-LANES.md) + `dev-worktrees.json`).
> **Supersedes:** the keep-verdict on `tokens/css-variables.ts` in
> [`docs/design-system-token-simplification.md`](../design-system-token-simplification.md) §2/§5/§8, and Phase 0 of
> `docs/design-system/2026-component-adoption-plan.md`.
> **Scope:** colour + value layer. **Schema changes:** none.
> **Revised effort:** ~9–10 days (original draft estimated 3–4 weeks).

Cycle Forge does not have a missing design system — it has **five** of them emitting into the same stylesheet.
This plan removes two, reduces two, promotes one, and pins the result with CI enforcement.

Every number below was measured against the codebase, not estimated. Where the original draft was wrong, the
correction is called out inline so the reasoning is reviewable rather than silently replaced.

---

## 1 · Why this is urgent

Two `<style>` blocks are injected back to back in [`src/app/layout.tsx`](../../src/app/layout.tsx) — line 70
(`app-design-tokens`) and line 74 (`app-theme-palettes`) — and two more `:root` blocks live in
`src/app/globals.css` and `src/styles/globals.css`. They declare overlapping variable names with different values.

The concrete cost today is **310 variables / 13,277 bytes** shipped on every page, of which **212 are provably
unread**, plus **eleven** genuinely colliding names whose winner nobody on the team can name from a call site.

> **Correction to the original draft.** The draft's headline defect — "every status pill in the app is
> theme-blind" — is **false**, and the urgency argument must not rest on it. See §3, D1.

---

## 2 · What exists today

| System | Owner → emission | Namespace | Theme-aware |
|---|---|---|---|
| **A — Themes** *keep* | `themes/registry.ts` + 8 palettes → `themePaletteStyleText` → `layout.tsx:74` | `--ds-color-*` (40 keys × 8 themes, + 8 staff accents × 2 schemes) + `--background`/`--foreground` | **Yes** |
| **B — TS tokens** *retire* | `colors/base.ts` → `colors/semantic.ts` → `css-variables.ts` → `styles/tokens.ts` → `layout.tsx:70` | 310 vars: `--ds-color-base-*` (94), `--ds-color-semantic-*` (84), `--ds-typography-*` (34), `--ds-zIndex-*` (21), `--ds-motion-*` (14), `--ds-shadow-*` (9), `--ds-radius-*`/`--ds-border-*` (8 each), legacy `--color-*`/`--text-*`/`--font-*` (35) | No — static, light-only |
| **C1 — `src/app/globals.css`** *reduce* | hand-written; **the entry file** (`layout.tsx:1`), line 1 `@import '../styles/globals.css'` | `@tailwind` directives, `--background`/`--foreground`, `body`, `.font-dm-sans`, global reset, print stylesheet | No |
| **C2 — `src/styles/globals.css`** *reduce* | hand-written | `--ds-radius-*`, `--ds-shadow-*`, `--ds-motion-*`, `--ds-font-*`, `--color-navy-*`, `--color-brand*`, `--ds-wash-*`, `--cf-*` | No — and collides with B |
| **E — dark compat layer** *carve out* | `src/styles/globals.css` (~311 `data-color-scheme` rules) | remaps raw Tailwind utilities under `html[data-color-scheme='dark']` | Yes, by class |
| **D — Tailwind** *pin* | `tailwind.config.ts` (+ `spacing.mjs`, `z-index.mjs`) | 46 `themed()` aliases + 16 literal-hex entries; `role-*` type scale | Passthrough |

> **Corrections to the draft's Table 1.** System C is **two files**, not one. The **dark compat layer (E) is a
> fifth system**, not a footnote — it is load-bearing for nearly every status chip in the app (see §3, D1) and
> is the largest hex concentration in the repo. The draft's "60-line semantic alias map (lines 83–180)" is
> actually **`tailwind.config.ts:79–181` = 103 lines**, and it is not one map: 46 `themed()` entries **plus 16
> literal-hex entries** (navy ×10, `scrim`, `glass`, `stage` ×4). A generator sized off "60 lines of aliases"
> would themify the hex entries and break ~280 `bg-glass/10`-style call sites.

### 2.1 · Cascade order is determinate — write it down

The draft left the winner open ("whichever parses last"). It is provable and fixed:

1. Next emits the compiled global stylesheet as a `precedence`-carrying hoisted `<link>`
   (`render-css-resource.js`); `next.config.ts` sets no `experimental.inlineCss`, so it is always external.
2. React Fizz flushes hoisted stylesheets **before** the `<head>`'s own JSX children.
3. Neither `<style>` at `layout.tsx:70`/`:74` carries `precedence`, so neither is hoisted.

**Document order is always: `globals.css` `<link>` → `app-design-tokens` → `app-theme-palettes`.**

Therefore **system B already wins every `:root` collision with C, in dev and in prod**, and A wins over both.
This is the load-bearing invariant for Steps 2 and 4 and is pinned by a guard test in Step 1.

Corroborating history: a `globals.css` dark block was previously hardened to `html[data-theme='dark']`
"so it reliably beats the injected `:root` token block" — i.e. C was *observed* losing at equal specificity.

---

## 3 · The defects

### D1 · Status colour cannot theme — **real, but ~1/50th the reach the draft claims**

`StatusBadge` resolves its statuses through `--color-status-*` / `--color-info|warning|success|error`, which are
emitted once as static light-theme hex with no `[data-theme]` override. That much is true.

**But the DS `StatusBadge` has exactly two importers:** `src/app/design-demo/page.tsx` and
`src/components/receiving/ZohoInboundStatusBanner.tsx`. The `StatusBadge` symbols at
`src/components/inventory/ByUnitView.tsx:373` and `src/app/admin/inventory/sku/[sku]/page.tsx:220` are **local
homonyms** — separate `function StatusBadge` declarations wrapping `inventoryStatusBadgeClass` /
`unitStatusBadgeClass`, which emit Tailwind classes and are themed by system E.

Every real status pill in the app routes through `unitStatusBadgeTone`, `inventoryStatusBadgeClass`,
`FbaStatusBadge`, `ShipmentStatusBadge`, `WarrantyStatusBadge`, `repairStatusBadgeClass`,
`rmaStatusBadgeClass`, `replenishmentStatusBadgeClass`, or `triageStatusBadgeClass` — **all class-based**.

**Actual reach: one admin-permission-gated `?page=zoho-management` diagnostics banner rendering six statuses.**

Two further corrections: 7 of the 12 status tones are byte-identical to an existing theme key
(`text-success`, `text-danger`, `text-info`, `text-fulfillment`), so at most 1–2 genuinely new keys × 8 palettes
= **8–16 values to author, not 96**. And the draft's status count is inconsistent with itself (32 in Step 3,
37 in Risks); the true figure is **32 `STATUS_MAP` keys resolving to 17 distinct vars**, plus a
`--color-neutral-700` fallback at `StatusBadge.tsx:58` the draft omits.

> **A real bug the draft misses on that same surface:** the banner's `text-teal-700`/`text-amber-700` text *is*
> remapped under dark, onto an **arbitrary** linear-gradient `bg-[…]` shell that system E cannot match —
> ~1.4:1 contrast, illegible today. Six lines, no token implications. Filed separately from this plan.
> Note that Step 3 *as originally written* would have made this worse, by theming the one legible element.

### D2 · The same value is authored twice — confirmed, scope clarified

`semantic.ts` declares `text.success = green[600]`; `themes/light.ts` independently declares
`'text-success': '#16a34a'`. The named functional-tone block is duplicated this way.

Size the work off the **22 semantic leaves with live TS consumers in `styles/tokens.ts:12–34`** (six of which
have no theme twin at all) — **not** off the raw 57-of-84 light-palette overlap. That larger overlap is a
light-palette coincidence; most collided pairs diverge in 6–7 of the 8 palettes, and fusing them would
collapse variables the registry exists to keep apart.

### D3 · Name collisions — **eleven names, not four**

Computed from the real modules rather than by eye:

| Variable | C2 (`styles/globals.css`) | B (TS tokens) | |
|---|---|---|---|
| `--ds-radius-sm` | `0.5rem` | `0.375rem` | differs |
| `--ds-radius-md` | `0.625rem` | `0.5rem` | differs |
| `--ds-shadow-sm` | `0 1px 3px /.08` | `0 6px 16px /.03` | differs — *a different shadow language, not a nudge* |
| `--ds-shadow-md` | `0 12px 24px /.08` | `0 10px 24px /.04` | differs — **missed by the draft** |
| `--ds-motion-normal` | `220ms` | `200ms` | differs |
| `--ds-font-sans` | short fallback tail | via `--font-sans` | differs — **missed, and the only live pair** |
| `--ds-font-mono` | short fallback tail | via `--font-mono` | differs — **missed, and live** |
| `--ds-radius-lg` · `--ds-radius-xl` · `--ds-motion-fast` · `--ds-ease-standard` | — | — | 4 byte-identical → delete freely |

B wins all eleven today (§2.1). Deltas in the draft (`+2px`, `+20ms`) are correct as *(globals − TS)* but
invert if read as "effect of Step 2" — Step 2 adopts the TS value, so those dimensions **shrink**.

### D4 · Most of system B has no readers — **confirmed and understated**

`--ds-color-base-*` (94), `--ds-color-semantic-*` (84) and `--ds-typography-*` (34) have **zero `var()` readers**
anywhere in `src/`. That is **212 provably dead of 310 emitted**, not the draft's "~200 of ~200".

Nine of the eleven colliding names (`--ds-radius-*`, `--ds-shadow-*`, `--ds-motion-*`, `--ds-ease-standard`)
have **no readers under any syntax** — a grep on bare names, not just `var(`, returns only declarations.
Tailwind does not bridge them either: `borderRadius` extend is `{station:'8px'}` and there is **no**
`boxShadow` / `transitionDuration` / `transitionTimingFunction` extend, so `rounded-md` and `shadow-sm` are
Tailwind stock values unrelated to `--ds-radius-md` / `--ds-shadow-sm`.

**Consequence: Step 2 as originally written changes rendered output in exactly zero ways.** It is dead-code
cleanup, not a visual-risk step. The five-route screenshot diff is dropped.

Surviving readers of system B, in full:

| Reader | Variable | Handled in |
|---|---|---|
| `tailwind.config.ts:183–184` | `--ds-font-sans` / `--ds-font-mono` — **the entire `font-sans`/`font-mono` families** | Step 2b |
| `src/app/globals.css:9` (`.font-dm-sans`, 4 call sites) and `:20` (`body`) | `--font-sans`, fallback-free | Step 2b |
| `src/components/auth/ProviderSignInButton.tsx:126` | `--ds-font-sans` | Step 2b |
| `src/styles/globals.css:623` | `--ds-border-width-thin` → `--cf-grid-line-w` | Step 4 |
| `ZohoInboundStatusBanner.tsx` | `--color-neutral-200/700/900`, `--color-brand-primary`, `--text-sm`, `--text-xs` | Step 3 |
| `StatusBadge.tsx` / `StatusText.tsx` | 17 status/tone vars, built dynamically as `` var(`${colorVar}`) `` | Step 3 |

> The draft cited `--ds-border-width-thin` at `globals.css:579`; it is at **`:623`**.
> The draft's Appendix A says `semantic.ts`'s "only importer is `css-variables.ts`" — there are **two**
> (`css-variables.ts:3` and `styles/tokens.ts:3`), plus a `tokens/index.ts:1` re-export.

> **The one ordering mistake that matters.** `--ds-font-*` and `--font-*` are declared **only** in
> `styles/tokens.ts`, are read fallback-free, and drive the app's entire typography.
> **Nothing may delete a `--ds-font-*` or `--font-*` declaration until Step 2b lands.** Doing so produces an
> app-wide typography regression with a green CI.

---

## 4 · Target architecture

One authored layer, one generated layer, one consumption rule.

```
themes/registry.ts        THE contract — 40 theme keys × 8 palettes, + status keys if Step 3 needs them
styles/globals.css        theme-INDEPENDENT tokens only: fonts, washes, --cf-*, elevation ladder
                          + the dark compat layer (system E), explicitly carved out and documented
app/globals.css           @tailwind directives, body, reset, print — no token declarations
tailwind.config.ts        committed, not generated; pinned by a drift check
product code              Tailwind semantic aliases only (bg-surface-card, text-text-soft)
design-system internals   var(--ds-…) allowed
```

**No code generator.** See Step 5 for why the draft's Style Dictionary / DTCG target is rejected in favour of
a drift gate that buys the same guarantee for a fifth of the effort.

---

## 5 · Migration steps

### Step 0 — Lane + prior art · 0.5 d · no risk
Register lane **WS-TOKENS**. Reverse the keep-verdict on `tokens/css-variables.ts` in
`docs/design-system-token-simplification.md` on the record. Mark `2026-component-adoption-plan.md` Phase 0
superseded. Append this as the fifth axis of `display-convergence-log.md` (whose four-step recipe already
worked for spacing / control-size / focus-ring / surface-box). Fix `AGENTS.md:143`, which states `.ts` where
`tailwind.config.ts:9–10` actually imports `.mjs` — the constitution currently contradicts the code and would
walk an agent into a broken config.

*The `GLASS-DESIGN-SYSTEM.md` reconciliation is moot — that doc was a port guide sourced from another
repo (none of its files exist here) and was retired 2026-08-01.*

### Step 1 — Record the cascade invariant · 0.5 d · no risk
Add the §2.1 invariant plus a guard test asserting the two `<style>` tags carry no `precedence` and appear in
head-JSX order. This survives someone flipping `experimental.inlineCss`. Add `src/app/globals.css` and the
dark compat layer to the system inventory.

### Step 2a — Delete the dead collisions · 1 h · no risk
Delete the 9 zero-reader collisions from `styles/globals.css`, the dead `--color-navy-*` / `--color-brand*`
trio (zero readers; note `--color-brand-primary` is a **different** name, owned by `styles/tokens.ts`), and the
static `--background`/`--foreground` pair at `app/globals.css:12–15` (shadowed by the theme registry, which
emits both per-palette at `registry.ts:243–244`, so `body` keeps working and gains theme-awareness).
Fix the backwards comment at `styles/globals.css:8–9`. **No screenshot diff.**

### Step 2b — Rehome the font chain · 0.5 d · low · **blocks Steps 3–5**
Move the canonical stacks from `typography/families.ts` into `styles/globals.css` as the durable owner of
`--font-sans`, `--font-mono`, `--ds-font-sans`, `--ds-font-mono`. After this, retiring system B cannot affect
typography.

### Step 3 — Migrate `ZohoInboundStatusBanner` off system B · 0.5–1 d · low
*(Retitled and folded down from the draft's standalone 1–2 d medium-risk release.)*
That one file reads six B-only vars beyond the badge. Then either delete `StatusBadge.tsx` + `StatusText.tsx`
(2 call sites, 6 rendered statuses, no tests) or repoint 17 var strings. File the gradient-contrast bug
separately.

### Step 4 — Retire system B · 1.5 d · low *(after 2b + 3)*
Ordered: inline the literal `1px` at `styles/globals.css:623`; edit `tokens/index.ts:1` and the DS barrel
(37 importers); delete `css-variables.ts` + `styles/tokens.ts` + `colors/semantic.ts`; demote `colors/base.ts`
to primitives importable only by `themes/*`; fix the now-false doc comments at `z-index.ts:15` and
`shadows.ts:5`; run `npm run knip:baseline` and commit the shrunk baseline **in the same PR** (these exports
are already listed there, so reviewers otherwise see an unexplained 20-line diff).

Payoff: ~12.2 KB of the 13.3 KB inline block deleted; `layout.tsx` drops to one token `<style>`.

> Note `designSystemTokenStyleText` (11,876 B) has **zero importers** — it is a dead export, not a second
> shipped block. Delete it with the module.

### Step 5 — Pin Tailwind with a drift check, **not** a generator · 1 d · medium
The draft's Style Dictionary target is rejected on four measured constraints:

- **`themed()` is a function colour, not a string** (`tailwind.config.ts:34–38`). Emitting the obvious
  `'surface-card': 'var(--ds-color-background-surface)'` does not make the ~333 alpha-modifier call sites
  opaque — it makes them **cease to exist** (`parseColor` rejects a bare `var()`, the candidate is invalid, no
  rule is generated). Both guard halves are load-bearing: `String()` coercion (the gradient plugin passes a
  numeric `opacityValue`, else the CSS build throws) *and* the `opacityValue === undefined` branch
  (`toColorValue` calls with `{}`, else you silently emit `calc(undefined * 100%)`). **Keep the closure
  verbatim; generate only name→var pairs.**
- **The keystone `spacing-tokens.guard.test.ts:100–126` reads `tailwind.config.ts` as text** and pins exact
  substrings *including quote style*. A generator that normalises quoting fails CI while producing
  byte-identical CSS.
- **`role-*` must stay `calc(<rem> * var(--cf-density, 1))` inside four-part tuples** — it is not a DTCG
  `{value, unit}` scalar. Any change must sync **three** lists (the `fontSize` block, the safelist, and
  `CUSTOM_FONT_SIZES` in `_cn.ts:22–32`) or twMerge silently drops every `text-role-*` with no build error.
- **`scripts/vercel-should-build.mjs:20` lists `tailwind.config.ts` in `DEPLOY_PATHS`.** Gitignoring a
  generated config stops production deploys firing on token changes.

Instead, follow the house pattern already used by `audit-route-auth:check` and `schema:drift-guard:check`:
commit the config, add `tokens:drift --check` to `verify.mjs` + `ci.yml`, asserting the 46 `themed()` aliases
match `THEME_VAR_KEYS` + accents and that the 16 literal-hex entries stay excluded. **Same guarantee, 3–5 d → 1 d.**

*The draft's purge warning is also misdiagnosed: purging applies to class-name candidates scanned from
`content`; CSS custom properties are never purged, and `spacing.mjs` / `z-index.mjs` are working precedents
already outside the globs.*

### Step 6 — Guards: lower baselines, add the 2.5 that are missing · 1.5 d · low
Roughly 60% of the draft's Step 6 already shipped. **Already enforced:** raw hex in `.ts/.tsx` (baseline 24),
raw `<button>` (54), arbitrary spacing (zero-tolerance), `z-[NN]` (ESLint `no-restricted-syntax`), control size
(178), focus ring (1075), hand-rolled shells (130).

**Genuinely missing:** `shadow-[…]` (81 occurrences), `rounded-[…]` (13), the import-boundary rule (nothing
exists — the depcruise rule is `warn`, points the other way, and never runs in CI), and a **`.css`-aware and
token-module-aware hex guard**: every existing guard walks only `['.ts','.tsx']`, so 147 hex in
`styles/globals.css`, 93 in `base.ts` and 64 in `registry.ts` are invisible.

State the ratchet law explicitly: baselines go **down only** (`verify.mjs:95`). A refactor touching ~1000 call
sites will move focus-ring / surface-box / raw-button counts, and any accidental increase hard-fails. Also
flag the rename hazard: `surface-box` and `color-neutrals` key on literal class names, so renaming a semantic
token does not fail them — it silently blinds them.

### Step 7 — Gallery · 1 d · low
A registry-driven theme switcher **already exists** (`AppearanceSection.tsx:373–425` + `ThemePreviewMini`,
painting live palette vars for all 8, plus density / font-scale / wash). Step 7 is compose-and-relocate, not
build. Genuinely absent: a 40-key token swatch matrix, a status matrix, and an **entry point** — `/design-demo`
is unlinked from all navigation.

*Do not trust `docs/design-system/2026-component-adoption-plan.md:9,332` — it references `_gallery/sections.tsx`,
a directory deleted across three commits.*

### Step V — Verification · 0.5 d · low
**No screenshot harness.** Playwright has 93 specs but **zero** `toHaveScreenshot`, no `-snapshots` dirs, no
`webServer` block, `workers: 1`, and runs in **zero CI jobs**. A theme-seeding `addInitScript` would not work
anyway: `ThemeSync.tsx:20–23` re-applies the theme from `/api/staff-preferences` after hydration.

Use a plain `src/**/*.test.ts` over `registry.ts` asserting 8 palettes × 40 keys and the emitted CSS text —
free, serial-safe, already inside `verify.mjs`. Plus **one Tailwind build diff** before any bulk deletion.

### Step X — Pre-deletion sweep · **COMPLETE (2026-07-26)** · all clear
- **Electron/desktop shell** — `desktop-dist/`, `desktop-dist2/` are electron-builder *output* (win-unpacked +
  `LICENSES.chromium.html`); no source shell, no `electron` dependency. No HTML entry bypasses `RootLayout`.
- **Server-generated print HTML** — `src/lib/print/*` renders via `iframe.srcdoc`, a standalone document, and
  references **zero** CSS custom properties. Retiring B / reducing C cannot break printed labels.
- **Persisted `staff_preferences`** — theme and accent persist by *name*; no palette or accent is renamed by
  this plan, so no live rows are orphaned.

---

## 6 · Sequencing

| Step | Effort | Risk | Blocked by |
|---|---|---|---|
| 0 · Lane + prior art | 0.5 d | none | — |
| 1 · Cascade invariant + guard | 0.5 d | none | — |
| 2a · Delete dead collisions | 1 h | none | X ✅ |
| **2b · Rehome font chain** | 0.5 d | low | 2a · **blocks 3, 4, 5** |
| 3 · Zoho banner + StatusBadge | 0.5–1 d | low | 2b |
| 4 · Retire system B | 1.5 d | low | 2b, 3 |
| 5 · Tailwind drift check | 1 d | medium | 4 |
| 6 · Guards | 1.5 d | low | 5 |
| 7 · Gallery | 1 d | low | 5 |
| V · Verification | 0.5 d | low | throughout |

**Total ~9–10 days.** The savings over the draft's 3–4 weeks come almost entirely from deleting ceremony the
evidence does not support (screenshot matrix, 96 hand-authored hexes, a code generator); the additions are the
prerequisites that keep Step 4 from shipping a fontless `body` and an unstyled admin banner.

---

## 7 · Risks

- **Font chain ordering.** The single sequencing mistake that turns a safe cleanup into an app-wide regression
  with green CI. Step 2b gates Steps 3–5. *(Not in the draft.)*
- **The dark compat layer.** ~311 rules, invisible to every guard, load-bearing for nearly all status chips.
  "Reduce globals" without carving it out breaks dark mode app-wide. *(Not in the draft.)*
- **Baseline ratchets move under a large refactor.** Baselines are down-only; an accidental increase hard-fails
  `verify`. Re-baseline deliberately, never to make a build pass.
- **`themed()` and `role-*` are not DTCG-shaped.** Mechanised token emission breaks alpha modifiers and the
  density scale respectively. Step 5 avoids both by not generating.
- **Order-dependent regressions.** Materially lower than the draft assumed — B already wins, and 9 of 11
  collisions are dead — but still run one Tailwind build diff before bulk deletion.
- **Hue drift** *(only if Step 3 authors new hues)*. There is no contrast tooling in the repo. `mono` is
  strictly monochrome (`text-info` and `text-fulfillment` are both `#3f3f46`) — the palette hand-authored
  saturated status hues would break first.

### Unexamined — carry forward
- No Tailwind build has been run; every "zero readers" conclusion is grep- and module-evaluation-based.
  One dynamic-construction hazard *was* caught (`StatusText`'s `` var(`${colorVar}`) ``, invisible to a
  `var(--color-status` grep); no systematic sweep was done for `@apply`, template-literal class construction,
  or programmatic `--ds-color-${key}` assembly.
- Head order was proven from the vendored Next/React runtime — strong, but version-coupled. Step 1's guard
  closes this.
- No measurement of the Tailwind **utility-bundle** delta; the perf argument rests only on the 13.3 KB inline block.
- No contrast verification of the eight existing palettes; their headers make claims nothing checks.

---

## 8 · Definition of done

- Exactly one `<style>` tag emits design tokens.
- No token name is declared by more than one file, and the cascade invariant is guard-pinned.
- The font chain has a single durable owner that survives system B's removal.
- Every colour a component can render is theme-varying — **including** the class-based status tones, whose
  owner is the dark compat layer and which must stay carved out and documented.
- Product code contains no raw hex and no arbitrary size / radius / shadow / z-index utilities, enforced in
  `.css` and token modules as well as `.ts`/`.tsx`.
- `tailwind.config.ts` is committed and drift-checked in CI, not generated.
- CI fails if a guard baseline regresses.

---

## Appendix A · File disposition

| File | Disposition | Note |
|---|---|---|
| `themes/registry.ts` | **Promote** | The single contract. Also owns `--background`/`--foreground`. |
| `themes/{light,dark,mono,slate,paper,ember,cyberpunk,forest}.ts` | Keep | Stay as TypeScript — no DTCG rewrite. |
| `tokens/colors/base.ts` | Demote | Primitives only — importable by `themes/*`, never components. |
| `tokens/colors/semantic.ts` | Delete | **Two** importers (`css-variables.ts`, `styles/tokens.ts`) + a `tokens/index.ts` re-export. |
| `tokens/css-variables.ts` | Delete | 310 emitted vars, 212 provably dead. `designSystemTokenStyleText` has zero importers. |
| `src/styles/tokens.ts` | Delete | **After** Step 2b — it is the sole declarer of the live font chain. |
| `src/styles/globals.css` `:root` | Reduce | Keep `--ds-wash-*`, `--cf-*`, the elevation ladder; **gains** the font chain in 2b. |
| `src/styles/globals.css` dark layer | **Carve out + document** | System E. Not reducible without breaking dark mode. |
| `src/app/globals.css` | Reduce | Drop `--background`/`--foreground` (:12–15). Keep `.font-dm-sans` — **live at 4 call sites**. |
| `tokens/{radii,shadows,borders}.ts` | Keep as TS | Consumers are TS (`elevationClass`), not CSS vars. |
| `tokens/spacing.mjs`, `z-index.mjs` | Keep | Already single-source. **`.mjs` only** — never import the `.ts` twins here. |
| `foundations/motion.ts` | Keep | Sole owner once the C2 duplicates are removed. |
| `components/StatusBadge.tsx` | Delete or repoint | 2 importers, 6 rendered statuses, no tests. |
| `tailwind.config.ts` | **Commit + drift-check** | Not generated. `themed()` and `role-*` preserved verbatim. |
| `src/app/layout.tsx` | Simplify | Two token `<style>` tags collapse to one (Step 4). |
