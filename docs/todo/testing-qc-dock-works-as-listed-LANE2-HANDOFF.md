# Handoff — Lane 2 Testing QC dock (works-as-listed → claim)

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-08 · **Lane:** current checkout (`main` / dogfood) — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status:** Scaffold **landed in working tree** (`TestingDockHost` · works-as-listed CTA · Listing Displays leaf · claim prefill). Finish = wire real seller-claimed facts, prove Fail → claim → seller-message draft on `:3050`, harden guards.  
**Sibling lane (do not mix):** [`unbox-dock-listing-compare-LANE1-HANDOFF.md`](./unbox-dock-listing-compare-LANE1-HANDOFF.md)  
**Out of scope:** UnboxDockHost / FOUND_CAPTURE changes · Archive | Reticle | Queue · Generate Asset Tag · remount centre ProcedureDeck on Testing.

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Scan-station centre / QC (Testing) · [`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) · [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md).

---

## Prompt (paste into a new agent session)

```text
Lane 2 — Testing QC dock: listing + seller-claimed condition → works-as-listed → claim / seller message.
Do not reuse UnboxDockHost or UNBOX_STEP_DOCK_CONTROLS. Do not change Unbox FOUND_CAPTURE.

## Mission

Testing is a separate station dock/procedure from Unbox. Working tree already has:

- TestingDockHost — leading works-as-listed CTA · trailing Pass · Print · notes below Panel · under-dock step label
- WorksAsListedDockControl — “As listed” / “Not as listed”
- Displays leaf `listing` — TestingListingVerifyHost (seller-claimed + Open listing)
- Not as listed → buildNotAsListedIssue → claimPrefill → TicketDisplayHost returnClaimPrefill; Fail path via handleSlotVerdict(TESTING_FAILED) when an active serial exists
- SoT: resolveSellerClaimedCondition / buildNotAsListedIssue (order sold-as > listing_condition; never warehouse condition_grade)
- Vocab stub: src/lib/stations/testing-procedure.ts (listing_context · works_as_listed)

Your job: make the QC walk honest end-to-end on :3050.

1. Feed resolveSellerClaimedCondition with real facts (matched-order sold-as / platform_listings.listing_condition when available) — today TestingPanel passes `{}` (honest absence). Expand the controller or a thin query; do not invent from condition_grade.
2. On line open (or when works_as_listed is the ask), open Displays `listing` so the operator sees claimed condition + listing before verdicting — without fighting Ticket auto-open when fail/ticket context wins (detail outranks).
3. Not as listed: issue text must land in claim reason and flow into assist-seller / seller-message step (prefillReason already on TicketDisplayHost — prove it).
4. As listed: operator continues to Pass · Print (terminal unchanged; Displays never re-labels it).
5. Centre stays PO lines + unit slots + UnboxLabelPreview — no claim wizard in centre.
6. Guards: testing-qc-dock.guard.test.ts · testing-flush-display · testing-ticket-displays — keep green; never import Unbox dock registry.

Attach to :3050 — never start/restart/kill. Stay on branch. User owns commits. Prefer verify --fast; full verify before done; fix only Lane-2-touched regressions.

## Locked intent

- Two stations = two docks. TestingDockHost ≠ UnboxDockHost.
- Dock = command (As listed / Not as listed); Displays Listing = reference; Ticket = claim + seller message.
- Operator copy: capability / platform labels — never hardcoded “eBay” product sentences.
- Pass · Print stays trailing terminal.

## Already landed (start here)

| Piece | Path |
|---|---|
| Host / CTA | `src/components/tech/testing-panel/TestingDockHost.tsx` · `WorksAsListedDockControl.tsx` |
| Mount | `src/components/tech/TestingPanel.tsx` |
| Listing leaf | `TestingListingVerifyHost.tsx` · `build-testing-displays.tsx` tab `listing` |
| Seller claim SoT | `src/lib/receiving/seller-claimed-condition.ts` (+ unit tests) |
| Vocab | `src/lib/stations/testing-procedure.ts` |
| Guards | `testing-qc-dock.guard.test.ts` (flush guard updated for TestingDockHost trailing) |

## Finish checklist

- [ ] sellerClaimed resolves from real sold-as / listing_condition when present; under-dock shows “sold as …”
- [ ] Manual :3050 `/tech`: open unit → Listing shows claim → As listed → Pass · Print; Not as listed → Ticket claim with issue → seller message draft
- [ ] No UnboxDockHost / UNBOX_STEP_DOCK_* imports under `src/components/tech/`
- [ ] Targeted guards + seller-claimed-condition tests green
- [ ] `npm run verify -- --fast` then full verify — Lane-2-owned failures only
- [ ] Record walk in reply

## Do not

- Share Unbox dock registry or remount Unbox ProcedureDeck on Testing.
- Put claim wizard in the centre.
- Raise DS/knip baselines.
- Commit unless asked.
```

---

## Known gaps

- `TestingPanel` currently calls `resolveSellerClaimedCondition({})` — wire matched-order / listing facts next.
- Ticket auto-open on fail/linked ticket can race Listing open — Listing is reference; Ticket wins when claim is the job.
- `listing_condition` lives on `platform_listings` (often empty) — prefer sold-as from return/outbound match when Testing has it.
