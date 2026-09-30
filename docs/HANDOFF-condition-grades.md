# HANDOFF — One condition picker, one set of words, everywhere (written 2026-09-29)

Paste the **Prompt** block at the bottom into a fresh session. Dev origin `http://localhost:3050`
only (AGENTS.md §1). The `.env` database is PRODUCTION: prove writes only on `CF-TEST-` fixtures
you create and delete in one transaction with counts. Other sessions edit this tree: re-read
before each edit, touch only your lines, never commit.

## 1. Owner ruling (2026-09-29)

> Condense the condition drop-downs and their meanings. Unbox uses one, Inbound uses a different
> one, and outbound a different selection. One picker, one list, one set of words.

## 2. What exists today (code read 2026-09-29 — re-verify every line before editing)

**The vocabulary is already one list** — `src/lib/conditions.ts`: `CONDITION_GRADES` (7 codes:
BRAND_NEW · LIKE_NEW · REFURBISHED · USED_A · USED_B · USED_C · PARTS, `:3-11`), aliases
(`resolveConditionGrade`, `:18-52`), meanings (`CONDITION_DESCRIPTIONS`, `:139+`). The drift is in
the *faces* and *pickers* built on top of it:

| Where | Picker / list | Words it shows |
|---|---|---|
| **SIX label variants** `conditions.ts:62-69` | `pill` · `table` · `compact` · `label` · `full` · `option` | "Ref" vs "Refurb" vs "Refurbished"; "A" vs "Used - A" vs "Used — A" vs "Used A"; "Parts" vs "For Parts"; "L-new" vs "Like New" |
| **Unbox / receiving** `src/components/receiving/workspace/ConditionPills.tsx` (+ `ReceivingUnitRows.tsx:437,475`, `SerialCard.tsx:204,428`, `BulkQuantityPanel.tsx:107,293`) | its own pill strip, `pill` / `full` | New · L-new · Refurb · A · B · C · Parts |
| **Inbound order composer** `src/components/receiving/incoming/order-composer/InboundOrderLines.tsx:236-250` | hand-rolled `SearchableSelectField` with its OWN option list (a subset) | "Brand new", "Used · Grade A", … |
| **Kiosk local pickup** `src/app/kiosk/v2/KioskLocalPickupIntake.tsx:60` | its OWN `CONDITION_OPTIONS` subset | "Brand new", "Used · Grade A", … |
| **Outbound** `src/components/outbound/orders/outbound-orders-ledger-editors.tsx:73` (`LedgerCondition`, the pinned law `src/design-system/pinned.json:529`), `OrdersQueueTableRow.tsx:217`, `MobileCartSheet.tsx:29`, `BulkConditionDialog.tsx:25` | triage list, `table` (dialog: `full`) | New · L-new · Ref · A · B · C · Parts |
| **Receiving PO** `src/components/receiving/zoho-po-types.ts:8` | `full` | Brand New · Used — A · For Parts |
| **Serial match** `src/components/receiving/workspace/SerialMatchResult.tsx:51-53,200` | `prettyEnum` of the raw code | "Used a" |
| **FBA** `src/lib/fba/fba-conditions.ts:20` (`FnskuConditionPicker`, `FbaQuickAddFnskuModal` native `<select>`) | Amazon's own words mapped to a grade | legitimately external — keep the words, share the picker |

**Server validators repeat the list by hand:** `src/app/api/post-multi-sn/route.ts:16`,
`src/app/api/receiving-lines/route.ts:54`, `src/app/api/zoho/purchase-orders/receive/route.ts:37`.
**A non-canonical code exists in a fixture:** `USED_GOOD`
(`src/lib/receiving/pickup/pickup-card-model.test.ts:17`) — check whether any live data
or source writes it.

**Meanings** (`CONDITION_DESCRIPTIONS`) reach only the Unbox pill tooltips; Inbound, kiosk and
outbound pickers never teach them.

## 3. Target

1. **One label set.** Decide with the owner (ask ONCE, show the options side by side) the words for
   two sizes only: a **short** face (chips, table cells, pills) and a **long** face (pickers,
   records, printed labels, tooltips' lead). Collapse the six variants to these two; delete the
   rest (clean cutover, every caller migrated). The meaning line is the tooltip / picker secondary
   line everywhere.
2. **One picker per surface family**, from the design system:
   - desk + phone forms and ledgers: `LedgerCondition` (the pinned triage list) — Inbound composer,
     kiosk pickup, `BulkConditionDialog`, the FBA quick-add `<select>` move onto it;
   - the Unbox capture strip keeps `ConditionPills` (a scan-station control), but reads the same
     short/long words and the same meanings.
   Every picker shows all 7 grades in canonical order with the meaning as the secondary line.
3. **One validator**: the three API routes import `CONDITION_GRADES` (or a `isConditionGrade`
   guard in `src/lib/conditions.ts`) instead of their own copies.
4. **FBA** keeps Amazon's words (external fact) but renders through the shared picker, each option
   naming its internal grade.
5. **Pin it**: update `pinned.json` (`LedgerCondition` useWhen/law: "every condition picker —
   inbound, kiosk, outbound, bulk, FBA"; `ConditionPills` = Unbox capture only, same words) so
   `node tools/design-mcp/ds.mjs contract "condition dropdown"` returns it. `ds_critique` the touched
   UI files.

## 4. Acceptance (the owner tests each)

- Unbox, Inbound new order, kiosk pickup, To-ship row, new sales order cart, bulk condition dialog,
  FBA FNSKU: the same 7 grades, same order, same short words on the face, same long words + meaning
  in the list. Screenshots side by side.
- A grade picked at Unbox reads identically on the Inbound record, the outbound order row and the
  printed label.
- `rg` finds no condition option list outside `src/lib/conditions.ts` (and FBA's external words).
- Unit test: `resolveConditionGrade` round-trips every alias the sources still write; the one
  validator rejects anything else. `pnpm verify:fast` green on your files.

## Prompt

> You own condition grades in CycleForge. Read `docs/HANDOFF-condition-grades.md` first, then every
> file in §2 (re-verify the cited lines). Work on :3050 only in managed browser tabs; the database
> is production — fixtures only. Other sessions edit this tree: re-read before each edit, touch only
> your lines, never commit.
>
> Owner ruling (§1): one condition picker, one set of words, one meaning line — Unbox, Inbound,
> kiosk, outbound and FBA stop disagreeing.
>
> Do, in order, proving each in the browser:
> 1. Ask the owner ONCE to pick the short and long words (show the six current variants side by
>    side), then collapse `conditions.ts` to those two faces + meanings; migrate every caller.
> 2. Move Inbound composer, kiosk pickup, bulk dialog and FBA quick-add onto `LedgerCondition`;
>    `ConditionPills` reads the same words + meanings. Delete every local option list.
> 3. One server validator from `src/lib/conditions.ts`; resolve the `USED_GOOD` question.
> 4. Pin in `pinned.json`; `ds_contract "condition dropdown"`, `ds_critique`.
> 5. Tests (§4) and `pnpm verify:fast`. Report as a table: surface → before / after screenshot →
>    files changed.
