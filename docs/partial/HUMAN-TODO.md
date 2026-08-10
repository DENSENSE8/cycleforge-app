# HUMAN-TODO — what's left for a person to do

**Created 2026-06-29. Updated 2026-07-11 (org-login-gate waves 0–8 code-complete; **all pending migrations applied + dogfood email login seeded**).** This is the single aggregated list of everything across `docs/partial/` (and cross-referenced plans) that **cannot
be done by the coding agent** — it needs your credentials, your business data, a running app, or a coordinated
deploy. All agent-completable code/doc work was finished and verified in prior passes. Latest dry-run: **454 migrations on record, 0 pending** — the org-login-gate auth/tenancy migrations (`2026-07-11b`, `2026-07-11c`, `2026-07-09a`) are **applied on the working Neon DB** (`ep-shiny-hall…`). Per-item detail
lives in each source plan doc's "Remaining work — handoff" section; this file just collects + prioritizes them.

**2026-07-11 scan notes (org login gate — primary update):**
- **Org login gate + SMB auth + dogfood naming burn-down is CODE COMPLETE** (waves 0–8). SoT:
  [`docs/todo/org-login-gate-EXECUTION-PROMPT.md`](../todo/org-login-gate-EXECUTION-PROMPT.md) (RUN NOTES + remaining HUMAN GATES).
  Apex no longer leaks org #1 staff; `/signin` is email-first; password reset, rate limits, `cf_sid` dual-read,
  Google/MS OAuth routes (env-gated), magic-link account-based, fail-closed burn-down (allowlist 28→10),
  naming wave-2 (`cf_*` keys / `cf-refresh-data`) all in tree. **Human work is add + verify only** → **§J**.
