# Research briefing — front-desk intake: adding **Sales** to the kiosk, and joining a sale + a repair + a prior order + a ticket into one counter transaction

> **✅ ANSWERED 2026-07-29 — the SoT is now [`kiosk-counter-transaction-PLAN.md`](./kiosk-counter-transaction-PLAN.md).**
> This file is kept as the **question** (the verified current-state map + the decision points). Build from the plan,
> not from here — and read the plan's §0 first: the research run marked two claims "High (Verified)" that are
> **wrong**, and this briefing's own `[verify]` markers are what caught them.

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Every path below is a pointer, not an excerpt. Open the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-29
**Scope:** the **customer-facing intake form** at `/kiosk`, its connection to **Ecwid** (catalog / prior orders) and **Square** (catalog / payment / terminal), and the **join model** that lets one counter visit produce a sales order *and* a repair service ticket that reference each other, a prior order, and a helpdesk ticket.

**Out of scope:** back-of-house receiving/unbox, the outbound shipping queue, the `/walk-in` Sales *history* Monitor (it stays a read surface — see `docs/todo/foh-boh-surface-split/03-sales-main-history.md`), and the order-ingest/sync path (covered by `order-ingest-simplification-GEMINI-RESEARCH-BRIEFING.md`).

---

## Deliverable — four separate answers

1. **Industry answer.** What is the 2026 standard for a **counter / front-desk intake terminal** that can, in one customer interaction, take (a) a retail sale, (b) a service intake with a signed agreement, and (c) a reference to a prior purchase and an existing support ticket? Named systems, cited primary sources, 2024–2026. Cover the four sub-problems explicitly:
   - **Transaction composition** — is "a sale" and "a repair" one order with mixed line types, or two records with a link? What do POS/service platforms actually do?
   - **Catalog boundary** — does the terminal read the live commerce API, or a local projection? Who owns *price*?
   - **Identity resolution** — how does a counter terminal match a walk-up human to an existing customer record without becoming a PII fishing surface, on a device with no signed-in staff?
   - **Ticket coupling** — when a service intake creates a helpdesk ticket, what is the standard relationship between order ↔ service record ↔ ticket, and who is authoritative for status?
2. **Codebase answer.** Reconcile the industry answer against §4–§9 below. Produce the **target shape for this repo** and a phased path to it. Name what gets deleted or unified, not only what gets added.
3. **The composition decision.** Ship the counter transaction as **one order with mixed line types** or **two linked records**? Answer with the schema, the failure modes, and what happens when the customer pays for the sale but declines the repair (or vice versa). §6 and §9.1 are the constraints.
4. **The catalog decision.** The kiosk repair catalog currently pages the **live Ecwid REST API** on every cold cache because *no price column exists anywhere in Postgres for these SKUs* (§5.3 — verify this claim yourself). Should a sales catalog repeat that, read Square's catalog like `/api/walk-in/catalog` does, or should this repo finally land a **local priced product projection**? If the last, specify the table, the writer, the staleness contract, and what happens when it is stale at the counter.

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

- **Every file path you name must be one you opened.** If you are inferring a path from a naming convention, mark it `[UNVERIFIED]`.
- **Every claim about what a module does must come from reading it.** `/api/kiosk/intake` is not what its name suggests (§4.2).
- **Quote your evidence** for load-bearing claims: a line number, a function signature, a schema column, a CHECK constraint.
- **Do not attribute a rationale to this brief that is not written in it.** If you supply your own reasoning, say "my reasoning:".
- Several statements below are marked **[verify]**. They come from in-repo comments that may have drifted from the live schema. Confirm each against the actual migration set before building on it.

### 0.2 Search the web for the industry half. Also not optional.

