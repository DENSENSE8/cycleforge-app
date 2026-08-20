# Arrival — retire the last legacy palette classes

**Status:** arrival is FUNCTIONALLY GOOD. This is a paint-only cleanup, no behaviour change.
**Scope:** 16 stock-Tailwind colour classes across 3 files. Desktop triage arrival is already clean.
**Date:** 2026-08-19

Paste the prompt at the bottom into a fresh session. Everything above it is the
context that prompt assumes.

---

## Why this exists

Arrival rendered with **no background wash on old shop-floor machines**. The
cause is now fixed at the pipeline level (`scripts/postcss/legacy-color-fallback.cjs`,
landed in `ef526cedf` / `344245b68`): Tailwind v4 writes its whole palette as
`oklch()`, which Chrome 109 — the newest build Google ever shipped for Windows 7 —
cannot parse, and an unparseable value voids the **entire declaration**, so the
element loses its background rather than approximating it.

That plugin rewrites `oklch()` to hex and adds an `rgba()` fallback ahead of each
resolvable `color-mix()`. Measured on the production build: **oklch 527 → 0**,
**330 rgba fallbacks**.

**So why still do this?** The fallback is a safety net under a class of utility
this codebase is supposed to have stopped using. The design-system tokens
(`bg-surface-*`, `text-text-*`, `border-border-*`) are authored as hex in
`src/styles/globals.css` — 158 hex values, zero `oklch` — so they never needed
rescuing. Every legacy `bg-blue-50` is a cell that depends on the net instead of
never falling. Arrival is the surface the operator noticed, so arrival goes first.

---

## The exact debt

Desktop triage arrival (`ArrivalDisplaysActionFloor`, `ArrivalDockScanEntry`,
`ArrivalLocationsLeaf`, `ArrivalStagingDockControl`, `ArrivalCheckStepBody`,
`ArrivalPhotosDockControl`, `ArrivalCartonPipeline`) is **already token-clean —
do not touch it.** Three files carry all 16:

| File | Line | Classes |
|---|---|---|
| `src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx` | 94 | `border-slate-200` `bg-slate-50` `text-slate-700` |
| | 237 | `border-blue-100` `text-blue-500` |
| `src/components/mobile/receiving/MobileArrivalDetailsSheet.tsx` | 63 | `border-blue-300` `bg-blue-50` `text-blue-800` |
| | 122 | `border-slate-200` `bg-slate-50` `text-slate-700` |
| `src/components/sidebar/receiving/ArrivalBatchCaptureStrip.tsx` | 29 | `bg-amber-50/80` |
| | 39 | `border-amber-200` `text-amber-900` |
| | 48 | `text-amber-700` `text-amber-950` |

`bg-amber-50/80` is the only one carrying an opacity modifier — that compiles to
`color-mix()`, the half of the problem the fallback plugin can only partly cover
(nested and `currentcolor` mixes stay unresolvable). It is the highest-value
single fix in the list.

## Replacement vocabulary

Use what the codebase already overwhelmingly uses — do not invent tokens:

```
bg-surface-card    1248     text-text-soft      1919
bg-surface-canvas   690     text-text-faint     1850
bg-surface-sunken   645     text-text-default   1536
bg-surface-hover    292     text-text-muted     1299
bg-surface-strong   126     text-text-danger      72
border-border-soft 1102 · border-border-hairline 676 · border-border-default 277
```

The neutral runs (`slate-50/200/700`) map onto the surface/border/text triples
directly. The `blue-*` and `amber-*` runs are **semantic** — they mean "selected"
and "attention" respectively — so map them to the accent/attention token the rest
of the station chrome uses for that state, not to a neutral. Read the neighbouring
already-migrated component before choosing; matching a sibling beats inventing.

---

## Locked decisions

| # | Decision | Ruling |
|---|---|---|
| 1 | Scope | Paint only. No layout, no behaviour, no prop changes. |
| 2 | Desktop triage arrival | Already clean — **do not touch**. |
| 3 | Token choice | Reuse existing tokens by frequency; never add a new token for this. |
| 4 | Semantics | `blue-*` = selected, `amber-*` = attention. Preserve the meaning, not the hue. |
| 5 | Verification | Compare against a **production build**, never the dev server (see below). |
| 6 | The fallback plugin | Stays. This work reduces reliance on it; it does not replace it. |

## Verify like this — dev will lie to you

`next dev --turbopack` emitted **zero** rgba fallbacks in the chunk inspected,
while the real build has 330. Checking colour behaviour on `:3050` gives a false
result.

```bash
pnpm build && pnpm start
```

Then confirm the built CSS still has no raw `oklch` and keeps its fallbacks:

```bash
grep -c "oklch(" .next/static/css/*.css
```

Expect `0` in every file. Before/after screenshots of arrival at the same
viewport are the acceptance artifact.

---

## Must-ship

1. All 16 classes replaced with existing DS tokens.
2. Arrival renders identically on a modern browser — this is invisible to current users.
3. `oklch` count in built CSS still 0; fallback count not reduced.
4. `pnpm verify` green.

## Never-ship

1. New colour tokens invented for three files.
2. Touching the already-clean desktop triage arrival components.
3. Raising a knip / jscpd / DS baseline to pass a gate.
4. Behaviour, layout or prop changes riding along with a paint change.

## Out of scope

- The other ~7,900 legacy palette uses elsewhere in `src/` — arrival only.
- The `color-mix` cases the plugin cannot resolve (nested / `currentcolor`).
- Safari on the 2010 iMac: Tailwind v4 emits cascade layers needing Safari 15.4+,
  that box caps at 13.1. No CSS change reaches it — it needs Chrome 116.

## Done definition

The three files carry zero stock-palette classes; arrival is pixel-identical on a
modern browser; built CSS still reports `oklch: 0`; `pnpm verify` green; the
operator has seen before/after on the arrival page.

---

## Paste for a new session

```
Read docs/todo/arrival-legacy-palette-HANDOFF.md and do it.

PAINT ONLY — 16 stock-Tailwind colour classes in exactly 3 files:
  src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx  (lines 94, 237)
  src/components/mobile/receiving/MobileArrivalDetailsSheet.tsx  (lines 63, 122)
  src/components/sidebar/receiving/ArrivalBatchCaptureStrip.tsx  (lines 29, 39, 48)

Replace with EXISTING design-system tokens (bg-surface-*, text-text-*,
border-border-*). Do not invent tokens. Preserve semantics: blue = selected,
amber = attention — match the sibling component that already migrated.

Do NOT touch the desktop triage arrival components; they are already clean.
Do NOT change layout, behaviour or props.
Do NOT raise any knip / jscpd / DS baseline.

Verify against a PRODUCTION build (`pnpm build && pnpm start`) — the dev server
does not emit the colour fallbacks and will mislead you. Confirm
`grep -c "oklch(" .next/static/css/*.css` is 0 everywhere.

Lane: stay on the checkout's branch · attach to :3050 · never start/restart/kill
the dev server · user owns commits · `pnpm verify` before done.
```
