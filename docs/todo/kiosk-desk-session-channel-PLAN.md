# Kiosk desk↔iPad session channel — one global cart, full CRUD from either side

**Status:** draft plan, nothing built · **Created:** 2026-08-19
**Answers:** [`highest-roi-ops-ui-execution-plan.md`](./highest-roi-ops-ui-execution-plan.md) §7 open question 2 ("Kiosk network: same iPad switching apps vs two devices? Dual-device needs session channel") and PR-12's one-line "session channel" deliverable.
**Parent SoT for the transaction model:** [`kiosk-counter-transaction-PLAN.md`](./kiosk-counter-transaction-PLAN.md) — D1 (two linked records), D7 (deterministic identity only).
**Sibling precedents to compose, not fork:** [`station-realtime-capture-visibility-INDEX.md`](./station-realtime-capture-visibility-INDEX.md) (desk↔phone pairing + ACK grammar) · [`docs/integrations/realtime-ai.md`](../integrations/realtime-ai.md) (Ably channel taxonomy + org token scoping) · [`kiosk-ipad-native-shell-GEMINI-RESEARCH-BRIEFING.md`](./kiosk-ipad-native-shell-GEMINI-RESEARCH-BRIEFING.md) (the landscape shell this session renders inside).

---

## 0. What this builds, in one paragraph

Today `/kiosk/v2` holds its cart in a **module-scoped singleton in one browser tab** —
[`src/lib/kiosk/kiosk-session-store.ts`](../../src/lib/kiosk/kiosk-session-store.ts). `KioskCustomerFace` is a
*view* over that same in-memory snapshot, which is why the "customer display" only works when it is the same
device flipping faces. This plan promotes that store to a **server-authoritative counter session** with a
device-scoped realtime channel, so a staff desktop and a paired iPad hold **one cart**: either side can create,
read, update, or delete any line, and both repaint within a frame of each other. The store's public API does not
change — its *transport* does. Nothing forks a second cart (`salesCartStore.ts` was already deleted for being
exactly that mistake).

**The shape:** desktop = full CRUD + operational data. iPad = customer-facing session display + the inputs only
the customer can give (signature, phone, tap-to-confirm). Either device can be the one driving; the *lease*
decides who is authoritative for conflicting writes, not the device type.

---

## 1. Locked decisions

| # | Decision | Why |
|---|---|---|
| **D1** | **The server is the cart's source of truth. Ably carries change *notifications*, never the only copy of a line.** Every mutation is a REST write that returns the new session version; the publisher then fans the same event out on the channel. | A cart that lives only in two browsers loses money when a tab crashes. House law already says Ably is ephemeral plumbing (`device-handshake.ts` D3) — this is the same rule applied to state that must survive. |
| **D2** | **One channel family: `org:{orgId}:kiosk:{deviceId}`.** Both sides may `subscribe` + `publish`, exactly like the per-staff bridges. No cross-device wildcard. | Mirrors `getPhoneBridgeChannelName` (`channels.ts:141`). The device id is the pairing gate that already exists (`kiosk_devices`), so the bind needs no new secret. |
| **D3** | **Monotonic integer `version` per session, not a CRDT.** A mutation carries `expectedVersion`; a mismatch returns **409 + the current snapshot**, and the client re-renders from that. | A counter cart is a short-lived list of 1–8 lines with one human on each end — last-writer-wins with a visible refetch is honest and debuggable. Yjs exists in this repo (`forge:master-plan`) and is the wrong tool here: no offline branch merge, no prose. |
| **D4** | **The 1:1 bind is a lease, not a config.** A staff desktop *claims* a paired kiosk device (`claimed_by_staff_id` + `claim_expires_at`, heartbeat-renewed). A second desktop claiming the same device sees an explicit **takeover** prompt naming the current holder. | "One on one" has to survive two managers opening the same counter. Silent multi-claim is how POS systems double-charge. |
| **D5** | ~~The iPad never edits the cart~~ — **REVISED 2026-08-20: the counter is a form TWO PEOPLE fill at once.** The customer enters their own details and device symptoms on the tablet while staff price and correct on the desktop; a read-only tablet turns that into dictation. The boundary moved from WHO to WHAT: the tablet may create and correct lines and identity, but **never money or finality** — price override · discount · void · claim/release · park · submit are staff-only, and the money ones carry a PIN step-up. That is the line worth defending, because the device principal outlives the customer standing there: editing a serial costs a correction, zeroing a price is an open till. A tablet-staged line is always created at **zero**, priced from the desk. | *(superseded text below)* |
| ~~D5 (original)~~ | ~~**The iPad never edits the cart. Display + signature + confirm, and nothing else.**~~ Its entire write surface is three verbs: set customer identity, sign a repair agreement, confirm the visit. **Every line write — add, quantity, price, discount, void — is desk-only**, and the money-moving ones additionally pass the existing PIN step-up (`/api/kiosk/staff-for-stepup`, `KioskPaymentStepUpSheet`). | The device is unattended-capable — parent plan D7's whole rationale. Answered 2026-08-19: the stricter reading wins. A three-verb write surface is a far smaller thing to secure than a line editor with a permission matrix, and it makes line convergence one-directional, which is also easier to assert (P6). |
| **D6** | **Every readable field on the session is readable by a stranger.** The session payload sent to a device principal is a **projection**: no cost, no margin, no staff notes, no customer list. | Same reason `kioskMode` already suppresses customer search. |
| **D7** | **Degrade, never block.** Channel down → the surface falls back to `GET /api/counter/session/{id}` polling at 3s and shows the connection-health chip (`useConnectionHealth`). Writes still go over REST and still succeed. | The counter cannot stop selling because a websocket dropped. Matches the OfflineBanner semantics in the station realtime program. |
| **D8** | **Sessions are parked, not deleted.** `status: open → parked → submitted → voided`. Submit hands off to the existing `submitCounterTransaction` with the session's `client_event_id`. | Industry-standard POS "park/retrieve a sale". Also gives the idempotency anchor a home that outlives the tab. |
| **D9** | **`KioskCartLine` stays the wire shape.** The DB stores one row per line with the payload JSONB; the API returns the same `KioskCartLine[]` the store already holds. | The customer face, ledger, totals math (`computeKioskCartTotals`), and `cart-to-counter.ts` all already speak it. Changing it would touch every pane for nothing. |
| **D10** | **Read-only observers are free.** A third subscriber (wall TV, second display) joins the same channel with `subscribe` only. | The session display and the "customer face" are the same projection at different sizes. |

