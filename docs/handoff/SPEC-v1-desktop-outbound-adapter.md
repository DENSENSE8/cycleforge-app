# SPEC — `/api/v1` desktop outbound adapter (not implemented)

**Status:** specification only, 2026-09-24. Implement nothing from this file until its
prerequisites (§2) are in `prod`.
**Parent:** `HANDOFF-cross-client-outbound-foundation.md` → "Existing contract seam".

## 1. Why this exists and the limits on it

The Tauri shell sends native requests only to `/api/v1/*` and carries no staff cookie. The first
slice needs two writes that today exist only as cookie routes:

| Verb | Cookie route (web, iPhone) | Canonical service |
|---|---|---|
| create a QA test order | `POST /api/orders/add` (`orders.create`, `Idempotency-Key`) | inline in the route today, so it must be extracted first (§2.1) |
| acknowledge / route an order | `POST /api/orders/{id}/acknowledge` (`orders.create`) | `acknowledgeOrder` in `src/lib/orders/order-acknowledgment.ts` |

The adapter is **two fixed endpoints**, not a proxy. It has no path passthrough, no method
passthrough and no forwarding of arbitrary bodies, and it never accepts a tenant or actor from the
request. It adds no lifecycle state, no table and no second order domain. Both endpoints return the
existing `OutboundWorkItem` projection (`src/lib/outbound/work-contract.ts`).

## 2. Prerequisites (each promoted by SHA from `codex/v1-outbound`, then proven)

1. **Extract the create service.** Move the body of `POST /api/orders/add` (from after the JSON
   parse up to the response mapping, including the `withIdempotencyClaim` call and the
   `ORDER_CREATE` audit) into `src/lib/orders/create-order.ts` as
   `createOrder(input, principal: { organizationId, staffId }, deps)`. The cookie route becomes
   parse → `createOrder` → map. There must be no behaviour change, proven by the existing
   `orders/add` replay: same key → same body, one row, one audit row.
2. **Device principal:** `src/lib/auth/desktop-device.ts` plus the `desktop_devices` migration and
   the `/api/v1/desktop/{enroll,pair}` routes (`689231688`, `d7797a541`).
3. **Operator principal:** `src/lib/auth/operator-session.ts`, `operator-session-contract.ts`,
   `operator-principal.ts` (`resolveOperatorPrincipal`), `/api/v1/desktop/operator-session` and
   their migration (`31b512426`). A device bearer alone is never an actor (`COMMAND_NO_ACTOR`,
   operator decision 2026-09-20).
4. **Single-order projection:** `getOutboundWorkItem(organizationId, orderPk)` in
   `src/lib/outbound/work-projection.ts`. It must be the same SQL as `listOutboundWork`, with the
   order filter added as a bound parameter, and not a second projection.

## 3. Principal: tenant and actor come only from the native credentials

```text
Authorization: Bearer <device token>           → the machine (desktop_devices row → organization_id)
x-cycleforge-operator: <operator session token> → the human (session bound to that device)
```

- Resolve with `resolveOperatorPrincipal(req, 'orders.create')`. It checks the permission against
  the **operator's** roles, never the device enroller's.
- Reject if a staff cookie is present with no bearer: `401 NATIVE_PRINCIPAL_REQUIRED`. Cookie
  clients use the cookie routes, so one route never has two principals.
- Any `organizationId`, `orgId`, `staffId` or `actor*` key in the body is a Zod `.strict()` failure
  (`400`), not something the handler silently ignores.

## 4. The QA-capability gate

After the principal resolves, call
`loadQaCapability(principal.organizationId, operatorPermissions, 'developer.qa_tools.view')`
(`src/lib/qa/assert-capability.ts`) and map the result with `qaCapabilityResponse`:

- not a sandbox org → `404 NOT_FOUND` (the adapter is not advertised to customer tenants);
- sandbox org without the permission → `403 FORBIDDEN`.

Opening it to customer orgs is a separate owner decision and needs a new SPEC revision. It is not a
flag.

## 5. Endpoints

