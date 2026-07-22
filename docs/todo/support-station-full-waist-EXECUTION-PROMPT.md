# Support Station (full waist) + vendor-neutral helpdesk — Fable 5 execution prompt

> Paste this whole file into a fresh **Fable 5** agent. It is self-contained: it
> carries the current state, every remaining phase, exact file maps, the house
> rules, verify gates, and "done when". **Phases 0–1 are DONE and Phase 2 EXPAND
> is authored (migration unapplied).** Your job: finish Phases 2→6.
>
> Hub + status: [`support-station-full-waist-handoff.md`](support-station-full-waist-handoff.md).
> Human gates (migration apply + deploy order): [`docs/partial/HUMAN-TODO.md`](../partial/HUMAN-TODO.md) §K.

---

## 0. Mission (one paragraph)

Cycle Forge is promoting **Support** from a "More" page into a first-class **Station**
with **Unbox Station-Workbench** focus, completing the **ticket link waist**
(re-key `ticket_links` onto the platform-agnostic `support_ticket_id`, internal `#`
primary, create-like-Unbox), **and** making the whole helpdesk surface
**vendor-neutral** — Zendesk is ONE helpdesk *capability provider* behind the
facade, swappable like Zoho/Ecwid, so a customer can integrate any helpdesk and it
works the same as every other product. Compose the named SoT primitives; grow them
when weak; never fork.

---

## 1. Current state (what is already in the tree — DO NOT redo)

All of the below is **implemented, type-clean (tsc 0 errors), and uncommitted**
(the user owns commits). Read the files before extending them.

### Phase 0 — Support is a Station (DONE)
- `src/lib/sidebar-navigation.ts`: Support `kind:'station'` in `APP_SIDEBAR_NAV` + `SIDEBAR_PAGE_NAV` (was `'bottom'`).
- `src/lib/stations/surface-keys.ts`: added `'support'` to `SURFACE_KEYS` + `SURFACE_REGISTRY` (archetype `station`, permission `integrations.zendesk`, `pageKey:'support'`, `modeKey:'tickets'`, `scan:null`, no `workflowNodeType`).
- `src/app/support/page.tsx`: rewritten to `SurfaceGate surfaceKey="support"` + `RouteShell(actions=SupportSidebarPanel, history=SupportWorkspace in RightPaneOverlayHost)`, desktop-only `hidden md:flex` (mirrors `src/app/shipping/page.tsx`).
- `src/lib/stations/surface-routing.test.ts`: mobile-allowed test now exempts mobile-restricted surfaces (Support is a desktop console). **40/40 station guard tests green.**