---

## 2. The state model

### 2.1 Tables

Migration slot **`2026-08-20a_counter_sessions.sql`** (one slot per migration; expand-first per
`.claude/rules/backend-patterns.md`). Follows `.claude/rules/polymorphic-tables.md`: named CHECK on `status`,
org-led indexes, `organization_id UUID NOT NULL` with no DEFAULT, `enforce_tenant_isolation(...)` in the same
migration, Drizzle model in the same PR.

```
counter_sessions
  id                  bigserial pk
  organization_id     uuid not null                    -- no default; RLS forced
  kiosk_device_id     bigint null  refs kiosk_devices(id) on delete set null
  claimed_by_staff_id bigint null  refs staff(id)      on delete set null
  claim_expires_at    timestamptz null                 -- D4 lease
  status              text not null default 'open'     -- counter_sessions_status_chk
  version             integer not null default 0       -- D3
  active_command      text not null default 'retail'
  customer_phone      text null
  customer_name       text null
  customer_email      text null
  client_event_id     uuid not null                    -- unique; D8 idempotency anchor
  counter_transaction_id bigint null refs counter_transactions(id) on delete set null
  created_at / updated_at / submitted_at

counter_session_lines
  id                bigserial pk
  organization_id   uuid not null
  session_id        bigint not null refs counter_sessions(id) on delete cascade
  line_uuid         uuid not null                      -- the client-minted KioskCartLine.id
  type              text not null                      -- RETAIL | REPAIR | BUYBACK (KIOSK_LINE_TYPES)
  title             text not null
  quantity          integer not null default 1
  unit_amount_cents integer not null                   -- negative = buyback credit
  payload           jsonb not null default '{}'
  sort_index        integer not null default 0
  voided_at         timestamptz null                   -- soft: a voided line is evidence
  voided_by_staff_id bigint null
  void_reason       text null
  unique (session_id, line_uuid)
```

`ON DELETE CASCADE` is correct **here** (a line has no meaning without its session) and remains **forbidden** on
`counter_transactions`' child links, which hold the signed agreement — parent plan §3.

### 2.2 Events on the channel

One event family, `counter_session.*`, each carrying `{ session_id, version, actor: 'desk'|'kiosk', ... }`:

| Event | Payload | Emitted by |
|---|---|---|
| `session.claimed` | staff name, lease expiry | desk |
| `session.released` | reason: `done` \| `takeover` \| `expired` | either |
| `line.added` / `line.updated` / `line.voided` | the full `CounterSessionLine` (or its id + void reason) | desk |
| `session.customer_changed` | projected identity fields (D6) | either |
| `session.command_changed` | `activeCommand` | desk |
| `session.face_changed` | `staff` \| `customer` | desk |
| `session.snapshot` | whole projection — the resync fallback | server |
| `session.submitted` | transaction id + receipt ref | server |
| `counter_session_ack` | `{ request_id }` — reuses the `station_device_ack` grammar | either |

