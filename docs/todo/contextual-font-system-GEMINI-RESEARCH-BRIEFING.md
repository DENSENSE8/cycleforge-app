# Research briefing — contextual typeface system for Kinetic Ledger (2026 SaaS ops)

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Deliverable:** (a) the 2026 industry standard for *multi-role / multi-context typeface systems* in dense B2B SaaS and warehouse/ops products, benchmarked against named systems with citations; (b) a reconciled, implementable **contextual font architecture** for *this* codebase — which faces to add (if any), which region/mode/role each face owns, how the token graph should split, and a phased migration that respects existing CI ratchets.

---

## 0. How to use this brief

You do **not** have the codebase. Everything needed is embedded here: the measured current type stack, the role scale already shipped, the region-contract vocabulary that governs every page, the dead/aspirational family slots, the weight-loading mismatch, the enforcement guards, and the hard product constraints.

Answer **three separate questions** — do not merge them:

1. **What is industry standard in 2026?** How do best-in-class dense B2B / ops / fintech / logistics SaaS products structure *typeface families* (not just sizes)? Named examples, cited sources. Cover: single-family systems vs. dual/triple pairings; when a second face earns its keep; variable-font vs. static cuts; contextual swapping by *surface* (dashboard vs. floor vs. studio) vs. by *role* (display vs. data vs. mono). Say what has *changed* since ~2022–2024 (Geist, Inter Display, optical sizes, “product sans + mono only” convergence) and what is hype vs. table stakes.
2. **What fonts (named faces) would make *this* product look proper industry-standard best-in-class SaaS 2026?** Propose a shortlist with rationale against Kinetic Ledger’s identity (below). Prefer faces that are: license-clear for SaaS (Google Fonts / OFL / SIL / commercial with clear web license), `next/font`-loadable or self-hostable, dense-data legible at 10–13px, and distinct enough from the marketing site (separate repo — do not design for marketing). Rank options; do not dump a catalog of 40 faces.
3. **What is right for *this* codebase?** Reconcile (1)+(2) against §2–§8. Where the standard conflicts with a constraint here, say so and pick a side with reasoning. A defended deviation beats a generic “use Inter + a display serif” answer.

Assume the reader is the engineer who will implement this over 1–3 weeks. Prefer concrete token maps, CSS variable trees, `next/font` load graphs, and migration phases over frameworks-for-thinking.

**Important framing correction — read before answering.** The originating product desire is: *“split the font design system to be more contextual / iterative for different pages and modes — add more fonts so different surfaces feel proper.”* The engineering scan that produced this brief found that:

- The **size/weight/tracking scale is already highly converged** (CF Type: 7 semantic roles, ~4,469 `text-role-*` call sites, density via `--cf-density`).
- The **typeface layer is deliberately collapsed to one sans + one mono** (IBM Plex), with three unused “slots” (`heading` / `display` / `label`) that currently alias to the same face.
- A prior migration (2026-07-18) **replaced DM Sans + Inter with IBM Plex Sans + Mono** specifically because Plex is Carbon-adjacent and reads better in dense ops rows.
- House law bans a **second visual language** beside Kinetic Ledger — adding fonts that fight the identity is worse than staying mono-family.

Treat “add more fonts” and “make type more contextual” as **two separable diagnoses**. Contextual typography can mean (A) more *roles/presets* on one family, (B) *optical / condensed / display* cuts of the same family, (C) *true multi-family pairing* scoped by region contract, or (D) *per-mode CSS variable swaps* without new faces. If you conclude the product desire is best served by (A)/(B) rather than (C), say so plainly — and still recommend the best multi-family option as an alternate path with blast-radius cost.

---

## 1. Product context

**Cycle Forge** is multi-tenant **reseller-operations SaaS** for used-goods resellers (electronics refurb/resale is the dogfood tenant). Operators move physical inventory through a pipeline: inbound carton → triage → unbox → test → repair → list → pack → ship, with returns and warranty loops. Surfaces run on **desktop browser, Electron desktop app, and mobile (`/m/*`)**, often 8–14 hours/day on 1080p–1440p monitors, sometimes standing at a barcode-scan bench.

The UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Stated bias: **legible throughput over document calm** — industry blend of ops density (Carbon / Stripe Dashboard) + Linear chrome discipline + POS/scan floors + Studio canvas. **“Better” means stronger within this family**, never a foreign kit.

