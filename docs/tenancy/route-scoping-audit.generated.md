# Route scoping audit — GENERATED

> Static scan of `src/app/api/**/route.ts`. Regenerate: `node scripts/tenancy-route-audit.mjs`.
> "touches tenant table" = the handler body word-matches a non-system table from the coverage doc.
> Risk: **critical** = mutates a tenant table with no org filter & no GUC; **high** = reads one with no
> org filter & no GUC; **medium** = has an org filter but no GUC/RLS backstop; **low** = GUC-wrapped.

## Summary

| metric | count |
|---|---|
| total route files | 1148 |
| withAuth | 831 |
| GUC-wrapped (tenantQuery/withTenantConnection/withTenantTransaction) | 889 |
| tenant-wrapped through an org-threaded helper | 828 |
| references organizationId | 1017 |
| raw @/lib/db pool import | 330 |
| drizzle / neon-http | 19 |
| uses DOGFOOD_ORG_ID / transitionalDogfoodOrgId | 6 |
| cron routes | 44 |

| risk | count |
|---|---|
| critical | 19 |
| high | 26 |
| medium | 63 |
| low | 622 |
| info | 418 |

## Routes by risk (critical + high first)

| risk | route | methods | auth | orgRef | GUC | tables touched |
|---|---|---|:-:|:-:|:-:|---|
| critical | `/api/auth/account/change-password` | POST | ✅ | — | — | memberships, accounts |
| critical | `/api/auth/account/passkey/[id]` | DELETE | — | — | — | memberships |
| critical | `/api/auth/account/passkey/register/begin` | POST | — | — | — | memberships, accounts |
| critical | `/api/auth/account/passkey/register/finish` | POST | — | — | — | memberships, types |
| critical | `/api/auth/email-login/request` | POST | ✅ | — | — | email_login_tokens, memberships, accounts |
| critical | `/api/auth/enroll/[token]` | GET/POST | — | — | — | staff_passkeys, staff |
| critical | `/api/auth/passkey/authenticate/finish` | POST | — | — | — | staff, types |
| critical | `/api/auth/passkey/register/begin` | POST | — | — | — | staff |
| critical | `/api/auth/passkey/register/finish` | POST | — | — | — | types |
| critical | `/api/auth/password-reset/request` | POST | — | — | — | accounts |
| critical | `/api/auth/pin/create` | POST | — | — | — | staff |
| critical | `/api/auth/qr/handoff/claim` | POST | — | — | — | staff |
| critical | `/api/beta/apply` | POST | — | — | — | beta_applications |
| critical | `/api/beta/waitlist` | POST | — | — | — | beta_waitlist |
| critical | `/api/brands` | GET/POST | ✅ | — | — | sku_stock |
| critical | `/api/brands/[id]` | GET/PATCH | — | — | — | sku_stock |
| critical | `/api/brands/proposals/[id]` | POST | — | — | — | sku_stock |
| critical | `/api/nas-dev/[[...path]]` | GET/PUT | — | — | — | photos |
| critical | `/api/v1/session` | POST/GET/DELETE | ✅ | — | — | memberships |
| high | `/api/admin/po-gmail/connect` | GET | ✅ | — | — | accounts |
| high | `/api/auth/account/passkey` | GET | — | — | — | memberships |
| high | `/api/auth/email-login/verify` | GET | ✅ | — | — | email_login_tokens, staff |
| high | `/api/auth/oauth/[provider]/start` | GET | — | — | — | memberships |
| high | `/api/auth/qr/status` | GET | — | — | — | staff |
| high | `/api/auth/verify-email` | GET | ✅ | — | — | email_login_tokens, account_emails, staff |
| high | `/api/beta/applications` | GET | ✅ | — | — | beta_applications |
| high | `/api/beta/spots` | GET | — | — | — | beta_waitlist |
| high | `/api/brands/[id]/products` | GET | — | — | — | sku_stock |
| high | `/api/brands/proposals` | GET | ✅ | — | — | sku_stock |
| high | `/api/cron/cleanup` | GET | — | — | — | entity_search_outbox |
| high | `/api/cron/documents/ecwid-packing-slips` | GET | — | — | — | documents |
| high | `/api/cron/documents/ensure-outbound` | GET | — | — | — | documents |
| high | `/api/cron/documents/nas-mirror` | GET | — | — | — | documents |
| high | `/api/cron/signals/buyer-notes-heal` | GET | — | — | — | ebay_accounts |
| high | `/api/cron/staff-goals/history` | GET | — | — | — | staff_goals, staff |
| high | `/api/cron/zoho/orders-ingest-drain` | GET | — | — | — | order_ingest_queue, orders |
| high | `/api/ecwid/order-search` | GET | ✅ | — | — | orders, items, sku |
| high | `/api/ecwid/products/search` | GET | ✅ | — | — | sku_stock, items, sku |
| high | `/api/manual-server/by-item` | GET | ✅ | — | — | sku_stock |
| high | `/api/manual-server/unassigned` | GET | ✅ | — | — | sku_stock |
| high | `/api/studio/catalog` | GET | ✅ | — | — | types |
| high | `/api/studio/templates` | GET | ✅ | — | — | types |
| high | `/api/studio/templates/[id]` | GET | ✅ | — | — | types |
| high | `/api/tasks/plan-files` | GET | ✅ | — | — | documents |
| high | `/api/zoho/oauth/authorize` | GET | ✅ | — | — | warehouses, accounts, items |
| medium | `/api/admin/org/delete` | POST | ✅ | ✅ | — | staff_sessions |
| medium | `/api/admin/photos/mirror` | POST | ✅ | ✅ | — | photos |
| medium | `/api/admin/po-gmail/disconnect` | POST | ✅ | ✅ | — | google_oauth_tokens |
| medium | `/api/admin/po-gmail/oauth-callback` | GET | ✅ | ✅ | — | google_oauth_tokens |
| medium | `/api/admin/po-gmail/preview-unread` | GET | ✅ | ✅ | — | messages, items |
| medium | `/api/admin/po-gmail/status` | GET | ✅ | ✅ | — | google_oauth_tokens |
| medium | `/api/ai/search` | POST | ✅ | ✅ | — | messages |
| medium | `/api/auth/account/passkey/authenticate/finish` | POST | — | ✅ | — | memberships, accounts, staff, types |
| medium | `/api/auth/account/signin` | POST | — | ✅ | — | memberships, staff |
| medium | `/api/auth/act-as-staff` | POST | — | ✅ | — | staff |
| medium | `/api/auth/pin` | POST | — | ✅ | — | staff |
| medium | `/api/auth/qr/authorize` | POST | — | ✅ | — | staff, types |
| medium | `/api/auth/session` | GET | — | ✅ | — | memberships, staff |
| medium | `/api/auth/signup` | POST | ✅ | ✅ | — | staff |
| medium | `/api/auth/staff-choice` | GET | — | ✅ | — | staff |
| medium | `/api/auth/staff-picker` | GET | — | ✅ | — | staff |
| medium | `/api/cron/photos/analyze` | GET/POST | — | ✅ | — | photos |
| medium | `/api/cron/photos/drive-mirror` | GET | — | ✅ | — | photos |
| medium | `/api/cron/photos/nas-mirror` | GET | — | ✅ | — | photos |
| medium | `/api/exceptions` | GET | ✅ | ✅ | — | types |
| medium | `/api/integrations/google-drive/callback` | GET | — | ✅ | — | photos |
| medium | `/api/integrations/google-drive/connect` | GET | ✅ | ✅ | — | accounts, photos |
| medium | `/api/integrations/google-drive/health` | GET | ✅ | ✅ | — | photos |
| medium | `/api/integrations/order-sources` | GET | ✅ | ✅ | — | orders |
| medium | `/api/mcp` | GET/POST | ✅ | ✅ | — | messages |
| medium | `/api/nas-config` | GET | ✅ | ✅ | — | photos |
| medium | `/api/nas-target/[target]/[[...path]]` | GET/PUT/DELETE | — | ✅ | — | orders |
| medium | `/api/orders/import/extract-capture` | POST | ✅ | ✅ | — | orders, sku |
| medium | `/api/orders/import/suggest-mapping` | POST | ✅ | ✅ | — | orders |
| medium | `/api/orders/intake/catalog/ecwid-categories` | GET | ✅ | ✅ | — | orders |
| medium | `/api/orders/intake/catalog/favorites` | GET/PUT | ✅ | ✅ | — | orders |
| medium | `/api/packerlogs/counts` | GET | ✅ | ✅ | — | staff |
| medium | `/api/packing/policy` | GET | ✅ | ✅ | — | sku_stock |
| medium | `/api/photos/analyze` | POST | ✅ | ✅ | — | photos |
| medium | `/api/photos/drive-backup` | GET/POST | ✅ | ✅ | — | photos |
| medium | `/api/photos/nas-backup` | GET/POST | ✅ | ✅ | — | photos |
| medium | `/api/photos/saved-views` | GET/POST | ✅ | ✅ | — | photos |
| medium | `/api/photos/saved-views/[id]` | PATCH/DELETE | — | ✅ | — | photos |
| medium | `/api/product-manuals/assign` | POST | ✅ | ✅ | — | product_manuals |
| medium | `/api/product-manuals/upsert` | POST | ✅ | ✅ | — | product_manuals |
| medium | `/api/realtime/wms-ticket` | GET | ✅ | ✅ | — | orders |
| medium | `/api/receiving-lines/incoming/email-rescan` | POST | ✅ | ✅ | — | items |
| medium | `/api/receiving/pending-check` | GET | ✅ | ✅ | — | pending_skus, sku |
| medium | `/api/serial-units/[id]/data-wipe` | POST | ✅ | ✅ | — | sku |
| medium | `/api/shipping/addresses/validate` | POST | ✅ | ✅ | — | orders |
| medium | `/api/shipping/track/register` | POST | ✅ | ✅ | — | types |
| medium | `/api/shipping/track/sync-one` | POST | ✅ | ✅ | — | types |
| medium | `/api/sku-catalog/composition/batch` | POST | ✅ | ✅ | — | sku_stock, orders |
| medium | `/api/staff/schedule/bulk` | POST | ✅ | ✅ | — | staff_availability_rules, staff_schedule_overrides, staff_weekly_schedule, staff_week_plans, staff |
| medium | `/api/studio/graph` | GET | ✅ | ✅ | — | types |
| medium | `/api/v1/reminders` | GET | ✅ | ✅ | — | staff |
| medium | `/api/walk-in/catalog` | GET | ✅ | ✅ | — | items, sku |
| medium | `/api/walk-in/customers` | GET/POST | ✅ | ✅ | — | customers |
| medium | `/api/walk-in/orders` | POST | ✅ | ✅ | — | orders |
| medium | `/api/walk-in/status` | GET | ✅ | ✅ | — | customers, locations |
| medium | `/api/walk-in/sync` | POST | ✅ | ✅ | — | orders, sku |
| medium | `/api/wms/commands` | POST | ✅ | ✅ | — | orders |
| medium | `/api/work-orders/mine` | GET | ✅ | ✅ | — | orders |
| medium | `/api/zoho/health` | GET | ✅ | ✅ | — | accounts |
| medium | `/api/zoho/items/sync` | POST/GET | ✅ | ✅ | — | items |
| medium | `/api/zoho/oauth/callback` | GET | — | ✅ | — | accounts |
| medium | `/api/zoho/purchase-orders` | GET | ✅ | ✅ | — | items, sku |
| medium | `/api/zoho/purchase-orders/sync` | POST | ✅ | ✅ | — | orders |
| low | `/api/activity/feed` | GET | ✅ | ✅ | ✅ | station_activity_logs, sku_stock_ledger, staff, sku |
| low | `/api/admin/audit` | GET | ✅ | ✅ | ✅ | auth_audit, staff |
| low | `/api/admin/fba-fnskus` | GET/POST | ✅ | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/admin/fba-fnskus/[fnsku]` | GET/PATCH/DELETE | — | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/admin/fba-fnskus/upload` | POST | ✅ | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/admin/features` | GET/POST | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/features/[id]` | GET/PATCH/DELETE | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/fix-status` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/admin/logs` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, station_activity_logs, tech_serial_numbers, packer_logs, audit_logs, staff |
| low | `/api/admin/org/export` | POST | ✅ | ✅ | ✅ | organization_feature_flags, staff_sessions, staff |
| low | `/api/admin/organization/settings` | GET/PATCH | ✅ | ✅ | ✅ | photos |
| low | `/api/admin/photos/stats` | GET | ✅ | ✅ | ✅ | photo_analysis, photo_storage, photo_jobs, photos |
| low | `/api/admin/po-gmail/create-zoho-draft/[id]` | POST | ✅ | ✅ | ✅ | email_missing_purchase_orders, items |
| low | `/api/admin/po-gmail/missing-orders` | GET/PATCH | ✅ | ✅ | ✅ | email_missing_purchase_orders, orders, items |
| low | `/api/admin/po-gmail/triage` | GET | ✅ | ✅ | ✅ | email_missing_purchase_orders, items |
| low | `/api/admin/po-gmail/triage/[id]` | PATCH | — | ✅ | ✅ | email_missing_purchase_orders |
| low | `/api/admin/po-gmail/triage/[id]/detail` | GET | — | ✅ | ✅ | email_missing_purchase_orders, zoho_po_mirror, messages |
| low | `/api/admin/po-gmail/triage/[id]/extract` | POST | — | ✅ | ✅ | email_missing_purchase_orders, messages |
| low | `/api/admin/po-mirror/health` | GET | ✅ | ✅ | ✅ | email_missing_purchase_orders, zoho_po_mirror, sync_cursors |
| low | `/api/admin/roles` | GET/POST | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/roles/[id]` | GET/PATCH/DELETE | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/sessions` | GET | ✅ | ✅ | ✅ | staff_sessions, staff |
| low | `/api/admin/staff` | GET/POST | ✅ | ✅ | ✅ | staff_passkeys, staff |
| low | `/api/admin/staff/[id]` | PATCH/DELETE | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/[id]/detail` | GET | ✅ | ✅ | ✅ | staff_passkeys, staff_sessions, auth_audit, staff |
| low | `/api/admin/staff/[id]/mobile-display-config` | PATCH | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/[id]/passkeys` | GET | ✅ | ✅ | ✅ | staff_passkeys, staff |
| low | `/api/admin/staff/[id]/passkeys/[pid]` | DELETE | ✅ | ✅ | ✅ | staff_passkeys, staff |
| low | `/api/admin/staff/[id]/permissions` | PATCH | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/[id]/reset-pin` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/[id]/roles` | GET/PUT | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/[id]/sessions` | GET/DELETE | ✅ | ✅ | ✅ | staff_sessions, staff |
| low | `/api/admin/staff/[id]/set-pin` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/[id]/stations` | GET/PUT | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/deactivate` | POST | ✅ | ✅ | ✅ | staff_sessions, staff |
| low | `/api/admin/staff/invite` | POST | ✅ | ✅ | ✅ | staff_enrollments, staff |
| low | `/api/admin/staff/list` | GET | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/reorder` | PATCH | ✅ | ✅ | ✅ | staff |
| low | `/api/admin/staff/update` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/allocation/auto` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/amazon/accounts` | GET/DELETE | ✅ | ✅ | ✅ | amazon_accounts, accounts |
| low | `/api/amazon/connect` | POST | ✅ | ✅ | ✅ | amazon_accounts, accounts |
| low | `/api/amazon/health` | GET | ✅ | ✅ | ✅ | accounts |
| low | `/api/amazon/oauth/callback` | GET | — | ✅ | ✅ | amazon_accounts, accounts |
| low | `/api/assignments/next` | GET | ✅ | ✅ | ✅ | work_assignments |
| low | `/api/assignments/sku-search` | GET/POST | ✅ | ✅ | ✅ | work_assignments, sku_stock, items, staff, sku |
| low | `/api/assistant/chat` | POST | ✅ | ✅ | ✅ | sku_stock, items, staff, types, sku |
| low | `/api/assistant/mutations` | GET | ✅ | ✅ | ✅ | agent_mutations |
| low | `/api/audit-log/packing` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/audit-log/receiving` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/audit-log/report` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, replenishment_requests, station_activity_logs, receiving_line_zoho, tech_serial_numbers, inventory_events +5 |
| low | `/api/audit-log/sku` | GET | ✅ | ✅ | ✅ | items, sku |
| low | `/api/audit-log/staff` | GET | ✅ | ✅ | ✅ | staff |
| low | `/api/audit-log/staff-directory` | GET | ✅ | ✅ | ✅ | station_activity_logs, audit_logs, staff |
| low | `/api/audit-log/tech` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/audit/sku/[sku]` | GET | — | ✅ | ✅ | sku |
| low | `/api/auth/invitation/accept` | GET/POST | — | ✅ | ✅ | memberships, staff |
| low | `/api/auth/oauth/[provider]/callback` | GET/POST | — | — | ✅ | memberships, accounts, staff |
| low | `/api/auth/password-reset/confirm` | POST | — | ✅ | ✅ | memberships, accounts, staff |
| low | `/api/auth/signin` | POST | — | — | ✅ | staff |
| low | `/api/auth/sso/callback` | GET | ✅ | ✅ | ✅ | memberships, accounts, staff |
| low | `/api/auth/step-up` | POST | — | ✅ | ✅ | types |
| low | `/api/auth/switch` | POST | — | ✅ | ✅ | staff |
| low | `/api/auth/switch-org` | POST | — | ✅ | ✅ | memberships, staff |
| low | `/api/automations/listing-assign` | GET/POST | ✅ | ✅ | ✅ | orders |
| low | `/api/automations/rules` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/billing/webhook` | POST | — | ✅ | ✅ | items |
| low | `/api/bose-models` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/call-events` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/catalog/platform-accounts` | GET/POST | ✅ | ✅ | ✅ | accounts |
| low | `/api/catalog/platform-accounts/[id]` | PATCH/DELETE | — | ✅ | ✅ | accounts |
| low | `/api/catalog/platforms` | GET/POST | ✅ | ✅ | ✅ | platforms |
| low | `/api/catalog/platforms/[id]` | PATCH/DELETE | — | ✅ | ✅ | platforms |
| low | `/api/catalog/types` | GET/POST | ✅ | ✅ | ✅ | types |
| low | `/api/catalog/types/[id]` | PATCH/DELETE | — | ✅ | ✅ | types |
| low | `/api/check-tracking` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, work_assignments, packer_logs, orders |
| low | `/api/cron/feed-membership-projection` | GET | — | — | ✅ | feed_memberships, orders, sku |
| low | `/api/cron/inventory/drift-check` | GET | — | — | ✅ | stock_alerts, sku |
| low | `/api/cron/orders/backfill` | GET | — | — | ✅ | orders |
| low | `/api/cron/sku-catalog/refresh-suggestions` | GET | — | — | ✅ | sku_catalog |
| low | `/api/cron/stock-alerts` | GET | — | — | ✅ | bin_contents, stock_alerts, sku |
| low | `/api/cron/zoho/fulfillment-sync` | GET | — | — | ✅ | zoho_fulfillment_sync |
| low | `/api/cron/zoho/po-sync` | GET | — | — | ✅ | email_missing_purchase_orders, zoho_po_mirror |
| low | `/api/custom-fields/defs` | GET/POST | ✅ | ✅ | ✅ | items, types |
| low | `/api/custom-fields/values` | POST | — | ✅ | ✅ | types |
| low | `/api/customers` | POST | ✅ | ✅ | ✅ | customers, orders |
| low | `/api/customers/[id]` | GET/PATCH | ✅ | ✅ | ✅ | customers, orders |
| low | `/api/customers/[id]/stats` | GET | — | ✅ | ✅ | customers, orders |
| low | `/api/customers/search` | GET | ✅ | ✅ | ✅ | customers, orders |
| low | `/api/cycle-counts/campaigns` | GET/POST | ✅ | ✅ | ✅ | cycle_count_campaigns, cycle_count_lines, bin_contents, locations, sku |
| low | `/api/cycle-counts/campaigns/[id]` | GET/PATCH | — | ✅ | ✅ | cycle_count_campaigns, cycle_count_lines, locations, sku_stock, sku |
| low | `/api/cycle-counts/lines/[id]` | PATCH | — | ✅ | ✅ | cycle_count_campaigns, cycle_count_lines, sku |
| low | `/api/daily-checks` | GET | ✅ | ✅ | ✅ | staff |
| low | `/api/daily-checks/items` | POST/PATCH/DELETE | ✅ | ✅ | ✅ | staff |
| low | `/api/daily-checks/items/[id]/links` | GET/POST/DELETE | ✅ | ✅ | ✅ | items, types |
| low | `/api/daily-checks/mark` | POST/DELETE | ✅ | ✅ | ✅ | staff |
| low | `/api/dashboard/operations` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, station_activity_logs, work_assignments, testing_results, repair_service, orders +1 |
| low | `/api/debug-tracking` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, work_assignments, packer_logs, orders |
| low | `/api/documents/[id]` | PATCH/DELETE | — | ✅ | ✅ | documents, orders |
| low | `/api/documents/[id]/content` | GET | — | ✅ | ✅ | documents, orders, photos, types |
| low | `/api/documents/download-zip` | GET | — | ✅ | ✅ | documents, orders |
| low | `/api/ebay/accounts` | GET/PUT/DELETE | ✅ | ✅ | ✅ | ebay_accounts, accounts |
| low | `/api/ebay/callback` | GET | — | ✅ | ✅ | platform_accounts, ebay_accounts |
| low | `/api/ebay/health` | GET | ✅ | ✅ | ✅ | accounts |
| low | `/api/ebay/search` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, tech_serial_numbers, work_assignments, orders, sku |
| low | `/api/ecwid/recent-repair-orders` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, orders, items, sku |
| low | `/api/ecwid/sync-exception-tracking` | POST | ✅ | ✅ | ✅ | orders_exceptions, orders, items, sku |
| low | `/api/failure-modes` | GET/POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/failure-modes/[id]` | PATCH/DELETE | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/favorites` | GET/POST | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/favorites/[id]` | PATCH/DELETE | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/fba/board` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, fba_fnskus, sku |
| low | `/api/fba/board/[fnsku]/entries` | GET | — | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, fba_fnskus, sku |
| low | `/api/fba/fnsku-scan` | POST | ✅ | ✅ | ✅ | fba_shipment_items, fba_fnsku_logs, fba_shipments, fba_fnskus, orders, staff +1 |
| low | `/api/fba/fnskus` | POST | ✅ | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/fba/fnskus/[fnsku]` | PATCH/GET | — | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/fba/fnskus/bulk` | POST | ✅ | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/fba/fnskus/search` | GET | ✅ | ✅ | ✅ | fba_fnskus, items, sku |
| low | `/api/fba/fnskus/validate` | GET | ✅ | ✅ | ✅ | fba_fnskus, sku |
| low | `/api/fba/items/[id]/link-unit` | POST | ✅ | ✅ | ✅ | fba_shipment_item_units, fba_shipment_items, serial_units, fba_fnskus, sku |
| low | `/api/fba/items/queue` | GET | ✅ | ✅ | ✅ | fba_shipment_items, fba_shipments, fba_fnskus, items, staff, sku |
| low | `/api/fba/items/ready` | POST | ✅ | ✅ | ✅ | fba_shipment_items, fba_fnsku_logs, fba_shipments, items, staff |
| low | `/api/fba/items/scan` | POST | ✅ | ✅ | ✅ | fba_shipment_items, fba_fnsku_logs, fba_shipments, items, staff, sku |
| low | `/api/fba/labels/bind` | POST | ✅ | ✅ | ✅ | fba_shipment_items, fba_fnsku_logs, fba_shipments, staff |
| low | `/api/fba/logs` | GET/POST | ✅ | ✅ | ✅ | fba_fnsku_logs, fba_shipments, fba_fnskus, staff, sku |
| low | `/api/fba/logs/[id]` | GET/DELETE | — | ✅ | ✅ | fba_fnsku_logs, fba_shipments, fba_fnskus, staff, sku |
| low | `/api/fba/logs/summary` | GET | ✅ | ✅ | ✅ | tech_serial_numbers, fba_shipment_items, fba_fnsku_logs, fba_shipments, fba_fnskus, sku |
| low | `/api/fba/print-queue` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, fba_fnskus, items +1 |
| low | `/api/fba/shipments` | GET/POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, work_assignments, fba_shipments, items +2 |
| low | `/api/fba/shipments/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, staff |
| low | `/api/fba/shipments/[id]/items` | GET/POST | — | ✅ | ✅ | fba_shipment_items, fba_shipments, fba_fnskus, items, staff, sku |
| low | `/api/fba/shipments/[id]/items/[itemId]` | GET/PATCH/DELETE | — | ✅ | ✅ | fba_tracking_item_allocations, fba_shipment_items, fba_fnsku_logs, fba_shipments, items, staff +1 |
| low | `/api/fba/shipments/[id]/items/[itemId]/reassign` | PATCH | — | ✅ | ✅ | fba_shipment_items, fba_shipments, items |
| low | `/api/fba/shipments/[id]/ship-units` | POST | ✅ | ✅ | ✅ | fba_shipment_item_units, fba_shipment_items, inventory_events, sku_stock_ledger, serial_units, fba_fnskus +1 |
| low | `/api/fba/shipments/[id]/trace` | GET | — | ✅ | ✅ | fba_shipment_item_units, fba_shipment_tracking, fba_shipment_items, inventory_events, fba_shipments, serial_units +5 |
| low | `/api/fba/shipments/[id]/tracking` | GET/POST/PATCH/DELETE | — | ✅ | ✅ | fba_tracking_item_allocations, shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items |
| low | `/api/fba/shipments/active-with-details` | GET | ✅ | ✅ | ✅ | fba_tracking_item_allocations, shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, fba_fnskus +3 |
| low | `/api/fba/shipments/close` | POST | ✅ | ✅ | ✅ | fba_shipment_items, fba_fnsku_logs, fba_shipments, staff |
| low | `/api/fba/shipments/mark-shipped` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, items |
| low | `/api/fba/shipments/split-for-paired-review` | POST | ✅ | ✅ | ✅ | fba_tracking_item_allocations, shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments |
| low | `/api/fba/shipments/today` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, fba_shipments, fba_fnskus, items +2 |
| low | `/api/fba/shipments/today/duplicate-yesterday` | POST | ✅ | ✅ | ✅ | fba_shipment_items, work_assignments, fba_shipments, items, sku |
| low | `/api/fba/shipments/today/items` | POST | ✅ | ✅ | ✅ | fba_shipment_items, work_assignments, fba_shipments, fba_fnskus, items, sku |
| low | `/api/fba/stage-counts` | GET | ✅ | ✅ | ✅ | fba_shipment_items |
| low | `/api/forge/ingest` | POST | ✅ | ✅ | ✅ | cycle_forge_run_steps, cycle_forge_runs |
| low | `/api/forge/runs` | GET | ✅ | ✅ | ✅ | cycle_forge_run_steps, cycle_forge_runs |
| low | `/api/get-title-by-sku` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, sku_stock, items, sku |
| low | `/api/google-sheets/execute-script` | POST | ✅ | ✅ | ✅ | tech_serial_numbers, orders_exceptions, packer_logs, orders |
| low | `/api/handling-units` | GET/POST | ✅ | ✅ | ✅ | handling_units, items |
| low | `/api/handling-units/[id]` | GET/DELETE | ✅ | ✅ | ✅ | handling_units |
| low | `/api/handling-units/bulk` | POST | ✅ | ✅ | ✅ | handling_units |
| low | `/api/identification/jobs/[jobId]` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/identify` | GET/POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/imports/rows` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/imports/runs` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/imports/runs/[id]` | GET | — | ✅ | ✅ | orders |
| low | `/api/inbox/support` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/inbox/tech-queue` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/integrations/[provider]/sync` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/integrations/nextiva/webhook/[token]` | POST | ✅ | ✅ | ✅ | voicemails |
| low | `/api/inventory-events` | GET | ✅ | ✅ | ✅ | serial_units, sku_catalog, locations, sku_stock, staff, sku |
| low | `/api/inventory-photos` | POST | ✅ | ✅ | ✅ | inventory_events, photos, sku |
| low | `/api/inventory/alerts` | GET | ✅ | ✅ | ✅ | stock_alerts, locations, sku_stock, items, sku |
| low | `/api/inventory/alerts/[id]/ack` | POST | ✅ | ✅ | ✅ | stock_alerts, sku |
| low | `/api/inventory/bins-overview` | GET | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/inventory/counts` | GET | ✅ | ✅ | ✅ | cycle_count_campaigns, cycle_count_lines, items |
| low | `/api/inventory/items/search` | GET | ✅ | ✅ | ✅ | sku_stock, items, sku |
| low | `/api/inventory/parts-graph` | GET | ✅ | ✅ | ✅ | catalog_external_ids, part_links, sku_stock, items, sku |
| low | `/api/inventory/parts/links` | POST | ✅ | ✅ | ✅ | sku_stock, items |
| low | `/api/inventory/parts/links/[id]` | DELETE | — | ✅ | ✅ | sku_stock |
| low | `/api/inventory/parts/links/not-a-part` | POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/inventory/sku-search` | GET | ✅ | ✅ | ✅ | product_brands, bin_contents, sku_catalog, sku_stock, sku |
| low | `/api/inventory/units` | GET | ✅ | ✅ | ✅ | serial_units, sku_catalog, sku_stock, items, sku |
| low | `/api/kiosk/intake` | POST | — | ✅ | ✅ | types, sku |
| low | `/api/kiosk/local-pickup` | GET/POST | — | ✅ | ✅ | suppliers, staff |
| low | `/api/kiosk/price-approval` | POST | — | ✅ | ✅ | types |
| low | `/api/kiosk/repair/[id]/label-printed` | POST | — | ✅ | ✅ | repair_service |
| low | `/api/kiosk/repair/issues` | GET/POST | — | ✅ | ✅ | sku |
| low | `/api/kiosk/staff-for-stepup` | GET | — | ✅ | ✅ | staff |
| low | `/api/kiosk/visit/[id]/label-printed` | POST | — | ✅ | ✅ | repair_service |
| low | `/api/kiosk/visit/[id]/receipt` | GET | — | ✅ | ✅ | staff |
| low | `/api/label-manifests` | POST | ✅ | ✅ | ✅ | items, sku |
| low | `/api/labels` | GET/PUT/DELETE | ✅ | ✅ | ✅ | types |
| low | `/api/labels/recent` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/local-pickup-orders` | GET/POST | ✅ | ✅ | ✅ | local_pickup_order_items, local_pickup_orders, orders, items, staff, sku |
| low | `/api/local-pickup-orders/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | local_pickup_order_items, local_pickup_orders, sku_catalog, orders, items, staff +1 |
| low | `/api/local-pickup-orders/[id]/complete` | POST | — | ✅ | ✅ | local_pickup_orders, orders |
| low | `/api/local-pickup-orders/[id]/finalize` | POST | — | ✅ | ✅ | local_pickup_order_items, local_pickup_orders, orders, items, sku |
| low | `/api/local-pickup-orders/[id]/items` | POST | — | ✅ | ✅ | local_pickup_order_items, local_pickup_orders, orders, items, sku |
| low | `/api/local-pickup-orders/[id]/items/[itemId]` | PATCH/DELETE | — | ✅ | ✅ | local_pickup_order_items, local_pickup_orders, orders, items, sku |
| low | `/api/local-pickup-orders/[id]/reopen` | POST | — | ✅ | ✅ | local_pickup_orders, orders |
| low | `/api/local-pickup-orders/[id]/void` | POST | — | ✅ | ✅ | local_pickup_orders, orders |
| low | `/api/local-pickup-orders/lines` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/local-pickups` | GET/POST/PATCH/DELETE | ✅ | ✅ | ✅ | local_pickup_items, receiving_carton, receiving_triage, sku_platform_ids, work_assignments, sku_catalog +1 |
| low | `/api/locations` | GET/POST | ✅ | ✅ | ✅ | locations, sku_stock |
| low | `/api/locations/[barcode]` | GET/PATCH/DELETE | — | ✅ | ✅ | locations, sku_stock, sku |
| low | `/api/locations/[barcode]/pair-candidates` | GET | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/locations/[barcode]/properties` | PATCH | — | ✅ | ✅ | locations, sku_stock |
| low | `/api/locations/[barcode]/swap` | POST | — | ✅ | ✅ | bin_contents, locations, sku |
| low | `/api/manual-server/assign` | POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/manuals/recent` | GET | — | ✅ | ✅ | sku_platform_ids, product_manuals, sku_catalog, sku |
| low | `/api/manuals/resolve` | GET | ✅ | ✅ | ✅ | sku_platform_ids, product_manuals, sku_catalog, sku_stock, sku |
| low | `/api/manuals/upsert` | POST | ✅ | ✅ | ✅ | sku_platform_ids, product_manuals, sku_catalog, sku_stock, sku |
| low | `/api/nav` | GET/PUT | ✅ | ✅ | ✅ | nav_definitions |
| low | `/api/need-to-order` | GET | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/need-to-order/[id]` | PATCH/DELETE | — | ✅ | ✅ | staff |
| low | `/api/operations/benchmarks` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/operations/journey` | GET | ✅ | ✅ | ✅ | types |
| low | `/api/operations/kpi-table` | GET | — | ✅ | ✅ | operations_kpi_rollups_hourly, operations_kpi_rollups_daily, station_activity_logs, audit_logs, staff |
| low | `/api/operations/reconciliation` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/operations/roi` | GET | ✅ | ✅ | ✅ | workflow_node_stats, workflow_runs, orders |
| low | `/api/ops-plans/inbox` | GET | ✅ | ✅ | ✅ | orders, items |
| low | `/api/order-amendments/[id]/decision` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/order-labels` | GET/POST/DELETE | ✅ | ✅ | ✅ | documents, orders, types |
| low | `/api/orders` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders-exceptions/[id]` | PATCH | — | ✅ | ✅ | orders |
| low | `/api/orders-exceptions/delete` | POST | ✅ | ✅ | ✅ | orders_exceptions, orders |
| low | `/api/orders-exceptions/sync` | POST | ✅ | ✅ | ✅ | orders_exceptions, orders |
| low | `/api/orders/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/acknowledge` | POST/DELETE | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/allocate` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/[id]/amazon-refresh` | POST | — | ✅ | ✅ | orders, sku |
| low | `/api/orders/[id]/amendments` | GET | ✅ | ✅ | ✅ | order_unit_amendments, serial_units, orders, staff |
| low | `/api/orders/[id]/buyer` | PATCH | — | ✅ | ✅ | customers, orders |
| low | `/api/orders/[id]/buyer-note/ack` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/[id]/cage-release` | GET/POST | — | ✅ | ✅ | orders, sku |
| low | `/api/orders/[id]/carrier-events` | GET | — | ✅ | ✅ | shipping_tracking_numbers, shipment_tracking_events, orders |
| low | `/api/orders/[id]/documents` | GET/POST | — | ✅ | ✅ | documents, orders |
| low | `/api/orders/[id]/documents/fetch` | POST | — | ✅ | ✅ | documents, orders, types |
| low | `/api/orders/[id]/documents/print` | POST | — | ✅ | ✅ | documents, orders, types |
| low | `/api/orders/[id]/documents/upload` | POST | — | ✅ | ✅ | documents, orders, types |
| low | `/api/orders/[id]/flag` | PUT | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/label-purchase` | GET | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/labels` | GET/POST | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/labels/[labelId]` | DELETE | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/labels/[labelId]/pdf` | GET | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/labels/[labelId]/ticket` | POST/DELETE | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/manuals` | GET/POST | — | ✅ | ✅ | product_manuals, orders |
| low | `/api/orders/[id]/manuals/[manualId]` | PATCH/DELETE | — | ✅ | ✅ | product_manuals, orders |
| low | `/api/orders/[id]/notes` | GET/POST | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/pack-checklist` | GET | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/orders/[id]/packing-checks` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/orders/[id]/pick-tasks` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/[id]/possible-duplicates` | GET | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/price-breakdown` | GET | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/release` | POST | ✅ | ✅ | ✅ | order_unit_allocations, serial_units, orders, sku |
| low | `/api/orders/[id]/substitute` | POST | ✅ | ✅ | ✅ | serial_units, orders, sku |
| low | `/api/orders/[id]/timeline` | GET | — | ✅ | ✅ | shipping_tracking_numbers, order_unit_allocations, station_activity_logs, tech_serial_numbers, rma_authorizations, inventory_events +12 |
| low | `/api/orders/[id]/tracking` | POST/PATCH/DELETE | — | ✅ | ✅ | orders |
| low | `/api/orders/[id]/tracking-history` | GET | — | ✅ | ✅ | orders |
| low | `/api/orders/add` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/assign` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, orders, staff, sku |
| low | `/api/orders/backfill/ebay` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, ebay_accounts, accounts, orders, sku |
| low | `/api/orders/backfill/ecwid` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, orders, items, sku |
| low | `/api/orders/backfill/ecwid-price` | POST | ✅ | ✅ | ✅ | orders, sku |
| low | `/api/orders/batch` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, tech_serial_numbers, packer_logs, orders, staff, sku |
| low | `/api/orders/bulk-flag` | POST | — | ✅ | ✅ | orders |
| low | `/api/orders/caged` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/check-shipped` | POST | ✅ | ✅ | ✅ | station_activity_logs, orders |
| low | `/api/orders/delete` | POST | ✅ | ✅ | ✅ | orders, sku |
| low | `/api/orders/desk-counts` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/exceptions` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/import-csv` | POST | ✅ | ✅ | ✅ | orders, sku |
| low | `/api/orders/intake/assignees` | POST | ✅ | ✅ | ✅ | orders, sku |
| low | `/api/orders/intake/catalog/ecwid-products` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/intake/ecwid-orders` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/intake/order-number` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/intake/products` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/intake/square-invoices` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/intake/square-invoices/link` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/intake/square-invoices/payment` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/integrity-check` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, orders, sku |
| low | `/api/orders/lookup/[orderId]` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, tech_serial_numbers, work_assignments, order_notes, customers, orders +2 |
| low | `/api/orders/missing-parts` | POST | ✅ | ✅ | ✅ | orders, staff, sku |
| low | `/api/orders/next` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, work_assignments, orders, staff, sku |
| low | `/api/orders/notes/bulk` | POST | — | ✅ | ✅ | orders |
| low | `/api/orders/pack-placement` | GET | ✅ | ✅ | ✅ | locations, orders |
| low | `/api/orders/pack-placement/move` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, orders |
| low | `/api/orders/payments` | GET/POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/payments/cancel` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/payments/methods` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/price` | PUT | — | ✅ | ✅ | orders |
| low | `/api/orders/print-packet` | POST/GET | ✅ | ✅ | ✅ | documents, orders, items |
| low | `/api/orders/queue-counts` | GET | ✅ | ✅ | ✅ | orders, staff |
| low | `/api/orders/recent` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, station_activity_logs, work_assignments, product_manuals, orders, staff +1 |
| low | `/api/orders/set-item-number` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/orders/verify` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, packer_logs, orders |
| low | `/api/org/accounts/merge` | POST | ✅ | ✅ | ✅ | memberships, accounts, staff |
| low | `/api/org/invitations` | POST/GET | ✅ | ✅ | ✅ | memberships |
| low | `/api/pack/ship` | POST | ✅ | ✅ | ✅ | order_unit_allocations, order_unit_amendments, inventory_events, sku_stock_ledger, serial_units, orders +1 |
| low | `/api/packerlogs` | GET/POST/PUT/DELETE | ✅ | ✅ | ✅ | orders, photos, staff, types |
| low | `/api/packing-logs` | GET/POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, fba_shipment_tracking, fba_shipment_items, sku_platform_ids, work_assignments, fba_shipments +9 |
| low | `/api/packing-logs/draft` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, orders, staff |
| low | `/api/packing-logs/history` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, photo_entity_links, packer_logs, orders, photos, sku |
| low | `/api/packing-logs/save-photo` | POST | ✅ | ✅ | ✅ | photos, types |
| low | `/api/packing-logs/update` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, photo_entity_links, sku_stock_ledger, work_assignments, packer_logs, orders +3 |
| low | `/api/packing-photos` | GET/DELETE | ✅ | ✅ | ✅ | photos |
| low | `/api/packing-photos/counts` | GET | ✅ | ✅ | ✅ | photos |
| low | `/api/packing/verification/queue` | GET | ✅ | ✅ | ✅ | types |
| low | `/api/part-compatibility` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/payroll/settings` | GET/PATCH | ✅ | ✅ | ✅ | payroll_settings |
| low | `/api/pending-skus` | GET/PATCH | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/photos/[id]` | DELETE | — | ✅ | ✅ | photo_entity_links, sku_stock, photos |
| low | `/api/photos/[id]/aspect` | PATCH | — | ✅ | ✅ | photos |
| low | `/api/photos/[id]/claim-stage` | PATCH | — | ✅ | ✅ | photos |
| low | `/api/photos/[id]/content` | GET | — | ✅ | ✅ | photos, staff |
| low | `/api/photos/[id]/context` | GET | — | ✅ | ✅ | photos |
| low | `/api/photos/[id]/labels` | GET/PUT | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/[id]/reassign` | PATCH | — | ✅ | ✅ | photos |
| low | `/api/photos/download-zip` | GET | — | ✅ | ✅ | photo_entity_links, photos |
| low | `/api/photos/image-types` | GET/POST | ✅ | ✅ | ✅ | photos, types |
| low | `/api/photos/labels` | GET/POST | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/labels/[id]` | PATCH/DELETE | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/labels/bulk-apply` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/library` | GET | ✅ | ✅ | ✅ | documents, photos, items |
| low | `/api/photos/library/folders` | GET | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/library/ids` | GET | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/links` | POST | ✅ | ✅ | ✅ | photos, types |
| low | `/api/photos/listing-gallery` | GET/POST/PATCH/DELETE | ✅ | ✅ | ✅ | photos, items, sku |
| low | `/api/photos/share` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/share-packs` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/share-packs/[token]` | GET | — | ✅ | ✅ | photos |
| low | `/api/photos/share-packs/[token]/zip` | GET | — | ✅ | ✅ | photos |
| low | `/api/photos/upload` | POST | ✅ | ✅ | ✅ | photos, types |
| low | `/api/photos/upload/video` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/upload/video/[id]/finalize` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/photos/videos/[id]` | DELETE | — | ✅ | ✅ | photos |
| low | `/api/photos/videos/[id]/content` | GET | ✅ | ✅ | ✅ | photos |
| low | `/api/picking/desk/delete` | POST | ✅ | ✅ | ✅ | station_activity_logs, tech_serial_numbers, orders |
| low | `/api/picking/desk/logs/counts` | GET | ✅ | ✅ | ✅ | station_activity_logs |
| low | `/api/picking/desk/scan` | POST | ✅ | ✅ | ✅ | orders_exceptions, documents, orders, staff |
| low | `/api/picking/desk/serial` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, station_activity_logs, tech_serial_numbers, fba_fnsku_logs, orders |
| low | `/api/picking/desk/sku` | POST | ✅ | ✅ | ✅ | sku_stock_ledger, sku_stock, orders, staff, sku |
| low | `/api/picking/desk/unpick` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/picking/units/scan` | POST | ✅ | ✅ | ✅ | order_unit_allocations, inventory_events, serial_units, orders, sku |
| low | `/api/picking/units/unscan` | POST | ✅ | ✅ | ✅ | serial_units, orders |
| low | `/api/post-multi-sn` | POST | ✅ | ✅ | ✅ | station_activity_logs, tech_serial_numbers, label_print_jobs, sku |
| low | `/api/print/dispatch` | POST | ✅ | ✅ | ✅ | printer_profiles, sku |
| low | `/api/product-manuals` | GET/POST/PATCH/DELETE | ✅ | ✅ | ✅ | product_manuals, sku_stock, sku |
| low | `/api/product-manuals/bulk` | POST | ✅ | ✅ | ✅ | product_manuals, sku_catalog |
| low | `/api/product-manuals/by-category` | GET | ✅ | ✅ | ✅ | product_manuals, sku_catalog, sku_stock, sku |
| low | `/api/product-manuals/rename-folder` | POST | ✅ | ✅ | ✅ | product_manuals, sku_catalog |
| low | `/api/product-manuals/search` | GET | — | ✅ | ✅ | product_manuals, sku |
| low | `/api/product-manuals/sync` | POST | ✅ | ✅ | ✅ | product_manuals, items |
| low | `/api/product-manuals/thumbnail` | POST | ✅ | ✅ | ✅ | product_manuals |
| low | `/api/product-manuals/upload` | POST | ✅ | ✅ | ✅ | product_manuals, sku |
| low | `/api/products/[sku]` | GET/PATCH | — | ✅ | ✅ | product_parcel_dims, sku_platform_ids, bin_contents, serial_units, sku_catalog, platforms +4 |
| low | `/api/qc/codes` | GET/POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/qc/procedures` | GET/POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/qc/receiving-lines/open` | POST | ✅ | ✅ | ✅ | receiving_line_testing_opens |
| low | `/api/qc/recent` | GET | ✅ | ✅ | ✅ | testing_results, serial_units, staff, sku |
| low | `/api/quality/dashboard` | GET | ✅ | ✅ | ✅ | unit_quality_scores, unit_failure_tags, failure_modes, serial_units, unit_repairs, sku_stock +1 |
| low | `/api/rag/documents` | POST | ✅ | ✅ | ✅ | rag_document_chunks, rag_documents |
| low | `/api/rag/search` | POST | ✅ | ✅ | ✅ | rag_document_chunks |
| low | `/api/realtime/token` | GET/POST | ✅ | ✅ | ✅ | staff |
| low | `/api/reason-codes` | GET/POST | ✅ | ✅ | ✅ | reason_codes, sku_stock |
| low | `/api/reason-codes/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | sku_stock |
| low | `/api/receiving-entry` | POST/GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_zoho, receiving_carton, work_assignments, receiving_line |
| low | `/api/receiving-lines` | GET/POST/PATCH/DELETE | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_testing, serial_unit_provenance, station_scan_sessions, receiving_line_zoho, receiving_carton +6 |
| low | `/api/receiving-lines/[id]/ensure-catalog` | POST | ✅ | ✅ | ✅ | sku_catalog |
| low | `/api/receiving-lines/[id]/manuals` | POST/DELETE | ✅ | ✅ | ✅ | product_manuals, sku_catalog, documents |
| low | `/api/receiving-lines/[id]/qc-checks` | POST/PUT/DELETE | ✅ | ✅ | ✅ | qc_check_templates, sku |
| low | `/api/receiving-lines/[id]/testing-bundle` | GET | ✅ | ✅ | ✅ | product_manuals, sku_catalog, documents, sku |
| low | `/api/receiving-lines/counts` | GET | ✅ | ✅ | ✅ | receiving_line_testing, receiving_line, staff |
| low | `/api/receiving-lines/incoming/delivered-not-unboxed` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/receiving-lines/incoming/delivered-unscanned` | GET | ✅ | ✅ | ✅ | receiving_line_zoho, receiving_carton, receiving_line, zoho_po_mirror, items, sku |
| low | `/api/receiving-lines/incoming/details` | GET | ✅ | ✅ | ✅ | email_missing_purchase_orders, inbound_purchase_order_mirror, inbound_purchase_order_links, shipping_tracking_numbers, shipment_tracking_events, email_delivery_signals +8 |
| low | `/api/receiving-lines/incoming/inventory-refresh` | POST | ✅ | ✅ | ✅ | zoho_po_mirror |
| low | `/api/receiving-lines/incoming/marketplace-refresh` | POST | ✅ | ✅ | ✅ | accounts |
| low | `/api/receiving-lines/incoming/match-email` | POST | ✅ | ✅ | ✅ | email_missing_purchase_orders, zoho_po_mirror |
| low | `/api/receiving-lines/incoming/refresh/stream` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_zoho, receiving_carton, receiving_line, zoho_po_mirror, orders +1 |
| low | `/api/receiving-lines/incoming/summary` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_zoho, receiving_carton, receiving_scans, receiving_line, zoho_po_mirror |
| low | `/api/receiving-lines/incoming/sync-one` | POST | ✅ | ✅ | ✅ | receiving_carton |
| low | `/api/receiving-lines/incoming/todo` | GET/PATCH | ✅ | ✅ | ✅ | email_missing_purchase_orders, items |
| low | `/api/receiving-lines/qc-assignee` | PATCH | ✅ | ✅ | ✅ | orders |
| low | `/api/receiving-lines/view` | POST | ✅ | ✅ | ✅ | receiving_line_views |
| low | `/api/receiving-logs` | GET/DELETE/PATCH | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_carton, receiving_triage, receiving_scans, receiving_unbox |
| low | `/api/receiving-logs/search` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_carton |
| low | `/api/receiving-photos` | GET/POST/DELETE | ✅ | ✅ | ✅ | receiving_carton, receiving_triage, receiving_scans, photos |
| low | `/api/receiving/[id]` | GET/PATCH | — | ✅ | ✅ | shipping_tracking_numbers, receiving_line_testing, serial_unit_provenance, local_pickup_orders, receiving_line_zoho, receiving_carton +12 |
| low | `/api/receiving/[id]/amazon-return-lookup` | POST | — | ✅ | ✅ | shipping_tracking_numbers, receiving_carton |
| low | `/api/receiving/[id]/inventory-sync` | POST | — | ✅ | ✅ | receiving_carton |
| low | `/api/receiving/add-unmatched-line` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_carton, sku_platform_ids, receiving_line, repair_service, items +1 |
| low | `/api/receiving/email-po` | GET/PATCH | ✅ | ✅ | ✅ | email_missing_purchase_orders |
| low | `/api/receiving/identify-serial` | POST | ✅ | ✅ | ✅ | serial_unit_provenance, serial_units |
| low | `/api/receiving/inbound/import-csv` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/receiving/inbound/import-ebay` | POST | ✅ | ✅ | ✅ | sku |
| low | `/api/receiving/inbound/ingest-health` | GET | ✅ | ✅ | ✅ | inbound_ingest_event |
| low | `/api/receiving/inbound/orders` | POST/DELETE | ✅ | ✅ | ✅ | orders, photos |
| low | `/api/receiving/lines/[id]/advance` | POST | — | ✅ | ✅ | receiving_exceptions |
| low | `/api/receiving/lines/[id]/condition` | PATCH | ✅ | ✅ | ✅ | receiving_line_testing, receiving_line |
| low | `/api/receiving/lines/[id]/inventory-note` | PATCH | — | ✅ | ✅ | receiving_line_zoho, receiving_line, sku |
| low | `/api/receiving/lines/[id]/label-previewed` | POST | ✅ | ✅ | ✅ | receiving_line_testing, receiving_line |
| low | `/api/receiving/lines/[id]/label-printed` | POST | ✅ | ✅ | ✅ | receiving_line_testing, receiving_line |
| low | `/api/receiving/lines/[id]/loss` | POST/DELETE | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_carton, receiving_line |
| low | `/api/receiving/lines/[id]/move` | POST | — | ✅ | ✅ | inventory_events, receiving_line, serial_units, locations, sku |
| low | `/api/receiving/lines/[id]/putaway` | POST | — | ✅ | ✅ | inventory_events, receiving_line, serial_units, locations, sku |
| low | `/api/receiving/lines/[id]/putaway/reverse` | POST | — | ✅ | ✅ | inventory_events, serial_units, sku |
| low | `/api/receiving/lines/[id]/serial-absent` | POST | ✅ | ✅ | ✅ | receiving_line_testing, receiving_line |
| low | `/api/receiving/lines/[id]/stage` | POST | ✅ | ✅ | ✅ | receiving_line_putaway, receiving_line, locations |
| low | `/api/receiving/lines/[id]/status` | POST | — | ✅ | ✅ | receiving_line, serial_units, sku |
| low | `/api/receiving/lines/[id]/timeline` | GET | — | ✅ | ✅ | serial_units, locations, staff, sku |
| low | `/api/receiving/lines/[id]/units/[unitId]/condition` | PATCH | ✅ | ✅ | ✅ | receiving_line_unit, receiving_line |
| low | `/api/receiving/lines/[id]/units/[unitId]/serial-absent` | POST | ✅ | ✅ | ✅ | receiving_line_unit, receiving_line |
| low | `/api/receiving/lookup-po` | POST | ✅ | ✅ | ✅ | receiving_line_zoho, receiving_carton, receiving_triage, receiving_scans, receiving_unbox, receiving_line +4 |
| low | `/api/receiving/mark-received` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_testing, receiving_exceptions, inventory_events, receiving_carton, sku_stock_ledger +7 |
| low | `/api/receiving/mark-received-po` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, serial_unit_provenance, receiving_line_zoho, receiving_carton, receiving_unbox, receiving_line +5 |
| low | `/api/receiving/match` | POST/GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_testing, receiving_line_zoho, receiving_carton, work_assignments, receiving_line +3 |
| low | `/api/receiving/pending-unboxing` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_testing, receiving_line_zoho, receiving_carton, receiving_triage, receiving_unbox +3 |
| low | `/api/receiving/pending-work` | GET | ✅ | ✅ | ✅ | items |
| low | `/api/receiving/po-search` | GET | ✅ | ✅ | ✅ | zoho_po_mirror, sku_catalog, orders, items, sku |
| low | `/api/receiving/po/[poId]` | GET | ✅ | ✅ | ✅ | receiving_line_testing, receiving_line_zoho, receiving_carton, receiving_line, sku_catalog, photos +2 |
| low | `/api/receiving/po/[poId]/attach-box` | GET/POST | — | ✅ | ✅ | inbound_purchase_order_links, receiving_line_zoho, receiving_carton, receiving_line, zoho_po_mirror |
| low | `/api/receiving/po/list` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_line_zoho, receiving_carton, receiving_triage, receiving_line, photos +1 |
| low | `/api/receiving/rail-exclusions` | GET/POST/DELETE | ✅ | ✅ | ✅ | items |
| low | `/api/receiving/relink` | POST | ✅ | ✅ | ✅ | sku |
| low | `/api/receiving/scan-serial` | POST/DELETE | ✅ | ✅ | ✅ | receiving_line_zoho, receiving_line, sku |
| low | `/api/receiving/serials` | GET/POST/DELETE | ✅ | ✅ | ✅ | tech_serial_numbers, receiving_line |
| low | `/api/receiving/touch-scan` | POST | ✅ | ✅ | ✅ | receiving_carton, receiving_unbox, staff |
| low | `/api/receiving/triage/done` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, receiving_carton, receiving_triage, receiving_line, photos, sku |
| low | `/api/receiving/triage/metrics` | GET | ✅ | ✅ | ✅ | receiving_carton, receiving_triage, receiving_unbox |
| low | `/api/receiving/triage/staging-map` | GET | ✅ | ✅ | ✅ | receiving_carton, receiving_triage, locations |
| low | `/api/receiving/unbox-kpi` | GET | ✅ | ✅ | ✅ | staff |
| low | `/api/receiving/unfound-queue` | GET | ✅ | ✅ | ✅ | receiving_carton, receiving_unbox, ops_events, photos |
| low | `/api/receiving/unfound-queue/[kind]/[id]` | PATCH/DELETE | ✅ | ✅ | ✅ | email_missing_purchase_orders, orders_exceptions, unfound_overlay |
| low | `/api/receiving/unfound-queue/[kind]/[id]/push-to-zendesk` | POST | ✅ | ✅ | ✅ | unfound_overlay |
| low | `/api/receiving/visual-identify` | POST | ✅ | ✅ | ✅ | sku |
| low | `/api/receiving/zendesk-claim` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/receiving/zendesk-claim/archive-only` | POST | ✅ | ✅ | ✅ | receiving_line |
| low | `/api/receiving/zendesk-claim/preview` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/repair-service/[id]/customer` | POST/PUT/DELETE | — | ✅ | ✅ | customers |
| low | `/api/repair-service/[id]/photos` | GET | — | ✅ | ✅ | photos |
| low | `/api/repair-service/[id]/print-log` | GET/POST | — | ✅ | ✅ | repair_service, audit_logs, staff |
| low | `/api/repair-service/document/[id]` | GET | — | ✅ | ✅ | documents |
| low | `/api/repair-service/next` | GET | ✅ | ✅ | ✅ | work_assignments, repair_service, staff, sku |
| low | `/api/repair-service/out-of-stock` | POST | ✅ | ✅ | ✅ | work_assignments, repair_service |
| low | `/api/repair-service/pickup` | POST | ✅ | ✅ | ✅ | work_assignments, repair_service, documents |
| low | `/api/repair-service/repaired` | POST | ✅ | ✅ | ✅ | work_assignments, repair_service |
| low | `/api/repair/actions` | GET/POST | ✅ | ✅ | ✅ | sku |
| low | `/api/repair/actions/[id]` | PATCH/DELETE | ✅ | ✅ | ✅ | repair_actions, sku |
| low | `/api/repair/customers` | GET | ✅ | ✅ | ✅ | customers |
| low | `/api/repair/ecwid-products` | GET | ✅ | ✅ | ✅ | items, sku |
| low | `/api/repair/issues` | GET/POST | ✅ | ✅ | ✅ | sku |
| low | `/api/repair/square-payment-link` | POST | ✅ | ✅ | ✅ | types, sku |
| low | `/api/replenish/shipped-fifo` | GET | ✅ | ✅ | ✅ | replenishment_requests, station_activity_logs, sku_catalog, sku_stock, orders, sku |
| low | `/api/replenishment/tasks/[id]/cancel` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/replenishment/tasks/[id]/claim` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/replenishment/tasks/[id]/complete` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/replenishment/tasks/[id]/release` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/reports/bin-utilization` | GET | ✅ | ✅ | ✅ | locations |
| low | `/api/reports/dead-stock` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_stock_ledger, sku_catalog, sku_stock, sku |
| low | `/api/reports/records/export` | GET | ✅ | ✅ | ✅ | receiving_line, orders, staff, sku |
| low | `/api/reports/velocity` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_stock_ledger, sku_catalog, sku_stock, sku |
| low | `/api/returns/undo` | POST | ✅ | ✅ | ✅ | order_unit_allocations, inventory_events, sku_stock_ledger, serial_units, sku |
| low | `/api/review/catalog-link` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/review/import-exceptions` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/rma` | GET/POST | ✅ | ✅ | ✅ | staff |
| low | `/api/rma/[id]/close` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/rma/[id]/disposition` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/rma/[id]/mark-received` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/rma/disposition` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/rooms` | GET/POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/rooms/[room]` | PATCH/DELETE | — | ✅ | ✅ | sku_stock |
| low | `/api/rooms/reorder` | POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/scan-tracking` | POST | ✅ | ✅ | ✅ | shipping_tracking_numbers, orders_exceptions, orders |
| low | `/api/scan/history` | GET | ✅ | ✅ | ✅ | mobile_scan_events, sku_stock, staff |
| low | `/api/scan/resolve` | GET/POST | ✅ | ✅ | ✅ | tech_serial_numbers, mobile_scan_events, receiving_carton, sku_catalog, sku_stock, orders +1 |
| low | `/api/serial-units/[id]` | GET | — | ✅ | ✅ | serial_unit_condition_history, order_unit_allocations, station_activity_logs, tech_serial_numbers, inventory_events, serial_units +8 |
| low | `/api/serial-units/[id]/allocate` | POST | ✅ | ✅ | ✅ | order_unit_allocations, serial_units, orders, sku |
| low | `/api/serial-units/[id]/checklist` | GET/POST | ✅ | ✅ | ✅ | qc_check_templates, tech_verifications, serial_units, sku_catalog, staff, sku |
| low | `/api/serial-units/[id]/checklist/bulk` | POST | ✅ | ✅ | ✅ | qc_check_templates, tech_verifications, serial_units, sku_catalog, staff |
| low | `/api/serial-units/[id]/failure-tags` | GET/POST/PATCH | ✅ | ✅ | ✅ | unit_failure_tags, serial_units, sku_stock |
| low | `/api/serial-units/[id]/grade` | POST | ✅ | ✅ | ✅ | serial_unit_condition_history, inventory_events, serial_units, types, sku |
| low | `/api/serial-units/[id]/hold` | POST | ✅ | ✅ | ✅ | serial_units, sku_stock |
| low | `/api/serial-units/[id]/move` | POST | ✅ | ✅ | ✅ | serial_units, locations, sku |
| low | `/api/serial-units/[id]/photos` | GET/POST | ✅ | ✅ | ✅ | serial_units, sku_stock, photos, types, sku |
| low | `/api/serial-units/[id]/quality` | GET | ✅ | ✅ | ✅ | serial_units, sku_stock |
| low | `/api/serial-units/[id]/release` | POST | ✅ | ✅ | ✅ | serial_units, sku_stock |
| low | `/api/serial-units/[id]/test` | POST | ✅ | ✅ | ✅ | sku |
| low | `/api/serial-units/[id]/timeline-photos` | GET | ✅ | ✅ | ✅ | serial_units, sku_stock, photos |
| low | `/api/serial-units/lookup` | GET | ✅ | ✅ | ✅ | sku |
| low | `/api/settings` | GET/PUT | ✅ | ✅ | ✅ | items, staff |
| low | `/api/shifts` | GET | ✅ | ✅ | ✅ | shifts, staff |
| low | `/api/shifts/[id]/cover` | POST | — | ✅ | ✅ | staff_sessions, shifts, staff |
| low | `/api/shipments/[id]/documents` | GET | — | ✅ | ✅ | documents |
| low | `/api/shipments/[id]/resolve-exception` | POST | — | ✅ | ✅ | orders |
| low | `/api/shipped` | GET/PATCH | ✅ | ✅ | ✅ | orders, staff, sku |
| low | `/api/shipped/[id]` | GET | — | ✅ | ✅ | orders |
| low | `/api/shipped/debug` | GET | ✅ | ✅ | ✅ | shipping_tracking_numbers, packer_logs, orders |
| low | `/api/shipped/lookup-order` | GET | — | ✅ | ✅ | shipping_tracking_numbers, orders |
| low | `/api/shipped/scan-out` | POST/GET/DELETE | ✅ | ✅ | ✅ | shipping_tracking_numbers, station_activity_logs, receiving_carton, sku_catalog, orders, photos +3 |
| low | `/api/shipped/search` | GET/POST | ✅ | ✅ | ✅ | orders |
| low | `/api/shipped/submit` | POST | ✅ | ✅ | ✅ | orders, sku |
| low | `/api/shipping/label-intake/pair` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/shipping/labels` | POST | ✅ | ✅ | ✅ | audit_logs |
| low | `/api/shipping/order-labels/purchase` | POST | ✅ | ✅ | ✅ | shipping_label_purchases, documents, orders |
| low | `/api/shipping/order-labels/void` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/sku` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, sku_stock, sku |
| low | `/api/sku-catalog` | GET/POST | ✅ | ✅ | ✅ | sku_stock, items, sku |
| low | `/api/sku-catalog/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | bin_contents, sku_stock, sku |
| low | `/api/sku-catalog/[id]/composition` | GET | ✅ | ✅ | ✅ | sku_stock, orders, sku |
| low | `/api/sku-catalog/[id]/kit-parts` | GET/POST/PUT/DELETE | ✅ | ✅ | ✅ | sku_kit_parts, sku_stock, sku |
| low | `/api/sku-catalog/[id]/manuals` | POST/PUT/DELETE | — | ✅ | ✅ | product_manuals, sku_catalog, sku_stock, sku |
| low | `/api/sku-catalog/[id]/platform-ids` | POST/PUT/DELETE | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/[id]/qc-checks` | GET/POST/PUT/DELETE | ✅ | ✅ | ✅ | qc_check_templates, sku_stock, sku |
| low | `/api/sku-catalog/[id]/similar` | GET | — | ✅ | ✅ | sku_catalog, sku_stock, items, sku |
| low | `/api/sku-catalog/by-item-number` | GET | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/sku-catalog/flag-missing` | POST | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/graph/[skuId]/children` | GET | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/graph/[skuId]/parents` | GET | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/graph/[skuId]/tree` | GET | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/graph/relationships` | POST | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/graph/relationships/[id]` | PATCH/DELETE | — | ✅ | ✅ | sku_relationships, sku_stock, sku |
| low | `/api/sku-catalog/pair` | POST/DELETE | ✅ | ✅ | ✅ | sku_platform_ids, sku_stock |
| low | `/api/sku-catalog/pair-batch` | POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/sku-catalog/pair-ecwid` | POST | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/pair-suggestions` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, sku_stock, items, sku |
| low | `/api/sku-catalog/pairing-queue` | GET | ✅ | ✅ | ✅ | sku_pairing_suggestions, sku_platform_ids, sku_catalog, platforms, sku_stock, orders +2 |
| low | `/api/sku-catalog/provisional` | GET/POST | ✅ | ✅ | ✅ | sku_stock, items, sku |
| low | `/api/sku-catalog/provisional/[sku]` | GET/PATCH | — | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/provisional/merge` | POST | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku-catalog/resolve` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, platforms, orders, sku |
| low | `/api/sku-catalog/run-migration` | POST | ✅ | ✅ | ✅ | sku_platform_ids |
| low | `/api/sku-catalog/search` | GET | ✅ | ✅ | ✅ | qc_check_templates, sku_platform_ids, sku_catalog, sku_stock, items, sku |
| low | `/api/sku-catalog/search-unmatched` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, sku_stock, orders, sku |
| low | `/api/sku-catalog/suggest-for-item` | GET | ✅ | ✅ | ✅ | sku_catalog, sku_stock, sku |
| low | `/api/sku-catalog/suggest-pairings` | GET/POST | ✅ | ✅ | ✅ | sku_stock |
| low | `/api/sku-catalog/sync-ecwid-products` | POST | ✅ | ✅ | ✅ | sku_platform_ids, items, sku |
| low | `/api/sku-catalog/sync-ecwid-titles` | POST | ✅ | ✅ | ✅ | sku_catalog, items, sku |
| low | `/api/sku-catalog/unpaired` | GET | ✅ | ✅ | ✅ | sku_stock, orders, items, sku |
| low | `/api/sku-catalog/unpaired-ecwid` | GET | ✅ | ✅ | ✅ | sku_stock, items, sku |
| low | `/api/sku-kit-parts/[id]/document` | GET | ✅ | ✅ | ✅ | sku_kit_parts |
| low | `/api/sku-manager` | GET | ✅ | ✅ | ✅ | sku_management, sku_stock |
| low | `/api/sku-stock` | GET | ✅ | ✅ | ✅ | sku_platform_ids, sku_catalog, sku_stock, sku |
| low | `/api/sku-stock/[sku]` | GET/PATCH | ✅ | ✅ | ✅ | photo_entity_links, sku_stock_ledger, sku_catalog, locations, sku_stock, photos +2 |
| low | `/api/sku-stock/[sku]/bins` | GET | — | ✅ | ✅ | sku_platform_ids, sku_catalog, sku_stock, sku |
| low | `/api/sku/[id]/photos` | GET/POST | — | ✅ | ✅ | sku_stock, photos, sku |
| low | `/api/sku/by-tracking` | GET/DELETE | ✅ | ✅ | ✅ | serial_unit_provenance, photo_entity_links, serial_units, sku_stock, photos, sku |
| low | `/api/sku/lookup` | GET | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/sku/serials-from-code` | GET | ✅ | ✅ | ✅ | sku_stock, sku |
| low | `/api/sourcing/alerts` | GET/POST/PATCH | ✅ | ✅ | ✅ | items |
| low | `/api/sourcing/candidates` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/sourcing/saved-searches` | GET/POST | ✅ | ✅ | ✅ | items |
| low | `/api/staff` | GET/POST/PUT/DELETE | ✅ | ✅ | ✅ | staff_availability_rules, staff_schedule_overrides, staff_functional_roles, staff_weekly_schedule, staff_week_plans, staff |
| low | `/api/staff-goals` | GET/PUT | ✅ | ✅ | ✅ | station_activity_logs, staff_goals, staff |
| low | `/api/staff-goals/history` | GET | ✅ | ✅ | ✅ | staff_goal_history, staff |
| low | `/api/staff-goals/me` | GET | ✅ | ✅ | ✅ | staff |
| low | `/api/staff-messages` | GET/POST/PATCH | ✅ | ✅ | ✅ | messages, items, staff |
| low | `/api/staff-preferences` | GET/PUT | ✅ | ✅ | ✅ | staff |
| low | `/api/staff-todos` | GET/POST/PATCH/DELETE | ✅ | ✅ | ✅ | items, staff |
| low | `/api/staff/[id]/avatar` | POST/DELETE | ✅ | ✅ | ✅ | photos, staff, types |
| low | `/api/staff/[id]/color` | PATCH | ✅ | ✅ | ✅ | staff |
| low | `/api/staff/[id]/functional-roles` | PUT | — | ✅ | ✅ | staff |
| low | `/api/staff/[id]/name` | PATCH | ✅ | ✅ | ✅ | staff |
| low | `/api/staff/availability-rules` | GET/POST/PUT/DELETE | ✅ | ✅ | ✅ | staff_availability_rules, staff |
| low | `/api/staff/availability-today` | GET | ✅ | ✅ | ✅ | staff_availability_rules, staff_schedule_overrides, staff_weekly_schedule, staff_week_plans, staff |
| low | `/api/staff/schedule` | GET/PUT | ✅ | ✅ | ✅ | staff_availability_rules, staff_schedule_overrides, staff_weekly_schedule, staff_week_plans, staff |
| low | `/api/staff/schedule/week` | GET/PUT | ✅ | ✅ | ✅ | staff_availability_rules, staff_schedule_overrides, staff_weekly_schedule, staff_week_plans, staff |
| low | `/api/staff/schedule/week/copy` | POST | ✅ | ✅ | ✅ | staff_availability_rules, staff_schedule_overrides, staff_weekly_schedule, staff_week_plans, staff |
| low | `/api/station-commands/aliases` | GET/POST | ✅ | ✅ | ✅ | station_command_aliases, sku_stock |
| low | `/api/station-commands/aliases/[id]` | PATCH/DELETE | ✅ | ✅ | ✅ | station_command_aliases, sku_stock |
| low | `/api/stations` | GET/POST | ✅ | ✅ | ✅ | station_definitions |
| low | `/api/stations/handoff` | POST | ✅ | ✅ | ✅ | sku |
| low | `/api/stations/publish` | POST | ✅ | ✅ | ✅ | station_definitions |
| low | `/api/stock-alerts` | GET | ✅ | ✅ | ✅ | bin_contents, stock_alerts, locations, sku_stock, sku |
| low | `/api/studio/definitions/[id]/discard` | DELETE | ✅ | ✅ | ✅ | workflow_definitions, item_workflow_state, items |
| low | `/api/studio/definitions/[id]/graph` | PUT | ✅ | ✅ | ✅ | workflow_definitions, workflow_edges, workflow_nodes |
| low | `/api/studio/flow` | GET | ✅ | ✅ | ✅ | workflow_node_stats, workflow_edges, workflow_nodes, workflow_runs |
| low | `/api/studio/items/[id]/recover` | POST | ✅ | ✅ | ✅ | items |
| low | `/api/studio/items/stuck` | GET | ✅ | ✅ | ✅ | items, sku |
| low | `/api/studio/people` | GET | ✅ | ✅ | ✅ | staff_stations, staff |
| low | `/api/suppliers` | GET/POST | ✅ | ✅ | ✅ | suppliers, items |
| low | `/api/suppliers/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | suppliers |
| low | `/api/support/suggest` | POST | ✅ | ✅ | ✅ | photos |
| low | `/api/sync/global` | GET/POST | ✅ | ✅ | ✅ | orders |
| low | `/api/tasks/[id]/documents` | GET/POST/DELETE | ✅ | ✅ | ✅ | documents |
| low | `/api/tasks/[id]/media` | GET | ✅ | ✅ | ✅ | photos |
| low | `/api/threads/[id]/assign` | POST/DELETE | — | ✅ | ✅ | messages, staff |
| low | `/api/threads/[id]/messages` | GET/POST | — | ✅ | ✅ | thread_messages, messages |
| low | `/api/threads/[id]/messages/[messageId]` | PATCH/DELETE | — | ✅ | ✅ | messages |
| low | `/api/tool-forge/requests` | GET/POST | ✅ | ✅ | ✅ | build_requests, tool_registry |
| low | `/api/tracking-exceptions` | GET | ✅ | ✅ | ✅ | tracking_exceptions, receiving_carton, orders, staff |
| low | `/api/tracking-exceptions/[id]` | GET/PATCH/DELETE | — | ✅ | ✅ | tracking_exceptions, receiving_carton, staff |
| low | `/api/tracking-exceptions/[id]/refresh` | POST | — | ✅ | ✅ | tracking_exceptions, receiving_carton, receiving_scans, sku |
| low | `/api/transfers` | POST | ✅ | ✅ | ✅ | inventory_events, bin_contents, locations, sku |
| low | `/api/units/next-id` | POST | ✅ | ✅ | ✅ | sku_catalog, sku |
| low | `/api/units/pack-placement` | GET | ✅ | ✅ | ✅ | locations, orders |
| low | `/api/units/pack-placement/move` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/units/resolve-id` | POST | ✅ | ✅ | ✅ | sku_catalog, sku |
| low | `/api/update-sku-location` | POST | ✅ | ✅ | ✅ | location_transfers, sku_stock, orders, sku |
| low | `/api/v1/label-buys` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/v1/outbound/work` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/v1/paperwork-prints` | POST | ✅ | ✅ | ✅ | items |
| low | `/api/v1/picking/sessions` | POST | ✅ | ✅ | ✅ | orders |
| low | `/api/voicemails` | GET | ✅ | ✅ | ✅ | voicemails |
| low | `/api/voicemails/[id]` | GET | ✅ | ✅ | ✅ | voicemails |
| low | `/api/voicemails/[id]/followup` | PATCH | ✅ | ✅ | ✅ | voicemails, messages, staff |
| low | `/api/voicemails/[id]/link` | POST | ✅ | ✅ | ✅ | voicemails |
| low | `/api/voicemails/[id]/recording` | GET | ✅ | ✅ | ✅ | voicemails |
| low | `/api/warehouses` | GET | ✅ | ✅ | ✅ | warehouses, sku_stock |
| low | `/api/warranty/claims` | GET/POST | ✅ | ✅ | ✅ | staff, sku |
| low | `/api/warranty/claims/[id]/quote` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/warranty/claims/[id]/restore` | POST | ✅ | ✅ | ✅ | warranty_claims |
| low | `/api/warranty/claims/[id]/rma` | POST/DELETE | ✅ | ✅ | ✅ | staff |
| low | `/api/warranty/claims/bulk` | POST/DELETE | ✅ | ✅ | ✅ | items, staff, sku |
| low | `/api/warranty/claims/bulk/restore` | POST | ✅ | ✅ | ✅ | warranty_claims |
| low | `/api/warranty/reports/export` | GET | ✅ | ✅ | ✅ | sku |
| low | `/api/webhooks/ebay/marketplace-account-deletion` | GET/POST | — | ✅ | ✅ | accounts |
| low | `/api/webhooks/square` | POST/GET | — | — | ✅ | orders, sku |
| low | `/api/webhooks/stripe/orders` | POST | — | — | ✅ | orders |
| low | `/api/webhooks/ups` | POST/GET | — | — | ✅ | packages |
| low | `/api/work-orders` | GET/PATCH | ✅ | ✅ | ✅ | receiving_carton, work_assignments, repair_service, fba_shipments, sku_stock, orders +2 |
| low | `/api/work-orders/calendar` | GET | ✅ | ✅ | ✅ | orders |
| low | `/api/workflow/flow-audit` | GET | ✅ | ✅ | ✅ | inventory_events, serial_units |
| low | `/api/zendesk/photo-ticket` | POST | ✅ | ✅ | ✅ | staff |
| low | `/api/zendesk/tickets/[id]/assign` | GET/POST | ✅ | ✅ | ✅ | messages, staff |
| low | `/api/zendesk/tickets/[id]/photos` | GET | ✅ | ✅ | ✅ | photos |
| low | `/api/zoho/fulfillment-sync` | POST | ✅ | ✅ | ✅ | zoho_fulfillment_sync |
| low | `/api/zoho/items/[id]/image` | GET | — | ✅ | ✅ | zoho_item_images, sku_stock, items |
| low | `/api/zoho/orders/ingest` | POST | ✅ | ✅ | ✅ | order_ingest_queue |
| low | `/api/zoho/purchase-orders/receive` | POST | ✅ | ✅ | ✅ | receiving_carton, work_assignments, receiving_line, orders, items, sku |
| low | `/api/zoho/purchase-receives/sync` | POST | ✅ | ✅ | ✅ | orders |