A subscriber applies an event **only** when `version === local.version + 1`; otherwise it refuses it with a
reason — `duplicate` (already seen, drop it), `gap` (the future arrived early → `GET …/session` for a fresh
`session.snapshot`), or `foreign` (another session, never applied). That single rule is what makes reordering,
duplicate delivery, and a slept iPad all converge to the same place.

**Removal is soft, and there is only one verb for it.** `line.voided` strikes the line through on the desk and
drops it from the customer projection; nothing hard-deletes a line the customer already saw. A `line.removed`
sibling would be a second door onto one job.

---

## 3. Surfaces

| Surface | Route | Role |
|---|---|---|
| **Desk** | **`/counter`** — a new page in the **Sales** domain section | Full CRUD, claim/takeover, step-up-gated money edits, submit |
| **Kiosk** | `/kiosk/v2` (existing) | Session display + signature + confirm (D5); falls back to standalone local cart when unclaimed |
| **Observer** | `/kiosk/v2?face=customer&observe=1` | Read-only projection for a second screen / TV |

### Where `/counter` lives in the nav — Sales, not Scan Stations

**Revised 2026-08-19 (second pass).** The first answer put Counter in the **Walk-In** subgroup beside Local
Pickup and Repair, on the strength of `STATION_SUBGROUPS` calling that group "front-desk counter". That was
the wrong axis. `StationGroupId`'s own docblock says Scan Stations groups a **scanner-driven INPUT MODEL** —
the bench is the family, not the counter. `/counter` drives a shared cart from a keyboard and a mouse; it
mounts no `StationScanPaneHost`, no `StationWorkbench`, no Displays push column. Listing it under Scan
Stations would advertise an input model the surface does not have, and would put a non-bench in the one group
whose membership test is "does an operator work this with a scanner in their hand".

**It belongs to the Sales domain.** `DOMAIN_GROUPS` ids are "a domain an operator names out loud, so a page
has exactly one honest home". A counter visit *is* a sale — Sales already owns Sales Board, Local Pickup
History, and Repair History. Those three are where a sale is **reviewed**; Counter is where a sale is
**made**. Same domain, different tense.

The Sales section's existing docblock already describes the exact permission shape this needs: the row is
gated on `dashboard.view` (the route gate) while each child carries its own `requires`, "because no single
`requires` can express both". Counter joins as a child carrying `walk_in.view` — and if a staffer holds none
of the child permissions, `isSidebarPageReachable` drops the whole section rather than painting a dead header.

```
Sales
  Counter                 ← new, live      /counter
  Sales Board                              /dashboard?mode=sales
  Local Pickup History                     /dashboard?mode=pickup
  Repair History                           /dashboard?mode=repairs
```

Two wire-ups, mirroring how `/pickup` is both its own page row and a child of the Receiving section:

```ts
// SIDEBAR_PAGES — its own row, so ⌘K and the Mode switcher reach it
{ id: 'counter', label: 'Counter', href: '/counter', icon: SalesPrice,
  kind: 'domain', domainGroup: 'sales', requires: 'walk_in.view' },

// SIDEBAR_PAGE_NAV → the `sales` section's children, FIRST (live before history)
{ id: 'counter', label: 'Counter', icon: SalesPrice, requires: 'walk_in.view',
  to: () => ({ pathname: '/counter', params: {} }) },
```

`resolveChild` on the Sales section gains a `/counter` pathname branch, and the route-permission registry
gains `{ prefix: '/counter', permission: 'walk_in.view' }` — `walk_in.view` already exists, so the route-auth
drift gate stays green.

**Still not a footer pin.** `/studio`, `/admin`, `/settings` are the standing-back band — Workflow Studio was
demoted there because "defining the operation is a rare, standing-back act rather than one of the nine places
an operator browses through in a shift" (`sidebar-navigation.ts`, `MainGroupId` docblock). A live customer
cart is the opposite. Pinned rows also never draw children (`showChildren = !pinned && …`), so the mode rail
would not exist.

The kiosk **admin** half is already correctly in that band and stays there: enrollment / pairing codes /
revocation in Settings → Kiosk devices (`KioskDevicesSection.tsx`), attract media + idle timeout in org
settings. **Settings configures the fleet; `/counter` drives the session.**

