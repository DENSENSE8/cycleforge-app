# Cycle Forge — Search Consolidation + Best‑in‑Class Dense‑UI Typography Refactor

> Research task (industry‑standard first). This document deliberately reasons from **outside** the
> current house rules (`AGENTS.md` / Kinetic Ledger) and benchmarks against Linear, Stripe, Vercel
> Geist, and IBM Carbon, then maps the findings back onto this codebase. Where the recommendation
> diverges from today's rules, that is called out explicitly — adopt via the phased rollout, don't
> big‑bang.

---

## 0. TL;DR

Two intertwined problems, one philosophy: **one surface per job, one token per decision.**

1. **Search is duplicating the order display.** `/search` grew a parallel order‑detail path
   (`SearchWorkspace` detail pane, then a `SearchResultsSidebar`) that re‑implements what `/o/[orderId]`
   already does with `OrderFullPageView` + `OrderWorkspaceSidebar`. **Fix: delete the parallel search
   UI and route order lookup through the existing `/o` workspace.** Net components created should be
   **negative**.

2. **Typography is px‑soup, not a system.** Five custom sub‑12px tokens
   (`mini/eyebrow/micro/caption/label`) + raw Tailwind (`text-sm/base`) + a long tail of arbitrary
   `text-[13px]`‑style utilities (guard‑ratcheted, so we know it's debt). There is no *semantic role*
   scale, no density mode, no `rem`/zoom story. **Fix: a bundled, `rem`‑based, role‑named type scale
   with 2 density modes**, modeled on Geist/Carbon, migrated behind the existing ratchet guards.

Both are the same disease: **parallel implementations of one concept.** The cure is consolidation.

---

## Part 1 — Search simplification: reuse `/o`, delete the duplicate

### 1.1 What exists today (the accidental fork)

| Concern | Order workspace (`/o`) | Search (`/search`) |
|---|---|---|
| Detail display | `OrderFullPageView` (`layout="workbench"`) | **duplicated** — same component, but was crammed into a half‑width pane |
| Sidebar (map) | `OrderWorkspaceSidebar` — Recent + **Search** modes, order near‑matches, `SidebarShell` | **duplicated** — `SearchResultsSidebar` (new), re‑wires retrieval + rail |
| Selection SoT | path `/o/[id]` | `?openOrderId=` |
| Retrieval | `useAiQuickJump(entityTypes:['ORDER'])` | `SearchResultsSurface` → `/api/ai/retrieve` |

`OrderWorkspaceSidebar` **already is** a rep order‑lookup sidebar: it has a Search mode that lists
order near‑matches (`AiQuickJumpResults`) and navigates to `/o/[id]`. `/o/[orderId]` **already** renders
the full order display. The rep workbench the plan wanted **already shipped as `/o`.** `/search` should
not own a second copy.

### 1.2 Target: one order surface, search is an entry into it

**Principle:** `/o` is the single order display+logic surface (master `OrderWorkspaceSidebar` + detail
`OrderFullPageView`). Every path to "look at an order" — dashboard slide‑over, cmd‑K, `/search`, a
tracking scan — resolves to **that** surface. Search is a *retrieval entry point*, never a second
renderer.

Concrete moves (each is a deletion or a redirect, not a new component):

1. **Delete `SearchResultsSidebar`** and its `SidebarContextPanel` wiring + the `search` route‑key
   sidebar branch. (Keep the `search` route key only if `/search` survives as the cross‑entity
   overview — see step 4.)
2. **Order lookup deep‑links to `/o`.** The global header search, when the top match is an order (the
   dominant rep case), routes to `/o/[id]?mode=search&q=…`. The rep lands on the real order page with
   the order near‑match rail already populated. Zero new UI.
3. **`OrderFullPageView` renders full‑width, always.** Never nest it beside an in‑content rail again
   (that was the "cramped" screenshot). The *app sidebar* is the only map.
4. **Decide `/search`'s remaining job — cross‑entity overview only.** Orders are handled by `/o`.
   `/search` keeps its value only for *non‑order* entities (units, SKUs, receiving, repairs, FBA) as a
   grouped launcher whose rows deep‑link to each entity's own surface. If product doesn't need a
   cross‑entity launcher, **`/search` can be deleted entirely** and the header pill's "see all" simply
   scopes into `/o` (orders) or the relevant surface. Recommended: keep `/search` as a thin
   grouped launcher, no detail pane.

**Result:** the "search shows the best match with full detail + similar in a sidebar" experience is
delivered entirely by `/o` — the exact thing you asked for — with **fewer** components than today.

### 1.3 Why this is the correct simplification (industry pattern)

This is the **master‑detail / primary‑detail** pattern (PatternFly, Oracle Alta, Finastra): a single
detail surface driven by a single list; the list controls the detail; you never maintain two detail
renderers. The mistake we made — a detail pane *inside* the results page **and** a full page at `/o` —
is the anti‑pattern those guides warn against (two sources of truth for "the selected record").

---

## Part 2 — Best‑in‑class dense typography & density system

### 2.1 What the leaders actually do (research synthesis)

| System | Base body | Weights | Density strategy | Signature move |
|---|---|---|---|---|
| **Vercel Geist** | **14px** | limited | bundled type *styles* (size+line‑height+tracking+weight in one class) | 15 named styles; mono for headings; `rem`‑friendly |
| **Linear** | 16px | capped ≈590 (no 700+) | calm‑dense; tight tracking at display | Inter feature‑settings identity; negative letter‑spacing ≥48px |
| **Stripe** | 16px body | 6 sizes | **"dense data, generous chrome"** | data tight, UI chrome roomy; progressive tracking; weight 300 at display |
| **IBM Carbon** | 14px (Plex) | tokenized | **5 row densities** (xl/lg/md/sm/xs); condensed components | density scales with row height + toolbar height together |

**Convergent principles (the rules to steal):**

1. **Bundle type into semantic *roles*, not raw px.** A role = `{ font-size, line-height,
   letter-spacing, weight }` as one token/class (Geist, Carbon). Consumers pick a *role*
   ("`text-body`", "`text-data`", "`text-eyebrow`"), never a pixel.
2. **Small is fine for data if the *scale* is disciplined.** 13–14px body is industry‑standard for
   dense ops tools. But: **≤ 4 sizes, ≤ 3 weights on a screen; ≥ 2px between adjacent sizes**
   (Datafloq/Yellowfin). Our current 8/9/10/11/12 stack violates the 2px rule at the bottom and has no
   role semantics.
3. **Density is a *mode*, not a font size.** Carbon changes *row height + padding + toolbar* together,
   keeping the type scale constant. Density ≠ shrinking text.
4. **Dense data, generous chrome (Stripe).** Pack the *table/facts*; keep *chrome* (headers, section
   gaps, empty states) breathing. Uniform tightness reads as cramped; uniform air reads as a toy.
5. **Progressive tracking + tabular numerals.** Tighten letter‑spacing as size grows; loosen
   ~+0.2px below 14px; use `font-variant-numeric: tabular-nums` for all data/IDs (already partially
   done via `tabular-nums`).
6. **Cap weights.** Linear/Geist avoid 700+. Use 400/500/600 (+ optional 650) — heavy black
   (`font-black`) at 8–9px is a house tic that reads as noise, not hierarchy.
7. **Accessibility is non‑negotiable (Stephanie Walter, WCAG 2.1):** use **`rem`**, support **200%
   zoom** without overlap, and prefer **progressive disclosure over shrinking**. "Reduce font size to
   fit more" is the lazy path; the real fix is information architecture.

### 2.2 Current‑state audit (this codebase)

- **Scale:** `mini 8 / eyebrow 9 / micro 10 / caption 11 / label 12` (px, `lineHeight` bundled) +
  Tailwind `sm 14 / base 16 / lg 18 / xl 20 …`. **No 13px role**, no role semantics, px‑based (not
  `rem`), sub‑12px steps are 1px apart (8→9→10→11→12) — below the 2px legibility guidance.
- **Weight tic:** `font-black uppercase tracking-widest` at 8–9px is used *pervasively* for eyebrows.
  It's an identity, but at that size black weight muddies more than it ranks.
- **Debt tail:** arbitrary `text-[13px]`/`text-[10.5px]` utilities exist and are ratcheted by
  `typography` guards → confirmed unmanaged sizes.
- **No density mode:** `floor/ops/rollup/studio` densities exist *conceptually* in docs but are not a
  typographic/`rem` system — they're prose, not tokens.

### 2.3 Target system — "CF Type" (role‑bundled, `rem`, 2 densities)

**A. Root sizing (accessibility spine).** Set `html { font-size: 100% }` (16px user‑respecting) and
express every role in **`rem`**. A single density variable scales the *whole* system:

```css
:root            { --cf-density: 1;     } /* comfortable */
[data-density="compact"] { --cf-density: 0.92; } /* ops floor: ~8% tighter, still ≥12px effective */
```

Roles compute as `calc(<rem> * var(--cf-density))` for size + padding; **weights and letter‑spacing
do not change with density** (Carbon principle).

**B. The role scale (7 roles — one job each).** Bundled like Geist; `rem` base 16.

| Role | Size (rem / ~px) | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 1.5rem / 24 | 600 | −0.02em | page/hero titles (rare) |
| `title` | 1.125rem / 18 | 600 | −0.01em | panel/section titles |
| `body` | 0.875rem / **14** | 400/500 | 0 | default reading text |
| `data` | 0.8125rem / **13** | 500, `tabular-nums` | 0 | table cells, IDs, metrics |
| `caption` | 0.75rem / 12 | 500 | 0 | secondary meta |
| `eyebrow` | 0.6875rem / 11 | 600 (**not** 900) `uppercase` | +0.08em | section labels |
| `micro` | 0.625rem / 10 | 600 | +0.04em | chips/badges only |

Notes vs. today: **13px `data` role added** (the missing ops workhorse), **8/9px retired** for general
text (kept only as `micro` chip minimum at 10px), **weights capped at 600**, `eyebrow` drops from black
to 600 (Linear/Geist‑style calm). Adjacent sizes now respect the ≥1–2px rule (24/18/14/13/12/11/10).

**C. Density modes (Carbon‑style, type‑constant).** Density changes **row height, vertical padding,
and gaps** — not the role sizes. Two modes ship; map the doc's four densities onto them:

| Mode | `data-density` | Row height | Cell py | Section gap | Maps to |
|---|---|---|---|---|---|
| Comfortable | *(default)* | 40px | 8px | 24px | `rollup`, `studio` |
| Compact | `compact` | 28px | 4px | 12px | `ops`, `floor` |

**D. Dense data, generous chrome (Stripe).** Compact mode tightens *rows/tables/fact‑stacks* only.
Page chrome (headers, empty states, section headers, primary CTAs) keeps comfortable spacing in both
modes. Encode this by scoping the density var to data containers, not the page shell.

**E. Numerals + rendering.** Global `font-variant-numeric: tabular-nums` on `.cf-data`; enable the
font's small‑size features (if DM Sans/Inter: `cv01`/`ss03`‑style where available); `+0.01em` tracking
on `data`/`caption` for crispness at 12–13px.

### 2.4 Component targets (where the scale earns its keep)

- **Search / order rows (`AiQuickJumpResults`):** `data` role for the ID line, `body` 500 for title,
  `micro` chips for status. One row anatomy, compact density → 28px rows. This alone fixes the
  "results feel heavy" problem without shrinking below 13px.
- **`OrderFullPageView` fact stacks:** labels `eyebrow` (11/600), values `data` (13/500 tabular).
  Today's `text-[10px] font-black uppercase` labels → `eyebrow` role.
- **Tables (`DashboardShippedTable`, `UnshippedTable`):** compact density = 28px rows, `data` cells,
  sticky `eyebrow` headers. This is the biggest legibility+density win.
- **Sidebars:** `SidebarShell` rows adopt `data`/`caption`; kill per‑component `text-[Npx]`.

### 2.5 Migration & guardrails (don't big‑bang)

1. **Add roles as Tailwind component classes** (`text-role-body`, …) bundling size+leading+tracking+
   weight — additive, zero visual change until adopted.
2. **Add the density var + `data-density` switch** at the region shell (Station/ops → `compact`).
3. **Codemod the safe wins:** `text-[13px]` → `text-role-data`, `text-[10px] font-black uppercase` →
   `text-role-eyebrow`. The existing `typography` ratchet guard *measures* progress (arbitrary‑px count
   must fall). Flip it from "shrink‑only" to a burn‑down target.
4. **Retire `font-black`** at ≤11px via a new guard (grep `font-black` paired with `text-mini|eyebrow`)
   → warn, then ratchet to zero.
5. **Golden‑page first:** convert `/o` (order page) + `/search` rows as the reference, screenshot
   diff, then fan out table‑by‑table.
6. **Accessibility gates:** add a test that the app is usable at **200% browser zoom** (no clipped
   rows) and that no role resolves below **10px effective** at `compact`.

### 2.6 Explicit divergences from current house rules

| House rule today | This plan | Why |
|---|---|---|
| `eyebrow` = `font-black` (900) uppercase | `eyebrow` = 600 | 900 at 9–11px muddies; Linear/Geist cap weight |
| `mini` 8px / `eyebrow` 9px for text | retire for text; 10px chip floor | 8–9px fails 2px‑step + zoom/a11y |
| px‑based `fontSize` tokens | `rem` + density var | 200% zoom, user font‑size respect (WCAG) |
| Density = prose (`floor/ops/…`) | Density = `data-density` var (row/padding, type‑constant) | Carbon: density ≠ shrink text |
| Raw `text-sm`/`text-[13px]` mixed | 7 semantic roles only | ≤4 sizes/screen; role semantics |

These are proposals to **adopt through the phases**, not a mandate to rewrite `AGENTS.md` today.

---

## Part 3 — Sequenced rollout

| Phase | Scope | Exit criteria |
|---|---|---|
| **S0** | Search consolidation: delete `SearchResultsSidebar`; order lookup → `/o`; `OrderFullPageView` full‑width; decide `/search` fate | one order surface; net components ≤ before |
| **T1** | Ship `CF Type` roles (7) + density var as additive Tailwind classes; convert `/o` + search rows (golden pages) | golden pages on roles; screenshot‑diffed |
| **T2** | Tables to `data` role + `compact` 28px rows (`DashboardShippedTable`, `UnshippedTable`, receiving) | tables legible at 13px, 200% zoom passes |
| **T3** | Codemod arbitrary `text-[Npx]` → roles; retire `font-black ≤11px`; flip ratchets to burn‑down‑to‑zero | arbitrary‑px count → 0; weight guard green |
| **T4** | Fact‑stacks / sidebars / chips adopt roles; remove `mini`/`eyebrow` px tokens | 5 legacy px tokens deleted |

**Measurement:** arbitrary‑`text-[px]` count (down), distinct font sizes per route (≤4), distinct
weights per route (≤3), 200%‑zoom smoke test (green), and a manual "6ft bench legibility" check on
Station.

---

## Part 4 — Answering "how do I simplify this?"

The simplification is a subtraction, in priority order:

1. **Stop rendering orders in two places.** `/o` (+`OrderFullPageView`+`OrderWorkspaceSidebar`) is the
   only order display. Search *routes into* it. Delete the search‑local detail pane and sidebar.
2. **Stop choosing pixels.** Introduce 7 semantic roles; every component picks a role, never a px.
3. **Make density a switch, not a shrink.** One `data-density` var; ops/floor regions opt into
   `compact`; the type scale never changes to "fit more."
4. **Let guards do the enforcing.** The typography/weight ratchets already exist — point them at the
   burn‑down and the system converges on its own.

The through‑line: **one surface per job, one token per decision, density as a mode.** That is what
makes Linear/Stripe/Geist/Carbon feel "best‑in‑class dense" — not smaller fonts, but *fewer, more
disciplined* decisions.

---

## Sources

- [Vercel Geist — Typography](https://vercel.com/geist/typography) · [Geist breakdown (DesignSystems.one)](https://www.designsystems.one/design-systems/vercel-geist)
- [Linear design system (Refero)](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1)
- [Behind the Gradient: Design at Stripe](https://uwux.medium.com/behind-the-gradient-design-at-stripe-476dcf61a51a) · [Stripe style (docs)](https://docs.stripe.com/stripe-apps/style)
- [IBM Carbon — Data table style/usage](https://carbondesignsystem.com/components/data-table/usage/) · [Carbon condensed components #6202](https://github.com/carbon-design-system/carbon/issues/6202) · [Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/)
- [Typography Basics for Data Dashboards (Datafloq)](https://datafloq.com/typography-basics-for-data-dashboards/) · [Yellowfin BI — Language, Fonts & Typography](https://www.yellowfinbi.com/best-practice-guide/dashboard-design-principles-and-best-practice/language-fonts-and-typography)
- [Designing for Data Density (Paul Wallas)](https://paulwallas.medium.com/designing-for-data-density-what-most-ui-tutorials-wont-teach-you-091b3e9b51f4) · [Best fonts for dense dashboards](https://fontalternatives.com/blog/best-fonts-dense-dashboards/)
- [Stéphanie Walter — Minimum font size for high‑density data web apps](https://stephaniewalter.design/blog/what-minimum-font-size-for-a-high-density-data-web-app-do-you-suggest/) · [Accessible Font Sizing (CSS‑Tricks)](https://css-tricks.com/accessible-font-sizing-explained/)
- [PatternFly — Primary‑detail](https://www.patternfly.org/patterns/primary-detail/design-guidelines/) · [Oracle Alta — Master‑Detail](https://www.oracle.com/webfolder/ux/middleware/alta/patterns/masterdetail.html) · [Finastra — Master/detail](https://design.fusionfabric.cloud/patterns/master-detail)
