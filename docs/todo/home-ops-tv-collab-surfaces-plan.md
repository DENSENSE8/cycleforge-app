# Home triage + collab · Operations TV · Forge on Home

> **Status:** PLAN — ready to execute in phases (not started)  
> **Created:** 2026-07-12  
> **Revised:** 2026-07-12 — appended **§21–30** (grounded codebase-scan deltas + long-term hardening). Read §21 before Phase A.  
> **Product framing:** Cycle Forge multi-tenant ops SaaS; USAV dogfood.  
> **Portfolio:** WS-HOME · WS-DOGFOOD · WS-ALP · WS-CONN · WS-ENGINE  
> **Related (do not fork):**  
> - [`contextual-my-day-home-plan.md`](./contextual-my-day-home-plan.md) — My Day ranking (absorbs / supersedes for landing)  
> - [`agentic-loop-master-plan.md`](./agentic-loop-master-plan.md) — MDX CRDT, TicketStatus, forge org gate  
> - [`connections-mdx-forge-plan.md`](./connections-mdx-forge-plan.md) — CONN-* + `connections_gap_adoption`  
> - [`docs/portfolio/INDEX.md`](../portfolio/INDEX.md) · [`review-protocol.md`](../portfolio/review-protocol.md)  
> - Staff pages: [`../master-connections-and-refactor/staff/07-pages-and-design.md`](../master-connections-and-refactor/staff/07-pages-and-design.md)  
> - Display archetypes: [`.claude/rules/contextual-display.md`](../../.claude/rules/contextual-display.md)

---

## 0. TL;DR

| Surface | Job | Archetype | Realtime spine |
|---------|-----|-----------|----------------|
| **`/` Home** | Personal **triage**, detailed tasks, **collab** (comments / blocked / AI brief), **Forge live plan** as a **mode** | **Workbench** (list → select → detail) + collab region | `ops_plans*` Ably + **Yjs MDX** (forge) + new brief threads |
| **`/operations`** | **TV / floor board** — org-wide what must be done **on time** (no personal edit maze) | **Monitor** only | org-scoped KPI + task rollups + Ably |
| **`/forge`** | **Redirect** → `/?mode=forge` (or `?mode=plans&view=live`) | — | same CRDT as today |

**Hard split:** Home = “my work + collaboration.” Operations = “everyone’s clock + load.”  
**Do not** convert all docs to MDX. Live editable plan remains **`master-plan.mdx`** (and optional smaller Yjs briefs). Narrative stays in `docs/**`.

---

## 1. Product vision

### 1.1 Staff mental model

```
Sign in → Home (default)
  modes: Today | Tasks | Collab | Forge (live plan) | Brief (AI shift coach)
  → deep-link to station (/unbox, /pack, /test, /dashboard) for act-and-clear work

Wall / manager TV → Operations
  modes: Live floor | Due now | Stations load | (optional) History read-only
  no forge edit, no personal claim chrome as primary
```

### 1.2 Why not keep Forge under Operations

| Today | Problem |
|-------|---------|
| `/forge` → `/operations?mode=plans` | Forge competes with floor Monitor; TV/manager modes mixed with edit/agent |
| Plans Live is Monitor-ish + agent chat | Fine for leads; wrong default neighbor for packers on “Operations” |
| Home redirects to `/dashboard` | No personal triage; collab has no home |

**Decision:** Forge is a **Home mode** (lead / plan-manager primary). Operations stays **observe / on-time board**.

### 1.3 Collab / “Google Docs + Slack” — scoped

Home **Collab** and **Forge** provide:

- Live multi-writer plan body where allowed (Yjs + Ably — already proven on master plan)
- Comments / threads on **ops_plan_tasks** (and later phases / shift briefs)
- Mentions + notifications when a phase/task is **blocked**
- AI-generated **shift brief**: what happened · what’s stuck · how to use the product better

Not in v1: full Google Docs OT, public Slack, freeform channels with no entity anchor.

---

## 2. Display archetypes (non-negotiable)

Run `pickArchetype()` per region — **never blend** Station + Workbench + Monitor in one region.

| Region | Archetype | Why |
|--------|-----------|-----|
| Home left rail (modes + list) | Workbench picker | Durable selection, URL `?mode=&task=` |
| Home right pane (task detail / thread / forge) | Workbench detail (crossfade pane) | Edit/claim/comment |
| Home forge sub-region | Monitor for stream + Workbench for agent (split regions) | Same as today’s AgenticLoopLiveConsole split |
| Operations full page | **Monitor** | Observe rollups; filters ephemeral |
| Station deep links from Home | Station | Scan remains act-and-clear |

---

## 3. URL & navigation SoT

### 3.1 Home modes (`/` — restore as real page)

| `?mode=` | Label | Content |
|----------|-------|---------|
| `today` (default) | Today | Ranked next work (My Day) — feed + claim |
| `tasks` | Tasks | Detailed ops_plan_tasks assigned to me + unassigned claimable |
| `collab` | Collab | Threads on selected task/phase; blocked reasons; mentions |
| `forge` | Plan live | Master-plan MDX CRDT + TicketStatus + plan agent (moved from Ops) |
| `brief` | Brief | AI shift brief (Yjs optional later; v1 markdown + regenerate) |

Selection:

| Param | Meaning |
|-------|---------|
| `?task=<uuid>` | Selected `ops_plan_tasks.id` |
| `?plan=<uuid>` | Selected `ops_plans.id` (tasks mode) |
| `?view=live` | Forge mode only — CRDT console (same as today) |
| `?open=` | Deprecated for home; keep on Ops only if needed for plan pick |

### 3.2 Operations modes (TV)

| `?mode=` | Label | Content |
|----------|-------|---------|
| `live` (default) | Live | Floor KPIs + due-now strip (today’s civil day PST) |
| `due` | Due now | Tasks/phases past due or due within window |
| `stations` | Stations | Throughput / queue depth by station |
| `history` | History | Existing history/analytics (read-only) |
| `signals` | Signals | Existing signals (if kept) |
| ~~`plans`~~ | **Removed** as primary | Redirect `mode=plans` → `/?mode=forge` or `/?mode=tasks&plan=` |

### 3.3 Redirects & aliases

| From | To |
|------|-----|
| `/forge` | `/?mode=forge&view=live` (preserve query if any) |
| `/operations?mode=plans` | `/?mode=forge` or `/?mode=tasks` (pick: **forge** if view=live, else **tasks**) |
| `/` when parked-redirect-to-dashboard | **Remove** soft-park redirect for home when this plan ships; Home is dogfood surface again |
| Staff `default_home_path=/` | Lands on My Day |