**Still not a mode on `/pickup`.** That page mounts `ReceivingSurfacePage` inside the receiving mode rail, and
its own docblock rules the boundary: "Local Pickup, a Receiving mode … **Sales is not a receiving mode at
all**" (`src/app/pickup/page.tsx`). `/walk-in` is not available either — it is a retired redirect shell
(`retiredWalkInHistoryTarget`).

L2 modes are URL params on the one page — never extra routes:

| Mode | URL | Job |
|---|---|---|
| Session | `/counter` | live cart, claim a device, full CRUD |
| Parked | `/counter?mode=parked` | resume a parked sale (D8) |
| History | alias → `/dashboard?mode=pickup` | do not clone the existing history table |

Which iPad is claimed rides as `?device=` on Session — which also gives the two-device E2E spec an
addressable URL and gives a takeover a link to hand over.

**Neither surface is a Station** (`docs/rules/display/station.md`) — no `StationWorkbench`, no scan pane, no
Displays push, and on the kiosk no `RightRailHost` either (kiosk law, `AGENTS.md`). `/counter` composes the
existing DS surfaces and does not grow a second ledger component: `KioskCartLedger` is the named SoT for the
cart face, and `kioskSessionStore` for the cart itself.

---

## 4. Build order — feature by feature, each with its own test gate

Every phase ends **green on `npm run verify`**. Unit tests are DB-free `Deps`-injection (`npx tsx --test`).
E2E runs `--project=qa-desktop` against the QA org, never the dogfood tenant (`.claude/rules/verify.md`).

---

### P0 · Session contract + pure reducer *(no DB, no network)*

**Build:** `src/lib/counter/session-events.ts` — event union, `applySessionEvent(snapshot, event)`,
`nextVersion()` / `needsResync()`, and the D6 projection `projectForDevicePrincipal(snapshot)`.

**Status: DONE 2026-08-19 — 25 tests green** (`npx tsx --test src/lib/counter/session-events.test.ts`).

**Test — `session-events.test.ts`:**
- apply in order → converges; a gapped event is refused (`reason: 'gap'`, `needsResync() === true`) and the
  input snapshot is not mutated; replaying the run in 1 → 3 → 2 order lands on a `deepEqual` snapshot
- duplicate delivery of the same version is a no-op that does not advance the version
- an event for another `sessionId` is refused as `foreign` and never triggers a resync
- a stale `session.snapshot` is refused rather than rolling the cart backward; a far-ahead one applies (it *is*
  the resync) and is cloned, not aliased
- `line.voided` for an unknown line id is a no-op **that still takes the version** — refusing it would leave
  the client one behind forever, turning a harmless race into a permanent desync
- a re-published `line.added` is idempotent by line id (the total must not double)
- projection is an **allowlist**, asserted key-by-key: no lease holder, no staff name, no customer email,
  phone masked to four digits, and per line no `passcode` / `notes` / `repairNotes` / `sourceSku` / `imei` /
  buyback `grade` / retail `variationId`
- voided lines vanish from the projection (and so does the void reason), while the desk ledger keeps them
- buyback line keeps its negative `unitAmountCents` through the round trip, and the projected total subtracts

**Done when:** the reducer is provably order-insensitive and the projection provably leaks nothing. ✅

---

### P1 · Migration + Drizzle model

**Build:** `2026-08-20a_counter_sessions.sql` + appended Drizzle blocks.

**Status: DONE 2026-08-19 — applied to the dev DB; FORCE RLS + `tenant_isolation` verified on both tables.**
Two additions beyond the plan's §2.1 sketch, both load-bearing:
- **`ux_counter_sessions_open_device`** — partial unique over `(organization_id, kiosk_device_id) WHERE status
  = 'open'`. D4's "one on one" has to survive two managers opening the same counter; that invariant is too
  important to live only in app code.
- **`client_event_id` is `NOT NULL` and minted at session open**, not at submit, so a parked-and-resumed visit
  and a retried submit carry the same anchor across tabs.

`type` is the three-value `KIOSK_LINE_TYPES` set — **PICKUP is a kiosk *command*, not a line type**; the §2.1
sketch listed it and the CHECK deliberately does not, or a pane selection could persist as a chargeable row.

**Test:**
- `npm run verify` schema-drift + `column-reference.guard` green
- `migration-slot-uniqueness.guard` green (one letter per slot)
- tenancy audit: FORCE RLS on both tables, org-led indexes, no nullable `organization_id`
- manual: insert two sessions in two orgs, `SET LOCAL` the GUC, confirm each sees exactly one

---

### P2 · REST CRUD — the whole verb set

**Status: DONE 2026-08-19 — 23 domain tests green.** Built:
`src/lib/counter/session-store.ts` (the domain waist, `Deps`-injected) · `session-http.ts` (one response
mapping for all nine routes) · `session-line-payload.ts` (per-type payload validation) · nine route files.