## Reverse index — routes per tenant table (the Phase E enforcement gate)

> A table may be `enforce_tenant_isolation()`-d only once **every** route below it is GUC-wrapped (low risk).

### `account_emails` — 1 routes, 1 not yet GUC-safe

- ⛔ `/api/auth/verify-email` (high)

### `accounts` — 25 routes, 10 not yet GUC-safe

- ⛔ `/api/admin/po-gmail/connect` (high)
- ✅ `/api/amazon/accounts` (low)
- ✅ `/api/amazon/connect` (low)
- ✅ `/api/amazon/health` (low)
- ✅ `/api/amazon/oauth/callback` (low)
- ⛔ `/api/auth/account/change-password` (critical)
- ⛔ `/api/auth/account/passkey/authenticate/finish` (medium)
- ⛔ `/api/auth/account/passkey/register/begin` (critical)
- ⛔ `/api/auth/email-login/request` (critical)
- ✅ `/api/auth/oauth/[provider]/callback` (low)
- ✅ `/api/auth/password-reset/confirm` (low)
- ⛔ `/api/auth/password-reset/request` (critical)
- ✅ `/api/auth/sso/callback` (low)
- ✅ `/api/catalog/platform-accounts` (low)
- ✅ `/api/catalog/platform-accounts/[id]` (low)
- ✅ `/api/ebay/accounts` (low)
- ✅ `/api/ebay/health` (low)
- ⛔ `/api/integrations/google-drive/connect` (medium)
- ✅ `/api/orders/backfill/ebay` (low)
- ✅ `/api/org/accounts/merge` (low)
- ✅ `/api/receiving-lines/incoming/marketplace-refresh` (low)
- ✅ `/api/webhooks/ebay/marketplace-account-deletion` (low)
- ⛔ `/api/zoho/health` (medium)
- ⛔ `/api/zoho/oauth/authorize` (high)
- ⛔ `/api/zoho/oauth/callback` (medium)