### Phase 1 — SupportTicketFocus (DONE) — `src/components/support/station/`
- `SupportTicketFocus.tsx` — `StationContextBar` + `StationWorkbench`, crossfades on `?ticket=`, default tab = Ticket (conversation).
- `SupportTicketIdentity.tsx` — house one-row identity (`TicketChip` `#id` + subject + status dot). **Composes `StationContextBar`, not `CartonContextCard`** (a ticket is a genuinely different entity; the bar's `identity` slot accepts a "pack identity equivalent").
- `support-station-tabs.tsx` — `buildSupportStationTabs`: **Overview** (linkage strip) · **Connections** (`SupportContextHub` full) · **Ticket** (embedded `SupportTicketDetail`) · **Support** (team segment) · **Timeline** (`WorkspaceTimelineTab`, gated on linkage content).
- `src/components/support/zendesk/SupportWorkspace.tsx`: tickets mode renders `SupportTicketFocus` under `AnimatePresence`.
- Template you mirrored: `src/components/support/orders/SupportOrdersWorkspace.tsx` (already Station-shaped for the orders mode).

### Phase 2 — Re-key waist: EXPAND authored, **NOT applied** (deploy-gated)
- **Migration** `src/lib/migrations/2026-07-21_ticket_links_rekey_support_ticket_id.sql`: idempotent backfill `support_ticket_id` → `SET NOT NULL`; `zendesk_ticket_id` → **DROP NOT NULL** (unblocks internal tickets); adds `ux_ticket_links_support_entity` + `ux_ticket_links_support_anchor`. Additive + permissive. `db:migrate:dry` → it is the ONLY pending file.
- **Drizzle** `src/lib/drizzle/schema.ts`: modeled `supportTickets`; updated `ticketLinks` (nullable `zendeskTicketId`, NOT NULL `supportTicketId`, added `linkRole`, support-led indexes).
- **Canonical writer** `src/lib/zendesk-links.ts`: new `linkSupportTicketEntity` (support-led `ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id)`, keyed on `support_ticket_id` so it serves BOTH zendesk + internal). `linkTicket` now delegates to it (compose, don't fork).
- **Internal escalation** `src/lib/threads/escalate.ts`: internal path now writes a `ticket_links` anchor via `linkSupportTicketEntity` (zendesk id NULL). `escalate.test.ts` asserts the entity is threaded.
- Verified: tsc 0, schema-drift OK, 67 threads/support unit tests pass, `db:migrate:dry` green.

**⚠️ HARD DEPLOY-ORDER GATE (HUMAN-TODO §K):** the migration MUST be applied *before*
this code deploys — `linkTicket`→`linkSupportTicketEntity` names
`ux_ticket_links_support_entity`, which doesn't exist until the migration runs.
Deploying the code first breaks ALL ticket linking (same class as `2026-07-16c`).

---

## 2. Non-negotiable house rules (read `AGENTS.md` first)

- Stay on the current checkout's branch/worktree; no ad-hoc branch switch; **never `git stash`**. **User owns commits — do not commit unless asked.**
- **Compose / grow the SoT; never fork.** Named primitives you must reuse: `StationContextBar`, `StationWorkbench`, `SupportContextHub`, `ReceivingClaimModal`, the helpdesk facade (`getHelpdeskProvider`/`requireHelpdeskProvider`), `upsertSupportTicket`, `linkSupportTicketEntity`, `/api/support/tickets/link`, the capability-label SoT (`capabilityNoun`/`capabilityTitle`/`connectedProviderLabel`). Never invent a second claim wizard, identity header, ticket-link table, or helpdesk client.
- **Product surfaces speak capabilities, not vendor brands** (AGENTS.md → Integrations; this is Phase 6's whole basis).
- **Migrations:** hand-written SQL via the `db-migration-author` skill; **never `db:push`**. Expand/dual-write/contract; the runner applies ALL pending files at once, so do NOT author a contract file until its writers are deployed.
- **Tenant:** `orgId` from `ctx`; `withTenantTransaction`; `recordAudit` + `clientEventId` idempotency on mutations. Routes follow `withAuth → validate → domain helper → 404/409/200 → recordAudit → after()`.
- **DS ratchets:** migrate to DS primitives (`Button`/`IconButton`, `focusRing`, `text-role-*`, spacing intents, `Panel`/`SectionCard`); never raise a baseline or `--no-verify`.
- **Before "done":** `npm run verify` green; append `pnpm worklog "<action>" --result <r>`.
- **Unit tests are DB-free via `Deps` injection** and run through the server-only shim:
  `node --require ./scripts/register-server-only-shim.cjs --import tsx --test <file>` (plain `npx tsx --test` fails on `import 'server-only'`).

---

## 3. Ratified decisions (do not relitigate)

1. Support `kind:'station'`; surface key `support`; page = `SurfaceGate` + `RouteShell`.
2. Six L2 modes kept: tickets | orders | voicemail | calls | warranty | issues. Master-nav owns L2; **no mode chrome in the right pane**.
3. Tickets focus = Unbox anatomy, tabs Overview | Connections | Ticket | Support | Timeline.
4. Operator primary ticket label = internal `support_tickets.id` (`#42`); provider-native id (Zendesk today) is the secondary chip.
5. `ticket_links` unique indexes re-key onto `support_ticket_id`; `zendesk_ticket_id` is a nullable provider cache.
6. Escalate/internal tickets MUST write `ticket_links` (done in Phase 2 for the internal path).
7. Create: reuse Unbox `ReceivingClaimModal` path when receiving-anchored; otherwise helpdesk-facade create + `upsertSupportTicket` + `/api/support/tickets/link` via a shared host.
8. `?ticket=` should prefer the support registry id; scanners still resolve both ids.
9. **Vendor-neutral helpdesk (NEW):** all operator-facing helpdesk copy resolves from the capability SoT / runtime provider label; connector-layer identifiers stay as implementation detail behind the facade.

---

## 4. Remaining work — execute in order, checkpoint after each phase

### Phase 2b — FINISH the re-key (mostly HUMAN gate + deferred contract)

**Do now (code, safe):**
- Re-key the remaining shipment-reference WRITERS to the support-led arbiter, mirroring `linkSupportTicketEntity` (they already resolve `supportTicket.id`): in `src/lib/support/ticket-link.ts` → `addTicketShipmentReference` (change `ON CONFLICT (organization_id, zendesk_ticket_id, entity_type, entity_id)` → `(organization_id, support_ticket_id, …)` and its inline `WHERE … zendesk_ticket_id=$ AND is_primary` anchor guard → `support_ticket_id`); in `src/lib/zendesk-links.ts` → `linkTicketToShipment` (same). These are equivalent for zendesk tickets while both index families exist, so they are safe once the expand migration is applied.
- Re-key the READERS that resolve the anchor onto `support_ticket_id` where it is cheap and correct: `getTicketEntity` (currently reads `WHERE zendesk_ticket_id=$ AND is_primary`), `listTicketShipmentReferences`, `removeTicketShipmentReference` (its promote UPDATE), `promoteShipmentTicketToReceiving`. They stay correct for zendesk during the transition; re-key them so internal tickets resolve too and the axis is consistent.
- Add DB-free `Deps`-injected unit tests for the re-keyed writers/readers where a domain seam exists (follow `escalate.test.ts` / `src/lib/shipping/shipment-links.test.ts`).
- Extend `tests/e2e/stn-ticket-link-api.spec.ts` (if present) for: internal ticket many-links an entity; escalate internal → `ticket_links` row with `support_ticket_id`.

**HUMAN gate (surface, do not do yourself):** applying `2026-07-21_…rekey…sql` via `/db-migrate`, honoring the deploy-order gate (HUMAN-TODO §K). Verify with the migration header's VERIFY queries.

**Deferred CONTRACT migration — do NOT author until the support-led writers are DEPLOYED** (runner arms every pending file): drop the zendesk-led uniques (`ux_ticket_links_ticket_entity` / `_ticket_primary` / `_ticket_anchor`) + the `is_primary` sync trigger; add `('ticket_links','is_primary')` to `scripts/schema-drift-manifest.json` once no code reads it.

**Still-open pre-existing gap:** RECEIVING / RECEIVING_LINE parent-delete triggers for `ticket_links` (orphan cleanup). Needs a parent-table audit (`receiving` vs `receiving_carton`; `receiving_line` vs `receiving_lines`) — the same audit 2026-07-16 deferred. Reuse `fn_delete_ticket_links_on_parent_delete(TG_ARGV[0])`.

### Phase 3 — Identity + Connections (UI; internal `#` primary)

- `src/lib/support/tickets.ts`: `formatSupportTicketDisplayLabel` currently prefers the Zendesk external id. Flip the operator PRIMARY to the internal registry id (`formatSupportTicketLabel(id)` → `#42`); expose the provider id as SECONDARY. Add pure helpers + unit tests (`primaryTicketLabel`, `secondaryProviderLabel`). Keep scanners resolving both (`parseTicketScanValue`).
- `SupportTicketIdentity.tsx`: today it renders `#${ticketId}` where `?ticket=` is the Zendesk id. Once the registry is the URL key, render internal `#id` PRIMARY + provider chip SECONDARY (dual-`#`). Resolve the ticket registry row via `useSupportContext` (`bundle.linkage` / a ticket-registry field) or a small `/api/support/tickets/:id` read.
- Dual-`#` everywhere a ticket number shows: `src/components/support/context/LinkageStrip.tsx`, `src/components/support/zendesk/queue/SupportTicketRow.tsx`, toasts, `src/components/linkage/LinkedTicketsPanel.tsx`.
- **Connections tab**: wire `LinkedTicketsPanel` + `/api/order-linkage` into `support-station-tabs.tsx`'s Connections tab (currently just `SupportContextHub` full). Show the internal DB graph: order / STN / receiving / serial.
- **Ticket → unit-journey deep link** (closes staff-plan 03 gap): from a serial-linked ticket, one-click open the unit journey (`operationsJourneyFocusedQuery` / the journey href used by `WorkspaceTimelineTab`).
- Extend `SupportContextBundle` (`src/lib/support/context-types.ts`) so a ticket always carries `{ id, label(internal), externalTicketId, providerLabel }`.

### Phase 4 — Create / link like Unbox

- Promote a **shared claim host** `src/components/support/station/useSupportTicketClaimHost.ts` = `openClaimModal('create'|'link')` + modal state, modeled on `useUnboxLineController.openClaimModal` + `LineEditModals`. (Deferred in Phase 1 to avoid a dead-code gate — create it here where it's wired.)
  | Focus anchor | Create | Link |
  |---|---|---|
  | Receiving / line | `ReceivingClaimModal` → `POST /api/receiving/zendesk-claim` | claim-link or `/api/support/tickets/link` |
  | Order / STN / blank | helpdesk-facade create → `upsertSupportTicket` → link API | `TicketLinkPopover` / universal link |
  | Serial | prefer link-existing | `SERIAL_UNIT` reference |
- Mount `ReceivingClaimModal` in the Support station for receiving anchors; success → `invalidateSupportContextCaches` + entity refetch.
- Wire Claim/Link into `SupportTicketFocus` (identity `moreDetails`) and `SupportOrdersWorkspace` (`onMakeClaim`/`onRequestLinkTicket`).
- Sidebar Tickets queue: **New ticket** CTA → create host → on success `?ticket=<supportTicketId>`.
- Hard rules: never write a denormalized `zendesk_ticket` column alone (always waist → `ticket_links` + `support_tickets`); receiving gate for claim, `integrations.zendesk` for station-generic create. Keep Unbox + Testing on the SAME host (no regression).

### Phase 5 — Remaining modes + ship

- Voice/warranty/issues ticket chips: dual `#` + `support_ticket_id` links.
- `SupportContextDetailPanel` stays the Links overflow; Connections tab is the primary graph.
- Ship gates: `npm run verify` green → migration dry-run + drift → route-auth emit if new routes → dogfood loop (fail→serial ticket→Support Connections→journey <2 min; create ticket→dual `#` + chips) → `pnpm worklog` → mark `ticket-stn-many-link-plan.md` #2 done + staff-03 checkboxes.

### Phase 6 — Vendor-neutral helpdesk (NEW — the user's added requirement)

**Goal:** Zendesk is ONE helpdesk *capability provider* behind the facade. A customer
can connect any helpdesk and every Support surface reads/labels the same way. This is
the existing house law (`AGENTS.md` → "Product surfaces speak capabilities, never
vendor brands") applied to the whole Support surface.

**Scope — what MUST change (operator-facing):**
- **Copy/labels** hardcoding "Zendesk": empty/error/permission strings, headers, tooltips, placeholders. Replace with the capability SoT:
  - Generic: `capabilityTitle('helpdesk')` ("Helpdesk") / `capabilityNoun('helpdesk')` ("helpdesk") — both **client-safe** (`src/lib/integrations/capability-labels.ts`).
  - Runtime provider name: server `connectedProviderLabel(orgId,'helpdesk')` / `connectedProviderKey(orgId,'helpdesk')` (`src/lib/integrations/capability-connections.ts`, **server-only**).
  - The facade already ships `HELPDESK_NOT_CONNECTED_MESSAGE` / `HELPDESK_CONNECT_HINT` — reuse them; do not re-hardcode.
- **"Open in <provider>" deep links** (`SupportChatHeader`, `SupportTicketFocus`): brand names ARE allowed here per the house rule, but resolve the label AT RUNTIME so a non-Zendesk customer gets their own. Give the helpdesk facade a ticket-URL method (`HelpdeskProvider.ticketUrl(id)` / a `helpdeskTicketUrl` behind the facade) instead of the hardcoded `zendeskTicketUrl`; label the button from the runtime provider name.
- **Known operator-copy hits to fix** (grep `Zendesk` under `src/components/support`, `src/components/threads`, `src/components/linkage`): `SupportWorkspace.tsx` ("You need Zendesk ticket access…", "…ask for Zendesk ticket permission"), `SupportTicketDetail.tsx` ("Zendesk is busy" / "Helpdesk isn't connected" — the not-configured branch), `SupportChatHeader.tsx` ("Open in Zendesk", "Zendesk assignee"), `SupportTicketFocus.tsx` ("Open in Zendesk"), `SupportTicketIdentity.tsx` (comment only), `VoicemailDetail.tsx` ("Zendesk ticket #"), `TicketLinkPopover.tsx` ("existing Zendesk ticket"), `LinkedTicketsPanel.tsx` ("Linked Zendesk tickets"), `ThreadPanel.tsx` (escalate label). ~104 component files reference the word; the TARGET is the ~operator-copy subset, not identifiers.

**Client runtime-label mechanism (build once, reuse):** there is NO client hook for
the connected helpdesk provider label today. Add a tiny read: `GET
/api/integrations/capability-label?cap=helpdesk` → `{ label, providerKey }` (server
resolves via `connectedProviderLabel`/`connectedProviderKey`), plus a
`useCapabilityProviderLabel('helpdesk')` hook (TanStack, long `staleTime`). Use it for
deep-link buttons / headers; fall back to `capabilityTitle('helpdesk')` while loading.
Follow the `new-route` skill for the endpoint.

**Explicitly OUT OF SCOPE (allowed to stay per the house rule — do NOT mass-rename):**
- Connector-layer modules + identifiers: `src/lib/zendesk.ts`, `src/lib/zendesk-links.ts`, `useZendeskQueries`, `zendeskTicketId` params, the `['zendesk', …]` query keys, `ZendeskClaimModal` storage key, the DB column `zendesk_ticket_id` (a legitimate provider cache), permission id `integrations.zendesk` (ids never rename).
- The Integrations hub `PROVIDER_CATALOG` card (brand strings belong there).

**Do / Don't:**
| Do | Don't |
|---|---|
| `capabilityTitle('helpdesk')` / runtime `connectedProviderLabel` in operator copy | Hardcode "Zendesk" in an empty/error/permission string |
| Facade `ticketUrl()` + runtime label for "Open in …" | `zendeskTicketUrl(...)` + literal "Open in Zendesk" on a product surface |
| Route new create/link through `requireHelpdeskProvider` | `import '@/lib/zendesk'` directly in a product route/component |
| Leave connector modules + `zendesk_ticket_id` as implementation detail | Mass-rename `zendeskTicketId`/query keys "for consistency" |

---

## 5. Verify gates (every phase) + Done when

**Gates:**
- Inner loop: `node --require ./scripts/register-server-only-shim.cjs --import tsx --test <file>` for the file you touched; `npx tsc --noEmit -p tsconfig.json` when types are in doubt.
- Before done: `npm run verify` (lint, typecheck, unit + DS ratchets, knip, route-auth drift/enforce, schema drift) — green locally ⇒ green in CI.
- Migrations: `npm run db:migrate:dry` + schema-drift; surface applies as a HUMAN gate.

**Done when:**
- [x] Support under Stations; `/support` uses `SurfaceGate` + `RouteShell`.
- [x] Tickets focus = `StationContextBar` + `StationWorkbench` with Connections/Ticket/Support.
- [ ] `ticket_links` uniquely keyed by `support_ticket_id`; internal tickets linkable; escalate writes links (migration applied + writers/readers re-keyed).
- [ ] Operator primary `#` = internal registry id; provider id secondary.
- [ ] Create/link uses the Unbox-equivalent API waist (claim modal or shared host) — no page-local invent.
- [ ] Connections shows the internal DB graph (order/STN/receiving/serial) for the open ticket.
- [ ] **Every Support operator surface is vendor-neutral** — no hardcoded "Zendesk" in operator copy; deep-links + labels resolve the runtime provider; new create/link flows go through the helpdesk facade.
- [ ] `npm run verify` green; worklog appended; `ticket-stn-many-link-plan.md` #2 marked done.
- [ ] User was asked before any prod migration apply and before any commit.

---

## 6. Golden references (import, don't fork)

- `src/components/support/orders/SupportOrdersWorkspace.tsx` — the station-shaped template Phase 1 mirrored.
- `src/components/receiving/workspace/LineEditPanel.tsx` + `line-edit/hooks/useUnboxLineController.ts` (`openClaimModal`) + `line-edit/LineEditModals.tsx` — Phase 4 create path.
- `src/components/station/entity-context/` + `src/components/station/workbench/` — the composed station SoT.
- `src/lib/integrations/helpdesk/` (facade) + `src/lib/integrations/capability-labels.ts` + `capability-connections.ts` — Phase 6 SoT.
- `.claude/rules/display/station-workbench.md` · `.claude/rules/polymorphic-tables.md` · `.claude/rules/backend-patterns.md` · `.claude/skills/db-migration-author` · `.claude/skills/new-route` · `.claude/skills/org-scope`.

## 7. If blocked

Stop and ask the user. Do not invent a second ticket system / helpdesk client, stash
WIP, `--no-verify`, apply a prod migration without asking, or mass-rename connector
identifiers. Prefer growing `SupportContextHub` / the claim host / the ticket-link
waist / the capability-label SoT over a page-local patch.
```
