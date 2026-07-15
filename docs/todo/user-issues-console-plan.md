# Reported-Issues console — full-CRUD Workbench over `user_reported_issues`

> **Status:** PLAN (2026-07-15). Family `UIC-*`. Region contract = **Workbench** (+ a Monitor
> rollup region). Executable companion: [`user-issues-console-EXECUTION-PROMPT.md`](./user-issues-console-EXECUTION-PROMPT.md).
>
> **Product framing:** Cycle Forge is sellable multi-tenant B2B SaaS; USAV is dogfood. This is a
> per-tenant operator console over each org's own `user_reported_issues` — never cross-tenant.

## 0. Why

`user_reported_issues` is live + tenant-hardened (applied 2026-07-11, RLS+FORCE) and captured by
`FeedbackWidget`, but there is **no management surface** and only **Create** exists. Operators can't
see, triage, edit, or close reported issues in-app. This builds the missing Read/Update/Delete +
the Workbench that displays them — composing house SoT shells, inventing nothing beside them.

## 1. Current backend reality (read the code, don't re-derive)

| CRUD | Today | File |
|---|---|---|
| Create | `POST /api/user-issues` — auth, rate-limit, audit, GitHub mirror (dogfood org only) | `src/app/api/user-issues/route.ts` |
| Read | **none** | — |
| Update | `resolveReportedIssue` → `deployed`, **machine webhook only** (`x-forge-token`) | `src/app/api/user-issues/resolve/route.ts` |
| Delete | **none** | — |
| Domain | `createReportedIssue`, `attachGithubIssue`, `resolveReportedIssue` (Deps-injected `query`) | `src/lib/user-issues/issues.ts` |
| Model | `userReportedIssues` pgTable; indexes `org_status`, `org_reporter`, `org_github` | `src/lib/drizzle/schema.ts` |
| Audit | entity `USER_ISSUE`; actions `USER_ISSUE_REPORT`, `USER_ISSUE_RESOLVE` | `src/lib/audit-logs.ts` |

Facts that shape the build:
- **Status vocab** `pending | in-progress | deployed` mirrors master-plan `TicketStatus`
  (`src/lib/master-plan/ticket-status.ts`) **verbatim** → shared-tone promotion target.
- **`in-progress` is unused today** (reports jump `pending`→`deployed`). The console fills it via
  a session **Claim** action.
- The atomic flip already uses a conditional `UPDATE … AND status <> 'deployed'` — the template for
  the `expectedFrom` concurrency pattern below.
- Columns: `id, organization_id, reporter_staff_id, issue_type, title, description, page_path,
  github_issue_number, github_issue_url, status, resolution_commit, resolved_at, client_event_id,
  created_at, updated_at`. **No `deleted_at`** (soft delete needs a migration).

## 2. Region contract, placement, density

- **Contract = Workbench** (`.claude/rules/display/workbench.md`): pick a record → view → edit →
  persist; durable **`?issueId=`** selection; CRUD. Secondary **Monitor rollup region** (KPI strip).
- **Placement (recommended): a new sidebar MODE on `/support`** — `/support?mode=issues`. Rationale:
  `support.*` permissions already exist (`support.thread.view/manage`); same operator job (triage
  inbound); Operations was deliberately slimmed (`plans` moved to Home), so don't re-add a mode there.
  *Alternatives to confirm at the HUMAN GATE:* Operations `?mode=feedback` (reuses `OperationsWorkspace`)
  · Home (where the plans/forge loop lives). Follow the `sidebar-mode` skill either way.
- **Density:** collection = `ops`; KPI region = `rollup`.
- **URL is the state SoT:** `?mode=issues` `?status=` `?type=` `?reporter=` `?q=` `?issueId=`.

## 3. Backend — complete the CRUD (house route skeleton)

Grow `src/lib/user-issues/issues.ts` (keep Deps-injected `query`); thin routes per
`.claude/rules/backend-patterns.md` (`withAuth({permission})` → Zod → domain → 404/409/200 →
`recordAudit` → `after()`). Never inline a raw status `UPDATE`.

| Endpoint | New domain helper | Notes |
|---|---|---|
| `GET /api/user-issues` | `listReportedIssues(orgId, {status?, type?, reporterId?, q?, cursor?, limit?})` | tenant-scoped; **LEFT JOIN `staff`** for reporter name; keyset pagination on `(created_at, id)`; uses `idx…_org_status`; `deleted_at IS NULL` |
| `GET /api/user-issues/[id]` | `getReportedIssue(orgId, id)` | 404 map |
| `PATCH /api/user-issues/[id]` | `updateReportedIssue(...)` + `setIssueStatus(orgId, id, to, {expectedFrom})` | session-authed field edits + status change (**Claim** `pending→in-progress`, **Resolve** `→deployed`, **Reopen** `→pending`); `expectedFrom` → **409** on conflict |
| `DELETE /api/user-issues/[id]` | `softDeleteReportedIssue(orgId, id)` | soft delete (needs `deleted_at`) |

Cross-cutting:
- **Permissions (new):** `support.issues.view` + `support.issues.manage` → add to
  `src/lib/auth/permission-registry.ts` **and** `src/lib/auth/route-permission-manifest.test.ts`
  (the `permission-registry-guard` enforces the pair; CI `audit-route-auth:enforce` blocks ungated).
- **Audit (new actions):** `USER_ISSUE_UPDATE`, `USER_ISSUE_STATUS`, `USER_ISSUE_DELETE`.
- **Keep the machine `/resolve` webhook** (`x-forge-token`) untouched — the console PATCH is a
  **sibling** session path, not a replacement. `setIssueStatus` is the shared helper both call.