- **✅ Auth/tenancy migrations APPLIED (2026-07-11):** `2026-07-11b_password_reset_tokens.sql`,
  `2026-07-11c_sync_cursors_per_org_key.sql`, and `2026-07-09a_drop_usav_fallback_org_defaults.sql` are all on
  record in `schema_migrations` (dry-run: 0 pending). **Caveats that survive the apply:** (a) `11c` re-keyed
  `sync_cursors` to `(organization_id, resource)` — the matching `sync-cursors.ts` caller change (pass `orgId`,
  `ON CONFLICT (organization_id, resource)`) must ship so cursor writes hit the new key; (b) `09a` dropped the
  USAV column DEFAULTs — the fail-closed burn-down (allowlist ≤10) must be deployed so no path relies on the old
  default. RLS Phase E role template remains a separate hard stop (§J6 #5). See §J2 for the reconciled state.
- **✅ Dogfood email+password login SEEDED (2026-07-11):** `hi@usav.com` (admin, `auth_method=password`) →
  account `241aa86b-96d5-452a-b9ce-600232f45ffd`, staff `#122`, membership in org `…0001` (`usav`). Verified it
  authenticates end-to-end (`getAccountByEmail`→`verifyPassword`→one usable admin membership). Password handed to
  the owner in-session — rotate via Settings → Security. All other 15 dogfood staff remain PIN-only (no email).
- **✅ Two sign-in avenues + shared-account umbrella picker + QA org (2026-07-11):** new per-org setting
  `organizations.settings.staffLoginModel` = `'individual'` (default, per-person email/passkey/SSO logins) **or**
  `'shared'` (one shared workspace login → umbrella staff picker). On a `'shared'` org an email+password sign-in
  returns the staff roster (the shared login's OWN profile excluded) and picking a name signs you in AS that staff
  with **NO PIN** (`POST /api/auth/act-as-staff`, same-org gated — `src/lib/auth/act-as-staff.ts` + `.test.ts`).
  The `/signin` picker is a friendly avatar-initials list ("Sign in as a staff member"); no owner-continue button.
  Enabled (`'shared'`) on **usav** (org `…0001`, login `hi@usav.com`) and the **QA org** `qa` / "QA Testing"
  (`f642c683-…`, login `qa@cycleforge.ai`, passwords handed in-session). QA roster: Riley Receiver, Parker Packer,
  Tess Tester, Sam Shipper, Val Viewer (+ hidden QA Owner shell) — each role wired; catalog + default workflow
  seeded. `tsc` 0 errors; 24 auth/tenancy tests pass. **Never set `staffLoginModel:'shared'` on a real
  multi-tenant customer** unless they deliberately want the shared-login model.
- **`.env.example` blanks hook-blocked** — agent documented vars in `context/ENV-VARS.md` but could not write
  `.env.example`; you must paste the blank lines (listed in §J1).

**Older scan notes (2026-07-03, still relevant):**
- Polymorphic refactor, photo reassignment, eBay buyer POs + ShipStation, receiving/media/outbound waves — see §H / §E.
- Admin/Settings fragmentation + design-system adoption notes still apply.
- Working tree may hold uncommitted org-login-gate + parallel WIP — review via GitHub Desktop before deploy.

Legend: ☐ = to do · 🔑 needs credentials/external account · 🧠 needs your decision/data · 🚀 deploy-coupled ·
🏃 needs the app running to verify · 🔁 ongoing/living · 💤 deferred-by-design (no action unless you want it).

---

## ⭐ Start here — highest leverage, lowest effort

### Org login gate (2026-07-11 — do these first if shipping multi-tenant auth)

1. **☑ 🚀 Apply `2026-07-11b_password_reset_tokens.sql`** — **DONE** (applied on the working Neon DB; `password_reset_tokens` table exists). Re-apply on staging/prod at deploy time if those are separate DBs. → §J2
2. **☐ 🏃 Verify the auth matrix** — now testable with the seeded `hi@usav.com` login (apex staff empty, email login → `cf_sid`, station PIN on subdomain, reset flow). → §J5
3. **☐ 🔑 Prod env audit** — `AUTH_PINLESS_SIGNIN` **OFF**, `AUTH_V2_ENABLED` **ON**, Upstash Redis set. → §J3 / §A4
4. **☐ Paste blank env stubs into `.env.example`** (hook-blocked for the agent). → §J1
5. **☐ 🔑 Create Google OAuth Web client** (+ optional Microsoft) and set Vercel/local secrets — until then the button stays hidden. → §J4
6. **☐ Commit the org-login-gate tree** via GitHub Desktop once reviewed (no agent commit/push).

### Entity threads (2026-07-14 — conversation feature)

- **✅ APPLIED 2026-07-15 — `2026-07-14_entity_threads.sql` + `2026-07-15_thread_crud_connections.sql`** (both via
  `npm run db:migrate`). Entity Threads is LIVE: `entity_threads` + `thread_messages` + `thread_assignments` +
  `thread_links`, all FORCE RLS. (Base migration needed a one-line fix first — the RECEIVING/RECEIVING_LINE
  parent-delete triggers target the base tables `receiving_carton`/`receiving_line`, since `receiving`/
  `receiving_lines` are compat VIEWS and a row trigger can't sit on a view.) **Recommended next: `npm run
  tenancy:coverage`** to refresh the ground-truth for the two new tables, then smoke-test in the app:
  the Conversation panel + **status pill** (open/snoozed/resolved), **assignee chip**, **Linked strip**
  (connected order/tracking/serial/SKU), **per-message edit/delete**, and **Escalate → Internal / Support
  ticket** on an Order / Receiving line / Unit / Warranty claim.
- **Phase 7 decisions (resolved 2026-07-15):** (a) RLS parity was **already done** — `ticket_links` (wave4) +
  `support_ticket_assignments` (wave2) are already FORCE-enforced; no migration needed. (b) `ticket_links`
  ticket-optional — **not doing** (recommended against: nullable `entity_threads.support_ticket_id` +
  `provider='internal'` already give ticketless→ticket; relaxing the NOT NULL forks a redundant linkage axis).
  (c) Home → Collab stays a teaching panel (no new `ops_plan_task` discriminator). (d) Read-folds (legacy
  warranty/claim/staff notes → read rows in the panel) + note-editor deprecation are **deferred until the
  migration is applied**, so folded rows can be verified against real thread rows. (e) Case/Journey root — deferred.

### Still high leverage (pre-existing)

7. **☐ 🔑 Stripe go-live** — the one thing blocking "can charge money" (tier0). ~30 min. → §A1
8. **☐ 🧠 Tell me the color for SKU suffixes `-N` / `-S` / `-SW`** — one-line config each. → §B1
9. **☐ 🔑 NAS production uploads** — office-Mac agent + Caddy + Vercel env. → §A2
10. **☐ 🔑 ShipStation + eBay buyer purchase sync setup**. → §A5
11. **☐ Review + test photo reassignment + serial provenance** in the running app. → §E

---

## A. Owner-gated infrastructure 🔑  (no credentials exist for the agent — only you can do these)

### A1 — Stripe live go-live  ·  Tier-0 execution checklist
- ☐ Run: `STRIPE_SECRET_KEY=sk_live_… node scripts/stripe/setup-webhook-and-portal.mjs --live` and capture the `whsec_…`.
- ☐ Vercel **Production** env: set `STRIPE_WEBHOOK_SECRET` (the `whsec_…`); confirm `sk_live`/`pk_live` keys + the 3 **live** `STRIPE_PRICE_*` (the `…LvhV85DRvt…` account, **not** the test `…Q2odN2RRiM…`); redeploy.
- ☐ Smoke-test: checkout → webhook mirrors `billing_subscriptions` → `organizations.plan` flips → portal cancel.
- (defer) `invoice.payment_failed` dunning.

### A2 — NAS production photo uploads  ·  `nas-receiving-write-tunnel-plan.md`  (app code is 100% done)
- ☐ Deploy the full `deploy/nas-media-agent/server.mjs` on the office Mac and **retire the slim archive-only `:8787` agent** (don't run two).
- ☐ Wire Caddy `handle_path /_agent/* → 127.0.0.1:8787`, then add LaunchAgents (agent + Caddy) and a `cloudflared` system service for reboot durability.
- ☐ Vercel Production env: set `NAS_RW_URL`, `NAS_AGENT_URL`, `NAS_AGENT_TOKEN`; redeploy.
- ☐ Phase 5 e2e probe: `PUT` 201 through the tunnel; mobile capture → `POST /api/receiving-photos` 200 → photo visible → gallery delete 204.

### A3 — Amazon SP-API multi-tenant + live PII  ·  Amazon SP-API order import  (all code shipped)
- ☐ Publish the Selling-Partner **Appstore app** and obtain the restricted **PII (Direct-to-Consumer Delivery) role** so true multi-tenant OAuth + live shipping-address RDT work for non-USAV tenants.
- Note: the self-authorization paste path (`/api/amazon/connect`) already works as a single-tenant bootstrap meanwhile.

### A4 — Tenant-isolation / realtime infra  ·  Tier-0 execution checklist · **also §J**
- ☐ Confirm `UPSTASH_REDIS_*` is set in Vercel prod (the rate limiter **fails open** without it). **Required for org-login-gate rate limits** (auth-signin, password-reset, OAuth, passkeys) — same as HUMAN GATE #2 in §J3.
- ☐ Update the external `realtime-db` emitter to send `organization_id` as `orgId` **before** the Ably one-shot deploy (else `db.row.changed` 400s post-deploy).
- ☐ On any **new** tenant DB: provision the non-BYPASSRLS `app_tenant` role (template `2026-06-21_app_tenant_role.sql.template`). **RLS Phase E pool switch** (`TENANT_APP_DATABASE_URL`) is a separate hard stop — do **not** flip until §J6.

### A5 — ShipStation + eBay buyer purchase sync (new July wave)  ·  `shipstation-outbound.md`, Incoming universal purchase orders
- ☐ 🔑 Obtain ShipStation API keys (or Nango connect) + webhook secrets; set `SHIPSTATION_*` (or equivalent) in Vercel; wire rate shopping + label purchase/void in prod.
- ☐ 🔑 eBay buyer-side (purchase) OAuth soak: Settings → eBay → **Add purchasing** (not Connect/selling); after return use Incoming → **Marketplace** refresh; confirm cron `/api/cron/ebay/purchase-sync` + refresh-tokens keep buyer tokens alive. In-app next-step copy shipped; remaining = live dogfood consent + row appear on Incoming.
- ☐ Smoke the new facts/perm extensions + credential connector for both (see recent permission manifest + integrations updates).
- ☐ Verify non-destructive feed unlinks (if `feed_links` impl lands) + label lifecycle audit.

---

## B. Owner decisions & data 🧠  (the agent cannot guess these without corrupting data / breaking auth)

### B1 — SKU color suffix values  ·  `sku-reconciliation-plan.md`  (axis confirmed = color)
- ☐ Tell me the color for `-N`, `-S`, `-SW` (e.g. `-N` = Navy? Natural?). `-B`→Black and `-W`→White are seeded; the rest decode to `null` (never mis-tag) until you confirm. Then it's a one-line flip per entry in `src/lib/inventory/sku-variant.ts` (`SKU_COLOR_SUFFIX_MAP`, set `confirmed:true` + code/label) + run the backfill.

### B2 — Identity session-collapse cutover  ·  `identity-layer-plan.md`  🏃  ·  💤 until post–org-login-gate soak
- ☐ Decide to proceed, then the cutover (rewire `server-session.ts` + every consumer to read `active_org_id`/`active_staff_id`, drop the re-mint) must be **verified in a running app** (sign-in / PIN / passkey / org-switch) before deploy. Groundwork is built + live (columns + the unused `switchActiveContext()` helper). Account-merge is already fully built + live.
- **Note (2026-07-11):** org-login-gate intentionally did **not** cut over session collapse (out of scope). Ship + soak §J first (email login, `cf_sid`, station PIN, OAuth) before revisiting.

### B3 — Receiving-scans S5 dedup-key strategy  ·  `receiving-scans-stn-link-plan.md`
- ☐ `receiving_scans.shipment_id` is intentionally nullable (non-carrier/SKU scans), so it can't directly replace the `(tracking_number, receiving_id)` unique key. Decide a composite / `COALESCE` strategy before S5 read-cutover + S6 column drop.

### B4 — Smaller decisions
- ☐ Unshipped tracking/label record: add the planned `shipping.upload_label` permission, or keep reusing `orders.create`/`orders.view` (current). Low stakes.
- ☐ `identity-layer-plan.md`: reconcile SSO storage — as-built `staff.sso_provider/sso_subject` vs the plan's `account_identities` (+ backfill).
- ☐ `relational-backend-reuse-plan.md` §4: polymorphic-attachment registry + generated-trigger macro — design call.
- ☐ `DEAD_CODE_CLEANUP_PLAN.md`: whether to flip knip strictness (`rules: { exports, types }`) to hard-error once the backlog drains.

### B5 — Admin / Settings SaaS surface split + design consistency (high multi-tenant UX impact)
- ☐ **Decide final split of concerns and naming**: Personal prefs (hardware, appearance, security, personal receiving) vs Organization config (billing, team, roles, integrations, org policies, audit) vs heavy operational catalogs/power tools (suppliers, locations, reason-codes, FBA catalog, PO mailbox, schedules, logs, quality, inventory-admin) vs future separate Platform admin. Confirm URL model (keep `/settings` + `/admin`, single `/settings?area=personal|org|ops`, or rename `/admin` → `/org-admin` or similar). Mixed personas (owners + power users) mean catalogs need appropriate sub-perm exposure without exposing pure admin (billing/team).
- ☐ **Prioritize & sequence the unification**: High-priority design-system consistency (adopt `SidebarShell`/`AdminSidebarShell` everywhere, standardize containers + `PageHeader` maxWidth strategy, token-only colors, linear scaffold, Workbench archetype for list+detail surfaces) vs defer until after billing hardening / RLS / onboarding. Review the proposed plan (archetypes, compose rails not fork, legacy redirect cleanup, expand settings-registry for more org policy).
- ☐ Owner review/approval of the split before large-scale refactors to admin components, settings sections, and navigation (master-nav modes). Most code changes are agent-safe once decisions lock; deep links + existing redirects must be preserved.

---

## C. Deploy-coupled migrations 🚀  (break production if applied standalone — must land WITH their deploy)

### C1 — The 2 `.gated` composite-PK contract swaps  ·  `tier0` / `serial-units-tenant-force`
- ☐ `src/lib/migrations/2026-06-14_fba_fnskus_composite_pk.sql.gated` (fba_fnskus PK → composite)
- ☐ `src/lib/migrations/2026-06-14_sku_catalog_composite_unique.sql.gated` (sku_catalog → composite UNIQUE)
- The EXPAND phase + the `ON CONFLICT` code are already live. To finish: rename `.gated` → `.sql` and run `db:migrate` **as part of the deploy that carries the code** — never standalone (they'd break live upserts).

### C2 — SKU master-data migrations  ·  `sku-reconciliation-plan.md`  (agent can author on request)
- ☐ Step A union seed — insert in-use base SKUs (`sku_stock ∪ orders ∪ receiving_lines ∪ ledger`) into `sku_catalog` (`ON CONFLICT DO NOTHING`), behind a coordinated migrate→re-measure→backfill.
- ☐ Step E FK wiring — add `sku_catalog_id` + `NOT VALID` FKs to the 8 hot tables (`sku_stock`, `sku_stock_ledger`, `fba_shipment_items`, `stock_alerts`, `bin_contents`, `location_transfers`, `cycle_count_lines`, `items`); backfill → `VALIDATE`. **High-risk** (hot tables) — stage carefully.

### C3 — Relational identity-hub migrations  ·  `relational-backend-reuse-plan.md`  (agent can author on request)
- ☐ §3 `sku_catalog` FK backfill (`NOT VALID` → `VALIDATE`) · §5 `external_id_mappings` table · §6 `serial_units.current_location_id` FK · §7 require `reason_code_id` in ledger writes. Each is backfill-then-validate and must land **with** the writers that start stamping the new columns.

### C4 — Receiving-scans S6 + LOCAL_PICKUP
- ☐ `receiving-scans-stn-link`: S6 drop `receiving_scans.tracking_number/carrier` — irreversible; only after S5 (§B3) + green `verify-stn-consolidation.sql` + a column-free-code-first deploy.
- ☐ `receiving-door-classification`: `LOCAL_PICKUP` intake_type round-trip needs a schema change (the carton `intake_type` enum excludes PICKUP).

> ⚠️ The migration runner (`scripts/run-pending-migrations.mjs`) applies **all** pending `.sql` at once — always `npm run db:migrate:dry` first, and apply deploy-coupled ones only with their code.

---

## D. Safe backfill scripts to run ✅  (additive, dry-run-first, agent already wrote them — you run them)

- ☐ `scripts/backfill-catalog-type-id.mjs` — populates `receiving.type_id` (column is live). Dry-run → `--apply`. · `platform-account-type-catalog`
- ☐ `scripts/backfill-receiving-scans-shipment-id.sql` — 2-pass historical link; run **after** `verify-stn-consolidation.sql` is green. · `receiving-scans-stn-link`
- ☐ `scripts/backfill-unit-quality.ts` — optional; `GET …/quality` self-heals, so non-urgent. Dry-run → `--apply`. · `condition-grading-repair-qc`
- ☐ New this wave: provenance backfills included in `2026-07-01n_serial_unit_provenance.sql` (run `npm run db:migrate`); receiving facts / staff-filter indexes (e.g. `2026-06-21_receiving_staff_filter_indexes.sql` if unapplied); any `feed_links` or line_facts population once writers land. Always `db:migrate:dry` first.

---

## E. Code that needs the app running to finish safely 🏃  (agent can write; you must integration-verify before deploy)

- ☐ `relational-backend-reuse`: `recordUnitEvent` per-hot-path retrofit (receiveLineUnits / pack-ship / returns / RMA). The façade is now `transition()`-routed + ready, but each path has branching / realtime / allocation logic that must be mapped + run-the-app verified individually (may be a non-goal — a fresh receiving-style create path is the better first consumer).
- ☐ `relational-backend-reuse`: migrate the 2 remaining raw `tech_serial_numbers` writers (`api/google-sheets/execute-script`, `api/receiving/serials` + `tech-logs-queries.createTechLog`) — need `attachTechSerial` to grow a `createdAt` param / a row-returning + 409-surfacing variant first (not a bare swap).
- ☐ B2 session-collapse cutover (see §B2).
- ☐ New this wave (high operator impact): photo reassign flow end-to-end (move receiving photo between cartons/POs/lines with audit), serial_unit_provenance trigger effects (new inserts/updates create edges correctly), eBay buyer PO sync + ShipStation label lifecycle, unified feed rails / facts spine in Receiving + Ops views, receiving staff filter on large data (after indexes). Run with real data + verify no cross-tenant or double-write drift.

---

## F. Ongoing / living trackers 🔁  (by design these never fully "close" — work as-needed)

- ☐ `dead-code-triage` / `DEAD_CODE_CLEANUP_PLAN`: triage the un-triaged knip "Unused Files" backlog (`mobile/**`, `fba/table/**`, `manuals/**`, `admin/connections/**` and any stale admin/settings tab routes) in small reviewed waves (high false-positive rate — dynamic imports, admin-tab routing, mobile-only loads). **Run `npm run knip:baseline` (+ commit) once your in-flight work settles** — the gate is currently red with baseline-drift findings, mostly concurrent WIP. Phase 5 deeper detection (route-reachability map / `ts-morph`) is 💤 until the backlog justifies it. (Admin/settings unification will surface more candidates.)
- ☐ Tier-0 execution checklist: ongoing E2 `enforce_tenant_isolation` cohorts as each table's routes go all-`low`; 💤 D2 per-org crons via a service-org (Zoho/eBay/sheets/replenishment/warranty clock-sweep); 💤 Phase F identity/RBAC (auth-flow org-scoping, owner-email identity, onboarding/activation).
- ☐ `platform-account-type-catalog`: 💤 Phase 6 — drop `source_platform`/`intake_type` text columns + CHECKs **only** once readers move to resolvers (high-risk; still a large live read footprint incl. `fba` checks).
- ☐ `handling-unit-lpn`: 💤 H6 — drop `receiving.lpn` once flag-gated `RECEIVING_UNIFIED_INBOUND` Phase 3 stops referencing it.
- ☐ `unshipped-tracking-label-record`: 💤 continue per-panel `EventTimeline` rollout (repair detail, `UnitDetailWorkspace`).
- ☐ `serial-units-tenant-force`: 💤 §6 sibling tables + §7 `sku_catalog(sku)` cross-tenant key collision (separate Class-1 blocker for onboarding a 2nd org).
- ☐ `condition-grading` / `multi-tracking` / `amazon`: 💤 live eBay reverse-push · Zoho `cf_additional_tracking` mirror / ASN ingest · v0→2026-01-01 Orders API mapper cutover.
- ☐ **Polymorphic refactor (new living tracker)**: schema-wide + receiving deep dive + universal feed_links. Track phases: dual-write triggers live, reader migration + column drops (serial origin drop .BLOCKED planned), feed_links impl + cutover for triage rails, cross-surface standardization per `.claude/rules/polymorphic-tables.md` and the two plan docs. High impact on future Studio + tenant extensibility.
- ☐ **Receiving facts / unified feed + media/outbound**: ongoing rollout of declarative rails, facts spine, photo reassign + library modernizations, outbound docs integration, ShipStation/eBay buyer sync maturity.

---

## G. Legal baseline — Terms / Privacy / DPA 🧠  ·  (drafts shipped 2026-07-03; memory `legal-baseline-docs`)

The 3 documents are live in **two** places: the product at **Settings → Legal & Policies** (USAV — markdown source
at `src/content/legal/{terms,privacy,dpa}.json`, rendered by `LegalSection.tsx`) and the **marketing site** at
`/legal` + `/legal/terms` + `/legal/dpa` (CycleForge repo, alongside the kept `/privacy`). They carry a
**"Draft — pending legal review"** banner + a top disclaimer blockquote. Before they can be published as final /
relied upon:

- ☐ 🧠 **Fill the bracketed placeholders** — identical values across all 3 docs **and** both repos:
  `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, `[GOVERNING-LAW STATE]`, `[EFFECTIVE DATE]`; the Terms
  dispute-resolution set (`[COUNTY / CITY, GOVERNING-LAW STATE]`, `[ARBITRATION BODY]`, `[RULES]`, `[SEAT / CITY…]`,
  `[one/three]`, `[30/60] days`, `[one (1) year]`, the two `[PLACEHOLDER — confirm…]`); and the DPA fill-ins
  (`[NUMBER, e.g. 14]`, `[NUMBER, e.g. 30]`, `[EU MEMBER STATE — e.g. Ireland]`, `[COMPETENT SUPERVISORY AUTHORITY]`).
- ☐ 🧠 **Attorney review** of all 3, then **flip the draft banners off** (remove the amber "Draft — pending legal
  review" callouts + the top `> DRAFT — NOT YET LEGAL ADVICE.` blockquotes) and set the real Effective date.
- ☑ 🧠 **Contact-email domain — RESOLVED: standardized on `.ai`.** All CycleForge addresses now use
  `@cycleforge.ai` (`legal@` / `privacy@` / `security@` / `dpo@` + support `hi@`) across the docs and both repos.
  Remaining: confirm the mailboxes/MX for these actually exist and route.
- ☐ 🧠 **GDPR Art. 27 EU/UK representative + DPO** — decide whether appointment is triggered; if so, name the
  representative/DPO + address (currently `dpo@cycleforge.ai`, marked "to be appointed if required").
- ☐ 🧠 **SCC module + UK Addendum** — confirm EU SCC **Module Two** (controller→processor) as default vs **Module
  Three** (customer-as-processor), and complete the UK Addendum tables in the DPA.
- ☐ 🔁 **Keep the two copies in sync** — if any doc changes, update **both** the USAV `src/content/legal/*.json`
  **and** the matching CycleForge page (`/legal/terms`, `/legal/dpa`, `/privacy`, and the `/legal` index) or they
  drift. The agent can regenerate both on request.
- ☐ 🚀 **Commit the CycleForge repo separately** — the marketing-site changes (`src/app/legal/**`,
  `src/components/footer.tsx`) live in `/Users/icecube/repos/CycleForge`, a **different** repo from USAV; commit +
  deploy it on its own. (Both repos are `tsc --noEmit` clean.)

---

## Fully done — safe to archive out of `/partial/` ✅

These had **zero** remaining work (agent or human); their plan docs have since been removed (history in git):
QC CRUD endpoints · receiving workspace mode primitives · serial-units tenant FORCE
(FORCE RLS live) · handling-unit LPN (migration applied) · multi-tracking PO (superseded by
`shipment_links`, 28q applied) · plus Amazon SP-API order import and condition grading / repair QC
and unshipped tracking/label record once you accept their 💤 deferred items as out-of-scope.

**New July 2026 partial/todo docs** (review their handoff sections for any fresh owner items): universal-feed polymorphic (plan-stage), `schema-wide-polymorphic-refactor-plan.md` (phases advancing), media-library-modernization, outbound-documents, shipstation-outbound, incoming-universal-purchase-orders, receiving-triage-*, returns-receiving-order-unification. Many live in `docs/todo/` now.

---

## Small `[CODE]` items the agent can still do — just ask
Not blockers, deferred only for caution: confirm Phase-4 triage "Link to PO" routes through `attach-box`
(`multi-tracking`) · thread `is_return`/`return_platform` to the A4 banner for eBay DH/USAV/MK precision
(`receiving-door`) · add a knip exempt for `src/app/design-demo` · add the `handling-units-crud` e2e spec. Say the
word and I'll do any of these.

**New this scan (July polymorphic/feed/media wave):** agent can author:
- `feed_links` table + dual-write hooks + ReceivingFeedRail consumers once plan decisions lock.
- Further readers for `serial_unit_provenance` (journey, timeline, audit).
- Full ShipStation client + webhook verifier + label UI polish (beyond the skeleton).
- Media library folder drag + share enhancements or outbound doc viewer.
- Polymorphic contract lint/guard in CI or Drizzle helpers per the new rule doc.

**Admin/Settings unification (mostly CODE once B5 decisions lock):** standardize shells + tokens + PageHeader containers across `/admin` (including inventory sub-area) and `/settings` (personal inline + dedicated org pages); retire/clean legacy redirects in `admin/page.tsx` + `settings/page.tsx`; adopt Workbench archetype + SidebarShell for heavy pickers (staff, roles, access matrix); expand settings-registry for more org policy where sensible; align with master-sidebar-nav + 2026 component adoption (buttons/inputs/tables in admin forms). Can execute in phases after owner signs off on split/naming/priority.

---

# G. Cycle Forge roadmap wave (added 2026-07-03)  ·  `docs/CYCLE-FORGE-ROADMAP` · dossier: Cycle Forge wave review

An autonomous build + adversarial-verification wave against the Cycle Forge roadmap. Integrated state at
generation: **full-repo `tsc` 0 errors · route-permission manifest matches live source · one bug found+fixed.**
Nothing committed. The 21 `review` items are agent-complete + verified — a person must **review, approve, and
commit** them (and flip each roadmap `Status: review → done`). The rest need credentials / decisions as marked.

### G1 — Built + verified, awaiting your review + approval 🏃  (roadmap `Status: review`)
Each is additive + reversible; `[verify-only]` = no code changed, agent proved the acceptance criteria.
- ☐ **P0-IDN-01** — serial reuse PO→Shipping `[verify-only]` — check unique idx `(org,normalized_serial)` + shipping resolves-not-mints.
- ☐ **P0-TRACE-01** — unit audit-event backbone (`inventory_events`); closed PUTAWAY org gap; backfill script written (unrun).
- ☐ **P1-TRACE-02** — universal timeline + serial↔order toggle; warranty panel migrated.
- ☐ **P1-TRACE-03** — first-trace view `/audit-log/trace?serial=`; fixed Tech-missing-verdicts + added actor to `readTimeline`.
- ☐ **P1-TRACE-04** — notification bell inbox `[verify-only]` — fires on unboxed returns + priority orders, once/carton.
- ☐ **P1-PCK-01** — testing-mode SKU pre-pack scan (read-only resolve, 4th "SKU" scan mode).
- ☐ **P1-PCK-02** — packing per-SKU instructions + QC flags pre-confirm. **⚠️ APPLIED migration `2026-06-21_sku_catalog_pack_notes.sql`** (additive, down-path documented) — the only live DB change this wave.
- ☐ **P1-PCK-03** — testing feed defaults recently-received-first (reused live refresh, no new poll).
- ☐ **P1-WORK-01** — work-order assign popover + global-header top-priority chip.
- ☐ **P1-WORK-02** — one shared `?staff=` filter (Dashboard + Receiving). *Had a latent 500 bug — fixed (see G2).*
- ☐ **P1-WORK-03** — F2 hotkey → focus next-PO-serial scan (Playwright-proven).
- ☐ **P1-RCV-01** — searchable receiving to-do seeded from email order#s; reversible check-off.
- ☐ **P1-MOB-01** — mobile `/m/pack` two-step scan flow (typed reducer machine; reuses PCK-01 resolve).
- ☐ **P2-FBA-01** — shipment→FNSKU→unit-path audit + 4 inconsistency flags.
- ☐ **P2-FBA-02** — bugfix: UPS-tracking no longer clobbers non-UPS links; FNSKU condition persists on reopen.
- ☐ **P2-RPR-01** — repair intake paperwork reachable from any step.
- ☐ **P2-RPR-02** — repair ticket CRUD + link/unlink + manual pairing (soft-delete only).
- ☐ **P2-AI-01** — OCR unresolved read → create-SKU OR flag-missing in one step (`/m/identify`).
- ☐ **P3-DS-03** — photos library "Group by ticket" view; receiving peek-fan (was already mounted).
- ☐ **P3-ADM-01** — `/operations` goal-first hero + live stats + local-agents row (deep-links `/studio`).
- ☐ **P3-ADM-03** — `/calendar` over `work_assignments` (reused `deadline_at`, no new column).

### G2 — Carry-forward actions from this wave  (not approvals)
- ☐ 🚀 **Apply** `src/lib/migrations/2026-06-21_receiving_staff_filter_indexes.sql` (`npm run db:migrate`) — 3 partial indexes for the P1-WORK-02 staff filter; **UNAPPLIED**. Needed before the filter runs on large receiving history (else table scan).
- ☐ **Review** the regenerated `docs/security/route-permissions.json` in your git diff (agent re-emitted it to cover the new routes; reversible via `git checkout`).
- ☐ ✅ *Done this wave (verify it held):* receiving staff-filter 500 fixed via alias-independent `EXISTS`; `shipped ?staff=` pushed into SQL; IncomingTodoList poll 60s→180s; repair POST idempotency added.

### G3 — 🔴 Pre-existing CRITICAL tenancy leaks surfaced by the audit  (NOT caused by this wave)
Belong to the tier0 tenant-isolation sweep (§A4 / Tier-0 execution checklist); left untouched deliberately (security-sensitive). Say the word to take these on as a focused, verified pass.
- ☐ 🧠 `/api/repair-service` GET + PATCH — `createCrudHandler` callbacks call `getAllRepairs`/`searchRepairs`/update **without org scope**.
- ☐ 🧠 `/api/shipped` GET (non-search) + PATCH — `getAllShippedOrders`/`updateShippedOrderField` **missing `organizationId` arg**.
- ☐ 🧠 `/api/packerlogs` PUT + DELETE — no `organization_id` predicate; **delete by integer ID is cross-tenant**.
- ☐ 💤 `pending_skus` — global table (no `org_id`); new OCR flag-missing route is write-only enqueue (audit row org-scoped).

### G4 — Roadmap tasks still `todo` — need your credentials / decision  (roadmap `Status: todo`)
- ☐ 🔑 **P2-INT-02** Ecwid order pull + attach repair services · **P2-INT-03** eBay(OAuth)/Amazon connect testing · **P2-INT-04** Amazon incoming ingestion (needs INT-03) · **P3-ADM-04** product-manual PDF viewer (Cloudflare R2).
- ☐ 🧠 **P2-AI-02** AI claims assistant (TOS-compliant) · **P2-AI-03** AI product sourcing (Hermes) · **P3-BIZ-01** payment plans + per-plan gates.
- ☑ **P3-BIZ-02** password signup + account creation — **code shipped 2026-07-11** (org-login-gate wave 3: password owner signup, email-first `/signin`). Remaining = **verify** (§J5) + optional marketing-site copy update.
- ☑ **P3-ADM-02** staff global sign-in — **code shipped 2026-07-11** (unified `/signin`; station PIN collapsed under workspace-resolved mode). Remaining = **verify** apex never lists staff + station works on subdomain (§J5).
- ☐ 🧠 **P2-INT-01** Zoho webhook on receiving — SoR-delicate (crosses the SKU-quantity boundary); wants your sign-off on direction.
- ☐ 💤 **P3-DS-02** site-wide DS migration (do opportunistically as pages are touched) · **P2-RPR-03** warranty check-in + pickup dashboard (needs INT-02) · **P3-ADM-05** SOP generation on onboarding (needs P1/P2 flows stable).

---

# H. Polymorphic Refactor + Receiving Universal Feed + Media/Outbound wave (July 2026)

**Major cross-cutting theme this scan.** Multiple plans and impls converged on typed polymorphic spines, non-destructive feeds, provenance, and media modernization. See `docs/todo/schema-wide-polymorphic-refactor-plan.md`, the universal-feed polymorphic plan, `polymorphic-tables-database-refactor-plan.md` (in todo?), `.claude/rules/polymorphic-tables.md`, new migration files, and the recent commits/dirty tree.

### H1 — Shipped / in-tree this wave (review + approve / test / apply)
- ☐ **serial_unit_provenance** (Phase 1 table + backfill 2026-07-01n; Phase 2 dual-write trigger 2026-07-03a). Schema modeled in Drizzle. Origin columns stay live (Phase 4 drop planned + blocked migration exists). Verify trigger fires on all three insert paths (upsertSerialUnit, mark-received, insertTechSerial) + updates. Run migrate + test provenance queries (journey, audit, timeline).
- ☐ **Photo reassignment** (committed): full vertical — API, domain lib+test, UI panels (MovePhotoToPoPanel in gallery/viewer + receiving), audit log, permission. Test real move (no data loss, audit row, gallery refresh, cross-PO visibility).
- ☐ **eBay buyer purchase sync + ShipStation** skeleton + facts/perm/connector wiring (committed plan + routes). Flesh + test with real tokens.
- ☐ Receiving facts spine + polymorphic ops_events + unified rails (ReceivingFeedRail, journey enrichment, packer-log, trace/tech-aggregators). Many code updates live in tree.
- ☐ Media library (folders CRUD, drag-reorder, finder-style, share toolbar) + photo library updates. Outbound documents plan + initial integration.
- ☐ Tenant backstop + many receiving idempotency / rail / staff-filter / handling unit refinements in dirty tree.

**Action:** Review the untracked migrations (`2026-07-01n_...`, `2026-07-03a_...`, the .BLOCKED drop), `npm run db:migrate:dry`, then apply with a deploy if green. Review regenerated route-permissions + security files.

### H2 — New human decisions / gated (add to A/B as needed)
- ☐ Decide timing + risk tolerance for Phase 4 origin column drop on serial_units (after all readers migrated off + provenance proven).
- ☐ Lock `feed_links` schema details + `feed_key` values for receiving triage states (Prioritize/Unfound/Done) + decide first consumer surface (sidebar bulk-delete).
- ☐ ShipStation vs existing carrier stack (USPS/UPS/FedEx) overlap strategy; which becomes primary for labels/rates for which channels.
- ☐ eBay buyer purchase vs seller-listing integration split (tokens, sync schedules, feed vs orders).

### H3 — Deferred / ongoing from this wave
- ☐ Full `feed_links` impl + cutover from the three old receiving triage sources (plan-stage only today).
- ☐ Reader migration to `serial_unit_provenance` across journey, audit timelines, ops views, Studio.
- ☐ Polymorphic standardization across the 10+ existing surfaces (photo_entity_links, shipment_links, part_links, external_id_mappings, etc.) per the rule doc and appendices.
- ☐ Continue media/outbound polish + integration with Studio/workflows.
- ☐ Cross-ref with tenancy (all new tables must be born with RLS + GUC).

Add any fresh items surfaced by reviewing the new plan docs to the appropriate § above. This wave is high-leverage for long-term SaaS extensibility and receiving UX consistency.

---

# I. Cycle Forge design/UX brain-dump — reconciled + net-new (added 2026-07-03, **code-verified**)

Owner supplied a full brain-dump of desired design/feature work. Each item was **deep-scanned against the current
tree** (3 parallel code audits) before landing here. The headline: **the large majority is already built** — either
shipped, or in §G as `Status: review` (built + adversarially verified, awaiting your commit). This section captures
the **entire** list so nothing is lost, marks each **DONE vs NET-NEW**, and details only the genuinely remaining work.

Legend as above (☐ / 🔑 / 🧠 / 🚀 / 🏃 / 🔁 / 💤). `[VERIFIED-DONE]` = agent confirmed it exists in the tree today.

## I0 — Already built / shipped — **no new work**, just review + commit (cross-ref)

| Brain-dump item | Status | Where (verified) |
|---|---|---|
| **Remove PO loading spinner → instant found/unfound** (the `/Goal`) | ✅ `[VERIFIED-DONE]` | `lookup-po/route.ts` has `resolvePoIdLocallyByTracking` (L333-365) + `localOnly` gate skipping Zoho (L1174); client `resolvers/lookup-po.ts` sends `localOnly:true` phase-1 (L29), loader only on order#-miss→Zoho re-ping. Background self-promote in `scan-apply.ts` L335-373. **Done.** |
| Serial reuse PO Unboxing ↔ Tech/Shipping | §G1 review | P0-IDN-01 `[verify-only]` |
| Unit audit backbone + first-trace timeline (received→tested-by/when→prepacked→returned→shipped-by/who) | §G1 review | P0-TRACE-01, P1-TRACE-03 (`/audit-log/trace?serial=`) |
| Universal timeline in detail panels + serial↔order toggle + "fix all timelines" | §G1 review | P1-TRACE-02 |
| Notification bell — returns unboxed + pending orders needing ship → primary station inbox | §G1 review | P1-TRACE-04 |
| Testing-mode packing-list selection + SKU-scan prefill from prepacked state | §G1 review | P1-PCK-01 (4th "SKU" scan mode) |
| Packing page modes + per-SKU QA / how-to-pack instructions + QC flags | §G1 review | P1-PCK-02 (migration `2026-06-21_sku_catalog_pack_notes.sql` **applied**) |
| Work-order assignment (testing/packing/picking) via popover + most-important in global header | §G1 review | P1-WORK-01 |
| Quick-key back-to-scan next PO/SN | §G1 review | P1-WORK-03 (F2 hotkey) |
| To-do list / search in incoming from email order#s | §G1 review | P1-RCV-01 |
| Mobile packer auto-progress (scan→order details, scan→what-to-pack) | ✅ `[VERIFIED-DONE]` + §G1 | `pack-scan-machine.ts` (idle→order_details→what_to_pack); P1-MOB-01 |
| Product-QR scan on phone → correct product display | ✅ `[VERIFIED-DONE]` | `/m/scan`→`UniversalScan`→`PrepackedProductSheet` resolver cascade (tracked/untracked/unknown) |
| Packing list viewable on phone (packer **and** tech) | ✅ `[VERIFIED-DONE]` (shared view) | `/m/pack` has no role gate; tech reaches same list. *No tech-specific list — see I2.* |
| FBA E2E: all-in-one shipment ID → FNSKU → unit-path audit trail | §G1 review | P2-FBA-01 (+ 4 inconsistency flags) |
| Dashboard tracking-popover save bug + FNSKU condition persist + FBA popover edits→DB | §G1 review | P2-FBA-02 (bugfix) |
| Repair service linear flow + view paperwork anytime | §G1 review | P2-RPR-01 |
| Full CRUD: ticket link/unlink, manual pairing, manual repair + scroll recent | §G1 review | P2-RPR-02 (soft-delete only) |
| OCR product title for local pickups → create-SKU or flag-missing | §G1 review | P2-AI-01 (`/m/identify`) |
| Photos library "group by ticket" + receiving quick-peek fan (bottom-right framer stack) | §G1 review | P3-DS-03 (peek-fan already mounted) |
| Operations page redesign — goal-first hero + live stats + local-agents row | §G1 review | P3-ADM-01 (deep-links `/studio`) |
| Ecwid order pull + attach repair services | §G4 todo 🔑 | P2-INT-02 |
| Test integrations (eBay/Amazon) by connecting an account | §G4 todo 🔑 | P2-INT-03 |
| AI claims assistant (TOS-compliant + "is this OK for TOS?" + undelivered/wrong-address) | §G4 todo 🧠 | P2-AI-02 |
| AI product sourcing (Hermes / ChatGPT) | §G4 todo 🧠 | P2-AI-03 |
| Payment plans + per-plan page gates (shown, locked behind paywall) | §G4 todo 🧠 | P3-BIZ-01 |
| Password signup + account creation + marketing site reflect reality | §G4 todo 🧠 | P3-BIZ-02 (+ update CycleForge repo) |
| SOP drafted when onboarding complete | §G4 defer 💤 | P3-ADM-05 |
| Site-wide Linear/Notion UX migration per page | §G4 defer 💤 | P3-DS-02 (opportunistic) |
| Detail-panel timelines everywhere + identifier strategy (serial vs order#) | §F + §H | per-panel `EventTimeline` rollout + polymorphic `serial_unit_provenance` readers |

> Action for all of I0: nothing to build. **Review + commit** the §G `review` items (flip each roadmap `Status: review → done`), and note the `/Goal` instant-PO work is already live in the tree.

## I1 — **Net-new** — verified absent/partial, the real remaining design work (ROI-ordered)

- ☐ **I1-1 · Mobile responsiveness across all desktop pages** 🏃 — **ABSENT (~0%).** `dashboard`/`products`/`inventory`/`warehouse`/`operations` trees use **zero** `sm:/md:/lg:` breakpoints; a phone is hard-redirected to `/m/*` by `ResponsiveLayout.tsx:124` (`isMobileAllowedPath`, `sidebar-navigation.ts:112`). Repo-wide only ~148/1048 non-mobile tsx use any breakpoint. **Large (L).** Decide: keep the `/m/*` split and only widen the allowlist, or make core pages reflow. *Prereq → I1-2.*
- ☐ **I1-2 · Unify mobile nav with the desktop SoT** — **ABSENT.** `MobileSidebarDrawer.tsx:66` hardcodes its own `NAV_ITEMS` ("single source of truth for the drawer") and never imports `APP_SIDEBAR_NAV` (`sidebar-navigation.ts`). Point the drawer at the shared nav + permission filter so the two stop diverging. **Medium (M).** Cheap structural win that de-risks I1-1.
- ☐ **I1-3 · Integrations tab → sidebar-MODES + Nextiva display-account mode** — **PARTIAL.** `settings/integrations/page.tsx` is a flat category catalog (no `?mode=`, no `HorizontalButtonSlider`, no `SidebarShell`); Nextiva is one vault card (`registry.ts:129`). But the Nextiva call-log/voicemail backend + UI is substantial and **already mode-driven inside the Support workspace** (`SupportWorkspace.tsx:36` `?mode=calls|voicemail`). Work: convert integrations page to the sidebar-mode archetype (per `/sidebar-mode` skill) and add a Nextiva "display account" mode (reuse `CallLogView`/`VoicemailQueue`). Model for "next integration added as a mode." **Medium (M).**
- ☐ **I1-4 · AI chat that toggles tenant settings via natural language** 🧠 — **ABSENT.** `api/ai/chat/route.ts` is read-only (intent detect → `buildContextBlock` SELECTs → gateway); no `tools` array sent to the model. `hermes-tool-call.ts` exists but every caller is classify/draft, none mutate settings. Settings mutation lives only at `api/settings/route.ts`. Work: register a settings-mutation **tool schema** (validate through `settings/registry.ts`), add a server-only `setTenantSetting()`, wire it into the chat handler with an admin-permission gate + audit. **Small–Medium (S–M).** High demo value.
- ☐ **I1-5 · Admin station-IP switching per user** 🧠 — **ABSENT.** `ip_address` appears only in audit capture; no station↔IP mapping table or switch logic. Needs: a `station_ip_assignments` table (org-scoped, born with RLS per `.claude/rules/polymorphic-tables.md`), admin UI to assign an IP to a computer, and resolution of the active staff's IP for records. **Medium (M).**
- ☐ **I1-6 · Multi-language (i18n) per staff** 🧠 — **ABSENT.** No `next-intl`/`i18next`/message catalogs; only `Intl.*` date/number formatting; no locale key in `settings/registry.ts` or `staff_preferences`. Needs a framework choice + a message-extraction pass across the site + a per-staff locale pref. **Large (L).** Biggest surface of anything here.
- ☐ **I1-7 · Per-tenant sidebar label/badge upgrades** 🧠 — **ABSENT.** `sidebar-navigation.ts` is fully static (hardcoded union + labels); no org-scoped override. Work: source label/badge overrides from `organizations.settings` (or the settings-registry) so each customer can relabel/badge sidebar entries. **Small–Medium (S–M).**
- ☐ **I1-8 · First-run onboarding walkthrough for new SaaS orgs** 🧠 — **ABSENT (guided tour).** Only static empty states (`FirstScanOnboardingCard.tsx`, `OrdersFirstRunEmptyState.tsx`) + backend template seeding (`studio/seed-org-workflow.ts`). No tour/checklist framework (no joyride/shepherd/driver.js). Work: a multi-step guided walkthrough that explains the product + links every station with use-cases and lands the org on `/operations`. Pairs with P3-ADM-01 (goal-hero) + P3-ADM-05 (SOP). **Medium (M).**
- ☐ **I1-9 · Zendesk ticket select + add comments from the PACKING flow** — **ABSENT.** Zendesk comment/assign/photo APIs exist (`api/zendesk/tickets/[id]/comments`, `.../assign`, `support/tickets/by-entity`) but are **unreachable from any packing surface** (`StationPacking.tsx`, `Pack.tsx`, `packer/**` have no ticket UI). Work: surface a ticket picker + comment box in the packing station reusing the existing APIs. **Small–Medium (S–M).**
- ☐ **I1-10 · Clean up testing & shipping display panels/components** — *(not deep-scanned; keep as a design pass.)* Tidy the testing/shipping panels for reliable full-detail display; align to Workbench archetype + house tokens. **Medium (M).**

## I2 — Finish-gaps on **already-built** features (verified partial; small closeouts)

- ☐ **I2-1 · Hermes visual auto-analyze — enable + notify + surface.** Auto-analyze-on-upload IS wired (`photos/service.ts:222` enqueues `analyze`; `photos/analyze.ts` has `hermes`/`vision`/`catalog` providers + `damage_detected`), but **gated OFF by default** (`PHOTOS_ANALYZE_ENABLED`/`_ON_UPLOAD` default false), produces **no notification**, and has **no upload-result UI** beyond search filtering. Work: flip flags per-org, fire a notification on `damage_detected`, surface results in receiving/packer photo UI + mobile. The LAN RTX "Vision" agent (`OperationsAgentsRow.tsx:42`) is a separate receiving-identify path — decide if the Windows/Mac visual-mode switch ties here. **Small–Medium (S–M).**
- ☐ **I2-2 · SKU header + in-place SKU edit on the receiving line-edit panel.** `LineMatchingSection.tsx` lets you search/pair by SKU and sets `sku` as a **side-effect of picking a match** (L298-320), but there's **no SKU header render nor an editable SKU field** on `LineEditPanel.tsx`. Work: render `row.sku` as a header chip + add a direct override/edit affordance in the line-edit panel. **Small (S).**
- ☐ **I2-3 · Shared `?staff=` filter — wire the pickers everywhere.** Primitive exists (`useStaffFilter.ts`, `STAFF_FILTER_PARAM='staff'`) and servers already read it on `orders`, `shipped`, `receiving-lines`, **and `packerlogs`** — but the only **writer UI** is the Dashboard/Unshipped inline `BoardStaffFilter` (`UnshippedShelfBoard.tsx:96`). Receiving reads `?staff=` yet has **no setter** (its sidebar uses a different `?staffId=`), and packing/testing/unboxed have no picker. Also the shared `design-system/components/StaffFilter.tsx` is rendered **nowhere** (dead). Work: mount the shared `StaffFilter` picker on Receiving/Packing/Testing/Unboxed (all-staff → one-staff), reconcile `?staff=` vs `?staffId=`, retire the dead component. Fulfills "filters in every mode." **Medium (M).**
- ☐ **I2-4 · Tech-specific mobile packing/testing list (optional).** Today tech reuses the shared `/m/pack` view; `ScanTestingPanel` serves testing at `/m/scan`. If a dedicated tech mobile list is wanted, build it; otherwise close as "shared view is sufficient." **Small (S) / 💤.**
- ☐ **I2-5 · Realtime triage live-move (optional polish).** Incoming/triage already update live via Ably→invalidate→refetch (`useRealtimeInvalidation.ts:133`, server publishers in `lookup-po` `after()`), with server-side segmentation (Prioritize/Unfound/Done). It is **not** an animated cross-table row-move. If you want true live-move animation between tabs, that's a client-side layout-animation upgrade on top of the existing events. **Medium (M) / 💤.**

> **Suggested sequence for §I net-new:** I2-2 + I2-3 + I1-9 (small, high daily value) → I1-4 (AI settings, demo value) → I1-2 then I1-1 (nav unify → responsive) → I1-3, I1-8 → I1-5/I1-6/I1-7/I1-10 as prioritized. Everything in §I0 is review-and-commit only.

---

# J. Org login gate + SMB auth + dogfood naming burn-down (2026-07-11)  ·  **code complete — add + verify only**

**Source of truth:** [`docs/todo/org-login-gate-EXECUTION-PROMPT.md`](../todo/org-login-gate-EXECUTION-PROMPT.md)
(RUN NOTES waves 0–8; verification matrix; HUMAN GATES 1–5).

**Agent status (do not re-build):** waves 0–8 green — apex fail-closed org resolve, org-scoped PIN/signin,
password reset routes+page, auth rate limits, public share/offline paths, email-first `/signin`, signup→password,
`cf_sid` dual-read + passkey cookie rename, platform Google/MS OAuth routes (env-gated), SSO button on login when
entitled, org auth policies, magic link account-based, invite consolidation (StaffTable → identity invitations),
fail-closed fallback burn-down (`dogfood-fallback-guard` allowlist 28→10), client `cf_*` naming wave-2.
Unit sweep reported green in RUN NOTES; `npx tsc --noEmit` 0 errors at handoff.

**Your job:** **add** secrets/env/migrations/DNS, then **verify** the matrix in a running app before production
cutover. Do not apply deploy-coupled migrations early.

---

### J0 — Suggested order (person timeline)

| Step | What | Gate |
|---|---|---|
| 1 | Paste blank env stubs into `.env.example` | §J1 |
| 2 | ☑ Apply `2026-07-11b_password_reset_tokens.sql` — **DONE on working DB** (re-apply on separate staging/prod DBs) | §J2 |
| 3 | Local/staging smoke of verification matrix (use seeded `hi@usav.com`) | §J5 |
| 4 | Prod env audit (pinless OFF, V2 ON, Upstash) | §J3 |
| 5 | Google (then MS) OAuth client + Vercel secrets | §J4 |
| 6 | Commit + deploy auth code with migration 11b | GitHub Desktop + Vercel |
| 7 | Prod re-run §J5 | 🏃 |
| 8 | Optional: DNS wildcard + dogfood hostname cutover | §J7 |
| 9 | ☑ `2026-07-09a` drop defaults — **already applied on working DB**; on a SEPARATE prod DB, still gate behind webhook org-resolution + fail-closed deploy | §J6 |
| 10 | Later: RLS Phase E role + `TENANT_APP_DATABASE_URL` pool switch | §J6 |
| 11 | ☑ `2026-07-11c_sync_cursors_per_org_key.sql` applied — **now owe the matching `sync-cursors.ts` caller PR** (pass `orgId`) | §J2 |

---

### J1 — Add blank env stubs (agent hook-blocked)  ·  🔑 / file edit

`.env.example` could not be updated by the agent (repo hook). Values are already documented in
`context/ENV-VARS.md`. **You** add blank lines under the existing `AUTH_PINLESS_SIGNIN=` entry (and Database
section for the tenant URL):

```bash
# Auth / tenancy (org-login-gate)
DEFAULT_TENANT_SLUG=          # optional apex→one slug bridge (e.g. usav). EMPTY = apex nil org (prod default)
AUTH_DUAL_WRITE_LEGACY_SID=   # leave blank/off; dual-WRITE not shipped (clear-legacy-on-touch only)
AUTH_V2_ENABLED=              # if not already present
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=    # optional; default {origin}/api/auth/oauth/google/callback
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_REDIRECT_URI=
# Database (RLS Phase E — do not set in prod until §J6)
TENANT_APP_DATABASE_URL=
```

- ☐ Paste into `.env.example` and commit with the auth wave.
- ☐ Local `.env`: set only what you need for the environment you're testing (never commit real secrets).

---

### J2 — Migrations 🚀  ·  **applied on the working Neon DB (2026-07-11)**

`npm run db:migrate:dry` → **0 pending** (454 on record). All three org-login-gate migrations are already in
`schema_migrations` on the DB this repo points at (`ep-shiny-hall…`). The table below is now the **reconciled
state + residual obligations**, not a to-apply list. On any **separate** staging/prod DB, re-run `db:migrate`
at deploy time (and still honor the 09a / RLS-E ordering there).

| File | State | Residual obligation |
|---|---|---|
| `src/lib/migrations/2026-07-11b_password_reset_tokens.sql` | ✅ applied | None. `password_reset_tokens` table live → reset flow works. |
| `src/lib/migrations/2026-07-11c_sync_cursors_per_org_key.sql` | ✅ applied | ⚠️ **Owe the caller PR**: `sync-cursors.ts` must pass `orgId` into `getSyncCursor` / `updateSyncCursor` with `ON CONFLICT (organization_id, resource)` — until then writers still target the old key shape. Agent can do this on request. |
| `src/lib/migrations/2026-07-09a_drop_usav_fallback_org_defaults.sql` | ✅ applied | ⚠️ USAV column DEFAULTs are **gone**. The fail-closed burn-down (allowlist ≤10) MUST be deployed so no write path relied on the old default. On a separate prod DB, confirm webhook org-resolution before applying there. |
| `2026-06-21_app_tenant_role.sql.template` + `2026-06-28_app_tenant_grants_reaffirm.sql` | ⛔ NOT applied (gated) | RLS Phase E only (§J6 #5). Template — not a normal migrate. |

Checklist:

- ☑ `npm run db:migrate:dry` → 0 pending on the working DB.
- ☑ **11b** applied → smoke the reset flow (request → `/signin/reset?token=…` → set password → signed in) in §J5.
- ☐ **11c caller PR** — ship the `sync-cursors.ts` `orgId` change (agent can author).
- ☐ **09a** — ensure the fail-closed burn-down is in the same deploy; re-gate on any separate prod DB.

---

### J3 — Production env audit 🔑  ·  HUMAN GATE #2

- ☐ **`AUTH_PINLESS_SIGNIN` = off / unset** in Vercel Production (and Preview if public). When on, empty PIN signs in by staff id alone; Wave 1 org-scopes it, but pinless must stay **OFF** in prod regardless.
- ☐ **`AUTH_V2_ENABLED` = on** in Production (edge gate enforce path — confirm intended policy for your deploy).
- ☐ **`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`** set in Production — auth rate limits fail **open** without Redis (same as §A4).
- ☐ **`DEFAULT_TENANT_SLUG` empty** on multi-tenant apex production (fail-closed). Only set for a temporary dogfood DNS bridge (e.g. single-host → `usav`) and clear after §J7 cutover.
- ☐ **`AUTH_DUAL_WRITE_LEGACY_SID` unset/off** — dual-write was intentionally not wired; migrate-on-touch clears `usav_sid`.
- ☐ After deploy: confirm no leftover `AUTH_PINLESS_SIGNIN=true` on any production-like env.

---

### J4 — Platform OAuth clients 🔑  ·  HUMAN GATE #1

Code is live (`/api/auth/oauth/[provider]/{start,callback}`); buttons render only when env is present.
**Do not** reuse Google Drive / Gmail / PO-inbox OAuth clients (different scopes + product surface).

**Google (do first)**

- ☐ Google Cloud Console → OAuth 2.0 **Web** client for Cycle Forge product login.
- ☐ Authorized redirect URI: `https://<prod-host>/api/auth/oauth/google/callback` (+ local `http://localhost:3000/api/auth/oauth/google/callback` if testing).
- ☐ Scopes used by code: `openid email profile` only (no Drive).
- ☐ Vercel + local: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`; optional `GOOGLE_OAUTH_REDIRECT_URI`.
- ☐ Verify: Continue with Google on `/signin` → account link/create → `cf_sid` set → app loads.
- ☐ Confirm no token writes into tenant Drive/Gmail integration vault.

**Microsoft (after Google works)**

- ☐ Entra app registration + redirect `…/api/auth/oauth/microsoft/callback`.
- ☐ Set `MICROSOFT_OAUTH_CLIENT_ID` / `SECRET` / optional `REDIRECT_URI`.
- ☐ Same happy-path verify as Google.

**Enterprise SSO admin UI** — 💤 deferred (Wave 5b). Until then: seed `organization_sso_providers` in DB for orgs that need SSO; login button appears when workspace resolved + `hasFeature(sso)` + active provider row.

---

### J5 — Verification matrix 🏃  ·  run in local/staging then prod

Use a private window. Prefer dogfood subdomain for station tests (`usav.<app-host>` or whatever DNS you have).
**Test login (seeded 2026-07-11):** `hi@usav.com` / password handed to the owner in-session (admin in `usav`,
`auth_method=password`). Use it for tests 4–7, 10, 13, 15. Rotate via Settings → Security after first sign-in.

| # | Test | Expected | ☐ |
|---|---|---|---|
| 1 | `GET /api/auth/staff-picker` with **no** `x-tenant-slug` (apex) | `{ staff: [] }` (unless `DEFAULT_TENANT_SLUG` set) | ☐ |
| 2 | Cross-org PIN `POST /api/auth/signin` (staff id from another org) | 404 / WRONG — no session cookie | ☐ |
| 3 | Cold load `/signin` (network tab) | **No** `staff-picker` fetch until “shared station” expanded | ☐ |
| 4 | Email + password login | Session cookie **`cf_sid`** set; app loads | ☐ |
| 5 | Present only legacy `usav_sid` once | Accepted → re-issued as `cf_sid`, legacy cleared (heartbeat/touch) | ☐ |
| 6 | Forgot password → email → `/signin/reset?token=…` → new password | Confirm works; user signed in (or org picker if multi-membership) | ☐ |
| 7 | Rate-limit burst on signin / reset request | `429` when Upstash present | ☐ |
| 8 | Anon share-pack GET (`/api/photos/share-packs/<token>` + page `/share/photos/…`) | **200**, not edge-redirect to `/signin` | ☐ |
| 9 | `/offline` unauthenticated | Loads (public path) | ☐ |
| 10 | New `/signup` | Password owner; owner staff `auth_method=password` | ☐ |
| 11 | Station mode on **workspace URL** | Expand “Signing in on a shared station?” → picker + PIN works | ☐ |
| 12 | Station mode on **apex** (no slug) | No staff list; “Open your workspace URL” (or similar) | ☐ |
| 13 | Magic link “Email me a sign-in link” | Works for account email even without `staff.email` | ☐ |
| 14 | StaffTable Invite | Identity invitation path (email required), not PIN-only enroll | ☐ |
| 15 | Settings → Security change-password | Works when logged in | ☐ |
| 16 | Google button | Hidden without env; works when env set (§J4) | ☐ |
| 17 | SSO button | Only when slug known + provider + feature entitlement | ☐ |
| 18 | Missing org on a burned-down interactive route | 401 — never stamps dogfood org | ☐ |
| 19 | Guard | `node scripts/dogfood-fallback-guard.mjs` green (allowlist ≤10, no new entries) | ☐ |

Optional polish checks:

- ☐ `cf_last_workspace` cookie set after account login; apex may show continue-to-workspace helper.
- ☐ Passkey challenge cookies are `cf_wac` / `cf_acct_wac` (not `usav_*`).
- ☐ Org flag `emailFirstSignin` hides shared-station block entirely.
- ☐ Org flag `requirePasskeyForNewStaff` → PIN create returns 403 `PASSKEY_REQUIRED`.

---

### J6 — Deploy-coupled / hard stops 🚀  ·  HUMAN GATES #4 + #5

**#4 — Drop USAV column DEFAULTs — ✅ already applied on the working DB**

- ☑ `2026-07-09a_drop_usav_fallback_org_defaults.sql` is applied on `ep-shiny-hall…`. The USAV `DEFAULT` on the
  8 tables is gone — every insert must now supply an explicit org (the fail-closed burn-down handles the code side).
- ☐ Confirm **webhook org-resolution** is live for every path that still writes without an explicit org
  (ShipStation / Zoho / Ecwid / etc.) — now a **correctness backstop** since the DB default no longer catches it.
- ☐ On any **separate** staging/prod DB: keep the original ordering — confirm webhook org-resolution first, then
  apply 09a in the same deploy as the burn-down. Never apply before, there: silent inserts would fail/mis-attribute.

**#5 — RLS Phase E (pool role switch)**

- ☐ Do **not** create `app_tenant` / switch `DATABASE_URL` casually.
- ☐ When ready: follow template `2026-06-21_app_tenant_role.sql.template` + grants reaffirm; set
  `TENANT_APP_DATABASE_URL` to the non-BYPASSRLS role URL; flip app pool per `src/lib/db.ts` / ENV-VARS notes.
- ☐ Expand/run cross-org isolation harness with the tenant URL before full cutover.
- ☐ Pair 11c (`sync_cursors` per-org key) with its caller change in the same PR when you tackle multi-tenant cursor isolation.

---

### J7 — DNS + dogfood hostname cutover 🔑  ·  HUMAN GATE #3

Code already treats apex without slug as nil org (empty staff). Hosting/DNS is yours:

- ☐ Create wildcard `*.app.cycleforge.ai` (or your real app domain) pointing at the app.
- ☐ Move dogfood tenant to `usav.app.…` (or chosen slug host); keep apex for marketing/login without staff leak.
- ☐ After cutover: clear `DEFAULT_TENANT_SLUG` on apex if it was used as a temporary bridge.
- ☐ Re-run §J5 tests 1, 3, 11, 12 on the real hostnames.

### J7b — Kiosk host wildcard 🔑  ·  HUMAN GATE (kiosk subdomain)

Staff wildcard `*.app.cycleforge.ai` does **not** cover `usav.kiosk.app.cycleforge.ai`
(DNS wildcards match one label only). Kiosk routing is already in the app
(`src/lib/tenancy/kiosk-host.ts` + `src/proxy.ts`).

**Dogfood bridge (until this gate closes):** tablets use
`https://app.cycleforge.ai/kiosk/v2` (`kioskPathDogfoodActive() === true`). After
DNS is live, flip that gate to `false` so staff `/kiosk*` 308s to the subdomain
again and prod pairing requires the kiosk host.

- ☐ Create DNS wildcard **`*.kiosk.app.cycleforge.ai`** → Vercel project `cycleforge-app`.
- ☐ Attach the custom domain (and cert) on that project; confirm
  `https://usav.kiosk.app.cycleforge.ai` resolves and serves the kiosk (`/` → intake).
- ☐ Optional: refuse bare `kiosk.app.cycleforge.ai` (app already 404s it).
- ☐ Flip `kioskPathDogfoodActive()` → `false`; update MDM / Guided Access home URL to
  `https://usav.kiosk.app.cycleforge.ai`.
- ☐ Re-pair every tablet after cutover (`cf_kiosk` is host-only; old staff-host cookies do not move).
- ☐ Optional local: set `NEXT_PUBLIC_KIOSK_HOST_SUFFIX=kiosk.localhost` and
  `/etc/hosts` → `127.0.0.1 usav.kiosk.localhost` (document in lockdown runbook).

---

### J8 — Follow-ups (not blocking ship) 💤 / optional

- ☐ Enterprise SSO **admin CRUD UI** (Wave 5b) — seed providers in DB until built.
- ☐ Full JWKS / id_token signature verification for platform OAuth + enterprise SSO (today: code exchange + TLS + client secret; unsafe decode of claims — matches prior SSO posture).
- ☐ Session-collapse cutover (§B2) — after soak.
- ☐ Account-merge admin UI, SAML, SCIM — out of scope.
- ☐ Rename live DB tenant display `USAV Solutions` / slug `usav` — **do not**; dogfood identity by design.
- ☐ Electron `appId` / NAS path renames — out of scope for this wave.
- ☐ Marketing site login copy (CycleForge repo) if still staff-picker-era.

---

### J9 — Done means (org-login-gate)

- ☐ Apex does not leak org #1 staff
- ☐ `/signin` is email-first SMB login; station mode optional and workspace-scoped
- ☐ Password reset works end-to-end (migration 11b applied)
- ☐ Auth routes rate-limited (Upstash in prod)
- ☐ Cookies are `cf_*` with legacy dual-read once
- ☐ Google button present when env set (hidden otherwise)
- ☐ `?? DOGFOOD/USAV_ORG_ID` allowlist not regressed (`dogfood-fallback-guard` green)
- ☐ Share packs + `/offline` public at edge
- ☐ Remaining gates #3–#5 scheduled or consciously deferred with owners
- ☐ Tree committed via GitHub Desktop when you're ready (agent does not push)

> Cross-refs: §A4 (Upstash / app_tenant), §B2 (session collapse hold), §G4 (P3-BIZ-02 / P3-ADM-02 now verify-only),
> `docs/todo/README.md` owner-gated migrations list, `docs/tier0-go-live-runbook.md`.

---

### K — Support Station full waist (Phase 2 re-key) — **UNAPPLIED migration + deploy ordering**

SoT: [`docs/todo/support-station-full-waist-handoff.md`](../todo/support-station-full-waist-handoff.md). Phases 0–1 (nav + shell + Unbox-shaped ticket focus) are pure UI, already in tree. Phase 2 re-keys `ticket_links` onto `support_ticket_id` (follow-up #2 of [`ticket-stn-many-link-plan.md`](../todo/ticket-stn-many-link-plan.md)).

- ☐ **APPLY the expand migration** `src/lib/migrations/2026-07-21_ticket_links_rekey_support_ticket_id.sql` via `/db-migrate` (dry-run confirmed: it is the only pending file). It is additive + permissive (backfill support_ticket_id → NOT NULL; zendesk_ticket_id → nullable; add `ux_ticket_links_support_entity` + `ux_ticket_links_support_anchor`). Safe under currently-deployed code.
- ⚠️ **DEPLOY ORDER (hard):** apply the migration **before** deploying the code in this change. `linkTicket` now routes through `linkSupportTicketEntity`, whose `ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id)` names `ux_ticket_links_support_entity` — which does not exist until the migration applies. Deploying the code first breaks **all** ticket linking (same hazard class as `2026-07-16c`).
- ☐ After apply: `npm run tenancy:coverage` (support_tickets was already enforced in 2026-07-01f; ticket_links unchanged) and run the VERIFY queries in the migration header (0 null support_ticket_id; ≤1 anchor per support ticket).
- ☐ **Deferred CONTRACT migration (do NOT author until the support-led writers are deployed):** drop the zendesk-led uniques (`ux_ticket_links_ticket_entity` / `_ticket_primary` / `_ticket_anchor`) + the `is_primary` sync trigger; re-key the READERS (`getTicketEntity`, `listTicketShipmentReferences`, `removeTicketShipmentReference`, `promoteShipmentTicketToReceiving`) and the remaining shipment-reference WRITERS (`linkTicketToShipment`, `addTicketShipmentReference`) from `zendesk_ticket_id` onto `support_ticket_id`. They stay correct for Zendesk tickets in the interim (column still populated).
- ☐ **Still-open pre-existing gap:** RECEIVING / RECEIVING_LINE parent-delete triggers for `ticket_links` (orphan cleanup). Needs an audit of the right parent table (`receiving` vs `receiving_carton`, `receiving_line` vs `receiving_lines`) — the same audit `2026-07-16` deferred.
