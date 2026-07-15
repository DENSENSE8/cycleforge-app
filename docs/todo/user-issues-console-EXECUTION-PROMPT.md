# EXECUTION PROMPT — Reported-Issues console (full-CRUD Workbench)

> Paste everything below the line into a fresh Claude Code / Cursor session at the repo root
> (`/Users/icecube/repos/cycleforge-app`), on the lane you want this built in (see WORKTREE-LANES;
> a `support`/`ops` lane or `main` dogfood). Default scope: **Phase 1 (UIC-1) + Phase 2 (UIC-2)** —
> the read API + the read-only console. Stop at every **HUMAN GATE**. Append a `pnpm worklog` entry
> when each phase lands.

---

ultracode

# Mission

Build the **Reported-Issues console** — a full-CRUD **Workbench** over the live, tenant-hardened
`user_reported_issues` table — by executing `docs/todo/user-issues-console-plan.md`. Today only
**Create** exists (`FeedbackWidget` → `POST /api/user-issues`); there is **no read/update/delete API
and no management surface**. You are adding Read + Update + (gated) Delete and the display that shows
them, **composing house SoT shells and inventing nothing beside them**.

**Product framing:** Cycle Forge is sellable multi-tenant B2B SaaS; USAV is the dogfood tenant. This
console shows each org **its own** issues only — never cross-tenant. `orgId` comes from `ctx`, never
the body.

**This run's default scope: UIC-1 + UIC-2 (read API + read-only console). UIC-3/4/5 only if the
human expands the run. UIC-4 (soft-delete migration) is a HUMAN GATE — never apply a migration
without explicit go.**

# Read first (in this order, before writing)

1. `docs/todo/user-issues-console-plan.md` — **SoT for this run.** Memorize §1 (backend reality),
   §3 (CRUD endpoints), §4 (compose which shells), §5 (compound), §6 (phases), §7 (hard safety).
2. `AGENTS.md` + `.claude/rules/source-of-truth.md` + `.claude/rules/backend-patterns.md` +
   `.claude/rules/ui-design-system.md` + `.claude/rules/contextual-display.md` +
   `.claude/rules/display/workbench.md` (region = **Workbench**; do not blend archetypes).
