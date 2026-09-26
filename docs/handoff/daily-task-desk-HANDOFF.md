# HANDOFF PROMPT — Daily › Checklist · Task · Ticket

**Paste this entire file as your prompt. It is self-contained.**
Written 2026-09-22, immediately after the Daily remount landed green on `pnpm verify`.

**Scope fence, and it has MOVED once:** this handoff was written *"focus on daily only … and
desktop only"* (operator 2026-09-22). The same operator then extended it, also 2026-09-22:
*"for the task, at the same switcher, task or ticket … ensure that it will appear in the top
left global header drop down … ensure that I would be able to view zendesk on mobile and on
the right side on the desktop app as well."* So the surface is now **Daily (`/`) + the global
header dropdown + the `/m` task row**, and nothing else. Do not touch `/reports`, do not
create a `/tasks` route. If a change you want to make requires a fourth surface, stop and say
so instead of building it.

---

## 1. What exists right now

`/` is **Daily**, and it is ONE table — the whole agenda, banded by TYPE
(operator 2026-09-22: *"consolidate the tasks into one display just under a type, like type
daily checklist and type task"*), with a third band added the same day
(*"for the task, at the same switcher, task or ticket"*):

| Band | Store | Grain |
|---|---|---|
| **Daily checklist** | `daily_check_items` + `daily_check_marks` | per-day attestation, roster denominator, cadence |
| **Task** | `work_assignments`, `work_type = 'FOLLOW_UP'`, entity = order · carton | an assignment with an assigner, a deadline and a priority |
| **Ticket** | the SAME `work_assignments` rows, entity = `SUPPORT_TICKET` | the same assignment, about a helpdesk thread you answer rather than a carton you walk to |

**Task and Ticket are ONE store.** Two bands over `work_assignments` is the DISPLAY saying
what the work is; a second store would have been the fourth task system this page exists to
refuse. `isDailyAgendaWork(row)` is the predicate every surface asks — never `type === 'task'`,
which was true of every work row until the ticket band existed and then silently stopped being.

The checklist store stays separate — different grain, different write path. Only the DISPLAY is
merged, and `src/lib/daily/daily-agenda-row.ts` is the one place the shapes meet.

It was two tabs for a few hours the same day. **Do not put the tabs back:** a tab is a place
you have to already be, and *what is on my plate today* is one list. `HomeWorkspace` is now a
two-line single-surface router; `parseHomeMode` (`home-modes.ts`) swallows `?mode=today|tasks|forge`
so no bookmark 404s.

### Part by part

| Piece | File |
|---|---|
| Desk | `src/features/home/DailyAgenda.tsx` — merges both feeds, bands, renders its own rows |
| Union row | `src/lib/daily/daily-agenda-row.ts` — **the contract**: `DailyAgendaRow`, the two adapters, `isDailyAgendaWork`, `sortDailyAgendaRows`, `bandDailyAgendaRows`, `dailyAgendaSectionHeaders` |
| Family | `DAILY_FAMILY` in `src/lib/tables/field-catalog/daily.ts` — a `SlotTableFamily` **record**, no column module |
| Checklist feed | `src/lib/daily-checks/use-daily-checks.ts` |
| Task feed | `src/features/tasks/useTaskDesk.ts` → `GET /api/tasks`, `PATCH /api/tasks/[id]` |
| Task row model | `src/lib/tasks/task-desk-row.ts` — the `/m` face and the `/reports` tab read it too. Owns `taskDeskTicketNumber` and the surface-aware `taskDeskRecordHref(row, 'desk' \| 'phone')` |
| Ticket resolver | `src/lib/tasks/resolve-ticket-target.ts` + `POST /api/tasks/ticket-target` — `#48120` → the local `support_tickets.id` a task can anchor to |
| Composer | `src/features/home/DailyAgendaComposer.tsx` + `src/features/tasks/useTaskComposerSections.tsx` (`mode: 'record' \| 'ticket'`) |
| Rail | `src/features/home/AgendaRecentRail.tsx` |
| Record plane | `src/features/tasks/TaskInspector.tsx`, occupant `detail:task` — embeds `SupportTicketDetail` for a ticket row, so **Zendesk reads on the right side of the desk** |
| Header preview | `src/components/layout/HeaderDailyTasks.tsx` — the top-left beam dropdown, the whole banded agenda, each work row a door to `/?task=<id>` |
| Phone faces | `src/components/mobile/tasks/MobileTaskRow.tsx` → `/m/t/[ticketId]` (`MobileTicketThread`) — **Zendesk reads on mobile** |
| Quick assign | `src/components/quick-access/ThrowTaskHost.tsx` — `⌘⇧U`, app-wide |

### A ticket task carries TWO numbers, and only one may be stored

This is the single most dangerous thing on the surface, because getting it wrong renders
cleanly and shows somebody else's ticket.

- `work_assignments.entity_id` is the **LOCAL** `support_tickets.id`. Migration `2026-08-08a`:
  the enum arm *"keys on the LOCAL support_tickets.id … never a bare Zendesk id"*, and
  `list-tasks.ts` joins `st.id = wa.entity_id` on it.
- Every **helpdesk** reader speaks the PROVIDER number: `/api/zendesk/tickets/[id]` proxies the
  provider API verbatim, so `SupportTicketDetail`, `useZendeskTicketBundle`, `/support?ticket=`
  and `/m/t/[ticketId]` all want `support_tickets.external_ticket_id`.

`taskDeskTicketNumber(row)` is the ONE translation, next to the row that carries both. Do not
teach the bundle route to also accept local ids — a dozen call sites already hand it a provider
id, and dual-keying would make `48120` ambiguous for all of them. A ticket with no provider
mirror gets **no door at all** (null href, no embedded thread): an honest absent link beats a
confident wrong one.

### The gutter is the TICK, on both halves

Checking a checklist row writes a per-day mark; checking a task row PATCHes it to `DONE`. One
control, one meaning. That is why this surface renders its own rows instead of mounting
`useCompoundSpreadsheet`: that hook's gutter is a multi-SELECT, and routing a tick through it
would give the header select-all the meaning *"mark everything done"*. The task desk's
selection strip (`TaskActionBar`) was deleted with the consolidation for the same reason.

A checklist mark belongs to a civil DAY, so it is disabled when browsing an older `?date=`.
A task has no day — it has a deadline — so it stays tickable.

### Adding is an INLINE FORM with the TYPE at the top

Operator 2026-09-22: *"adding a task will display an inline form most similar to the exceptions
orders inline instead of the data table component."*

`?compose=1` **unmounts `DataTable`** and mounts `DailyAgendaComposer` in the exact grammar of
`src/components/outbound/orders/exceptions/ExceptionEditor.tsx`:

- host `CONTEXT_PANEL_HOST_CLASS`
- left: `TaskWalkSidebar` (resizable context-panel sash) wrapping `AgendaRecentRail`
- right: `TriageScrollLayout`, **Type** first — `Daily checklist · Task · Ticket` — then either
  the checklist fields (`DailyComposerRow` — the checklist composer SoT, shared with the phone
  sheet) or the work sections **Record · Assignment · Details**
- ONE page CTA through `DeskActionSlot` (`role="primary"`, last-writer-wins), naming what is
  missing rather than sitting dead

**Task and Ticket mount the SAME sections.** Only the first one changes its question:
`mode='record'` posts at `/api/scan/resolve` (the decoder for what this app prints);
`mode='ticket'` posts at `/api/tasks/ticket-target` (a helpdesk number this app never printed
and cannot decode). Flipping the switch clears the picked record — a carton picked under Task
must not survive into a Ticket draft and get thrown as the ticket the operator thinks they
typed.

The CTA says **Create ticket task**, never "Create ticket": `POST /api/tasks` files no helpdesk
thread, and a button that implied it would be a promise the route cannot keep. The resolver
registers a ticket's local mirror only when the PROVIDER confirms the number exists — a typo
resolves to `not_found` and mints nothing.

Only the **checklist** face is permission-gated (`admin.manage_staff`); a staffer without it
still gets both work faces, never a switch pinned to one.

**If you are asked to put a composer back inside the grid, refuse.** A composed row needs five
facts and a grid row can answer only the columns the model declares, at the widths it declares
them. That is why `TasksComposerRow` was deleted.

**If you are asked to split the composer in two again, refuse.** One display gets one create
verb; the type switch is what says which band — and which record — the row lands in.

---

## 2. Rules that bind this surface

Read `AGENTS.md` first — it is the map. These are the ones this surface trips on:

1. **Design MCP before any `src/**/*.{tsx,jsx,css}` write.** `ds_contract` → `ds_tokens <axis>`
   → `ds_critique <file>`. A PreToolUse hook denies the write without a fresh stamp.
2. **Dev origin is `http://localhost:3050` and nothing else.** Never a lane port, never
   `next dev`. Lane down → `systemctl --user start cycleforge-lane@prod`.
3. **Glyphs are a PARENT-level mark.** The Daily spine row wears `ListChecks`; the Add CTA
   carries no `Plus` (operator 2026-09-22: *"remove the glyphs"*). Do not re-add an icon to a
   CTA, and do not add a tab row to bring tab glyphs back with it.
4. **A parent and a child never wear the same name.** Daily has no children today; if you add
   any, none may be called `Daily`. Run `node tools/design-mcp/ds.mjs nav-names` after any
   rename.
5. **Column one reads `Id` and carries a machine handle only.** No person's name in the
   identity track (`ds_id_header`, `ds_identity_purity`).
6. **Dates are `DateRangePickerField variant="compact"`.** Never a native `input type="date"`,
   never `InlineEditableValue`.
7. **People are `AssigneeCombobox` via `StageStaffAssignPopover`.** Never `SearchableSelectField`.
8. **The action bar declares its own height.** Daily has no selection strip (its gutter is a
   tick), so `SLOT_TABLE_ACTION_BAR_HOSTS` lists Stock only. If you add one here, register it
   in that list AND in `SLOT_TABLE_ACTION_BAR_FILES`, and mount nothing conditionally.
9. **A bound key never stands on a resting Button.** Bind it and teach it through the staff
   `?` overview (`registerShortcutOverviewGroup`) — which is how `⌘⇧U` is advertised.

---

## 3. Quick assignment — the chord

`⌘⇧U` (`ThrowTaskHost`, mounted app-wide by `DesktopRouteShell`) opens `ThrowTaskPanel`:
scan or paste a record → pick a colleague → throw. It stands down inside text fields on
purpose (the panel autofocuses its own scan field, so firing mid-sentence would steal a
half-written note). A keyboard wedge cannot fire it — a scan emits bare characters, never with
Meta held.

It is registered in the staff `?` overview as **Tasks › ⌘ ⇧ U › Assign a task to a colleague**.
The chord label has ONE declaration, `THROW_TASK_HOTKEY_LABEL` — import it rather than
retyping, so a rebinding cannot leave a stale hint behind.

`openThrowTask()` is the programmatic door for any surface that wants a button.

---

## 4. Known gaps — named, not hidden

1. **A ticket task raises no inbox badge.** `staff_inbox_items.entity_type` has no
   `support_ticket` value (`task-vocabulary.ts`), so `POST /api/tasks` returns
   `notified: 'skipped_entity'` and `useThrowTask` surfaces that as a warning toast. The
   composer's Ticket face is therefore honest but quiet: the row lands on the assignee's Daily
   and `/m/tasks`, and no badge lights. Widening the CHECK is an enum + migration +
   delete-trigger pass — out of scope here, and it is the ONE thing left before the Ticket
   band is on a par with Task.
2. **Every task points at a record.** `work_assignments.entity_type` / `entity_id` are NOT
   NULL, so the composer requires a target: order · carton through `POST /api/scan/resolve`,
   ticket through `POST /api/tasks/ticket-target`. **Do not invent a self-referential `TASK`
   kind** to allow a standalone task; that is a new polymorphic parent.
3. **An INTERNAL ticket (`provider = 'internal'`) has no helpdesk thread**, so a task about one
   paints its facts with no door and no embedded conversation. That is the designed answer, not
   a gap to paper over with the registry id.
4. **`staff_todos` is half-deleted, on purpose.** Everything the task cutover obsoleted is
   gone. Still live and awaiting an operator gate: `/api/staff-todos`,
   `src/lib/neon/staff-todos-queries.ts`, `src/lib/queries/staff-todos-queries.ts`,
   `src/lib/schemas/staff-todos.ts`, and their one reader
   `src/components/layout/goal-chip/useGoalChecklists.ts` (`HeaderGoalChip`).
   **Ask before deleting — deletions are gated one component at a time.**

---

## 5. "AI sign-in" — how a ChatGPT OAuth connection would reach tasks

**Not built. This is the design, and the two readings of the ask are different
projects** — do not start either without saying which one you are doing.

### 5.1 The two directions

| | A · Sign in WITH ChatGPT | B · Let ChatGPT connect TO us |
|---|---|---|
| Who is the OAuth server | OpenAI | **this app** |
| Who is the client | this app | ChatGPT (a GPT / MCP connector) |
| What it buys | one more button on `/signin` | an agent that can read and write tasks as a staffer |
| Touches tasks | no | **yes — this is the one the ask is about** |
| Cost | ~XS | M–L, and it makes us an authorization server |

### 5.2 Direction A — a fourth platform provider (cheap, and already shaped)

Platform social login exists end to end. `PlatformProvider` is a union of
`'google' | 'apple' | 'microsoft'` (`src/lib/auth/platform-oauth-types.ts`), the routes are
`/api/auth/oauth/[provider]/start` and `/callback`, and per-provider config is resolved from
env by `platformProviderConfig`. Adding a provider is: one union member, one `envConfig`
branch (authorize / token / userinfo URLs + client id/secret), one button.

**Staff id and org assignment come for free, and that is the part worth understanding.** The
callback does NOT invent a staffer. It resolves the *federated identity* and then the
*membership*:

1. `account_identities` keyed on `(provider, sub)` — the stable federated subject, never the
   email.
2. No identity row ⇒ adopt an existing `accounts` row **only when the provider says
   `email_verified: true`** (`getAccountByEmail`), else create one. An unverified email is a
   takeover primitive — the provider controls that claim.
3. Already linked to a different account ⇒ refuse with `identity_in_use`. Never re-point a
   live identity.
4. `listMembershipsForAccount(accountId)` → the org memberships. The org slug on the request
   picks one; the membership carries the **staff id** for that org.
5. `createSession(...)` mints the session cookie, `logAuthEvent` records it.

So an OpenAI provider inherits staff/org resolution unchanged. The only open question is
whether OpenAI exposes an OIDC provider with a stable `sub` and a verified email claim — check
that FIRST, because without a verified email every new signer provisions a fresh account with
no membership and lands nowhere.

### 5.3 Direction B — ChatGPT as a client of our task API

This is *"ai sign in … for tasks and staff id and org assignments"* read literally: an agent
in ChatGPT that can list your tasks, create one, and mark one done. It requires a principal
we do not have.

**We have two principals today,** and the second is the precedent to copy:

| Principal | Wrapper | Carries |
|---|---|---|
| A signed-in human | `withAuth` | `{ session, staffId, organizationId, role, permissions }` — from the **cookie**, never the request |
| A paired device | `withKioskAuth` | an org, no staffer |

An agent is a THIRD: it acts *as* a staffer, in *one* org, with a *narrower* permission set
than that staffer holds. Call it `withAgentAuth`; it resolves
`{ accountId, organizationId, staffId, scopes }` from a bearer token and hands the route the
same shape `withAuth` does, so `GET /api/tasks`, `PATCH /api/tasks/[id]` and `POST /api/tasks`
need **no change**.

**What has to be built, smallest honest version:**

1. **An authorization-code + PKCE flow where WE are the server.** `/api/oauth/authorize`
   (consent, signed-in humans only) and `/api/oauth/token`. A registered-client table
   (`oauth_clients`: client id, redirect allowlist, scopes) — a public client with no secret
   MUST use PKCE.
2. **Consent picks the ORG, and the token is pinned to it.** `listMembershipsForAccount`
   returns many; a token that carries "whatever org the request implies" is the tenancy bug
   this whole codebase is built to prevent. One token, one `organization_id`, one `staff_id`,
   chosen once on the consent screen (the `switch-org` question, asked at grant time).
3. **Scopes ARE permissions — do not mint a second vocabulary.** A token's scopes are a subset
   of `permission-registry.ts` strings (`work_orders.claim` for tasks, plus `sku_stock.view`
   if the agent is to resolve a record). `withAgentAuth` intersects token scopes with the
   staffer's live permissions at request time, so revoking the human revokes the agent.
4. **Every write stays tenant-scoped and audited.** `withTenantTransaction` / `tenantQuery`
   as today, and `recordAudit` must record BOTH actors — the staffer the token acts as and the
   client id that presented it. A task whose deadline moved with no record of which agent
   moved it is the same lossiness `assigned_by_staff_id` exists to fix.
5. **Revocation is a membership event, not a cron.** Removing a staffer from an org, or
   deleting the account identity, must invalidate that org's tokens immediately.
6. **Rate-limit and step-up.** An agent does not hold the staffer's PIN, so it cannot
   satisfy a step-up gate (`sensitive-stepup.ts`) itself — by construction, not by an
   allowlist someone forgets to update. It may still *request* the step-up-gated verb:
   under the approval-first model (operator ruling 2026-09-26) the request lands as a
   proposal the named human approves, passing step-up themselves.

**What the agent can and cannot do on day one**

- CAN: `GET /api/tasks` (its own staffer's agenda), `PATCH /api/tasks/[id]` (status, priority,
  deadline — the strict allowlist already refuses anything else with a 403 naming the key).
- CAN create a task only if it can name a record: `entity_type` / `entity_id` are NOT NULL, so
  the agent needs `POST /api/scan/resolve` scope and a real order / carton / ticket. **An
  agent that cannot resolve a record cannot create a task** — do not add a nullable-entity path
  for the connector's convenience (§4.2).
- CANNOT notify on a ticket task: the inbox anchor gap (§4.1) applies to an agent exactly as
  it does to a human, so the connector must surface `notified: 'skipped_entity'` rather than
  reporting a flat success.

**Refusals, stated up front**

- Never accept `staffId` or `organizationId` from an agent's request body. They come from the
  token, the way they come from the cookie today.
- Never mint a long-lived token with a staffer's FULL permission set "to keep it simple".
- Never reuse the kiosk device principal for an agent: a kiosk has an org and no staffer, so
  every task it wrote would have no assigner.
- Do not start B by widening `withAuth`. A third principal is a third wrapper; bending the
  human one is how `staffId` stops meaning "the person who is signed in".

**Order of work:** A is a button and can land alone. B should not begin until an operator has
ruled on §5.3.2 (one token, one org) and on which scopes an agent may ever hold.

---

## 6. Close-out chain — run for EVERY increment

```bash
npx tsc --noEmit
npx tsx --test src/lib/daily/daily-agenda-row.test.ts \
                src/lib/tasks/task-desk-row.test.ts \
                src/lib/tasks/resolve-ticket-target.test.ts \
                src/lib/tables/field-catalog/daily.test.ts \
                src/lib/tasks/list-tasks.test.ts \
                src/components/mobile/tasks/mobile-task-row.test.tsx \
                src/lib/auth/route-permission-manifest.test.ts \
                src/lib/sidebar-navigation.test.ts \
                src/lib/nav/command-bar-nav-groups.test.ts
npm run audit-route-auth -- --emit   # only if you added or re-gated a route
node tools/design-mcp/ds.mjs nav-names
node tools/design-mcp/ds.mjs critique <each tsx you touched>
npx tsx scripts/boundary-guard.ts --file <each file you touched> --json
pnpm run eval:cohort slot-table -- --skip-verify
pnpm verify
```

Then a browser pass at **`http://localhost:3050` only**, 1440×900, signed in:
`/` → one table with the `Daily checklist`, `Task` and `Ticket` band captions → a Ticket row
opens the helpdesk thread in the RIGHT RAIL → Add → the inline form takes the stage with
**Type** first and three faces → ✕ returns the table. Then the top-left beam `ListChecks`
dropdown: the same three bands, captioned, each work row landing on `/?task=<id>`.
Phone pass at 390×844: `/m/tasks` → a ticket row's body opens `/m/t/<provider number>`.

Mint a session with `node scripts/lighthouse-mint-session.mjs` and drive it with
`@playwright/test` from the repo root. `networkidle` never settles on this app (live Ably) —
wait on `domcontentloaded` plus an explicit selector.

---

## 7. Hard rules

- Daily, the header dropdown and the `/m` task row. No new route, no new nav row, no second door.
- A ticket's helpdesk door takes the PROVIDER number. Never `entity_id`.
- No composer inside the grid. No glyph on a tab or an Add-task CTA.
- No keycap standing on a resting Button.
- Never widen a guard baseline, never append to a shrink-only debt list, never delete law
  styles to silence `ds_critique`.
- `pnpm verify` green before you claim done.