**Build:** **Two auth doors onto one domain module.** A correction to this plan's original sketch: a Next route
handler takes ONE auth wrapper per method, so the doors are two URL FAMILIES, not one route with two gates —
`/api/counter/session/**` under `withAuth`, `/api/kiosk/session/**` under `withKioskAuth`. Both call the same
`session-store` functions, which is where D5 is enforced, so the split cannot drift.

**The tablet never names a session id.** `/api/kiosk/session` resolves *the open session bound to this device*
via `ux_counter_sessions_open_device` (P1). A device id in a request body would be a session-enumeration
surface on an unattended tablet; asking "what am I showing?" is not.

**Permissions:** read `walk_in.view` · create/claim/release/lines/customer/status `walk_in.intake` ·
**void `walk_in.take_payment`** (money-moving; P7 adds the PIN step-up on this same door).

| Verb | Desk route (`withAuth`) | Kiosk route (`withKioskAuth`) |
|---|---|---|
| Create | `POST /api/counter/session` | ✗ |
| Read | `GET …/session/{id}` (full) | `GET /api/kiosk/session` (projected, device-resolved) |
| Claim / release | `POST …/{id}/claim` · `/release` | ✗ |
| Add line | `POST …/{id}/lines` | ✗ |
| Update line | `PATCH …/{id}/lines/{lineUuid}` | ✗ |
| Void line (soft) | `DELETE …/{id}/lines/{lineUuid}` | ✗ |
| Set customer | `PATCH …/{id}/customer` | `PATCH /api/kiosk/session/customer` |
| Sign a repair line | ✗ — *desk is refused* | `POST /api/kiosk/session/signature` |
| Park / resume / void | `POST …/{id}/status` | ✗ |
| Submit | → **P8** (the orchestrator writes the transaction) | → P8 |

**The kiosk door is three verbs wide** — customer, signature, confirm — plus a projected read. Everything
else 403s there, which is why the door can be a short allowlist rather than a field-level permission matrix.
A walk-up with no desk still gets today's standalone local cart (D7 fallback); it just is not a *shared*
session until a desk claims the device.

**Test — route-contract unit tests + `counter-session-crud.spec.ts`:**
- every verb: happy path returns `version + 1`
- **`expectedVersion` mismatch → 409 with the current snapshot in the body** (the whole D3 contract)
- kiosk door: **any** line write → 403 (add · update · delete · price · discount · negative amount) — assert the whole verb set, not a sample
- kiosk door: signature on a REPAIR line → 200; signature on a RETAIL line → 422
- **the desk is refused a signature** — a signature captured on the staff desktop is one the customer did not
  give; this is the one asymmetry that runs toward the tablet
- lease: unheld → claim; held by another → `CLAIMED_BY_OTHER` unless `takeover`; **expired → claimable with no
  flag** (the next staffer waits on a timeout, not on a human); renewing your own is always allowed
- a lost version race returns the RACER's snapshot and writes nothing (`bumps === 0`)
- `LINE_NOT_FOUND` does not bump the version — an unknown line is a 404, not a silent success
- a REPAIR line posted with no `productModel` / `serialNumber` / `price` is a 400 **here**, not a failed intake
  in front of a customer at submit
- kiosk door on another org's session id → 404, never 403 (no existence oracle)
- unpaired device → `KIOSK_UNPAIRED` 401 (existing contract preserved)
- replay the same `client_event_id` on submit → one transaction, second call returns the first result

---

### P3 · Realtime token for the device principal

**Status: DONE 2026-08-19 — 14 capability tests green.** Built:
`getKioskBridgeChannelName` in `channels.ts` · `src/lib/realtime/kiosk-capability.ts` (pure) ·
`POST /api/realtime/kiosk-token` (`withKioskAuth`) · lease-scoped grants added to the existing desk token route.

**The load-bearing gap this closed:** `/api/realtime/token` is `withAuth(..., { permission: 'dashboard.view' })`
and stamps `clientId = org:{org}:staff:{staffId}`. **A kiosk device has no staff session and no permissions**, so
it could not mint an Ably token at all — and loosening that route would have been worse than useless: granting
`dashboard.view` to an unattended tablet to get it a websocket hands it the whole org's dashboard feed.

**The channel is keyed by DEVICE, not staff** — the one family in `channels.ts` that is not per-staff, and it
cannot be: the two peers are a staff desktop and a principal with no `staffId`, and the lease holder changes
during a shift while the tablet stays put. The device is the stable end, so it names the channel.