### `agent_mutations` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/assistant/mutations` (low)

### `amazon_accounts` — 3 routes, 0 not yet GUC-safe

- ✅ `/api/amazon/accounts` (low)
- ✅ `/api/amazon/connect` (low)
- ✅ `/api/amazon/oauth/callback` (low)

### `audit_logs` — 6 routes, 0 not yet GUC-safe

- ✅ `/api/admin/logs` (low)
- ✅ `/api/audit-log/staff-directory` (low)
- ✅ `/api/operations/kpi-table` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/repair-service/[id]/print-log` (low)
- ✅ `/api/shipping/labels` (low)

### `auth_audit` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/admin/audit` (low)
- ✅ `/api/admin/staff/[id]/detail` (low)

### `beta_applications` — 2 routes, 2 not yet GUC-safe

- ⛔ `/api/beta/applications` (high)
- ⛔ `/api/beta/apply` (critical)

### `beta_waitlist` — 2 routes, 2 not yet GUC-safe

- ⛔ `/api/beta/spots` (high)
- ⛔ `/api/beta/waitlist` (critical)

### `bin_contents` — 8 routes, 0 not yet GUC-safe

- ✅ `/api/cron/stock-alerts` (low)
- ✅ `/api/cycle-counts/campaigns` (low)
- ✅ `/api/inventory/sku-search` (low)
- ✅ `/api/locations/[barcode]/swap` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/sku-catalog/[id]` (low)
- ✅ `/api/stock-alerts` (low)
- ✅ `/api/transfers` (low)

### `build_requests` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/tool-forge/requests` (low)