### 3.4 Nav registry

- Re-add **Home** to `APP_SIDEBAR_NAV` (primary, first).
- Remove Home from `PARKED_SIDEBAR_NAV_IDS` / parked soft-gate for `/`.
- Operations stays Monitor icon; no Plans in Ops L2 rail (or Plans becomes “open on Home”).
- Permissions:
  - Home: signed-in (mode forge requires `operations.plans.view` or manage for rewrite).
  - Operations: `operations.view` (TV-safe roles).

---

## 4. Data model — `ops_*` tables (extend, don’t fork)

### 4.1 Existing (keep as SoT for structured work)

| Table | Role after this plan |
|-------|----------------------|
| `ops_plans` | Org plans (incl. bridged **Agentic Loop — Master Plan**, adoption templates) |
| `ops_plan_phases` | Station-scoped phases; TV rollup by station |
| `ops_plan_tasks` | Claimable/completable work; Home Tasks + Collab anchors |
| `ops_plan_task_links` | Proof links (work_assignment, inventory_event, manual) |
| Bridge keys | `client_event_id = master-plan:{ticketId}` product; `conn-adopt:*` adoption |

**Bridge unchanged:** `syncMasterPlanToOpsPlans` still projects MDX → USAV forge org only.  
**Template unchanged:** `POST /api/ops-plans/from-template` `{ templateKey: "connections_gap_adoption" }` for non-forge orgs.

### 4.2 New tables (collab / brief) — polymorphic house contract

> **Revised — read §22 first.** `entity_notes` (polymorphic, author-stamped) and `staff_messages` (per-staff inbox) already exist. Prefer **extending `entity_notes`** for v1 task comments and **reusing `reason_codes`** for block reasons; **drop `ops_collab_mentions`** (mentions are delivery via `staff_messages`, not storage — §23).

#### `ops_collab_threads`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `organization_id` | UUID NOT NULL | tenant-from-birth + `enforce_tenant_isolation` |
| `entity_type` | TEXT NOT NULL | CHECK: `PLAN_TASK`, `PLAN_PHASE`, `PLAN`, `STATION_SHIFT` |
| `entity_id` | TEXT NOT NULL | UUID string for plans/tasks; or `{station}:{dateKey}` for shift |
| `title` | TEXT | optional |
| `status` | TEXT | `open` \| `resolved` |
| `created_by_staff_id` | INT | |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `(organization_id, entity_type, entity_id)`, unique open thread per entity optional later.

#### `ops_collab_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `organization_id` | UUID NOT NULL | |
| `thread_id` | BIGINT FK → threads | ON DELETE CASCADE |
| `author_staff_id` | INT NOT NULL | |
| `body` | TEXT NOT NULL | plain/markdown; length cap |
| `created_at` | timestamptz | |

#### `ops_collab_mentions` (or jsonb on message)

| Column | Notes |
|--------|-------|
| `message_id`, `staff_id`, `organization_id` | drive notifications |

#### Optional: `ops_task_blocks`

| Column | Notes |
|--------|-------|
| `task_id`, `organization_id` | |
| `reason` | staff “cannot execute phase because…” |
| `created_by_staff_id`, `created_at` | |
| `resolved_at` | null until cleared |

Alternatively store block as task `notes` + status convention — prefer **typed block** for TV “blocked” strip.

#### Optional v2: `ops_shift_briefs`

| Column | Notes |
|--------|-------|
| `organization_id`, `date_key` (civil PST), `station` nullable | |
| `body_md` | AI or lead text |
| `yjs_doc_id` / revision | if CRDT per brief |
| `generated_at`, `generated_by` | `ai` \| `staff` |

**v1 can skip CRDT for briefs** — regenerate markdown into `body_md` + Ably invalidate.

### 4.3 What stays out of Postgres as CRDT

| Doc | Storage | Channel |
|------|---------|---------|
| Product master plan | `master-plan.mdx` file + Yjs | `org:{forgeOrg}:forge:master-plan` |
| Org adoption plan | rows in `ops_plans*` only | `org:{id}:ops_plans:changes` |
| Shift brief v1 | `ops_shift_briefs.body_md` | `org:{id}:home:brief` invalidate |
| Shift brief v2 | Yjs optional | `org:{id}:brief:{dateKey}` |

---

## 5. MDX live updates (Forge mode on Home)

### 5.1 Unchanged contracts

| Contract | Value |
|----------|--------|
| Ticket statuses | `pending` \| `in-progress` \| `deployed` only |
| Product SoT | `./master-plan.mdx` ↔ Y.Text(`content`) ↔ Ably |
| Task projection | `master-plan:{ticketId}` under plan title **Agentic Loop — Master Plan** |
| Forge org seed | `isForgePlanOrg` only — **never** seed dogfood MDX into QA/customers |
| Daemon | `.cycle_forge_ops/scripts/master-plan-sync-daemon.mjs` |

### 5.2 Home `mode=forge` composition

Move / reuse without rewrite:

| Module | Action |
|--------|--------|
| `AgenticLoopLiveConsole` | Mount in Home right pane when `mode=forge` |
| `MasterPlanView` | Same TicketStatus rendering |
| `PlanAgentChat` | Same; permission `operations.plans.manage` for mutate |
| `ops-plans-bridge` | Trigger on read/mutate as today |
| `/api/forge/*` | Unchanged paths; page shell moves |

### 5.3 Live update flow (product plan)

```
Cursor edits master-plan.mdx
  → daemon → Yjs → Ably → all Home forge viewers
Staff/agent flips TicketStatus in UI
  → Yjs mutate → daemon writes file → bridge syncs ops_plan_tasks
ops_plans:changes
  → Home Tasks + Operations TV due strip refresh
```

### 5.4 Live update flow (org tasks / collab)

```
claim / complete / block task
  → Postgres + recordAudit + Ably ops_plans:changes
  → Home Tasks detail, TV due board
post collab message / mention
  → Postgres + Ably home:collab
  → toast + inbox for mentioned staff
```

### 5.5 Human review vs TicketStatus

| Concept | Where |
|---------|--------|
| Code/product ticket done | `TicketStatus=deployed` after VERIFY |
| Human “approved on tunnel” | portfolio INDEX log + optional `WS-*-HR1` |
| Staff “blocked on floor” | `ops_task_blocks` / collab thread — **not** a fourth TicketStatus |

