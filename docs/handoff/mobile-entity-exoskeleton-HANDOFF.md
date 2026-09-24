# HANDOFF — One mobile exoskeleton for every scanned thing (2026-09-24)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

## Operator intent

> "How would I be able to create like a exoskeleton mobile display for the scanner
> identification triage? … picking should also look like this and a bin should also look
> like this and a packing … unbox … scan out should look like this."

The repair hub (`/m/rs/[id]`) is the reference. Every entity a scan lands on gets the same
face:

```
┌ MobileDetailTopBar ─ ‹ Back · IDENT (mono) · meta ─────────── Scan ┐
│ ┌ Summary card (whole card → /info) ──────────────────────────── › ┐│
│ │ Title — one line, truncated                                      ││
│ │ caption line 1 (the job-relevant fact)                           ││
│ │ caption line 2 (who / where)                                     ││
│ │ MONO ID / SERIAL                                  [Status chip]  ││
│ └──────────────────────────────────────────────────────────────────┘│
│ Ack (server-stamped, dismissable)                                   │
│ ┌ Door rows (registry) ─ icon · title · one-line meta · › ─────────┐│
│ └──────────────────────────────────────────────────────────────────┘│
└ Verb dock: ≤3 verbs, one primary ───────────────────────────────────┘
/info   = every fact in full + the ONLY edit (pencil in the bar)
```

Rules the operator set on 2026-09-24:
- No section heading and no "Edit" text on the hub. The card is read-only. The pencil lives
  only on `/info`.
- Status goes bottom-right in the card, the same box height as the mono ID beside it, with
  the same 2px caption rhythm as the lines above.
- The customer's contact (name · phone) shows on the card whenever the entity has one.
- Back returns to where the operator was before the scan. This is already solved globally
  (`src/lib/mobile/nav-trail.ts` + `MobileDetailTopBar`). **Never** `router.push` a parent
  from a Back.
- Revisiting a hub must not refetch everything. Reads go through React Query facets, and
  realtime invalidation lives in a `layout.tsx` (see "Data" below).

## Working rules

- Probes go to `http://localhost:3050` only. Sign in once with
  `GET /api/auth/staff-picker` + `POST /api/auth/signin` (`x-tenant-slug: usav`,
  "Michael", `deviceKind: 'personal'`), save the storage state and reuse it (sign-in is
  rate-limited). In every probe, `page.route('**/api/**')` fulfils or aborts every non-GET.
- Boundary law: `src/app/m/**` and `src/components/mobile/**` import only from design-system,
  `components/ui`, `components/Icons`, mobile, `lib`, `hooks`, `contexts`, `utils` (and
  `@/queries/keys`). Check with `node tools/design-mcp/ds.mjs boundary <file>`.
- White grounds (`scripts/mobile-ground-guard.ts`, baseline now **40**, shrink-only).
  `MobileRouteShell` owns the only `<main>`, so screens use `<div>`.
- Nav law (`src/lib/nav/lanes.ts`): a parent and a child never share a name, and icons go at
  the parent level only. A door title must differ from the entity's bar title. Run
  `ds_nav_names`.
- SURFACE_LAW (`docs/mobile-first/SURFACE_LAW.md`): one job per screen, a sticky primary
  CTA in the thumb zone (≥44px), progressive disclosure, and a permanent Scan seat.
- Do not break existing scan routing: `routeScan` / `landScanIdentify` / `dispatchScan`
  and their tests.
- Done = `pnpm verify:fast` green, except errors in files you did not touch.

## Reference implementation (read these first)

| Piece | File |
|---|---|
| Hub page | `src/app/m/(shell)/rs/[id]/page.tsx` |
| Summary card | `src/components/mobile/repair/RepairInfoCard.tsx` |
| Details + edit | `src/app/m/(shell)/rs/[id]/info/page.tsx`, `RepairInfoEditSheet.tsx`, `useRepairInfoSave.ts` |
| Door registry | `src/components/mobile/repair/useRepairHubRows.tsx` (`screen(id, title, icon, {meta, enabled})`) |
| Shared rows | `src/components/mobile/detail/DetailParts.tsx` (`DetailFactRow`, `DetailNav`, `DetailNavRow`, `DetailAck`) — the unit hub already uses it |
| Verb dock | `src/components/mobile/repair/RepairWorkbenchDock.tsx` |
| Data | `src/components/mobile/repair/useRepairWorkbench.ts` (`qk.repairs.workbench(id, facet)`, `fetchRepairJson`) |
| Realtime | `src/app/m/(shell)/rs/[id]/layout.tsx` (`useRealtimeInvalidation({ repair: true })`) |
| Back | `src/lib/mobile/nav-trail.ts`, `MobileDetailTopBar` `backHref` |

## Step 1 — promote the kit (do this before any entity)

Promote the repair pieces into `src/components/mobile/detail/`, next to `DetailParts`, with
repair and unit as the two proving callers. The unit hub (`/m/u/[id]`, `useUnitHubRows`)
already uses DetailParts. Don't write a third copy.

- `DetailSummaryCard`: `{ href, title, lines: string[] (≤2), mono?: string,
  status?: { label, className } | null }`. This is `RepairInfoCard` made generic; the
  repair card becomes a thin mapper over it. Keep the one-line title, the chevron, the mono
  bottom-left, and the status bottom-right with a matched box height.