**Marketing site is a separate repo.** Do not recommend marketing-hero display serifs or landing-page typography for the ops app. Sign-in / signup in *this* repo are still product chrome (CF Type roles), not a brand microsite.

Every UI region is classified into one of four **region contracts** (enforced house law). **Use this vocabulary in your answer:**

| Contract | Driven by | Job | Selection model | Density mode | Typographic job (hypothesized — validate or refute) |
|---|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` | Max legibility at arm’s length; big pass/fail; identifiers mono; minimal chrome |
| **Workbench** | pointer | pick → edit → persist | durable URL | `ops` | Dense rows/tables; calm hierarchy; IDs mono; eyebrows as quiet chrome |
| **Monitor** | filters over a stream | observe only | none (filters only) | `rollup` | KPI heroes; more air; display/title may carry more personality |
| **Canvas** | pan/zoom/focus | reshape a definition | durable focus in URL | `studio` | Spatial chrome; node labels small; inspector secondary |

Density modes map conceptually to layout feel (`floor` / `ops` / `rollup` / `studio`). A separate CSS density switch already exists: `--cf-density` (default `1`; `[data-density="compact"]` → `0.92`), scoped to data containers — **weight and tracking do not scale with density** (Carbon principle, already ratified).

---

## 2. Measured current state — typeface layer

### 2.1 What is actually loaded

| Face | Loader | CSS var on `<html>` | Weights loaded | Used as |
|---|---|---|---|---|
| **IBM Plex Sans** | `next/font/google` (`src/lib/fonts.ts`) | `--font-ibm-plex-sans` | **400, 500, 600, 700** only | Body + every sans utility |
| **IBM Plex Mono** | `next/font/google` | `--font-ibm-plex-mono` | **400, 500, 600** only | `font-mono` (~556 call sites): serials, tracking, SKUs, FNSKUs, chips |

`app/layout.tsx` stamps both CSS variables on `<html>` and applies `ibmPlexSans.className` on `<body>`.

History note (agent work-log, 2026-07-18): *“Switched Kinetic Ledger type SoT to IBM Plex Sans+Mono via next/font (replaced DM Sans/Inter Google import).”* Plex was a deliberate Carbon-adjacent choice for dense ops rows — not a default.

### 2.2 Token graph (SoT inventory)

| File | Role |
|---|---|
| `src/lib/fonts.ts` | `next/font` loaders only |
| `src/design-system/tokens/typography/families.ts` | Declared stacks: `sans`, `heading`, `display`, `label`, `mono` |
| `src/styles/globals.css` `:root` | Durable owner of `--font-sans`, `--font-mono`, `--ds-font-sans`, `--ds-font-mono` (rehomed in token consolidation Step 2b) |
| `tailwind.config.ts` `theme.extend.fontFamily` | Exposes **only** `font-sans` and `font-mono` utilities |
| `src/design-system/tokens/typography/presets.ts` | Composed class strings (`sectionLabel`, `fieldLabel`, `monoValue`, `tableHeader`, …) |
| `src/design-system/tokens/typography/sizes.ts` / `weights.ts` | Secondary scales (partially superseded by CF Type roles) |

### 2.3 The collapsed-family fact (critical)

`families.ts` declares five slots, but **heading / display / label are byte-identical to sans**:

```ts
sans:    var(--font-ibm-plex-sans), 'IBM Plex Sans', …
heading: var(--font-ibm-plex-sans), 'IBM Plex Sans', …  // same
display: var(--font-ibm-plex-sans), 'IBM Plex Sans', …  // same
label:   var(--font-ibm-plex-sans), 'IBM Plex Sans', …  // same — comment: "one family at dense sizes beats a geometric label fork"
mono:    var(--font-ibm-plex-mono), 'IBM Plex Mono', …
```

Measured consumers of `fontFamilies.heading|display|label`: **zero**. Tailwind has **no** `font-heading` / `font-display` utilities. The slots are **aspirational scaffolding**, not a live multi-family system.

### 2.4 Weight-loading mismatch (measured debt)

- Loaded weights top out at **700** (sans) / **600** (mono).
- Codebase still has **~538 `font-black` (900)** usages and some `font-extrabold` (800).
- CF Type roles bake weight **≤600** into the role utility; a codemod (`scripts/codemods/strip-font-black-small.mjs`) exists to strip `font-black` from `text-role-eyebrow` / `text-role-micro` lines.
- Consequence today: many “black” headings **synthesize** from 700 or fall back to browser faux-bold — inconsistent across platforms (Electron vs. Chrome vs. Safari).

Any font recommendation **must** specify exact weights to load, and whether `font-black` is retired, remapped, or backed by a real 800/900 cut.

---

## 3. Measured current state — CF Type role scale (already shipped)

This is **not** the problem to rebuild. Do not recommend replacing the role scale with a px scale.

Roles live in `tailwind.config.ts` as bundled utilities (`size + line-height + tracking + weight`), density-aware via `calc(… * var(--cf-density, 1))`:

| Role utility | Base size | Weight (baked) | Tracking | Intended job |
|---|---|---|---|---|
| `text-role-display` | 1.5rem (~24px) | 600 | −0.02em | rare page/hero titles |
| `text-role-title` | 1.125rem (~18px) | 600 | −0.01em | panel/section titles |
| `text-role-body` | 0.875rem (**14px**) | 400 | 0 | default reading |
| `text-role-data` | 0.8125rem (**13px**) | 500 | +0.01em | table cells, IDs, metrics (+ `tabular-nums` at call site) |
| `text-role-caption` | 0.75rem (12px) | 500 | +0.01em | secondary meta |
| `text-role-eyebrow` | 0.6875rem (11px) | 600 | +0.08em | section labels (uppercase at call site) |
| `text-role-micro` | 0.625rem (10px) | 600 | +0.04em | chips/badges floor |

Enforcement:

- `src/components/ui/typography-tokens.guard.test.ts` — bans raw `text-[Npx]` and retired legacy tokens (`text-mini|eyebrow|micro|caption|label`).
- `src/utils/_cn.ts` registers every `role-*` with `tailwind-merge` so roles survive conflict resolution.
- ~4,469 `text-role-*` usages across `src/`.

Prior research already synthesized into this scale (see internal plan `docs/search-and-dense-ui-refactor-plan.md` Part 2): Geist-style bundled roles, Carbon density-as-mode, Stripe “dense data / generous chrome,” Linear weight cap. **Your job is the typeface / family / contextual layer that sits *under* these roles — not a redo of the roles.**

---

## 4. Where type feels “the same everywhere” today (the complaint surface)

Measured patterns that make the product feel mono-voice across modes:

1. **One sans for everything** — Station floor CTAs, Workbench grid headers, Monitor KPI heroes, Canvas node labels, sign-in titles all share IBM Plex Sans.
2. **Personality is faked with weight + tracking**, not face — uppercase + `tracking-widest` + (often) `font-black` is the house “eyebrow” tic across regions.
3. **Monitor / rollup KPIs** use `text-2xl|3xl font-black tabular-nums` on the same sans — no display optical size.
4. **Station floor** wants arm’s-length legibility; type scale densifies via `--cf-density` / compact containers, but the *face* does not change.
5. **Studio canvas** node chrome is small sans; no distinct “authoring” voice.
6. **Auth / empty / onboarding** surfaces use the same CF Type roles — correct for product cohesion, but leaves no place for a slightly warmer “welcome” face without forking language.

The open design question: should contextuality come from **face**, **cut** (Display / Text / Condensed), **role preset packs per region**, or **feature-settings** (`cv##`, `ss##`, `tnum`)? Industry 2026 answer may prefer cuts + features over a third family — validate.