### `catalog_external_ids` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/inventory/parts-graph` (low)

### `customers` — 10 routes, 2 not yet GUC-safe

- ✅ `/api/customers` (low)
- ✅ `/api/customers/[id]` (low)
- ✅ `/api/customers/[id]/stats` (low)
- ✅ `/api/customers/search` (low)
- ✅ `/api/orders/[id]/buyer` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/repair-service/[id]/customer` (low)
- ✅ `/api/repair/customers` (low)
- ⛔ `/api/walk-in/customers` (medium)
- ⛔ `/api/walk-in/status` (medium)

### `cycle_count_campaigns` — 4 routes, 0 not yet GUC-safe

- ✅ `/api/cycle-counts/campaigns` (low)
- ✅ `/api/cycle-counts/campaigns/[id]` (low)
- ✅ `/api/cycle-counts/lines/[id]` (low)
- ✅ `/api/inventory/counts` (low)

### `cycle_count_lines` — 4 routes, 0 not yet GUC-safe

- ✅ `/api/cycle-counts/campaigns` (low)
- ✅ `/api/cycle-counts/campaigns/[id]` (low)
- ✅ `/api/cycle-counts/lines/[id]` (low)
- ✅ `/api/inventory/counts` (low)

### `cycle_forge_run_steps` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/forge/ingest` (low)
- ✅ `/api/forge/runs` (low)

### `cycle_forge_runs` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/forge/ingest` (low)
- ✅ `/api/forge/runs` (low)

### `documents` — 22 routes, 4 not yet GUC-safe

- ⛔ `/api/cron/documents/ecwid-packing-slips` (high)
- ⛔ `/api/cron/documents/ensure-outbound` (high)
- ⛔ `/api/cron/documents/nas-mirror` (high)
- ✅ `/api/documents/[id]` (low)
- ✅ `/api/documents/[id]/content` (low)
- ✅ `/api/documents/download-zip` (low)
- ✅ `/api/order-labels` (low)
- ✅ `/api/orders/[id]/documents` (low)
- ✅ `/api/orders/[id]/documents/fetch` (low)
- ✅ `/api/orders/[id]/documents/print` (low)
- ✅ `/api/orders/[id]/documents/upload` (low)
- ✅ `/api/orders/print-packet` (low)
- ✅ `/api/photos/library` (low)
- ✅ `/api/picking/desk/scan` (low)
- ✅ `/api/receiving-lines/[id]/manuals` (low)
- ✅ `/api/receiving-lines/[id]/testing-bundle` (low)
- ✅ `/api/repair-service/document/[id]` (low)
- ✅ `/api/repair-service/pickup` (low)
- ✅ `/api/shipments/[id]/documents` (low)
- ✅ `/api/shipping/order-labels/purchase` (low)
- ✅ `/api/tasks/[id]/documents` (low)
- ⛔ `/api/tasks/plan-files` (high)