- `DetailDock`: `{ verbs: { id, label, icon, primary?, enabled? }[] (≤3), onVerb }`. This
  is `RepairWorkbenchDock` made generic.
- `DetailHubScreen`: slots `topBar`, `card`, `ack`, `rows`, `dock`, plus loading/error.
  It gives one layout so no hub can drift from the others.
- `detailScreen(base, id, title, icon, row)`: the registry helper from `useRepairHubRows`.
- Details screen pattern: `/<entity>/[id]/info` shows `DetailFactRow`s. The pencil is in
  `MobileDetailTopBar.right` and opens that entity's edit sheet, which saves through its
  **existing** write route.
- Data pattern: add `qk.<entity>.hub(id, facet)` in `src/queries/keys.ts`, put a
  `layout.tsx` with the entity's realtime invalidation under `/m/<entity>/[id]/`, and pass
  only a facet's own refetch to its writes.
- Regression tests: none for the layout. Pure mappers (entity row → card props) get a small
  unit test only where precedence is non-obvious, such as which status or which contact wins.

## Step 2 — entities, in this order (easy → task-runner)

Each row is a proposal. Confirm the card lines with the operator per entity; pick the
facts that entity's worker needs at a glance. `/info` shows everything.

| # | Entity (scan → route) | Card: title / line 1 / line 2 / mono / status | Doors | Dock |
|---|---|---|---|---|
| 1 | **Unit** `U-`/GS1/unit_uid → `/m/u/[id]` (already DetailParts; `useMobileUnit` is React Query) | product title / condition grade / location / serial / unit status | existing `useUnitHubRows` (+ QC per `qc-scan-type-HANDOFF.md`) | Move · **Pair** · Test |
| 2 | **Bin** → today `/inventory?bin=` (desktop) or `/m/b/[barcode]` (redirect). **Needs a real `/m/b/[code]` hub.** | bin name / zone · capacity / item count · last move / bin code / active·locked | Contents · Movements · Label | Move in · **Count** · Print label |
| 3 | **Handling unit** `H-` → `/m/h/[id]` (React Query already) | HU label / tested rollup / location / `H-id` / HU status | Members · Photos · Label | Assign · **Close** · Print |
| 4 | **Unbox — carton** `R-` → `/m/r/[id]` (`CartonMobileOpsClient`, useEffect fetch) | vendor / PO · tracking / lines done n/m / `R-id` / receiving stage | Lines · Photos · Timeline | Photo · **Unbox** · Scan again |
| 5 | **Unbox — line** `L-` → `/m/l/[id]` (proxy to desktop `/receiving/lines/[id]` today) | item title / SKU · qty / serials n/m / `L-id` / QA status | Serials · Bin · Timeline · QC | Tested ✓ · **Complete unbox** · Tested ✗ |
| 6 | **Order** → `/m/orders/[orderId]` (bento, useEffect fetch) | order # / items summary / customer · phone / order # / order status | Items · Shipment · Timeline · Ticket | Pick · **Pack** · Scan out (by stage) |
| 7 | **Scan-out** → `/m/id/scan-out/[orderId]` (`IdentificationJobFace`) | order / carrier · tracking / customer / tracking / ship status | Order · Label | **Confirm scan-out** |
| 8 | **Pick** → `/m/pick/[orderId]` (step runner) | order / n of m picked / next bin / order # / pick status | Tasks · Shorts | **Start / Resume pick** → the runner |
| 9 | **Pack** → `/m/pack/start/[orderId]` (CaptureStack) | order / box · weight / photos n / order # / pack status | Photos · Packing log | **Start / Resume pack** → the studio |

**Pick and pack are task runners, not records.** Don't squeeze the step runner into the
hub; that would break SURFACE_LAW's one-job-per-screen. The hub is the entity's home, and
its primary dock verb opens the existing runner unchanged. Arguably pick, pack and scan-out
are *stages of the order* (row 6), so first ask the operator: **"Should Pick / Pack / Scan-out
be doors and dock verbs on one Order hub, or separate hubs?"** Default if unanswered: one
Order hub, with the dock verb following the order's stage.

**Bins** land on the desktop today. Build `/m/b/[code]` and point `routeScan` /
`landScanIdentify` at it on phones. Keep the `/m/scan` tape binding behaviour.

## Step 3 — scan triage lands on hubs

`/m/scan` (`MobileScanIdentify`, `landScanIdentify`) should navigate to the hub for every
entity above. Pass-through verbs ("Photos & classify", "Repair", …) stay where they are.
Update `src/lib/scan/*` tests for any changed landing.

## Checks (per entity)

- Probe at :3050 with all non-GET mocked. The scan landing lands on the hub. The card shows
  one-line title, two caption lines, and mono + status in one row with equal box heights
  (measure with `getBoundingClientRect`). The card opens `/info`; the pencil opens edit;
  the save payload is captured. Back from `/info` → hub → the scan screen (no loop). Going
  hub → door → back refetches 0 facet GETs.
- Boundary, ground and nav-name checks. `pnpm verify:fast`.