---

## 5. Hard constraints (non-negotiable)

Reconcile every recommendation against these. If you violate one, call it out explicitly.

| Constraint | Implication |
|---|---|
| **Kinetic Ledger one visual language** | No Inter-on-cream marketing look, no purple-glow SaaS cliché, no second design kit. New faces must read as *ops ledger*, not *startup landing*. |
| **Compose → grow SoT → never fork** | New families land in `families.ts` + CSS vars + Tailwind `fontFamily` + `next/font` — not page-local `@font-face` or one-off class strings. |
| **CF Type roles stay** | Do not reintroduce px tokens or retire `text-role-*`. Family may bind *to* roles (e.g. `role-display` → `font-display`). |
| **CI ratchets only shrink** | Typography / spacing / surface-box guards ratchet down. Recommendations that require raising a baseline are non-starters. |
| **Perf budgets** | Electron + mobile + warehouse Wi-Fi. Prefer ≤3 family files total (sans + mono + optional display), subset latin, swap display, consider variable font if it *reduces* request weight. Measure estimated KB. |
| **`next/font` only** (or self-host equivalent) | No runtime CSS `@import` from Google CDN in production. |
| **A11y** | `rem`-based roles already; keep 200% zoom. Effective size at compact density must stay ≥10px for `micro`. Prefer faces with clear distinction at 11–13px. |
| **Tabular nums for data** | ~405 `tabular-nums` call sites; mono + `tnum` on sans data roles are both in play. Prefer faces with real tabular figures. |
| **Print / labels** | Barcode/label builders and print paths exist; mono remains load-bearing for identifiers. Do not break print fallback stacks. |
| **Tenant themes** | Color themes via `data-theme` + registry. Fonts are **theme-independent** today (correct). Do not couple face to theme palette unless you defend multi-tenant white-label font injection (out of scope — flag as future, don’t design it now). |
| **Ask-first for shared primitive API** | Widening `fontFamily` for many call sites is Ask-first. Prefer additive utilities (`font-display`) + gradual adoption over big-bang rewrite. |
| **User manages commits; work stays on current lane** | Recommend phases an engineer can land iteratively. |