### `ebay_accounts` — 4 routes, 1 not yet GUC-safe

- ⛔ `/api/cron/signals/buyer-notes-heal` (high)
- ✅ `/api/ebay/accounts` (low)
- ✅ `/api/ebay/callback` (low)
- ✅ `/api/orders/backfill/ebay` (low)

### `email_delivery_signals` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines/incoming/details` (low)

### `email_login_tokens` — 3 routes, 3 not yet GUC-safe

- ⛔ `/api/auth/email-login/request` (critical)
- ⛔ `/api/auth/email-login/verify` (high)
- ⛔ `/api/auth/verify-email` (high)

### `email_missing_purchase_orders` — 13 routes, 0 not yet GUC-safe

- ✅ `/api/admin/po-gmail/create-zoho-draft/[id]` (low)
- ✅ `/api/admin/po-gmail/missing-orders` (low)
- ✅ `/api/admin/po-gmail/triage` (low)
- ✅ `/api/admin/po-gmail/triage/[id]` (low)
- ✅ `/api/admin/po-gmail/triage/[id]/detail` (low)
- ✅ `/api/admin/po-gmail/triage/[id]/extract` (low)
- ✅ `/api/admin/po-mirror/health` (low)
- ✅ `/api/cron/zoho/po-sync` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-lines/incoming/match-email` (low)
- ✅ `/api/receiving-lines/incoming/todo` (low)
- ✅ `/api/receiving/email-po` (low)
- ✅ `/api/receiving/unfound-queue/[kind]/[id]` (low)

### `entity_search_outbox` — 1 routes, 1 not yet GUC-safe

- ⛔ `/api/cron/cleanup` (high)

### `entity_signals` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/timeline` (low)

### `entity_threads` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/timeline` (low)

### `failure_modes` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/quality/dashboard` (low)

### `fba_fnsku_logs` — 10 routes, 0 not yet GUC-safe

- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/fba/items/ready` (low)
- ✅ `/api/fba/items/scan` (low)
- ✅ `/api/fba/labels/bind` (low)
- ✅ `/api/fba/logs` (low)
- ✅ `/api/fba/logs/[id]` (low)
- ✅ `/api/fba/logs/summary` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/close` (low)
- ✅ `/api/picking/desk/serial` (low)

### `fba_fnskus` — 24 routes, 0 not yet GUC-safe

- ✅ `/api/admin/fba-fnskus` (low)
- ✅ `/api/admin/fba-fnskus/[fnsku]` (low)
- ✅ `/api/admin/fba-fnskus/upload` (low)
- ✅ `/api/fba/board` (low)
- ✅ `/api/fba/board/[fnsku]/entries` (low)
- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/fba/fnskus` (low)
- ✅ `/api/fba/fnskus/[fnsku]` (low)
- ✅ `/api/fba/fnskus/bulk` (low)
- ✅ `/api/fba/fnskus/search` (low)
- ✅ `/api/fba/fnskus/validate` (low)
- ✅ `/api/fba/items/[id]/link-unit` (low)
- ✅ `/api/fba/items/queue` (low)
- ✅ `/api/fba/logs` (low)
- ✅ `/api/fba/logs/[id]` (low)
- ✅ `/api/fba/logs/summary` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments/[id]/items` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/fba/shipments/today/items` (low)
- ✅ `/api/packing-logs` (low)

### `fba_shipment_item_units` — 3 routes, 0 not yet GUC-safe

- ✅ `/api/fba/items/[id]/link-unit` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)

### `fba_shipment_items` — 27 routes, 0 not yet GUC-safe

- ✅ `/api/fba/board` (low)
- ✅ `/api/fba/board/[fnsku]/entries` (low)
- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/fba/items/[id]/link-unit` (low)
- ✅ `/api/fba/items/queue` (low)
- ✅ `/api/fba/items/ready` (low)
- ✅ `/api/fba/items/scan` (low)
- ✅ `/api/fba/labels/bind` (low)
- ✅ `/api/fba/logs/summary` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]` (low)
- ✅ `/api/fba/shipments/[id]/items` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]/reassign` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/[id]/tracking` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/close` (low)
- ✅ `/api/fba/shipments/mark-shipped` (low)
- ✅ `/api/fba/shipments/split-for-paired-review` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/fba/shipments/today/duplicate-yesterday` (low)
- ✅ `/api/fba/shipments/today/items` (low)
- ✅ `/api/fba/stage-counts` (low)
- ✅ `/api/packing-logs` (low)

### `fba_shipment_tracking` — 12 routes, 0 not yet GUC-safe

- ✅ `/api/fba/board` (low)
- ✅ `/api/fba/board/[fnsku]/entries` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/[id]/tracking` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/mark-shipped` (low)
- ✅ `/api/fba/shipments/split-for-paired-review` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/packing-logs` (low)

### `fba_shipments` — 26 routes, 0 not yet GUC-safe

- ✅ `/api/fba/board` (low)
- ✅ `/api/fba/board/[fnsku]/entries` (low)
- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/fba/items/queue` (low)
- ✅ `/api/fba/items/ready` (low)
- ✅ `/api/fba/items/scan` (low)
- ✅ `/api/fba/labels/bind` (low)
- ✅ `/api/fba/logs` (low)
- ✅ `/api/fba/logs/[id]` (low)
- ✅ `/api/fba/logs/summary` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]` (low)
- ✅ `/api/fba/shipments/[id]/items` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]/reassign` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/close` (low)
- ✅ `/api/fba/shipments/mark-shipped` (low)
- ✅ `/api/fba/shipments/split-for-paired-review` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/fba/shipments/today/duplicate-yesterday` (low)
- ✅ `/api/fba/shipments/today/items` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/work-orders` (low)

### `fba_tracking_item_allocations` — 4 routes, 0 not yet GUC-safe

- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/[id]/tracking` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/split-for-paired-review` (low)

### `feed_memberships` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/cron/feed-membership-projection` (low)

### `google_oauth_tokens` — 3 routes, 3 not yet GUC-safe

- ⛔ `/api/admin/po-gmail/disconnect` (medium)
- ⛔ `/api/admin/po-gmail/oauth-callback` (medium)
- ⛔ `/api/admin/po-gmail/status` (medium)

### `handling_units` — 3 routes, 0 not yet GUC-safe

- ✅ `/api/handling-units` (low)
- ✅ `/api/handling-units/[id]` (low)
- ✅ `/api/handling-units/bulk` (low)

### `inbound_ingest_event` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving/inbound/ingest-health` (low)

### `inbound_purchase_order_links` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving/po/[poId]/attach-box` (low)

### `inbound_purchase_order_mirror` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines/incoming/details` (low)

### `inventory_events` — 16 routes, 0 not yet GUC-safe

- ✅ `/api/audit-log/report` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/inventory-photos` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/pack/ship` (low)
- ✅ `/api/picking/units/scan` (low)
- ✅ `/api/receiving/lines/[id]/move` (low)
- ✅ `/api/receiving/lines/[id]/putaway` (low)
- ✅ `/api/receiving/lines/[id]/putaway/reverse` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/returns/undo` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/grade` (low)
- ✅ `/api/transfers` (low)
- ✅ `/api/workflow/flow-audit` (low)

### `item_workflow_state` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/studio/definitions/[id]/discard` (low)

### `items` — 107 routes, 8 not yet GUC-safe

- ✅ `/api/admin/po-gmail/create-zoho-draft/[id]` (low)
- ✅ `/api/admin/po-gmail/missing-orders` (low)
- ⛔ `/api/admin/po-gmail/preview-unread` (medium)
- ✅ `/api/admin/po-gmail/triage` (low)
- ✅ `/api/assignments/sku-search` (low)
- ✅ `/api/assistant/chat` (low)
- ✅ `/api/audit-log/packing` (low)
- ✅ `/api/audit-log/receiving` (low)
- ✅ `/api/audit-log/sku` (low)
- ✅ `/api/audit-log/tech` (low)
- ✅ `/api/automations/rules` (low)
- ✅ `/api/billing/webhook` (low)
- ✅ `/api/bose-models` (low)
- ✅ `/api/call-events` (low)
- ✅ `/api/custom-fields/defs` (low)
- ✅ `/api/daily-checks/items/[id]/links` (low)
- ⛔ `/api/ecwid/order-search` (high)
- ⛔ `/api/ecwid/products/search` (high)
- ✅ `/api/ecwid/recent-repair-orders` (low)
- ✅ `/api/ecwid/sync-exception-tracking` (low)
- ✅ `/api/fba/fnskus/search` (low)
- ✅ `/api/fba/items/queue` (low)
- ✅ `/api/fba/items/ready` (low)
- ✅ `/api/fba/items/scan` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]/items` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]/reassign` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/mark-shipped` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/fba/shipments/today/duplicate-yesterday` (low)
- ✅ `/api/fba/shipments/today/items` (low)
- ✅ `/api/get-title-by-sku` (low)
- ✅ `/api/handling-units` (low)
- ✅ `/api/inbox/support` (low)
- ✅ `/api/inbox/tech-queue` (low)
- ✅ `/api/inventory/alerts` (low)
- ✅ `/api/inventory/counts` (low)
- ✅ `/api/inventory/items/search` (low)
- ✅ `/api/inventory/parts-graph` (low)
- ✅ `/api/inventory/parts/links` (low)
- ✅ `/api/inventory/units` (low)
- ✅ `/api/label-manifests` (low)
- ✅ `/api/labels/recent` (low)
- ✅ `/api/local-pickup-orders` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/local-pickup-orders/[id]/finalize` (low)
- ✅ `/api/local-pickup-orders/[id]/items` (low)
- ✅ `/api/local-pickup-orders/[id]/items/[itemId]` (low)
- ✅ `/api/ops-plans/inbox` (low)
- ✅ `/api/orders/backfill/ecwid` (low)
- ✅ `/api/orders/print-packet` (low)
- ✅ `/api/part-compatibility` (low)
- ✅ `/api/photos/library` (low)
- ✅ `/api/photos/listing-gallery` (low)
- ✅ `/api/product-manuals/sync` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/receiving-lines/incoming/delivered-not-unboxed` (low)
- ✅ `/api/receiving-lines/incoming/delivered-unscanned` (low)
- ⛔ `/api/receiving-lines/incoming/email-rescan` (medium)
- ✅ `/api/receiving-lines/incoming/todo` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/pending-work` (low)
- ✅ `/api/receiving/po-search` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/receiving/rail-exclusions` (low)
- ✅ `/api/repair/ecwid-products` (low)
- ✅ `/api/review/catalog-link` (low)
- ✅ `/api/review/import-exceptions` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/settings` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/sku-catalog` (low)
- ✅ `/api/sku-catalog/[id]/similar` (low)
- ✅ `/api/sku-catalog/pair-suggestions` (low)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/provisional` (low)
- ✅ `/api/sku-catalog/search` (low)
- ✅ `/api/sku-catalog/sync-ecwid-products` (low)
- ✅ `/api/sku-catalog/sync-ecwid-titles` (low)
- ✅ `/api/sku-catalog/unpaired` (low)
- ✅ `/api/sku-catalog/unpaired-ecwid` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/sourcing/alerts` (low)
- ✅ `/api/sourcing/candidates` (low)
- ✅ `/api/sourcing/saved-searches` (low)
- ✅ `/api/staff-messages` (low)
- ✅ `/api/staff-todos` (low)
- ✅ `/api/studio/definitions/[id]/discard` (low)
- ✅ `/api/studio/items/[id]/recover` (low)
- ✅ `/api/studio/items/stuck` (low)
- ✅ `/api/suppliers` (low)
- ✅ `/api/v1/paperwork-prints` (low)
- ⛔ `/api/walk-in/catalog` (medium)
- ✅ `/api/warranty/claims/bulk` (low)
- ✅ `/api/zoho/items/[id]/image` (low)
- ⛔ `/api/zoho/items/sync` (medium)
- ⛔ `/api/zoho/oauth/authorize` (high)
- ⛔ `/api/zoho/purchase-orders` (medium)
- ✅ `/api/zoho/purchase-orders/receive` (low)

### `label_print_jobs` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/post-multi-sn` (low)

### `local_pickup_items` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/local-pickups` (low)

### `local_pickup_order_items` — 5 routes, 0 not yet GUC-safe

- ✅ `/api/local-pickup-orders` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/local-pickup-orders/[id]/finalize` (low)
- ✅ `/api/local-pickup-orders/[id]/items` (low)
- ✅ `/api/local-pickup-orders/[id]/items/[itemId]` (low)

### `local_pickup_orders` — 9 routes, 0 not yet GUC-safe

- ✅ `/api/local-pickup-orders` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/local-pickup-orders/[id]/complete` (low)
- ✅ `/api/local-pickup-orders/[id]/finalize` (low)
- ✅ `/api/local-pickup-orders/[id]/items` (low)
- ✅ `/api/local-pickup-orders/[id]/items/[itemId]` (low)
- ✅ `/api/local-pickup-orders/[id]/reopen` (low)
- ✅ `/api/local-pickup-orders/[id]/void` (low)
- ✅ `/api/receiving/[id]` (low)

### `location_transfers` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/update-sku-location` (low)

### `locations` — 24 routes, 1 not yet GUC-safe

- ✅ `/api/cycle-counts/campaigns` (low)
- ✅ `/api/cycle-counts/campaigns/[id]` (low)
- ✅ `/api/inventory-events` (low)
- ✅ `/api/inventory/alerts` (low)
- ✅ `/api/locations` (low)
- ✅ `/api/locations/[barcode]` (low)
- ✅ `/api/locations/[barcode]/properties` (low)
- ✅ `/api/locations/[barcode]/swap` (low)
- ✅ `/api/orders/pack-placement` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lines/[id]/move` (low)
- ✅ `/api/receiving/lines/[id]/putaway` (low)
- ✅ `/api/receiving/lines/[id]/stage` (low)
- ✅ `/api/receiving/lines/[id]/timeline` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/triage/staging-map` (low)
- ✅ `/api/reports/bin-utilization` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/move` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/stock-alerts` (low)
- ✅ `/api/transfers` (low)
- ✅ `/api/units/pack-placement` (low)
- ⛔ `/api/walk-in/status` (medium)

### `memberships` — 18 routes, 11 not yet GUC-safe

- ⛔ `/api/auth/account/change-password` (critical)
- ⛔ `/api/auth/account/passkey` (high)
- ⛔ `/api/auth/account/passkey/[id]` (critical)
- ⛔ `/api/auth/account/passkey/authenticate/finish` (medium)
- ⛔ `/api/auth/account/passkey/register/begin` (critical)
- ⛔ `/api/auth/account/passkey/register/finish` (critical)
- ⛔ `/api/auth/account/signin` (medium)
- ⛔ `/api/auth/email-login/request` (critical)
- ✅ `/api/auth/invitation/accept` (low)
- ✅ `/api/auth/oauth/[provider]/callback` (low)
- ⛔ `/api/auth/oauth/[provider]/start` (high)
- ✅ `/api/auth/password-reset/confirm` (low)
- ⛔ `/api/auth/session` (medium)
- ✅ `/api/auth/sso/callback` (low)
- ✅ `/api/auth/switch-org` (low)
- ✅ `/api/org/accounts/merge` (low)
- ✅ `/api/org/invitations` (low)
- ⛔ `/api/v1/session` (critical)

### `messages` — 11 routes, 3 not yet GUC-safe

- ⛔ `/api/admin/po-gmail/preview-unread` (medium)
- ✅ `/api/admin/po-gmail/triage/[id]/detail` (low)
- ✅ `/api/admin/po-gmail/triage/[id]/extract` (low)
- ⛔ `/api/ai/search` (medium)
- ⛔ `/api/mcp` (medium)
- ✅ `/api/staff-messages` (low)
- ✅ `/api/threads/[id]/assign` (low)
- ✅ `/api/threads/[id]/messages` (low)
- ✅ `/api/threads/[id]/messages/[messageId]` (low)
- ✅ `/api/voicemails/[id]/followup` (low)
- ✅ `/api/zendesk/tickets/[id]/assign` (low)

### `mobile_scan_events` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/scan/history` (low)
- ✅ `/api/scan/resolve` (low)

### `nav_definitions` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/nav` (low)

### `operations_kpi_rollups_daily` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/operations/kpi-table` (low)

### `operations_kpi_rollups_hourly` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/operations/kpi-table` (low)

### `ops_events` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/unfound-queue` (low)

### `order_ingest_queue` — 2 routes, 1 not yet GUC-safe

- ⛔ `/api/cron/zoho/orders-ingest-drain` (high)
- ✅ `/api/zoho/orders/ingest` (low)

### `order_notes` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)

### `order_unit_allocations` — 7 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/release` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/pack/ship` (low)
- ✅ `/api/picking/units/scan` (low)
- ✅ `/api/returns/undo` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/allocate` (low)

### `order_unit_amendments` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/amendments` (low)
- ✅ `/api/pack/ship` (low)

### `orders` — 187 routes, 16 not yet GUC-safe

