# Header task button → task PREVIEW + a Home CTA — HANDOFF

**Status:** Not started. This is a spec, not a report of work done.
**Scope of this doc:** only the global header's pace-and-next button and the one
CTA it gains. Nothing else.
**Written:** 2026-08-19. Every path below was opened and confirmed to exist.

---

## The ask, in one line

The header's task button should read as a **preview of the current task**, and
its panel should carry a **CTA that takes the operator Home** — to `/`, where
Home → Daily is the full surface.

The button already exists and already opens a panel. This is not a new occupant;
it is a change of what the panel leads with and one control added to it.

---

## Start here (2 minutes)

1. Open `/` and click the header button left of the bell — aria-label is
   `Daily goal — …` when a goal exists, `Your next work order` when one does not.
2. That panel is `GoalPopover`. Today it leads with the next work order row, then
   the goal ring, then a `Scans · auto / Recurring / To-do` toggle.
3. Note what is missing: nothing in it takes you Home. Every exit is either the
   work order's own record or nothing.

---

## What exists

| Layer | Path |
|---|---|
| Button — closed face + popover host | `src/components/layout/HeaderGoalChip.tsx` |
| Panel | `src/components/layout/goal-chip/GoalPopover.tsx` |
| Work-order row | `src/components/layout/goal-chip/NextWorkOrderRow.tsx` |
| Work-order data | `useNextWorkOrder.ts` → `GET /api/work-orders/mine` |
| Checklist list (recurring + to-do) | `goal-chip/TaskList.tsx` |
| Checklist data | `useGoalChecklists.ts` → `staff_todos` via `/api/staff-todos` |
| Goal ring + controller | `goal-chip/GoalRing.tsx` · `goal-chip/useHeaderGoalChip.ts` |
| Panel shell + tone tokens | `goal-chip/goal-chip-shared.ts` (`GOAL_PANEL_SHELL_CLASS`, `STATION_LABEL`, `toneFor`) |
| Desktop mount | `src/components/layout/GlobalHeaderActions.tsx:244` |
| **Mobile mount (same component)** | `src/components/mobile/redesign/MobileTopBar.tsx:53` |
| CTA destination | `/` → Home → Daily (`src/features/home/HomeDailyMode.tsx`) |

---

## The model, and the parts that are not obvious

**Two checklist stores exist and they are NOT the same list.** This is the single
most likely thing to get wrong here, because both render as ticked rows:

| | Store | Scope | Question |
|---|---|---|---|
| Header panel → Recurring / To-do | `staff_todos` (`/api/staff-todos`) | **personal**, per-station | *what I put on my own list* |
| Home → Daily | `daily_check_items` + `daily_check_marks` | **org-wide list**, per-person mark | *did each person run the shift list* |

They are siblings, not twins. A preview may **read** either; it must not make one
write to the other, and it must not "unify" them into one list. The daily check
is an attestation with a roster behind it — that is why the report can answer
"who still owes checks", and a personal to-do can never answer that.

**The ring is not a task meter.** The 2026-08-08 ruling is restated in
`HeaderGoalChip`'s own docblock and it stands: a ring encodes progress toward a
target — a **bounded fraction** — and a task or work order has no denominator.
The arc means today's scans against today's goal and nothing else. A preview is a
**row or band in the panel**, never a second arc and never folded into the first.

**The closed face already tells the truth.** Goal → ring; no goal but a work
order → clipboard glyph; neither, once both have settled → renders nothing.
Absent, never disabled. A preview must not force a face onto a button that
currently has the good sense to disappear.

**One button, one panel.** This control is already the merge of two former header
occupants. The header slot count does not go up for this.

---

## The shape to build

1. **Lead the panel with the preview.** `GoalPopover` already puts the work-order
   row first on the argument that it is "the one row here that is a *thing to do
   next*". Extend that band to be the current-task preview rather than adding a
   third region above it.
2. **One CTA, at the panel's foot**, labelled for its destination (e.g. `Open
   Home`). Compose `Button` (or a `Link` wearing `focusRing('control', 'accent')`
   the way `NextWorkOrderRow` does) from `@/design-system/primitives` — never a
   page-local button, never a `className` hue or radius override
   (`AGENTS.md` → *Do not paint over primitives*).
3. **Close the popover on navigate.** `GoalPopover` already threads `onNavigate`
   through to the work-order row for exactly this; reuse it rather than adding a
   second close path.
4. **Check the mobile mount.** `MobileTopBar` renders the same component, so any
   vertical growth in the panel is paid twice. Verify at 375px.

---

## How to test

```bash
npx tsc --noEmit -p tsconfig.json
npm run verify                                    # before done
```

There is no unit test for this panel today, and a mounted-DOM test is the right
layer for "the CTA renders and points at `/`" — **not** a `readFileSync` + regex
over the `.tsx` (`.claude/skills/add-guard/SKILL.md`, and `AGENTS.md` → *Guard
authoring*). Load that skill before creating any test file.

Browser check (dev server on `:3050`, which the operator owns — attach, never
start): open `/`, open the button, confirm the preview reads, click the CTA,
confirm it lands on Home → Daily and the popover closed behind it.

---

## Do not

- **Do not add a second header button or a second corner mark.** The corner ping
  stays recurring-due only — a waiting item is a standing fact already named in
  the tooltip and the panel row.
- **Do not fold the preview into the goal ring.** See *the ring is not a task
  meter* above; this is a re-litigation, not a simplification.
- **Do not merge `staff_todos` with `daily_check_items`**, in either direction.
- **Do not make the CTA a second door onto a surface that already has one.** Home
  is one route (`/`); the CTA navigates there, it does not fork a mini-Home into
  the popover.
- **Do not grow the always-on rule corpus for this.** If a durable invariant
  falls out of the work, it belongs in `docs/rules/` (on-demand), and only a
  one-line hard law belongs in `AGENTS.md`.

---

## Open question for the requester

"Preview the **current task**" is ambiguous between three live candidates, and
they are not the same row:

1. the next **work order** (`/api/work-orders/mine`) — what the panel leads with today,
2. the operator's **daily checks** (Home → Daily) — the surface the CTA points at,
3. their personal **to-do / recurring** list (`staff_todos`) — already two clicks in.

This doc assumes **(1) stays the preview and (2) is what the CTA opens**, because
that keeps each store where it already lives and adds exactly one control. If the
intent was that the header should preview the *daily checks* specifically, say so
— it is a small change to this spec but a different data source, and worth
settling before code.
