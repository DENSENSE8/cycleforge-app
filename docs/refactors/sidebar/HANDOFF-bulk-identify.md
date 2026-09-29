# HANDOFF — Bulk identify: paste 150 numbers, triage every one by status

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-29.
Predecessor: `HANDOFF-inbound-triage.md` (F1–F4 built; read its coordination
note at the end).

---

You are building **bulk identification** on Inbound (`/incoming`): the operator
pastes ~150 order / tracking numbers, sees a filtering state while they are
checked, then triages the list number by number — the list on the left, the
number's record on the right — filtered by the status each number resolved to.
The list and a table filter already exist. Your job is to raise them to 150,
give paste its own control, and make the status axis complete and triageable.

## 0. Before anything

1. Read `AGENTS.md`. Probe only `http://localhost:3050`; lane unit
   `cycleforge-lane@prod`. When `:3050` returns compile-error HTML, the module
   graph is broken by another session's half-written files. Check
   `journalctl --user -u cycleforge-lane@prod` and wait; do not fix their files.
2. `pnpm verify:fast`. Reds in `src/lib/assistant/**`, `src/components/session/**`,
   `src/components/boot/**`, `NavRecentsList.tsx` belong to other live sessions:
   report them, don't touch them.
3. Ownership. **Sidebar session** owns `src/components/sidebar/contextual/*`
   EXCEPT `NavBulkList.tsx`, `NavBulkPopout.tsx` and the bulk-paste bits of
   `NavFind.tsx` (ours). They are actively editing `NavFind.tsx` right now (it
   now has `PasteKey`, `NavLocatePills`, `interceptPaste`): re-read it before
   every edit and touch only bulk lines. **Orders session** owns
   `src/components/outbound/**`, `src/components/tables/**`. Your lane:
   `src/components/receiving/**`, `src/components/station/ReceivingLinesTable.tsx`,
   `src/lib/receiving/**`, `src/app/api/receiving-lines/**`, plus the three
   bulk files above.

## What exists — verified 2026-09-29

| Piece | Where | State |
|---|---|---|
| Paste → list | `NavFind.tsx` `BulkDeskStoreFind` / `onBulkPaste` → `useNavBulkList.paste` (`NavBulkList.tsx`) | 2+ numbers become the list; URL `?ref_in=` (operator strings, comma-joined) |
| Paste control | `NavFind.tsx` `PasteKey` ("Paste to search or locate a list"), sidebar session's | Exists, generic: it routes to search OR locate, not to bulk identify |
| Cap | `CHECK_ZOHO_RECEIVED_MAX_INPUTS = 100` (`tracking-paste.ts`); `parseRefList` truncates + toasts | **150 pastes lose 50.** |
| Live Zoho cap | `CHECK_ZOHO_RECEIVED_MAX_ZOHO_LOOKUPS = 50` (`check-zoho-received.ts`) | Numbers past it return `reason: 'zoho_cap'` (undetermined) |
| Verdict | `POST /api/receiving-lines/incoming/check-zoho-received` → `useInboundCheck` → `reconcileCheck` (`reconcile.ts`) | One engine, with the warehouse-only fallback from the `view=reconcile` rows |
| Statuses | `RECON_STATUSES = ['received','not_received']`; `ReconEntry.exception` badge `{ reason, inView }`; `detail` string | Two buckets plus a badge. `detail` carries the finer reason as free text |
| List UI | `NavBulkPopout.tsx`: Popover right of the sidebar, rows = glyph · number · detail · PO · badge; sort Pasted / Order ID / Status; ↑↓ ↵ E C ⌫ | ↵ "pinpoints" by writing the number into Find, which narrows the table |
| Table filter | `?recon=` → `filterRowsByRecon` in `ReceivingLinesTable.tsx`; chips `IncomingStatusChips.tsx` top-left of the ledger (⌥1–⌥2) | Works on the pasted rows (`view=reconcile`, one page ≤ 500 lines) |
| Record | `DeskRecordPlane` via `IncomingDeliveriesLedger`: In place / Split (list left, record right) | Split already is "list left, details right" |
| Exceptions | `/incoming?lane=exceptions`, reason per row (`incoming-exceptions.ts`) | The badge links there |

