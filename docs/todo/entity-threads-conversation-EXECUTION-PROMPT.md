# EXECUTION PROMPT — Entity Threads (unified conversation + timeline display)

Paste this to a fresh agent (or the agentic loop) to build the feature in
`docs/todo/entity-threads-conversation-plan.md`. Self-contained on guardrails; read the plan for full rationale and
file:line targets.

---

## Mission

Add **entity-anchored, ticket-optional conversation threads** to Cycle Forge and surface them consistently. Message
bodies flow onto the existing `ops_events` spine and into the existing `EventTimeline`; one reusable **Conversation
panel** mounts in the idiomatic slot on every entity detail surface. You are **composing on ratified SoTs, not
inventing** — two of the three layers already exist.

**Ground truth (verified 2026-07-14):** the polymorphic anchor `(entity_type, entity_id)` and the `ops_events`
timeline spine already exist; the **only** missing layer is a conversation-body table pair. Do not rebuild the first
two. Do not extend `entity_notes` (its `entity_id` is UUID; every modern sibling is BIGINT).

## Non-negotiable house rules

- **Constitution:** obey `AGENTS.md`, `.claude/rules/polymorphic-tables.md`, `.claude/rules/backend-patterns.md`,
  `.claude/rules/display/reference-timeline.md`, `.claude/rules/display/workbench.md`, `.claude/rules/contextual-display.md`,
  `.claude/rules/ui-design-system.md`.
- **Use the skills, don't reinvent:** `db-migration-author` (Phase 0), `domain-unit-test` (Phase 1), `new-route`
  (Phase 2), `improve-ui` (Phase 4). Spawn `permission-registry-guard` after touching `permission-registry.ts` and
  `api-route-reviewer` after each new route.
- **Hooks are law:** never bypass secret-path / SoT-regression / `db:push` / force-push blocks. Migrations are
  hand-written SQL applied by `npm run db:migrate` — **never `db:push`**.
- **Stay on the current branch** (`git branch --show-current`); no ad-hoc branches, no `git stash`. **Do not commit**
  unless the user asks. Never commit `.env`.
- **Tenant + status discipline:** `orgId` from `ctx` never body; `withTenantTransaction`; thread `clientEventId`;
  `recordAudit`; no raw status `UPDATE`.
- **Compose the SoT:** anchor vocab from `src/lib/surfaces/registry.ts`; timeline via a new adapter (never a 2nd
  timeline component); chat UI mirrors `SupportChatThread.tsx` / `SupportChatComposer.tsx`; motion via
  `useMotionPresence`/`useMotionTransition`; color only from semantic tokens.

## Ratified decisions (do not relitigate)

1. New `entity_threads` + `thread_messages`; **do not** extend `entity_notes`.
2. `entity_id BIGINT`; `entity_type` named CHECK = 7 UPPERCASE values (`RECEIVING, RECEIVING_LINE, SERIAL_UNIT, ORDER,
   FBA_SHIPMENT, REPAIR, WARRANTY_CLAIM`) from `SURFACE_ENTITY_TYPES`.
3. `thread_messages` INSERT emits an `ops_events` row (`event_type='THREAD_MESSAGE'`), entity mapped to `ops_events`'
   **lowercase** 9-value vocab via the registry.
4. Timeline shows messages via **`threadMessagesToTimeline`** + a 6th `mergeJourney` source — no new timeline component.
5. Conversation panel is a chat surface (bubbles + composer) mirroring the support chat, **distinct** from the
   read-only `EventTimeline`. Both appear.
6. Thread owns the ticket attach: nullable `entity_threads.support_ticket_id`. **`ticket_links` untouched.**
7. New perms `support.thread.view` / `support.thread.manage` (no `support.*` exists today).
8. **Monitor (Operations history) = read-only** thread rows; **no composer there.**

## Execute in order — checkpoint after each phase

> After each phase: run its verify command, report result, and **stop at any `ASK-FIRST` gate** before proceeding.

**Phase 0 — Schema.** `db-migration-author`. One dated migration: `entity_threads` + `thread_messages` per the DDL in
the plan (named CHECKs; `entity_id BIGINT`; `thread_messages.thread_id` FK CASCADE; org-led unique
`(organization_id, entity_type, entity_id)`; `client_event_id` idempotency unique). Add parent-delete triggers (one per
canonical parent sharing `fn_delete_entity_threads_on_parent_delete()` dispatching on `TG_ARGV[0]`; skip+document any
parent with no confirmed table). `enforce_tenant_isolation('entity_threads')` + `('thread_messages')` in the **same**
migration. Backfill mappable `entity_notes` rows (idempotent, `client_event_id='entity_notes:<id>'`; do not drop
`entity_notes`). Model both in `src/lib/drizzle/schema.ts`. **Verify:** `npm run db:migrate:dry` + `npm run
schema:drift-guard`. Note the migration is UNAPPLIED in `docs/partial/HUMAN-TODO.md`.

