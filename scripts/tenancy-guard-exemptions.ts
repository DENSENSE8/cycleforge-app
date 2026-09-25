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

export type ExemptionCategory =
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
  '/api/orders/intake-suggestions': { category: 'helper-safe-delegation', reason: "passes ctx.organizationId to the Ecwid credential resolver; remaining work is provider fetch and pure canonical-order mapping" },
  '/api/realtime/wms-ticket': { category: 'no-db-false-positive', reason: "signs a short-lived ticket from authenticated context only; orders appears in the permission name, not a database query" },
  '/api/receiving/inbound/extract-po': { category: 'helper-safe-delegation', reason: "passes ctx.organizationId to the tenant-scoped AI provider resolver; the extraction path performs no warehouse database query" },
  '/api/sku-catalog/composition/batch': { category: 'helper-safe-delegation', reason: "threads ctx.organizationId into batch loaders whose relationship and kit queries use tenantQuery" },
  '/api/admin/org/delete': { category: 'owner-pool-admin', reason: "org soft-delete + session revoke on the organizations root table; owner-pool by design (step-up + confirm-slug gated)" },
  '/api/admin/organization/settings': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/admin/photos/mirror': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/admin/po-gmail/preview-unread': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/ai/chat/stream': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
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
  '/api/auth/step-up': { category: 'preauth-identity', reason: "/api/auth identity/session resolution before a tenant context exists; the cross-org staff/session/token lookup cannot be org-GUC-scoped" },
  '/api/cron/cleanup': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/documents/ensure-outbound': { category: 'cross-org-by-design', reason: "bearer-authenticated reconciler enumerates organizations, then every document/order read and fetch is passed that orgId through tenantQuery-aware helpers" },
  '/api/cron/photos/analyze': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/photos/drive-mirror': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/photos/nas-mirror': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/documents/nas-mirror': { category: 'cross-org-by-design', reason: "cross-org cron on the owner pool; selects GCS-primary outbound documents across orgs for NAS cold mirror" },
  '/api/cron/staff-goals/history': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/zoho/orders-ingest-drain': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/ecwid/order-search': { category: 'no-db-false-positive', reason: "Ecwid REST API only; table words are response-shape vars" },
  '/api/ecwid/products/search': { category: 'no-db-false-positive', reason: "Ecwid REST API only; table words are response-shape vars" },
  '/api/integrations/google-drive/callback': { category: 'cross-org-by-design', reason: "OAuth callback with no session; org recovered from the encrypted state payload (upsertIntegrationCredentials)" },
  '/api/integrations/google-drive/connect': { category: 'no-db-false-positive', reason: "builds the OAuth redirect, encrypts org into state; no query" },
  '/api/integrations/google-drive/health': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/manual-server/by-item': { category: 'no-db-false-positive', reason: "external manual-server HTTP fetch; no DB" },
  '/api/manual-server/unassigned': { category: 'no-db-false-positive', reason: "external manual-server HTTP fetch; no DB" },
  '/api/nas-config': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/nas-dev/[[...path]]': { category: 'no-db-false-positive', reason: "reads the SMB share over the network; no DB query" },
  '/api/nas-target/[target]/[[...path]]': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/shipping/mark-staged': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
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
  '/api/shipping/track/register': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/shipping/track/sync-one': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
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
  '/api/cron/feed-membership-projection': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/cron/signals/buyer-notes-heal': { category: 'cross-org-by-design', reason: "cross-org cron/webhook on the owner pool; the org is resolved or enumerated per payload/sweep (forEachActiveOrg/forEachOrg or a verified webhook), not a single ctx org" },
  '/api/mcp': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/packerlogs/counts': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/saved-views': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/photos/saved-views/[id]': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/serial-units/[id]/data-wipe': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
  '/api/studio/catalog': { category: 'helper-safe-delegation', reason: "thin handler; tenant-table work is delegated to a src/lib/** helper threaded ctx.organizationId; pool (if imported) is used only for ctx-stamped recordAudit / api-idempotency — verified: no inline tenant pool.query" },
};
