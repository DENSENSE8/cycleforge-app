# EXECUTION PROMPT — Polymorphic DB finish + `receiving_carton` cutover

> Paste everything below the line into a fresh Claude Code / Cursor session at the repo root
> (`/Users/icecube/repos/cycleforge-app`). Budget: deliberately expensive, multi-hour, full-codebase
> ownership. Dogfood-only — **permission to break the app, migrations, and live dogfood data** is
> explicit. Prefer a clean finished schema over preserving temporary shims.

---

ultracode

# Mission

You own the **entire Cycle Forge codebase** for this run. Finish the polymorphic database refactor
plans end-to-end, with receiving as the primary spine, and **complete the `receiving` →
`receiving_carton` / `receiving_lines` → `receiving_line` naming cutover** including data migration,
compat-view retirement, reader/writer cutover, column drops, and dual-write trigger removal.

**Product framing:** Cycle Forge is a sellable multi-tenant B2B warehouse/fulfillment SaaS. USAV is
the dogfood tenant only — never frame this as an internal 5-person tool. Vendor names (Zoho,
Zendesk, …) are connectors behind capability facades.

**Dogfood override (LOCKED for this run):**

- There are **no external tenants**. Breaking the dogfood app temporarily is acceptable.
- Skip strangler caution that was gating Phase 2 on a green `receive-to-zoho` e2e. Do the
  **clean destructive cutover** the receiving plan already authorizes in §7.
- You may drop columns, drop views, rewrite the 2k-line multiplexer, mass-rename raw SQL, and
  reseed from Zoho if backfill parity is noisy.
- Still respect house invariants below (tenancy, `transition()`, `recordAudit`, polymorphic
  contract). "Break everything" means **break temporary shims and god-table shape**, not abandon
  those contracts.

# Read first (in this order, before writing any code)

1. `docs/todo/polymorphic-tables-database-refactor-plan.md` — **primary SoT** for receiving.
   Memorize status header, §0 TL;DR, §7 Steps A–F, §8 sequence (esp. steps 6–14 + Step D tail),
   §10 success criteria, Appendix column→home map.
2. `docs/todo/schema-wide-polymorphic-refactor-plan.md` — whole-schema companion; Appendices A–D
   are referenced by the contract — do not delete. Apply only Tier work still open after receiving
   lands; do **not** re-litigate decided SKIP items (FBA fold defer, `orders` decomposition skip,
   `station_activity_logs` leave-as-is, warranty domains kept separate).
3. `.claude/rules/polymorphic-tables.md` — DDL contract for every **new** table
   (`entity_type`/`entity_id`, named CHECK, org-led indexes, tenant-from-birth, Drizzle same PR).
4. `CLAUDE.md` + `.claude/rules/source-of-truth.md` + `.claude/rules/backend-patterns.md` +
   `.claude/rules/build-gotchas.md` + `.claude/rules/contextual-display.md`.
5. `context/WORKFLOW-RECEIVING.md` — triage vs unbox semantics (independent timestamps).
6. Skills when triggered: `db-migration-author`, `new-route`, `domain-unit-test`, `org-scope`,
   `sidebar-mode`, `station-block`.
7. Live evidence of what already shipped (do not redo):
   - `src/lib/migrations/2026-06-29c_receiving_line_facts_tables.sql` (+ `29d` backfill, `29e` dual-write)
   - `src/lib/migrations/2026-07-05c_receiving_street_tables.sql` (`receiving_triage` / `receiving_unbox`)
   - `src/lib/migrations/2026-07-05d_receiving_spine_rename.sql` — **physical tables already renamed**;
     `receiving` / `receiving_lines` are `security_invoker=true` compat **views**
   - `src/lib/migrations/2026-07-05e_*` — dead `lpn` drop pattern (view drop → column drop → view recreate)
   - Drizzle: `pgTable('receiving_carton', …)` and `pgTable('receiving_line', …)` already under export
     names `receiving` / `receivingLines` in `src/lib/drizzle/schema.ts`