- Cite **named systems** and primary docs: Square (Orders / Catalog / Terminal / Payment Links APIs), Toast, Clover, Lightspeed, Shopify POS, Ecwid/Lightspeed eCom REST, plus service/repair-specific platforms (RepairShopr/Syncro, RepairDesk, mHelpDesk, Jobber, ServiceTitan) and helpdesk linkage models (Zendesk, Intercom, Freshdesk).
- Prefer **2024–2026** sources. Where practice changed since ~2022, say what changed and why.
- Where the industry genuinely splits — *mixed-line-type order* vs *sale + linked work order* is exactly such a split — present **both** positions, the conditions each wins under, then pick one for this repo and defend it.
- Distinguish "what a large multi-location retailer does" from "what a small reseller/repair shop SaaS should do." This repo is the latter.

### 0.3 Read these house rules first — they constrain every recommendation

| Rule | Why it binds this work |
|---|---|
| `AGENTS.md` → Product + Hard laws | Vendor names are connectors, never product copy |
| `.claude/rules/source-of-truth.md` → Integrations | Capability facades; tokens live only in `organization_integrations` |
| `.claude/rules/backend-patterns.md` | Route skeleton, `Deps` injection, audit, tenant GUC, idempotency |
| `.claude/rules/polymorphic-tables.md` | Any new link table must match this contract exactly |
| `.claude/rules/contextual-display.md` + `display/station.md` | The kiosk is **not** a Station — no scanner. See §7.1 |
| `.claude/rules/verify.md` | `npm run verify` is the gate; baselines only shrink |

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS. USAV is the dogfood tenant: a used-audio reseller that also runs a **Bose repair service**. The front desk sees walk-up customers who want to (in any combination) **buy a product**, **drop off a device for repair**, or **collect a finished order**.

Two hard laws govern everything below:

- **Vendor integrations are tenant connectors behind capability facades.** Operator- and customer-facing copy uses a capability noun ("Save to inventory", "Take payment") or the runtime provider label — never a hardcoded "Square/Ecwid/Zendesk" sentence. The Integrations hub and deep links are the only exception.
- **Tenant-from-birth.** Every new table carries `organization_id UUID NOT NULL` (no DEFAULT), org-led indexes, and `enforce_tenant_isolation()` in its birth migration.

---

## 2. The counter reality this brief is about

A customer walks up holding a Bose speaker. In one interaction the team member needs to:

1. Look up **what the customer bought before** (an Ecwid order — possibly the very unit in their hands).
2. Take in the device for **repair**: pick the repair service, capture the issue, serial, price, and a **signed agreement**.
3. Sell them **a replacement part or a second unit** at the same time.
4. Attach all of it to the **existing support ticket** the customer already opened by email — and **reply on that ticket** so the customer's thread reflects the counter visit, instead of spawning an orphan second ticket.
5. Take **one payment** covering both the repair deposit and the retail items.

**Today the repo can do exactly one of those five, and only in isolation.** The kiosk ships Repair intake only; Sales and Pickup are `status: 'wip'` tiles. The Sales cart exists but is staff-session-only and lives on a different surface. Nothing joins a sale to a repair, and nothing at intake time joins either to a prior order or a ticket.

---

## 3. What already exists — the honest inventory

Build the authoritative list yourself. This is what we know is real.

### 3.1 The kiosk surface

| Concern | File | State |
|---|---|---|
| Page | `src/app/kiosk/page.tsx` (324 lines) | Chromeless, public path, square-stage tile floor |
| Service SoT | same file, `SERVICES` array | `repair: 'live'` · `sales: 'wip'` · `pickup: 'wip'` — *"bringing one online is a one-line `status: 'live'` flip"* |
| Device gate | `src/lib/auth/withKioskAuth.ts` | Resolves `cf_kiosk` httpOnly token → `{ organizationId, principal:'kiosk', deviceId, deviceLabel }`. **Never** a `staffId`. `Deps`-injectable. |
| Device model | `src/lib/auth/kiosk-device.ts`, `src/lib/tenancy/kiosk-host.ts`, migration `2026-07-17_kiosk_devices.sql` | Enroll → pair → revoke. **[verify]** whether the migration is applied to the live DB. |
| PIN step-up | `resolveKioskStepUp` in `kiosk-device.ts`, used by `/api/kiosk/intake` | Privileged action resolves a real `staffId`; the device stays the `via` in the audit row |
| Device-authed routes | `src/app/api/kiosk/**` | `enroll`, `pair`, `revoke`, `devices`, `dev-autopair`, `intake`, `repair/{submit,favorites,ecwid-products,ecwid-categories}` |

