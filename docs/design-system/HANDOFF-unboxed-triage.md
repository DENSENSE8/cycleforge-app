# Handoff prompt — Inbound › Unboxed: fast triage pass

Paste everything below the line into a fresh session.

---

You are continuing CycleForge's **Inbound › Deliveries › Unboxed** view (`/incoming?lane=docked`,
nav view `incoming.docked`), the unboxed-cartons list on the shared triage face. Goal: an operator
narrows to the one carton that needs them and acts on it without opening anything.

Worktree: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
- Read `AGENTS.md` first. Dev origin `http://localhost:3050` ONLY (lane unit `cycleforge-lane@prod`).
  A `503`/empty response is usually another session's mid-edit (missing module) — read
  `journalctl --user -u cycleforge-lane@prod -n 50`, wait, retry; never start a second server.
- The tree is shared with live sessions: re-read before every edit, never revert what you did not
  write, never commit without asking, report red in other people's files (`src/lib/auth/pin.ts:159`
  is foreign and red today).
- Probes: Playwright against `:3050` with `tests/.auth/admin.json`; wait for the `limit=3000`
  response before reading counts (the first read is 150 lines). Probes that write must
  `page.route`-intercept the write. Delete throwaway scripts from the worktree root.

## What exists (landed 2026-09-28 — read the code, don't redesign it)

| Piece | Where |
|---|---|
| View declaration (facts, next-step vocabulary, chip param) | `src/lib/triage/views/incoming-docked.ts` |
| Host: Find, Kind, pills, sort, record plane | `src/components/receiving/history/DockedReceiptsLedger.tsx` |
| Card model (identity, platform, vendor, ticket chip, facts, next) | `src/components/receiving/history/cards/carton-card-model.ts`, `CartonCard.tsx` |
| Line meaning: `dockedFlags` (Claim · Short · Unfound), `dockedRecordFace`, `dockedNextStep`, `dockedIntakeKind` | `src/lib/receiving/docked-record-state.ts` (+ `.test.ts`) |
| Floor (industrial) row — same face + next step | `src/components/receiving/history/DockedReceivingRecord.tsx` |
| Data | `GET /api/receiving-lines?view=activity` → `src/lib/receiving/lines/build-sql.ts`; membership = received AND an unbox / open stamp; `claim_ticket` from `sql-receiving-ticket.ts` (a ticket FILED on the line / carton, not a shipment mention) |
| URL | `?dflag=` pills (multi) · `?dkind=` sidebar Kind · `?find=` · `?colsort=` · `?dateFrom/To=` · `?staff=`; all kept by saved views (`SAVED_VIEW_PARAM_KEYS.receiving_history`) |
| Shared paint | `record-fact.tsx` (`received` = received/expected, `money` with `text: null` = struck `$—`), `record-state-glyph.ts` |

