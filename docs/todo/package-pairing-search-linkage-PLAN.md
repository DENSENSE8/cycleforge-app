# Package Pairing Search & Linkage PLAN

**Status:** PLAN approved + implemented (2026-07-30) — see [package-pairing-search-linkage-PLAN.md](./package-pairing-search-linkage-PLAN.md)
**Research:** Gemini D1–D10 verdicts locked; P0–P2 shipped.

## Locked decisions

| ID | Verdict | Plan implication |
|---|---|---|
| D1 | KEEP in-field filter + ADD hot chip | Selection stays in `WorkbenchFilterPopover density="field"`; active non-default scope also shows a removable/clearable chip beside the field |
| D2 | KEEP growing `WorkbenchFilterPopover` | No `SearchFieldFilter` fork; a11y + optional adjacent chip API live on the existing popover / Store scope consumer |
| D3 | CHANGE — one Match hub | Merge `UnfoundMatchStrip` + `LineMatchingSection` / `TriageLineMatchingSection` into `CartonMatchHub` |
| D4 | KEEP multi-link | PO/order and ticket remain independent; collapsed hub must show both without implying one parent |
| D5 | KEEP `chrome="bare"` | Arrival Store tab must pass `chrome="bare"` (today defaults to nested card) |
| D6 | DEFER | **Out of scope.** Keep defaults: unfound → Inventory Item; matched → Store. No default-tab change until telemetry |
| D7 | KEEP Email PO removed | No reintroduction in pairing tabs |
| D8 | CHANGE — persist user/device | Store scope (`all` \| `repair_rs`) in `localStorage` |
| D9 | CHANGE — unify rows | Grow `PairingCandidateRow` with slots; migrate Ecwid `ResultRow` + `MatchCard` |
| D10 | CHANGE — hot chip | Dot alone is insufficient; chip is the floor glanceability SoT when scope ≠ `all` |

Also locked: one hub adapts via `autoFocus` + `tabSet`; suggested matches = top 1–2 rows inside the search list (no percentage scores); merge vs replace needs an explicit confirm dialog.

## Non-goals

- Chrome SoT compound phases / nested facet governance
- Claim-modal / auto-ticket redesign; Email Triage queue work; serial↔label pairing
- Changing default tabs (D6)
- Inventing `PackagePairingFilterMenu` or a second search engine

## Phases

### P0 — Accessibility & glanceability

1. Grow `WorkbenchFilterPopover`: hot `aria-label` with active scope; focus restore on close; keyboard contract documented.
2. Hot scope chip beside SearchField when `orderScope !== 'all'` (clear → `all`).

### P1 — Component unification

3. Grow `PairingCandidateRow` with `media` / `title` / `meta` / `action` slots; migrate Ecwid `ResultRow` + `MatchCard`.
4–5. Merge into `CartonMatchHub` (`tabSet` + `autoFocus`); absorb Auto-match; de-fork Triage; Arrival `chrome="bare"`.

### P2 — Data & state polish

6. Persist Store scope in `localStorage` (`cf:store-order-scope`).
7. Linkage audit lockup on collapsed chips (linked by X · relative time) from existing audit fields.
8. Explicit Replace vs Merge confirmation before relink / inbound-link when identity exists.

## Success criteria

- Store Repair scope: funnel + visible chip + non-color `aria-label` when hot.
- One Match hub on Unbox and Arrival; no duplicate Find-ticket / find-order strips.
- Ecwid / PO / Ticket candidates share one row skeleton; suggested matches are top list rows without scores.
- Arrival never autofocuses search; Unbox may.
- Scope preference survives reload on the same device.
- Replacing an existing PO/order link requires explicit Replace or Merge confirmation.