**The auth model is done and is the strong part of this system.** Doc `docs/todo/foh-boh-surface-split/06-walk-in-kiosk-auth.md` argues it from first principles (device principal + anonymous customer session + staff PIN step-up, referencing RFC 8628 device grant and MDM single-app lock) and the code matches the doc. Do not redesign it. **Do** answer whether it extends cleanly to a *chargeable* sales flow — see §9.4.

### 3.2 Repair intake — the one live form

- `src/components/repair/RepairIntakeForm.tsx` (863 lines) — 4 steps: **product → issue → contact → review+sign**. A `kioskMode` prop hides staff-only affordances (technician assignment, existing-customer PII search, the ticket deep link, print) and repoints the catalog at the device-authed twins.
- `src/lib/repair/submit-repair-intake.ts` (290 lines) — **the single create path**, shared byte-for-byte between the staff route (`/api/repair/submit`, `withAuth` + `repair.intake`) and the kiosk route (`/api/kiosk/repair/submit`, `withKioskAuth`). Principal-agnostic, org-scoped. **This extraction is the model the sales flow should copy.**
- What one submit writes, in order: `customers` (find-or-create) → `repair_service` → `linkCustomerToRepair` → signature PNG to Vercel Blob + `documents` row (`entity_type='REPAIR'`, `document_type='intake_agreement'`) → Zendesk ticket → `work_assignments` → cache invalidation + realtime publish.
- Required fields (`repair-intake-logic.ts` + the server twin): name, phone, product title, issue-or-notes, **serial**, **price**. Email optional. Signature gated on the review step.

### 3.3 Sales — exists, but on the wrong side of the counter

`src/components/walk-in/**` (~2,100 lines) already implements a working counter sale:

- `salesCartStore.ts` — module-scoped singleton cart (`useSyncExternalStore`), lines carry a Square `catalog_object_id` **or** are ad-hoc manual lines with `base_price_money`.
- `SalesEditPanel` / `SalesCartSidebar` / `SquareProductSearchPopover` — the pick-and-stage UI.
- `POST /api/walk-in/orders` → Square `/orders`; `POST /api/walk-in/terminal/checkout` → Square `/terminals/checkouts`; `square_transactions` is the local mirror, fed by `/api/walk-in/sync` and `POST /api/webhooks/square` (HMAC-verified, org resolved by merchant id).

**Every one of those routes is `withAuth(..., { permission: 'walk_in.view' | 'walk_in.intake', feature: 'walkIn' })`.** There is no device-authed twin of any of them. That is the central structural gap.

### 3.4 Prior-order lookup and ticket linkage — both exist, both are staff-only and post-hoc

- `GET /api/ecwid/order-search?q=` — live Ecwid order lookup, deliberately **unfiltered** by fulfillment state, exact order-number matches floated to the top. Consumed by `src/components/repair/details-panel/RepairOrderLinkSearch.tsx`.
- `RepairLinkageSection` — writes `repair_service.source_order_id` / `source_tracking_number` / `serial` / `source_sku`. **This runs in the staff details panel *after* intake, never during it.**
- `ticket_links` — the universal polymorphic ticket ↔ entity map: one `anchor` per ticket (`ux_ticket_links_ticket_primary`), many `reference` rows. `POST /api/support/tickets/link`.
- `POST /api/zendesk/tickets/[id]/comments` — the reply path, behind the helpdesk capability facade (`getHelpdeskProvider`).

---

## 4. Structural findings — verify each, then build on them

### 4.1 The repair intake creates a ticket but never *joins* one

`submitRepairIntake` calls `createZendeskTicket(...)` and, on success, stamps the number into `repair_service.ticket_number`. It writes **no `ticket_links` row** and **no `support_tickets` row** — so the repair is invisible to the universal ticket waist that every other entity in the app uses. There is also no path at intake to attach an **existing** ticket.

