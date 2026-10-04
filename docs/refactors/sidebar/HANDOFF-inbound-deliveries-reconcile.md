# HANDOFF — Inbound Deliveries: paste a list, see what arrived in one glance

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.
Related:
- `HANDOFF-inbound-triage.md`: status chips, check fixes, Exceptions view (what shipped earlier).
- `HANDOFF-paste-a-list.md`: the original paste-a-list brief (identify / ⌘K).
- `HANDOFF-search-and-triage.md` §1: the one search field and `GET /api/nav/locate`.
- `HANDOFF-sidebar-navigation-predictability.md`: sidebar URL-as-state rules. Obey P1 to P4.
- `AGENTS.md`: probe only `:3050`, run `pnpm verify:fast` before calling it done.

---

## The job, in the operator's words

On **Inbound → Unbox → Deliveries** (`/incoming`), I paste a bulk list of tracking numbers
and order / PO numbers from a vendor or my purchase history. Then I filter that list to
see, insanely easily and fast:
- **Received**: it arrived. It was unboxed or scanned at the dock.
- **Not received**: I bought it and it never came. The seller never shipped it, or it's
  stuck or lost.
- **Already unboxed**, separately from merely scanned at the dock.

This is triage for money: verifying that everything we paid for actually arrived, and
catching the ones the seller never sent.

## 0. What already exists (verify, don't rebuild)

| Piece | Where | State |
|---|---|---|
| Paste → list in the URL | `NavFind` (sidebar field) → `useNavBulkList` (`src/components/sidebar/contextual/NavBulkList.tsx`) → `?ref_in=a,b,c` (`REF_IN_PARAM`) | Works. A paste of 2+ numbers opens the list by itself. |
| Where each number lives | `GET /api/nav/locate?locator=inbound&refs=…`: `src/lib/nav/locate/inbound.ts` wraps `reconcileCheck` in `src/lib/receiving/reconcile.ts` | Works. Buckets `received`, `not_received`, `exceptions`. |
| The verdict rules | `reconOfCheckRow` / `reconOfWarehouseRows` (reconcile.ts) | Physical-first: **unboxed**, or **scanned at dock**, counts as received. Everything else is owed, with a physical reason (`In transit`, `Delivered · not scanned`, `Ordered · no tracking`, `No match anywhere`, `Several POs match`, `Lookup failed`). Zoho's PO status never decides or labels a number (2026-10-03, `docs/refactors/receiving/DELETE-LIST.md`). |
| The list popout | `NavBulkPopout.tsx`: rows (bucket chip · ref · reason · PO), filter chips (All · each bucket · Not found), sort (Pasted / Order ID / Status), E edit · C copy · ⌫ remove · ↵ pinpoint | Works; renders from the locate answer. |
| Ledger filter | `?recon=received\|not_received\|exceptions` → `filterRowsByRecon` in the Deliveries ledger (`ReceivingLinesTable`, `IncomingStatusChips`, `useInboundCheck`) | Works for received / not_received. `exceptions` is allowed by route hygiene but the ledger ignores it. |
| Laws | `pinned.json` → `NavBulkList`, `NavFind`, `FindField`, `KeyboardKey` | Read them first: `node tools/design-mcp/ds.mjs contract "paste a list reconcile deliveries"`. |

Before designing anything, run it on `:3050` yourself:
1. Open `/incoming` and paste 5 real refs into the sidebar field.
2. Note exactly what is slow, unclear or missing.

That is your baseline.

## 1. The model to reach (first principles)

A pasted number has exactly ONE **arrival state** and at most one **problem**:

| Arrival state (one bucket, ordered by urgency) | Rule (reuse `reconOfCheckRow`, don't fork it) |
|---|---|
| **Never shipped**: bought, and the seller never sent it | Open PO / order with no tracking, or tracking with no carrier movement, older than N days (declare N; start at 5 business days) |
| **In transit** | Carrier movement, not delivered |
| **Delivered · not scanned** | Carrier says delivered and the dock never scanned it. This is a loss risk. |
| **Scanned at dock** | Received, not opened |
| **Unboxed** | Received and opened. Done. |
| **Not found** | Nothing identifies it |

Problems ride as a badge, never as a second bucket: `Several POs match`, `Wrong destination`,
`Stalled`, `Carrier mismatch`, `Lookup failed`. A problem
the Exceptions view shows links there.

Today's buckets are `received` / `not_received`. Split them into the five states above:
- Keep `received` / `not_received` as **group** filters over them.
- Existing `?recon=` links and the ledger's `filterRowsByRecon` must keep working. Either
  alias the old ids onto the groups, or migrate every reader in the same change.

"Never shipped" needs the order or purchase date and the carrier status. Find where
inbound lines keep them (`receiving-lines`, `delivery_state`, the carrier sync) before
adding anything. If a signal truly doesn't exist, stop and say what is missing; never
guess it.

## 2. The display: "insanely easy and fast"

- **One strip of counts** over the list, in urgency order: Never shipped · Delivered, not
  scanned · In transit · Scanned · Unboxed · Not found.
  - One click on a count filters BOTH the popout and the Deliveries ledger (the same
    `?recon=` param). A number's colour means the same thing everywhere.
  - Use `NAV_LOCATE_TONE_VAR` (`nav-locate-tone.ts`); no raw hues.
- **Worst first.** The default sort is urgency, then paste order. The rows that cost money
  lead.
- **A row reads in one line:** state glyph + word, then the ref (mono), vendor, the PO /
  order, and "days since purchase" for owed rows.
  - Hover shows the carrier timeline in a small tooltip.
  - A row is the same height whether it has one fact or all of them.
- **Keyboard-complete:** `B` opens the list, ↑↓ / `j` `k` move, ↵ pinpoints in the ledger,
  `1` to `6` jump to a state filter while the list has focus.
  - Every key is a `KeyboardKey`, shown in the popout's footer.
- **Act on the owed rows** without leaving the list:
  - Copy all "Never shipped" refs (one key), ready to paste to the seller;
  - Open the PO;
  - Mark as "Chasing seller" (only if a status field for it already exists; else list it
    as a follow-up).
- **Width:** the popout opens to the right of the sidebar and may be wide. The operator's
  text outranks the layout (FindField `overflowRight` rule). Never truncate a ref.
- **Big pastes:** the cap is 100 (`NAV_LOCATE_MAX_REFS`). Over the cap, say so in the strip
  ("Showing 100 of 240"), and offer the next page rather than dropping rows silently.

## 3. Speed

- **Measure first:** time `GET /api/nav/locate?locator=inbound&refs=<100 real refs>`. The
  Check calls Zoho live when the mirror misses, which took about 6s when last measured.
- **Paint local facts first:** unboxed, scanned and known are local DB facts, so paint
  those rows immediately and let the Zoho-backed rows fill in. This means either two
  passes, or a streaming / `phase` split like `packerlogs` spine vs. hydrate.
  - Rows still waiting show "Checking…" and never jump in height when they resolve.
- **One source of truth:** the ledger filter and the popout must read the same locate answer
  (one react-query key). Two fetches means two answers.

## 4. Boundaries and coordination

- Only the inbound parts are yours: `src/lib/receiving/reconcile.ts`, `src/lib/nav/locate/inbound.ts`, `NavBulkPopout.tsx` (generic, so keep it locator-agnostic; inbound specifics go in the locate answer, not in the component), and the Deliveries ledger filters.
- Do not edit `CommandBar.tsx` (the search session owns it) or `NavFind.tsx` / `FindField.tsx` search behaviour (a separate job).
- Other sessions are mid-flight in the Outbound files and the auth / pin files. Make edits additive and list every file you touched that isn't yours.
- Laws: update `pinned.json` → `NavBulkList` in the same change as the code.

## 5. Proof

- **Unit tests** (domain, deps-injected, `skill://domain-unit-test`):
  - each arrival state from real-shaped check rows / lines;
  - the "never shipped" age threshold boundary;
  - old `?recon=received|not_received` ids still filter the same rows;
  - urgency sort;
  - cap reporting.
- **Probe on `:3050`** (sign in via `POST /api/auth/signin`, header `x-tenant-slug: usav`,
  body `{staffId, deviceKind:'personal'}`, and save the cookie as the Playwright
  storageState):
  - paste 20 real refs mixing unboxed, dock-scanned, in-transit, delivered-unscanned and
    garbage;
  - every count in the strip equals the rows under it, and equals the ledger rows after
    clicking it;
  - screenshot the strip and popout, and time to first paint and to all rows answered.
- `pnpm verify:fast`: report failures in other sessions' files separately, with
  `git status` proof.

## 6. Shipped 2026-10-03: the paste list replaces the "Unreceived Tracking" sheet

The staff sheet (`1sWC7Qqa2KFstJtKv0ngQRtKn-cnVY45jseWRqd3wQgQ`) is now the pasted ledger
(`/incoming?ref_in=…`), live from our tables, physical-first. "Received" means units
counted. There is no Zoho verdict and no "received but never scanned".

| Sheet column | Where it shows now |
|---|---|
| PO date | Compact `ordered` column and Full line fact: "Sep 23 · 10d" (the age is new) |
| PO# | Full identity: "PO …" beside the pasted number. It is also the follow-up key |
| Vendor | Compact `vendor` column; Full identity row |
| Source | Full identity row: platform account / vendor / source type (`receipt-card-model.sourceLabel`) |
| Tracking | Full line fact `TRK …tail` (full number on hover); "No tracking" when none |
| SKU | Full line fact |
| Item | Compact title (`+N` more lines); Full line title + photo |
| Qty | Compact `units` column "0/3" (counted / bought); Full line fact per line |
| Item total | Full line fact: price × qty |
| Total | Full card's trailing fact (multi-line numbers); `~` marks an unpriced line |
| Status | Verdict chip / rail, in physical words: Unboxed · 0 of 3 received, Ordered · no tracking, In transit |
| Carrier note | Compact `carrier` column and Full line fact: Delivered Oct 2 · signed SANG, ETA Oct 5, Delivery attempted ×2 |
| "Check and resolve" | Next step (Receive / Unbox / Investigate / Attach tracking / Monitor / Resolve), outranked by a follow-up tag |
| Colour tags | Follow-ups (`inbound_followups`): Need claim · Double check · Chasing seller · Acknowledged. Keys 1–4 (0 clears) on the checked numbers or the cursor; bulk bar; the note edits inline |
| (new) | Signer, delivery attempts, carrier ETA, units N of M, age in days, who tagged and when (hover), the sidebar popout's detail shows the carrier word + tag |

Files: `src/lib/receiving/pasted-number-facts.ts` (pure, tested), `inbound-followups*.ts`,
`api/receiving/inbound-followups`, `cards/PastedNumberLine.tsx` (Compact, the default) /
`cards/PastedNumberCard.tsx` (Full), `PastedNumbersBanner.tsx` (Compact | Full, kept in
`cf:incoming-pasted:density`), `src/lib/nav/locate/inbound.ts` (detail = verdict · reason
· carrier word · tag). `TriageRow` gained `nextWidth` for two-word steps.

Open:
- **Mobile:** the paste list does not exist on `/m` yet (SURFACE_LAW). It is the next gap.
- **Carrier freshness:** Vercel production crons write `SYNC_ERROR` ("FEDEX_CLIENT_ID and
  FEDEX_CLIENT_SECRET are required"; UPS the same). The env vars are legacy "Secret" values the
  function reads as empty. Re-add them as encrypted Production vars and redeploy. USPS
  tracking returns 403 until USPS approves an IP Agreement for our MID.
- `TriageCardList`'s "N selected" counts lines, not numbers (2 numbers = "6 selected").
