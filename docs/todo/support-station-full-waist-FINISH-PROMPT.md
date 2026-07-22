# Support Station full-waist — FINISH prompt (hand-off)

> Paste into a fresh agent. Self-contained. **All code phases (0,1,2b,3,4,6) are
> DONE, uncommitted, and `npm run verify` is GREEN.** What remains is (1) one
> HUMAN migration gate, (2) the commit, and (3) three optional follow-ups.
>
> Prior hand-off (full history + house rules): [`support-station-full-waist-EXECUTION-PROMPT.md`](support-station-full-waist-EXECUTION-PROMPT.md).
> Human gates: [`docs/partial/HUMAN-TODO.md`](../partial/HUMAN-TODO.md) §K.

---

## 0. Current state (verified — DO NOT redo)

`npm run verify` PASSES (lint, typecheck, unit + DS guards, knip, route-auth, schema drift).
Tenancy-isolation line is advisory/pre-existing, not from this work.

| Phase | Landed |
|---|---|
| **2b** | `ticket_links` shipment writers (`addTicketShipmentReference`, `linkTicketToShipment`) + `promoteShipmentTicketToReceiving` re-keyed onto support-led `ON CONFLICT (org, support_ticket_id, entity_type, entity_id)` + support-led anchor guards. `linkSupportTicketEntity` is the canonical anchor writer; `linkTicket` delegates to it. Injectable `Deps` seams. Tests: `src/lib/zendesk-links.test.ts` (3), `src/lib/support/ticket-link-rekey.test.ts` (5). |
| **3** | Operator PRIMARY `#` = internal registry id. `primaryTicketLabel`/`secondaryProviderLabel` in **client-safe** `src/lib/support/ticket-refs.ts` (tickets.ts is server-only). `SupportContextTicket.providerLabel` (via `providerCatalogLabel`). `SupportTicketIdentity` + `LinkageStrip` dual-`#`. `SupportTicketFocus` runtime "Open in \<provider\>". `formatSupportTicketDisplayLabel` KEPT provider-native (claims-parity contract + test). |
| **4** | Generic CREATE: `POST /api/support/tickets` (facade create + optional anchor link via `linkTicketToAnchor`; idempotent; audited `SUPPORT_TICKET_CREATE`/`SUPPORT_TICKET`). `src/lib/support/create-ticket.ts` (Deps, `create-ticket.test.ts` 4). `useSupportTicketClaimHost` + `SupportCreateTicketModal`. Wired into `SupportOrdersWorkspace` "Create ticket" → opens the new ticket (provider id → no URL-key change). |
| **6** | Vendor-neutral: `capabilityTitle/Noun('helpdesk')` sweep (SupportWorkspace, SupportTicketDetail, VoicemailDetail, SupportChatHeader). `GET /api/integrations/capability-label` + `useCapabilityProviderLabel`. Facade `ticketUrl()` already existed. |

