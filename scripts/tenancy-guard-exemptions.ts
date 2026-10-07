/**
 * Tenancy-guard route exemptions — the documented allowlist for invariant (A).
 *
 * GENERATED ONCE from the Phase-E route classification, then maintained BY HAND.
 * Each entry is a route that statically "touches" a FORCEd tenant table (per the
 * coarse word-match in scripts/tenancy-route-audit.mjs) yet is NOT GUC-wrapped —
 * and is exempt by design for the stated reason. Keyed by ROUTE PATH (stable as
 * more tables are FORCEd), never by table.
 *
 * Categories:
 *   preauth-identity      /api/auth/* identity/session lookup before a tenant
 *                         context exists (cross-org by necessity; cannot be GUC-scoped).
 *   cross-org-by-design   integration/sync/webhook/cron that legitimately spans orgs
 *                         on the owner pool (org resolved from payload or per-org sweep).
 *   no-db-false-positive  the route runs NO query on the flagged table; the word
 *                         matched an import/type/string/variable.
 *   helper-safe-delegation  tenant-table work is delegated to a GUC-aware src/lib/**
 *                         helper threaded ctx.organizationId; pool (if any) only for
 *                         ctx-stamped recordAudit / api-idempotency.
 *   owner-pool-admin      privileged admin path that must run on the owner pool.
 *
 * RATCHET: a NEW route that touches a FORCEd table and is neither GUC-wrapped nor
 * listed here FAILS the guard — add it here (with an honest reason) only after
 * confirming it is genuinely exempt, or GUC-wrap it instead.
 */

type ExemptionCategory =
  | 'preauth-identity'
  | 'cross-org-by-design'
  | 'no-db-false-positive'
  | 'helper-safe-delegation'
  | 'owner-pool-admin';

