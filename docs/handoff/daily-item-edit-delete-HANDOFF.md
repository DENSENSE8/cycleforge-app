# HANDOFF — Daily checklist: full item EDIT + REMOVE on the phone

**Paste this entire file as your prompt. It is self-contained.**
Written 2026-09-15 at the close of the mobile-Daily v1 lane. Every "verified" fact below was
read out of the tree or observed in a browser during that lane — do not re-derive them.

---

## 1. Mission

Give `/m/home` (Daily) full item management: **edit** an existing checklist item and **remove**
it from the list, both from the per-item bottom sheet. Desk parity is NOT required in this pass.

The blocking gap: **there is no update endpoint.** `/api/daily-checks/items` has `POST` and
`DELETE` only, and `src/lib/daily-checks/queries.ts` has `createDailyCheckItem` /
`retireDailyCheckItem` and **no update function at all**. Remove already works server-side and
needs only a control; edit needs the whole write path built.

## 2. Operator directives (verbatim, binding)

- "Now I need full edit of the checklist items… Like I need edit and delete?"
- Standing, from the same lane: "I need just a very reliable v1 … extremely simple"
- Standing doctrine: "delete components one by one when I say so" — every removal is
  operator-gated. Do not sweep code you were not asked to delete.

## 3. Two decisions already made — do not re-litigate

### 3.1 It is a BOTTOM SHEET, and it is the EXISTING one

Extend **`MobileDailyDetailSheet`** (`src/components/mobile/daily/MobileDailySheets.tsx:62`).
That component is already the per-item door: the row's `#id` handle opens it, it already loads
links via `useDailyCheckLinks`, and it already paints Kind / Owner / Links / Last mark.

Adding a second sheet for editing would put two surfaces in competition for "everything about
this item". **Do not nest a sheet inside a sheet** — on a 390px phone that is where operators get
lost. Tapping `Edit` swaps the fact rows for fields IN PLACE, the same in-sheet step pattern
`OwnerStep` already uses inside `MobileDailyComposerSheet`.

Target shape:

```
┌─── Ticket #48120 ──────────────┐
│ Kind      Just today           │
│ Owner     Whole shift          │
│ Links     🎫 #48120            │
│ Last mark 09:14                │
├────────────────────────────────┤
│ [ Edit ]   [ Remove from list ]│  ← admin.manage_staff ONLY
└────────────────────────────────┘
```

### 3.2 "Delete" is a RETIRE, and the label must say so

`retireDailyCheckItem` (`queries.ts:275`) runs
`UPDATE daily_check_items SET retired_at = $2::date WHERE id = $1 AND retired_at IS NULL`.
It is **never** a row delete: the marks reference the item, and the half-open window
(`effective_from <= D`, `retired_at > D`) in `ITEMS_ON_DAY_SQL` is what makes a PAST report still
render the item. Dropping the row would rewrite history to claim the check was never on the list.

**The control must read "Remove from the list", never "Delete".** Ship a confirm step: this is
list-wide for every staffer, unlike a tick, which is personal and reversible. Idempotent by
construction — a second retire answers `{ ok: true, changed: false }`.

## 4. The one decision the OPERATOR still owes you

**Titles are not versioned.** One `title` column, and past reports read the live row — so
renaming an item changes what last month's report says a staffer attested to.

- **(A) Allow it; titles are corrections.** Typos/clarifications are the common case, the mark
  still points at the same item id, and the audit row records before/after. **This is the
  recommended default and what the operator was told would ship absent a decision.**
- **(B) Edit = retire + create.** History stays byte-exact, but the item gets a NEW id, marks do
  not carry over, and the retired row lingers in the history band. It also breaks the
  "one item, one identity" property that makes ticket rows joinable.

Ship **(A) + audit row** unless the operator says otherwise. Ask once; do not stall on it.

**Cadence and owner are different** and stricter: `kind` and `assignedStaffId` feed the PER-STAFF
DENOMINATOR in `buildDailyCheckReport` (`countsFor` / `totalFor`), so flipping
`recurring → once` changes the arithmetic of every past report, not just its wording.
**Leave cadence OUT of v1.** If you allow an owner change, restrict it to items whose
`effective_from` is today.

## 5. What to build

### 5.1 Query — `src/lib/daily-checks/queries.ts`