Compounding it: the Zendesk call is wrapped in `try/catch` that logs and continues (`submit-repair-intake.ts`, "Step 4"). A helpdesk outage produces a repair row with `ticket_number = NULL` and **no retry, no outbox, no reconciliation surface**. That is a defensible availability trade at a counter — the customer must not be blocked — but the compensating mechanism does not exist.

**Question:** what is the 2026 standard for this? Transactional outbox? A `ticket_state` column with a sweeper? Something else? Which fits a repo that already has `entity_search_outbox` + a cron worker as precedent (`src/lib/search/search-outbox-worker.ts`)?

### 4.2 `/api/kiosk/intake` is an audit-only stub, and its own header says so

Read `src/app/api/kiosk/intake/route.ts`. It validates `{ service: 'sales'|'pickup'|'repair', note?, staffId?, pin? }`, resolves the optional PIN step-up, writes **one `recordAudit` row**, and returns `{ ok: true }`. Its header:

> *"SEAM (doc 03): the real intake persistence + Square/Zoho/Ecwid capability-facade calls replace the audit-only body below."*

So the device-principal + tenant-transaction + step-up **contract** is proven, and the persistence half is a declared, unbuilt seam. **Any sales proposal has to say whether it fills this seam or bypasses it** — and if it bypasses it, that route should be deleted, not left as a decoy.

### 4.3 The repair catalog and the sales catalog are **disjoint by construction**, from two different vendors

| | Repair catalog | Sales catalog |
|---|---|---|
| Source | **Ecwid** REST, live | **Square** `/catalog/search`, live |
| Module | `src/lib/repair/ecwid-repair-catalog.ts` | `src/app/api/walk-in/catalog/route.ts` |
| Scope rule | products under the repair root category | **`-RS` SKUs filtered OUT** (`isRepairSku`) |
| Kiosk narrowing | **`-RS` SKUs only** (`isRepairServiceSku`) | none — no kiosk twin exists |
| Credentials | **env vars, bypassing the vault** — the module header admits this | `squareFetchForOrg(orgId)` → Nango token, env fallback |

Two vendors, two auth models, two cache strategies, and a filter on each side that is the exact complement of the other. There is also a one-way `POST /api/ecwid-square/sync` (`src/lib/ecwid-square/sync.ts`) pushing Ecwid → Square catalog, which means the *same* product may be reachable by two different ids depending on which form you are standing in.

**This is the single most important thing for you to rule on.** A unified intake form has to present one product picker. Which catalog wins, and what happens to the other?

### 4.4 There is no price in the database

From the header of `ecwid-repair-catalog.ts` (**[verify] against the live schema**):

> *"the repair-service catalog has no local price mirror: `sku_platform_ids` carries the 47 `-RS` rows with title + thumbnail + Ecwid item id, but there is no price column anywhere in Postgres (`sku_catalog`, `sku_platform_ids`, `platform_listings`, `items` all lack it for these SKUs)."*

Reading `sku_catalog` in `src/lib/drizzle/schema.ts` supports it: the only money columns are `last_known_cost_cents` (acquisition cost) and `replenish_target_cents` (a reorder trigger). Neither is a sell price. `platform_listings.listing_price_cents` exists but that table is **declared forward-prep scaffolding with 0 rows and 0 writers** — read its schema comment.

Consequences that are live today:
- A cold repair-catalog cache costs a full Ecwid category walk. The module fights this with a two-tier L1 `Map` + Redis cache and bounded-concurrency category fetches, with a comment explaining that the naive version took ~16s.
- The kiosk repair form seeds **`price: '130'`** as a hardcoded default (`buildInitialFormData` in `repair-intake-logic.ts`) and lets the team member overtype it.
- The counter cannot compute an order total offline, or at all, without a live vendor round trip.

### 4.5 `square_transactions` is not tenant-safe yet

`src/lib/neon/square-transaction-queries.ts` opens with a long note; the Phase-B migration `2026-06-14_org_id_phase_b_needs_col.sql` is blunter (**[verify] whether the follow-ups have since landed**):

