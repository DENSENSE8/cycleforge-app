# Many STNs ↔ one support ticket

**Status:** shipped to production 2026-07-16 (deployment `cycleforge-brpd0dmor`, aliased `app.cycleforge.ai`).
Core capability is live and proven. Follow-ups below are real and ranked.

## Why

Operators needed to attach a support ticket to the shipping tracking numbers (STNs)
it concerns, from **outbound** and **support** — and one ticket routinely concerns
several STNs (split shipments, re-ships, multi-box claims).

Two things blocked it:

1. **`UNIQUE (organization_id, zendesk_ticket_id)`** gave a ticket exactly ONE
   entity slot. Many-STN was physically impossible, not merely un-surfaced. The
   precedence ladder (`pickTicketLinkAnchor`: line > carton > shipment) and
   `promoteShipmentTicketToReceiving` exist *because* there was only one slot.
2. **No UI.** Outbound had zero link affordance. Support had one free-text "Link
   tracking" input, gated `!tracking` — so it vanished the moment any tracking
   resolved, which is exactly the wall a second STN hits.

The backend already had `entity_type='SHIPMENT'` and a `shipment` anchor on the
link route. Zero `SHIPMENT` rows existed in prod: the path had never run.

## What shipped

### Data model — anchor vs reference, inside `ticket_links`

`ticket_links` gained `is_primary` (later `link_role`), applying the pattern
`shipment_links` already invented for the identical problem: **many rows + a
PARTIAL unique index**, so the invariant is enforced by an index rather than by
convention.

| Index | Rule |
|---|---|
| `ux_ticket_links_ticket_entity (org, ticket, entity_type, entity_id)` | no duplicate (ticket ↔ entity) pair; the `ON CONFLICT` target |
| `ux_ticket_links_ticket_anchor (org, ticket) WHERE link_role='anchor'` | exactly ONE anchor per ticket |

The one-entity rule was **narrowed, not removed**: from "one ROW per ticket" to
"one ANCHOR per ticket" — which is the actual business rule. An **anchor** is what
a ticket is *about*; a **reference** is another entity it touches.

**Rejected: `shipment_links` with `owner_type='SUPPORT_TICKET'`.** It breaks under
promotion — ticket anchored to STN 9 with many-list [9,11,13]; a carton adopts STN
9; `promoteShipmentTicketToReceiving` rewrites `ticket_links` → `(RECEIVING, 42)`;
the primary now names a carton the many-list never heard of, with no FK, no index,
and nothing to detect the drift. The `orders.shipment_id` analogy fails: that is a
*column on the owner row* (co-written, structurally constrained), not a second
table with its own writer. `direction NOT NULL` also has no honest value on the
`registerShipmentPermissive` path, and `polymorphic-tables.md:33` bans reusing the
`owner_*` convention for anything new.

### Migrations (all applied)

| File | Does |
|---|---|
| `2026-07-16_ticket_links_many_links.sql` | `is_primary` + idempotent backfill; the two unique indexes; org-led `idx_ticket_links_org_entity`; `fn_delete_ticket_links_on_parent_delete` + STN trigger |
| `2026-07-16b_ticket_links_link_role_expand.sql` | `link_role TEXT CHECK ('anchor','reference')` + bidirectional sync trigger + `ux_ticket_links_ticket_anchor` |
| `2026-07-16c_ticket_links_drop_legacy_unique.sql` | **drops the legacy unique — this is what turned the feature on**; drops the non-org-led `idx_ticket_links_entity` |

Ordering was load-bearing. `c` could only be written *after* the replacement code
was live: the old code upserted `ON CONFLICT (org, zendesk_ticket_id)`, and
dropping that constraint under it raises *"no unique or exclusion constraint
matching the ON CONFLICT specification"* on **every** link — a total outage, not a
degraded path. `db:migrate` applies every pending file, so merely creating the file
early would have armed it.

`b` is expand/contract *because* a hard column swap has a broken window in **both**
orderings. Its sync trigger means either column's writer produces a correct row, so
migration and deploy stop being ordered relative to each other at all.

### Code