---

## 6. Home surface — functional spec

### 6.1 Mode: Today (My Day)

**Job:** ranked “what should I do next?”

**Sources (merge, do not replace):**

| Source | API / lib |
|--------|-----------|
| Work orders mine | `GET /api/work-orders/mine` |
| Ops plan tasks assigned / unassigned claimable | `GET /api/ops-plans/inbox` (extend filters) |
| Activity interrupts | `ActivityInboxContext` |
| Existing home feed | **`GET /api/my-day`** (`aggregateMyDayFeed`) — canonical; `/api/home/feed` is `@deprecated`. **My Day already exists** as `MyDayWorkspace` — compose it, don't rebuild (§21) |

**UI:** linear list (one-row anatomy), claim, deep-link CTA to station.  
**Empty:** teaching empty (contextual-my-day-home-plan honesty).

### 6.2 Mode: Tasks

**Job:** detailed task display (Workbench).

- Left: filterable list (mine / team / plan / station)  
- Right: task detail — status, assignee, due, notes, links (`ops_plan_task_links`), **Open collab**  
- Mutations: claim, complete, reopen (existing task routes)  
- URL: `?mode=tasks&task=`

### 6.3 Mode: Collab

**Job:** Slack/Discord-like **ops** threads.

- Default selected task from URL or last Today pick  
- Thread list + message composer  
- Actions: **Block phase** (reason required) → notify lead + assignee  
- Mentions `@staff` → `ops_collab_mentions` + Ably toast  
- Permissions: comment if can view home; resolve thread if manage or author lead  

### 6.4 Mode: Forge (live plan)

**Job:** product plan CRUD via permissions + agent.

- Full `AgenticLoopLiveConsole`  
- CONN-* / ROI-* / ALP-* / WS-* chips  
- Plan agent rewrite only with manage permission  
- Link “Open as tasks” → Tasks mode filtered to bridged plan  

### 6.5 Mode: Brief (AI coach)

**Job:** AI-written record of what staff did + how to improve using **in-app** capabilities.

**Inputs (read-only, org-scoped, PST `date_key`):**

- Completions on `ops_plan_tasks` today  
- Open blocks + collab threads  
- Optional station event rollups (pack/test/recv counts)  

**Output sections (fixed schema):**

1. What we completed  
2. What’s stuck (links to `?mode=collab&task=`)  
3. How to improve (deep links: `/unbox`, `/pack`, `/dashboard`, Settings → Integrations — **capability language**)  

**v1:** generate on demand → store `ops_shift_briefs` → show markdown.  
**v2:** optional Yjs co-edit of brief.

---

## 7. Operations TV surface — functional spec

### 7.1 Design goals

- Readable at 3–5m (large type, few chrome controls)  
- **No** forge editor, **no** dense claim UI  
- Updates live as tasks complete / block / become due  
- Civil day bounds: `warehouseDayUtcBounds` / PST keys only  

### 7.2 Widgets (v1)

| Widget | Data |
|--------|------|
| Due now | tasks with `due_at` in window or overdue, open/in_progress |
| Blocked | tasks with open block or collab status |
| By station | open task counts per `ops_plan_phases.station` |
| Throughput today | existing ops KPI rollups (reuse Operations live) |
| Plan progress | % done on active plans (bridged + adoption) |

### 7.3 Realtime

- Subscribe `org:{id}:ops_plans:changes`  
- Optional `org:{id}:home:collab` for blocked badge only  
- Refetch query keys on event (React Query) — same pattern as Plans sidebar  

### 7.4 Permissions

- View: `operations.view`  
- TV kiosk role: optional dedicated permission later; v1 same view  

---

## 8. API surface (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| existing | `/api/home/feed` | Evolve for Today ranking |
| existing | `/api/ops-plans/**` | Plans CRUD, claim, complete |
| existing | `/api/ops-plans/from-template` | Adoption seed |
| existing | `/api/forge/**` | MDX CRDT + agent |
| **new** | `GET/POST /api/ops-collab/threads` | list/create by entity |
| **new** | `GET/POST /api/ops-collab/threads/[id]/messages` | messages |
| **new** | `POST /api/ops-plans/tasks/[id]/block` | set/clear block + notify |
| **new** | `GET/POST /api/home/brief` | get/regenerate shift brief |
| **new** | `GET /api/operations/tv-board` | aggregated due/blocked/station for TV |

All: `withAuth` + permission; `orgId` from `ctx`; `withTenantTransaction` on writes; `recordAudit` on mutations; `clientEventId` where idempotent.

---

## 9. Realtime channel map

| Channel | Events | Consumers |
|---------|--------|-----------|
| `org:{id}:forge:master-plan` | Yjs sync | Home forge mode |
| `org:{id}:ops_plans:changes` | plan_updated | Home tasks, Ops TV, Plans sidebar residual |
| `org:{id}:home:collab` | thread.created, message.created, mention | Home collab, toasts |
| `org:{id}:home:brief` | brief.updated | Home brief mode |

Token capability: extend `/api/realtime/token` grants for home channels when staff has home access.

> **Revised — see §23.** `org:{id}:home:collab` is a **broadcast** channel; routing @mentions through it violates least-privilege and forks existing infra. Instead: **thread/comment refresh rides `org:{id}:ops_plans:changes`** (already granted to `operations.plans.view`); **mentions ride the per-staff `org:{id}:inbox:{staffId}`** channel (already subscribe+publish-granted, feeds `ActivityInboxContext` + bell). Only add `home:collab` if a genuine org-wide broadcast (not per-recipient) event emerges.

---

## 10. Permissions matrix

| Action | Permission |
|--------|------------|
| Open Home Today/Tasks | authenticated (or `home.view` if added) |
| Open Home Forge | `operations.plans.view` (read) / `operations.plans.manage` (mutate MDX) |
| Comment collab | authenticated + org member |
| Block task / resolve thread | assignee or `operations.plans.manage` |
| Seed adoption template | `operations.plans.manage` |
| View Operations TV | `operations.view` |

Register any new permission in `permission-registry.ts` + manifest test (house rule).

---

## 11. Migration of existing UX

| Current | Target |
|---------|--------|
| `/` → redirect `/dashboard` | Home workspace with modes |
| `TaskInbox` | Becomes Today mode core or is replaced by ranked feed |
| `/forge` → Ops plans | `/forge` → `/?mode=forge&view=live` |
| Ops `mode=plans` | Redirect to Home forge/tasks |
| Ops live/analytics/history | Stay on Ops; default Live TV board |
| Parked Home | **Un-park** Home for dogfood; keep other parks |
| `default_home_path` | Prefer `/` for most roles; packer may still land `/pack` |