**Untouched on purpose:** `ReceivingClaimModal` / `/api/receiving/zendesk-claim` (unboxing claim — already works; it links via the re-keyed `linkTicket`, so it's covered by the SAME deploy-order gate). Connector internals (`zendesk-links.ts`, `zendeskTicketId`, `['zendesk']` keys, `zendesk_ticket_id` column, `integrations.zendesk` perm id) — NOT mass-renamed, by design.

---

## 1. HUMAN gate — apply the migration (do this, or ask the user to)

`src/lib/migrations/2026-07-21_ticket_links_rekey_support_ticket_id.sql` — apply via `/db-migrate`
(dry-run confirms it is the ONLY pending file).

**⚠ Deploy order is the whole risk:** the migration is additive + permissive + transactional and keeps
BOTH index families, so it does NOT break currently-running prod. But the NEW code names
`ux_ticket_links_support_entity` in `ON CONFLICT`, so **apply the migration BEFORE this code deploys** or
ALL ticket linking (including the unboxing claim) breaks. Order: migrate → verify → deploy.

After applying, run the header's VERIFY queries (expect 0 rows each):
```sql
SELECT count(*) FROM ticket_links WHERE support_ticket_id IS NULL;                 -- 0
SELECT organization_id, support_ticket_id FROM ticket_links
 WHERE link_role='anchor' GROUP BY 1,2 HAVING count(*) > 1;                          -- 0 rows
```

---

## 2. Remaining follow-ups (optional; each is independent)

### A. Sidebar "New ticket" CTA (was blocked by an active queue refactor)
The tickets sidebar was mid-refactor when Phase 4 landed (`SupportTicketsRecentRail` replaced
`SupportTicketQueue`), so the CTA was deferred to avoid colliding. The host is ready:
- Add a "New ticket" action to the tickets rail → `const claim = useSupportTicketClaimHost(); claim.openCreate()`
  (no anchor = blank create).
- Mount `<SupportCreateTicketModal open={claim.createOpen} onClose={claim.closeCreate}
  submitting={claim.createTicket.isPending} onCreate={({subject,note}) => claim.createTicket.mutate({subject,note},
  { onSuccess: (d) => router.push(`/support?mode=tickets&ticket=${d.providerTicketId}`) })} />`.
- Gate the button on `has('integrations.zendesk')`.

### B. Internal-ticket create + `?ticket=` support-id flip (the deferred URL-key work)
Today CREATE always yields a PROVIDER ticket so `?ticket=<providerTicketId>` opens with no focus change.
To support INTERNAL tickets (no provider) end-to-end:
- `SupportTicketFocus`: drive the conversation off `contextBundle.ticket.providerTicketId` (not the raw
  `?ticket=` value) — `context.ts` already resolves a support-id OR a zendesk-id, so the bundle is authoritative.
- When `providerTicketId` is null (internal), the Ticket tab should show the thread/notes, not a Zendesk
  conversation fetch. Then `POST /api/support/tickets` can accept `{ provider: 'internal' }` and navigate
  `?ticket=<supportTicketId>`.

### C. Deferred reader re-keys + CONTRACT migration (later, deploy-gated)
- Re-key `getTicketEntity` / `listTicketShipmentReferences` / `removeTicketShipmentReference` onto
  `support_ticket_id` WHEN their callers carry a support id (they pass a zendesk id today; correct meanwhile).
- Only AFTER the support-led writers are DEPLOYED, author a CONTRACT migration that drops the zendesk-led
  uniques (`ux_ticket_links_ticket_entity`/`_ticket_primary`/`_ticket_anchor`) + the `is_primary` sync trigger,
  and add `('ticket_links','is_primary')` to `scripts/schema-drift-manifest.json`. Dropping an `ON CONFLICT`
  target of still-running code is a total link outage (see `2026-07-16c`'s header) — never before deploy.
- Still-open pre-existing gap: RECEIVING / RECEIVING_LINE parent-delete triggers for `ticket_links`
  (needs the parent-table audit `receiving` vs `receiving_carton`, `receiving_line` vs `receiving_lines`).

### D. (Optional) Migrate Unbox/Testing onto the shared host
`ReceivingClaimModal` already covers unboxing create — this is pure consolidation, not a fix. Only do it if
you're unifying the create surfaces; keep `/api/receiving/zendesk-claim`'s receiving-specific wizard behavior.

---

## 3. House rules (unchanged)

Compose/grow the SoT; never fork. Stay on the branch; never `git stash`; **user owns commits**. Migrations
hand-written + expand/contract; never `db:push`. `orgId` from `ctx`; `recordAudit` + `clientEventId`. DS
ratchets: migrate to the primitive, never raise a baseline. Unit tests DB-free via `Deps` + the server-only
shim: `node --require ./scripts/register-server-only-shim.cjs --import tsx --test <file>`. Before done:
`npm run verify` green; append `pnpm worklog`. If blocked, stop and ask.