Face today: rail + icon = the carton's most urgent line (Exception › Claim amber › Short amber ›
Unfound blue › green Unboxed). Line 1 = bare id · platform dot · vendor · claim ticket # · note ·
activity date. A line = received/expected · condition · SKU · bin · price. Corner = Resolve ·
Claim · Print label (verbs `carton-record-verbs.tsx` runs), else nothing. Counts are browser-side
over the loaded rows (owner's choice); if history passes the 3,000-line window, move the list AND
the counts server-side together — never one without the other.

Live numbers (2026-09-28): 2,371 lines · pills Claim 306 · Short 128 · Unfound 259.

Ledger: `docs/design-system/RECORD-CARD-MIGRATION.md` → "Triage face" rows 219–224.
Rulings: `docs/design-system/HANDOFF-triage-views.md` → "Owner rulings in force".

## Owner rulings for this pass (2026-09-28)

1. **Unfound is red and the most urgent.** An unfound carton is stock nobody can sell or pay for
   until it is identified. It wears the `danger` tone, sorts to the top of every band, and outranks
   Claim / Short in `dockedRecordFace` (keep Exception equal-or-above — ask the owner which wins).
   Industry check (done, cite): ShipBob puts unidentified inbound on **On Hold / URO** (Unidentified
   Receiving Order) until resolved — developer.shipbob.com/guides/receiving; Odoo routes unknown or
   failed receipts to a quality alert / vendor return. The WMS norm is: quarantine + an
   investigation ticket to identify the sender, then match to a PO or return it.
2. **Ids are copy-admin-link chips, not copy-number chips.** The order / PO number and the claim
   ticket on line 1 each copy the **admin URL** (so the operator pastes it into their own browser),
   with the ↗ open beside it. Reuse, don't fork:
   - Outbound's `OrderAdminLinkAction` (`src/components/outbound/orders/order-link-editors.tsx`)
     + `OrderIdChip` (`src/components/ui/CopyChip.tsx`) — the reference behaviour.
   - Tickets: `zendeskTicketUrl` (`src/lib/zendesk-ticket-url.ts`).
   - Zoho PO: the admin URL is hand-built in THREE places today — `ZohoSplitPane.tsx:17-22`,
     `useReceivingLineCore.ts:585-588`, `api/admin/po-gmail/create-zoho-draft/[id]/route.ts:52`.
     Consolidate into one reader (`src/lib/zoho/po-admin-url.ts`: id → `#/purchaseorders/<id>`,
     number → `?search_text=`), migrate all three callers, then use it on the card.
   - Marketplace orders (eBay / Amazon source_order_id): `orderAdminUrl` (`src/utils/order-platform.ts`).
   - Decide with the owner: does a click copy the URL and ⌘/Ctrl-click open it, or is copy a
     separate chip action? Match whatever outbound does so the hand learns one gesture.
3. **Unfound and claim are two different things — every ticket says which (owner 2026-09-28).**
   See "Unfound vs claim — the split" below; it is the first build item.

## Unfound vs claim — the split (build this first)

**The rule.** A ticket filed from a carton always carries a **reason**, and the reason decides
whether it is an *investigation* (we don't know what this is) or a *claim* (someone owes us).

| Family | What it means | Resolved by | Reason codes (`src/lib/receiving/exception-codes.ts`) | Card |
|---|---|---|---|---|
| **Unfound** — investigation | We have the box, not its identity: no PO, no sales order, unknown carrier | Pairing it to a PO / order (the `resolve` verb), or returning it | `NO_PO`, `RETURN_NO_ORDER`, `CARRIER_MISMATCH` | red **Unfound**; ticket chip "Investigating #10066"; corner → Resolve |
| **Claim** — money owed by the vendor | The PO is known and the goods are wrong | Vendor refund / replacement | `SHORT`, `OVER`, `DAMAGED`, `WRONG_ITEM`, `DEFECTIVE`, `INCOMPLETE` | amber **Claim**; chip "Damaged #10066"; corner → nothing while the ticket is open |
| **Claim** — money owed by the carrier | The goods never arrived or arrived empty | Carrier claim | `LOST_IN_TRANSIT`, `EMPTY_BOX`, `MISDELIVERED`, `STOLEN` (written off, not received — `NO_OPEN_LOSS_EXCEPTION_PREDICATE`) | amber **Claim**; chip "Empty box #…" |

A carton can be both (unfound AND, once paired, damaged): the face is the more urgent (Unfound),
both chips show.

**What exists (verified 2026-09-28).**
- The vocabulary and the writer exist: `RECEIVING_EXCEPTION_CODES` + `RECEIVING_EXCEPTION_META`
  (labels, descriptions), `receiving_exceptions` (`exception_code`, `reason`, `zendesk_ticket`,
  `status` OPEN / resolved, `resolved_at`), `recordReceivingException` / resolve in
  `src/lib/receiving/exceptions.ts`. Guards `isLossExceptionCode` / `isQaFailExceptionCode` keep
  each path to its slice — add an `isInvestigationCode` / `isClaimCode` pair the same way.
- The claim wizard (`components/receiving/workspace/ReceivingClaimPanel.tsx`, `claim/…`,
  `useReceivingClaimController.ts`) files or links a Zendesk ticket with **no reason at all**
  (`ClaimModalMode = 'create' | 'link'`). Its tickets land in `ticket_links` (438 carton / line
  links, all `anchor`); `receiving_exceptions` holds only 108 `RETURN_NO_ORDER` rows, none tied to
  a claim ticket.
- The Unboxed card reads a claim as "any anchored ticket" (`claim_ticket`), which today also
  counts the investigation tickets on 94 unfound cartons.

**Build.**
1. **Reason first in the wizard.** Before Find / Compose, one required choice grouped as the table
   (Investigation · Vendor claim · Carrier claim), preselected from the carton: unfound → `NO_PO`,
   a return with no order → `RETURN_NO_ORDER`, a short line → `SHORT`, a QC fail → its QA code.
   The chosen code seeds the ticket subject / template (`useClaimTemplate`), so Zendesk shows it too.
2. **One writer.** Filing (create or link) records a `receiving_exceptions` row — code, the line /
   carton, `zendesk_ticket` — in the same request that links the ticket; resolving the carton
   (pairing, write-off) closes it (`resolved_at`). No second table, no free-text reason.
3. **The list reads the row, not the bare ticket.** In `view=activity`, select the carton's open
   exception (code + ticket) beside `claim_ticket`; mirror the SQL in
   `legacy-route-sql.fixture.ts`. `dockedFlags`: **UNFOUND** stays the identity fact (no PO) with
   or without a ticket; **CLAIM** = an open exception whose code is a claim code. The ticket chip
   reads `<code label> #<ticket>` (`RECEIVING_EXCEPTION_META[code].label`).
4. **Legacy tickets (306 cartons, no reason).** Ask the owner: show them as "Ticket #…" (neutral,
   not counted as Claim) until someone picks a reason from the chip, or backfill — unfound cartons →
   `NO_PO`, short lines → `SHORT`, the rest left for a person. Never guess a claim code silently.
5. **Pills.** Unfound (red) · Claim (amber) · Short (amber) stay; add a **Reason** row to the
   sidebar (`?dreason=`, the codes present) only if the owner wants to cut by Damaged vs Wrong item.
6. **Next step.** Unfound → Resolve (pair); an open claim → nothing (waits on the ticket); a short
   or failed line with no claim → Claim — `dockedNextStep` already does this; re-test after the flag
   change.
7. Tests (behaviour): code → family; an unfound carton with an investigation ticket is Unfound, not
   Claim; a paired carton with a DAMAGED claim is Claim; a legacy reasonless ticket is neither;
   resolving closes the exception and drops the pill.

## Quality-of-life backlog, highest value first (ask the owner which to take; one per commit)

1. **Unfound vs claim split** (section above) — reasoned tickets, one writer, card reads the reason.
2. **Unfound red + first** (ruling 1).
3. **Copy-admin-link ids** (ruling 2) — order / PO and ticket.
4. **Short quantity in words on the pill's cut.** Under `?dflag=SHORT`, the line shows "2 short"
   beside `0/2`, and the carton's alert popover lists short lines (the `alert` slot already exists).
5. **Claim value.** Sum `price × (expected − received)` per carton and show it next to the ticket
   ("Short #10066 · $74.00") — what the claim is worth. Missing price stays `$—`, never a guess.
6. **Claim age.** Ticket open date → "3d" on the chip, amber past 7 days, red past 14. Use the
   exception's `created_at` (item 1 writes it); `support_tickets.status_cache` is mostly null today —
   don't promise open / closed from Zendesk until it syncs.
7. **Bulk verbs at N** (Law 5 bar, `TriageSelectBar`): Print labels for the checked cartons, open a
   claim per checked short carton, copy all admin links (newline list). Scope single-carton verbs
   (`RecordActionVerb.scope`).
8. **Keyboard.** `C` copy admin link, `O` open it, `T` open the ticket — on the focused card; keep
   off `x f j k [ ]` and the ⌥1–⌥3 pill chords. Teach them via `HotkeyTooltip`.
9. **Find hits the ticket #** — `receivingLineMatchesQuery` should match `claim_ticket`
   (`#10066` or `10066`), and an exact ticket opens its carton (`cartonExactFind`).
10. **Put away as the next step** once a carton verb exists — the API is there
    (`/api/receiving/lines/[id]/putaway`) but no carton verb calls it and no unboxed carton has a bin
    yet (0 of 1,839), so the corner would say "Put away" on everything today. Build the verb first,
    then add it to `dockedNextStep` after Print label.
11. **"At the dock" view** between On the way and Unboxed — door-scanned, not unboxed. The server
    predicate exists (`view=scanned`); it needs a nav view id, a `TriageViewDecl`, and the same
    card. Name it with the owner ("At the dock" / "Arrived" — never "Unbox", the station's name).
12. **Photo count** on line 1 when the carton has photos (`photo_count` is on the row).

## Per item, the loop

1. Pattern note in the ledger row + owner sign-off when the item changes vocabulary or colour.
2. Pure logic in `docked-record-state.ts` (or a reader in `lib/`) with a behaviour test in
   `docked-record-state.test.ts` — boundaries, precedence, the empty case. Never pin source text.
3. Card / host wiring; shared painters change for every family (check outbound still reads right).
4. `node --import tsx --import ./scripts/register-server-only-shim.cjs --test
   src/lib/receiving/docked-record-state.test.ts src/lib/nav/context/resolve.test.ts
   src/lib/receiving/lines/build-sql.test.ts src/lib/triage/views/triage-views.test.ts`
   — `build-sql.test.ts` compares against `legacy-route-sql.fixture.ts` byte-for-byte: an intended
   SQL change is mirrored in the fixture in the same edit.
5. Probe at `:3050`: the pill cut + reload keeps it, Esc clears, the visible change on 1500 / 1100 /
   760, Floor still the industrial ledger.
6. `pnpm verify:fast`; report only red you own.
7. Ledger row in `RECORD-CARD-MIGRATION.md` (landed · files · proof), ruling in
   `HANDOFF-triage-views.md` if the owner ruled.

## Never
- A second state vocabulary: pills (`?dflag=`) are the only attention cut; the sidebar owns Kind.
- QC anywhere on this view — quality control is its own station.
- A guessed number: missing price, missing expected, missing ticket date all read as missing.
- `/m/*` changes unasked.
