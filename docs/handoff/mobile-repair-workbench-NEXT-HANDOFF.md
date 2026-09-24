> **Continue from `docs/handoff/mobile-exoskeleton-CONTINUE-HANDOFF.md`** (2026-09-24, pass 3).
> The repair work below is done; that file has the verified state, the open decisions and the next tasks.

# HANDOFF — Mobile repair workbench, next phase (2026-09-24)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
Supersedes `mobile-repair-workbench-CONTINUE-PROMPT.md` (its checkpoints 1–7 are done).

## Working rules

- Probes only at `http://localhost:3050` (lane-prod). Never another port.
- Sign in for Playwright probes via `GET /api/auth/staff-picker` + `POST /api/auth/signin`
  (`x-tenant-slug: usav`, staff "Michael", `deviceKind: 'personal'`) — see `tests/shot.mjs`.
  Hide dev chrome in probes: `#__cf_switch, nextjs-portal { display:none }` and
  `sessionStorage['cf-install-dismissed']='1'`.
- **RS-4799 is linked to Zendesk #9998 (a real customer).** Never send a ticket
  reply, POST pickup, PATCH status or POST a repair action against it without the
  operator's explicit go. In probes, `page.route('**/api/**')` must fulfil or abort
  every non-GET.
- Component split law (ARCHITECTURE.md): `src/app/m/**` and `src/components/mobile/**`
  import only design-system, `components/ui`, `components/Icons`, mobile, `lib`,
  `hooks`, `contexts`, `utils`. Check with `node tools/design-mcp/ds.mjs boundary <file>`.
- Phone grounds are white (`scripts/mobile-ground-guard.ts`, baseline 42). No
  `bg-surface-canvas` / grey page grounds on `/m`.
- Done = `pnpm verify:fast` green except errors in files you did not touch (at
  handoff the only red was someone else's `src/lib/picking/sessions.ts` import of
  `@/lib/picking/tote-scan`). Preserve other people's dirty-worktree changes.

## What exists now (verified this session)

Screens (all `ModeRegion mode="triage"`, white ground):

| Route | File | Job |
|---|---|---|
| `/m/rs/[id]` | `src/app/m/(shell)/rs/[id]/page.tsx` | Hub: facts panel (status badge + server "since", device, issue, serial, customer), photo strip, nav rows (Bench log · Ticket · Record), dock Status · Log work · Pickup |
| `/m/rs/[id]/work` | `src/app/m/(shell)/rs/[id]/work/page.tsx` | Bench log timeline + Log work button; `?log=1` opens the sheet (hub dock uses this) |
| `/m/rs/[id]/record` | `src/app/m/(shell)/rs/[id]/record/page.tsx` | Identifiers, ticket link verdict, pickup audit + receipt link, state history |
| `/m/t/[ticketId]` | existing `MobileTicketThread` | Full ticket thread + reply dock; now accepts `?draft=` (editable, never auto-sent) via `useTicketComposer({ initialBody })` |

Components (`src/components/mobile/repair/`): `RepairWorkbenchDock` (`pickupEnabled`),
`RepairStatusSheet`, `RepairPickupSheet`, `RepairLogWorkSheet`,
`RepairPartField` (catalog search `searchField=zoho_catalog` + temp `TMP-` part
create via `/api/sku-catalog/provisional`), `ScanValueField` (camera scan via
`ScanSurface`/`useBarcodeScanner`), `RepairActionTimeline` (presentational; parts
Out/In with serial + Temporary chip), `mobile/detail/DetailParts` (`DetailFactRow`,
`DetailSectionHeading`, `DetailAck`, `DetailNavRow`, `DetailNav` — the exoskeleton rows, shared with the unit hub),
`useRepairWorkbench` (`useRepairRecord`, `useRepairActions`, `useRepairTicketLink`,
`ticketThreadHref`, `ticketBlockedReason`).

Logic: `src/lib/repair-status.ts` (pickup eligibility, operator labels, status order),
`src/lib/repair/repair-actions.ts` (action record type + copy), `repair-history.ts`,
`ticket-link.ts` (+ unit test; only `linked` may open a draft/send),
`customer-update-drafts.ts`, `pickup-submit.ts` (one pickup write, desk + phone).

Read routes added (both `repair.view`): `GET /api/repair-service/[id]/photos`,
`GET /api/repair-service/[id]/ticket-link`. Manifest regenerated
(`pnpm audit-route-auth:emit`).

Log work maps onto `repair_actions`: `old_sku/old_serial` is the part removed or worked on,
`new_sku/new_serial` is the part installed or needed, and `part_name` is the title. Since
2026-09-24b it also has `session_id` (the bench timer), `donor_source/donor_ref`,
`component_ref/value/qty` and `stock_ledger_id`. Duration comes from the session, not typed
input, and `created_at` is stamped by the server.

## Status after the 2026-09-24 second pass

Hub rows now come from the `useRepairHubRows` registry
(`src/components/mobile/repair/useRepairHubRows.tsx`): Photos · Bench log · Ticket ·
Paperwork · Record. To add a new screen, add one summary hook and one `screen(...)` entry
there; the hub page itself does not change.

- [x] **A. Information + Edit.** `RepairInfoEditSheet` + `src/lib/repair/repair-info-edit.ts`
      (+ test). One existing `PATCH /api/repair-service` per changed fact, stopping at the
      first failure. The row rolls back, then a server re-read shows what stuck. Customer
      contact is editable only when the repair has no `customer_id`; the joined customer
      record wins otherwise. **Open:** there is no customer write route, so contact on
      linked repairs can't be corrected from the phone.
- [x] **B. Photos** `/m/rs/[id]/photos`: grid, viewer, Take photo (REPAIR_SERVICE,
      `repair.intake`), and Send to ticket. Attach goes through `?photos=&visibility=` →
      `useTicketComposer` staging and never auto-sends. `RepairPhotoStrip` was deleted.
      **Open:** video. The pipeline is image-only (`src/lib/photos/service.ts` ALLOWED_MIME,
      8 MB cap, sharp thumbnails), so storage and format need an operator decision.
- [x] **C. Quality control:** moved out of the repair workbench (operator 2026-09-24). It is
      now its own scan type; see `docs/handoff/qc-scan-type-HANDOFF.md`.
- [x] **D. Paperwork** `/m/rs/[id]/paperwork`: receipt, label and manual. Print-to-station
      runs over the existing Ably staff print bridge (grain `repair`). The log reads
      `audit_logs` through `GET /api/repair-service/[id]/print-log`. **Open:** `POST
      …/print-log` is a new audit write. The receipt opens the print dialog on load. The bridge
      can't target one named station.
- [x] **E. Bench suite:** server-stamped timer (`repair_bench_sessions`), repaired vs
      replaced, donor source, component ref/value/qty, and opt-in `REPAIR_INSTALLED`
      stock ledger −1 (SKU level only). Bench before/after shots are plain REPAIR_SERVICE
      photos, with no per-action link. Migrations `2026-09-24_repair_bench_sessions` and
      `2026-09-24b_repair_actions_bench_detail` are **applied**.
- [x] **F. Exoskeleton registry.** See above.

## Open issues carried over
- [ ] The operator has not yet checked the hub / bench / photos / paperwork split on a phone.
- [x] Lost first tap on Log work: this did not reproduce on a warm build (5/5). It was a dev
      cold-compile effect.
- [x] Pickup `ConfirmSheet` now stacks at `level={1}`. Escape closes only the topmost sheet;
      the fix is in `BottomSheet` + `claimOverlay().isTopmost`.
- [x] `InstallPrompt` is now a layout slot inside `#app-root`, so docks sit above it.
- [x] Desk `RepairPickupFlow` has an editable signer and requires it for a signed pickup.
- [x] Caching + realtime: every workbench read is a React Query facet
      (`qk.repairs.workbench(id, facet)`), and `rs/[id]/layout.tsx` subscribes to
      `repair.changed`. Moving hub ↔ sub-screen now makes 0 repair GETs.
- [x] Back loop: `MobileDetailTopBar` `backHref` pops when the operator came from there and
      replaces otherwise (`src/lib/mobile/nav-trail.ts`). It never pushes.
- [x] Hub top is a read-only summary card (`RepairInfoCard`) → `/m/rs/[id]/info` (all
      facts; the pencil in the bar is the only edit). Next: generalize it per
      `docs/handoff/mobile-entity-exoskeleton-HANDOFF.md`.
- [x] Nested `<main>`: `MobileRouteShell` now owns the only one on every `/m` route.
- [ ] Hub ticket row still says `· opens with a "<status>" draft` when a draft exists.
      Confirm whether that line stays.
