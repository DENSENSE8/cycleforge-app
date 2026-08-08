# `floor` density — draft for review

**Status:** DRAFT. Nothing landed. Proposes wiring the `floor` density mode that four rule files
already reason about but which does not exist in code.

**Scope:** scan stations only — `src/components/station/**` + `src/components/receiving/workspace/**`.
Desk grids, Monitor, Canvas and Support are untouched.

---

## The gap

| Density | In the rules | In code |
|---|---|---|
| `floor` | "One focus surface; big pass/fail; minimal chrome" | **missing** |
| `ops` | "Dense rows; dividers; inline actions" | **missing** |
| `rollup` | "More air; KPI heroes" | **missing** |
| `studio` | "Spatial canvas" | **missing** |

What exists is one scalar: `--cf-density`, default `1`, with a single alternate
`[data-density='compact'] { --cf-density: 0.92 }` (`src/styles/globals.css:47,53`). It scales
`role-*` font sizes and rem-based grid geometry — nothing else.

**No file under `station/**` or `receiving/workspace/**` sets `data-density` at all.** The only
setter in the app is `design-system/components/monitor/KpiChartCard.tsx:218`. So every rule-file
sentence reasoning about "floor density" is reasoning about a value that is never applied.

---

## Why `floor` cannot be a multiplier

`compact` scales things **down**. Applying it to a bench would be backwards, and simply *not*
applying it leaves floor meaningless.

An operator at ~3 ft with gloves on needs **two things that move in opposite directions**:

- **more information per screen** → tighter row rhythm
- **larger things to hit** → bigger controls

A single scalar cannot express that. So `floor` is a **mode** — a `data-density='floor'` block that
sets its own variables, the way `data-theme` sets a palette — not another point on the `--cf-density`
scale.

> **Boxy does not mean small.** The most likely way to get this wrong is to read "dense industrial"
> as "shrink everything," which is exactly what `compact` already does and exactly what a bench
> does not want.

---

## The block

Deliberately **two** new variables. The naive version of this proposal had five; three of them
turned out to be expressible through SoTs that already exist (see *What needs no variable*).

```css
/* src/styles/globals.css — after the [data-density='compact'] block */

/* Scan-station floor. A MODE, not a scale step: it moves information density
   and hit-target size in OPPOSITE directions, which a single multiplier cannot.
   Stamped by station shells only — see .claude/rules/display/instrument-panel.md. */
[data-density='floor'] {
  /* Type does NOT shrink. ~3ft viewing distance; `compact`'s 0.92 is wrong here. */
  --cf-density: 1;

  /* Row rhythm tightens — this is the density win. */
  --cf-row-pad-y: 0.375rem;

  /* Hit targets go the OTHER way. Gloved hands, WCAG 2.2 target-size floor. */
  --cf-control-min: 2.75rem; /* 44px */
}
```

### Consumers — each variable lands with the code that reads it

A variable nothing consumes is a knip finding and dead weight. Neither ships alone.

| Variable | Consumer | Change |
|---|---|---|
| `--cf-control-min` | `src/design-system/primitives/IconButton.tsx` | Under floor, the size ladder resolves to a `min(44px)` floor rather than depending on every call site remembering `size="touch"` |
| `--cf-row-pad-y` | Station row primitives (`PoLineRow`, `SerialCard`, rail rows) | Replaces the hand-set `py-*` on station rows |

**Today the dominant station control is 28px (`size="sm"`, 80 uses) and `size="touch"` appears
exactly zero times on any station surface.** That is the concrete defect `--cf-control-min` fixes.

---

## What needs no variable

Three of the "hard bench" axes are already expressible. Adding vars for them would fork a second
way to say the same thing.

| Axis | Already handled by | Note |
|---|---|---|
| **Corner radius** | `cornerClass(role)` (`tokens/radius.ts:118`) | Every role except `pill` **already returns `rounded-none`**. This is a call-site migration, not a token change — see the ratchet below |
| **Elevation** | `elevationClass('flat')` (`tokens/shadows.ts`) | Depth on a bench is a plane step, not lift. A composition rule, not a density var |
| **Motion** | `motionRole.*` (`motion/roles.ts`) | Roles are JS objects consumed by Framer — a CSS var could not reach them. Station motion is already near-immediate; see `instrument-panel.md` → Motion on a bench |

### The corner ratchet (separate change, no var)

`radius-tokens.guard.test.ts` only fails on **arbitrary** values (`rounded-[…]`); lines 15–18
explicitly declare existing `rounded-*` classes "correct and not offenders." That is why station
chrome drifted soft while the tokens stayed hard.

Proposed: a **station-scoped, shrink-only** baseline over the two directories, so every *new* soft
corner fails CI while the existing ~140 burn down. Current load:

| Class | station | recv/workspace |
|---|---|---|
| `rounded-lg` | 6 | 43 |
| `rounded-md` | 10 | 33 |
| `rounded-xl` | 15 | 21 |
| `rounded-2xl` | 2 | 9 |
| `rounded-full` | 44 | 30 |

`rounded-full` splits: status dots, the ambient-wash orbs and avatars are **legitimate** (house law);
pills and icon buttons are debt. Loudest offenders: `ActiveOrderScanFeedback.tsx` (8),
`StationWorkspaceSkeleton.tsx` (7), `SerialCard.tsx` (7).

---

## Who stamps it

`data-density='floor'` goes on the **station shell**, not the page — chrome above the station
(GlobalHeader, MasterNav) stays comfortable. Host: `StationPanelRoot`, which already owns the sunken
centre plane for the Unbox family, behind an opt-in `density="floor"` prop.

**Opt-in, not baked in**, because that root is shared by six panels across Tiers A–C
(`LineEditPanel`, `TriagePanel`, `TestingPanel`, `ActiveOrderWorkspace`, `PackerReviewMode`,
`LabelsOrderWorkspace`). Stamping inside the component would port all six in one commit; the prop
lets each surface adopt deliberately. Unbox is the only opt-in today.

### The context rail stays `ops` (ruled 2026-08-03)

The rail is pointer-driven and sits beside a wedge-driven surface, so it does **not** inherit floor.

This is true **by construction**, not by an override: the rail mounts via `ContextPanelLayout` in the
page shell as a **sibling** of `StationPanelRoot`, not a child — `LineEditPanel` never renders it. So
a stamp on the root cannot reach it, and no reset rule is needed.

> **The trap this avoids:** custom properties inherit. Hoisting the stamp to any ancestor that
> contains the rail — the page shell, a layout wrapper — would silently pull the rail into floor
> density and no test would catch it, because the rail would simply start rendering 44px controls.
> **Keep the stamp on the root, never above it.**

The Displays push column is a different question and still open — it is station-scoped and
wedge-adjacent, but it is also a reference-reading surface. It currently sits outside the root too,
so it inherits nothing until deliberately stamped.

---

## Phasing

| Phase | Change | Status |
|---|---|---|
| **F0** | `[data-density='floor']` + `--cf-control-min`, `IconButton` marker, `StationPanelRoot density` prop, Unbox opts in | **LANDED 2026-08-03** — not yet measured on a bench |
| **F1** | `--cf-row-pad-y` + station row primitives | next |
| **F2** | Station corner ratchet + burn down the three loudest offenders | independent |
| **F3** | Pointer-gated chrome → `focus-visible` (start `StationScanBar.tsx:391`, `UnitSlotList.tsx`) | independent |

F0 and F1 are one mode; F2 and F3 can land in any order.

### F0 as landed

| File | Change |
|---|---|
| `src/styles/globals.css` | `[data-density='floor']` block + the one scoped consumer rule |
| `src/design-system/primitives/IconButton.tsx` | Emits `data-cf-control` when `size` is set |
| `src/components/station/workbench/StationPanelRoot.tsx` | `density?: 'floor'` → `data-density` |
| `src/components/receiving/workspace/LineEditPanel.tsx` | `<StationPanelRoot density="floor">` |

Two deliberate choices:

1. **The consumer matches a `data-` marker, not a Tailwind arbitrary value.** `min-h-[var(--cf-control-min)]`
   would have worked but adds an arbitrary value to a codebase that ratchets them, and would need the
   escape hatch on every call site. One scoped CSS rule costs nothing and is inert outside floor.
2. **Only *sized* `IconButton`s carry the marker.** An unsized one is a bare glyph with no hit-box by
   design (`size` is opt-in); giving it a 44px box would silently change every legacy call site.

**Unverified:** F0 has not been measured in a browser — `:3050` was down when this landed. The check
is that a sized `IconButton` inside the Unbox centre reports ≥44px while the same primitive in the
context rail stays at its declared size.

---

## Open questions

1. **Does the context rail inherit floor?** It is pointer-driven and sits beside the bench.
2. **Does `--cf-row-pad-y` belong in the spacing intents instead?** `inset-cozy` / `inset-field`
   already exist and are density-aware; a floor override on those may beat a new variable.
3. **Do `ops` / `rollup` / `studio` get wired too**, or does `floor` ship alone and the other three
   stay prose? Shipping one real mode beside three fictional ones is its own inconsistency.
4. **`gesture.press` (`scale: 0.9`) and `swap.focus` on scan-adjacent surfaces** — keep, or drop
   under floor? Both are pointer-shaped physics on a surface with no pointer.

---

## Not in scope

- A new visual language. This is `floor` finally having tokens; Kinetic Ledger and the
  instrument-panel sub-identity are unchanged.
- Any surface outside the two station directories.
- Removing `swap.scan` or `feedback.pulse` — both are scan acknowledgement (P6).
- Raising any guard baseline.
