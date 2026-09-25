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

### 4. Repair leftovers — answered 2026-09-24, built in pass 4
Decisions and build spec: `mobile-workbench-PASS4-HANDOFF.md`. All eight are answered; rows
1–7 are built and probed at :3050 with writes mocked (screenshots `/tmp/rs-video-*`,
`/tmp/rs-contact-*`, `/tmp/rs-print-station-*`, `/tmp/rs-benchlog-*`, `/tmp/desk-signoff-*`,
`/tmp/rs-cache-*`). Row 8 is the operator's phone check.

1. **Video** — same routing as photos, generic over `PhotoEntityType`:
   - `POST /api/photos/upload/video` (gate `uploadPermissionFor(entityType)`, same as
     `POST /api/photos/upload`) → pending `entity_videos` row + V4 signed PUT
     (content type + size range signed); `POST /api/photos/upload/video/[id]/finalize` reads
     GCS metadata → ready → `publishEntityMediaInsert` (the photo route's per-entity
     realtime dispatch, now shared); `GET /api/photos/videos/[id]/content` → 302 signed read.
   - Same bucket; key `{org}/videos/{photo flow dir}/{videoId}.{ext}`
     (`buildGcsVideoObjectKey`, `entityFlowDirectory` in `storage/path-builder.ts`).
   - Rules: `src/lib/photos/video-upload-rules.ts` (mp4/quicktime/webm, cap
     `PHOTOS_VIDEO_MAX_BYTES`, default 500 MB). Client: `src/lib/photos/video-upload-client.ts`.
   - `GET /api/repair-service/[id]/photos` returns `videos[]`; grid video tile; the swipe
     viewer plays inline. Migration `2026-09-24d_entity_videos.sql`.
   - Operator: bucket CORS for browser PUT (origin list, `PUT`, headers `Content-Type`,
     `x-goog-content-length-range`) is not applied yet; no sweep for abandoned pending rows.
2. **Customer contact** — `PATCH /api/customers/[id]` (`repair.intake`);
   `POST|PUT|DELETE /api/repair-service/[id]/customer` (create+link / change / unlink, never
   deletes the customer). `customer_id` left the generic repair PATCH allowlist.
   `RepairInfoEditSheet` + `RepairCustomerPickerSheet`; plan in `repair-info-edit.ts`.
3. **Print station** — `src/lib/print/print-station.ts` (per-browser id + name, per-staff
   remembered pick); jobs require `targetStationId`; `StaffPrintStationPicker` on paperwork
   and `/m/print` (both on `useStaffPrintBridgeClient`, self-echo filtered); station name
   field in Settings → Hardware; `/print-log` kept and records `stationName`.
4. **Stock** — take-from-stock needs a bin (`RepairStockBinPicker`, existing
   `GET /api/sku-stock/[sku]/bins`); `bin_contents` + ledger move in the action's
   transaction; short bin → 409; delete reverses both (`repair-stock-take.ts`).
5. **Desk pickup** — `RepairPickupFlow` rebuilt from kiosk v2 pieces (`KioskPaneForm`,
   `KioskEntryField`, `SignaturePad`, `KioskChip` decline reasons, review); one write,
   `pickup-submit.ts`. Banner slot change accepted.
6. **Bench log → ticket** — INTERNAL note (operator confirmed 2026-09-24; `REPAIR_LOG_TICKET_NOTE_PUBLIC` in
   `repair-action-ticket-note.ts`, one constant) posted after commit, idempotent per action
   (`ticket_post_*` columns); retry `POST /api/repair/actions/[id]/ticket-post`
   (`repair.mark_repaired`). Timeline shows Posted / Failed — Retry. Hub draft line kept.
   Migration `2026-09-24e_repair_actions_bin_and_ticket_post.sql` (also row 4's bin columns).
7. **Refresh** — `WorkbenchCachePersistence` (in `AuthProvider`, `WarehouseShell`) +
   `src/lib/mobile/workbench-cache.ts`: sessionStorage `cf-rq-wb:{org}:{staff}`, buster
   `wb-v1`, 24h; cleared on sign-out/owner change. Restored entries are applied when the
   first workbench query subscribes (hydrating in render caused a hydration error).
8. **Operator phone check** — pending.

Migrations `2026-09-24d_entity_videos` and `2026-09-24e_repair_actions_bin_and_ticket_post`
were applied 2026-09-24 with the operator's OK, together with two other sessions' pending files
(`2026-09-24_platform_short_labels`, `2026-09-24d_kiosk_carts`). After that the dry run showed
0 pending, and `tenancy:coverage` was regenerated. Still not exercised: a real GCS upload
(it needs the bucket CORS rule) and a real Zendesk post.

### Carton follow-up — unbox hands straight to QC (2026-09-24)

The normal scan kernel still identifies an `R-` carton onto `/m/r/{id}`, where the
operator confirms **Unbox**. Once the carton-scoped receive succeeds, the hub now
replaces itself with `/m/r/{id}/qc`; that screen lists the carton's received lines,
then the selected line's units, then the selected unit's checklist. An armed QC
scan of the same carton already lands on that picker directly.

## Checks before you call it done
- `pnpm verify:fast` (only the known `sessions.ts` error allowed).
- `ds.mjs contract` returns each new pin first for its job phrase.
- The new guard fails on a planted violation and passes after removing it.
- Every probe at :3050 has non-GETs mocked.
- Delete probe scratch (`.tmp/…`) and any stray files.