- ✅ `/api/admin/fix-status` (low)
- ✅ `/api/admin/po-gmail/missing-orders` (low)
- ✅ `/api/allocation/auto` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/automations/listing-assign` (low)
- ✅ `/api/check-tracking` (low)
- ✅ `/api/cron/feed-membership-projection` (low)
- ✅ `/api/cron/orders/backfill` (low)
- ⛔ `/api/cron/zoho/orders-ingest-drain` (high)
- ✅ `/api/customers` (low)
- ✅ `/api/customers/[id]` (low)
- ✅ `/api/customers/[id]/stats` (low)
- ✅ `/api/customers/search` (low)
- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/debug-tracking` (low)
- ✅ `/api/documents/[id]` (low)
- ✅ `/api/documents/[id]/content` (low)
- ✅ `/api/documents/download-zip` (low)
- ✅ `/api/ebay/search` (low)
- ⛔ `/api/ecwid/order-search` (high)
- ✅ `/api/ecwid/recent-repair-orders` (low)
- ✅ `/api/ecwid/sync-exception-tracking` (low)
- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/google-sheets/execute-script` (low)
- ✅ `/api/identification/jobs/[jobId]` (low)
- ✅ `/api/imports/rows` (low)
- ✅ `/api/imports/runs` (low)
- ✅ `/api/imports/runs/[id]` (low)
- ✅ `/api/integrations/[provider]/sync` (low)
- ⛔ `/api/integrations/order-sources` (medium)
- ✅ `/api/local-pickup-orders` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/local-pickup-orders/[id]/complete` (low)
- ✅ `/api/local-pickup-orders/[id]/finalize` (low)
- ✅ `/api/local-pickup-orders/[id]/items` (low)
- ✅ `/api/local-pickup-orders/[id]/items/[itemId]` (low)
- ✅ `/api/local-pickup-orders/[id]/reopen` (low)
- ✅ `/api/local-pickup-orders/[id]/void` (low)
- ✅ `/api/local-pickup-orders/lines` (low)
- ⛔ `/api/nas-target/[target]/[[...path]]` (medium)
- ✅ `/api/operations/benchmarks` (low)
- ✅ `/api/operations/reconciliation` (low)
- ✅ `/api/operations/roi` (low)
- ✅ `/api/ops-plans/inbox` (low)
- ✅ `/api/order-amendments/[id]/decision` (low)
- ✅ `/api/order-labels` (low)
- ✅ `/api/orders` (low)
- ✅ `/api/orders-exceptions/[id]` (low)
- ✅ `/api/orders-exceptions/delete` (low)
- ✅ `/api/orders-exceptions/sync` (low)
- ✅ `/api/orders/[id]` (low)
- ✅ `/api/orders/[id]/acknowledge` (low)
- ✅ `/api/orders/[id]/allocate` (low)
- ✅ `/api/orders/[id]/amazon-refresh` (low)
- ✅ `/api/orders/[id]/amendments` (low)
- ✅ `/api/orders/[id]/buyer` (low)
- ✅ `/api/orders/[id]/buyer-note/ack` (low)
- ✅ `/api/orders/[id]/cage-release` (low)
- ✅ `/api/orders/[id]/carrier-events` (low)
- ✅ `/api/orders/[id]/documents` (low)
- ✅ `/api/orders/[id]/documents/fetch` (low)
- ✅ `/api/orders/[id]/documents/print` (low)
- ✅ `/api/orders/[id]/documents/upload` (low)
- ✅ `/api/orders/[id]/flag` (low)
- ✅ `/api/orders/[id]/label-purchase` (low)
- ✅ `/api/orders/[id]/labels` (low)
- ✅ `/api/orders/[id]/labels/[labelId]` (low)
- ✅ `/api/orders/[id]/labels/[labelId]/pdf` (low)
- ✅ `/api/orders/[id]/labels/[labelId]/ticket` (low)
- ✅ `/api/orders/[id]/manuals` (low)
- ✅ `/api/orders/[id]/manuals/[manualId]` (low)
- ✅ `/api/orders/[id]/notes` (low)
- ✅ `/api/orders/[id]/pick-tasks` (low)
- ✅ `/api/orders/[id]/possible-duplicates` (low)
- ✅ `/api/orders/[id]/price-breakdown` (low)
- ✅ `/api/orders/[id]/release` (low)
- ✅ `/api/orders/[id]/substitute` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/[id]/tracking` (low)
- ✅ `/api/orders/[id]/tracking-history` (low)
- ✅ `/api/orders/add` (low)
- ✅ `/api/orders/assign` (low)
- ✅ `/api/orders/backfill/ebay` (low)
- ✅ `/api/orders/backfill/ecwid` (low)
- ✅ `/api/orders/backfill/ecwid-price` (low)
- ✅ `/api/orders/batch` (low)
- ✅ `/api/orders/bulk-flag` (low)
- ✅ `/api/orders/caged` (low)
- ✅ `/api/orders/check-shipped` (low)
- ✅ `/api/orders/delete` (low)
- ✅ `/api/orders/desk-counts` (low)
- ✅ `/api/orders/exceptions` (low)
- ✅ `/api/orders/import-csv` (low)
- ⛔ `/api/orders/import/extract-capture` (medium)
- ⛔ `/api/orders/import/suggest-mapping` (medium)
- ✅ `/api/orders/intake/assignees` (low)
- ⛔ `/api/orders/intake/catalog/ecwid-categories` (medium)
- ✅ `/api/orders/intake/catalog/ecwid-products` (low)
- ⛔ `/api/orders/intake/catalog/favorites` (medium)
- ✅ `/api/orders/intake/ecwid-orders` (low)
- ✅ `/api/orders/intake/order-number` (low)
- ✅ `/api/orders/intake/products` (low)
- ✅ `/api/orders/intake/square-invoices` (low)
- ✅ `/api/orders/intake/square-invoices/link` (low)
- ✅ `/api/orders/intake/square-invoices/payment` (low)
- ✅ `/api/orders/integrity-check` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/orders/missing-parts` (low)
- ✅ `/api/orders/next` (low)
- ✅ `/api/orders/notes/bulk` (low)
- ✅ `/api/orders/pack-placement` (low)
- ✅ `/api/orders/pack-placement/move` (low)
- ✅ `/api/orders/payments` (low)
- ✅ `/api/orders/payments/cancel` (low)
- ✅ `/api/orders/payments/methods` (low)
- ✅ `/api/orders/price` (low)
- ✅ `/api/orders/print-packet` (low)
- ✅ `/api/orders/queue-counts` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/orders/set-item-number` (low)
- ✅ `/api/orders/verify` (low)
- ✅ `/api/pack/ship` (low)
- ✅ `/api/packerlogs` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/draft` (low)
- ✅ `/api/packing-logs/history` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/picking/desk/delete` (low)
- ✅ `/api/picking/desk/scan` (low)
- ✅ `/api/picking/desk/serial` (low)
- ✅ `/api/picking/desk/sku` (low)
- ✅ `/api/picking/desk/unpick` (low)
- ✅ `/api/picking/units/scan` (low)
- ✅ `/api/picking/units/unscan` (low)
- ✅ `/api/products/[sku]` (low)
- ⛔ `/api/realtime/wms-ticket` (medium)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/receiving-lines/qc-assignee` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/inbound/import-csv` (low)
- ✅ `/api/receiving/inbound/orders` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/po-search` (low)
- ✅ `/api/replenish/shipped-fifo` (low)
- ✅ `/api/reports/records/export` (low)
- ✅ `/api/scan-tracking` (low)
- ✅ `/api/scan/resolve` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/allocate` (low)
- ✅ `/api/shipments/[id]/resolve-exception` (low)
- ✅ `/api/shipped` (low)
- ✅ `/api/shipped/[id]` (low)
- ✅ `/api/shipped/debug` (low)
- ✅ `/api/shipped/lookup-order` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/shipped/search` (low)
- ✅ `/api/shipped/submit` (low)
- ⛔ `/api/shipping/addresses/validate` (medium)
- ✅ `/api/shipping/label-intake/pair` (low)
- ✅ `/api/shipping/order-labels/purchase` (low)
- ✅ `/api/shipping/order-labels/void` (low)
- ✅ `/api/sku-catalog/[id]/composition` (low)
- ⛔ `/api/sku-catalog/composition/batch` (medium)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/resolve` (low)
- ✅ `/api/sku-catalog/search-unmatched` (low)
- ✅ `/api/sku-catalog/unpaired` (low)
- ✅ `/api/sync/global` (low)
- ✅ `/api/tracking-exceptions` (low)
- ✅ `/api/units/pack-placement` (low)
- ✅ `/api/units/pack-placement/move` (low)
- ✅ `/api/update-sku-location` (low)
- ✅ `/api/v1/label-buys` (low)
- ✅ `/api/v1/outbound/work` (low)
- ✅ `/api/v1/picking/sessions` (low)
- ⛔ `/api/walk-in/orders` (medium)
- ⛔ `/api/walk-in/sync` (medium)
- ✅ `/api/webhooks/square` (low)
- ✅ `/api/webhooks/stripe/orders` (low)
- ⛔ `/api/wms/commands` (medium)
- ✅ `/api/work-orders` (low)
- ✅ `/api/work-orders/calendar` (low)
- ⛔ `/api/work-orders/mine` (medium)
- ✅ `/api/zoho/purchase-orders/receive` (low)
- ⛔ `/api/zoho/purchase-orders/sync` (medium)
- ✅ `/api/zoho/purchase-receives/sync` (low)

### `orders_exceptions` — 7 routes, 0 not yet GUC-safe

- ✅ `/api/ecwid/sync-exception-tracking` (low)
- ✅ `/api/google-sheets/execute-script` (low)
- ✅ `/api/orders-exceptions/delete` (low)
- ✅ `/api/orders-exceptions/sync` (low)
- ✅ `/api/picking/desk/scan` (low)
- ✅ `/api/receiving/unfound-queue/[kind]/[id]` (low)
- ✅ `/api/scan-tracking` (low)

### `organization_feature_flags` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/admin/org/export` (low)

### `packages` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/webhooks/ups` (low)

### `packer_logs` — 12 routes, 0 not yet GUC-safe

- ✅ `/api/admin/logs` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/check-tracking` (low)
- ✅ `/api/debug-tracking` (low)
- ✅ `/api/google-sheets/execute-script` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/batch` (low)
- ✅ `/api/orders/verify` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/history` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/shipped/debug` (low)

### `part_links` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/inventory/parts-graph` (low)

### `payroll_settings` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/payroll/settings` (low)

### `pending_skus` — 1 routes, 1 not yet GUC-safe

- ⛔ `/api/receiving/pending-check` (medium)

### `photo_analysis` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/admin/photos/stats` (low)

### `photo_entity_links` — 6 routes, 0 not yet GUC-safe

- ✅ `/api/packing-logs/history` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/photos/[id]` (low)
- ✅ `/api/photos/download-zip` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/sku/by-tracking` (low)

### `photo_jobs` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/admin/photos/stats` (low)

### `photo_storage` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/admin/photos/stats` (low)

### `photos` — 72 routes, 14 not yet GUC-safe

- ✅ `/api/admin/organization/settings` (low)
- ⛔ `/api/admin/photos/mirror` (medium)
- ✅ `/api/admin/photos/stats` (low)
- ⛔ `/api/cron/photos/analyze` (medium)
- ⛔ `/api/cron/photos/drive-mirror` (medium)
- ⛔ `/api/cron/photos/nas-mirror` (medium)
- ✅ `/api/documents/[id]/content` (low)
- ⛔ `/api/integrations/google-drive/callback` (medium)
- ⛔ `/api/integrations/google-drive/connect` (medium)
- ⛔ `/api/integrations/google-drive/health` (medium)
- ✅ `/api/inventory-photos` (low)
- ⛔ `/api/nas-config` (medium)
- ⛔ `/api/nas-dev/[[...path]]` (critical)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/packerlogs` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/history` (low)
- ✅ `/api/packing-logs/save-photo` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/packing-photos` (low)
- ✅ `/api/packing-photos/counts` (low)
- ✅ `/api/photos/[id]` (low)
- ✅ `/api/photos/[id]/aspect` (low)
- ✅ `/api/photos/[id]/claim-stage` (low)
- ✅ `/api/photos/[id]/content` (low)
- ✅ `/api/photos/[id]/context` (low)
- ✅ `/api/photos/[id]/labels` (low)
- ✅ `/api/photos/[id]/reassign` (low)
- ⛔ `/api/photos/analyze` (medium)
- ✅ `/api/photos/download-zip` (low)
- ⛔ `/api/photos/drive-backup` (medium)
- ✅ `/api/photos/image-types` (low)
- ✅ `/api/photos/labels` (low)
- ✅ `/api/photos/labels/[id]` (low)
- ✅ `/api/photos/labels/bulk-apply` (low)
- ✅ `/api/photos/library` (low)
- ✅ `/api/photos/library/folders` (low)
- ✅ `/api/photos/library/ids` (low)
- ✅ `/api/photos/links` (low)
- ✅ `/api/photos/listing-gallery` (low)
- ⛔ `/api/photos/nas-backup` (medium)
- ⛔ `/api/photos/saved-views` (medium)
- ⛔ `/api/photos/saved-views/[id]` (medium)
- ✅ `/api/photos/share` (low)
- ✅ `/api/photos/share-packs` (low)
- ✅ `/api/photos/share-packs/[token]` (low)
- ✅ `/api/photos/share-packs/[token]/zip` (low)
- ✅ `/api/photos/upload` (low)
- ✅ `/api/photos/upload/video` (low)
- ✅ `/api/photos/upload/video/[id]/finalize` (low)
- ✅ `/api/photos/videos/[id]` (low)
- ✅ `/api/photos/videos/[id]/content` (low)
- ✅ `/api/receiving-photos` (low)
- ✅ `/api/receiving/inbound/orders` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/triage/done` (low)
- ✅ `/api/receiving/unfound-queue` (low)
- ✅ `/api/receiving/zendesk-claim` (low)
- ✅ `/api/receiving/zendesk-claim/preview` (low)
- ✅ `/api/repair-service/[id]/photos` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/photos` (low)
- ✅ `/api/serial-units/[id]/timeline-photos` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/sku/[id]/photos` (low)
- ✅ `/api/sku/by-tracking` (low)
- ✅ `/api/staff/[id]/avatar` (low)
- ✅ `/api/support/suggest` (low)
- ✅ `/api/tasks/[id]/media` (low)
- ✅ `/api/zendesk/tickets/[id]/photos` (low)

### `picking_sessions` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/timeline` (low)

### `platform_accounts` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/ebay/callback` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)

### `platforms` — 5 routes, 0 not yet GUC-safe

- ✅ `/api/catalog/platforms` (low)
- ✅ `/api/catalog/platforms/[id]` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/resolve` (low)

### `printer_profiles` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/print/dispatch` (low)

### `product_brands` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/inventory/sku-search` (low)

### `product_manuals` — 19 routes, 2 not yet GUC-safe

- ✅ `/api/manuals/recent` (low)
- ✅ `/api/manuals/resolve` (low)
- ✅ `/api/manuals/upsert` (low)
- ✅ `/api/orders/[id]/manuals` (low)
- ✅ `/api/orders/[id]/manuals/[manualId]` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/product-manuals` (low)
- ⛔ `/api/product-manuals/assign` (medium)
- ✅ `/api/product-manuals/bulk` (low)
- ✅ `/api/product-manuals/by-category` (low)
- ✅ `/api/product-manuals/rename-folder` (low)
- ✅ `/api/product-manuals/search` (low)
- ✅ `/api/product-manuals/sync` (low)
- ✅ `/api/product-manuals/thumbnail` (low)
- ✅ `/api/product-manuals/upload` (low)
- ⛔ `/api/product-manuals/upsert` (medium)
- ✅ `/api/receiving-lines/[id]/manuals` (low)
- ✅ `/api/receiving-lines/[id]/testing-bundle` (low)
- ✅ `/api/sku-catalog/[id]/manuals` (low)

### `product_parcel_dims` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/products/[sku]` (low)

### `qc_check_templates` — 5 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines/[id]/qc-checks` (low)
- ✅ `/api/serial-units/[id]/checklist` (low)
- ✅ `/api/serial-units/[id]/checklist/bulk` (low)
- ✅ `/api/sku-catalog/[id]/qc-checks` (low)
- ✅ `/api/sku-catalog/search` (low)

### `rag_document_chunks` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/rag/documents` (low)
- ✅ `/api/rag/search` (low)

### `rag_documents` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/rag/documents` (low)

### `reason_codes` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/reason-codes` (low)

### `receiving_carton` — 36 routes, 0 not yet GUC-safe

- ✅ `/api/local-pickups` (low)
- ✅ `/api/receiving-entry` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/incoming/delivered-unscanned` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/receiving-lines/incoming/summary` (low)
- ✅ `/api/receiving-lines/incoming/sync-one` (low)
- ✅ `/api/receiving-logs` (low)
- ✅ `/api/receiving-logs/search` (low)
- ✅ `/api/receiving-photos` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/[id]/amazon-return-lookup` (low)
- ✅ `/api/receiving/[id]/inventory-sync` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/receiving/lines/[id]/loss` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/receiving/po/[poId]/attach-box` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/touch-scan` (low)
- ✅ `/api/receiving/triage/done` (low)
- ✅ `/api/receiving/triage/metrics` (low)
- ✅ `/api/receiving/triage/staging-map` (low)
- ✅ `/api/receiving/unfound-queue` (low)
- ✅ `/api/scan/resolve` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/tracking-exceptions` (low)
- ✅ `/api/tracking-exceptions/[id]` (low)
- ✅ `/api/tracking-exceptions/[id]/refresh` (low)
- ✅ `/api/work-orders` (low)
- ✅ `/api/zoho/purchase-orders/receive` (low)

### `receiving_exceptions` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/receiving/lines/[id]/advance` (low)
- ✅ `/api/receiving/mark-received` (low)

### `receiving_line` — 36 routes, 0 not yet GUC-safe

- ✅ `/api/audit-log/report` (low)
- ✅ `/api/receiving-entry` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/counts` (low)
- ✅ `/api/receiving-lines/incoming/delivered-unscanned` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/receiving-lines/incoming/summary` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/receiving/lines/[id]/condition` (low)
- ✅ `/api/receiving/lines/[id]/inventory-note` (low)
- ✅ `/api/receiving/lines/[id]/label-previewed` (low)
- ✅ `/api/receiving/lines/[id]/label-printed` (low)
- ✅ `/api/receiving/lines/[id]/loss` (low)
- ✅ `/api/receiving/lines/[id]/move` (low)
- ✅ `/api/receiving/lines/[id]/putaway` (low)
- ✅ `/api/receiving/lines/[id]/serial-absent` (low)
- ✅ `/api/receiving/lines/[id]/stage` (low)
- ✅ `/api/receiving/lines/[id]/status` (low)
- ✅ `/api/receiving/lines/[id]/units/[unitId]/condition` (low)
- ✅ `/api/receiving/lines/[id]/units/[unitId]/serial-absent` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/receiving/po/[poId]/attach-box` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/scan-serial` (low)
- ✅ `/api/receiving/serials` (low)
- ✅ `/api/receiving/triage/done` (low)
- ✅ `/api/receiving/zendesk-claim/archive-only` (low)
- ✅ `/api/reports/records/export` (low)
- ✅ `/api/zoho/purchase-orders/receive` (low)

### `receiving_line_facts` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines/incoming/details` (low)

### `receiving_line_putaway` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving/lines/[id]/stage` (low)

### `receiving_line_testing` — 11 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/counts` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lines/[id]/condition` (low)
- ✅ `/api/receiving/lines/[id]/label-previewed` (low)
- ✅ `/api/receiving/lines/[id]/label-printed` (low)
- ✅ `/api/receiving/lines/[id]/serial-absent` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po/[poId]` (low)

### `receiving_line_testing_opens` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/qc/receiving-lines/open` (low)

### `receiving_line_unit` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/receiving/lines/[id]/units/[unitId]/condition` (low)
- ✅ `/api/receiving/lines/[id]/units/[unitId]/serial-absent` (low)

### `receiving_line_views` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines/view` (low)

### `receiving_line_zoho` — 17 routes, 0 not yet GUC-safe

- ✅ `/api/audit-log/report` (low)
- ✅ `/api/receiving-entry` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/incoming/delivered-unscanned` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/receiving-lines/incoming/summary` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lines/[id]/inventory-note` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/receiving/po/[poId]/attach-box` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/scan-serial` (low)

### `receiving_scans` — 7 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/incoming/summary` (low)
- ✅ `/api/receiving-logs` (low)
- ✅ `/api/receiving-photos` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/tracking-exceptions/[id]/refresh` (low)

### `receiving_triage` — 12 routes, 0 not yet GUC-safe

- ✅ `/api/local-pickups` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-logs` (low)
- ✅ `/api/receiving-photos` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/triage/done` (low)
- ✅ `/api/receiving/triage/metrics` (low)
- ✅ `/api/receiving/triage/staging-map` (low)

### `receiving_unbox` — 9 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-logs` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/touch-scan` (low)
- ✅ `/api/receiving/triage/metrics` (low)
- ✅ `/api/receiving/unfound-queue` (low)

### `repair_actions` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/repair/actions/[id]` (low)

### `repair_service` — 10 routes, 0 not yet GUC-safe

- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/kiosk/repair/[id]/label-printed` (low)
- ✅ `/api/kiosk/visit/[id]/label-printed` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/repair-service/[id]/print-log` (low)
- ✅ `/api/repair-service/next` (low)
- ✅ `/api/repair-service/out-of-stock` (low)
- ✅ `/api/repair-service/pickup` (low)
- ✅ `/api/repair-service/repaired` (low)
- ✅ `/api/work-orders` (low)

### `replenishment_requests` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/audit-log/report` (low)
- ✅ `/api/replenish/shipped-fifo` (low)

### `rma_authorizations` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/timeline` (low)

### `serial_unit_condition_history` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/grade` (low)

### `serial_unit_provenance` — 5 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/identify-serial` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/sku/by-tracking` (low)

### `serial_units` — 40 routes, 0 not yet GUC-safe

- ✅ `/api/fba/items/[id]/link-unit` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/inventory-events` (low)
- ✅ `/api/inventory/units` (low)
- ✅ `/api/orders/[id]/amendments` (low)
- ✅ `/api/orders/[id]/release` (low)
- ✅ `/api/orders/[id]/substitute` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/pack/ship` (low)
- ✅ `/api/picking/units/scan` (low)
- ✅ `/api/picking/units/unscan` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/qc/recent` (low)
- ✅ `/api/quality/dashboard` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/identify-serial` (low)
- ✅ `/api/receiving/lines/[id]/move` (low)
- ✅ `/api/receiving/lines/[id]/putaway` (low)
- ✅ `/api/receiving/lines/[id]/putaway/reverse` (low)
- ✅ `/api/receiving/lines/[id]/status` (low)
- ✅ `/api/receiving/lines/[id]/timeline` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/returns/undo` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/allocate` (low)
- ✅ `/api/serial-units/[id]/checklist` (low)
- ✅ `/api/serial-units/[id]/checklist/bulk` (low)
- ✅ `/api/serial-units/[id]/failure-tags` (low)
- ✅ `/api/serial-units/[id]/grade` (low)
- ✅ `/api/serial-units/[id]/hold` (low)
- ✅ `/api/serial-units/[id]/move` (low)
- ✅ `/api/serial-units/[id]/photos` (low)
- ✅ `/api/serial-units/[id]/quality` (low)
- ✅ `/api/serial-units/[id]/release` (low)
- ✅ `/api/serial-units/[id]/timeline-photos` (low)
- ✅ `/api/sku/by-tracking` (low)
- ✅ `/api/workflow/flow-audit` (low)

### `shifts` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/shifts` (low)
- ✅ `/api/shifts/[id]/cover` (low)

### `shipment_tracking_events` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/carrier-events` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)

### `shipping_label_purchases` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/shipping/order-labels/purchase` (low)

### `shipping_tracking_numbers` — 54 routes, 0 not yet GUC-safe