3. Live backend contracts (extend, don't fork):
   - `src/lib/user-issues/issues.ts` (grow: `listReportedIssues`, `getReportedIssue`,
     `updateReportedIssue`, `setIssueStatus`, `softDeleteReportedIssue`)
   - `src/app/api/user-issues/route.ts` + `resolve/route.ts` (the existing skeleton to mirror)
   - `src/lib/drizzle/schema.ts` (`userReportedIssues`) · `src/lib/audit-logs.ts` (`USER_ISSUE*`)
   - `src/lib/auth/permission-registry.ts` + `src/lib/auth/route-permission-manifest.test.ts`
   - `src/lib/tenancy/db.ts` (`tenantQuery`) · `src/lib/auth/withAuth.ts`
4. SoT UI shells to compose (do NOT hand-roll equivalents):
   - `src/components/layout/SidebarShell.tsx` (+ `SidebarRailShell.tsx` if an activity rail fits)
   - `@/design-system/components/monitor` (`KpiStrip`, `KpiTile`, `DeltaChip`, `SectionCard`)
   - `src/components/ui/TimelineSection.tsx` / `EventTimeline.tsx` + `src/lib/timeline/*`
   - `src/components/ui/CopyChip.tsx` · `src/design-system/primitives` (`Button`, `IconButton`)
   - `src/design-system/tokens/focus-ring.ts` (`focusRing`) · `src/utils/date.ts`
   - `src/design-system/foundations/motion-framer.ts` (`framerPresence.workbenchPane`) + hooks
   - the `sidebar-mode` skill (feature = a `?mode=` MODE, not a one-off panel)
   - reference Workbench: `src/features/operations/workspace/OperationsWorkspace.tsx`,
     `ProductsWorkspace` / `ReceivingRightPane.tsx` (right-pane crossfade)

# Non-negotiable house rules (violating any = redo)

- **Compose → grow the SoT → compound.** Scan siblings + `@/design-system/**` before implementing.
  A genuinely new job earns a **new sibling that composes the shared primitive** — never a fork.
- **Backend:** every route `withAuth({ permission })` → validate (Zod) → domain helper → map
  404/409/200 → `recordAudit` → `after()`. No business logic in the handler. Status changes ONLY via
  `setIssueStatus(orgId, id, to, { expectedFrom })` (atomic conditional UPDATE → **409** on
  conflict) — never a raw scattered `UPDATE … status`.
- **Tenancy:** `tenantQuery` / `withTenantTransaction`; `orgId` from `ctx`. New permission = registry
  entry **plus** manifest-test entry (both, same PR).
- **Display:** one-row anatomy (title → meta → chips); selection = ring+bg only; crossfade only the
  right pane via `useMotionPresence(framerPresence.workbenchPane)`; teaching empty branched by
  filter; degrade-not-fail per sub-resource.
- **Tokens only:** color from semantic tokens, spacing from intents (`inset-*`/`stack-*`, never
  `p-[Npx]`), focus from `focusRing(...)`, z-index named, `IconButton size` (never hand-set `h-N w-N`).
  Guards WILL fail otherwise (`test:ds-guards`).
- **Presentation kinds via SoT:** dates → `date.ts`; ids → `CopyChip`; status → the new
  `userIssueStatusTone` registry (do NOT inline a status→color map in a component).

# Phase UIC-1 — Read API + domain (no migration)

1. Grow `src/lib/user-issues/issues.ts`: `listReportedIssues(orgId, filters)` (LEFT JOIN `staff` for
   reporter name; keyset paginate on `(created_at, id)`; filter `deleted_at IS NULL` — column may not
   exist yet, so guard/omit until UIC-4) and `getReportedIssue(orgId, id)`. Keep Deps-injected `query`.
2. `GET /api/user-issues` (list, Zod-parse query params) + `GET /api/user-issues/[id]` — both
   `withAuth({ permission: 'support.issues.view' })`.
3. Add `support.issues.view` to `permission-registry.ts` (category `ops`) **and**
   `route-permission-manifest.test.ts`.
4. Unit-test the two domain helpers DB-free via the Deps `query` fake (extend
   `src/lib/user-issues/issues.test.ts`).
**Verify:** `npx tsc --noEmit -p tsconfig.json` · `npm run test:user-issues` · `npm run test:auth` ·
`npm run audit-route-auth:check`. Then `pnpm worklog "UIC-1 read API + support.issues.view" --result done --ticket UIC-1`.

**HUMAN GATE:** confirm placement (`/support?mode=issues` recommended, vs Operations `?mode=feedback`
vs Home) before building the shell.

# Phase UIC-2 — Read-only console (Workbench)

1. Add the `issues` MODE (per `sidebar-mode` skill): `?mode=issues` on the chosen surface, mode rail
   via `HorizontalButtonSlider`, rendered through `SidebarShell`.
2. Sidebar list (compose `SidebarShell`): rows = one-row anatomy; status dot + type chip from the new
   `userIssueStatusTone`; selection ring+bg; filters `?status=/?type=/?reporter=/?q=` in URL.
3. Right pane (crossfade on `?issueId=`): fact stack (status/type/reporter/page/dates/github via
   `CopyChip`) + description in `SectionCard` + a placeholder actions row (wired in UIC-3).
4. Monitor rollup region: `KpiStrip` (Open · In-progress · Deployed 7d · median time-to-deploy).
5. Empty/loading/error states per house rules.
**Verify:** `npm run test:ds-guards` · a Playwright spec (use the `e2e-spec-writer` agent) driving
list → select → detail. Then `pnpm worklog "UIC-2 read-only console" --result done --ticket UIC-2`.

# Phase UIC-3 — Update (only if human expands scope)

`setIssueStatus(expectedFrom)` + `updateReportedIssue` in `issues.ts`; `PATCH /api/user-issues/[id]`
`withAuth({ permission: 'support.issues.manage' })` (+ registry + manifest + `USER_ISSUE_UPDATE`/
`_STATUS` audit); wire Claim/Resolve/Reopen/Edit optimistically (TanStack `onMutate`→rollback→
`invalidate`), 409 → refetch + toast. Keep the machine `/resolve` webhook untouched.
**Verify:** `test:user-issues` (409 path) · e2e claim/resolve.

# Phase UIC-4 — Delete (HUMAN GATE: DB migration)

Author `deleted_at TIMESTAMPTZ` + partial index via the `db-migration-author` skill. **Do not apply**
— hand to the human for `db:migrate:dry`→confirm→`db:migrate`. Then `softDeleteReportedIssue` +
`DELETE /api/user-issues/[id]` + confirm-then-commit dialog + `deleted_at IS NULL` filters.
**Verify:** `tenancy:coverage` · e2e delete.

# Phase UIC-5 — Compound

`userIssueEventsToTimeline` adapter (`src/lib/timeline`) → `TimelineSection` in the detail pane;
finalize `userIssueStatusTone`; **promote a shared `ticketStatusTone`** used by both `/forge`
TicketStatus chips and this console.

# Out of scope (do not do unless the human asks)

- Applying ANY migration (UIC-4 is author-only until the gate).
- Cross-tenant views / a global issue list.
- Rewriting `FeedbackWidget` or the `/resolve` webhook.
- A second timeline component, a page-local card shell, or a status→color map inlined in a view.

# Definition of done (per phase)

Green `tsc`, the phase's verify commands pass, guards clean (`test:ds-guards`,
`audit-route-auth:check`), a `pnpm worklog` entry appended, and (if flipping a ticket) the
`master-plan.mdx` `UIC-*` status updated via `master-plan-set-status.mjs`.
