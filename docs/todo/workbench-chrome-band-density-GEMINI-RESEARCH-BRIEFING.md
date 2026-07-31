# Research briefing — Workbench chrome `density="band"` vs 2026 segmented-control practice

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject:** Unbox-pilot workbench lifecycle chrome — a proposed SoT density
(`WorkbenchChromeHeader density="band"` + `TabSwitch size="sm"` +
`WORKBENCH_CHROME_BESIDE_SCAN`) that must be validated against industry UI/UX
standards **before** locking it as house law and cascading beyond Unbox.
**Status:** Unbox pilot code is live in the working tree (not yet treated as
final SoT). Cascade to Incoming / Triage / Testing / Outbound is explicitly
deferred. This brief exists to pressure-test the *visual contract* and *API
shape* before we encode it harder in `.claude/rules/display/workbench.md` and
grow consumers.

**Companion / do not conflate:**

| Prior brief / plan | Question already scoped |
|---|---|
| [`chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md`](./chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md) | House-wide chrome consolidation *method* (KPI, tabs, identity, saved views) |
| [`chrome-sot-compound-PLAN.md`](./chrome-sot-compound-PLAN.md) | Phase B says lifecycle tabs → `WorkbenchChromeHeader` — does not prescribe band density |
| [`incoming-chrome-display-HANDOFF.md`](./incoming-chrome-display-HANDOFF.md) | Incoming Sources tabs on **default** hug density (taller card) |

This brief is only: **given Unbox sits beside a 40px station scan band, what is
the correct workbench tab chrome contract — and is our pilot industry-defensible
enough to lock?**

**Deliverable:** (a) a benchmark of 2025–2026 segmented controls / filter bars /
workspace headers in named products (Linear, Notion, Stripe Dashboard, Carbon,
Polaris, Material 3, Radix Themes, Atlassian, Figma, warehouse/WMS ops UIs);
(b) a defended verdict on each decision in §6; (c) answers to §7 with sources;
(d) a concrete “what would change before SoT lock” list an engineer can apply
to `workbench-shell.tsx`, `TabSwitch.tsx`, and `display/workbench.md`.

---

## 0. How to use this brief

You do **not** have the codebase. Every geometry fact below was measured from
source on 2026-07-30. Where something is inferred, it is labeled
**(inferred — verify)**.

Three deliverables, kept separate:

1. **What is industry standard (2026)** for (a) segmented controls / lifecycle
   tabs in dense B2B ops chrome, (b) aligning a workspace header with an adjacent
   40px input/scan band, (c) nested elevation (card-in-card) vs single-surface
   selection, (d) corner-radius relationships between shell and active indicator,
   (e) icon+label tabs vs text-only, (f) when a density variant belongs on a
   shared SoT vs a page-local fork. Name real products and design systems. State
   conditions under which each pattern wins — do not retreat into “it depends.”
2. **Take a side on each decision in §6.** Each states our pilot’s current
   approach, the strongest counter-argument, and a concrete measurement that
   already exists in product.
3. **Answer §7** with sources. Prefer a lock / revise / kill recommendation an
   engineer can paste — not a framework-for-thinking.

**Brand constraint you must honor (not optional):** Cycle Forge’s product UI
identity is **Kinetic Ledger** — dense, state-colored, scan-aware; *legible
throughput* over document calm; **calm chrome (Linear discipline), not Notion
document whitespace as the product shape.** Explicit bans: random card soup,
nested cards-as-rows, a second visual language. If a recommendation would make
Unbox look like a marketing Notion page or a glowing AI dashboard, reject it and
say why.

---

## 1. Product vocabulary (use these words in the answer)

**Cycle Forge** — multi-tenant reseller-operations SaaS. USAV is dogfood only.
Operators work **stations** (scan benches) and **workbenches** (pointer CRUD)
in one session.

**Region contracts** (house law):

| Contract | Driven by | Job | Density |
|---|---|---|---|
| **Station** | barcode / wedge | act-and-clear | `floor` |
| **Workbench** | pointer | pick → edit → persist | `ops` |
| **Monitor** | filters | observe only | `rollup` |
| **Canvas** | pan/zoom | reshape a definition | `studio` |

**Unbox** is a hybrid: left context panel = Station scan dock; right main pane =
Workbench table (Queue · Viewed · History). The chrome under review is the
**right-pane lifecycle strip**, which must share a horizontal row with the left
**40px scan band**.

**Named SoTs already in play:**

