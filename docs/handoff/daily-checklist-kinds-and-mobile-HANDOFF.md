# HANDOFF — Daily checklist: item kinds, the add form, and the mobile rewrite

**For:** a fresh-context coding agent (paste this whole file as the prompt).
**Written:** 2026-09-15. **Status:** ready to execute. **Operator verifies by clicking.**

---

## Mission (one line)

Give the daily checklist a real **kind** (`recurring` vs `once`), an **owner** for one-offs, and a
**typed link** to the thing a check is about — then rewrite the phone checklist components so the
add form and the new facts are completable on `/m` first.

## The ruling this implements (operator, 2026-09-15)

- "Type" means **cadence**, not subject. `recurring` = the shift attestation that returns every day;
  `once` = a one-off that must NOT come back tomorrow. Column name is **`kind`**, values
  `recurring` / `once` — not "daily/ephemeral", because the surface is already called Daily and
  "daily type" inside Daily reads as a tautology on the floor.
- Ticket / work order / tracking is **not a kind**. It is an attachment, and
  `daily_check_item_links` already exists for it. Four kinds would mean four lists, four reports and
  four denominators; the operator asked for one list.
- The cadence fact paints **in the list, not on the state pill**. The pill answers "did I do it";
  a second meaning on one control is the error banned on the select gutter and the station mode row.
- **Only the exception is marked.** A `once` item says so; `recurring` says nothing. Precedent is in
  `daily-task-compound-view.ts`: "Nothing here is `alert`. An unchecked shift item is the normal
  state of the morning; painting a hundred of them loud would leave no signal."

## Ground truth you inherit (verified 2026-09-14/15 — do not re-derive)

### Data
1. `daily_check_items` — `id BIGSERIAL`, `organization_id UUID NOT NULL` (no default; RLS installed
   by `enforce_tenant_isolation`), `title`, `sort_order`, `effective_from DATE NOT NULL`,
   `retired_at DATE`, timestamps. Window rule: in effect on day D when
   `effective_from <= D AND (retired_at IS NULL OR retired_at > D)`. Migration:
   `src/lib/migrations/2026-08-19b_daily_checks.sql` — read its header before touching the schema;
   it explains why the window is two civil dates and not an `active` boolean.
2. `daily_check_marks` — unique `(organization_id, item_id, staff_id, marked_on)`. **The grain is
   per staff per civil day**, so every item currently means "everyone does it". `marked_on` is the
   warehouse civil day from `getCurrentPSTDateKey()`, never `now()::date`.
3. `daily_check_item_links` — `2026-08-19d_daily_check_item_links.sql`, with a named SQL CHECK over
   `DAILY_CHECK_LINK_ENTITY_TYPES = ['ZENDESK_TICKET', 'WORK_ORDER']`
   (`src/lib/daily-checks/types.ts`). `DailyCheckItemLink` is already typed;
   `src/features/daily-checks/build-daily-check-inspector-leaves.tsx` already renders link leaves.
4. API: `GET /api/daily-checks?date=` (report: `items`, `staff`, `mine`, totals),
   `POST /api/daily-checks/mark` (staffId from the session, NEVER the body; idempotent),
   `POST|DELETE /api/daily-checks/items` (gated `admin.manage_staff`; create is audited, marks are
   not — the mark table IS the attribution trail). Read model: `src/lib/daily-checks/queries.ts`.
5. Query layer: **`src/lib/daily-checks/use-daily-checks.ts`** (`useDailyChecks`, `useToggleCheck`,
   `useItemActions`). It lives in `lib` on purpose — `/m` may not import desktop feature dirs.

### Surfaces
6. **Desk** `/` → `HomeWorkspace` → `HomeDailyMode` (`src/features/home/HomeDailyMode.tsx`): the
   slot `DataTable`, compound rows, toolbar search + `DataTableFilterMenu` + fullscreen, URL sort,
   `DeskActionSlotRegistrar` + `DeskHeaderAction` "Add task" top-right, `DailyComposerRow` under the
   table. Status filter default is **`all`** — a ticked row must not vanish.