Raw Check facts per number (`CheckZohoReceivedRow`): `reason` ∈ matched ·
no_match · ambiguous · error · zoho_cap; `verdict` ∈ settled · erp_ahead ·
warehouse_ahead · open · unknown; `local` = { known, delivered, scanned,
unboxed, watch }; `status` (Zoho PO status); `po_number`, `vendor_name`.

## The idea, adjudicated

**A dedicated bulk button in the search field: yes, but as a mode of Find,
not a second field.** Paste already turns 2+ numbers into a list, so the
button is for *discoverability* and *explicitness*: `[⧉ Bulk]` right of the
Find well opens an empty paste box (a textarea in the popout's place:
"Paste up to 150 order or tracking numbers"), and Enter / Check commits it. It
must NOT fork a second verdict path or a second URL param. It writes
`?ref_in=` through `useNavBulkList.paste`. Coordinate with the sidebar
session: `PasteKey` is theirs. Either pass a `bulk` target into it or add the
button inside `BulkDeskStoreFind` only (ours). Pick the second unless they
agree.

**"Search list on the left, details on the right": use what exists. The left
list is the TABLE, not the popout.** A 26rem popover cannot hold 150 triageable
rows plus a record. The pasted numbers become the ledger's rows (they already
do via `view=reconcile`). Split view (`DeskRecordPlane`) is list-left /
record-right. The missing piece is that the ledger shows *lines*, not *pasted
numbers*: a number with no line (No match anywhere) has no row, so it vanishes
from the table. Fix that (Feature 2). The popout stays as the compact
number-by-number checker.

**Filter by status from the left contextual sidebar:** the operator ruled
2026-09-27 that list statuses sit **top-left above the table**
(`IncomingStatusChips`), not in the sidebar, and `NavBulkStatus` was deleted
for that reason. Do not re-add sidebar status rows. If the operator asks for
it again, ask them first: it reverses that ruling.

## Feature 1 — 150, with a filtering state

- Raise the paste cap to 150 **for the Inbound list only**. Add
  `RECON_MAX_INPUTS = 150` in `reconcile.ts` and use it in `parseRefList`.
  The Check endpoint's own cap (`CHECK_ZOHO_RECEIVED_MAX_INPUTS`) is shared
  with the Unbox Check. Either raise it to 150 (check `check-zoho-received.test.ts`
  and the Unbox caller) or have `useInboundCheck` send two batches and merge
  (one query key, `Promise.all`). Prefer raising the cap if the route's cost is
  mirror-first (it is: only `needZoho` numbers hit live Zoho).
- The live-Zoho cap (50) means with 150 numbers up to 100 can come back
  `zoho_cap`. Those must not read as a verdict. Show them as **"Checking Zoho…"**
  and fetch the remainder in follow-up batches of 50 (the same query key, an
  incremental `useQueries`, or a server loop). The operator must never
  see "Not checked · Zoho limit" for a list they pasted in one go.
- Filtering state: after paste, before the Check lands. Chips show `…`
  (already), the ledger shows skeleton cards (already when `loading`), and add a
  progress line in the card anchor: `Checking 150 numbers · 63 answered`. It
  must be honest (entries whose `detail !== 'Checking…'`).
- URL length: 150 × ~20 chars ≈ 3 KB in `?ref_in=`. Fine for Next/Chrome.
  Measure it anyway and note the result. The server GET `view=reconcile`
  carries it too; `RECONCILE_ROW_LIMIT = 500` lines still applies (cap note exists).

Acceptance: paste 150 real numbers → progress line counts up → every number
ends in a real status. None stuck on zoho_cap, none dropped by truncation.

## Feature 2 — the pasted NUMBER is the row

- The triage unit is the pasted number, not the receiving line. In the
  reconcile ledger, group rows by **pasted ref** (`rowRefKeys` ∩
  `selection.keys`, first matching key in paste order), not by PO. A number
  with zero lines gets a **placeholder card**: the number, its Check detail,
  its badge, and "Nothing on file carries this number". Build it client-side
  from `ReconEntry`, with no new API.