- **Writers** (`zendesk-links.ts`, `voicemail-mutations.ts`): demote-then-upsert-on-
  natural-key, mirroring `linkShipment`. A single `ON CONFLICT` can only name one of
  the two unique indexes; re-anchoring onto an entity already held as a reference
  conflicts on the natural key, which a primary-inferred `ON CONFLICT` sails past
  into an unhandled error.
- **Readers**: `AND is_primary` on the *ticket→entity* reads (`getTicketEntity`,
  `resolveSupportTicketToReceiving`, the candidates map) — a bare `LIMIT 1` would
  return an arbitrary reference row. *entity→ticket* reads were **always**
  many-to-one and are unaffected; they gained `is_primary DESC` ordering so an
  anchor outranks a passing reference. `promoteShipmentTicketToReceiving` gained
  `AND is_primary` so a ticket that merely references an STN is never yanked onto a
  carton.
- **Domain**: `addTicketShipmentReference` / `removeTicketShipmentReference` /
  `listTicketShipmentReferences`. Primary-vs-reference is decided **in SQL** so a
  race trips the unique index instead of silently creating a second anchor.
  Removing an anchor **promotes the oldest survivor** — without it a ticket would
  hold rows but no anchor and read as *unlinked* to every reader, and the partial
  index permits zero anchors so nothing would catch it.
- **Route**: extended the existing waist (not a sibling). `POST {reference}`,
  `DELETE ?reference=1`, `GET ?list=shipments`, `GET ?mode=reference`. Added
  `recordAudit` — **this waist had never had any**, a straight violation of the
  house route skeleton.
- **Events**: `recordOpsEvent` `TICKET_LINKED`/`TICKET_UNLINKED` from the waist.
  `ops_events` (operator spine) — **not** `audit_logs`, which `resolveBrowseSources`
  drops for anyone without `admin.view_logs`, making it invisible to the very people
  doing the linking. No migration: `entity_type` already permits `'shipment'`.
- **Timeline**: shipment link moments now come from `ops_events`, making
  `ticketLinkEventsToTimeline`'s **`'unlinked'` branch reachable for the first
  time** — row state can't express a detach. Receiving stayed on row state (107
  rows of history to preserve); shipment had zero, so it lost nothing by moving.
- **Threads**: extracted the `ticket_links` lookup the RECEIVING branch had; the
  ORDER branch now uses it too (outbound threads showed no linked ticket at all).
  Queries **both** anchor conventions — see debt #3.