| Concern | Module |
|---|---|
| Workbench chrome shell | `WorkbenchChromeHeader` in `src/components/dashboard/workbench-shell.tsx` |
| Segmented control | `TabSwitch` in `src/design-system/components/TabSwitch.tsx` |
| Scan band height | `receivingScanBandClass` → `h-[40px]` in `header-shell.ts` |
| Scan input | `STATION_SCAN_BAR_INPUT_CLASS` → `h-10 text-xs font-semibold` |
| Context panel gutter | `CONTEXT_PANEL_OUTER_MARGIN` = `m-2` (8px) |
| Corner roles | `cornerClass('card')` = `rounded-2xl` in `radius.ts` |
| Pattern law | compose → grow SoT → never fork (`pattern-evolution.md`) |

---

## 2. The research question

> When a Workbench lifecycle tab strip sits **beside** a Station scan band,
> what is the industry-defensible chrome contract for height, nesting, radius,
> type, icons, and SoT API — and does Cycle Forge’s Unbox pilot match it closely
> enough to **lock as `density="band"`** and cascade?

Sub-questions (answer all):

1. Should the tab strip **match the scan band’s 40px face**, or is a taller
   “breathing” header (44–48px+) preferred when the adjacent control is a flat
   scan input?
2. Is **single-surface selection** (one raised shell; active indicator fills
   height; no nested rail card) the 2026 default for Linear-class products, or
   is a nested pill-in-track still considered correct?
3. Should the active indicator’s **corner radius equal the shell** (`card` /
   16px) or follow concentric nesting (`nestedCorner`) or stay `pill` /
   `rounded-full`?
4. Are **leading icons on lifecycle tabs** (Queue / Viewed / History) standard
   for ops density, or noise that belongs only on icon-only rails?
5. Is a **named density prop on the shared SoT** (`density="band" | "default"`)
   better governance than forking `UnboxChromeHeader`, or than making band the
   new house default for *all* `WorkbenchChromeHeader` consumers?

---

## 3. What the Unbox pilot ships today (grounded — measured 2026-07-30)

### 3.1 Layout stack under GlobalHeader

```
GlobalHeader · TOP_CHROME_BAND_FACE = h-[40px]
└── ContextPanelLayout
    ├── LEFT  CONTEXT_PANEL_COLUMN (m-2 card)
    │         └── UnboxScanBand → receivingScanBandClass h-[40px]
    └── RIGHT UnboxWorkspaceView
              └── DashboardScrollShell chrome
                  └── WORKBENCH_CHROME_BESIDE_SCAN (= gutters + py-2)
                      └── WorkbenchChromeHeader density="band" · h-10
                          └── TabSwitch size="sm" · flat full-height rail
```

**Y alignment:** left scan face top = panel `m-2` (8px). Right chrome face top =
`WORKBENCH_CHROME_BESIDE_SCAN` `py-2` (8px). Deliberate twin — earlier `py-0`
flushed the tabs above the scan band and was reverted.

### 3.2 Band visual contract (pilot)

| Layer | Classes / behavior |
|---|---|
| Outer shell | `h-10` · `px-0 py-0` · `cornerClass('card')` · border · `shadow-sm` |
| Tab rail | **Flat** — `border-0 bg-transparent p-0 shadow-none` (no nested card) |
| Active indicator | Sliding solid accent pill · `top:0 bottom:0` · same `cornerClass('card')` |
| Tab buttons | `h-full px-2.5 text-xs leading-none` · leading icons (`Inbox` / `List` / `History`) |
| Right cluster | Unchanged `ToolbarButton` `h-8` icons (search / staff / filter / calendar / Fields) |
| Consumers of `density="band"` | **Only** `UnboxWorkspaceHeader` today |

### 3.3 Default density (unchanged — Incoming etc.)

`WorkbenchChromeHeader` default remains content-driven: outer `p-1.5`, TabSwitch
solid hug with **its own** bordered/shadowed rail, `px-3 py-2 text-role-caption`.
Incoming Sources (All / Zoho / eBay) still use this taller recipe.

### 3.4 Iteration history that motivated this brief (symptoms, not lore)

Operators / design review observed, in order:

1. Tabs taller than the scan band → shrink toward 40px.
2. After shrink, tabs felt **height-cramped** → diagnosed as **nested elevation**
   (outer card + inner rail), not “needs more px.”
3. Flattened rail → single surface; restored tab pad.
4. Active green pill still left white air above/below → stretch to full shell
   height (`py-0`, `items-stretch`, `h-full` tabs).