---

## 12. Phased execution

### Phase A — Routing & shell (foundation)

1. Restore Home page shell: `HorizontalButtonSlider` / mode rail + `?mode=`  
2. Redirect `/forge` → home forge mode  
3. Ops: remove Plans as primary mode; redirect  
4. Re-add Home to sidebar; update soft-gate  
5. Tests: sidebar-navigation, surface routing, redirect e2e smoke  

**Exit:** staff can open `/` and `/forge` lands on Home forge.

### Phase B — Tasks on Home (ops_* first)

1. Wire Tasks mode to ops_plans inbox + task detail  
2. Claim/complete from Home (existing APIs)  
3. Ably invalidation on ops_plans:changes  
4. Deep links from Today → Tasks  

**Exit:** personal plan tasks usable without Operations Plans UI.

### Phase C — Operations TV board

1. `GET /api/operations/tv-board` (due, blocked, by station)  
2. Ops default mode = Live TV layout (large type)  
3. Realtime refresh  
4. Strip plan-edit entry points  

**Exit:** wall display usable without Home.

### Phase D — Collab threads

1. Migration `ops_collab_*` (+ optional `ops_task_blocks`)  
2. APIs + Ably  
3. Home Collab mode UI  
4. Block reason → notify  
5. Unit tests + permission tests  

**Exit:** staff can discuss a stuck task and alert leads.

### Phase E — AI Brief

1. `ops_shift_briefs` + generate endpoint  
2. Home Brief mode  
3. Deep links in coach copy (capabilities, not vendor brands)  
4. Optional: mention open collab threads in brief  

**Exit:** end-of-shift coach doc exists.

### Phase F — Polish & dogfood

1. Mobile Home modes  
2. Kiosk Ops full-screen query (`?tv=1` hide chrome)  
3. Portfolio INDEX + master-plan tickets for this initiative  
4. E2E: home modes, forge redirect, claim task, post comment (when auth setup works)  

---

## 13. Ticket seeds (for `master-plan.mdx` when executing)

Prefix **`HOME-OPS-*`** (product surface work — distinct from CONN-*).

| ticketId | Phase | Summary |
|----------|-------|---------|
| `HOME-OPS-A1` | A | Home shell + modes URL |
| `HOME-OPS-A2` | A | `/forge` → `/?mode=forge` |
| `HOME-OPS-A3` | A | Ops plans mode redirect; un-park Home |
| `HOME-OPS-B1` | B | Tasks mode + ops_plans inbox |
| `HOME-OPS-C1` | C | TV board API + Ops live layout |
| `HOME-OPS-D1` | D | collab tables + APIs |
| `HOME-OPS-D2` | D | Collab UI + block notify |
| `HOME-OPS-E1` | E | AI shift brief |
| `HOME-OPS-F1` | F | E2E + portfolio review |

Human review: `HOME-OPS-HR1` after tunnel dogfood of Home + TV.

---

## 14. Testing strategy

| Layer | What |
|-------|------|
| Unit | mode URL parse; TV board pure aggregations; collab entity_type guards; redirect map |
| Bridge | existing ticket-status + ops-plans-bridge + connections extract |
| Integration | from-template adoption still org-scoped; forge seed still forge-org only |
| E2E | home modes render; forge redirect; claim task; (auth-dependent) collab post |
| Manual | usav-dev: Home triage + Ops on second monitor; flip CONN ticket; see TV update |

---

## 15. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Home becomes second Forge + second Slack | Modes with single job; collab always entity-anchored |
| Ops loses plan management | Explicit deep link to Home forge/tasks |
| MDX CRDT too heavy for all staff | Forge mode permission-gated; TV never loads Yjs |
| Double nav (Home + Ops plans) | Delete Ops plans mode after redirect soak |
| Date bugs on TV “today” | Only `src/utils/date.ts` civil/PST helpers |
| Tenant leak in collab | `withTenantTransaction` + enforce_tenant_isolation on new tables |
| AI brief invents vendor copy | capability-labels SoT |

---

## 16. Non-goals

- Converting all `docs/**` into live MDX  
- Replacing stations with Home for scan work  
- Full Google Docs suggestion mode v1  
- External Slack as system of record  
- Seeding dogfood master-plan into every tenant  

---

## 17. Success criteria

1. Default landing `/` is Home triage (Today), not silent dashboard redirect.  
2. `/forge` opens Home forge mode with live MDX + TicketStatus (CONN/ROI/ALP visible).  
3. Operations default is TV-style due/load board; updates when tasks complete/block.  
4. Staff can open a task, comment, mark blocked with reason, notify lead.  
5. `ops_plans*` remain SoT for structured work; collab tables are adjacent.  
6. Master-plan bridge and `conn-adopt:*` adoption template still behave as Phase 1–2 connections plan.  
7. Archetype split enforced: no scan bar on Ops TV; no TV chrome on Home collab.  

---

## 18. File touch list (when building)

| Area | Paths (indicative) |
|------|---------------------|
| Home shell | `src/app/page.tsx`, `src/features/home/**` |
| Nav | `src/lib/sidebar-navigation.ts`, parked-surfaces, dogfood gate |
| Forge redirect | `src/app/forge/page.tsx` |
| Ops workspace | `OperationsWorkspace.tsx`, remove/redirect plans mode |
| Collab | `src/lib/ops-collab/**`, `src/app/api/ops-collab/**`, migration |
| TV API | `src/app/api/operations/tv-board/route.ts` |
| Realtime | `src/lib/realtime/channels.ts`, token grants |
| Brief | `src/app/api/home/brief/route.ts` |
| Tests | sidebar tests, home mode tests, collab unit, e2e redirects |
| Docs | this plan, portfolio INDEX, staff 07 Now/Change when UX ships |

---

## 19. Open decisions (resolve before Phase A code)

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Forge mode name: `forge` vs `plans`? | **`forge`** (matches product mental model) |
| 2 | Ops `mode=plans` → tasks or forge? | **`forge` if view=live else tasks** |
| 3 | Un-park Home immediately in Phase A? | **Yes** (required for dogfood entry) |
| 4 | Collab on v1 only PLAN_TASK or also STATION_SHIFT? | **PLAN_TASK only** first |
| 5 | AI brief v1 auto cron or button? | **Button** first; cron optional |

---