8. Code map to rewrite:
   - Monolith GET: `src/app/api/receiving-lines/route.ts` (~2k lines, `?view=` multiplexer)
   - Writers: `mark-received`, `mark-received-po`, `lines/[id]/status`, `lines/[id]/advance`,
     `lookup-po`, `receiving-entry`, `zoho-receiving-sync`, `zoho-received-reconcile`,
     `tracking-match-reconcile`, `record-scan.ts`, `unbox-scan-opened.ts`, `complete-triage.ts`
   - Lib spine: `src/lib/receiving/{facts,kinds,spine,streets,display}/`
   - Chokepoints: `src/lib/inventory/state-machine.ts` (`transitionReceivingLine`, `INBOUND_TRANSITIONS`),
     `receiveLineUnits` / receive-line helpers

# Current reality (do not invent alternate history)

| Concern | Status |
|---|---|
| Physical rename `receiving`→`receiving_carton`, `receiving_lines`→`receiving_line` | **DONE** (`2026-07-05d`) |
| Compat views under old names | **STILL LIVE** — ~900 raw-SQL refs still hit views |
| Line facts tables + dual-write trigger `trg_sync_receiving_line_facts` | **LIVE**, 0-drift parity |
| Carton street tables + `trg_sync_receiving_street` | **LIVE**, 0-drift parity |
| Reader cutover to facts/street tables | **NOT DONE** (parity-proven safe) |
| Writer cutover (facts/street first, spine columns second) | **NOT DONE** (attempted once, reverted) |
| Step D write-collapse onto `transitionReceivingLine` | **PARTIAL** — 2 routes done; **6+ raw `SET workflow_status` remain** |
| Mega-GET `?view=` decomposition | **NOT DONE** (only delivery_state / precedence slices extracted) |
| Drop moved spine columns + dual-write triggers + compat views | **GATED on cutover** — this run **un-gates** them |
| Schema-wide Tier-1 after receiving | mostly decided; provenance drop arc already applied historically — verify live vs docs |

# Hard invariants (violating any is a failed run)

- **Work on `main` only.** Never create/switch branches. Never `git stash`. Never commit/push unless
  the human explicitly asks — leave the tree for GitHub Desktop.
- **Never commit `.env`.** Document new env in `context/ENV-VARS.md` + blank `.env.example`.
- **Status changes only via `transition()` / `transitionReceivingLine()`** — end state: grep finds
  **zero** inline `UPDATE … SET workflow_status` outside the state-machine module (plan §10).
- **Audit only via `recordAudit()`** with `AUDIT_ACTION` / `AUDIT_ENTITY` constants.
- **Tenant scope via `withTenantTransaction(orgId, …)`**; `orgId` from auth `ctx`, never body.
  Never introduce new `USAV_ORG_ID` fallbacks.
- **New polymorphic tables:** `.claude/rules/polymorphic-tables.md` — `entity_type`/`entity_id`
  (not `owner_*`), named CHECK, org-led unique, parent-delete integrity, `enforce_tenant_isolation`
  in birth migration, Drizzle model same change.
- **Dates:** only via `src/utils/date.ts` (civil vs instant vs warehouse zone).
- **Migrations:** dated immutable SQL under `src/lib/migrations/`; author via `db-migration-author`
  skill. Prefer apply via the repo's migrate path when the human is present / dogfood DB is the
  target. Do **not** `drizzle-kit push`.
- **Compat-view security:** if you recreate any shim view over FORCE-RLS tables, it **must** be
  `WITH (security_invoker = true)` (PG15+). Prefer **deleting** shims once code targets base tables.
- **Display:** pick archetype per region (station / workbench / monitor / canvas); do not blend.
  This run is mostly schema + API — avoid drive-by UI redesigns unless a street endpoint requires it.
- **Do not delete** `docs/todo/schema-wide-polymorphic-refactor-plan.md` Appendices A–D or the
  polymorphic rules file — other plans reference them.

# Authority / scope (full control)

You may freely:

1. Rewrite any file under `src/`, `tests/`, `scripts/`, `docs/todo/` status headers.
2. Author and (with dogfood DB access) apply migrations that rename, backfill, drop columns,
   drop triggers, drop/recreate views.
3. Mass-migrate raw SQL from `receiving` / `receiving_lines` → `receiving_carton` / `receiving_line`
   (and `receiving_id` → `carton_id` where the plan specifies).
4. Delete the `/api/receiving-lines` multiplexer after per-street endpoints exist.
5. Invert dual-write: writers → facts/street tables first; then drop spine denorm columns; then
   drop `trg_sync_receiving_line_facts` / `trg_sync_receiving_street`.
6. Fold all remaining workflow_status writers onto `transitionReceivingLine` (including bulk/sync/
   cron paths in Step D tail).
7. Reseed dogfood receiving rows from Zoho if backfill is noisier than a clean reseed.
8. Update plan status headers to match reality when you finish a step.
9. Fix incidental tenancy / type-drift you hit while cutting over (Drizzle vs live DB lies).

Out of scope unless the human expands mid-run:

- Full FBA spine fold (plan says SKIP/defer)
- `orders` god-table decomposition
- Collapsing `station_activity_logs` into a single `entity_*` pair (rejected by data)
- Merging `repair_service` onto `unit_repairs`
- Renaming legacy `shipment_links.owner_*` (contract says leave)
- Marketing site / Electron desktop work
- Unrelated Studio canvas features

# Orchestration directives (ultracode)

1. **Parallel scout first** (no code yet). Fan out and return a structured map:
   - Which refs still hit compat **views** vs base tables (`receiving_carton` / `receiving_line`)
   - Every reader/writer of interim triage/unbox spine cols and of testing/zoho wide cols
   - Every `SET workflow_status` site (Step D inventory)
   - Live `\d receiving`, `\d receiving_carton`, view defs, trigger list (if DB reachable)
   - Parity spot-check: street tables vs spine cols; facts tables vs line cols
2. Synthesize a **cutover order** that matches §8 but accelerates under dogfood override. Default
   recommended order for THIS run:

   **Wave 0 — Truth + safety net**
   - Confirm migrate status; snapshot row counts (carton, line, triage, unbox, each facts table).
   - Optional: dump a one-shot SQL count report into `/tmp` or a docs note — not a new plan doc.

   **Wave 1 — Canonical names everywhere**
   - Repoint all app raw SQL + comments + tests off compat views onto `receiving_carton` /
     `receiving_line`.
   - Keep Drizzle table names as the physical names; optionally rename TS exports to
     `receivingCarton` / `receivingLine` if it reduces confusion (update all imports).
   - Migration: `DROP VIEW receiving` / `DROP VIEW receiving_lines` once grep proves zero view
     dependents (recreate only if a blocker forces a temporary shim — security_invoker required).

   **Wave 2 — Reader cutover (facts + streets)**
   - Per street, lowest risk first: history → incoming → triage → test → unbox → door.
   - Point SELECTs at `receiving_line_*` / `receiving_triage` / `receiving_unbox` for moved fields.
   - Delete corresponding `?view=` arms + `normalizeRow` fields as each street gains its own
     endpoint under `src/app/api/receiving/...` (or `streets/...` as the plan sketches).
   - Keep shared vocabulary in `display/precedence.ts` / kinds registry — do not fork rank SQL.

   **Wave 3 — Writer cutover + Step D finish**
   - Invert writers: mutate facts/street tables as SoT; stop relying on dual-write triggers.
   - Fold every remaining raw `workflow_status` UPDATE onto `transitionReceivingLine` (use
     `skipEvent` where a route already emits its own combined event — pattern already shipped).
   - Converge receive paths on `receiveLineUnits()`.

   **Wave 4 — Drop corpses**
   - Drop interim spine columns listed in plan Appendix + §8 step 13 (triage/unbox denorms,
     testing cluster, zoho cluster, dead leftovers).
   - Follow `2026-07-05e` mechanics: dependent views/triggers first, then DROP COLUMN, then
     recreate only what must remain.
   - Drop dual-write triggers/functions once no writer depends on them.
   - Assert spine width ≤ ~12 cols each (plan §10).

   **Wave 5 — Schema-wide leftovers (only if Wave 4 green)**
   - Fix known contract violations called out in audits (e.g. `pack_profile_links.owner_*` →
     `entity_*` if still present).
   - Any remaining Phase 2–4 items in the schema-wide plan that are still open **and** not marked
     SKIP — otherwise stop and report.