5. Active pill used `rounded-full` while shell used `rounded-2xl` → radius
   mismatch; pilot now matches `cornerClass('card')` on both.

**Open risk before lock:** the pilot may still be oscillating (height vs breath
vs radius) without an industry-backed stopping rule. Your job is to supply that
stopping rule.

---

## 4. What we believe we are copying (state as hypotheses to verify)

| Claim | Our belief | Verify against |
|---|---|---|
| H1 | Linear’s workspace tabs / filters are **single-surface**; selection is a filled segment inside one quiet bar, not a pill nested in a second card | Linear web app + public design writing |
| H2 | Notion’s top chrome is **document-calm** (more air, weaker ops density) and is the **wrong** north star for a scan-adjacent floor workbench | Notion + Kinetic Ledger law |
| H3 | Matching adjacent chrome to a **shared 40px / 32–40px control grid** is standard in dense products (Stripe Dashboard, Carbon, Polaris header/toolbars) | Named systems’ height tokens |
| H4 | Nested segmented controls (track + thumb) remain correct for **standalone** filters; they become wrong when the track is itself already a raised card | Radix / shadcn Toggle Group vs Linear |
| H5 | Concentric radius (`inner = outer − pad`) is correct when pad > 0; when selection is **flush full-height**, equal radius to the shell is correct | Material 3 shape, Apple HIG, our `nestedCorner` |
| H6 | Icon+label on 3–5 lifecycle tabs is acceptable in ops UIs; icon-only is for rails with ≥5 modes or narrow viewports | Carbon / Polaris / Atlassian |
| H7 | A SoT density variant beats a page-local twin when ≥2 surfaces will share the scan-adjacent geometry (Unbox now; Triage/Testing likely next) | Design-system governance practice |

---

## 5. Constraints that make generic “admin DS” advice fail here

1. **Hands-busy station adjacency.** The left chrome is a barcode scan band.
   Pointer-only admin headers (tall titles, breadcrumb stacks) are a poor fit.
2. **Hybrid region.** Same viewport hosts Station I/O and Workbench CRUD. Chrome
   must not look like two unrelated products glued together.
3. **AI agent governance.** Whatever you recommend must be expressible as one
   paragraph of law + a prop on an existing SoT — not a new page-local component
   an agent will fork again next week.
4. **Ratchet culture.** We will not raise DS baselines to pass. If industry says
   “use two nested cards,” we need an exceptional domain defense, not vibes.

---

## 6. Decisions to pressure-test (take a side on each)

### D1 — Face height: lock `h-10` / 40px to the scan band

**Pilot:** Outer chrome face = `h-10`, same grid as `receivingScanBandClass`.

**Strongest counter:** Linear/Notion give tabs more vertical air; 40px with
icons + label feels cramped even on a flat rail.

**Ask:** Is matching the adjacent scan band’s height an industry win for
**hybrid station+workbench** layouts, or should the workbench chrome be allowed
to be 4–8px taller while keeping only the **row gutter** (`py-2` ↔ `m-2`)
aligned?

### D2 — Single-surface (no nested TabSwitch card) under `density="band"`

**Pilot:** Flat rail; one raised shell; kinetic-ledger ban on nested cards.

**Strongest counter:** Classic segmented controls (iOS, Material, many
dashboards) *are* a track + thumb; flattening removes affordance.

**Ask:** For a lifecycle strip that already lives inside a raised workbench
chrome card, is nested track elevation an anti-pattern in 2026 Linear-class
products?

### D3 — Active indicator fills full shell height (`py-0`)

**Pilot:** Selection is flush top/bottom with the outer face.

**Strongest counter:** A 1–2px inset around the active segment reads more
“premium” / less like a filled button colliding with the border.

**Ask:** Prefer flush fill, 2px inset (`p-0.5` + concentric radius), or
something else — cite products that look award-winning *and* dense.

### D4 — Corner radius: shell and selection both `cornerClass('card')`

**Pilot:** Both use `rounded-2xl`; horizontal pad removed so edge tabs can share
shell corners.

**Strongest counter:** Flush full-height selection with equal large radius can
look like a second card clipped inside the first; `nestedCorner` or `control`
radius on the indicator may read cleaner when not edge-aligned.

**Ask:** For full-height segments inside a `card`-radius shell, what radius
relationship do mature systems use?

### D5 — Type: `text-xs font-semibold` to match scan input

**Pilot:** Band tabs use `text-xs leading-none` to echo
`STATION_SCAN_BAR_INPUT_CLASS`.

