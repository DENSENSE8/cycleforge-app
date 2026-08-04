# Lane C — the scan, bound to the step

**Index:** [`INDEX.md`](./INDEX.md) · inherits **S1 · S5 · S6 · S7**
**Owns:** `src/lib/station-scan-routing.ts` · the scan classifiers · `scan-hotkey/**` ·
`src/components/station/scan-bar/**`
**Starts after:** A-1 (needs `scanKinds`)

---

## The job

The procedure knows what step the operator is on. The scan bar does not. Today
`detectStationScanType` classifies a payload by **shape** and `resolveScanType` overrides it
from **entity context** (an order short on serials treats a carrier-unknown barcode as a
serial). Neither knows there is an active step.

This lane closes that: **a scan is interpreted at the step the operator is standing in, and
the surface says what the scan did.** It is the difference between a bench that accepts
barcodes and a bench that runs a procedure.

---

## C-1 — the step is a disambiguator, never an override

The rule that keeps this safe, and it is the whole lane in one line:

> **An unambiguous payload wins. The active step decides only the AMBIGUOUS case.**

A GS1 Digital Link is a unit on every step. A tracking number is a carton on every step. A
bare 12-digit string on a `serial` step is a serial; the same string on an `arrival_check`
step is a tracking number. `scanKinds` (A-1) supplies the step's preference; the classifier
still owns the decision.

**Why not let the step win outright:** an operator scans the wrong thing constantly — that
is the normal case, not the error case. A step that force-interprets every payload as its
own kind turns "you scanned the box label instead of the unit" into a silently wrong
record. The classifier's job is to notice; the step's job is to break ties.

**Decode before you search.** An input whose copy says *scan* must run the decoder first.
A printed sticker does not carry a bare handle — a carton carries
`https://{slug}…/m/r/{id}`, a unit carries a GS1 Digital Link — so a field that regexes for
`R-{id}` silently stopped accepting the thing this app prints. Compose the SoT unwraps
(`scannedReceivingId` · `unwrapScannedSerial` · `unwrapScannedLocation` ·
`scannedUnitKey`), never a local parser.

### Guard

`scan-step-binding.guard.test.ts` — for every registered procedure × every declared
`scanKinds`, an unambiguous payload of each wild form resolves to its own kind **regardless
of the active step**. Compose `WILD_PAYLOAD_FORMS` from `barcode-routing.test.ts`; do not
write a second table of payload forms.

---

## C-2 — the cue: what the scan just did

**The single biggest gap on these benches.** A scan lands, evidence appears somewhere, and
the operator's confirmation is that a count changed on a card that may be off-screen. At a
bench, three feet back, with hands on product, that is not feedback.

The house already rules the *shape* of station feedback and this lane must compose it
rather than invent a fourth vocabulary:

| Outcome | Cue |
|---|---|
| Scan satisfies the active step | the step advances — **the advance IS the cue**, and it must be legible without looking for it |
| Scan is valid but for a **different** step | say which step it landed on. Never silent, never a failure |
| Scan is unmatched / exception | amber exception state — continue-with-honesty, never emerald "Active", never a hard-dismiss modal |
| Hard reject (409, ambiguous) | **big rose fail card** in the feedback slot — never a corner toast, never `alert()` |

**Add the non-visual channel.** Pair the visual with audio/haptic (success vs reject). The
operator is looking at product, not the screen; sound closes the loop when the eyes cannot.
This is the one genuinely missing modality on every bench today.

**The cue belongs to the region that owns the scan** — the active card and the feedback
slot, not a toast and not the dock's trailing terminal. A scan re-labelling the commit
button is cross-region action-at-a-distance.

### SoT delta (hand to F)

> Every scan at a station produces a legible outcome cue naming WHAT it did — advanced this
> step, landed on another, opened an exception, or was rejected. A scan whose only feedback
> is a count changing somewhere on screen is a silent success, which is the CF-02
> anti-pattern. Pass/fail is a card state plus a non-visual channel; never a toast, never
> `alert()`.

---

## C-3 — cadence and focus

Three failure modes, all silent, all cheap to guard:

1. **Focus drift.** The wedge owns focus. Every pointer control hands it back
   (`receiving-focus-scan`, 60ms defer) — S5. Today this is a convention repeated in seven
   files. **Make it a guard**: any component under a station surface rendering an
   `onClick` that mutates must dispatch the hand-back. Start as a ratchet over the known
   surfaces rather than a blanket rule that would fail on day one.
2. **Re-entrant submit.** A wedge fires fast partial bursts; a double-fire must be a no-op,
   not a double-effect. Gate on `inFlight` **and** carry the per-scan `clientEventId` /
   `Idempotency-Key` through — the client already mints one; the route must honour it via
   `api_idempotency_responses`. A client that sends the key while the route drops it is a
   SoT bug, and optimistic UI is unsafe without the server half.
3. **Step advance under the hand.** The pointer must not move while a scan is in flight in
   a way that re-targets the operator's next action. Before evidence settles, *which* step
   is active is exactly what has not resolved — the dock already gates on `settled` for
   this reason and the cue must too.

### Guard

`scan-idempotency-wiring.guard.test.ts` — every station scan route that a client sends a
key to reads it. Parse the call sites, the way `lookup-scan-wiring.guard.test.ts` does.

---

## C-4 — different items and products

The step vocabulary already varies by **carton shape** (unfound / local pickup / return).
What it does not vary by is **what is in the box**. A serialized laptop, a 40-unit bulk
carton and a returned accessory want different capture, and today they get the same nine
steps.

**This is the phase most likely to go wrong, so the constraint first:** the variation
lives in the **declaration** (A-1's variant flags), never in the renderer. A body that
branches on the product's category is the second vocabulary S1 bans, and it is invisible to
Studio and to the receipt.

Two mechanisms already exist and neither is a new concept:

- **`onlyWhen` / `omitWhen` / `moveBefore`** on the step — variant-driven, already how
  returns move `serial` ahead of `condition`.
- **Org policy via the Settings Registry** — `receiving.requiredItemPhotoAspects` is the
  precedent: which item aspects block the step is org policy, not a constant, because a
  two-person reseller and a warranty-heavy tenant do not want the same six-shot minimum.

**What is genuinely new and needs a decision:** a *per-SKU* or *per-category* variant flag
means the procedure depends on data resolved after the scan. That is a real change to when
the vocabulary is knowable, and it interacts with Lane E (an org authoring category rules).
**Do not build it in this lane.** Write the requirement into Lane E and keep C-4 to the
variant flags the carton already carries.

---

## Requests to other lanes

- **A:** `scanKinds` per step (A-1). C cannot start without it and must not hardcode a
  step→kind map in the meantime.
- **D:** the exception path for a scan that satisfies nothing — C shows the cue, D records
  the fact. C must not write.
- **B:** the advance-as-cue depends on the deck's travel being legible (B-2). If B measures
  that the advance is not noticed, C-2's first row needs a second channel.

---

## Do not re-open

- **No browsable list in the scan column.** That is a Workbench, and it steals focus from
  the only thing that matters — the next scan.
- **Selection is ephemeral.** A station's active entity is never URL-addressable.
- **No `window.alert()`** — it steals keyboard-wedge focus and is a data-loss vector.
- **Never paint emerald Active over an unmatched session.** Unmatched tracking is an amber
  exception the operator keeps scanning into.
- **A bench capture never stamps `arrival_package`** — it is the pre-opening door stage and
  the only one the `require_one` receive gate counts.
