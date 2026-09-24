# HANDOFF — Mobile exoskeleton: finish the kit, make it MCP law, roll it out (2026-09-24, pass 3)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

This continues `mobile-repair-workbench-NEXT-HANDOFF.md`, whose repair work is done. The
detailed per-entity spec is `mobile-entity-exoskeleton-HANDOFF.md`, and QC is its own
track in `qc-scan-type-HANDOFF.md`. Read all three first. This file gives the order of work
and the state verified this session.

## Working rules (binding)

- Probes go to `http://localhost:3050` only; never start another port. Sign in once
  (`GET /api/auth/staff-picker` + `POST /api/auth/signin`, `x-tenant-slug: usav`,
  "Michael", `deviceKind: 'personal'`), then **save and reuse** the storage state.
  `/api/auth/signin` rate-limits (429) after a few mints.
- In every probe, `page.route('**/api/**')` fulfils or aborts every non-GET.
  **RS-4799 is linked to Zendesk #9998 (a real customer).**
- **Never run session-level `SET` through the pooled `DATABASE_URL`.** On 2026-09-24 the
  pooler leaked `default_transaction_read_only=on` and broke app sign-in and migrations. For
  reads, use app GET routes, or `BEGIN READ ONLY … ROLLBACK` on `DATABASE_URL_UNPOOLED`. The
  lane DB (ep-shiny-hall) is the working DB. Migrations go through `/db-migrate`, after the
  operator OKs the exact pending list. `db:migrate` applies **every** pending file, so
  re-run the dry run immediately before applying.
- Boundary: `src/app/m/**` and `src/components/mobile/**` may import only from design-system,
  `components/ui`, `components/Icons`, mobile, `lib`, `hooks`, `contexts`, `utils` and
  `@/queries/keys` (`node tools/design-mcp/ds.mjs boundary <file>`).
- White grounds: the baseline is **40** and shrink-only (`src/lib/mobile/mobile-ground.ts`).
  `MobileRouteShell` owns the only `<main>`.
- Clean cutover: no re-exports, aliases or shims. Migrate every caller.
- Done = `pnpm verify:fast` green, except `src/lib/picking/sessions.ts` (a pre-existing
  missing `@/lib/picking/tote-scan`, not ours).

## Verified state (2026-09-24)

**Repair hub `/m/rs/[id]`:**
- **Card:** a read-only `RepairInfoCard` (device, issue, customer · phone, `SN` bottom-left,
  status bottom-right, same box height). It opens `/m/rs/[id]/info`, which has every fact
  plus the only pencil edit (`RepairInfoEditSheet`, `useRepairInfoSave`).
- **Doors:** Photos · Bench log · Ticket · Paperwork · Record, from `useRepairHubRows`.
  QC is removed from repair.
- **Back:** `src/lib/mobile/nav-trail.ts` (+ test). `MobileDetailTopBar` `backHref` pops
  when you came from there and replaces otherwise; it never pushes. Probe: details → hub →
  scan, with no loop.
- **Cache:** every repair read is a React Query facet (`qk.repairs.workbench(id, facet)`,
  `src/queries/keys.ts`), and `rs/[id]/layout.tsx` subscribes to `repair.changed`. Measured:
  after the first load, moving hub ↔ sub-screens makes 0 repair GETs. The cold-load
  duplicates are React StrictMode aborts (6 aborted of 13), dev-only.
- **Bench migrations applied:** `2026-09-24_repair_bench_sessions`,
  `2026-09-24b_repair_actions_bench_detail`. The same run also applied two other files that
  were pending, plus someone else's `2026-09-24c_kiosk_companion_links` (it appeared
  between the dry run and the apply).