### 5.1 `POST /api/v1/outbound/qa-orders`

```text
Headers: Authorization, x-cycleforge-operator, Idempotency-Key: <UUID v4>   (all required)
Body (Zod .strict()): { orderId, productTitle, sku?, accountSource, quantity?, condition?, isUrgent? }
```

Tracking and label fields are **deliberately absent.** A QA order made by the adapter is
label-less, so the acknowledge step can honestly return `409 NOT_READY`.

| Result | Status | Body |
|---|---|---|
| created | `201` | `{ data: OutboundWorkItem }` |
| same key (replay) | `201` | byte-identical cached body (from `withIdempotencyClaim`, route key `v1.outbound.qa-orders`). The claim is keyed on (org, key, route) and does not compare bodies, so reusing a key with a different body replays the first response. That is the existing semantics for every claimed route. |
| same key while the first request is still running | `409` | `{ error: { code: 'IDEMPOTENCY_IN_PROGRESS' } }` (claim outcome `in_progress`) |
| different key, `orderId` already exists | `409` | `{ error: { code: 'ORDER_EXISTS', orderPk } }` |
| missing or invalid key | `400` | `{ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } }` |

### 5.2 `POST /api/v1/outbound/work/{orderPk}/acknowledge`

```text
Headers: Authorization, x-cycleforge-operator, Idempotency-Key: <UUID v4>
Body (Zod .strict()): { route: 'PICK' | 'QC' }   (outboundFulfillmentRouteSchema)
```

| Result | Status | Body |
|---|---|---|
| acknowledged | `200` | `{ data: OutboundWorkItem }`, where the item's acknowledgment facts are the source of truth |
| not ready | `409` | `{ error: { code: 'NOT_READY', missing: ('pairing' \| 'label')[] } }` (same result as the cookie route) |
| not in this tenant | `404` | `{ error: { code: 'NOT_FOUND' } }` |
| replay | `200` | cached body (route key `v1.outbound.acknowledge`) |

There is no DELETE (undo) in the adapter's first cut. Undo stays on the cookie route until an owner
asks for it on desktop.

## 6. Audit (every success; refusals write nothing, same as the cookie routes)

`recordAudit(pool, null, req, { … , actorStaffIdOverride: principal.staffId,
organizationIdOverride: principal.organizationId, extra: { device_id, operator_method, via: 'v1-adapter' } })`
with the **same** verbs as the cookie routes: `AUDIT_ACTION.ORDER_CREATE` and
`AUDIT_ACTION.ORDER_ACKNOWLEDGED`, on `AUDIT_ENTITY.ORDER`. A reader filtering on the action sees
both clients' events, and `metadata.via` separates them.

## 7. Contract and gates

- Request and response schemas are Zod in `src/lib/outbound/work-contract.ts`. Their OpenAPI paths
  are added through `buildOutboundWorkOpenApi()`, so `docs/openapi/cycleforge-v1.json` and the
  `V1 OpenAPI` gate in `verify:fast` cover them.
- `route-permission-manifest.test.ts`: both paths are gated by `orders.create` through the operator
  principal.

## 8. Acceptance (the proof when this is implemented)

1. An unpaired bearer → `401 DESKTOP_UNPAIRED` on both endpoints; nothing is written.
2. A paired device with no operator → `401 NO_OPERATOR_SESSION`; nothing is written.
3. An operator token from device A with the bearer of device B → `401 OPERATOR_SESSION_DEVICE_MISMATCH`.
4. A customer-org device → `404`. A QA-org operator without `developer.qa_tools.view` → `403`.
5. QA org: create → `201` with an `OutboundWorkItem`. Replay with the same key returns the same
   body, and `SELECT count(*)` shows one order and one `order.create` audit row with
   `metadata.via = 'v1-adapter'`.
6. Acknowledge the new label-less order → `409 NOT_READY missing:['label']`, with no row changed
   and no audit row.
7. `GET /api/v1/outbound/work?view=triage` with the same device bearer lists the order.
8. A body carrying `organizationId` → `400`.