**The asymmetry is deliberate.** A tablet gets one channel — its own, from its own principal, nothing to look
up and nothing to widen. A desk gets one channel per device it has **actually claimed**, resolved from the
lease server-side (`listClaimedDeviceIds`). **Never `kiosk:*`** — a wildcard would let anyone holding
`walk_in.view` watch every counter in the org, customer identity and signature traffic included. That is the
same mistake the per-staff bridges already avoided: `staffstation:` exists precisely because `station:*` would
have widened onto it.

**Test — `kiosk-capability.test.ts`:**
- the device grant is exactly one channel, `['subscribe','publish']`, and contains **no wildcard, no org
  broadcast feed, no `db:*`, no dashboard channel** — asserted by shape, not by a sample
- device 7's grant does not contain device 8's channel
- the desk grant is one channel per claimed device; empty when it holds no lease; never a wildcard at any size
- `capabilityLeaksOutsideOrg` catches a cross-tenant grant, a bare un-namespaced name, **and an org id that is
  only a PREFIX of another** (the trailing colon is why `org:{ORG}extra:…` cannot pass)
- the builder throws on a non-uuid org, like every other builder in `channels.ts`
- `clientId` stamps the device principal, never a staff id

**Test — `session-store.test.ts` (P3 slice):** a live lease names its device · another staffer gets nothing ·
**an expired lease drops out**, so walking away stops that counter's traffic at the next token mint, with
nobody having to revoke anything.

**Revocation was already covered** and needed no new code: `/api/kiosk/revoke` flips the row to `revoked`,
`withKioskAuth` then 401s the mint, and the live connection dies when its one-hour token expires.

### P4 · The bridge, live — server fan-out + desk subscription

**Status: PARTIALLY DONE 2026-08-19 (desk half).** Built: `publishCounterSessionEvent` (`publish.ts`) ·
`session-fanout.ts` (pass-through publisher) wired into **all nine** mutation routes · desk subscription in
`useCounterSession` over `useAblyChannel` with `coalesce: 'frame'`.

**Order changed:** P5's page was built before P4 because every mutation route already answers with the new
snapshot, so the desk surface is correct with no transport at all. That made the **degraded path the default**
— the 3s poll ran from day one, and attaching the socket only *demotes* it to a 30s safety net. The D7
fallback is therefore the branch that has been exercised all along, rather than one nobody runs until Ably
breaks.

**The server publishes, not the mutating client.** The client that wrote already has its answer in the
response; a client-side publish would only serve the *far* screen, and would stop serving it exactly when that
client's own socket dropped. From the server, a desk with a dead websocket still drives the tablet. It runs in
`after()` so a realtime notification never sits between an operator and their answer, and a failed publish
costs the far screen one poll, never a write.

**A refusal publishes nothing** — there is no new version to announce, and only the loser needs to know.

### P4b · Store transport swap — the tablet mirrors the desk

**Status: DONE 2026-08-20 — 13 new store tests green; the 34 existing kiosk tests pass untouched**, which is
the real proof the public API did not move. Built: `AblyProvider` `authUrl` prop · `KioskRealtimeProvider`
(device-principal client) · `useKioskSharedSession` · `mirrorSharedSession` / `detachSharedSession` on
`kioskSessionStore` · the bridge channel name returned with the device payload.

**The tablet had no Ably client at all.** `AuthenticatedAblyProvider` gates on a staff `user`, and a tablet has
none — so nothing was ever mounted on `/kiosk`. It now mounts its own provider pointed at
`/api/realtime/kiosk-token` (P3). Nesting under the app-wide provider is intended: the context is React-scoped,
so kiosk children resolve to the device client while staff surfaces keep the shared staff connection.

**The channel name travels with the device payload.** A tablet cannot build `org:{orgId}:kiosk:{deviceId}` —
it knows neither id, its principal being an httpOnly cookie. Handing it the name discloses nothing it is not
already authorized for (its token grants exactly that one channel) and avoids a second endpoint whose only job
is to echo two ids.

**Two decisions worth keeping:**

- **A mirror refuses local line writes.** While a desk holds the tablet, `addLine` / `updateLine` /
  `removeLine` are no-ops. Not defensive coding — D5, enforced at the API door too. Painting a local edit the
  server never accepted would be erased by the next mirror: a cart that disagrees with the receipt for exactly
  as long as the customer is looking at it.
- **The masked phone never lands in `customerPhone`.** It is display copy in its own field. In the identity
  field, a local submit would post `••• ••• 4567` as a customer's phone number.

**Detach clears the mirrored cart** but keeps the active pane and face — the desk letting go is not a pane
change, and leaving the lines up would show the next customer the last one's basket.