export const ROUTE_TENANCY_EXEMPTIONS: Record<string, { reason: string; category: ExemptionCategory }> = {
  '/api/cron/documents/ecwid-packing-slips': { category: 'cross-org-by-design', reason: "bearer-authenticated worker enumerates active organizations, then the lifecycle helper uses tenantQuery for every organization's document jobs" },
  '/api/auth/qr/authorize': { category: 'preauth-identity', reason: "one-time QR authorization must resolve a staff identity before an org context exists; PIN/passkey proof is verified before the QR session is bound to that staff row's organization" },
  '/api/auth/staff-choice': { category: 'preauth-identity', reason: "loads a verified umbrella session first, then scopes the shared-account staff choice to that session's organization and staff id" },
  '/api/orders/import/suggest-mapping': { category: 'no-db-false-positive', reason: "AI-assisted header mapping only; orders appears in module and permission names, not a database query" },
  '/api/realtime/wms-ticket': { category: 'no-db-false-positive', reason: "signs a short-lived ticket from authenticated context only; orders appears in the permission name, not a database query" },
  '/api/sku-catalog/composition/batch': { category: 'helper-safe-delegation', reason: "threads ctx.organizationId into batch loaders whose relationship and kit queries use tenantQuery" },
  '/api/racks/[code]/labels-printed': { category: 'helper-safe-delegation', reason: "thin handler; rackActor(gate.ctx) threads ctx.organizationId into src/lib/locations/racks.ts, whose every statement runs inside withTenantTransaction (racks-store, org-filtered); pool is used only for ctx-stamped recordAudit" },
  '/api/racks/[code]/move': { category: 'helper-safe-delegation', reason: "thin handler; rackActor(gate.ctx) threads ctx.organizationId into src/lib/locations/racks.ts, whose every statement runs inside withTenantTransaction (racks-store, org-filtered); pool is used only for ctx-stamped recordAudit" },
  '/api/racks/[code]/shelves': { category: 'helper-safe-delegation', reason: "thin handler; rackActor(gate.ctx) threads ctx.organizationId into src/lib/locations/racks.ts, whose every statement runs inside withTenantTransaction (racks-store, org-filtered); pool is used only for ctx-stamped recordAudit" },
  '/api/racks/adopt': { category: 'helper-safe-delegation', reason: "thin handler; rackActor(ctx) threads ctx.organizationId into src/lib/locations/racks.ts, whose every statement runs inside withTenantTransaction (racks-store, org-filtered); pool is used only for ctx-stamped recordAudit" },
  '/api/admin/org/delete': { category: 'owner-pool-admin', reason: "org soft-delete + session revoke on the organizations root table; owner-pool by design (step-up + confirm-slug gated)" },
  '/api/admin/photos/mirror': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/admin/po-gmail/preview-unread': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/ai/search': { category: 'no-db-false-positive', reason: "calls the Hermes AI gateway only; \"messages\" never queried (no DB)" },
  '/api/auth/account/passkey/authenticate/finish': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/account/passkey/register/finish': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/email-login/request': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/email-login/verify': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/enroll/[token]': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/passkey/authenticate/finish': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/passkey/register/begin': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/passkey/register/finish': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/pin': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/pin/create': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/qr/handoff/claim': { category: 'preauth-identity', reason: "public one-time QR capability must resolve its staff identity before a phone session and tenant context can be created" },
  '/api/auth/qr/status': { category: 'preauth-identity', reason: "public one-time QR capability must resolve its authorized staff identity before a browser session and tenant context can be created" },
  '/api/auth/session': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/signup': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/staff-picker': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/cron/cleanup': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/documents/ensure-outbound': { category: 'cross-org-by-design', reason: "bearer-authenticated reconciler enumerates organizations, then every document/order read and fetch is passed that orgId through tenantQuery-aware helpers" },
  '/api/cron/photos/analyze': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/photos/drive-mirror': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/photos/nas-mirror': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/documents/nas-mirror': { category: 'cross-org-by-design', reason: "cross-org cron on the owner pool; selects GCS-primary outbound documents across orgs for NAS cold mirror" },
  '/api/cron/staff-goals/history': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/ecwid/order-search': { category: 'no-db-false-positive', reason: "Ecwid REST API only; table words are response-shape vars" },
  '/api/ecwid/products/search': { category: 'no-db-false-positive', reason: "Ecwid REST API only; table words are response-shape vars" },
  '/api/integrations/google-drive/callback': { category: 'cross-org-by-design', reason: "OAuth callback with no session; org recovered from the encrypted state payload (upsertIntegrationCredentials)" },
  '/api/integrations/google-drive/connect': { category: 'no-db-false-positive', reason: "builds the OAuth redirect, encrypts org into state; no query" },
  '/api/integrations/google-drive/health': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/locations/register': { category: 'helper-safe-delegation', reason: "thin handler; registerLocationsAudited → registerPrintedLocations(input, ctx.organizationId) runs inside withTenantTransaction; audit via ctx-stamped recordAudit — verified: no inline tenant pool.query" },
  '/api/manual-server/by-item': { category: 'no-db-false-positive', reason: "external manual-server HTTP fetch; no DB" },
  '/api/manual-server/unassigned': { category: 'no-db-false-positive', reason: "external manual-server HTTP fetch; no DB" },
  '/api/nas-config': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/nas-dev/[[...path]]': { category: 'no-db-false-positive', reason: "reads the SMB share over the network; no DB query" },
  '/api/nas-target/[target]/[[...path]]': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/packing/policy': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/analyze': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/drive-backup': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/nas-backup': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/product-manuals/assign': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/product-manuals/upsert': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/receiving-lines/incoming/email-rescan': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  // B3 provider-agnostic move: handler now lives at inventory-refresh; zoho-refresh
  // is a thin re-export alias (kept until clients migrate) — both entries stay.
  '/api/receiving/pending-check': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/records/tracking': { category: 'helper-safe-delegation', reason: "thin handler; applyRecordTracking (src/lib/records/sheet-actions/tracking.ts) runs every orders / receiving_line statement inside withTenantTransaction (ctx-scoped); publishRecordWrite hands the changed ids to recomputeEnrichmentForOrders on pool, as /api/orders/[id]/tracking does — verified: no inline tenant pool.query" },
  '/api/records/tracking/unlink': { category: 'helper-safe-delegation', reason: "thin handler; unlinkRecordTracking (src/lib/records/sheet-actions/tracking.ts) runs every orders / receiving_line statement inside withTenantTransaction (ctx-scoped); publishRecordWrite hands the changed ids to recomputeEnrichmentForOrders on pool, as /api/orders/[id]/tracking does — verified: no inline tenant pool.query" },
  '/api/shipping/track/register': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/staff/schedule/bulk': { category: 'no-db-false-positive', reason: "writes staff_weekly_schedule/overrides; \"staff\" matched strings, not the staff table" },
  '/api/studio/graph': { category: 'no-db-false-positive', reason: "drizzle reads workflow_* (not enforced); \"types\" matched the \"studio-types\" import path" },
  '/api/studio/templates': { category: 'no-db-false-positive', reason: "reads global workflow_templates; \"types\" matched the \"studio-types\" import path" },
  '/api/studio/templates/[id]': { category: 'no-db-false-positive', reason: "reads global workflow_templates; \"types\" matched the \"studio-types\" import path" },
  '/api/walk-in/catalog': { category: 'no-db-false-positive', reason: "Square API only (squareFetchForOrg); \"items\" is a local variable" },
  '/api/walk-in/customers': { category: 'no-db-false-positive', reason: "Square API only; \"customers\" is a local variable" },
  '/api/walk-in/orders': { category: 'no-db-false-positive', reason: "Square API only; \"orders\"/\"line_items\" are local variables" },
  '/api/walk-in/status': { category: 'no-db-false-positive', reason: "Square diagnostics only; no local query" },
  '/api/walk-in/sync': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/zoho/items/sync': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/zoho/oauth/authorize': { category: 'no-db-false-positive', reason: "builds the Zoho OAuth redirect from env; no DB" },
  '/api/zoho/purchase-orders/sync': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/auth/act-as-staff': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/auth/verify-email': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/cron/signals/buyer-notes-heal': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/mcp': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/saved-views': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/saved-views/[id]': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/serial-units/[id]/data-wipe': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/studio/catalog': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/tasks/plan-files': { category: 'no-db-false-positive', reason: "lists markdown plan files from the repo filesystem (docs/**, master-plan.mdx) via listPlanFiles; documents appears only in the task-documents-shared type import path, no database query" },
  '/api/integrations/order-sources': { category: 'no-db-false-positive', reason: "orders appears only in the orders.view permission name; the handler never queries orders — it threads ctx.organizationId into listConnections, which reads only organization_integrations with an explicit organization_id filter" },
  '/api/wms/commands': { category: 'helper-safe-delegation', reason: "thin HTTP transport for the WMS execution kernel; threads ctx.organizationId/staffId into executeWmsExecutionCommand whose picking-session paths use tenantQuery/withTenantTransaction; pool only for org-stamped idempotency claims and recordAudit; orders appears in the permission name" },
  '/api/work-orders/mine': { category: 'helper-safe-delegation', reason: "threads ctx.organizationId into fetchAllWorkOrderQueues(unified) whose getOrders and receiving/repair/FBA/stock queue fetchers all use tenantQuery; no inline pool query" },
  '/api/auth/account/signin': { category: 'preauth-identity', reason: "public email+password sign-in resolves the account's cross-org memberships/staff identity before any session exists; the only inline pool read is the system-global organizations slug of the verified target org, and the shared-staff choice list is filtered by that target's organization_id" },
  '/api/v1/reminders': { category: 'helper-safe-delegation', reason: "threads ctx.organizationId/staffId into listStaffReminders with staffReminderDbDeps, whose task/checklist/mark queries all use tenantQuery with explicit organization_id filters; staff matched the list-staff-reminders import path, no inline pool query" },
  '/api/zoho/purchase-orders': { category: 'no-db-false-positive', reason: "Zoho REST API only, bound to ctx.organizationId via withZohoOrg; \"items\"/\"sku\" are Zoho purchase-order response-shape fields, not a database query" },
  '/api/brands': { category: 'helper-safe-delegation', reason: "thin withAuth shell; handleBrandList/handleBrandCreate (src/lib/brands/http.ts) read via tenantQueryOneTrip and write via withTenantTransaction on ctx.organizationId, sqlBrandStore keeps explicit organization_id filters; pool only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/brands/[id]': { category: 'helper-safe-delegation', reason: "thin requireRoutePerm shell; handleBrandGet/handleBrandUpdate (src/lib/brands/http.ts) read via tenantQueryOneTrip and write via withTenantTransaction on gate.ctx.organizationId, sqlBrandStore keeps explicit organization_id filters; pool only for ctx-stamped recordAudit — verified: no inline tenant pool.query" },
  '/api/brands/[id]/products': { category: 'helper-safe-delegation', reason: "thin requireRoutePerm shell; handleBrandProducts (src/lib/brands/http.ts) reads via tenantQueryOneTrip on gate.ctx.organizationId with explicit organization_id filters in sqlBrandStore — verified: no inline tenant pool.query" },
  '/api/brands/proposals': { category: 'helper-safe-delegation', reason: "thin withAuth shell; handleBrandProposalList (src/lib/brands/http.ts) reads agent_mutations via tenantQueryOneTrip on ctx.organizationId with explicit organization_id filters — verified: no inline tenant pool.query" },
  '/api/brands/proposals/[id]': { category: 'helper-safe-delegation', reason: "thin requireRoutePerm shell; handleBrandProposalReview passes gate.ctx.organizationId to reviewAgentMutation, which applies/rejects inside withTenantTransaction — verified: no inline tenant pool.query" },
  '/api/exceptions': { category: 'helper-safe-delegation', reason: "thin withAuth shell; listExceptions/countExceptions (src/lib/exceptions/hub.ts) take ctx.organizationId and every source reads through tenantQueryOneTrip(ctx.orgId, …) or an org-threaded order/sku helper; `types` is the @/lib/exceptions/types module name, not a table — verified: no pool import" },
  '/api/orders/import/extract-capture': { category: 'no-db-false-positive', reason: "pasted text/screenshots → the org's AI provider (postToAiProvider) → review fields; orders/sku are response field and permission names, not a database query — nothing is written" },
  '/api/orders/intake/catalog/ecwid-categories': { category: 'no-db-false-positive', reason: "orders appears in the module path and permission name only; the category level reads ecwid category projections through tenantQuery(ctx.organizationId) (src/lib/repair/catalog-projection.ts)" },
  '/api/orders/intake/catalog/favorites': { category: 'no-db-false-positive', reason: "orders appears in the module path and permission name only; favorites read/write through withTenantConnection(ctx.organizationId) in src/lib/favorites/sku-favorites.ts" },
  '/api/shipping/addresses/validate': { category: 'no-db-false-positive', reason: "orders appears in the permission name only; validates one address against the org's ShipStation connection (credentials resolved for ctx.organizationId) — no warehouse table query" },
};