## 20. Execution order (agent checklist)

```
[x] A1 Home shell + modes URL
[x] A2 /forge redirect
[x] A3 Ops plans redirect + un-park Home
[x] B1 Tasks mode + ops inbox
[x] C1 TV board API + Ops layout (kiosk `?tv=1`, operations.tv.view, isOpsTvBoard) — 2026-07-12
[ ] D1 collab migration + APIs
[ ] D2 Collab UI + block notify
[ ] E1 AI brief
[ ] F1 E2E + portfolio HR
[ ] Update staff/07 + portfolio INDEX when operator-visible
```

---

## 21. Ground-truth deltas (codebase scan · 2026-07-12)

A deep scan corrected several load-bearing assumptions. Update the mental model **before Phase A** — most of the build cost moved out of A–B and into C–E.

| Plan assumed | Reality (file) | Consequence |
|--------------|----------------|-------------|
| Home is greenfield / `src/features/home/**` | `/` already renders **`MyDayWorkspace`** (`src/app/page.tsx` → `src/features/my-day/`). `src/features/home/TaskInbox.tsx` is **orphaned dead code** (0 importers) | **Today = compose existing My Day**, not rebuild. Ignore/retire `features/home`. |
| Evolve `/api/home/feed` for Today | `/api/home/feed` is **`@deprecated`** → canonical **`GET /api/my-day`** (`aggregateMyDayFeed`, `src/lib/my-day/`) | Point Today at `/api/my-day`; drop the feed alias. |
| `/forge` is a page whose shell "moves" to Home | `src/app/forge/page.tsx` is a **client redirect shim** → `/operations?mode=plans&view=live`. Forge already lives inside **`OperationsPlansView` → `AgenticLoopLiveConsole`** | Forge "move" = re-point the shim + mount the existing console in the Home pane. No page to relocate. |
| Forge module paths unknown | Real: `src/components/forge/{AgenticLoopLiveConsole,MasterPlanView,PlanAgentChat}.tsx`; APIs `src/app/api/forge/{master-plan,master-plan/seed,master-plan/sync,chat,runs,ingest}` | Use these exact imports. |
| `default_home_path=/` is a global home resolver | It's a **per-staff DB column** applied only at auth time (`signin/page.tsx`; signup default `'/'`) | "Land on My Day" = change the park redirect, not a resolver. |
| Ops mode SoT is one place | Modes are declared **twice**: `operations-sidebar-shared.ts` (`OperationsMode`) **and** `sidebar-navigation.ts` (`SIDEBAR_PAGE_NAV`) | Removing `plans` as primary edits **both** + the `sidebar-navigation.test.ts` round-trip guard. |
| Un-park Home = per-org flag | Parking is an **env gate** only (`DOGFOOD_FULL_SURFACE` in `parked-surfaces.ts:isParkedSurfaceLive`, **sync**); `home` is a parked key | Per-org dogfood needs converting the sync env gate to async `resolveForOrg` — makes `page.tsx` async (§28). |

**Net:** Phases A–B are now mostly *composition + routing*, not new UI. Re-weight estimates toward C (TV auth), D (collab), E (brief).

---

## 22. Collab storage — reuse before inventing `ops_collab_*`

Two existing primitives cover most of v1; a full thread/mention system is only *partly* new.

- **`entity_notes`** (`src/lib/drizzle/schema.ts:937`) — polymorphic `entity_type`/`entity_id uuid` + `body` + `author_id` + `created_at`, index `entity_notes_lookup`. It **is** the existing "comment-on-any-entity" table, and `ops_plan_tasks.id` is uuid → fits with `entity_type='ops_plan_task'`.
- **`ops_plan_tasks.notes TEXT`** already holds single-author free text; comments graduate that to multi-author via `entity_notes`.

**Revised §4.2 recommendation:**
- **v1 (Phase D):** task comments = `entity_notes` rows. Add a thin **`ops_collab_threads`** (`status open|resolved`) **only if** resolve-state is required at launch — `entity_notes` has no thread/resolve concept, so *that* wrapper is the one justified new table, not a messages table.
- **Delete `ops_collab_mentions`** — mentions are delivery, not storage (§23).
- Any new table follows **`polymorphic-tables.md` exactly**: named CHECK on `entity_type`, BIGINT id, org-led indexes, `enforce_tenant_isolation()` in the same migration, Drizzle model in the same PR, and a **parent-delete trigger family** — the four `entity_type` values (PLAN_TASK/PLAN_PHASE/PLAN/STATION_SHIFT) each need delete integrity or an explicit documented skip.

---

## 23. @mentions & block-notify — reuse the notification substrate (do NOT fork)

A mature per-staff delivery stack already exists. The plan's `home:collab` broadcast + new toast path would fork it.

| Need | Reuse (file) | New work |
|------|--------------|----------|
| Targeted push to a staffer | `publishStaffMessage()` → `org:{id}:inbox:{staffId}` (`src/lib/realtime/publish.ts`); per-staff channel already **subscribe+publish**-granted in `api/realtime/token` | none |
| Durable notification row | **`staff_messages`** (`kind` + `context JSONB` + `read_at`) — explicitly designed to grow kinds | add `kind='mention'` / `'task_blocked'`, `context={threadId,taskId,planId}` |
| Toast + bell | `ActivityInboxContext` already handles `staff_message` → toast + refetch; bell = `ActivityInboxPopover` | maybe a mention item-kind label |
| Single-recipient toast pattern | `UserIssueResolvedToaster` (mount-once `<XToaster/>` + `publishX`→own inbox) is the canonical reference | copy shape only if not routing through ActivityInbox |
| Refresh on event | `useAblyChannel(channel, event, () => queryClient.invalidateQueries())` — reference `PlansSidebar.tsx` | new event name on the **existing** `ops_plans:changes` channel |

**Genuinely new = only** `@name`→staffId **token parsing** + the comment/thread rows. Everything else (channels, token grants, per-staff push, toasts, bell, invalidation) exists — **extend, don't duplicate.** Remove `org:{id}:home:collab` from §9 (see the inline note there).

---

## 24. Presence / "who's viewing" — the one real new realtime primitive

Yjs **awareness is not wired** (`src/lib/master-plan/ably-yjs-provider.ts` is document-CRDT only — `yjs.update` + two-way sync; no `y-protocols/awareness`, no Ably `presence`). Google-Docs "who's here" on a task/plan is genuinely new. Options:
- (a) Ably native `channel.presence` on a per-task channel (new builder in `channels.ts` + token grant), or
- (b) `y-protocols/awareness` broadcast over a new event on the existing master-plan channel (forge only).