```ts
export async function updateDailyCheckItem(args: {
  orgId: string;
  itemId: number;
  title?: string;
  assignedStaffId?: number | null;
}): Promise<DailyCheckItem | null>;   // null = no such row in this tenant, or retired
```

- `withTenantTransaction(orgId, …)`, exactly like its neighbours. Never bare `pool`.
- Refuse a retired row (`WHERE id = $1 AND retired_at IS NULL`) — editing history is not the ask.
- Return the full `DailyCheckItem` so the client can patch its cache. **`DailyCheckItem` now has a
  required `ticketId: number | null`** (added 2026-09-15) — the created-item path returns `null`
  for it; an update should return the item's real linked ticket or re-read it.
- An owner is only legal on `kind: 'once'` — mirror the `superRefine` rule the create body
  already enforces (`route.ts:24-32`).

### 5.2 Route — `PATCH /api/daily-checks/items?id=123`

Copy the shape of the existing handlers in `src/app/api/daily-checks/items/route.ts` verbatim:

- `export const PATCH = withAuth(async (request, ctx) => {…}, { permission: 'admin.manage_staff' })`
- Zod body, first-issue-wins 400 (`route.ts:48-55` is the pattern).
- Validate a named owner exists with `dailyCheckStaffExists` → operator-facing 400, not an FK 500
  (`route.ts:58-68`).
- **Audit it.** Structural list changes audit; ticks deliberately do not. Add
  `DAILY_CHECK_ITEM_UPDATE: 'daily_check_item.update'` to `AUDIT_ACTION` in
  `src/lib/audit-logs.ts` (beside `DAILY_CHECK_ITEM_CREATE` / `…RETIRE`, lines 349-350) and call
  `recordAudit(pool, ctx, request, { source: 'home-daily', action: …, entityType:
  AUDIT_ENTITY.DAILY_CHECK_ITEM, entityId: String(itemId), before, after })`.
  **`before`/`after` are the whole point** — they are how a manager sees that a title changed.
- 404 when the query returns null. 500 logs `[daily-checks] item update failed:`.

### 5.3 Client hook — `src/lib/daily-checks/use-daily-checks.ts`

`useItemActions(dateKey)` already returns `{ addItem, retireItem }` (line 168). Add `updateItem`
in the same style: `useMutation`, `onSuccess: invalidate` (the file prefix-invalidates
`['daily-checks']`, so a list edit does not need the day key).

### 5.4 The sheet — `src/components/mobile/daily/MobileDailySheets.tsx`

- Gate both controls on `has('admin.manage_staff')` from `useAuth()` — the same check
  `MobileDailyChecklist` already makes for the Add FAB (`canManage`).
  **Absent, not disabled**: the registry's rule is "a nav row that 403s is worse than an absent
  one", and the route will 403 anyway.
