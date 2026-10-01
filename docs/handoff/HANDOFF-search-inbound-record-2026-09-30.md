# HANDOFF — Search opens the inbound record the desks open (owner 2026-09-30)

Paste this whole file as the prompt. It is self-contained.

## Goal

A receiving hit in `/search` must display **exactly** like the same record on
the inbound desks. Today it does not:

- **Desks** (`/incoming`, Docked, Receipts, Pasted numbers) open a record through
  `useRecordSlot(model, verbs, label, 'inbound-record')` → `RecordTitle` +
  `RecordActionStrip` + `RecordView`, inline beside their list (the record plane:
  "In place" / "Split", `DeskRecordPlane`).
- **Search** (`/search?sel=receiving:<id>`) paints a separate, older dossier:
  `SearchReceivingDossier` → `SearchEntityRecord` (its own header, facts card,
  lines list, findings), fed by `search-dossier-model.ts`
  (`cartonDossierLines`, `cartonDossierFindings`, `presentFact`) and
  `cartonHeaderIdentity` from the inspector.

Orders already do it right: `SearchOrderRecord` mounts the desk's own
`OrderRecordView` inside `DeskStageRecordHeader` + `DESK_STAGE_FIXED_CLASS`
(read it first — `src/components/search/dossier/SearchOrderRecord.tsx`). Do the
same for inbound, then delete the old inbound search pieces. One design: the
list shows records the way the desks show them, and opening one shows the same
`RecordView` the desk opens, with the same header verbs.

## Working mode (binding)

- Dev origin `http://localhost:3050` only (lane `cycleforge-lane@prod`; wedged
  turbopack → `systemctl --user restart cycleforge-lane@prod`). Never start
  `next dev`, never bind another port.
- Smoke with a throwaway Playwright script (`@playwright/test`, storageState
  `tests/.auth/admin.json`, 1600×1100 and 390×844), screenshots in `/tmp`,
  delete the script after. `pnpm verify:fast` before calling it done; `pnpm verify`
  at the end.
- **Clean cutover:** delete every inbound search piece the moment nothing imports
  it. No aliases, no shims, no re-exports.
- No new `pinned.json` entries; edit an entry only if its text becomes false.
- Other sessions work in this worktree (repair: `src/components/repair/**`,
  `src/lib/repair/**`; nav: `src/lib/nav/**`, `src/components/layout/**`). Do not
  touch those. Re-read a file right before editing it.

## Read only these

- `src/components/search/dossier/{SearchDossier,SearchOrderRecord,SearchReceivingDossier,SearchEntityRecord}.tsx`
- `src/lib/search/search-dossier-model.ts`, `src/lib/search/search-receiving-resolve-query.ts`
- `src/design-system/components/record-ledger/{record-model.ts,RecordView.tsx,useRecordSlot.tsx}`
- `src/components/receiving/record/{inbound-record-model.tsx,useInboundRecord.tsx,inbound-record-verbs.tsx}`
- `src/components/receiving/history/use-carton-record.ts` (`useCartonRecord(row)`
  keys on `row.receiving_id` — search only has the receiving id)
- `src/components/search/SearchResultsSurface.tsx` + `hits-grid/*` (the results list)

## The shared record (built 2026-09-29/30, don't rebuild it)

- `RecordModel` / `RecordView` / `useRecordSlot` in `src/design-system/components/record-ledger/`.
  `useRecordSlot(model, verbs, label, testIdPrefix)` → `{ title, actions, view }`.
- Inbound adapters: `inboundCartonModel` (a carton), `inboundDeliveryModel`
  (an incoming purchase), `inboundPastedNumberModel`; the reads
  `useInboundCartonRecord(row, onClose)` and `useInboundDeliveryRecord({ row, lines, onRemoved })`;
  the verbs `useInboundCartonVerbs` / `buildInboundDeliveryVerbs`.
- `RecordItem` is the one item row; the photo tile uploads a product photo.
- Pickup (`pickup-record`) and QC unit (`qc-record`) records are on the same
  view (`src/lib/receiving/pickup/*`, `src/lib/qc/qc-unit-record-model.tsx`,
  `src/components/qc/qc-unit-record.tsx`).

## Step 1 — The inbound search record = the desk record