### P4c · Optimistic desk echo (deferred)

**Build:** keep `kioskSessionStore`'s exported API **byte-identical**; give it a transport:
`local` (today's behavior, used when unclaimed/offline) or `shared` (REST write → optimistic local echo →
reconcile on the returned version → publish). Subscribe to the channel and feed `applySessionEvent`.

**Test:**
- unit: with a fake transport, `addRetail` echoes immediately and reconciles to the server line id
- unit: a 409 rolls the optimistic line back and applies the server snapshot — **no duplicate line**
- unit: transport `local` still passes the entire existing `kiosk-session-store` behavior suite unchanged
- `KioskRepairPane.test.ts` and `cart-line.test.ts` stay green untouched (proof the API did not move)

---

### P5 · `/counter` — the desk surface: claim, CRUD, takeover

**Build:** the `/counter` route + its Sales-section nav wiring + route-permission row, then the surface: device picker
(paired + online devices), claim button, live ledger with inline
qty/price edit, add-line search over the existing catalog projection, void with reason, park/resume.

**Test — `counter-session-desk.spec.ts`:**
- claim an unclaimed device → lease row written, `session.claimed` observed
- second staffer claims the same device → takeover prompt naming the holder; confirm → first desk goes read-only with a banner
- lease expiry with no heartbeat → device returns to unclaimed and the kiosk falls back to local cart
- edit qty on desk → assert the ledger row; void a line → assert it renders struck-through, not vanished

---

### P6 · Two-device convergence — **the headline test**

**Status: DONE 2026-08-20 — 7/7 green** (`npx playwright test tests/e2e/counter-session-two-device.spec.ts
--project=qa-desktop`, against the QA org).

**It caught three real defects that every unit test had missed:**

1. **`src/proxy.ts` 401'd the tablet before `withKioskAuth` ever ran.** That file carries an explicit
   allowlist of device-authed kiosk prefixes (`/api/kiosk/pair`, `/intake`, `/repair`, `/sales`, `/settings`,
   `/staff-for-stepup`, `/pickup`) — and **none of P2's or P4b's routes were on it**. The tablet could not read
   its own session.
2. **`/api/realtime/kiosk-token` was 401'd for the same reason** — it lives under `/api/realtime/`, not
   `/api/kiosk/`, so P3's whole token route was unreachable by the only principal it exists for.
3. **A lost version race COMMITTED its write.** `withTenantTransaction` commits when its callback returns and
   rolls back only when it throws; `mutate` returned a refusal *after* the line insert had run. The caller got
   `VERSION_CONFLICT` and re-rendered from a snapshot **containing the line it had just been told was not
   written**. Fixed with a `CounterSessionConflict` throw, and the conflict snapshot is now re-read outside the
   transaction (a read inside would still see our own doomed write).

Defect 3 is the one worth remembering: the unit fake committed through a throw, so it could not have found
this. The fake now rolls back like the real transaction does, and the unit test asserts `lines === []` after a
lost race — the guard that would have caught it.

**Test — `counter-session-two-device.spec.ts`** (desk = `qa-desktop` staff session; tablet = a fresh context
with an empty cookie jar at the `iPad Pro 11 landscape` descriptor, pairing for its `cf_kiosk` exactly as a
real tablet does):

| # | Row | Asserts |
|---|---|---|
| 1 | Desk types a line into the real form and clicks Add | it appears on the desk, then converges on the tablet |
| 2 | Quantity 1 → 3 | tablet's projected quantity follows |
| 3 | Desk voids a line | **desk keeps it** (`voidedAtMs` stamped); **tablet's copy is gone** |
| 4 | Tablet sets the customer | desk snapshot carries the real phone; **tablet reads it back masked**, and the raw number appears nowhere in its payload |
| 5 | Tablet attempts add / price-override / delete / claim / status | every one refused — a missing button is not a security property |
| 6 | Device revoked mid-session | tablet's read **and** its token mint both 401 at once |
| 7 | Stale `expectedVersion` | 409 carrying the CURRENT snapshot, and nothing half-written |
| 8 | Tablet's payload | carries the bridge channel it cannot build (`org:{uuid}:kiosk:{id}`) |

Line writes flow desk → tablet only (D5), so the reverse direction has exactly two rows to prove and the rest
is proved by refusal.

**Non-destructive:** each run enrolls its own device (revoked in cleanup) and opens its own session.

### P7 · Money-edit step-up + audit

**Status: DONE 2026-08-20.** Built: `POST …/lines/{lineUuid}/price` (its own verb) · `stepUp: true` on price and
void and submit · three new `AUDIT_ACTION` constants + `AUDIT_ENTITY.COUNTER_SESSION` · `recordAudit` on every
money-moving edit with real before/after amounts.