**Phase 1 — Domain (`src/lib/threads/`).** `domain-unit-test`. Deps-injected: `resolveThreadForEntity`,
`getOrCreateThread` (validate parent exists app-side), `postThreadMessage` (idempotent, bump `last_message_at`, emit
`ops_events`), `listThreadMessages`, `attachSupportTicket`. **Verify:** `npx tsx --test src/lib/threads/*.test.ts`.

**Phase 2 — Routes.** `new-route` skeleton. `POST /api/threads`, `POST|GET /api/threads/[id]/messages`,
`GET /api/threads`, `POST /api/threads/[id]/attach-ticket`. Register `support.thread.view/manage` in
`permission-registry.ts` **and** `route-permission-manifest.test.ts`. **Verify:**
`npx tsx --test src/lib/auth/route-permission-manifest.test.ts` + `audit-route-auth`; then `api-route-reviewer` on each
route.

**Phase 3 — Timeline.** `src/lib/timeline/thread-events.ts` `threadMessagesToTimeline` (own the tone map; export from
`index.ts`); add `'thread'` source to `src/lib/timeline/journey.ts`; add a thread spine to `readJourneyEntity` in
`src/lib/operations/journey.ts` (org-gated point lookup). **Verify:** `run` — seed a message, confirm a timeline row on
`/o/[orderId]`.

**Phase 4 — ThreadPanel.** `src/components/threads/ThreadPanel.tsx` + `src/hooks/useThread.ts`. Mirror
`SupportChatThread.tsx:98` (list) + `SupportChatComposer.tsx:25` (⌘↵ composer, `VisibilityToggle`). Optimistic
`onMutate`→rollback→`onSettled`; `safeRandomUUID()` clientEventId; house empty/loading/error; motion via hooks; tokens
only. **Verify:** `improve-ui` critique + `run`.

**Phase 5 — Graft (display).** Same primitive, idiomatic slot (exact file:line in the plan's graft table):
Order = new `conversation` tab + merge into `OrderTimelineSection.tsx:61-64`; Receiving = "Conversation" SectionTab in
`LineEditPanel.tsx` beside `ticket`; Unit = collapsible card after `TimelineCard` in `UnitDetailWorkspace.tsx:68`;
Warranty = `<Section title="Conversation">` in `WarrantyClaimDetailPanel.tsx` (replace read-only Notes `:248`);
Support console = local thread mirrors `SupportTicketDetail`; Home = replace `HomeCollabPanel` placeholder. **D8:
Operations history read-only, no composer.** **Verify:** `run` each surface.

**Phase 6 — Ticket attach.** Wire `attachSupportTicket` + `/attach-ticket`: escalate → `helpdesk.createTicket` →
`linkTicket` → set `support_ticket_id`; convert-to-internal → `upsertSupportTicket({provider:'internal'})` (first real
writer). Header linked-ticket chip. **Verify:** `run` escalate + convert.

**Phase 7 — Consolidation.** Read-fold `warranty_claim_events(NOTE)`, `receiving_claim_seller_messages`, entity-context
`staff_messages` into the ThreadPanel (adapters, no migration); route the four scattered note editors to the composer.
**`ASK-FIRST`** before: (a) adding `enforce_tenant_isolation` to `ticket_links`/`support_ticket_assignments`;
(b) making `ticket_links` itself ticket-optional; (c) any Case/Journey-root work.

## Definition of done

- `npm run db:migrate:dry`, `schema:drift-guard`, `route-permission-manifest.test.ts`, `src/lib/threads/*.test.ts` all
  green; `npx tsc --noEmit` clean.
- A thread can be created and messaged on an entity with **no** Zendesk ticket; the message shows in that entity's
  `EventTimeline`; later escalation links a ticket.
- The Conversation panel appears in the same idiomatic slot on order / receiving / unit / warranty / home; Operations
  history shows read-only thread rows with no composer.
- `improve-ui` critique clean; DS guards (typography, tokens, buttons) pass.
- Every `ASK-FIRST` gate was surfaced to the user, not auto-decided.

## Stop / ask-first triggers (do not auto-proceed)

- Relaxing `ticket_links.zendesk_ticket_id` (shared hub + 6 backfills).
- Any RLS/tenant migration on existing shared tables.
- Introducing a Case/Journey root entity.
- Public API changes to a shared primitive used by many call sites (e.g. `SectionCard`, `EventTimeline`).