- Card corner = the number's status (Received / Not received) + its reason
  (`detail`), not the line's carrier state. The carrier state stays in the
  card's facts row.
- Split view: list left = these cards; record right = the purchase record
  (existing `IncomingDeliveryEvidence`) or, for a placeholder, the Check facts
  (`reason`, `verdict`, `local.*`, Zoho status, PO) as an `EvidenceNotice`
  block with next actions (Copy number · Search Zoho · Remove from list).
- J / K walks numbers in the chosen order. Publish that order to
  `usePublishRecordCursor` the way F4 did for sections.

Acceptance: 150 pasted → 150 cards (placeholders included), J walks all
150, and each opens a record on the right in Split.

## Feature 3 — the status axis, triageable

Make the reason a first-class, filterable status, derived from the Check, not
a second engine.

- Add `ReconEntry.reasonCode` (enum) next to `detail`, set in
  `reconOfCheckRow` / `reconOfWarehouseRows`: `unboxed`, `scanned`,
  `received_here` (→ Received) · `delivered_not_scanned`, `in_transit`,
  `open_po`, `warehouse_owed` (→ Not received) · `erp_ahead`, `no_match`,
  `ambiguous`, `lookup_failed` (→ Not received + badge). Keep `detail` as its
  label (one map, `RECON_REASON_LABELS`). Table-driven tests in
  `reconcile.test.ts`.
- Chips: keep the two status chips (⌥1–⌥2, `?recon=`). Add a second chip row
  that appears **only when a status chip is pressed**: its reasons with
  counts, writing `?recon_reason=` (declare it in `INCOMING_ROUTE_PARAMS`).
  Example: Not received → `Delivered · not scanned 12 · In transit 40 · Zoho
  received · never scanned 5 · No match 9`. Received → `Unboxed · Scanned at
  dock`.
- `filterRowsByRecon` gains the reason filter, and the popout follows both
  params, as it already does for `recon`.