**Price got its own route, and that is the load-bearing part.** It used to be an optional field on the general
line PATCH — which would have made the step-up gate depend on *which optional field a caller chose to send*.
A permission you can bypass by omitting a field is not a permission. `unitAmountCents` is now absent from the
PATCH schema entirely.

**The audit reads the BEFORE amount before writing.** A row carrying only the new price cannot answer the
question anyone actually asks of it later — *what did this cost before someone changed it?*

**Test:** the domain suite pins the boundary field-by-field (a kiosk patch carrying `unitAmountCents` is
refused **including its harmless half**); the E2E pins that a device principal cannot reach the desk routes at
all.

### P8 · Submit hand-off

**Status: DONE 2026-08-20 — 34 domain tests green.** Built: `submitBlocker()` + `submitSession()` in
`session-store.ts` · `POST …/{id}/submit` (`walk_in.take_payment` + step-up + audit).

**Composes `submitCounterTransaction`; does not re-implement it.** Customer create-or-match, the repair intake,
provider order staging and the ticket outbox already live there, tested. The session contributes the two things
that function cannot know: the staged cart (mapped by `mapKioskCartToCounterParts`, the same mapper the kiosk's
own submit uses, so a visit finished from either side produces the same two records) and the
**`client_event_id` minted when the visit opened** — which is what makes a double-submit from two devices one
transaction instead of two charges (D8).

**Three gates, in a deliberate order** (`submitBlocker`): empty cart → missing phone → unsigned repair. Order
matters: telling someone their repair is unsigned when the cart is empty sends them to fix the wrong thing.
A cart of only *voided* lines is empty. An unsigned repair is not a slow path to fix later — it is a legal
agreement about someone else's property, so it is a hard 422.

**All the submit refusals are 422, not 400.** The request is well-formed and authorized; the *visit* is not
finishable yet.

---

### P8 · Submit hand-off

**Build:** `POST …/{id}/submit` composes `submitCounterTransaction` (read-only, never edited) with the session's
`client_event_id`; on success set `status='submitted'` and publish `session.submitted`.

**Test:** partial-failure rows from the existing `submit-counter-transaction.test.ts` still hold · double-submit
from both devices simultaneously → one transaction (unique `client_event_id`), both see the same result ·
submit with an unsigned repair line → 422 naming the line.

---

### P9 · Degrade + connection health

**Build:** channel-down → 3s polling; connection chip on both faces; write queue is **not** built (D7 writes go
over REST and either succeed or surface an error — no offline write buffer in v1).

**Test:** kill the Ably token mid-session (route intercept) → the desk still edits, the iPad still converges
within one poll · both surfaces show the degraded chip · restoring the channel stops the polling.

---

### P10 · Real-device matrix *(manual, ends every phase from P6 on)*

Run on the actual enrolled iPad in Guided Access alongside the desktop, per
[`docs/security/kiosk-device-lockdown.md`](../security/kiosk-device-lockdown.md):

- portrait ↔ landscape rotation mid-edit
- iPad sleep 5 min → wake → converge
- Wi-Fi drop 30s on the iPad only → recover
- desktop browser refresh while holding the lease → lease survives, session repaints
- two customers back-to-back → `resetSession` leaves nothing from visit 1 (assert lines, identity, signature)

---

## 5. What this plan explicitly does not do

- No second realtime bus, no SSE swap, no Ably→anything migration (`station-realtime-capture-visibility` non-goals).
- No CRDT for the cart (D3).
- No offline write buffer (P9) — call it out as v2 if the shop's Wi-Fi proves it necessary.
- No native Swift shell; this rides the existing PWA-under-MDM question, unresolved in the iPad shell briefing.
- No second cart store, no second ledger component, no per-surface search (`pattern-evolution.md`, `source-of-truth.md`).

## 6. Open questions for product

1. ~~Which desk route hosts the pane~~ — **answered 2026-08-19: `/counter`, a new page in the Sales domain section** (revised same day off Scan Stations — it has no scanner). Rationale in §3.
2. **Lease length + takeover policy:** 60s heartbeat with a 5-min lease, or an explicit hand-off only?
3. ~~Can the customer's iPad add lines at all~~ — **answered 2026-08-19: no. Display + signature + confirm only.** D5 rewritten; P2's kiosk column is now three verbs.
4. **How many observers** — is the wall-TV projection in v1, or does it wait for the attract-media work?
5. **Price authority on a shared line:** provider catalog price at charge time (parent plan) vs the desk's edited amount — which wins if they disagree at submit?