- Edit mode: title field + owner (owner only if you took §4's option). Reuse
  `TITLE_INPUT_CLASS` from `./MobileDailyComposerFields` — it already wears `text-role-field`.
- Confirm on remove. `requestConfirm` from `@/design-system/components/confirm` is the house
  confirm and is already used by `TicketComposer`; check it renders acceptably at phone width
  before committing to it, otherwise a two-tap in-sheet confirm is fine.

## 6. Repo state you inherit (verified 2026-09-15, all green)

- **`/m/home`** renders `MobileDailyChecklist`; nav leaf `daily → /m/home`, title `'Daily'`.
  `/m/checklist` is a DIFFERENT job (SKU-kit/QC editor) and was deliberately kept — do not fold.
- **Composer** = `MobileDailyComposerSheet`, stripped to four controls by operator order:
  `Task | Ticket` switcher (`DAILY_COMPOSER_SUBJECT` + `setComposerSubject` in
  `src/lib/daily-checks/composer.ts`), one field, the ticket chip slider, the CTA.
  **No sheet title, no live hint, no cadence/owner/links disclosure** — if you re-add any of it,
  you are undoing an explicit instruction.
- **Ticket face** derives `Ticket #N` + a real `ZENDESK_TICKET` link and forces `kind: 'once'`.
  **Task face never parses a number** — intent is declared, not guessed.
- **Ticket slider** = `MobileDailyTicketSlider`, ABOVE the field, fed by
  `GET /api/daily-checks/ticket-candidates?query=` (anchor-free; the support link route needs an
  entity anchor a checklist item has none of). Chips carry the house `Ticket` icon, ALWAYS orange
  (`text-text-warning`).
- **Rows** (`MobileDailyRow`) paint plain titles (no emoji glyph on the phone) plus a rightmost
  orange ticket mark when `item.ticketId != null`. It is a MARK, not a control.
- **`DailyCheckItem.ticketId`** rides `ITEMS_ON_DAY_SQL` via a `LEFT JOIN LATERAL` on
  `daily_check_item_links` (first `ZENDESK_TICKET`, by `created_at`).
- **`DailyCheckStaffRow.markedAtByItemId`** (itemId → ISO instant) exists — per-task check times,
  earliest-wins on duplicates. Built for the manager report; do not remove.
- **Reset-all** exists end to end: `clearDailyCheckMarks` → `DELETE /api/daily-checks/mark?date=`
  → `useResetDay` (optimistic). **No CTA is wired yet** — still an open increment.
- **`role-field`** (`tailwind.config.mjs`) is 16px and deliberately NOT density-scaled: iOS Safari
  zooms any focused input under 16px, and the `user-scalable=no` escape is ignored on iOS AND
  fails this repo's axe `meta-viewport` gate. Every mobile input wears it, pinned by
  `src/design-system/tokens/touch-field.test.ts`. **Any new phone input must use it.**
- **Mobile radii**: `MOBILE_CARD_CORNER` / `MOBILE_ROW_CORNER` / `MOBILE_CONTROL_CORNER`
  (`rounded-2xl`/`xl`/`lg`) in `src/design-system/tokens/radius.ts`. `cornerClass()` is
  deliberately `rounded-none` for desk chrome — never use it on a phone surface, and never write
  a raw `rounded-*`.
- **`useTicketComposer`** graduated to `src/lib/composer/use-ticket-composer.ts` so a `/m` file
  can reach ticket-composer behaviour legally. `TicketComposer.tsx` keeps the desk chrome.

### Known open issues (not yours unless you choose them)

- `/m/home` logs a **hydration mismatch** ("server rendered HTML didn't match the client"). It
  self-heals by re-render. Unattributed; worth its own pass.
- **No dedupe**: two items can both link ticket 48120, and there is no reverse lookup
  (`item → links` only). The manager report will want `dailyCheckItemsForTicket`.
- `TicketComposerApi = ReturnType<typeof useTicketComposer>` violates the repo's
  no-`ReturnType`-contract rule. Pre-existing; a real refactor, not a drive-by.

## 7. Laws that bind this work

- **Design-system protocol:** `node tools/design-mcp/ds.mjs contract "<job>"` BEFORE writing a
  component, `ds.mjs tokens <axis>` before typing any literal, `ds.mjs critique <file>` after
  editing. Project hooks deny `src/**/*.{tsx,jsx,css}` writes without a fresh session stamp.
  The MCP shim has been flaky this week — **the CLI is the reliable form**.
- **Boundary:** `src/components/mobile/**` + `src/app/m/**` may import `src/design-system/**`,
  `src/components/ui/**`, `Icons`, `identity`, `providers`, `error`, and logic under
  `src/lib/**` / `src/hooks/**` / `src/contexts/**` / `src/utils/**`. NEVER a desktop feature dir
  (`src/features/**`, `src/components/station/**`, …). **Type-only imports count.** Check with
  `node tools/design-mcp/ds.mjs boundary <file>`; the gate is shrink-only against
  `scripts/boundary-exemptions.ts` (95 entries).
- **Mobile surface law** (`docs/mobile-first/SURFACE_LAW.md`): one job per screen; one sticky
  primary CTA in the thumb zone; ≥44px hit targets (`min-h-11` / `IconButton size="touch"`);
  semantic tokens only — no raw hex, no bare palette steps; disabled CTAs name what is missing.
- **Tenancy:** every daily-checks query goes through `withTenantTransaction` / `tenantQuery`.
  `staffId` comes from the session, NEVER a request body. Day keys use
  `getCurrentPSTDateKey()` — **never `now()::date`**, the server clock is UTC and rolls over
  mid-afternoon.
- **Tests earn their place:** assert what a consumer observes, not wiring. Do not add a test so
  the change "has tests" — use a throwaway script for that.

## 8. Close-out chain — run for EVERY increment

```bash
# 1. the suites this work touches
pnpm exec tsx --test src/lib/daily-checks/*.test.ts \
  src/components/mobile/daily/mobile-daily-row.test.tsx \
  src/design-system/tokens/touch-field.test.ts

# 2. per-file adjudication while you work
node tools/design-mcp/ds.mjs boundary <file>
node tools/design-mcp/ds.mjs critique <file>

# 3. the gate — 5 checks: Lint · Typecheck · Boundary · Nav names · Mobile-first
pnpm verify:fast
```

**Baseline at handoff: `verify:fast` PASSED (5 gates), 47/47 on the suites above.** If you see a
failure in `src/features/daily-checks/**`, `src/components/tables/compound/**`, or
`src/components/outbound/**`, check `git status` first — sibling lanes edit this tree live and
their breakage is not yours to fix. Verify only that YOUR files are clean
(`pnpm exec tsc -p tsconfig.verify.json --noEmit | grep <your file>`).

## 9. Browser verification (required — this is a UI change)

A dev server on **3077** is the verification surface. If none is running, start it with the DSNs
aligned or the new `db-single-branch` guard 500s every route (`.env` names a different Neon branch
than `.env.local`):

```bash
# via the hub process supervisor, not a bare bash job
application: bash
args: ["-lc", "set -a; . ./.env; . ./.env.local; set +a; \
  export TENANT_APP_DATABASE_URL=\"$DATABASE_URL\"; export POSTGRES_URL=\"$DATABASE_URL\"; \
  exec node node_modules/next/dist/bin/next dev --turbopack -p 3077"]
ready: { log: "Local:.*http", port: 3077 }
```

Sessions expire fast. Re-mint before probing, then run the probe in the SAME command:

```bash
rm -f tests/.auth/admin.json
# tmp-mint.mts: import the default export of ./tests/e2e/global-setup and call it with
#   { projects: [{ use: { baseURL: 'http://127.0.0.1:3077' } }] }
pnpm exec tsx tmp-mint.mts && node tmp-your-probe.mjs
```

Probe pattern that works (Playwright, `storageState: 'tests/.auth/admin.json'`,
`viewport: 390×844`, `isMobile: true`):

- wait for `getByText(/of \d+ checked/)` — the page is ready when the counter paints
- the Add FAB is icon-only: find it with `getByRole('button', { name: /Add task/i })`
- open a row's detail with the `#id` handle: `getByRole('button', { name: /Details for / })`
- assert the DATA too, not just pixels: `GET /api/daily-checks?date=<dateKey>` and
  `GET /api/daily-checks/items/<id>/links` via `page.request`
- **delete your probe scripts before you finish**

## 10. Acceptance

- `PATCH` edits a live item's title (+ owner if taken), refuses a retired one (404), refuses an
  owner on a recurring item (400), and writes an audit row carrying `before`/`after`.
- The detail sheet edits and removes, both gated on `admin.manage_staff` and ABSENT without it.
- Remove reads "Remove from the list", confirms, and a second remove is a no-op, not an error.
- Browser-verified at 390×844: edit a title → the row repaints; remove → the row leaves today's
  list; reload → both persisted.
- `ds critique` 0 arbitrary literals on every touched `.tsx`; `ds boundary` pass.
- `verify:fast` green (5 gates), suites in §8 green.
- Append one row per increment to the ledger in `docs/todo/mobile-first-foundation-PLAN.md` §2
  (the daily rows are `DC1`–`DC4`; use `DC5`+). Increment rule: one concern, ≤6 files, lands
  green alone, reverts alone.

## 11. After this — the real end goal

The operator's stated destination is a **manager daily report**: *"the manager would be able to
look at all the daily reports via a certain day and have things available like the staff member
checked off this checklist at this time, completed this task at this time."*

`markedAtByItemId` (§6) was built for exactly that and is unused so far. The planned surface is
`/reports?tab=staff` on the desk plus `/m/reports` (phone first, per SURFACE_LAW) — see
`docs/todo/nav-lanes-reports-IA-PLAN.md` Track R. Do not build it in this pass; do not remove the
field it depends on.
