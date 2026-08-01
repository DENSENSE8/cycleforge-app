# Plan E — Move the Unbox tab strip into the right details panel

**Lane:** E · **shares `LineEditPanel.tsx` with Lane B — sequence, do not parallelize**
**Recommended order:** run **E before B Phase 3**, so B restructures a panel that is already simple.
**Date:** 2026-07-31 · `main` @ `1c226847d`

---

## Goal

Remove the tab strip from the workbench body:

```
[ 📦 Unbox ] [ ↗ Listings ] [ ⠿ Units 1 ] [ 📄 Zoho ] [ ⋯ ]        ( ✏️ )
```

`overview` ("Unbox") **stays** and becomes the whole center. Every other tab — `listings · units · po-note (Zoho) · classify · checklist · support · tracking · timeline` — plus the trailing pencil (`PairingTogglePill`, PO pairing) moves to the right details panel.

Result: the center is the carton and its capture work, nothing else. That is the "incredibly simplified" flow.

---

## 1. The destination is `ReceivingDetailsStack`, not a new rail occupant

**`RightRailHost` renders exactly one occupant** — `getRightRailTop()` over a priority stack (`src/lib/right-rail/store.ts:42, 212`). It is not a multi-pane surface. ~14 registrars across the app compete for that one slot.

Unbox already contends for the right edge three ways, and `source-of-truth.md` → Right-rail modality states they are **mutually exclusive**: `detail:receiving` (float), Ticket push (`?ticketView=1`), Claim push (`?claimView=1`).

So **registering a second Unbox occupant for "tabs" would be a fourth contender and a direct contract violation.** The tabs must land inside an existing occupant.

`ReceivingDetailsStack` is that occupant: it registers `detail:receiving` with a **stable id**, `elevated`, `modal={false}`, `closeOnOutsideClick` (`:187-194`), and **already has a tab band** — `progress | items | journeys` (`:34`). The eight moving tabs join that band.

**One occupant, no new registrar, mutual exclusion preserved.**

### The real UX risk to decide

The right slot is single-occupancy. Today an operator can have Ticket open *and* glance at Listings in the center. After this move, **Ticket and Listings compete for the same slot** — opening one closes the other.

Options, in preference order:

1. **Accept it.** Ticket/Claim are exception work; Listings/Zoho are reference. They are rarely wanted simultaneously. Cheapest, and the mutual-exclusion rule already assumes this.
2. **Promote the most-contended tab** (likely `units`) back to the center as part of the capture stack rather than the rail.
3. Widen the rail to two panes — **rejected**: that is the multi-pane right edge the store exists to prevent.

Pick (1) unless the bench trial says otherwise.

---

## 2. The coupling that must be cut first

**The tab strip currently drives the bottom CTA.** `UNBOX_TAB_TERMINAL` maps every tab id to a terminal kind (`terminal/unbox-terminal.tsx:23-33`), consumed by `useStationTerminalAction({ tabId: activeUnboxView })` (`LineEditPanel.tsx:360-365`).

If the tabs move to the right rail and that coupling survives, **the operator selects something on the right and the primary button at the bottom silently changes meaning.** That is cross-region action-at-a-distance and it is worse than the current layout.

**Cut it: the dock CTA becomes carton-terminal and tab-independent** — always Print/Receive for the carton. Any tab-specific action (post a reply, save a PO note, check all) moves into the right panel **with its tab**, as a local control.

This is also the direction the capture-stack plan already sets: the terminal commit is the last row of the stack, not a mode-switching CTA. `UNBOX_TAB_TERMINAL` largely dissolves — say what survives.

---

## 3. What moves, what stays

| Tab | Destination | Note |
|---|---|---|
| `overview` (Unbox) | **stays — becomes the center** | No strip; the center is the capture stack + carton work |
| `listings` | right | reference |
| `po-note` (Zoho) | right | editor |
| `classify` | right | editor |
| `checklist` | right | editor |
| `tracking` | right | reference |
| `timeline` | right | reference |
| `support` | right | check overlap with the Ticket push before duplicating |
| `units` | right *(candidate to stay)* | Its data is the capture stack's own output — see §1 option 2 |
| `PairingTogglePill` (✏️ PO pairing) | right | the operator's explicit instruction |

`SectionTabsSlider` is **not deleted** — ~10 other consumers (`PackerReviewMode`, `SupportTicketFocus`, `SupportOrdersWorkspace`, `WorkspaceTimelineTab`, `CartonContextCard`, …). Unbox stops using it; the primitive stays.

---

## 4. State that must move with the tabs

- `unboxView` / `activeUnboxView` (`LineEditPanel.tsx:167`, `:193-203`) — the visibility gating (`hasPoNoteTab`, `hasUnits`, `hasTrackingTab`, `hasListingsTab`, `hasClassifyTab`, `classifyOnStrip`) moves with it. **Do not leave a vestigial `unboxView` in the panel.**
- `classifyExpand` (`:168-179`) — `onClassifyPillOpen` from the identity header currently routes to the `classify` tab. After the move it must open the right panel on that tab. **This cross-links to Lane A** (identity header) — coordinate.
- Tab bridges (`checklistBridgeRef`, `unitsBridgeRef`, `supportBridgeRef`, `:215-252`) exist to feed the dock CTA. Once §2 cuts that coupling, **most bridges become dead** — delete them rather than re-threading them across regions.
- `pairingOpen` / `togglePairing` (`:369-383`) and `openPoPairing` move with the pencil.

---

## 5. Sequencing — E before B Phase 3

E and B both edit `LineEditPanel.tsx`. They cannot run in parallel.

**Run E first.** It is a pure relocation (lower risk), it shrinks the panel before B restructures it, and it delivers the simplified center immediately. B Phase 3 then rebases onto a panel that already has one job.

Lanes A, C, and D remain parallel-safe against E — different files.

---

## 6. Out of scope

- The capture stack itself (Lane B).
- Identity header rows (Lane A) — but coordinate the `classify` cross-link.
- Labels/notes grain (Lane C).
- Any change to `RightRailHost`, the store, or the single-slot model.

## 7. Verification

- `npm run verify` green; no ratchet baseline raised — including `station-workbench-chrome.guard.test.ts` (the `tabs` slot goes empty for Unbox; confirm the guard tolerates that **before** writing code).
- Every moved tab renders in the right panel with its editors working.
- The bottom CTA no longer changes with panel selection.
- Ticket / Claim / details mutual exclusion still holds — opening one closes the others.
- Triage, Testing, Shipping, Pack unaffected (`SectionTabsSlider` untouched).
- Extend `unbox-stn-ticket-context.spec.ts` and `receiving-param-isolation.spec.ts` rather than orphaning them.