---

## 6. Industry peers to benchmark (minimum set)

Survey at least these — named patterns, not vibes. Cite primary sources (design systems, engineering blogs, type specimens) where possible:

| Product / system | Why it matters here |
|---|---|
| **IBM Carbon + IBM Plex** (Sans / Sans Condensed / Mono / Serif) | Current face family; how Carbon *actually* uses Condensed vs Sans vs Mono by component |
| **Vercel Geist** | Bundled type styles; mono-as-heading trick; rem-friendly |
| **Linear** | Weight cap, Inter feature-settings identity, calm-dense |
| **Stripe Dashboard / Stripe Apps style** | Dense data / generous chrome; progressive tracking |
| **Shopify Polaris / Horizon** | Commerce ops density; type pairing choices |
| **Salesforce Lightning / SLDS** | Enterprise density modes + type |
| **Atlassian ADS** | Multi-product type tokens |
| **GitHub Primer** | Product sans + mono discipline |
| **Retool / Airplane / internal-tools lineage** | Floor-adjacent dense builders |
| **Warehouse/WMS / POS** (e.g. modern ShipStation, Linnworks, or comparable seller-ops UIs — pick 2–3 with public screenshots or design notes) | Arm’s-length / scan-floor typography reality |
| **Figma UI3 / Relume / modern 2025–26 SaaS kits** | Only to identify *what to avoid* if it conflicts with Kinetic Ledger |

For each, extract: **how many families**, **when the second face appears**, **whether display is a separate family or an optical size**, **density strategy**, **mono policy**.

---

## 7. Decisions we need you to make (blocked questions)

Answer each with a firm recommendation + 2–3 sentence rationale. “It depends” without a pick is a failed answer.

### Q1 — Architecture: how should contextual type be structured?

Pick one primary architecture (and optionally a phased alternate):

| Option | Description |
|---|---|
| **A. Single family + optical cuts** | Stay IBM Plex (or one successor); add Plex Sans Condensed / Text Display / variable axes; bind cuts to roles/regions |
| **B. Dual family (sans + display)** | Keep Plex (or successor) for body/data; add a distinct display face for Monitor titles / auth heroes / empty states only |
| **C. Triple family (UI sans + display + mono)** | Classic SaaS pairing; mono stays Plex Mono or upgrade |
| **D. Region-scoped stacks** | CSS vars swap per `[data-region="station|workbench|monitor|canvas"]` — possibly different faces per contract |
| **E. Role-bound stacks only** | `text-role-display` always `font-display`; regions don’t swap faces; context = role usage discipline |

State blast radius (files, estimated call sites) and whether D is worth it given Station/Workbench often coexist on one page.

### Q2 — Keep IBM Plex, evolve Plex, or replace?