**Recommendation:** defer to v2; when built, make it a **new SoT** (`src/lib/realtime/presence.ts`) so the next collab surface composes it — never inline cursor state into components.

---

## 25. Search-waist integration — collab & brief are not free

Per the search SoT (never fork a per-surface search), each new searchable entity is a fixed **5-edit contract**:

1. `src/lib/search/build-search-text.ts` — add DB type to `SearchEntityType` + a `build*Doc` + register in `BUILDERS`.
2. `src/lib/search/search-hit.ts` — add UI key to `SearchHitEntityType`, both `DB_TO_UI`/`UI_TO_DB`, and a `searchHitHref` case.
3. `src/lib/search/search-outbox-worker.ts` — add org-scoped `LOADER_SQL`.
4. New migration (model on `2026-07-03d`): widen **both** `entity_search_docs` + `entity_search_outbox` CHECKs; AFTER INSERT + double-guarded `AFTER UPDATE OF <cols>` triggers → `fn_enqueue_entity_search_outbox(<TYPE>)`; AFTER DELETE → `fn_delete_entity_search_docs_on_parent_delete(<TYPE>)`.
5. Parent table **must** have `organization_id NOT NULL` + **integer PK** (enqueue skips NULL-org; worker dead-letters unknown types safely).

**Decisions this forces into the plan:**
- **Plan tasks / collab notes** have **uuid** ids, but the outbox key is `bigint[]`. Indexing them needs a surrogate integer or a doc-id scheme → mark as a **v2 decision**, not a silent v1 assumption.
- **Shift briefs**: give `ops_shift_briefs` a **BIGINT id + `organization_id`** from birth so it *can* be indexed later without a widening migration — cheap insurance.
- Known inherited gap: join-table edits don't re-enqueue the parent doc — if a comment body lives in a child table, it needs its own trigger to refresh search.

---

## 26. AI shift-brief — provider, metering, determinism-first

- **Provider (never hardcode):** resolve via **`resolveOrgAiConfig(orgId,'chat')`** (`src/lib/ai/org-provider.ts`) — BYOK vault → platform Gateway default (`anthropic/claude-haiku-4-5`), returns `"provider/model"` strings.
- **Call style:** forced-tool structured JSON via **`hermesToolCall`** (`src/lib/ai/hermes-tool-call.ts`, `tool_choice:required`, `temperature:0`) for the fixed brief schema (§6.5). Model the prompt on `sourcing-research.ts` — but pass the resolved provider; do **not** copy its hardcoded env.
- **Determinism-first:** assemble the brief's *facts* deterministically from Neon (completions, blocks, station rollups) like `ops-assistant.ts` `resolveLocalAiAnswer`; the LLM only narrates the "how to improve" prose. Degrades to a data-only brief when `isAiConfigured()` is false.
- **Metering (required):** call `recordAiUsage({context:'shift_brief',…})` (`src/lib/ai/usage.ts`). `AiUsageInput.context` currently allows only `query_embed|doc_embed|ask_ai` → **1-line widening** to add `'shift_brief'`.
- **A brief that *acts*** (flips tickets / posts collab) uses the plan-agent pattern: `createOpenAICompatible` + `streamText` + zod `tool()` + `stepCountIs` cap + `withAuth` gate + `recordAudit` + `after()` (reference `src/app/api/forge/chat/route.ts`). **v1 brief is read-only → no tools.** Keep it button-triggered (open-decision #5) to bound cost — no prompt caching exists yet.

---

## 27. Operations TV — unattended auth is the biggest unsolved gap

There is **no kiosk/TV/service identity** today (scan: zero `?tv=`/`kiosk`/service-role hits; `withAuth` requires a human `cf_sid` session; roles = shipper/inventory_manager/viewer/readonly/admin; only bypass is `allowAnonymous`). A wall display has no human, and a `station` session idle-expires at 8h and can't self-renew.

Design this **before Phase C ships to a real wall:**
- **Identity:** mint a dedicated **kiosk staff row** with a read-only role + the existing **persistent** session policy (`PERSISTENT_WINDOW` = infinite-idle/365-day, `src/lib/auth/session.ts`), provisioned once by PIN — *or* add a new `allowKiosk` branch to `withAuth` backed by a signed device token. Prefer the **kiosk-staff-row** route (reuses all session machinery; no new auth surface to secure).
- **Permission:** a new read-only **`operations.tv.view`** (not full `operations.view`) so a wall token can't reach edit surfaces. Register in `permission-registry.ts` + manifest test.
- **`?tv=1` chrome-strip:** hide nav/inputs; large type; auto-reconnect. Reuse `OfflineBanner` for a "stale — reconnecting" state (an Ably drop on a wall must degrade, not freeze).
- **Data:** `GET /api/operations/tv-board` gated by `operations.tv.view`; `withTenantTransaction`; civil-day bounds via `warehouseDayUtcBounds` only.

**TV "by station" caveat:** the master-plan bridge forces **every ticket-phase to station `ADMIN`** (`BRIDGE_STATION`, `ops-plans-bridge.ts`). The bridged product plan contributes only to the ADMIN column; the station breakdown is meaningful for the **adoption template** (RECEIVING/TECH/PACK/ADMIN) and hand-authored ops plans. Label the source so the wall doesn't look broken.

---

## 28. Feature-flag rollout (dogfood-first)

Gate every un-park / new surface behind a per-org flag so USAV dogfoods before customers (`src/lib/feature-flags.ts`):

- **Home:** convert `isParkedSurfaceLive()` (sync env) → async `resolveForOrg(orgId,'home_unparked','DOGFOOD_FULL_SURFACE')`; `page.tsx` becomes async. Seed a USAV row in `organization_feature_flags`.
- **Collab / Brief / TV:** add `isCollab` / `isShiftBrief` / `isOpsTvBoard` as 3-line `resolveForOrg` wrappers (copy `isOpsPlansUnifiedInbox`); default env OFF; enable per dogfood org. Local re-export in `src/lib/home/flags.ts` for import hygiene.
- **Reuse the existing flag:** `isOpsPlansUnifiedInbox` already shapes `/api/ops-plans/inbox` (plan tasks + work-order queues). Today/Tasks should read that endpoint, not re-implement the merge.

---

## 29. Observability — PostHog is wired but dormant

`src/lib/analytics/posthog.ts` exists (`captureEvent`, `identifyOrg`, `useCaptureFeatureUse`) but has **zero call sites and no key** — nothing is measured today. To prove Home/TV land:
- Provision `NEXT_PUBLIC_POSTHOG_KEY`; call `identifyOrg(orgId)` for per-org rollups.
- Emit `captureEvent('home_mode_viewed' | 'collab_message_sent' | 'task_blocked' | 'shift_brief_generated', …)` at the client mode/action sites.
- **TV uptime** has no pageview signal (unattended, autocapture off) → add a periodic client **`tv_board_heartbeat`** event so a dead wall is detectable.

---

## 30. Portfolio / lane hygiene

- Home is **WS-HOME** on the **`home` topic worktree** (`../cycleforge-home`, `topic/home`), currently **parked** (`docs/portfolio/WORKTREE-LANES.md`). Either build this initiative on that lane and promote to `main` dogfood on un-park, **or** explicitly move WS-HOME to the main dogfood lane and record it in INDEX §1 — reconcile with the plan's "work on `main`" phrasing before Phase A.
- Removing Ops `plans` as primary touches **both** mode-SoT copies + the round-trip test (§21).
- Add `HOME-OPS-*` tickets to `master-plan.mdx` and a WS-HOME phases block to portfolio INDEX when Phase A starts (reinforces §13 / F1 with the dual-SoT + lane detail).

---

## 31. Revised open decisions (supersede/extend §19)

| # | Question | Recommendation |
|---|----------|----------------|
| 6 | Task comments: new `ops_collab_messages` or extend `entity_notes`? | **Extend `entity_notes`** (`entity_type='ops_plan_task'`); add `ops_collab_threads` only if resolve-state is needed at launch (§22) |
| 7 | Block reason: free text or typed? | **Typed via `reason_codes`** — new `flow_context='ops_plan_task_block'` + soft-ref column on `ops_plan_tasks`; add a `blocked` status or a typed `ops_task_blocks` row (§22, backend SoT) |
| 8 | TV unattended auth: kiosk-staff-row or new `withAuth` branch? | **Kiosk staff row + persistent session + `operations.tv.view`** (§27) |
| 9 | Index plan tasks / collab in global search? | **Defer to v2** (uuid-vs-bigint key mismatch); give `ops_shift_briefs` a BIGINT id now so it can be indexed later (§25) |
| 10 | AI brief: agentic or read-only? | **Read-only, determinism-first, button-triggered v1**; agentic (acts on tickets) only behind the plan-agent pattern later (§26) |

---

## 32. Phase C — SHIPPED (2026-07-12)

The Operations TV / wall board is live behind a per-org flag. Exit met: **a wall
display is usable without Home.**

### What shipped

| Piece | Path |
|-------|------|
| Read-only board API | `src/app/api/operations/tv-board/route.ts` (`withAuth` + `operations.tv.view`, `isOpsTvBoard` gate → 404 when off) |
| Pure aggregator (DB-free, unit-tested) | `src/lib/ops-plans/tv-board.ts` (+ `tv-board.test.ts`) — Due today · Overdue · By station · Plan progress |
| Kiosk Monitor view + `?tv=1` chrome-strip | `src/features/operations/workspace/OperationsTvBoard.tsx`, wired in `OperationsWorkspace.tsx` (full-bleed `z-takeover` over sidebar/header) |
| Realtime hook | `useOperationsTvBoard.ts` — invalidate on `ops_plan.updated` (mirrors PlansSidebar) + 5-min civil-day-rollover fallback |
| Permission | `operations.tv.view` in `permission-registry.ts` + manifest regen + regression test |
| Flag | `isOpsTvBoard(orgId)` (`ops_tv_board`, env `OPS_TV_BOARD`, default OFF); USAV seeded ON by `2026-07-12_seed_ops_tv_board_usav.sql` |
| Roles | `viewer` grant + new least-privilege `kiosk` role (`seed-roles.mjs`) |
| Plan-edit strip | removed the dead `mode==='plans'` → `PlansSidebar` branch from `OperationsSidebarPanel.tsx` |

### Deliberate deviations from the literal plan

- **Wall entry is `/operations?tv=1` (a chrome-stripped kiosk surface), not a
  rip-out of the interactive `live` dashboard.** "Ops default mode = Live TV
  layout" is honored *for the wall* via the kiosk URL (a kiosk staff row's
  `default_home_path`); human operators keep the existing rich Operations
  modes. One archetype per region (Monitor); non-destructive to the dogfood floor.