3. After each wave: run gates honestly and paste results. A red gate blocks the next wave unless
   the failure is solely the expected dogfood breakage you are mid-fixing — then say so.

   Minimum gates:
   ```
   npx tsc --noEmit
   # scoped unit tests for receiving/facts/spine/state-machine
   npm test -- --test-name-pattern='receiving|facts|spine|transitionReceiving'
   # when routes/perms change:
   # route-permission manifest + audit-route-auth
   ```
   Prefer also: receiving e2e specs if runnable
   (`tests/e2e/receive-to-zoho.spec.ts`, `zendesk-claim.spec.ts`, mobile receiving specs).
   If e2e is red because of intentional mid-cutover, document the gap and continue — do **not**
   use "e2e red" as a permanent stop for this run.

4. If scouting contradicts the plan docs, **amend the plan status header** with the correction,
   then proceed. Do not silently invent a third architecture.

5. Prefer many small migrations over one mega-migration when drops are irreversible — but you may
   batch when dogfood downtime is acceptable and the human is watching.

# Success criteria (Definition of Done)

Ship only when **all** are true:

1. Physical tables named `receiving_carton` and `receiving_line`; **no** compat views named
   `receiving` / `receiving_lines`.
2. App code (TS/SQL strings/tests) greps clean for bare `FROM receiving` / `JOIN receiving` /
   `INTO receiving` / `UPDATE receiving` (allow `receiving_carton`, `receiving_line`,
   `receiving_triage`, `receiving_unbox`, `receiving_line_*`, `receiving_scans`,
   `receiving_exceptions`, route path strings like `/api/receiving/...`).
3. `receiving_carton` / `receiving_line` are thin spines (≤ ~12 meaningful cols each); per-street
   columns live only on street/facts tables.
4. Dual-write triggers for facts/streets are **gone**; writers hit the target tables directly.
5. Zero inline `workflow_status` updates outside `transitionReceivingLine` / state-machine.
6. `/api/receiving-lines` view-multiplexer deleted or reduced to a deprecated shim with no
   street logic; each street has its own read (+ write) lane.
7. Data preserved or intentionally reseeded: row-count report before/after; 0 silent loss for
   kept facts; dogfood can receive a carton end-to-end (door → triage → unbox → test) after cutover.
8. `tsc --noEmit` green; receiving unit tests green; plan status headers updated to SHIPPED for
   completed steps.
9. Tenancy: FORCE RLS still on spines; no security_invoker regression; no new cross-tenant unique
   keys.

# Reporting discipline

Narrate wave transitions and load-bearing discoveries. End each wave with:

```
COMPLETED: Wave N — …
FILES: …
MIGRATIONS: …
GATES: <command results summary>
DATA: <row counts / parity notes>
NEXT: …
```

On a true blocker (missing DB creds, human-only secret, contradictory owner decision):

```
BLOCKED: Wave N
REASON: …
NEXT ACTION: <exact human action needed>
```

Do **not** invent HUMAN GATEs that reintroduce the old e2e-red stop. Only stop when:

- You lack DB credentials / migrate rights and need the human to run `npm run db:migrate`
- A locked SKIP decision in the schema-wide plan would be violated
- Continuing would commit secrets or destroy non-dogfood data

# Start now

1. Confirm cwd is the cycleforge-app repo root on `main`.
2. Run the parallel scout (Wave 0).
3. Present the cutover map + first concrete migration/code PR-sized chunk.
4. Execute Waves 1→4 without waiting for permission — **you already have it**.
5. When Done, paste a final DoD checklist with greps and counts as evidence.

Begin.