Given we already migrated *to* Plex for Carbon-adjacent dense rows: should we (a) keep Plex Sans+Mono and grow the Plex family, (b) replace sans only, (c) replace both, (d) keep Plex for data + introduce a different display? Name the winning faces with license + approximate latin woff2 KB for the weight set you prescribe.

### Q3 — Named shortlist for best-in-class 2026 Kinetic Ledger

Provide a ranked table:

| Rank | Face | Role in system | Why it fits Kinetic Ledger | Risk / why not |
|---|---|---|---|---|

Include at least: the recommended primary UI sans, primary mono, optional display, optional condensed/floor cut. Explicitly reject popular-but-wrong faces for this product (e.g. marketing serifs, overused Inter-only stacks, geometric display that muddies at 11px) with one-line reasons.

Candidate families to evaluate (not prescribe — judge them): IBM Plex family (Sans, Sans Condensed, Mono, Serif), Geist / Geist Mono, Inter / Inter Display, Source Sans 3 / Source Serif 4, IBM Plex’s competitors in the “industrial humanist” lane (e.g. Source Sans, Noto Sans, Atkinson Hyperlegible for a11y floor — accept or reject), JetBrains Mono / Commit Mono / iA Writer Mono for mono upgrade, Satoshi/General Sans/etc. as **likely reject** unless defended.

### Q4 — Binding map: face × role × region

Produce a binding matrix. Example shape (fill with your picks):

| Role | Station (`floor`) | Workbench (`ops`) | Monitor (`rollup`) | Canvas (`studio`) |
|---|---|---|---|---|
| display | ? | ? | ? | ? |
| title | ? | ? | ? | ? |
| body | ? | ? | ? | ? |
| data | ? | ? | ? | ? |
| caption | ? | ? | ? | ? |
| eyebrow | ? | ? | ? | ? |
| micro | ? | ? | ? | ? |
| mono identifiers | ? | ? | ? | ? |

Prefer **≤2 face swaps** visible on any one screen. If the matrix implies 4 faces on Station, simplify.

### Q5 — Token / CSS / Tailwind shape

Recommend the concrete SoT shape:

1. Which CSS variables (`--font-sans`, `--font-display`, `--font-condensed`, `--font-mono`, …)?
2. Which Tailwind `fontFamily` keys (`font-sans`, `font-display`, …)?
3. Do roles auto-bind family (via the role utility’s `fontFamily` field in `theme.fontSize`) or stay orthogonal (`text-role-title font-display`)?
4. How does `[data-density]` interact (it must **not** change family)?
5. Does `[data-region]` or a parent shell set family overrides? Show the CSS.
6. What happens to dead `heading`/`display`/`label` slots in `families.ts` — promote, rename, or delete?

### Q6 — Weight policy

Given ~538 `font-black` call sites and max loaded weight 700:

- Retire `font-black` entirely (map to 600/700)?
- Load 800/900 for real cuts?
- Cap at 600 house-wide (Linear-style) and codemod the rest?

Pick one; estimate migration cost.

### Q7 — Feature settings & numerals

Should we standardize a global `font-feature-settings` / `font-variant-numeric` policy for:

- `tabular-nums` on data roles (global vs. call-site)?
- `ss##` / `cv##` if the chosen face has ops-friendly alternates?
- `liga` off for identifiers?

### Q8 — Iterative rollout plan

Phase a plan that can land without a big-bang visual rewrite:

| Phase | Change | Exit criteria | Risk |
|---|---|---|---|---|

Must include: additive load (no delete of Plex until alternate proven), golden pages (suggest: one Station e.g. Unbox, one Workbench grid, one Monitor rollup, sign-in), screenshot/visual check, guard updates, knip/font dead-code, and a rollback switch (CSS var flip).

### Q9 — What *not* to do

List anti-patterns specific to this codebase (e.g. per-page `@font-face`, loading Inter “just because SaaS,” serif for “premium,” region-swapping faces that fight co-mounted Station+Workbench chrome, raising typography baselines, coupling fonts to `data-theme`).

---

## 8. Suggested deliverable outline (use this structure)

Please structure your answer as:

1. **Executive verdict** (≤10 lines) — architecture letter (A–E) + named faces + keep/replace Plex.
2. **Industry standard 2026** — survey with citations; convergent principles; what changed recently.
3. **Recommended type system for Cycle Forge** — families, weights, binding matrix (Q4), token graph (Q5).
4. **Rejected alternatives** — and why (relative to Kinetic Ledger).
5. **Weight + feature-settings policy** (Q6–Q7).
6. **Phased implementation plan** (Q8) with file-level touch list:
   - `src/lib/fonts.ts`
   - `src/design-system/tokens/typography/families.ts`
   - `src/styles/globals.css`
   - `tailwind.config.ts`
   - optional: role utilities binding `fontFamily`
   - golden page adopters
   - guards / codemods
7. **Perf & license appendix** — estimated KB, licenses, `next/font` snippet.
8. **Open questions for product** — only true Ask-first items (e.g. white-label tenant fonts).

---

## 9. Success criteria (how we will judge your answer)

Your answer is good if:

- An engineer can implement Phase 1 without further research.
- It respects CF Type roles and region contracts as load-bearing vocabulary.
- It distinguishes **contextual type** (cuts / bindings / presets) from **more fonts for their own sake**.
- Named faces are justified for *dense reseller-ops SaaS*, not generic “modern SaaS 2026.”
- Blast radius and rollback are explicit.
- It does not recommend rebuilding the role scale, inventing a second design language, or raising CI baselines.

Your answer is bad if:

- It says “use Inter + a nice display font” without reconciling the existing Plex migration and Kinetic Ledger laws.
- It proposes per-page fonts or theme-coupled faces.
- It ignores mono identifiers / tabular nums / Electron perf.
- It collapses Station and Monitor into one typographic recipe.

---

## 10. Optional stretch (if capacity)

- Specimen text block for each recommended face at `role-data` (13px) and `role-eyebrow` (11px uppercase) using warehouse copy: `SERIAL · FNSKU · TRACKING · CONDITION: USED LIKE NEW`.
- Whether **IBM Plex Sans Condensed** alone would satisfy the “contextual” desire without a second foundry.
- Whether a **variable font** (single file, `wght` + `wdth`) beats static cuts for this app’s Electron bundle.
- Comparison table: Cycle Forge today vs. Carbon vs. Geist vs. your proposal (families × roles × density).

---

## Appendix A — Copy-paste inventory (for citation in your answer)

```
Loaders:     src/lib/fonts.ts
Stacks:      src/design-system/tokens/typography/families.ts
CSS SoT:     src/styles/globals.css (:root --font-sans / --font-mono / --ds-font-*)
Tailwind:    tailwind.config.ts → fontFamily.{sans,mono} + fontSize.role-*
Presets:     src/design-system/tokens/typography/presets.ts
Guard:       src/components/ui/typography-tokens.guard.test.ts
cn merge:    src/utils/_cn.ts (CUSTOM_FONT_SIZES includes all role-*)
Density:     --cf-density ; [data-density='compact'] → 0.92
Layout:      src/app/layout.tsx (ibmPlexSans.variable + ibmPlexMono.variable on <html>)
Prior plan:  docs/search-and-dense-ui-refactor-plan.md §Part 2 (CF Type)
Identity:    AGENTS.md → Kinetic Ledger ; .claude/rules/contextual-display.md
```

## Appendix B — Usage census (approximate, 2026-07-28)

| Signal | Count |
|---|---|
| `text-role-*` class usages | ~4,469 |
| `font-mono` usages | ~556 |
| `font-black` usages | ~538 |
| `tabular-nums` usages | ~405 |
| Files touching `font-sans` or `font-mono` | ~280 |
| Live Tailwind font families | **2** (`sans`, `mono`) |
| Declared-but-unused family slots | **3** (`heading`, `display`, `label`) |
| Sans weights loaded | 400–700 |
| Mono weights loaded | 400–600 |

## Appendix C — Kinetic Ledger five laws (do not violate)

1. Facts and state drive chrome — chrome never invents a second story.
2. Archetypes are region contracts (I/O + persistence), not layout skins.
3. Data shape chooses the primary surface.
4. Presentation kinds resolve via SoT — views stay dumb.
5. Compose named shells / blocks; grow the SoT when wrong; compound every UI task.

Typography is a presentation SoT. Growing it (new family tokens, role→family bindings) is **Allowed / Always**. Forking a page-local second type system is **Never**.