> *"square_transactions: … NULLABLE ON PURPOSE … the FOLLOW-UP before FORCE (Phase E): (1) thread org through the session-less writers, (2) `ALTER COLUMN organization_id SET NOT NULL`, (3) add the explicit predicate + stamp in the query module, (4) … swap the global `ON CONFLICT (square_order_id)` → `(organization_id, square_order_id)`."*

So the sales mirror has a nullable org column, a **globally unique** `square_order_id`, an unthreaded webhook writer, and inert RLS. It is latent while USAV is the only tenant and becomes a cross-tenant leak at tenant #2. **A kiosk sales flow that writes here inherits all of that.** Say explicitly whether your target shape writes to this table, replaces it, or gates on the Phase-E follow-ups landing first.

Related inconsistency worth checking: `/api/walk-in/terminal/checkout` calls `getSquareConfig()` (env-global) while its siblings call `resolveSquareConfig(ctx.organizationId)` / `squareFetchForOrg(orgId)`. If that is still true, the terminal charge is the one Square call that ignores the tenant's own connection.

### 4.6 Customer identity is three disconnected books

| Book | Key | Written by |
|---|---|---|
| `customers` (Postgres, Zoho-shaped) | `id` | `findOrCreateRepairCustomer` at repair intake |
| Square customers | `square_customer_id` | `/api/walk-in/customers` |
| Ecwid order contacts | email on the order | never persisted locally |

`findOrCreateRepairCustomer` matches **phone, then name, then creates**. A bare name match is a real merge hazard (two "John Smith"s become one customer). `square_transactions` stores `square_customer_id` plus denormalized name/email/phone and **does not join `customers.id`**. Selecting a prior Ecwid order gives you an email that matches nothing.

For a form whose whole job is "this human, buying and repairing, referencing what they bought before," this is the weakest link in the chain. What is the 2026 standard identity-resolution model for a counter terminal — deterministic keys, a probabilistic merge with a review queue, or an explicit staff-confirmed merge step? And how does it work on a **device principal** where surfacing a searchable customer list is itself a PII exposure (note that `kioskMode` deliberately hides customer search today)?

### 4.7 `ticket_links` anchor types do not include repair or sale

`TicketLinkAnchorInput` in `src/lib/support/ticket-link.ts` is:

```ts
| { type: 'receiving'; receivingId: number; lineId?: number | null }
| { type: 'tracking'; trackingNumber: string }
| { type: 'shipment'; shipmentId: number }
| { type: 'order'; orderId: number }
```

Meanwhile `ticket_links.entity_type` is **deliberately unconstrained free text** (see its schema comment) and the comment lists `'REPAIR'` among eleven live values. So a repair-anchored ticket link is representable in the table but **not reachable through the typed API**. Extending the anchor union is a small change; the interesting question is whether a *counter transaction* should be its own anchor type, or whether the sale and the repair each anchor separately and reference each other.

---

## 5. The join model — the core design question

The user-facing requirement, restated precisely:

> One counter transaction can contain **retail line items** and **service line items**. It may reference **a prior order** and **an existing support ticket**. Submitting it must create/attach the right records, **update the ticket**, and **post a reply** to it.

That is four joins:

| Join | Today | Needed |
|---|---|---|
| Sale ↔ Repair | ✗ nothing | one transaction, two outcomes |
| Transaction ↔ prior order | staff-only, post-hoc (`RepairLinkageSection`) | selectable **at intake**, on the kiosk |
| Transaction ↔ ticket | ✗ (intake *creates* a ticket, never attaches one) | attach existing **or** create new |
| Ticket ← reply | exists (`POST /api/zendesk/tickets/[id]/comments`), unused by intake | posted as part of submit |

**Answer deliverable 3 here.** The two candidate shapes:

**(A) One order, mixed line types.** A single header record with `line_type ∈ {retail, service}`; the service line spawns a `repair_service` row. One payment, one receipt, one ticket anchor. Closer to how POS platforms model service items.