**Strongest counter:** Tabs are navigation, not an input; `text-role-caption`
(12px / medium) may be the house nav token; matching the scan field conflates
two roles.

**Ask:** Should adjacent chrome share **type size**, or only **height grid**,
with type staying role-based?

### D6 — Leading icons on Queue / Viewed / History

**Pilot:** `Inbox` / `List` / `History` at `h-3.5`.

**Strongest counter:** Three labeled tabs don’t need icons; icons add noise and
weak metaphors (especially Viewed → List).

**Ask:** Keep icons, drop them, or icons-only on narrow breakpoints?

### D7 — SoT API: opt-in `density="band"` vs make band the default vs Unbox-only fork

**Pilot:** Grow `WorkbenchChromeHeader` + `TabSwitch` with opt-in density/size;
Unbox only; cascade later.

**Strongest counter:** One density forever (Incoming’s taller hug) is simpler;
or Unbox should stay local until three consumers prove the pattern.

**Ask:** Given pattern-evolution law and chrome-SoT Phase B, which governance
shape should we lock?

### D8 — Cascade scope after lock

**Pilot intent:** Triage (same scan dock) next; Incoming stays default until
asked.

**Ask:** Which surfaces *must* share band density if Unbox locks, and which
should keep default even if they use `WorkbenchChromeHeader`?

---

## 7. Open questions (answer with sources)

1. **Stopping rule.** What visual checks mean “done” for a segmented control
   beside a 40px scan input? (List 5 falsifiable checks.)
2. **Award-winning ≠ taller.** Industry examples of dense, calm, high-craft
   chrome that stay on a tight vertical grid (≤40px) without feeling cramped.
3. **Accessibility.** Full-height active segments, `text-xs`, and icon+label:
   WCAG / APG guidance for tabs vs toolbars vs radiogroup patterns — which APG
   pattern should `TabSwitch` claim?
4. **Motion.** Sliding selection pill (Framer spring) vs instant background —
   what do Linear / Figma / Radix do, and does reduced-motion policy change the
   recommendation?
5. **Guardability.** What machine check (guard test) would prevent regressing
   to nested rail cards under `density="band"` without brittle class-string
   greps?
6. **Kill criteria.** Under what measured outcome should we abandon
   `density="band"` and keep Unbox on default hug chrome?

---

## 8. What “lock SoT” would mean here (so you can judge prematurity)

If we lock after your verdict, engineering will:

1. Freeze the band recipe in `display/workbench.md` (one paragraph — already
   drafted; revise per your §6).
2. Keep Unbox as the pilot consumer; add Triage only if you say cascade is
   justified.
3. Optionally add a guard: `density="band"` ⇒ TabSwitch `railClassName` must not
   include `border`/`shadow-sm` (or assert flat rail helper).
4. **Not** change Incoming / Dashboard / Media Library defaults in the same
   pass.

If you say **do not lock**, list the minimum revisions required before lock —
prefer surgical prop/class changes over a redesign narrative.

---

## 9. Response format (required)

```markdown
## Industry standard (2026)
### Segmented controls / lifecycle tabs in dense B2B
### Scan-adjacent / toolbar-height alignment
### Nested elevation vs single-surface
### Corner radius relationships
### Icons on labeled tabs
### SoT density variants vs forks

## Verdicts on §6 (D1–D8)
For each: **Lock as-is** | **Revise to X** | **Kill** — 2–4 sentences + sources.

## Answers to §7
Numbered, sourced.

## What to change before SoT lock
Bullet list an engineer can apply to:
- `src/components/dashboard/workbench-shell.tsx`
- `src/design-system/components/TabSwitch.tsx`
- `.claude/rules/display/workbench.md`
- Unbox-only vs cascade list

## One-sentence recommendation
Lock / revise / kill — with the single highest-leverage change called out.
```

---

## 10. Sources we already trust (start here, then go wider)

- Linear design / product chrome (public essays + live app)
- Notion design (as **negative** control for Kinetic Ledger)
- Stripe Dashboard / Elements density
- IBM Carbon, Shopify Polaris, Material 3, Radix Themes / Tabs / Toggle Group
- WAI-ARIA APG: Tabs, Toolbar, Radio Group
- NN/g: progressive disclosure, visual hierarchy, touch/target sizing
- Our house law (for conflict detection, not as industry proof):
  Kinetic Ledger, `pattern-evolution.md`, `display/workbench.md`,
  `nestedCorner` in `radius.ts`

Do not cite our handoff docs as industry evidence. Cite them only when stating
what Cycle Forge currently believes.