- **Tenancy:** every query via `tenantQuery` / `withTenantTransaction`; `orgId` from `ctx`, never body.

**ASK-FIRST (DB, gated):** soft delete needs a migration adding `deleted_at TIMESTAMPTZ` + a
partial index; author via the `db-migration-author` skill, apply via `db:migrate:dry`→confirm→`db:migrate`.
Phases 1–3 need **no** migration. If delete is deferred, ship without it.

## 4. Frontend — the display (compose named shells; grow the SoT)

Master–detail Workbench; the map is stable, only the focus surface crossfades.

- **Sidebar (stable map):** compose `SidebarShell` (owns search band + `HorizontalButtonSlider`
  mode rail). List = `divide-y` `<ul>` (or `SidebarRailShell` for the activity-rail engine).
  **One-row anatomy** (`.claude/rules/ui-design-system.md`): title `truncate font-bold` → meta
  `reporter · page · relative-date` → trailing **status dot + type chip**. Selection = `bg-blue-50
  ring-1 ring-inset ring-blue-400` only (no size shift).
- **Filter band:** `?status=/?type=/?reporter=/?q=` in the URL; empty copy branched by filter
  (no-data vs no-match); `focusRing('field')` on inputs.
- **Right pane (crossfade on `?issueId=`):** `useMotionPresence(framerPresence.workbenchPane)` +
  `useMotionTransition(framerTransition.workbenchPaneMount)`; the list never animates.
  - **Fact stack** (label-above-value): status, type, reporter, page (deep-link), created/resolved
    via `src/utils/date.ts`; GitHub # + resolution commit as **`CopyChip`** variants.
  - **Actions:** Claim · Resolve · Reopen · Edit · Delete (confirm-then-commit) · Open in GitHub —
    all `Button`/`IconButton` (SoT; `focusRing('control')`; `IconButton size`, never hand-set `h-N w-N`).
  - **History:** `TimelineSection`/`EventTimeline` fed by a **new adapter** `userIssueEventsToTimeline`
    over `audit_logs` `user_issue.*` — the reference-timeline pattern (`.claude/rules/display/reference-timeline.md`),
    never a second timeline.
  - Description in a `Panel`/`SectionCard` (SoT surface shell); spacing via intents
    (`inset-card`, `stack-section`) — never raw `p-[Npx]`.
- **Monitor rollup region** (`rollup`): compose `@/design-system/components/monitor`
  `KpiStrip`/`KpiTile`/`DeltaChip` — Open · In-progress · Deployed (7d) · median time-to-deploy.
  Never a page-local card shell.
- **CRUD interactions:** TanStack `onMutate`→rollback→`invalidateQueries`; status changes
  **optimistic**, delete **confirm-then-commit**; thread `clientEventId`.
- **Presentation kinds via SoT:** dates (`date.ts`), status tone (new registry §5), CopyChip for
  ids; **color only from semantic tokens** (`bg-surface-card`, `text-text-*`, `border-border-soft`).

## 5. Compound opportunities

- **Do now (in scope):**
  - `userIssueStatusTone` (status → dot + chip) consumed by list row, detail, KPI — one registry,
    views stay dumb.
  - `userIssueEventsToTimeline` adapter → grows `src/lib/timeline`.
- **Promote to DS next (2+ call sites):**
  - Status vocab is IDENTICAL to master-plan `TicketStatus`. Promote a shared **`ticketStatusTone`**
    SoT used by BOTH the `/forge` TicketStatus chips and this console (AGENTS.md: never leave two
    shapes for the same job).
  - `setIssueStatus(expectedFrom)` = a light `transition()` for non-inventory status machines —
    reusable by warranty / threads.
- **Deferred (ask first):**
  - Soft-delete migration (`deleted_at`).
  - PostHog/Zendesk raw-source links on issues (the Signals-enrichment item) — fits this detail pane
    once columns exist.

## 6. Phases (each self-verifies; stop at HUMAN GATES)

| Ticket | Phase | Verify |
|---|---|---|
| **UIC-1** | Read API + domain (`list`/`get`, `GET` routes, `support.issues.view` + manifest test) | `test:user-issues`, `test:auth`, `audit-route-auth:check`, `tsc --noEmit` |
| **UIC-2** | Console shell read-only (`/support?mode=issues`: SidebarShell + list + fact stack + KPI strip) | Playwright spec (list→select→detail); `test:ds-guards` |
| **UIC-3** | Update (`setIssueStatus`/`updateReportedIssue` + `PATCH` + `support.issues.manage` + audit + optimistic UI) | `test:user-issues` (409), e2e claim/resolve |
| **UIC-4** | Delete — soft-delete **migration (HUMAN GATE)** + `DELETE` + confirm dialog | `tenancy:coverage`, e2e |
| **UIC-5** | `userIssueEventsToTimeline` + `userIssueStatusTone` + promote shared `ticketStatusTone` | `test:ds-guards`, e2e history |

## 7. Hard-safety checklist (non-negotiable)

Tenant scope on every query (`tenantQuery`, `orgId` from `ctx`) · new permissions gated +
manifest-tested · status changes only through `setIssueStatus(expectedFrom)` (no scattered raw
`UPDATE current_status`-style writes) · machine `/resolve` webhook untouched · `recordAudit` on
every mutation · soft-delete + `deleted_at IS NULL` filters everywhere · color/spacing/focus/z-index
from the SoT tokens only (guards: `test:ds-guards`).