- **UI**: `StnTicketLinkModal` (outbound, per-STN, composed into
  `TrackingNumberRow`'s existing `headerAccessory`); `LinkageStrip`'s `!tracking`
  gate removed **and** its POST switched `anchor`→`reference` — ungating alone would
  have moved the wall from "control hidden" to "409 on click".
- **DS promotion**: `TicketPicker` + `useTicketSearch` to `@/components/support/link`;
  receiving composes them. `LinkCandidate` is now an alias of `TicketCandidate`
  (structurally identical — which is what had forced an unsafe cast).

## Verified

- **Many-STN works**: two STNs on one ticket, trigger deriving `is_primary` from
  `link_role`, second anchor rejected by `ux_ticket_links_ticket_primary`. Proven
  against the real schema, rolled back — no synthetic rows persisted.
- **`npm run verify`**: all 8 gates green. No baselines raised, no `ds-*` escapes.
- **E2E** (`stn-ticket-link-api.spec.ts`, 3/3): `?list=shipments` 200; reference
  mode `hiddenLinked: 0` and ≥ anchor mode's tickets; malformed body 4xx not 500.
- **E2E** (`unbox-stn-ticket-context.spec.ts`, 2 pass / 1 skip): a ticket linked
  **only** to the STN resolves on the carton with **no RECEIVING link** — proving
  `promoteShipmentTicketToReceiving` is belt-and-braces, not a precondition. The
  negative control (a carton that never adopted the STN must not inherit its
  ticket) passes — that's the one that matters, since `carton.shipment_id` is the
  join key for every reader.

**Not verified: any UI actually renders.** Both UI specs are red/skipped on
*selectors and fixtures*, not code. The outbound queue lives in `complementary`
(not `main`) and `?mode=labels` is genuinely empty; the unbox rail row needs a
carton scanned open (`UNBOX_SCAN_OPENED`), which I declined to fake.

## Follow-ups, ranked

1. **Prove the UI.** Neither the outbound "Link ticket" button nor the unbox rail
   flag has been *seen*. Needs: an outbound mode with rows carrying tracking, and a
   real scan-open at `/unbox`.
2. **Re-key on `support_ticket_id`.** `zendesk_ticket_id` is an explicitly
   *transitional* provider-native column — and it's the key. Live consequence:
   **internal tickets cannot be linked at all** (`escalate`'s internal mode skips
   `ticket_links` because `zendesk_ticket_id` is `NOT NULL`). The FK to
   `support_tickets` already exists; it just isn't the key. Converts half the
   polymorphic problem into an ordinary relational one. *(Ask first — waist.)*
3. **Converge the `escalate` passthrough.** It pipes `thread.entityType` straight
   into `entity_type`, coupling the vocabulary to `SURFACE_ENTITY_TYPES`. Root cause
   of #4, and it fights any exclusive-arc future. Note: converging onto SHIPMENT
   naively breaks escalation for orders with no STN (`resolveOrderPrimaryShipment`
   404s) — `ORDER` is a legitimate anchor when there's no shipment to point at.
4. **`entity_type` named CHECK.** Still free text. Eleven live writer values
   including a lowercase `'voicemail'` outlier. Unsafe until #3.
5. **Parent-delete triggers: 1 of ~10.** Only `SHIPMENT` wired.
   `RECEIVING`/`RECEIVING_LINE` (111 live rows) still orphan on carton delete.
6. **`link_role` contract phase.** Migration applied; code still writes
   `is_primary` (the trigger keeps both correct). Switch the ~8 call sites, then a
   contract migration drops `is_primary` + the trigger + `ux_ticket_links_ticket_primary`,
   and registers `('ticket_links','is_primary')` in `schema-drift-manifest.json`.
7. **`Deps`-inject `ticket-link.ts`.** Module-level `tenantQuery` import means the
   reference helpers aren't DB-free testable.

## Known asymmetries (deliberate, documented)

- **References surface as the carton's claim ticket.** The lateral joins and
  `ticketFromShipmentLink` order by `is_primary DESC` but **don't filter** on it, so
  a ticket that merely references an STN still shows in the rail/history — while
  `promoteShipmentTicketToReceiving` (which *does* filter) would never promote it.
  Defensible (it does concern that shipment, and the anchor sorts first), but real.
- **`recordTestVerdict`'s serial auto-link is now reachable.** It used
  `ON CONFLICT DO NOTHING` against a ticket that always already had a row, so it has
  **never inserted** since it shipped. With the unique gone it writes `reference`
  rows (correct: anchor stays the line). Behind `CF_TESTING_AUTO_LINK_TICKET`,
  default false — untested behavior that just became live.
- **A RECEIVING-anchored link burns an embed.** `ticket-link.ts` writes
  `receiving_carton.zendesk_ticket`, which the search outbox trigger watches, but
  `buildReceivingDoc` never puts it in `searchText` — identical doc recomputed, full
  re-embed paid, carton still not findable by ticket number. Pre-existing.

## Reference

- Industry: polymorphic association is a recognized antipattern (SQL Antipatterns
  Ch.7) — `entity_type`/`entity_id` has no referential integrity. Alternatives:
  exclusive arc (real FKs, schema change per type), junction-per-type, supertype.
  Jira's `issuelink` is clean because it's **homogeneous** (both sides FK
  `jiraissue`) and pushes heterogeneous links to a separate FK-less `remotelink`.
  Salesforce `WhatId`/`WhoId` runs the same pattern at scale, compensating with
  triggers — which is exactly what `polymorphic-tables.md` already prescribes.
  `link_role` over a boolean follows `photo_entity_links.link_role` (the house's own
  second-axis precedent) and Jira's `issuelinktype`.
- Code: `src/lib/support/ticket-link.ts`, `src/lib/zendesk-links.ts`,
  `src/lib/zendesk-link-candidates.ts`, `src/components/support/link/`,
  `src/app/api/support/tickets/link/route.ts`.
- Tests: `tests/e2e/stn-ticket-link-api.spec.ts`,
  `tests/e2e/unbox-stn-ticket-context.spec.ts`, `tests/e2e/stn-ticket-link.spec.ts`.