1. New `SearchReceivingRecord` (replaces `SearchReceivingDossier`), shaped like
   `SearchOrderRecord`: resolve `sel.id` (receiving id) → open it with
   `useInboundCartonRecord` → `useRecordSlot(…, 'inbound-record')` → paint
   `slot.title` / `slot.actions` in `DeskStageRecordHeader` (`onClose={onBack}`)
   and `slot.view` in the `DESK_STAGE_FIXED_CLASS @container` body.
   - `useCartonRecord` needs a `ReceivingLineRow`. Give it a real one (the
     carton's first line from the existing receiving read / `receiving-lines?receiving_id=`),
     or widen `useCartonRecord` to take a receiving id — pick the one with fewer
     reads; do not fabricate a row object.
   - A PO still on the way (no carton yet) should open `inboundDeliveryModel`
     through `useInboundDeliveryRecord`, like `/incoming` does; a pasted number
     with nothing on file opens `inboundPastedNumberModel`.
   - Keep the search paint signals: `useSearchPrimaryPaintOptional().onPrimaryPainted()`
     and `setGlobalSearchPending` / `clearGlobalSearchPending`, exactly as
     `SearchOrderRecord` does.
   - Keep what the old dossier gave that the record lacks ONLY if it is real
     evidence, placed per the record law (aside = evidence): the linked outbound
     order (`searchReceivingLinkedOrderQuery`) as a movement/party fact or alert;
     find events as the Timeline panel verb (already on the carton verbs).
2. Phone: if `useFindDensity() === 'compact'` needs a compact face (orders keep
   `SearchOrderDossier` for the phone), decide by evidence: prefer the same
   `RecordView` (it stacks on phones since 2026-09-30); only keep a compact face
   if the record is unusable at 390px, and then it must read the same model.
3. `SearchDossier` routes `receiving` to the new record.
4. Delete `SearchReceivingDossier.tsx` and every piece left importer-free:
   the carton parts of `search-dossier-model.ts` (`cartonDossierLines`,
   `cartonDossierFindings`, …), `presentCartonFindEvents` if unused,
   `cartonHeaderIdentity` if only search used it. Keep `SearchEntityRecord`
   while `SearchUnitDossier` / `SearchGenericDossier` / `ToteRecord` still use it.

Acceptance: `/search?sel=receiving:53321` (PO 14-15201-32492, 7 photos) and a
docked carton, and `/search?sel=receiving:<carton of line 32610>` (on the way,
"Arrives Thu, Oct 1") render the same title, status pill, band, items, serials,
staff notes, aside and header verbs as the same record on `/incoming`
(compare `inbound-record-*` test ids and screenshots side by side). Photos door
opens full-res. Nothing imports the deleted files (`npx knip --include files`).

## Step 2 — Results list and inline details read one way

The owner wants the search results and the desks' inline data-table details to
be one display method: the list is a list of records, and opening a hit shows
the record inline the way a desk does (the record plane, In place / Split),
not a separate dossier page.

1. Read how an inbound desk mounts its list + record plane
   (`IncomingDeliveriesLedger.tsx`: `useRecordSlot` + `DeskRecordPlane`) and how
   `/search` hosts `?sel=` today (`SearchDetailWorkspace.tsx`,
   `SearchFindSurface.tsx`, `SearchResultsSurface.tsx` → `DataTable` via
   `useSearchHitsSpreadsheet`).
2. Make a selected hit open in the same record plane (In place / Split switch,
   J/K to walk hits, Esc closes) instead of replacing the page with a dossier —
   for orders (`OrderRecordView`) and receiving (Step 1's record). Units open
   the QC unit record (`useQcUnitRecord`, `qc-record`) if the unit is in QC,
   else keep `SearchUnitDossier` for now.
3. Result rows: the inbound hit row should carry the same identity as the desk
   card (`# ref · platform · date`, status word) so the row and the opened
   record read the same number. Reuse the desk card face if one exists for the
   entity (`ReceivingCartonCard`, the incoming delivery card) rather than a
   search-only face.

Acceptance: from `/search?q=<PO>`, clicking a receiving hit opens the record
inline beside the list; J/K walk hits; the header number equals the row's
number; `/search?sel=` deep links still open directly. Throughput check:
scan/paste → record open time before/after (`src/lib/observability/tier1-paint-order.ts`
marks the search paint — keep its route list true).

## Open items from the 2026-09-29/30 session (not this handoff's work, but true)

- 15 serial units still sit at `LABELED` (QC Pass / Test again returns 409 on
  them): legacy 1820, 1821, 2046, 2120, 2200, 2456, 2463, 2464, 2476; test
  fixtures 2819–2824. New receiving units now mint at `RECEIVED`. Owner call:
  migrate or leave.
- `pnpm verify` reds owned by other sessions: route-permission drift
  (`/api/cron/tasks/repair-sync`), `header-page-switcher.test.ts`,
  `sidebar-navigation.test.ts`, `walk-in/history-modes.test.ts`, and the Zoho-id
  spread rule flagging `usePackerLogs.ts`, `packer-logs-week.ts`,
  `shipment-record-types.ts`.
- Test data created: pickups 3309–3311 (`LCPU-QA-TEST-093026*`), QA unit 2843
  (`CF-QC-SMOKE-0930`, Zendesk #10092).
