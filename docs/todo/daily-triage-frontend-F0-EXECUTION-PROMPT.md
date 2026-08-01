# Execution prompt — Daily triage: My Day rail SoT extraction (F0)

**Copy everything below the line into a fresh Claude Code (Fable 5) session.**
Repo: `cycleforge-app` · lane: `main` (WS-DOGFOOD) · surface: `/` (Home Today).
**Source plan:** [`daily-triage-FRONTEND-PLAN-VALIDATION.md`](./daily-triage-FRONTEND-PLAN-VALIDATION.md)

---

You are Claude Code (Fable 5) in the Cycle Forge monorepo with **fresh context**.

## Mission (one line)

Execute **Phase F0 only** — extract the My Day rail SoT — exactly as specified in
**`docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`**. Read it in full, including the **Validation
log** and the amended **Open questions** section, before writing any code. It is the contract; this
prompt is only the bootstrap.

## Why F0 only — do not pull F1+ scope forward

The plan's own header gates everything past this phase: *"Status: Proposal — needs validation... do
not schedule build until pressure-tested."* F1–F6 depend on backend `TriageTask` + phases B0–B3 /
B7–B8, none of which exist in this repo yet (`grep -rn "TriageTask" src` returns nothing — verified
2026-08-01). F0 is the one phase the plan itself marks startable now: *"F0 can start against current
`/api/my-day`."* Two of the plan's five original open questions still have no operator answer (OQ1:
Dashboard/Unbox mount; OQ4: messaging surface) — do not silently resolve either by shipping UI that
assumes an answer.

## Locked decisions (already made — do not relitigate)

1. **Split `src/features/my-day/MyDayWorkspace.tsx`** (232 lines today — a single component: a
   380px left list + a right `MyDayOnboardingPanel`/`MyDayContextPane` stack) into three modules per
   the plan's F0 table:
   - **`MyDayRail`** — the current left column, lifted verbatim (`MyDayRow`, `SectionHeader`, the
     `divide-y` Do next / Assigned / Needs attention / Queues sections, today at
     `MyDayWorkspace.tsx:116-223`). No behavior change.
   - **`MyDayTriagePane`** — **new, thin shell only.** `MyDayFeed` (`src/lib/my-day/my-day-types.ts`)
     has no `category` / `open` / `done` fields today, so there is no real categorized board to build
     yet — that's F1, gated on backend B0–B3. Wrap the existing `MyDayOnboardingPanel` +
     `MyDayContextPane` stack as the shell's body; do **not** invent categories or fake data to make
     it look more finished than it is.
   - **`useMyDayFeed`** — unchanged. Stays the one client of `GET /api/my-day`.
2. **Mount `MyDayRail` on Home Today only** (`src/features/home/HomeWorkspace.tsx`,
   `mode === 'today'`). **Do not mount it on Dashboard or Unbox.** OQ1 ("replace vs. compose the
   context panel?") is still open pending operator input — wiring it in now would resolve that
   question by fait accompli instead of by validation. Where you identify the Dashboard context-rail
   and Unbox station-context call sites, leave a
   `// TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1` comment and change no rendered UI.
3. **Category IA (validation-log item, Miller's Law cap) and pin-notification-fatigue rules
   (milestone-only) are backend-scoped**, not this task — they land in B0–B3/B1 and F1. F0 touches
   display extraction only.

## Hard rules

- Obey `AGENTS.md` + `.claude/rules/ui-design-system.md` + `.claude/rules/contextual-display.md`.
  This region is a **Workbench** — F0 does not add routing, so selection can stay exactly as it is
  today (local `useState` in the composed `MyDayWorkspace`); do not invent URL-durable selection in
  this pass.
- **Never start, restart, or kill the dev server.** It is already running on `:3050` — attach via the
  Browser pane, don't spawn one.
- **Do not commit or stash.** Stage/edit only the files this task owns; the user manages commits.
- Preserve the existing one-row anatomy and `selectedClass` ring exactly as you lift the JSX — this is
  an extraction, not a redesign. No new tokens, no new colors.
- `npm run verify` green before claiming done.

## Order of work

1. `pnpm worklog:tail` → read `docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md` in full (incl. the
   Validation log + amended Open questions).
2. Read the current shape you're extracting from: `src/features/my-day/MyDayWorkspace.tsx`,
   `MyDayContextPane.tsx`, `MyDayOnboardingPanel.tsx`, `useMyDayFeed.ts`,
   `src/lib/my-day/my-day-types.ts`.
3. Create `src/features/my-day/MyDayRail.tsx` — lift the left-column JSX verbatim; props = whatever
   `MyDayWorkspace` currently threads through (`data`, `selectedId`, `onSelect`).
4. Create `src/features/my-day/MyDayTriagePane.tsx` — thin shell wrapping the existing onboarding +
   context-pane stack; no new categorized-board UI.
5. Reduce `MyDayWorkspace.tsx` to a composition of the three modules. Verify Home Today (`/`) renders
   behaviorally identical to before the split (Browser pane: attach, screenshot before/after, click
   through Do next / Assigned / Needs attention / Queues rows and confirm selection still drives the
   right-hand pane).
6. `grep -rl "MyDayWorkspace" src` to confirm no other importer of the pre-split internals broke.
7. `npm run verify`; append a work-log entry (`pnpm worklog "…" --result …`).
8. Update the plan's **Validation log** table with the F0 landing, and note in **Open questions** that
   F1 stays gated on backend B0–B3 plus OQ1/OQ4.

## Definition of done

- `MyDayRail` / `MyDayTriagePane` / `useMyDayFeed` exist as named modules matching the plan's F0 table.
- Home Today (`/`) is visually and behaviorally unchanged, verified in the Browser pane.
- Dashboard and Unbox are untouched beyond the two TODO comments — no rendered UI change there.
- `npm run verify` is green; work-log entry appended.
- `daily-triage-FRONTEND-PLAN-VALIDATION.md` Validation log + Open questions updated to reflect F0
  landing and the still-open gates on F1.