7. **Phone** `/m/home` → `src/components/mobile/daily/`:
   `MobileDailyChecklist.tsx` (list + `TabSwitch` All/Open/Done + sticky CTA),
   `MobileDailyRow.tsx` (check · title · bare id), `MobileDailySheets.tsx`
   (`MobileDailyDetailSheet`, `MobileDailyComposerSheet`), test
   `mobile-daily-row.test.tsx`. Nav leaf `daily → /m/home`; `getMobileAppTitle('/m/home') = 'Daily'`.
   ~~`/m/checklist` is the **SKU kit / QC editor** — a different job; leave it alone.~~
   **DELETED 2026-09-15** by operator ruling (*"remove the checklist from the mobile display
   and the checklist components"*). It WAS a different job, which is why it survived this
   long; the operator has now retired the job from the phone. `Daily` (`/m/home`) is
   untouched and is the only checklist word left on `/m`.
8. Row view: `src/features/home/grid/daily-task-compound-view.ts` sets `titleStruck: row.done`
   (painted by `@/design-system/components/StruckLabel` — ONE strike for desk and phone) and
   `identityFace: compoundIdentityFace(row.id, 'Checklist item id')` (bare handle, no `#`, no
   marketplace chip). The Id header word lives on the SHARED track in `compound-columns.ts`.
9. Row shape: `buildDailyTaskRows` (`src/features/home/grid/daily-task-row.ts`), order via
   `sortDailyTaskRows` (`./grid/sort-daily-task-rows.ts`), filter via `daily-check-filter.ts`.

## Phase 1 — schema

One dated, idempotent migration in `src/lib/migrations/` (copy the neighbours' shape: `BEGIN;`,
guarded DDL, `enforce_tenant_isolation` where relevant, ROLLBACK + VERIFY notes in the header).

```sql
ALTER TABLE daily_check_items
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS assigned_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- The emoji itself, not a lucide name: zero render path, works on every face.
  ADD COLUMN IF NOT EXISTS glyph TEXT;

-- Named CHECKs, added the house way: `ADD CONSTRAINT` has no IF NOT EXISTS, so
-- a re-run would abort the whole migration. Guard pattern is verbatim
-- `2026-08-19d_daily_check_item_links.sql` lines 40-44.
DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_kind_chk CHECK (kind IN ('recurring','once'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_glyph_chk
    CHECK (glyph IS NULL OR char_length(glyph) BETWEEN 1 AND 8);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

`glyph` ships in THIS window on purpose: Phase 2's POST body and Phase 4's field 2 both reference
it, so splitting it out would leave a create path that 500s on an unknown column. 8 characters is
the ceiling because a single emoji can be several code units (ZWJ sequences, skin-tone modifiers).

Decisions to honour, and the reasoning to keep in the header:

- **Why a column and not just a one-day window.** A `once` item *can* be expressed as
  `effective_from = D, retired_at = D + 1`, and you SHOULD still write it that way so past reports
  stay honest for free. `kind` exists because the **report question differs**: a recurring item
  missed is a compliance gap, a once item missed is either rolled forward or expired, and a date
  window cannot express that intent. Write both: `kind = 'once'` AND the one-day window.
- **`assigned_staff_id` is nullable and only meaningful for `once`.** The mark grain is per staff, so
  an unowned one-off reads "1 of 5 done" forever. Null = the whole shift, which stays correct for
  every recurring item.
- Add `TRACKING` to `DAILY_CHECK_LINK_ENTITY_TYPES` and to the link table's named CHECK in the same
  migration (one window, one review).
- Do not backfill anything. Every existing row is `recurring` by default, which is what it was.

Apply with `pnpm db:migrate` (dry: `pnpm db:migrate:dry`). Run `pnpm tenancy:audit` after.

## Phase 2 — read model + API

- `DailyCheckItem` (`src/lib/daily-checks/types.ts`) gains `kind: 'recurring' | 'once'` and
  `assignedStaffId: number | null` (plus `assignedStaffName` if the report already joins staff —
  check `queries.ts` before adding a second join).
- `POST /api/daily-checks/items` body: `{ title, kind?, assignedStaffId?, glyph? }` via zod.
  `kind` defaults to `recurring`. When `kind === 'once'`, write the one-day window
  (`effective_from = today`, `retired_at = tomorrow`) inside the same statement that sets `kind`.
  Keep the audit row and extend its `after` payload with the new fields.
- The mark route does not change, and `assignedStaffId` does **not** gate ticking server-side: an
  owner is a hint about who should, not a permission, and a 403 there is one more way to lock a floor
  staffer out mid-shift. (This reverses an earlier suggestion to 403 a non-owner tick.)
- **Therefore the denominator rule below is REQUIRED, not optional — it is the only thing that makes
  an owner mean anything.** `src/lib/daily-checks/report.ts` currently computes ONE
  `total = items.length` (line 44) and hands the same number to every staffer via `emptyRow`, so an
  owned one-off would sit in all five staffers' denominators and produce exactly the
  "1 of 5 done forever" the owner field exists to prevent. Change it to a PER-STAFF total:

  > an item counts toward staffer S's `total` when
  > `kind === 'recurring' || assignedStaffId == null || assignedStaffId === S`

  and drop marks from non-responsible staffers the same way out-of-effect marks are already dropped
  (`report.ts` lines 57-60: "A mark against an item that was NOT in effect that day is dropped, not
  counted: it would push doneCount past `total` and render as '7 of 6'"). `totalPossible` can no
  longer be `total * staff.length` — sum the per-staff totals instead.
- `report.test.ts` gets the cases: an unowned `once` item counts for everyone; an owned one counts
  only for its owner; a mark by a non-owner on an owned item does not inflate anyone's `doneCount`;
  a `recurring` item is unaffected by `assignedStaffId` being set.

## Phase 3 — the cadence fact in the list (both faces)

- Add `daily.kind` to `DAILY_FIELD_CATALOG` (`src/lib/tables/field-catalog/daily.ts`):
  `family: 'daily'`, `displayType: 'tag'`, `slotKinds: ['status', 'subtitle']`, and leave it
  **UNBOUND** in `DAILY_PRODUCT_LAYOUT` — an org binds it if it wants a column. Resolve it in
  `daily-resolve.ts` the way `daily.status` / `daily.team` already are. Its label is `Kind`.
- Default paint, with NO binding required: `once` items carry the word in the compound view's
  **note line** (`teamNote` already owns that slot — compose, do not replace: `firstNote`-style
  priority, e.g. `Today only · 3/5 done`). Recurring items paint exactly what they paint now.
- Owner: when `assignedStaffId` is set, paint `StaffAvatar` + name. The picker anywhere in the
  product is `AssigneeCombobox` via `StageStaffAssignPopover` — **never** `SearchableSelectField`
  for staff (house law, `AGENTS.md`).
- Order: `sortDailyTaskRows`'s unsorted branch keeps authored order; put `recurring` before `once`
  ahead of `sort_order` so the shift list reads first and today's one-offs sit under it. Keep the
  `id` tiebreak so the order stays total.
- Phone: `MobileDailyRow` gets a caption line under the title for `once` (+ owner avatar). The row
  stays three facts plus that caption — if it needs a fourth, it belongs in the sheet.

## Phase 4 — the add form (one vocabulary, two mounts)

Fields, in this order, progressive (only the first is required and visible on open):

1. **Title** — required, autofocus, Enter commits.
2. **Emoji / glyph** — optional. The column lands in Phase 1, so this is live in this pass: a
   curated grid (~48 common emoji + recents), stored as the character itself, capped at 8 chars.
3. **Cadence** — `TabSwitch` segmented: **Every day** (default) · **Just today**. Default recurring,
   because the list is a shift attestation.
4. **Owner** — appears ONLY when "Just today" is chosen. Blank = whole shift.
5. **Link to…** — collapsed row: Ticket · Work order · Tracking. Writes
   `daily_check_item_links`. A tracking value paints with the house last-8 `TrackingChip` — never a
   hand-rolled tracking face, never CSS-truncated.

Mounts: `DailyComposerRow` (desk, under the table, summoned by the top-right CTA) and
`MobileDailyComposerSheet` (phone). Same field order, same vocabulary, same validation. If the two
drift, the form has forked.

## Phase 5 — rewrite the mobile checklist components

This is a rewrite, not a patch, and it stays inside `src/components/mobile/daily/`:

- `MobileDailyChecklist.tsx` — composition only: data, filter state, list, sticky CTA, sheets.
  Sections: recurring first, then "Today only" when any `once` item is in effect. Keep it under
  ~200 lines; extract leaves instead of growing it (`ds_critique` flags size).
- `MobileDailyRow.tsx` — check · title (`StruckLabel`) · bare id, plus the `once` caption + owner
  avatar. Keep `min-h-14` and the `<label htmlFor>` wiring: `<button>` is labelable, so the whole
  title is the tick target with no second handler.
- `MobileDailySheets.tsx` — detail sheet gains Kind, Owner and Links rows (reuse the facts the
  report already assembles; never re-count in the view). Composer sheet gains the Phase 4 fields.
- **Laws that are not negotiable here:** cards + `BottomSheet` on phone, never a `DataTable`
  (SURFACE_LAW §5 and the `BottomSheet` contract); `TabSwitch` for the small mode switch, not path
  chips; ONE sticky primary CTA; no hover-only affordance; touch floors ≥44px; imports limited to
  `components/ui`, `components/Icons`, `src/design-system`, and logic (`lib`, `hooks`, `contexts`,
  `utils`) — a desktop feature import fails the boundary gate.

## Hard rules

- **Never fork the compound skeleton.** `compound-row-model.test.ts` asserts every family mounts the
  SAME array object as `COMPOUND_TRACKS`; a family-local `.map()` to relabel a track fails it. Column
  words live on the shared track; a family contributes DATA (`identityFace`, `titleStruck`, slot
  values), never geometry or headers.
- **The select gutter stays `chrome="hover"`** for every family, Daily included (operator ruling
  2026-09-14: "the checklist icon should display on hover just like all the other slot data tables").
  Do not stand the box; do not thread a per-family chrome prop.
- Marks stay per staff: `staffId` from the session in the mark route, always.
- Filter default stays `all`. A ticked row must never disappear.
- One strike: `StruckLabel`. One id face: `compoundIdentityFace`. One query layer:
  `lib/daily-checks/use-daily-checks`.
- Design MCP before and after any UI write: `ds_contract` with the job, `ds_tokens <axis>` for any
  literal, `ds_critique <file>` after. Hooks deny `src/**/*.{tsx,jsx,css}` writes without a fresh
  session stamp.
- Today (`MyDayWorkspace`) and Tasks (`TasksWorkbench`) stay unmounted with their backends intact.
  Deleting either remains operator-gated, one component per pass.

## Acceptance (operator-verifiable)

1. `pnpm db:migrate:dry` then `pnpm db:migrate` apply cleanly; `pnpm tenancy:audit` stays green.
2. Desk `/`: Add task → "Every day" creates an item that is still there tomorrow; "Just today"
   creates one that is **gone tomorrow** and shows "Today only" in the note line today.
3. A `once` item with an owner shows that staffer's avatar on both faces AND counts only in that
   staffer's denominator — the other four still read "N of M" over their own list. An unowned `once`
   item counts for everyone. A `recurring` item is unaffected either way.
4. Phone `/m/home`: the same two creations work from the sheet, recurring and "Today only" render as
   sections, and the detail sheet shows Kind / Owner / Links.
5. Linking a ticket, a work order and a tracking number each round-trip and paint their house faces
   (tracking = last-8 chip).
6. Ticking still strikes the title, still survives a reload, and the ticked row stays in the list.
7. The select gutter still reveals on hover on Daily exactly as it does on To-ship.
8. Gates: `pnpm verify:fast` (lint + typecheck + boundary), `pnpm run eval:cohort slot-table`
   (tripwires + verify), unbox 56 (`arrival-station-tape`, `photo-upload-queue-*`,
   `complete-carton`, `scan-verdict`), `nav-registry` + `mobile-context-navigation`, and the
   colocated daily/compound/mobile tests. Append the increment to
   `docs/todo/mobile-first-foundation-PLAN.md`.

## Non-goals

- No fourth task system, and no per-subject lists ("ticket checklist", "tracking checklist").
- No reset-all and no retire-from-UI in this pass — they are their own increment (the retire API
  already exists and is unreachable by design until then).
- No day stepper, no roster report panel, no inspector right-rail door.
- ~~No changes to `/m/checklist` (SKU kit / QC editor).~~ **Moot — that route is DELETED
  (2026-09-15).** This handoff's Daily work is unaffected: it never imported from
  `src/components/mobile/checklist/**`.