**Design system / MCP:**
- The card is a DS component: `src/design-system/components/DetailSummaryCard.tsx`.
  Callers import it directly: `RepairInfoCard`, and `UnitQcRunner` (another session's file).
- `src/design-system/pinned.json` has a `DetailSummaryCard` entry (useWhen/doNot/law).
  `node tools/design-mcp/ds.mjs contract "mobile exoskeleton scanned entity hub"` returns
  it as the **first** match.
- `tools/design-mcp/README.md` "Naming (pinned)" names it.
- The engine lives in Garisek-OS (`~/Projects/Garisek-OS/tools/design-mcp/`,
  `target-engine.mjs`, `smoke.mjs`). This repo only carries the law:
  `tools/design-mcp/design-mcp.profile.json` + `pinned.json`. The README here says
  `node tools/design-mcp/smoke.mjs`, but no such file exists in this repo. Run
  `~/Projects/Garisek-OS/tools/design-mcp/smoke.mjs` and fix the README line.

**Audit of scanned-entity screens** (grep of each page plus its direct `components/mobile`
imports):

| Screen | Summary card | Door rows | `MobileDetailTopBar` | Notes |
|---|---|---|---|---|
| `/m/rs/[id]` repair | ✅ | ✅ | ✅ | reference |
| `/m/u/[id]` unit | ❌ | ✅ DetailNav | ✅ | closest; **another session owns unit + unit QC** — coordinate |
| `/m/h/[id]` handling unit | ❌ | ❌ | ✅ | raw `<button>`s (ds_critique: 3 problems) |
| `/m/r/[id]` carton (unbox) | ❌ | ❌ | ❌ | bespoke header, useEffect fetch |
| `/m/b/[barcode]` bin | ❌ | ❌ | ❌ | redirect only; the bin opens desktop `/inventory?bin=` |
| `/m/pick/[orderId]` | ❌ | ❌ | ✅ | step runner (keep; the hub opens it) |
| `/m/pack/start/[orderId]` | ❌ | ❌ | ❌ | trampoline into the pack studio |
| `/m/id/scan-out/[orderId]` | ❌ | ❌ | ✅ | `IdentificationJobFace` claim card |
| `/m/orders/[orderId]` | ❌ | ❌ | ❌ | bento cards, useEffect fetch |
| `/m/t/[ticketId]` | n/a | n/a | ✅ | thread; stays a conversation, not a hub |

## Tasks, in order

### 1. Finish the kit (DS components + pins)
Promote the rest of the repair exoskeleton next to `DetailSummaryCard` in
`src/design-system/components/` (flat — the MCP walk is non-recursive):
- `DetailDock`, from `RepairWorkbenchDock`: ≤3 verbs, one primary, thumb zone, ≥44px.
- `DetailHubScreen`, with slots for top bar, card, ack, doors, dock, loading/error.
- The `screen(id, title, icon, {meta, enabled})` registry helper from `useRepairHubRows`,
  as `detailDoor` in `src/lib/mobile/`.
- `DetailFactRow` / `DetailNav` / `DetailAck` stay in `src/components/mobile/detail/`
  unless the operator wants them in the DS. If you move them, migrate every caller.

Pin each new component in `pinned.json` (useWhen phrased as the job, doNot, law citing
operator 2026-09-24), then re-verify with `ds.mjs contract`. The repair hub adopts them
first, the unit hub second (coordinate with the unit/QC session).

### 2. Make the exoskeleton an MCP-served, gated law
Copy the sku-identity pattern: one law module, one guard, one gate, and the tool reads the
same module, so it can't disagree with the gate.
- `src/lib/mobile/detail-hub-law.ts` + `detail-hub-cohort.ts`:
  - **Peers:** the hub pages in the audit table.
  - **Engine contract** (presence): mounts `DetailSummaryCard`, the door list and
    `MobileDetailTopBar`.
  - **Forbidden** (absence) on a hub:
    - an `Edit` text button or a pencil;
    - a heading above the card;
    - `router.push` used for Back;
    - a nested `<main>`;
    - `useEffect`+`fetch` for hub facets instead of React Query;
    - more than 3 dock verbs.
  - **Baseline:** a shrink-only count of unported hubs, like `MOBILE_GRAY_GROUND_BASELINE`.
- `scripts/detail-hub-guard.ts --json`, wired into `pnpm verify:fast` like the ground and
  sku-identity guards.
- `tools/design-mcp/design-mcp.profile.json`:
  - add a `gates[]` entry `ds_detail_hub` (argv `scripts/detail-hub-guard.ts --json`,
    `fileArg --file`), following `ds_sku_identity` / `ds_boundary`;
  - add an `extraAxes[]` entry `detail-hub` (source: the law + cohort files) so
    `ds_tokens({ axis: 'detail-hub' })` serves the constants.
- Add a `ds.mjs detail-hub` subcommand, following `mobile-ground`, and a README row.
- Unit test the law's pure predicates. Plant one violation in a fixture, watch the guard
  fail, then remove it (VERIFY.md style).

### 3. Roll out per `mobile-entity-exoskeleton-HANDOFF.md`
Order: bin (needs a real `/m/b/[code]` hub, and `routeScan`/`landScanIdentify` pointed at it
on phones) → handling unit → carton + line (unbox) → order (with pick / pack / scan-out as
stage-driven doors and dock verbs, unless the operator says otherwise) → pick and pack hubs
that open the existing runners. Each entity gets:
- a React Query `qk.<entity>.hub(id, facet)`;
- a realtime `layout.tsx`;
- an `/info` screen, with the pencil edit through its **existing** write route;
- probes: equal-height measure, card → `/info`, Back with no loop, 0 GETs on revisit.

### 4. Repair leftovers — each needs an operator answer (ask in one batch)
1. **Video** on Photos: the pipeline is image-only (`src/lib/photos/service.ts` ALLOWED_MIME,
   8 MB cap, sharp thumbnails). Needs a storage/format/size decision.
2. **Customer contact edit** on repairs linked to a customer: there's no customer write
   route. Add `PATCH /api/customers/[id]`, or keep it read-only?
3. **Paperwork:**
   - keep `POST /print-log` (an audit-only write)?
   - add a view-only receipt variant (today it opens the print dialog)?
   - add a station ID on the print bridge so one named station can be picked?
4. **Stock deduction:** SKU-ledger only, no bin decrement, can go negative. Is that enough?
5. **Install banner:** it now takes layout space at the bottom instead of floating. OK?
   Desk pickup now requires a signer. OK?
6. **Hub Ticket row:** keep `· opens with a "<status>" draft`?
7. **Survive a browser refresh?** It would need `@tanstack/query-sync-storage-persister`
   (a new dependency) and would store customer PII in sessionStorage.
8. **Operator phone check** of the hub / info / doors split.

## Checks before you call it done
- `pnpm verify:fast` (only the known `sessions.ts` error allowed).
- `ds.mjs contract` returns each new pin first for its job phrase.
- The new guard fails on a planted violation and passes after removing it.
- Every probe at :3050 has non-GETs mocked.
- Delete probe scratch (`.tmp/…`) and any stray files.
