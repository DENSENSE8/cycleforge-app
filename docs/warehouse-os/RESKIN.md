# RESKIN — the full visual replacement

**Status: DECISION LOCKED by the operator, 2026-09-02.** The current visual
system is ruled not usable. Everything visual is replaced. Interaction
contracts stay unless separately ruled broken.

This file is the reskin's constitution: the problem, the target, the
non-goals, the contracts that survive, the execution order, the refuse list,
and the measurement. It overrides the *visual* rulings in
[`HANDOFF-ux-ui.md`](HANDOFF-ux-ui.md) and the F-section of
[`LAWS.md`](LAWS.md); it does not touch the structural, input, session, or
canvas laws. Where this file and an older visual ruling disagree, this file
wins, and the older ruling is struck per X3 once the replacing law is written.

The prior advice on the record was "keep the industrial WMS grammar and unify
under it" (research verdict, 2026-09-02). That advice is overruled by this
decision. Its evidence still stands and is reused below where it applies to
*how* to replace without a failed rewrite.

---

## 1 · The problem, in one paragraph

The current look does not serve either audience. Staff read it as heavy and
inconsistent; agents and developers cannot produce consistent UI from it,
because the system carries three radius doctrines at once (the prototype's
two-token `--r-none` / `--r-hud=4px`, the F9 seven-rung ladder in
`radius.ts`, and a design-oracle note that still says "the industrial ladder
is `rounded-none`"), a no-shadow law (F3) that 346 shadow utilities ignore,
nine themes plus sixteen station skins, and sixty pinned component laws whose
doctrine is "no entry means not permitted". The result is a system that is
strict in prose and incoherent on screen. A visual refresh inside that system
would inherit the incoherence. The system is replaced instead.

### Unusability triage (operator answers once)

Which is true decides what the first week fixes:

- **(A)** staff cannot work the floor UI. First week adds L2 flow fixes to
  the station waves: single armed field, scan feedback, focus restoration.
- **(B)** agents and developers cannot produce consistent UI from the design
  system. A full reskin with one token set and one law file solves this
  fast.
- **(C)** both.

The evidence already on file supports (B) with certainty. (A) is not yet
measured; §9 defines the measurement so it can be.

**Operator's answer, 2026-09-02: (C) both.** So the reskin carries the
coherence fix (B) in R1 and R2, and the station waves (R3, waves 3 and 4) also
carry L2 flow fixes: one armed field per station, differentiated scan feedback,
focus restored synchronously after every scan-driven re-render. Those L2 items
are gated on the §9 hesitation metrics, not on taste.

---

## 2 · Target look

Three directions were drawn on 2026-09-02, each as a full reference
composition (beam, station mouth, slot-table rows, controls, token strip).
The operator picks one. There is no committee and no blend.

| Direction | Ground | Radius ladder | Elevation | Accent | Type |
|---|---|---|---|---|---|
| **1 · Dock Paper** (light industrial) | warm paper white | 2 / 4 / 6 px | borders carry structure; one soft shadow, overlays only | safety orange | Archivo + JetBrains Mono |
| **2 · Graphite** (dense tool) | cool graphite, light twin mandatory | 4 / 6 / 8 px | one raised step with inner highlight; overlay shadow | teal | Instrument Sans + Geist Mono |
| **3 · Studio** (soft ops) | warm stone, cream surfaces | 8 / 12 / 16 px | two ambient levels | moss green | Figtree + DM Mono |

Adjectives that apply whichever is picked: **legible at arm's length, quiet
chrome, loud state, one accent, tabular numerals, nothing decorative moves.**

Recommendation, for the record: **Graphite**, with the light twin as the
default on stations. It reads as a 2026 ops product to a buyer, it keeps
desk density, it gives night shifts a real dark surface, and its token
shape maps one-to-one onto the semantic names the registry already has, so
R1 is a value swap before it is a rename.

**Operator's pick, 2026-09-02: Direction 2 — Graphite.** Dark-first layered
graphite with the light twin as a first-class theme and the **station default**.
Teal accent, one raised elevation step, 4 / 6 / 8 radius ladder, Instrument Sans
with Geist Mono. The light twin ships in R1 alongside the dark, not after it.

---

## 3 · Non-goals

- No second app, no product-logic rewrite "while we are here".
- No change to routes, data model, permissions, or the event spine.
- No new layout model. The canvas stays a binary split tree (C1 to C9).
- No change to what the composer does. Its chrome changes; its contract does not.
- No React Native, no new renderer. Electron desktop plus the three web
  surfaces named in `00-endgame.md` remain the targets.
- No dual design system kept alive past R4.

---

## 4 · Contracts preserved unless separately ruled broken

These are interaction and throughput laws, not visual ones. They are kept.
Any one of them may be reopened, but only by name, with a measurement, as
its own ruling.

| Contract | Law | Why it survives a reskin |
|---|---|---|
| One composer, one persistent scan/search field | I1, I8 | The mouth is where scans land; two mouths is a barcode trap |
| StationComposerHost is the station mouth; dumb stations keep the context ring | AGENTS.md | Pattern, not paint |
| Wedge burst and human typing coexist; detector runs ahead of keybind matcher | I2, I3, T16 | Throughput |
| Bare keys never bound; collisions refused | T20, T21, I7 | Scanner safety |
| Exactly one armed scan session; one scan-session tile | S1, S2, K5 | Wedge routing |
| Every painted DATA header click-sorts; chrome-only columns named | `SLOT_TABLE_PAINT_LAW.headerSort` | Desk contract |
| Ship-by is `DateRangePickerField variant="compact"`; filter icon is `DataTableFilterMenu` | slot-table cohort | Desk contract |
| Center Lock: desk edits stay on the table tile | Q5 | Position stability |
| WeldedFeedbackPanel hinge under the mouth | pinned | Scan feedback placement |
| Nothing animates geometry; colour and opacity only; outline for state | M1, M2, M3, M5 | Paint speed on the floor |
| Operational facts stay on the surface | B8, T19 | Disclosure never hides state |
| Eval cohorts gate every wave | AGENTS.md | Regression gates, not optional |

Motion laws are listed deliberately. They are throughput laws wearing a
visual name. A direction that wants a hero morph or a springing row reopens
M1 by name or does not get it.

---

## 5 · What is replaced

Everything visual. Named so nothing survives by accident:

- **Tokens:** colour (all nine theme palettes, the eight staff accents),
  type scale and the three type families, the radius ladder and every named
  corner exemption in `radius.ts`, elevation, focus ring, borders, the
  density scale values.
- **Primitives:** Button, TextField, Panel, Popover, Menu, Dialog, Badge,
  Checkbox, Skeleton, Separator, Command, the segmented control faces.
- **Materials:** `station-skins.ts` catalog (mechanism kept, rows replaced),
  `station-depths.ts`, desk-stage tokens, the Kinetic Ledger north star in
  `src/design-system/DESIGN_SYSTEM.md`.
- **States:** empty, loading, focus, selection, hover, drag, snap-target,
  scan feedback colours.
- **Artefacts:** `prototype/warehouse-os.html` (regenerated to the new law
  or replaced by `prototype/skin.html`), `src/design-system/pinned.json`
  visual entries, `tools/design-mcp/design-mcp.profile.json` token sources,
  `router.json` refuse patterns, AGENTS.md and CLAUDE.md design paragraphs.
- **Visual laws now candidates for replacement:** F3 (no shadows), F5
  (segmented strips replace pills), F9 and F10 (radius ladder), U3 (comfort
  radius is the F9 ladder), the "no radius" clause of B20, and the
  prototype's `--r-hud=4px`. F1 and F2 are already struck. The replacing
  law is written in R0 and takes the next free F-numbers per X4.

---

## 6 · Execution model

| Phase | What ships | Done when |
|---|---|---|
| **R0 · New skin law** | Moodboard, token draft, prototype reference page (shell + one station + one table row) in the picked direction | Operator approves one reference composition for desk, station and table |
| **R1 · Foundations** | Rewritten tokens (colour, type, radius, elevation, focus, border), primitives (Button, Panel, TextField, Popover, Menu), theme registry cut to the new set, station-skin catalog reset | Critique on primitives green; design-mcp profile points only at new tokens; old token names resolve through a deprecation shim that warns |
| **R2 · Global paint** | `globals.css`, shell chrome (beam, rails, canvas frame, launcher), shared layout frames (DeskPageChrome, StationWorkbench) | Opening any route already feels like the new product, even where a module lags |
| **R3 · Surface waves** | Stations, then product tables, then remaining desks; each wave deletes the old classes it touches | `eval:station <id>`, `eval:cohort slot-table`, `eval:cohort shortcuts` green per wave; drift census at zero for the wave's directories |
| **R4 · Kill list** | Delete legacy themes, dead CSS, obsolete rulings, the deprecation shim, dual paths | No second visual system left; `router.json` refuse patterns updated; LAWS.md F-section struck and replaced |

### Order of paint

| Wave | Surfaces | Why first |
|---|---|---|
| 1 | Tokens, Button, Panel, TextField, Popover, Menu | Everything inherits |
| 2 | App shell, beam, rails, canvas frame, home | First viewport is the new brand |
| 3 | Pack and Unbox mouths, station skins | Highest daily eyes |
| 4 | All remaining scan stations | Cohort parity |
| 5 | Slot-table engine and every `PRODUCT_TABLES` entry | Desks look finished |
| 6 | Mobile `/m` routes and leftovers | No orphan chrome |

Each wave: paint, run its eval gate, run the drift census, delete the old
classes in the directories it touched, commit. No wave leaves both looks on
one screen.

---

### The instrument

The compare surface is built and is QA-org only: see
[`RESKIN-LAB.md`](RESKIN-LAB.md). It stamps `data-reskin="before|after"` on
`<html>` the way `data-theme` already works, opens **real routes against QA
fixtures** rather than a component gallery, and carries a 26-viewpoint catalog
derived from `SCAN_STATION_OVERLAY_COHORT` and `PRODUCT_TABLES` so a new station
cannot drift out of the lab. `before` emits nothing — it is the live default,
never a frozen snapshot.

One limit decides the phase split, and it is a fact about the build, not a
preference: the attribute moves **runtime CSS variables only**. Radius and the
type scale are Tailwind classes resolved at build time, so Graphite's 4/6/8
ladder and its Instrument Sans / Geist Mono pairing **cannot** be proven by the
toggle. Colour, surface, border and status tints sign off in the lab; radius,
type and primitive shape sign off in the `:3051` worktree lane and land as R1
commits. Do not wire `radius.ts` into `tailwind.config.mjs` to make the lab
prettier — that remaps every `rounded-*` call site in the app at once.

---

## 7 · This week

| Day | Deliverable |
|---|---|
| 1 | This file; three visual directions rendered; operator picks one and answers the triage |
| 2 to 3 | Prototype reference in the picked direction: shell, one station mouth, one table row cluster |
| 4 to 5 | Tokens, Button, Panel, TextField, Popover live in `src/design-system`; design-mcp profile repointed |
| 6 to 7 | Global CSS and shell paint; old look gone from chrome |

---

## 8 · Refuse list during the reskin

- Do not build a second app or rewrite product logic.
- Do not leave old tokens as the default for new files. New files consume
  the new tokens from R1 day one; the shim is for old files only.
- Do not offer a soft-purple marketing SaaS look as the only option.
- Do not skip eval cohorts because "it is just CSS".
- Do not mix old square chrome and new chrome on one screen; finish the
  screen or do not start it.
- Do not move controls, keybinds, the scan field, beam zones, row density
  or field order under the banner of the reskin. That is L2 or L3 work and
  gets its own ruling.
- Do not reopen a preserved contract without naming it and measuring it.
- Do not add a new global semantic token for one surface; use a station
  skin row or a component token.
- Do not re-add shadcn components through the CLI over customised ones.

---

## 9 · Measurement

Two questions, answered with numbers, before and after each station wave.

**Can staff complete Unbox and Pack without hesitation?** From
`station_activity_logs` and `ops_events` on the USAV dogfood org:

- time from station open to first scan;
- scans per hour per station;
- hesitation: count of gaps longer than eight seconds between a scan and the
  next recorded action, per hundred scans;
- undo and mis-scan rate;
- support tickets per tenant per week.

Baseline is recorded for two weeks before wave 3 lands. A wave that is worse
on any of these for two weeks is reverted at the token layer, not patched at
the screen.

**Is there one system?** The drift census (`shadow-*`, off-ladder radii, raw
hex, inline style, legacy token names) per top-level directory, run per wave,
committed to `docs/eval/`. R4 is done when every count is zero and the shim
is deleted.

---

## 10 · Open questions

1. Triage answer (A, B, C). §1.
2. Direction pick. §2.
3. Theme count after R1: light and dark plus tenant accent, or keep a
   catalog. Recommendation: two themes plus accent; station skins carry the
   material variation.
4. Station skin catalog size after reset. Recommendation: four rows in the
   picked direction's material family, plus `house-color`.
5. Electron and PWA first paint per theme: audit in R2 so no flash of the old
   palette survives.

---

## Decision log

| Date | Ruling |
|---|---|
| 2026-09-02 | Full reskin. Visual language is replaceable; floor contracts stay unless separately ruled broken. Operator. |
| 2026-09-02 | Prior "unify under the industrial grammar" advice overruled by the above. |
| 2026-09-02 | Three directions drawn: Dock Paper, Graphite, Studio. |
| 2026-09-02 | **Pick: Graphite.** Dark-first, light twin is the station default and ships in R1 with the dark. Teal accent, 4/6/8 radius, Instrument Sans + Geist Mono. Operator. |
| 2026-09-02 | **Triage: (C) both.** Station waves carry L2 flow fixes alongside the paint, gated on the §9 hesitation metrics. Operator. |
| 2026-09-02 | QA Design Lab shipped as the per-surface sign-off instrument (`RESKIN-LAB.md`). Colour signs off there; radius/type/primitives sign off in the `:3051` lane. |
