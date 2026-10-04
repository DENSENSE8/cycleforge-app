---
name: declutter
description: Use when the owner says a screen shows too much, repeats itself, needs progressive disclosure, or gives placement instructions ("move X top right", "behind the three dots", "only as a dropdown", "no labels", "same row"). Encodes the instruction as a declared screen budget, measures the live screen with ds_disclosure, and edits until the DELETE / SIMPLIFY / MOVE / ENLARGE lists are empty.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Declutter — just-in-time progressive disclosure, by measurement

The law is data, not taste: `src/lib/disclosure/screen-budget.ts` (rules + owner-tunable
budgets), `src/lib/disclosure/surfaces.ts` (each screen's declared first screen). One command
measures a live screen against it:

```bash
node tools/design-mcp/ds.mjs disclosure                       # every declared screen, statically
node tools/design-mcp/ds.mjs disclosure task-sheet id=16127   # live at :3050, 390×844, light
node tools/design-mcp/ds.mjs disclosure task-sheet id=16127 --dark
# or: node_modules/.bin/tsx scripts/disclosure-audit.ts --surface task-sheet --param id=16127 --screenshot /tmp/x.png
```

(MCP: `ds_disclosure` with `{surface, params, theme}`.) The answer is four lists, each finding
with its recipe: **DELETE** (duplicate text, field labels, a second control for one fact) ·
**SIMPLIFY** (over budget, L1 too tall, a control outside every declared slot) · **MOVE** (✕ off
the title row, status/time not in the corners, a door with no L1 trigger) · **ENLARGE** (<44px).

## 1. Translate the instruction into the declaration FIRST

Every owner sentence maps to one edit of the surface's entry in `surfaces.ts`:

| Owner says | Edit the spec |
|---|---|
| "X must be in the same row as the title", "close top right" | `chromeRow: ['title', …tools, 'close']` (close is always last) |
| "move overdue to the top right / status to the top left" | `cornerRow: { left: 'status', right: 'due' }` |
| "only display the slider as a dropdown" | delete the slot from `rows`; add it to `doors.status` |
| "behind the three dots", "like add" | delete the slot from L1; add it to `doors.more` (`IosMoreMenu`) |
| "identify it just as a timer", "a full display" | L1 shows a glyph/live state only; the full view is a door (`timer-sheet`) |
| "why is X displayed twice" | nothing to declare — the audit's `duplicate-text` finds it; fix at the derived site |
| "no labels, the value says it" | nothing to declare — `field-label` finds it (`BANNED_FIELD_LABELS`) |
| "too much at one time" | lower `SCREEN_BUDGET.phone.l1Slots` / `l1MaxViewportFraction` (owner numbers) |

Write the owner's words, dated, into the spec's `owner` field. Run the static check
(`ds.mjs disclosure`) — the declaration must pass before the composition changes.

## 2. Make the composition follow

- Mark L1 elements `data-disclosure-slot="<slot>"`; regions `data-disclosure-zone="l1" | "body" | "dock"`.
- Reuse before building (`ds.mjs contract "<job>"`): `IosBar` + `IosBarButton` (title row, ✕ top-right),
  `IosMoreMenu` (⋯, Apple medium layout: 3 quick tiles + grouped list, `…` on items that open a view),
  `ConfirmSheet` (destructive confirm), house `Sheet` for every L2 form (one open at a time),
  `PomodoroTimerSheet` (the full timer). Reference composition: `src/components/mobile/daily/MobileTaskSheet.tsx`.
- Duplicates are fixed where the string is DERIVED (e.g. `taskBriefBody` drops a note line equal to the
  title; a door's context is dropped when the title already says it), never by hiding a node with CSS.
- An empty section renders nothing (`return null` + `empty:hidden`), not "Nothing here yet".
- Mobile record text wraps; never `truncate` (lint `cf-mobile/no-truncated-record-text`).

## 3. Measure until zero, then prove

1. `ds.mjs disclosure <surface> id=<n>` for at least three real records (one per record type) and `--dark`.
2. Open every door once (⋯ menu, status, timer, each sheet) in a throwaway Playwright script at 390×844
   with `tests/.auth/admin.json`; screenshot L1 and each L2. Nothing destructive — Keep/Cancel out.
3. `node_modules/.bin/tsx --test src/lib/disclosure/screen-budget.test.ts` · `pnpm verify:fast`
   (gate `Disclosure` re-checks every declaration).
4. Report: the instruction → spec diff, findings before → after per record, screenshot paths.

## Adding a new surface

Append a `SurfaceDisclosureSpec` to `DISCLOSURE_SURFACES` (id, file, owner words, probe path with
`{param}` placeholders, `ready` selector, chromeRow / cornerRow / rows / dock / doors). The static
gate holds it from then on; the live measure needs only the slot marks.