- ✅ `/api/admin/logs` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/check-tracking` (low)
- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/debug-tracking` (low)
- ✅ `/api/ebay/search` (low)
- ✅ `/api/fba/board` (low)
- ✅ `/api/fba/board/[fnsku]/entries` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]` (low)
- ✅ `/api/fba/shipments/[id]/tracking` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/mark-shipped` (low)
- ✅ `/api/fba/shipments/split-for-paired-review` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/orders/[id]/carrier-events` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/assign` (low)
- ✅ `/api/orders/backfill/ebay` (low)
- ✅ `/api/orders/backfill/ecwid` (low)
- ✅ `/api/orders/batch` (low)
- ✅ `/api/orders/integrity-check` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/orders/next` (low)
- ✅ `/api/orders/pack-placement/move` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/orders/verify` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/draft` (low)
- ✅ `/api/packing-logs/history` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/picking/desk/serial` (low)
- ✅ `/api/receiving-entry` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/receiving-lines/incoming/summary` (low)
- ✅ `/api/receiving-logs` (low)
- ✅ `/api/receiving-logs/search` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/[id]/amazon-return-lookup` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/receiving/lines/[id]/loss` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/triage/done` (low)
- ✅ `/api/scan-tracking` (low)
- ✅ `/api/shipped/debug` (low)
- ✅ `/api/shipped/lookup-order` (low)
- ✅ `/api/shipped/scan-out` (low)

### `sku` — 212 routes, 8 not yet GUC-safe

- ✅ `/api/activity/feed` (low)
- ✅ `/api/admin/fba-fnskus` (low)
- ✅ `/api/admin/fba-fnskus/[fnsku]` (low)
- ✅ `/api/admin/fba-fnskus/upload` (low)
- ✅ `/api/assignments/sku-search` (low)
- ✅ `/api/assistant/chat` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/audit-log/sku` (low)
- ✅ `/api/audit/sku/[sku]` (low)
- ✅ `/api/cron/feed-membership-projection` (low)
- ✅ `/api/cron/inventory/drift-check` (low)
- ✅ `/api/cron/stock-alerts` (low)
- ✅ `/api/cycle-counts/campaigns` (low)
- ✅ `/api/cycle-counts/campaigns/[id]` (low)
- ✅ `/api/cycle-counts/lines/[id]` (low)
- ✅ `/api/ebay/search` (low)
- ⛔ `/api/ecwid/order-search` (high)
- ⛔ `/api/ecwid/products/search` (high)
- ✅ `/api/ecwid/recent-repair-orders` (low)
- ✅ `/api/ecwid/sync-exception-tracking` (low)
- ✅ `/api/favorites` (low)
- ✅ `/api/favorites/[id]` (low)
- ✅ `/api/fba/board` (low)
- ✅ `/api/fba/board/[fnsku]/entries` (low)
- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/fba/fnskus` (low)
- ✅ `/api/fba/fnskus/[fnsku]` (low)
- ✅ `/api/fba/fnskus/bulk` (low)
- ✅ `/api/fba/fnskus/search` (low)
- ✅ `/api/fba/fnskus/validate` (low)
- ✅ `/api/fba/items/[id]/link-unit` (low)
- ✅ `/api/fba/items/queue` (low)
- ✅ `/api/fba/items/scan` (low)
- ✅ `/api/fba/logs` (low)
- ✅ `/api/fba/logs/[id]` (low)
- ✅ `/api/fba/logs/summary` (low)
- ✅ `/api/fba/print-queue` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]/items` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/fba/shipments/today/duplicate-yesterday` (low)
- ✅ `/api/fba/shipments/today/items` (low)
- ✅ `/api/get-title-by-sku` (low)
- ✅ `/api/inventory-events` (low)
- ✅ `/api/inventory-photos` (low)
- ✅ `/api/inventory/alerts` (low)
- ✅ `/api/inventory/alerts/[id]/ack` (low)
- ✅ `/api/inventory/items/search` (low)
- ✅ `/api/inventory/parts-graph` (low)
- ✅ `/api/inventory/sku-search` (low)
- ✅ `/api/inventory/units` (low)
- ✅ `/api/kiosk/intake` (low)
- ✅ `/api/kiosk/repair/issues` (low)
- ✅ `/api/label-manifests` (low)
- ✅ `/api/local-pickup-orders` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/local-pickup-orders/[id]/finalize` (low)
- ✅ `/api/local-pickup-orders/[id]/items` (low)
- ✅ `/api/local-pickup-orders/[id]/items/[itemId]` (low)
- ✅ `/api/local-pickups` (low)
- ✅ `/api/locations/[barcode]` (low)
- ✅ `/api/locations/[barcode]/pair-candidates` (low)
- ✅ `/api/locations/[barcode]/swap` (low)
- ✅ `/api/manuals/recent` (low)
- ✅ `/api/manuals/resolve` (low)
- ✅ `/api/manuals/upsert` (low)
- ✅ `/api/need-to-order` (low)
- ✅ `/api/orders/[id]/amazon-refresh` (low)
- ✅ `/api/orders/[id]/cage-release` (low)
- ✅ `/api/orders/[id]/pack-checklist` (low)
- ✅ `/api/orders/[id]/release` (low)
- ✅ `/api/orders/[id]/substitute` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/assign` (low)
- ✅ `/api/orders/backfill/ebay` (low)
- ✅ `/api/orders/backfill/ecwid` (low)
- ✅ `/api/orders/backfill/ecwid-price` (low)
- ✅ `/api/orders/batch` (low)
- ✅ `/api/orders/delete` (low)
- ✅ `/api/orders/import-csv` (low)
- ⛔ `/api/orders/import/extract-capture` (medium)
- ✅ `/api/orders/intake/assignees` (low)
- ✅ `/api/orders/integrity-check` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/orders/missing-parts` (low)
- ✅ `/api/orders/next` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/pack/ship` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/history` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/pending-skus` (low)
- ✅ `/api/photos/listing-gallery` (low)
- ✅ `/api/picking/desk/sku` (low)
- ✅ `/api/picking/units/scan` (low)
- ✅ `/api/post-multi-sn` (low)
- ✅ `/api/print/dispatch` (low)
- ✅ `/api/product-manuals` (low)
- ✅ `/api/product-manuals/by-category` (low)
- ✅ `/api/product-manuals/search` (low)
- ✅ `/api/product-manuals/upload` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/qc/recent` (low)
- ✅ `/api/quality/dashboard` (low)
- ✅ `/api/receiving-lines` (low)
- ✅ `/api/receiving-lines/[id]/qc-checks` (low)
- ✅ `/api/receiving-lines/[id]/testing-bundle` (low)
- ✅ `/api/receiving-lines/incoming/delivered-unscanned` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/receiving/inbound/import-ebay` (low)
- ✅ `/api/receiving/lines/[id]/inventory-note` (low)
- ✅ `/api/receiving/lines/[id]/move` (low)
- ✅ `/api/receiving/lines/[id]/putaway` (low)
- ✅ `/api/receiving/lines/[id]/putaway/reverse` (low)
- ✅ `/api/receiving/lines/[id]/status` (low)
- ✅ `/api/receiving/lines/[id]/timeline` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/match` (low)
- ⛔ `/api/receiving/pending-check` (medium)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/po-search` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/receiving/po/list` (low)
- ✅ `/api/receiving/relink` (low)
- ✅ `/api/receiving/scan-serial` (low)
- ✅ `/api/receiving/triage/done` (low)
- ✅ `/api/receiving/visual-identify` (low)
- ✅ `/api/repair-service/next` (low)
- ✅ `/api/repair/actions` (low)
- ✅ `/api/repair/actions/[id]` (low)
- ✅ `/api/repair/ecwid-products` (low)
- ✅ `/api/repair/issues` (low)
- ✅ `/api/repair/square-payment-link` (low)
- ✅ `/api/replenish/shipped-fifo` (low)
- ✅ `/api/reports/dead-stock` (low)
- ✅ `/api/reports/records/export` (low)
- ✅ `/api/reports/velocity` (low)
- ✅ `/api/returns/undo` (low)
- ✅ `/api/scan/resolve` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/allocate` (low)
- ✅ `/api/serial-units/[id]/checklist` (low)
- ⛔ `/api/serial-units/[id]/data-wipe` (medium)
- ✅ `/api/serial-units/[id]/grade` (low)
- ✅ `/api/serial-units/[id]/move` (low)
- ✅ `/api/serial-units/[id]/photos` (low)
- ✅ `/api/serial-units/[id]/test` (low)
- ✅ `/api/serial-units/lookup` (low)
- ✅ `/api/shipped` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/shipped/submit` (low)
- ✅ `/api/sku` (low)
- ✅ `/api/sku-catalog` (low)
- ✅ `/api/sku-catalog/[id]` (low)
- ✅ `/api/sku-catalog/[id]/composition` (low)
- ✅ `/api/sku-catalog/[id]/kit-parts` (low)
- ✅ `/api/sku-catalog/[id]/manuals` (low)
- ✅ `/api/sku-catalog/[id]/platform-ids` (low)
- ✅ `/api/sku-catalog/[id]/qc-checks` (low)
- ✅ `/api/sku-catalog/[id]/similar` (low)
- ✅ `/api/sku-catalog/flag-missing` (low)
- ✅ `/api/sku-catalog/graph/[skuId]/children` (low)
- ✅ `/api/sku-catalog/graph/[skuId]/parents` (low)
- ✅ `/api/sku-catalog/graph/[skuId]/tree` (low)
- ✅ `/api/sku-catalog/graph/relationships` (low)
- ✅ `/api/sku-catalog/graph/relationships/[id]` (low)
- ✅ `/api/sku-catalog/pair-ecwid` (low)
- ✅ `/api/sku-catalog/pair-suggestions` (low)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/provisional` (low)
- ✅ `/api/sku-catalog/provisional/[sku]` (low)
- ✅ `/api/sku-catalog/provisional/merge` (low)
- ✅ `/api/sku-catalog/resolve` (low)
- ✅ `/api/sku-catalog/search` (low)
- ✅ `/api/sku-catalog/search-unmatched` (low)
- ✅ `/api/sku-catalog/suggest-for-item` (low)
- ✅ `/api/sku-catalog/sync-ecwid-products` (low)
- ✅ `/api/sku-catalog/sync-ecwid-titles` (low)
- ✅ `/api/sku-catalog/unpaired` (low)
- ✅ `/api/sku-catalog/unpaired-ecwid` (low)
- ✅ `/api/sku-stock` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/sku-stock/[sku]/bins` (low)
- ✅ `/api/sku/[id]/photos` (low)
- ✅ `/api/sku/by-tracking` (low)
- ✅ `/api/sku/lookup` (low)
- ✅ `/api/sku/serials-from-code` (low)
- ✅ `/api/stations/handoff` (low)
- ✅ `/api/stock-alerts` (low)
- ✅ `/api/studio/items/stuck` (low)
- ✅ `/api/tracking-exceptions/[id]/refresh` (low)
- ✅ `/api/transfers` (low)
- ✅ `/api/units/next-id` (low)
- ✅ `/api/units/resolve-id` (low)
- ✅ `/api/update-sku-location` (low)
- ⛔ `/api/walk-in/catalog` (medium)
- ⛔ `/api/walk-in/sync` (medium)
- ✅ `/api/warranty/claims` (low)
- ✅ `/api/warranty/claims/bulk` (low)
- ✅ `/api/warranty/reports/export` (low)
- ✅ `/api/webhooks/square` (low)
- ✅ `/api/work-orders` (low)
- ⛔ `/api/zoho/purchase-orders` (medium)
- ✅ `/api/zoho/purchase-orders/receive` (low)

### `sku_catalog` — 46 routes, 0 not yet GUC-safe

- ✅ `/api/cron/sku-catalog/refresh-suggestions` (low)
- ✅ `/api/ecwid/recent-repair-orders` (low)
- ✅ `/api/get-title-by-sku` (low)
- ✅ `/api/inventory-events` (low)
- ✅ `/api/inventory/sku-search` (low)
- ✅ `/api/inventory/units` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/local-pickups` (low)
- ✅ `/api/manuals/recent` (low)
- ✅ `/api/manuals/resolve` (low)
- ✅ `/api/manuals/upsert` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/product-manuals/bulk` (low)
- ✅ `/api/product-manuals/by-category` (low)
- ✅ `/api/product-manuals/rename-folder` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/receiving-lines/[id]/ensure-catalog` (low)
- ✅ `/api/receiving-lines/[id]/manuals` (low)
- ✅ `/api/receiving-lines/[id]/testing-bundle` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/po-search` (low)
- ✅ `/api/receiving/po/[poId]` (low)
- ✅ `/api/replenish/shipped-fifo` (low)
- ✅ `/api/reports/dead-stock` (low)
- ✅ `/api/reports/velocity` (low)
- ✅ `/api/scan/resolve` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/checklist` (low)
- ✅ `/api/serial-units/[id]/checklist/bulk` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/sku` (low)
- ✅ `/api/sku-catalog/[id]/manuals` (low)
- ✅ `/api/sku-catalog/[id]/similar` (low)
- ✅ `/api/sku-catalog/pair-suggestions` (low)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/resolve` (low)
- ✅ `/api/sku-catalog/search` (low)
- ✅ `/api/sku-catalog/search-unmatched` (low)
- ✅ `/api/sku-catalog/suggest-for-item` (low)
- ✅ `/api/sku-catalog/sync-ecwid-titles` (low)
- ✅ `/api/sku-stock` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/sku-stock/[sku]/bins` (low)
- ✅ `/api/units/next-id` (low)
- ✅ `/api/units/resolve-id` (low)

### `sku_kit_parts` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/sku-catalog/[id]/kit-parts` (low)
- ✅ `/api/sku-kit-parts/[id]/document` (low)

### `sku_management` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/sku-manager` (low)

### `sku_pairing_suggestions` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/sku-catalog/pairing-queue` (low)

### `sku_platform_ids` — 22 routes, 0 not yet GUC-safe

- ✅ `/api/ecwid/recent-repair-orders` (low)
- ✅ `/api/get-title-by-sku` (low)
- ✅ `/api/local-pickups` (low)
- ✅ `/api/manuals/recent` (low)
- ✅ `/api/manuals/resolve` (low)
- ✅ `/api/manuals/upsert` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/receiving/add-unmatched-line` (low)
- ✅ `/api/reports/dead-stock` (low)
- ✅ `/api/reports/velocity` (low)
- ✅ `/api/sku` (low)
- ✅ `/api/sku-catalog/pair` (low)
- ✅ `/api/sku-catalog/pair-suggestions` (low)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/resolve` (low)
- ✅ `/api/sku-catalog/run-migration` (low)
- ✅ `/api/sku-catalog/search` (low)
- ✅ `/api/sku-catalog/search-unmatched` (low)
- ✅ `/api/sku-catalog/sync-ecwid-products` (low)
- ✅ `/api/sku-stock` (low)
- ✅ `/api/sku-stock/[sku]/bins` (low)

### `sku_relationships` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/sku-catalog/graph/relationships/[id]` (low)

### `sku_stock` — 110 routes, 10 not yet GUC-safe