- **`blocked` lane = Overdue for now.** No first-class block column exists until
  collab (Phase D). Overdue is the honest stuck proxy and is labeled as such.
- **ADMIN "by station" is labeled**, not excluded (§27 caveat): bridged
  master-plan tickets count under ADMIN and the tile annotates the plan-ticket share.

### Kiosk provisioning runbook (§27 — kiosk staff-row, no `allowAnonymous`)

Reuses existing session/staff machinery — **no new auth surface**. Per wall:

1. **Create a kiosk staff row** for the org (admin, `admin.manage_staff`) and give
   it a read-only role that carries `operations.tv.view`:
   - **`viewer`** — offered in the standard Add-Staff role dropdown (it's in
     `ALL_ROLES`); now grants `operations.tv.view` alongside the other read perms.
   - **`kiosk`** (least privilege — *only* `operations.tv.view`, so a wall token
     can never reach an edit surface) — a DB role seeded by `seed-roles.mjs`, not
     in `ALL_ROLES`, so it's assigned via the **Roles editor**
     (`PUT /api/admin/staff/[id]/roles` `{ roleIds }`), not the initial dropdown.
   Prefer `kiosk`. **Never assign `admin`.**
2. **Set a PIN** — `POST /api/admin/staff/[id]/set-pin` (in-person).
3. **Make the session persistent** — `PATCH /api/admin/staff/[id]`
   `{ sessionPolicy: 'persistent', defaultHomePath: '/operations?tv=1' }`.
   `persistent` = infinite-idle / 365-day sliding (`PERSISTENT_WINDOW`,
   `src/lib/auth/session.ts`); a heartbeat keeps it alive, so the wall never
   idles out and never needs `allowAnonymous`.
4. **Sign in once on the wall device** — `POST /api/auth/signin` `{ staffId, pin }`.
   The `cf_sid` cookie persists; the device lands on `/operations?tv=1` and
   auto-reconnects. Revoke via the admin sessions UI if a device is lost.