- Triage verbs on the focused number (keys, legend like the popout): ↵ open ·
  C copy · X remove from list · **R recheck** (invalidates that key only) ·
  **Shift+C copy all shown** (the operator's "send the missing ones back to the
  vendor" flow). Bulk: the gutter check-set exists; add "Copy numbers" and
  "Remove from list" when 2+ are checked (receiving-owned bar; do not import the
  orders session's select bar, copy the pattern).

Acceptance: paste 150 → Not received → Delivered · not scanned shows exactly
those numbers in the table and the popout; Shift+C copies them one per line;
R on one number re-asks the Check for it alone.

## Do not

- No second verdict engine, no second URL param for the list (`ref_in`
  only), no sidebar status rows (operator ruling 2026-09-27).
- Do not edit the sidebar or orders sessions' files beyond the bulk lines named
  above. Leave notes in this doc instead.
- Do not raise `RECONCILE_ROW_LIMIT` blind: 150 POs can exceed 500 lines;
  the cap note + disabled chips are the safety.

## Verify each feature

`npx tsc --noEmit -p .` (filter out other sessions' paths and say so),
touched tests via `node --import tsx --import ./scripts/register-server-only-shim.cjs --test <files>`,
`pnpm verify:fast`, and a Playwright smoke on `:3050` (sign in as in
`tests/shot.mjs`; `tests/.auth/admin.json` is a valid session). For 150 real
numbers, pull them from `GET /api/receiving-lines?view=activity&limit=400`
(PO numbers, source order ids and tracking) mixed with `view=incoming`.
Screenshot each surface; delete throwaway scripts after.

## Built — 2026-09-29 (status and notes for other sessions)

Operator direction during the build: **our tables are the source of truth, not
Zoho.** So there are no live-Zoho follow-up rounds. A number the Check had no
ERP answer for (`no_match`, or `zoho_cap` past the 50-per-call cap) is decided
by our own receiving lines and local facts (`tablesDecide` in `reconcile.ts`).
`pending` now only means "the Check has not answered yet".

- **Cap 150**: `CHECK_ZOHO_RECEIVED_MAX_INPUTS = 150` (shared: Check, `?ref_in=`,
  `?tracking_in=`, the Unbox panel text), `NAV_LOCATE_MAX_REFS = 150`.
  `?ref_in=` for 150 numbers ≈ 2.9KB of URL (measured).
- **Pre-existing bugs fixed on the way**: `ref_in` / `tracking_in` were declared
  `paramText` (max 200 chars), so hygiene stripped any list past ~10 numbers.
  They now use their own canonicalizing parsers (`receiving-routes.ts`).
  `GET /api/nav/context` capped `path` at 2048, which broke the sidebar for long
  lists; now 8192 (`src/lib/nav/context/schema.ts`, **sidebar session's file**).
- **Reasons**: `ReconEntry.reasonCode` + `RECON_REASONS` / `RECON_REASON_LABELS`
  / `RECON_REASON_STATUS`, `?recon_reason=` (declared in `INCOMING_ROUTE_PARAMS`),
  `reconReasonCounts`, `filterEntriesByRecon`, `filterRowsByRecon(…, reason)`.
  The `no_match` label stays "No match anywhere" because
  `src/lib/assistant/tools/reconcile-refs-tool.ts` matches that string
  (**assistant session**: its `'Not checked · Zoho limit'` key is now dead).
- **Locate schema (sidebar session)**: `NavSearch.locate.facetParam` (optional)
  and `NavLocateEntry.facet {id,label}` (optional). The inbound locator sets the
  facet to the reason. The popout filters by facet when `?recon_reason=` is set.
  `useNavLocate`'s `{ refs }` input is no longer used by NavBulkList, which has
  its own list query (`useLocatedList`) that re-asks only unanswered numbers
  after an edit.
- **Paste key**: `NavBulkPasteKey` (in `NavBulkList.tsx`), mounted via
  `BulkKey pasteBox` in `LocatedFind` (`NavFind.tsx`, two bulk lines).
  `BulkDeskStoreFind` no longer exists; `LocatedFind` replaced it.
- **Popout**: R recheck, ⇧C copy shown, "N checking" in the header; legend updated.
- **Ledger** (`PastedNumbersLedger`, `PastedNumberCard`, `PastedNumberEvidence`,
  `PastedNumbersBanner`, `src/lib/receiving/pasted-numbers.ts`): one card per
  pasted number, placeholders, reason chip row, progress line, J/K, keys C · ⇧C ·
  R · ⌫ (remove is ⌫, not X: X is TriageCardList's check key), bulk bar
  "Copy numbers" / "Remove from list".
- **Edited lists reuse answers**: `useInboundCheck` asks only the numbers no
  recent list (under 5 min) has answered, and paints the rest at once. The
  lines come from a cached superset list that isn't capped. This covers a removal from the popout, the
  ledger or Back; `carry()` is gone. Retry (`refetch`) asks the whole list;
  R asks one number. Measured: popout ⌫ on a 150 list → 0 Check requests.
- **Known limits**: pressing J faster than ~250 ms can skip a card (cursor
  rides `?openLine=` via `router.replace`, and each step mounts a full record).
  The popout (`/api/nav/locate`) and the ledger (`check-zoho-received`) each run
  their own Check for the same paste; the tables-first verdict endpoint is the
  intended fix (it makes both reads cheap DB reads).
- **Unboxed (`/incoming?lane=docked`) takes a pasted list too** (operator
  2026-09-29): same paste key / `B` / popout (inbound locator). The list
  narrows Unboxed server-side: `view=activity` ANDs `lineRefMatchSql` over
  `?ref_in=`, and its lineless placeholders match the pasted keys while keeping
  the unbox-touch gate. So only unboxed things come back and the popout
  says where the rest are. Only the Unboxed host reads it
  (`useReceivingModeContext` `isUnboxedLane`); the Unbox History tab and
  standalone History ignore `ref_in`. A lane switch drops the paste (with
  `recon` / `recon_reason`) in both directions. The Claim / Short / Unfound pills
  on Unboxed are the Exceptions hub's lane-wide counts and are not narrowed by
  the paste (hub session's design).
