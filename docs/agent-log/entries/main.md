# Work-log — lane `main`

> Append-only. Newest at the bottom. Read via `pnpm worklog:tail`.

- `2026-07-15T10:58:09.272Z` · **main** · main · claude · P0 #1: per-lane dev ports + multi-active switcher — done
- `2026-07-15T10:58:09.329Z` · **main** · main · claude · P0 #2: global work-log construct — done · P0-2
- `2026-07-15T11:06:58.323Z` · **main** · main · claude · P1: agent-fs artifact map + contracts convention (compose, don't fork signals) — done · P1
- `2026-07-15T11:15:05.394Z` · **main** · main · claude · P2: crypto.randomUUID ESLint ban (6 sites -> safeRandomUUID) + verifier contract — done · P2
- `2026-07-15T11:38:11.833Z` · **main** · main · claude · verified user_reported_issues migration already applied+wired (memory was stale); fixed agent-fs Signals row — done
- `2026-07-15T11:41:05.970Z` · **main** · main · agent · Reorder /test modes to Testing|Shipping; fold testing-history into Testing empty state (TestingHistoryList when no line) — ok
- `2026-07-15T11:49:24.433Z` · **main** · main · agent · Shipping scan workspace: replace OrderPreviewPanel with StationSectionTabs + SKU↔serial pairing; migrate unbox/testing to StationSectionTabs SoT — ok
- `2026-07-15T12:30:24.939Z` · **main** · main · agent · Station terminal registry: tab-aware FloatingButton dock (surface×mode×tab); unbox Inventory notes → Save to inventory; triage/testing migrated — ok
- `2026-07-15T12:37:55.683Z` · **main** · main · agent · Promote CartonContextCard as station entity-context SoT (@/components/station/entity-context); wire Unbox/Testing adapters + docs — ok
- `2026-07-15T13:19:47.645Z` · **main** · main · agent · Replace ShippingOrderContextCard with CartonContextCard adapter; PoLineRow title anatomy in SKU pairing bubble — ok
- `2026-07-15T13:59:16.759Z` · **main** · main · agent · Heal STN organization_id orphans (19→1); Packed tracking chips blank under FORCE RLS — applied 2026-07-15b residual backfill; 0 broken packed rows; screenshot orders 4888/7432/7814 now return tracking under tenant GUC; no shipment_id cache misses
- `2026-07-15T13:59:42.556Z` · **main** · main · agent · Replace ShippingShippedHistoryRail with ShippingStaffShippedRail (shared RailRowBody anatomy + SHIPPED status for preview serial edit); tighten TestingRecentRail/TestingHistoryList to require personal tester scope — ok
- `2026-07-15T14:23:29.316Z` · **main** · main · agent · Dashboard Pending/Packed UX polish: remove chrome bg band, keep card corners rounded on scroll, Select always visible far-right — done
- `2026-07-15T14:31:23.453Z` · **main** · main · agent · Shipping sidebar: switch from /api/orders/recent ship-outs to History tech-logs feed (staff-scoped); History/KPI default to Me with staff=all for All — ok
- `2026-07-15T14:32:44.301Z` · **main** · main · claude · planned Reported-Issues console (UIC): plan doc + execution prompt + master-plan tickets UIC-1..5 — done · UIC