5. **Enable the surface for the org** — apply
   `2026-07-12_seed_ops_tv_board_usav.sql` (USAV), or insert
   `organization_feature_flags(flag='ops_tv_board', enabled=true)` for another
   dogfood org, or set env `OPS_TV_BOARD=true` globally.

### Deferred (not Phase C)

- Real `blocked` lane (Phase D collab), presence/"who's viewing" (§24), PostHog
  `tv_board_heartbeat` (§29), and a first-class kiosk *provisioning UI* (today it's
  the admin-route runbook above). Global-search indexing of plan tasks stays a v2
  decision (§25). A wall-scale `KpiTile size="wall"` variant was added to the
  Monitor registry (additive; default unchanged) — promote to more walls as they land.

---

## 33. Validation pass — 2026-08-01 (repo audit + cross-plan conflict check)

Checked Phase A/B/C "shipped" claims and Phase D/E/F premises against current repo state, plus a cross-check against two newer docs (`daily-triage-BACKEND-PLAN-VALIDATION.md` / `daily-triage-FRONTEND-PLAN-VALIDATION.md`, created 2026-07-31 — after this plan). **Net: Phase A/B/C hold up almost exactly as documented — this is the most execution-accurate doc of the four validated in this pass. Two real drifts: §3.1's mode table is stale (six modes shipped, not five; `inbox` is undocumented here), and Phase D's collab design premise (§22/§31) has been overtaken by `entity_threads`, which shipped elsewhere in the interim. Plus a real, currently-unacknowledged collision with the daily-triage plans over who owns `aggregateMyDayFeed`/Today.**

**Phase A/B/C — CONFIRMED, still true today.** `/forge` redirects to `/?mode=forge&view=live` exactly as claimed. `GET /api/operations/tv-board` + `src/lib/ops-plans/tv-board.ts` (+ test) exist. `operations.tv.view` permission and `kiosk` role both exist (`permission-registry.ts`, `seed-roles.mjs`). `isOpsTvBoard` flag + USAV seed migration exist. `OperationsTvBoard.tsx`/`useOperationsTvBoard.ts` are wired into `OperationsWorkspace.tsx` behind `?tv=1`. The `mode==='plans'` → `PlansSidebar` branch is confirmed removed, replaced by a client-side redirect to Home. Nothing here has regressed since 2026-07-12.

**Drift in §3.1 — the mode table undersells what actually shipped.** `HomeMode` today is a **six**-value union (`today | inbox | tasks | collab | forge | brief`) — an `inbox` mode (a real 244-line implementation, `HomeInboxMode.tsx`) was added post-hoc and isn't in this doc's table at all. Of the five modes this doc does list, only `today`/`forge`/`tasks` are real; `collab` and `brief` are still teaching placeholders — consistent with the Phase D/E checklist, but worth noting §3.1 now reads as more finished than the code is.

**Phase D's design premise is stale — CONFIRMED via a placeholder's own copy.** §22/§31 specify extending `entity_notes` (or a new `ops_collab_threads`) for task comments. But the live Collab-mode placeholder (`HomeModePanels.tsx`) already states: *"Ops conversations are now anchored to the record itself... `entity_threads` / `thread_messages` + `ThreadPanel`."* `entity_threads` shipped in the interim (2026-07-14, per repo memory) as the house-wide "conversation anchored to an entity" primitive — a different mechanism than either option this doc weighs. **Re-scope Phase D against `entity_threads` before building §22/§31 as written** — building `ops_collab_threads` or extending `entity_notes` now risks a second, competing "comment on a thing" primitive, which is exactly the anti-pattern `pattern-evolution.md` warns against.

**Phase D/E/F other claims — CONFIRMED still accurate:** `staff_messages` (`kind`/`context`/`read_at`) + `publishStaffMessage()` + `ActivityInboxContext` handling all still real and unchanged. `ops_collab_*`/`ops_task_blocks`/`ops_shift_briefs` tables confirmed still unbuilt (matches `[ ]` checklist). `resolveOrgAiConfig`/`hermesToolCall` still exist as described for the brief plan. Yjs awareness/presence is still unwired (§24's gap is still open). PostHog is still dormant, zero call sites (§29's gap is still open).

**Cross-plan conflict with the daily-triage docs — RESOLVED 2026-08-01.** Full design in `daily-triage-BACKEND-PLAN-VALIDATION.md` B3 section. Resolution in one line: **`aggregateMyDayFeed`/`MyDayFeed` is widened additively, never replaced or forked** — `assigned`/`doNext`/`queueCards` (this plan's territory: work-orders + `ActivityInboxContext`-style interrupts) keep their exact current shape, and the daily-triage plan's subscription-born rows (pin tracking, messages, feedback) are merged in as more `MyDayInterrupt` values sourced from the **already-shipped** `staff_inbox_items`/`/api/inbox` pipeline — not a new `TriageTask` table or a competing schema. The categorized/filterable board the daily-triage frontend plan wants is a client-side derivation (`TriageRow`, deliberately renamed off "Task" to avoid colliding with **this plan's** `ops_plan_tasks`/"Tasks" mode) — it does not touch `ops_plan_tasks`, `?task=`, or `?plan=` at all. **This plan's Phase D/Tasks-mode work is unaffected and can proceed independently**; the only shared surface is `aggregateMyDayFeed`, and it now has one owner-neutral, additive contract both plans build against.

**Param check:** no direct URL-param collision found between this doc's `today`-mode params (`task`, `plan`, `view`, `q`, `open`, `filter`) and the daily-triage frontend plan's proposed `?urgent=&assignee=&category=&state=` — disjoint today. (A different, already-documented collision exists between the daily-triage plan's `?category=` and an unrelated `/dashboard` legacy alias — see that doc's own validation log.)

**External finding — kiosk/TV unattended auth (§27).** Current kiosk-security guidance ([Hexnode](https://www.hexnode.com/blogs/what-is-kiosk-mode/)) frames unattended kiosks as a distinct "unattended attack surface" and flags session-hijacking via un-wiped prior sessions as the main risk on shared devices — which is exactly why this doc's chosen design (a dedicated least-privilege `kiosk` staff row + persistent session + PIN, rather than a generic shared login) is the right call already implemented; no change recommended, just confirmation the shipped approach matches the external consensus rather than the riskier "shared login" pattern the same guidance warns against.

Sources: [Hexnode — What is kiosk mode?](https://www.hexnode.com/blogs/what-is-kiosk-mode/)

---

*End of plan. Prefer implementing Phase A–B before collab/AI so Home earns trust as triage.*