**(B) Two records, linked.** A sales order and a repair service record, joined by a `counter_transaction` (or via the existing polymorphic link machinery). Independent lifecycles: the repair takes 3–10 working days and has its own status machine; the sale is closed the moment it is paid.

Evidence for **(B)** already in the repo: `repair_service` has its own status machine, its own SLA (`addBusinessDays(new Date(), 5)`), its own work assignment, its own signed document, and its own ticket. Forcing that into an order row will fight `.claude/rules/backend-patterns.md`'s "status changes only via `transition()`". Evidence for **(A)**: one payment, one receipt, one thing the customer signs.

Whichever you pick, specify:
- The **schema**, matching `.claude/rules/polymorphic-tables.md` if a link table is involved (named CHECK discriminator, `entity_type`/`entity_id` naming, BIGINT ids, org-led indexes, parent-delete integrity via FK **or** a `TG_ARGV[0]` trigger family, `enforce_tenant_isolation()` in the birth migration, Drizzle model in the same PR).
- **Partial-failure semantics.** The customer buys the item, declines the repair. The payment succeeds but the repair insert fails. Zendesk is down. Which of these leaves a legal-quality signed agreement pointing at nothing?
- **Idempotency.** The kiosk already mints a `safeRandomUUID()` per submission and re-sends it on retry (`src/app/kiosk/page.tsx`), and `inventory_events` carries `UNIQUE(client_event_id)` as house precedent. A transaction that charges money needs this to hold across *all* of its sub-writes, not just the Zendesk call.

---

## 6. Payment — the biggest unanswered question

**Repair intake takes no payment.** It records a `price` string and stops. Payment is a separate, later, staff-only action: `POST /api/repair/square-payment-link` (`repair.mark_repaired`) mints a Square hosted checkout link, resolving the `-RS` SKU to a Square `catalog_object_id` when it can and falling back to `quick_pay` with a raw amount when it cannot.

**Sales takes payment** through a completely different mechanism: create a Square order, then push it to a physical Terminal device.

So the two halves of the intended unified transaction have **two unrelated payment paths, and neither runs on the kiosk**. Address:

- Should the kiosk charge at all, or stage an order that a staff-side Terminal completes? (Note doc 06's blend: device principal for base intake, **staff PIN step-up for privileged actions** — is taking payment privileged?)
- A repair often takes a **deposit** or nothing up front, while retail is paid in full. Does one order support both, or does that alone force shape (B)?
- The house safety rule in this repo: **an agent must never enter payment credentials.** Everything must route to the vendor's own hosted checkout or a physical terminal. A design where the kiosk collects card data in-app is out of bounds regardless of what the industry does.
- **Price authority.** With no local price (§4.4), the total shown to a customer on the signature screen is either a live vendor read or a typed number. What is the standard? What is auditable?

---

## 7. Constraints — non-negotiable

### 7.1 The kiosk is a **form**, not a Station

`.claude/rules/contextual-display.md` Q1: scanner input ⇒ Station. **There is no scanner at the counter.** `docs/todo/foh-boh-surface-split-plan.md` records the owner's refinement verbatim: *"The counter is a form, not a scanner station."* Do not propose a scan bar, a focus-lock loop, or `StationWorkbench` chrome for `/kiosk`. Multi-step form motion follows `.claude/rules/display/auth-step-panel.md`, not the station crossfade.

### 7.2 Compose, don't fork

`.claude/rules/pattern-evolution.md`. Concretely, for this work:
- The sales flow must reuse `salesCartStore` / `SquareProductSearchPopover` or **explicitly justify** replacing them — a second cart implementation is a fork.
- The submit path must be a **principal-agnostic domain helper** callable from both a staff route and a device route, exactly like `submitRepairIntake`. A copy of the logic inside the kiosk route is the failure mode this rule exists to prevent.
- Ticket attachment goes through `src/lib/support/ticket-link.ts` and the helpdesk capability facade. Do not write `ticket_links` rows directly and do not import Zendesk modules into product code.
- The kiosk product picker composes `ProductSelector` (already parameterized by `apiBasePath` for exactly this reason) or grows it. A second picker is a fork.

### 7.3 Copy speaks capabilities

Customer-facing kiosk copy says "Take payment" / "Look up your order", never "Pay with Square" / "Search Ecwid" — unless resolved at runtime from the connected provider label (`capabilityNoun` / `connectedProviderLabel` in `src/lib/integrations/capability-labels.ts`).

### 7.4 A customer-facing device is a PII surface

The device principal is unattended-capable. Every field the kiosk can *read* is a field a stranger can read. `kioskMode` already suppresses customer search for this reason. Any "select a prior order" feature must state its disclosure model: what does the customer have to already know (order number? phone + last name?) before the terminal reveals anything?

---

## 8. Non-goals

- Redesigning the device-auth model (§3.1). It is built and correct.
- Turning `/walk-in` into an intake surface. It stays the transaction-history Monitor.
- The order-ingest/sync path.
- Adding a message bus, a new queue service, or a new state-machine framework. If you need durability, use what exists (`inventory_events` idempotency, the search outbox + cron worker) or justify the addition against what it deletes.
- Rewriting `repair_service` into `sales_orders`. It is a customer-owned-device domain with its own lifecycle; `unit_repairs` already exists separately for inventory units.

---

## 9. Specific questions to answer

1. **Composition** (deliverable 3) — one order with mixed line types, or two linked records? Schema + partial-failure table + idempotency contract.
2. **Catalog** (deliverable 4) — Ecwid, Square, or a local priced projection? If a projection: table, writer, refresh cadence, staleness contract, counter behavior when stale. Does `platform_listings` become the home, or is it the wrong shape?
3. **Identity** — the resolution model that turns a walk-up human into one customer record across `customers` / Square / Ecwid, on a device with no signed-in staff. Include the merge-review mechanism and the PII disclosure gate.
4. **Payment** — kiosk-initiated vs staff-completed; deposit vs full; step-up boundary. Must respect §6's hosted-checkout constraint.
5. **Ticket coupling** — extend the `TicketLinkAnchorInput` union with `repair`/`sale`, or introduce a transaction-level anchor? Who owns ticket status once a counter visit is attached? What does the auto-posted reply contain, and is it public or internal?
6. **Durability** — the compensating mechanism for a failed helpdesk call at intake (§4.1), reusing the outbox precedent if it fits.
7. **Route surface** — does `/api/kiosk/intake` (§4.2) become the real unified write path, or is it deleted in favor of per-service device routes mirroring `/api/kiosk/repair/submit`? Say which, and why.
8. **Tenancy gate** — does the sales write path depend on the `square_transactions` Phase-E follow-ups (§4.5)? If yes, that is a sequencing dependency your phase plan must show.
9. **Form IA** — with 4 repair steps today, what does the step sequence look like when sale + repair + prior-order + ticket all compose? Where does the signature sit when only part of the transaction requires an agreement? Cite `.claude/rules/display/auth-step-panel.md` for the motion contract and industry sources for the step model.

---

## 10. Output shape

For each deliverable:

- **Claims table** — claim · evidence (file:line, or cited URL) · confidence.
- **Target shape** — schema (DDL sketch), module boundaries, route list, capability facades used.
- **Phase plan** — ordered, each phase independently shippable and `npm run verify`-green, each naming what it **deletes or unifies**. Mark ask-first items (migrations, payment, tenancy, anything touching the status machine or the search waist) explicitly.
- **Risk register** — partial-failure modes, PII exposure, tenancy leaks, vendor-outage behavior.
- **Explicitly reject** at least one plausible-sounding option and say why.

---

## Appendix — file index (all verified present 2026-07-29)

**Kiosk**
`src/app/kiosk/page.tsx` · `src/lib/auth/withKioskAuth.ts` · `src/lib/auth/kiosk-device.ts` · `src/lib/auth/kiosk-context.ts` · `src/lib/tenancy/kiosk-host.ts` · `src/app/api/kiosk/{intake,pair,enroll,revoke,devices,dev-autopair}/route.ts` · `src/app/api/kiosk/repair/{submit,favorites,ecwid-products,ecwid-categories}/route.ts` · `src/lib/migrations/2026-07-17_kiosk_devices.sql` · `src/components/settings/sections/KioskDevicesSection.tsx`

**Repair intake**
`src/components/repair/RepairIntakeForm.tsx` · `repair-intake-logic.ts` · `ProductSelector.tsx` · `ReasonSelector.tsx` · `CustomerInfoForm.tsx` · `SignaturePad.tsx` · `RepairServiceForm.tsx` · `useRepairIntakeData.ts` · `useRepairCustomerSearch.ts` · `repair-favorite-intake.ts` · `src/lib/repair/submit-repair-intake.ts` · `src/lib/repair/repair-intake-receipt.ts` · `src/app/api/repair/submit/route.ts` · `src/components/sidebar/RepairSidebarPanel.tsx`

**Repair linkage / details**
`src/components/repair/details-panel/{RepairLinkageSection,RepairOrderLinkSearch,useRepairDetailsPanel}.tsx` · `src/lib/neon/repair-service-queries.ts`

**Ecwid**
`src/lib/repair/ecwid-repair-catalog.ts` · `src/app/api/repair/{ecwid-products,ecwid-categories}/route.ts` · `src/app/api/ecwid/{order-search,recent-repair-orders,products/search,transfer-orders}/route.ts` · `src/lib/ecwid-square/sync.ts` · `src/app/api/ecwid-square/sync/route.ts`

**Square / walk-in sales**
`src/app/api/walk-in/{catalog,categories,customers,orders,sales,status,sync}/route.ts` · `src/app/api/walk-in/terminal/{checkout,devices}/route.ts` · `src/app/api/walk-in/receipt/[id]/route.tsx` · `src/app/api/webhooks/square/route.ts` · `src/app/api/repair/square-payment-link/route.ts` · `src/lib/square/{client,server}.ts` · `src/lib/integrations/connectors/square.ts` · `src/lib/neon/square-transaction-queries.ts` · `src/components/walk-in/**`

**Tickets / helpdesk**
`src/lib/support/{ticket-link,tickets,create-ticket,create-ticket-linkages,context,suggest-reply}.ts` · `src/app/api/support/tickets/{route.ts,link/route.ts,by-entity/route.ts}` · `src/app/api/zendesk/tickets/[id]/{route.ts,comments/route.ts}` · `src/lib/integrations/helpdesk/**` · `src/lib/zendesk.ts`

**Customers**
`src/lib/neon/customer-queries.ts` · `src/app/api/repair/customers/route.ts`

**Schema / tenancy**
`src/lib/drizzle/schema.ts` (`customers`, `salesOrders`, `orders`, `repairService`, `documents`, `supportTickets`, `ticketLinks`, `skuCatalog`, `skuPlatformIds`, `platformListings`, `localPickupItems`) · `src/lib/migrations/2026-04-07_create_square_transactions.sql` · `2026-06-06c_square_transactions_soft_delete.sql` · `2026-06-14_org_id_phase_b_needs_col.sql` · `2026-06-14_org_id_needs_col_usav_default.sql` · `2026-06-22g_enforce_tenant_isolation_remaining_business.sql` · `2026-04-13_create_local_pickup_orders.sql`

**Integrations**
`src/lib/integrations/{credentials,capability-labels,capability-connections}.ts` · `src/lib/integrations/connectors/{types,registry,square,orders-transfer}.ts` · `src/app/settings/integrations/registry.ts`

**Plans / prior art**
`docs/todo/foh-boh-surface-split-plan.md` · `docs/todo/foh-boh-surface-split/{02-walk-in-station,03-sales-main-history,05-nav-permission-redirects,06-walk-in-kiosk-auth}.md` · `docs/todo/order-ingest-simplification-GEMINI-RESEARCH-BRIEFING.md`

**Permissions**
`src/lib/auth/permission-registry.ts` — `repair.{view,intake,mark_repaired,pickup_sign}` · `walk_in.{view,intake,enroll_kiosk}`. **There is no kiosk-scoped sales permission.**