- ✅ `/api/assignments/sku-search` (low)
- ✅ `/api/assistant/chat` (low)
- ⛔ `/api/brands` (critical)
- ⛔ `/api/brands/[id]` (critical)
- ⛔ `/api/brands/[id]/products` (high)
- ⛔ `/api/brands/proposals` (high)
- ⛔ `/api/brands/proposals/[id]` (critical)
- ✅ `/api/cycle-counts/campaigns/[id]` (low)
- ⛔ `/api/ecwid/products/search` (high)
- ✅ `/api/failure-modes` (low)
- ✅ `/api/failure-modes/[id]` (low)
- ✅ `/api/favorites` (low)
- ✅ `/api/favorites/[id]` (low)
- ✅ `/api/get-title-by-sku` (low)
- ✅ `/api/identify` (low)
- ✅ `/api/inventory-events` (low)
- ✅ `/api/inventory/alerts` (low)
- ✅ `/api/inventory/bins-overview` (low)
- ✅ `/api/inventory/items/search` (low)
- ✅ `/api/inventory/parts-graph` (low)
- ✅ `/api/inventory/parts/links` (low)
- ✅ `/api/inventory/parts/links/[id]` (low)
- ✅ `/api/inventory/parts/links/not-a-part` (low)
- ✅ `/api/inventory/sku-search` (low)
- ✅ `/api/inventory/units` (low)
- ✅ `/api/locations` (low)
- ✅ `/api/locations/[barcode]` (low)
- ✅ `/api/locations/[barcode]/pair-candidates` (low)
- ✅ `/api/locations/[barcode]/properties` (low)
- ✅ `/api/manual-server/assign` (low)
- ⛔ `/api/manual-server/by-item` (high)
- ⛔ `/api/manual-server/unassigned` (high)
- ✅ `/api/manuals/resolve` (low)
- ✅ `/api/manuals/upsert` (low)
- ✅ `/api/need-to-order` (low)
- ✅ `/api/orders/[id]/pack-checklist` (low)
- ✅ `/api/packing-logs` (low)
- ⛔ `/api/packing/policy` (medium)
- ✅ `/api/pending-skus` (low)
- ✅ `/api/photos/[id]` (low)
- ✅ `/api/picking/desk/sku` (low)
- ✅ `/api/product-manuals` (low)
- ✅ `/api/product-manuals/by-category` (low)
- ✅ `/api/products/[sku]` (low)
- ✅ `/api/qc/codes` (low)
- ✅ `/api/qc/procedures` (low)
- ✅ `/api/quality/dashboard` (low)
- ✅ `/api/reason-codes` (low)
- ✅ `/api/reason-codes/[id]` (low)
- ✅ `/api/replenish/shipped-fifo` (low)
- ✅ `/api/reports/dead-stock` (low)
- ✅ `/api/reports/velocity` (low)
- ✅ `/api/rooms` (low)
- ✅ `/api/rooms/[room]` (low)
- ✅ `/api/rooms/reorder` (low)
- ✅ `/api/scan/history` (low)
- ✅ `/api/scan/resolve` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/failure-tags` (low)
- ✅ `/api/serial-units/[id]/hold` (low)
- ✅ `/api/serial-units/[id]/photos` (low)
- ✅ `/api/serial-units/[id]/quality` (low)
- ✅ `/api/serial-units/[id]/release` (low)
- ✅ `/api/serial-units/[id]/timeline-photos` (low)
- ✅ `/api/sku` (low)
- ✅ `/api/sku-catalog` (low)
- ✅ `/api/sku-catalog/[id]` (low)
- ✅ `/api/sku-catalog/[id]/composition` (low)
- ✅ `/api/sku-catalog/[id]/kit-parts` (low)
- ✅ `/api/sku-catalog/[id]/manuals` (low)
- ✅ `/api/sku-catalog/[id]/platform-ids` (low)
- ✅ `/api/sku-catalog/[id]/qc-checks` (low)
- ✅ `/api/sku-catalog/[id]/similar` (low)
- ✅ `/api/sku-catalog/by-item-number` (low)
- ⛔ `/api/sku-catalog/composition/batch` (medium)
- ✅ `/api/sku-catalog/flag-missing` (low)
- ✅ `/api/sku-catalog/graph/[skuId]/children` (low)
- ✅ `/api/sku-catalog/graph/[skuId]/parents` (low)
- ✅ `/api/sku-catalog/graph/[skuId]/tree` (low)
- ✅ `/api/sku-catalog/graph/relationships` (low)
- ✅ `/api/sku-catalog/graph/relationships/[id]` (low)
- ✅ `/api/sku-catalog/pair` (low)
- ✅ `/api/sku-catalog/pair-batch` (low)
- ✅ `/api/sku-catalog/pair-ecwid` (low)
- ✅ `/api/sku-catalog/pair-suggestions` (low)
- ✅ `/api/sku-catalog/pairing-queue` (low)
- ✅ `/api/sku-catalog/provisional` (low)
- ✅ `/api/sku-catalog/provisional/[sku]` (low)
- ✅ `/api/sku-catalog/provisional/merge` (low)
- ✅ `/api/sku-catalog/search` (low)
- ✅ `/api/sku-catalog/search-unmatched` (low)
- ✅ `/api/sku-catalog/suggest-for-item` (low)
- ✅ `/api/sku-catalog/suggest-pairings` (low)
- ✅ `/api/sku-catalog/unpaired` (low)
- ✅ `/api/sku-catalog/unpaired-ecwid` (low)
- ✅ `/api/sku-manager` (low)
- ✅ `/api/sku-stock` (low)
- ✅ `/api/sku-stock/[sku]` (low)
- ✅ `/api/sku-stock/[sku]/bins` (low)
- ✅ `/api/sku/[id]/photos` (low)
- ✅ `/api/sku/by-tracking` (low)
- ✅ `/api/sku/lookup` (low)
- ✅ `/api/sku/serials-from-code` (low)
- ✅ `/api/station-commands/aliases` (low)
- ✅ `/api/station-commands/aliases/[id]` (low)
- ✅ `/api/stock-alerts` (low)
- ✅ `/api/update-sku-location` (low)
- ✅ `/api/warehouses` (low)
- ✅ `/api/work-orders` (low)
- ✅ `/api/zoho/items/[id]/image` (low)

### `sku_stock_ledger` — 10 routes, 0 not yet GUC-safe

- ✅ `/api/activity/feed` (low)
- ✅ `/api/fba/shipments/[id]/ship-units` (low)
- ✅ `/api/pack/ship` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/picking/desk/sku` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/reports/dead-stock` (low)
- ✅ `/api/reports/velocity` (low)
- ✅ `/api/returns/undo` (low)
- ✅ `/api/sku-stock/[sku]` (low)

### `staff` — 162 routes, 21 not yet GUC-safe

- ✅ `/api/activity/feed` (low)
- ✅ `/api/admin/audit` (low)
- ✅ `/api/admin/features` (low)
- ✅ `/api/admin/features/[id]` (low)
- ✅ `/api/admin/logs` (low)
- ✅ `/api/admin/org/export` (low)
- ✅ `/api/admin/roles` (low)
- ✅ `/api/admin/roles/[id]` (low)
- ✅ `/api/admin/sessions` (low)
- ✅ `/api/admin/staff` (low)
- ✅ `/api/admin/staff/[id]` (low)
- ✅ `/api/admin/staff/[id]/detail` (low)
- ✅ `/api/admin/staff/[id]/mobile-display-config` (low)
- ✅ `/api/admin/staff/[id]/passkeys` (low)
- ✅ `/api/admin/staff/[id]/passkeys/[pid]` (low)
- ✅ `/api/admin/staff/[id]/permissions` (low)
- ✅ `/api/admin/staff/[id]/reset-pin` (low)
- ✅ `/api/admin/staff/[id]/roles` (low)
- ✅ `/api/admin/staff/[id]/sessions` (low)
- ✅ `/api/admin/staff/[id]/set-pin` (low)
- ✅ `/api/admin/staff/[id]/stations` (low)
- ✅ `/api/admin/staff/deactivate` (low)
- ✅ `/api/admin/staff/invite` (low)
- ✅ `/api/admin/staff/list` (low)
- ✅ `/api/admin/staff/reorder` (low)
- ✅ `/api/admin/staff/update` (low)
- ✅ `/api/assignments/sku-search` (low)
- ✅ `/api/assistant/chat` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/audit-log/staff` (low)
- ✅ `/api/audit-log/staff-directory` (low)
- ⛔ `/api/auth/account/passkey/authenticate/finish` (medium)
- ⛔ `/api/auth/account/signin` (medium)
- ⛔ `/api/auth/act-as-staff` (medium)
- ⛔ `/api/auth/email-login/verify` (high)
- ⛔ `/api/auth/enroll/[token]` (critical)
- ✅ `/api/auth/invitation/accept` (low)
- ✅ `/api/auth/oauth/[provider]/callback` (low)
- ⛔ `/api/auth/passkey/authenticate/finish` (critical)
- ⛔ `/api/auth/passkey/register/begin` (critical)
- ✅ `/api/auth/password-reset/confirm` (low)
- ⛔ `/api/auth/pin` (medium)
- ⛔ `/api/auth/pin/create` (critical)
- ⛔ `/api/auth/qr/authorize` (medium)
- ⛔ `/api/auth/qr/handoff/claim` (critical)
- ⛔ `/api/auth/qr/status` (high)
- ⛔ `/api/auth/session` (medium)
- ✅ `/api/auth/signin` (low)
- ⛔ `/api/auth/signup` (medium)
- ✅ `/api/auth/sso/callback` (low)
- ⛔ `/api/auth/staff-choice` (medium)
- ⛔ `/api/auth/staff-picker` (medium)
- ✅ `/api/auth/switch` (low)
- ✅ `/api/auth/switch-org` (low)
- ⛔ `/api/auth/verify-email` (high)
- ⛔ `/api/cron/staff-goals/history` (high)
- ✅ `/api/daily-checks` (low)
- ✅ `/api/daily-checks/items` (low)
- ✅ `/api/daily-checks/mark` (low)
- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/fba/fnsku-scan` (low)
- ✅ `/api/fba/items/queue` (low)
- ✅ `/api/fba/items/ready` (low)
- ✅ `/api/fba/items/scan` (low)
- ✅ `/api/fba/labels/bind` (low)
- ✅ `/api/fba/logs` (low)
- ✅ `/api/fba/logs/[id]` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/[id]` (low)
- ✅ `/api/fba/shipments/[id]/items` (low)
- ✅ `/api/fba/shipments/[id]/items/[itemId]` (low)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/fba/shipments/active-with-details` (low)
- ✅ `/api/fba/shipments/close` (low)
- ✅ `/api/fba/shipments/today` (low)
- ✅ `/api/inventory-events` (low)
- ✅ `/api/kiosk/local-pickup` (low)
- ✅ `/api/kiosk/staff-for-stepup` (low)
- ✅ `/api/kiosk/visit/[id]/receipt` (low)
- ✅ `/api/local-pickup-orders` (low)
- ✅ `/api/local-pickup-orders/[id]` (low)
- ✅ `/api/need-to-order/[id]` (low)
- ✅ `/api/operations/kpi-table` (low)
- ✅ `/api/orders/[id]/amendments` (low)
- ✅ `/api/orders/[id]/packing-checks` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/assign` (low)
- ✅ `/api/orders/batch` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/orders/missing-parts` (low)
- ✅ `/api/orders/next` (low)
- ✅ `/api/orders/queue-counts` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/org/accounts/merge` (low)
- ✅ `/api/packerlogs` (low)
- ⛔ `/api/packerlogs/counts` (medium)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/draft` (low)
- ✅ `/api/photos/[id]/content` (low)
- ✅ `/api/picking/desk/scan` (low)
- ✅ `/api/picking/desk/sku` (low)
- ✅ `/api/qc/recent` (low)
- ✅ `/api/realtime/token` (low)
- ✅ `/api/receiving-lines/counts` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lines/[id]/timeline` (low)
- ✅ `/api/receiving/mark-received` (low)
- ✅ `/api/receiving/mark-received-po` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/receiving/pending-unboxing` (low)
- ✅ `/api/receiving/touch-scan` (low)
- ✅ `/api/receiving/unbox-kpi` (low)
- ✅ `/api/repair-service/[id]/print-log` (low)
- ✅ `/api/repair-service/next` (low)
- ✅ `/api/replenishment/tasks/[id]/cancel` (low)
- ✅ `/api/replenishment/tasks/[id]/claim` (low)
- ✅ `/api/replenishment/tasks/[id]/complete` (low)
- ✅ `/api/replenishment/tasks/[id]/release` (low)
- ✅ `/api/reports/records/export` (low)
- ✅ `/api/rma` (low)
- ✅ `/api/rma/[id]/close` (low)
- ✅ `/api/rma/[id]/disposition` (low)
- ✅ `/api/rma/[id]/mark-received` (low)
- ✅ `/api/rma/disposition` (low)
- ✅ `/api/scan/history` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/serial-units/[id]/checklist` (low)
- ✅ `/api/serial-units/[id]/checklist/bulk` (low)
- ✅ `/api/settings` (low)
- ✅ `/api/shifts` (low)
- ✅ `/api/shifts/[id]/cover` (low)
- ✅ `/api/shipped` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/staff` (low)
- ✅ `/api/staff-goals` (low)
- ✅ `/api/staff-goals/history` (low)
- ✅ `/api/staff-goals/me` (low)
- ✅ `/api/staff-messages` (low)
- ✅ `/api/staff-preferences` (low)
- ✅ `/api/staff-todos` (low)
- ✅ `/api/staff/[id]/avatar` (low)
- ✅ `/api/staff/[id]/color` (low)
- ✅ `/api/staff/[id]/functional-roles` (low)
- ✅ `/api/staff/[id]/name` (low)
- ✅ `/api/staff/availability-rules` (low)
- ✅ `/api/staff/availability-today` (low)
- ✅ `/api/staff/schedule` (low)
- ⛔ `/api/staff/schedule/bulk` (medium)
- ✅ `/api/staff/schedule/week` (low)
- ✅ `/api/staff/schedule/week/copy` (low)
- ✅ `/api/studio/people` (low)
- ✅ `/api/threads/[id]/assign` (low)
- ✅ `/api/tracking-exceptions` (low)
- ✅ `/api/tracking-exceptions/[id]` (low)
- ⛔ `/api/v1/reminders` (medium)
- ✅ `/api/voicemails/[id]/followup` (low)
- ✅ `/api/warranty/claims` (low)
- ✅ `/api/warranty/claims/[id]/quote` (low)
- ✅ `/api/warranty/claims/[id]/rma` (low)
- ✅ `/api/warranty/claims/bulk` (low)
- ✅ `/api/zendesk/photo-ticket` (low)
- ✅ `/api/zendesk/tickets/[id]/assign` (low)

### `staff_availability_rules` — 7 routes, 1 not yet GUC-safe

- ✅ `/api/staff` (low)
- ✅ `/api/staff/availability-rules` (low)
- ✅ `/api/staff/availability-today` (low)
- ✅ `/api/staff/schedule` (low)
- ⛔ `/api/staff/schedule/bulk` (medium)
- ✅ `/api/staff/schedule/week` (low)
- ✅ `/api/staff/schedule/week/copy` (low)

### `staff_enrollments` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/admin/staff/invite` (low)

### `staff_functional_roles` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/staff` (low)

### `staff_goal_history` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/staff-goals/history` (low)

### `staff_goals` — 2 routes, 1 not yet GUC-safe

- ⛔ `/api/cron/staff-goals/history` (high)
- ✅ `/api/staff-goals` (low)

### `staff_passkeys` — 5 routes, 1 not yet GUC-safe

- ✅ `/api/admin/staff` (low)
- ✅ `/api/admin/staff/[id]/detail` (low)
- ✅ `/api/admin/staff/[id]/passkeys` (low)
- ✅ `/api/admin/staff/[id]/passkeys/[pid]` (low)
- ⛔ `/api/auth/enroll/[token]` (critical)

### `staff_schedule_overrides` — 6 routes, 1 not yet GUC-safe

- ✅ `/api/staff` (low)
- ✅ `/api/staff/availability-today` (low)
- ✅ `/api/staff/schedule` (low)
- ⛔ `/api/staff/schedule/bulk` (medium)
- ✅ `/api/staff/schedule/week` (low)
- ✅ `/api/staff/schedule/week/copy` (low)

### `staff_sessions` — 7 routes, 1 not yet GUC-safe

- ⛔ `/api/admin/org/delete` (medium)
- ✅ `/api/admin/org/export` (low)
- ✅ `/api/admin/sessions` (low)
- ✅ `/api/admin/staff/[id]/detail` (low)
- ✅ `/api/admin/staff/[id]/sessions` (low)
- ✅ `/api/admin/staff/deactivate` (low)
- ✅ `/api/shifts/[id]/cover` (low)

### `staff_stations` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/studio/people` (low)

### `staff_week_plans` — 6 routes, 1 not yet GUC-safe

- ✅ `/api/staff` (low)
- ✅ `/api/staff/availability-today` (low)
- ✅ `/api/staff/schedule` (low)
- ⛔ `/api/staff/schedule/bulk` (medium)
- ✅ `/api/staff/schedule/week` (low)
- ✅ `/api/staff/schedule/week/copy` (low)

### `staff_weekly_schedule` — 6 routes, 1 not yet GUC-safe

- ✅ `/api/staff` (low)
- ✅ `/api/staff/availability-today` (low)
- ✅ `/api/staff/schedule` (low)
- ⛔ `/api/staff/schedule/bulk` (medium)
- ✅ `/api/staff/schedule/week` (low)
- ✅ `/api/staff/schedule/week/copy` (low)

### `station_activity_logs` — 17 routes, 0 not yet GUC-safe

- ✅ `/api/activity/feed` (low)
- ✅ `/api/admin/logs` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/audit-log/staff-directory` (low)
- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/operations/kpi-table` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/check-shipped` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/picking/desk/delete` (low)
- ✅ `/api/picking/desk/logs/counts` (low)
- ✅ `/api/picking/desk/serial` (low)
- ✅ `/api/post-multi-sn` (low)
- ✅ `/api/replenish/shipped-fifo` (low)
- ✅ `/api/serial-units/[id]` (low)
- ✅ `/api/shipped/scan-out` (low)
- ✅ `/api/staff-goals` (low)

### `station_command_aliases` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/station-commands/aliases` (low)
- ✅ `/api/station-commands/aliases/[id]` (low)

### `station_definitions` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/stations` (low)
- ✅ `/api/stations/publish` (low)

### `station_scan_sessions` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/receiving-lines` (low)

### `stock_alerts` — 5 routes, 0 not yet GUC-safe

- ✅ `/api/cron/inventory/drift-check` (low)
- ✅ `/api/cron/stock-alerts` (low)
- ✅ `/api/inventory/alerts` (low)
- ✅ `/api/inventory/alerts/[id]/ack` (low)
- ✅ `/api/stock-alerts` (low)

### `suppliers` — 3 routes, 0 not yet GUC-safe

- ✅ `/api/kiosk/local-pickup` (low)
- ✅ `/api/suppliers` (low)
- ✅ `/api/suppliers/[id]` (low)

### `sync_cursors` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/admin/po-mirror/health` (low)

### `tech_serial_numbers` — 14 routes, 0 not yet GUC-safe

- ✅ `/api/admin/logs` (low)
- ✅ `/api/audit-log/report` (low)
- ✅ `/api/ebay/search` (low)
- ✅ `/api/fba/logs/summary` (low)
- ✅ `/api/google-sheets/execute-script` (low)
- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/orders/batch` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/picking/desk/delete` (low)
- ✅ `/api/picking/desk/serial` (low)
- ✅ `/api/post-multi-sn` (low)
- ✅ `/api/receiving/serials` (low)
- ✅ `/api/scan/resolve` (low)
- ✅ `/api/serial-units/[id]` (low)

### `tech_verifications` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/serial-units/[id]/checklist` (low)
- ✅ `/api/serial-units/[id]/checklist/bulk` (low)

### `testing_results` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/qc/recent` (low)

### `thread_messages` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/orders/[id]/timeline` (low)
- ✅ `/api/threads/[id]/messages` (low)

### `tool_registry` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/tool-forge/requests` (low)

### `tracking_exceptions` — 3 routes, 0 not yet GUC-safe

- ✅ `/api/tracking-exceptions` (low)
- ✅ `/api/tracking-exceptions/[id]` (low)
- ✅ `/api/tracking-exceptions/[id]/refresh` (low)

### `types` — 43 routes, 12 not yet GUC-safe

- ✅ `/api/assistant/chat` (low)
- ⛔ `/api/auth/account/passkey/authenticate/finish` (medium)
- ⛔ `/api/auth/account/passkey/register/finish` (critical)
- ⛔ `/api/auth/passkey/authenticate/finish` (critical)
- ⛔ `/api/auth/passkey/register/finish` (critical)
- ⛔ `/api/auth/qr/authorize` (medium)
- ✅ `/api/auth/step-up` (low)
- ✅ `/api/catalog/types` (low)
- ✅ `/api/catalog/types/[id]` (low)
- ✅ `/api/custom-fields/defs` (low)
- ✅ `/api/custom-fields/values` (low)
- ✅ `/api/daily-checks/items/[id]/links` (low)
- ✅ `/api/documents/[id]/content` (low)
- ⛔ `/api/exceptions` (medium)
- ✅ `/api/fba/shipments/[id]/trace` (low)
- ✅ `/api/kiosk/intake` (low)
- ✅ `/api/kiosk/price-approval` (low)
- ✅ `/api/labels` (low)
- ✅ `/api/operations/journey` (low)
- ✅ `/api/order-labels` (low)
- ✅ `/api/orders/[id]/documents/fetch` (low)
- ✅ `/api/orders/[id]/documents/print` (low)
- ✅ `/api/orders/[id]/documents/upload` (low)
- ✅ `/api/packerlogs` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/save-photo` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/packing/verification/queue` (low)
- ✅ `/api/photos/image-types` (low)
- ✅ `/api/photos/links` (low)
- ✅ `/api/photos/upload` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/repair/square-payment-link` (low)
- ✅ `/api/serial-units/[id]/grade` (low)
- ✅ `/api/serial-units/[id]/photos` (low)
- ⛔ `/api/shipping/track/register` (medium)
- ⛔ `/api/shipping/track/sync-one` (medium)
- ✅ `/api/staff/[id]/avatar` (low)
- ⛔ `/api/studio/catalog` (high)
- ⛔ `/api/studio/graph` (medium)
- ⛔ `/api/studio/templates` (high)
- ⛔ `/api/studio/templates/[id]` (high)
- ✅ `/api/work-orders` (low)

### `unfound_overlay` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/receiving/unfound-queue/[kind]/[id]` (low)
- ✅ `/api/receiving/unfound-queue/[kind]/[id]/push-to-zendesk` (low)

### `unit_failure_tags` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/quality/dashboard` (low)
- ✅ `/api/serial-units/[id]/failure-tags` (low)

### `unit_quality_scores` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/quality/dashboard` (low)

### `unit_repairs` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/quality/dashboard` (low)

### `voicemails` — 6 routes, 0 not yet GUC-safe

- ✅ `/api/integrations/nextiva/webhook/[token]` (low)
- ✅ `/api/voicemails` (low)
- ✅ `/api/voicemails/[id]` (low)
- ✅ `/api/voicemails/[id]/followup` (low)
- ✅ `/api/voicemails/[id]/link` (low)
- ✅ `/api/voicemails/[id]/recording` (low)

### `warehouses` — 2 routes, 1 not yet GUC-safe

- ✅ `/api/warehouses` (low)
- ⛔ `/api/zoho/oauth/authorize` (high)

### `warranty_claims` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/warranty/claims/[id]/restore` (low)
- ✅ `/api/warranty/claims/bulk/restore` (low)

### `work_assignments` — 23 routes, 0 not yet GUC-safe

- ✅ `/api/assignments/next` (low)
- ✅ `/api/assignments/sku-search` (low)
- ✅ `/api/check-tracking` (low)
- ✅ `/api/dashboard/operations` (low)
- ✅ `/api/debug-tracking` (low)
- ✅ `/api/ebay/search` (low)
- ✅ `/api/fba/shipments` (low)
- ✅ `/api/fba/shipments/today/duplicate-yesterday` (low)
- ✅ `/api/fba/shipments/today/items` (low)
- ✅ `/api/local-pickups` (low)
- ✅ `/api/orders/lookup/[orderId]` (low)
- ✅ `/api/orders/next` (low)
- ✅ `/api/orders/recent` (low)
- ✅ `/api/packing-logs` (low)
- ✅ `/api/packing-logs/update` (low)
- ✅ `/api/receiving-entry` (low)
- ✅ `/api/receiving/match` (low)
- ✅ `/api/repair-service/next` (low)
- ✅ `/api/repair-service/out-of-stock` (low)
- ✅ `/api/repair-service/pickup` (low)
- ✅ `/api/repair-service/repaired` (low)
- ✅ `/api/work-orders` (low)
- ✅ `/api/zoho/purchase-orders/receive` (low)

### `workflow_definitions` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/studio/definitions/[id]/discard` (low)
- ✅ `/api/studio/definitions/[id]/graph` (low)

### `workflow_edges` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/studio/definitions/[id]/graph` (low)
- ✅ `/api/studio/flow` (low)

### `workflow_node_stats` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/operations/roi` (low)
- ✅ `/api/studio/flow` (low)

### `workflow_nodes` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/studio/definitions/[id]/graph` (low)
- ✅ `/api/studio/flow` (low)

### `workflow_runs` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/operations/roi` (low)
- ✅ `/api/studio/flow` (low)

### `zoho_fulfillment_sync` — 2 routes, 0 not yet GUC-safe

- ✅ `/api/cron/zoho/fulfillment-sync` (low)
- ✅ `/api/zoho/fulfillment-sync` (low)

### `zoho_item_images` — 1 routes, 0 not yet GUC-safe

- ✅ `/api/zoho/items/[id]/image` (low)

### `zoho_po_mirror` — 13 routes, 0 not yet GUC-safe

- ✅ `/api/admin/po-gmail/triage/[id]/detail` (low)
- ✅ `/api/admin/po-mirror/health` (low)
- ✅ `/api/cron/zoho/po-sync` (low)
- ✅ `/api/receiving-lines/incoming/delivered-unscanned` (low)
- ✅ `/api/receiving-lines/incoming/details` (low)
- ✅ `/api/receiving-lines/incoming/inventory-refresh` (low)
- ✅ `/api/receiving-lines/incoming/match-email` (low)
- ✅ `/api/receiving-lines/incoming/refresh/stream` (low)
- ✅ `/api/receiving-lines/incoming/summary` (low)
- ✅ `/api/receiving/[id]` (low)
- ✅ `/api/receiving/lookup-po` (low)
- ✅ `/api/receiving/po-search` (low)
- ✅ `/api/receiving/po/[poId]/attach-box` (low)
