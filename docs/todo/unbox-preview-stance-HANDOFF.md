# Unbox Preview stance — HANDOFF

**Lane:** `main` (dogfood). **Status:** read-only open SHIPPED, **both ratified
constraints now SATISFIED**, E2E green on the QA org, `npm run verify` PASSED
(2026-08-19). Remaining work is the sibling ports (bottom of this file).

> **The two constraints, in one line each.**
> **A. No cross-linkage.** Preview and Scan are two stances that share the bar and
> nothing else. Neither may flip, submit, or seed the other.
> **B. No microcopy in the scan bar.** The bar renders the value and the chrome.
> It renders no sentence, no status word, no stance label, and no placeholder
> prose — in either stance.

---

## What Preview means (the settled part — do not re-litigate)

Preview answers *"what is this?"* by **opening the station read-only**. It is not
a strip, not a card, not a tooltip. Identity, the middle ops-flow and the
Displays column all paint exactly as a scan's open would; the plane is `inert`
and the open wrote nothing.

Three writes the real path performs and Preview must never perform:

| Write | Owner on the scan path | Consequence if Preview did it |
|---|---|---|
| `receiving_scans` row | `recordReceivingScan` | the carton enters scan history |
| `receiving_unbox.opened_at` | `recordUnboxScanOpened` / `stampUnboxOpened` | counts as unboxing, and enters the **Unbox recent rail** (which sorts on exactly that column — [`receiving-lines/route.ts:269`](../../src/app/api/receiving-lines/route.ts)) |
| unmatched carton INSERT | `lookup-po` | a preview of a typo mints a carton |

This is why Preview does **not** reuse `lookup-po`: its reads carry its writes
(`findScanByTracking` memoizes its own hit), so there is no read-only door in it.

---

## Shipped (green, uncommitted)

| Layer | Module |
|---|---|
| Resolver (pure, Deps-injected) | `src/lib/receiving/preview-scan.ts` |
| Server bindings (`tenantQuery` seam) | `src/lib/receiving/preview-scan-deps.ts` |
| Route (`receiving.view`, read-only) | `src/app/api/receiving/preview-scan/route.ts` |
| Open hook (2 reads, 0 writes) | `src/components/sidebar/receiving/useUnboxPreviewOpen.ts` |
| Read-only lock band | `src/components/receiving/unbox/UnboxPreviewLock.tsx` |
| `preview` on the selection→pane thread | `receiving-sidebar-shared.ts` · `useReceivingSelection.ts` · `useReceivingWorkspaceBridge.ts` · `useReceivingWorkspacePane.ts` · `utils/events.ts` · `receiving-lines-table-helpers.ts` |
| Wedge stance fork | `src/hooks/useGlobalWedgeScanner.ts` + `deliverScanToTarget` in `src/lib/scan-hotkey/store.ts` |
| Tests | `preview-scan.test.ts` (8) · `preview-scan.guard.test.ts` (11) · `preview-classify.test.ts` (2) |

`readSelectLineDetail` forces `recordView: false` whenever `preview` is true, and
`UnboxLineWorkspace` re-forces it — one decision, two places it cannot be missed.

---

## DONE — A. Every cross-linkage removed (2026-08-19)

Preview and Scan now share the bar and nothing else. All six sites:

| # | Site | What landed |
|---|---|---|
| 1 | `StationScanBar` → `promoteToScan` | **deleted** — Preview cannot become a Scan |
| 2 | `StationScanBar` → `handleInternalSubmit` | Enter in Preview **always re-previews**; the second-Enter promote is gone |
| 3 | `ReceivingSidebarPanel` → `'receiving-preview-commit'` | handler **and** the event type in `receiving-events.ts` deleted; `setScanStance` import dropped |
| 4 | `UnboxPreviewLock` | **Scan it** removed — the band carries **Close** only |
| 5 | `StationScanBar` → `runPreview` | touches **no** scan face state (`committedValue` / `setFace` / `setScanKey`). The bar renders the value it already holds; there is no preview read-back face at all |
| 6 | `previewedValueRef` | scan submit no longer reads or clears it — preview path only |

**Bonus, from the knip gate:** removing #3's import orphaned `setScanStance`
from `scan-bar/index.ts`. It was **deleted, not baselined** — the stance writer
is module-private now, so no surface outside the bar's own `ScanHotkeyControl`
can reach it. That is constraint A enforced by the module graph rather than by
review.

**How an operator commits after a preview:** they switch the stance themselves
(the left `ScanHotkeyControl`) and scan again. Do not reintroduce a shortcut
"because it is one more step".

### Amendment (2026-08-19) — Close re-arms the bench

**Closing the read-only lock returns the stance to Scan and clears the bar.**
Requested from the bench, and it closes a footgun the strict reading created:
the stance is sticky (`localStorage`), so a preview that ended *in* Preview left
the operator's next real scan silently not unboxing — the bar looks armed and
records nothing.

**This is not the promotion constraint A bans.** Nothing is submitted, nothing
opens, and the value is **cleared** rather than carried over, so the next Enter
cannot commit the carton that was only being inspected. It is strictly safer
than leaving a previewed value sitting in a bar that has gone back to Scan.

So the stance now has exactly **two** writers, neither of which commits:
the bar's own `ScanHotkeyControl` (the operator picking their mode) and leaving
a preview (`ReceivingSidebarPanel`, on `receiving-workspace-close`). What stays
banned is a writer that flips the stance **and submits**.

It hangs off `receiving-workspace-close` rather than the button, so *every*
dismiss (Close, Esc, the identity `◁`) re-arms the same way — one rule, one
place. Known trade-off: a run of back-to-back previews costs a re-arm each time.
Guard: the `Close` half of *"Preview can never become a Scan"*.

**Kept** — the one legitimate fork: `useGlobalWedgeScanner` branching on
`isScanPreview()` before the sink and `router.push`.

## DONE — B. All microcopy stripped from the scan bar (2026-08-19)

| # | Site | What landed |
|---|---|---|
| 1 | `ReceivingUnboxScanBar` · `TestingScanBar` · `ShippingScanBar` | ``Preview: would search ${typeLabel}`` → **empty placeholder** in Preview stance (all three, not just Unbox). Scan-stance placeholders are left to the parallel `readyArm` lane |
| 2 | `StationScanBar` | both `toast.*` calls deleted. A miss or a failure is not the bar's to narrate — the honest owner is the surface that would have opened |
| 3 | `preview-classify.ts` + `preview-classify.test.ts` | **deleted** (with the barrel export). It existed only to compose those sentences |
| 4 | `classifyPreview` prop + its three host call sites | deleted |

`preview-scan.guard.test.ts` **grew** to pin all of the above (12 tests, green) —
no second guard.

## Three bench regressions the E2E did NOT catch at first

Reported from the bench after constraints A/B landed: *"Enter does nothing"* /
*"doesn't paint the middle and the right panel like a scan"*. Both real, both
now fixed and pinned.

**1. The MRU auto-open raced the preview open and usually won.** Bare `/unbox`
reopens the Unboxed rail's newest carton (`shouldAutoOpenUnboxMru`) through its
own async chain — rail query → carton fetch. The preview open has an async chain
too (`preview-scan` → `receiving-lines`). Nothing arbitrated, so on the **default
Queue tab** the MRU regularly replaced the previewed carton with the rail's most
recent: the operator typed a value, hit Enter, and got somebody else's carton.

Fix: **the MRU stands down in Preview.** It is a Scan-stance affordance — it puts
your last carton back under your hands so you can keep unboxing. In Preview it
answers a question nobody asked. Standing it down removes the race rather than
ordering it. (The pending-skeleton flag is released on the same branch, or
Preview holds a loader for a restore that never runs.)

**Why the first spec missed it:** it exercised only the default tab, and passed —
because the QA rail happened to be empty at that moment. The spec now previews
from **all four tabs** and asserts the URL names *the previewed carton*.

**2. A resolved carton with NO lines never opened — the big one.** On the
dogfood tenant **1361 of 2839 cartons (48%) carry zero `receiving_line` rows** —
a carton that is docked but not yet itemised is the commonest thing an operator
previews. `useUnboxPreviewOpen` bailed on exactly that shape:

```ts
const row = linesJson.receiving_lines?.[0] ?? null;
if (!row) return hit;          // ← resolved perfectly, then dropped it
```

Its own comment gave the reason: *"the band keeps the answer and the pane stays
closed"* — true while the scan bar still had a preview band, and **false the
moment constraint B deleted that band**. A retired surface left a live code path
pointing at it, and the result was a silent no-op on half the tenant's cartons.
The bench report *"still not opening anything at all"* was this.

Fix: compose **`buildUnmatchedStubRow`** — the same SoT the scan path opens an
un-itemised carton with — and carry the hit's real facts (PO number, platform,
title) on top, so a carton that HAS a PO does not open wearing the unmatched
face. Never a second stub shape.

**3. A miss became completely silent.** Constraint B said to move the miss signal
"out of the bar entirely — the honest owner is the surface that would have
opened". The first pass did the removal and not the move, so a value resolving to
nothing produced no pane and no word: exactly the *"not doing anything"* report.

Fix: the miss speaks from **`useUnboxPreviewOpen`** — the surface's own open
path, not the bar. Constraint B is about the *bar* authoring copy; a surface
saying it has nothing to open is that surface's job. **Interim owner** — a real
station empty-answer surface is the right long-term home; move it there and
delete the toast when it exists.

## A real bug the E2E caught

`preview-scan-deps.ts` `loadSummary` selected **`rl.quantity`**, a column
`receiving_line` does not have, so `GET /api/receiving/preview-scan` 500'd on
every request and the stance never opened anything. The unit tests inject fakes,
so they could not see it, and `column-reference.guard.test.ts` did not resolve
that alias either. Fixed to `coalesce(rl.quantity_expected, rl.quantity_received, 0)`.

This is the argument for the E2E in one line: the read half of Preview had never
executed against a real database.

## E2E — `tests/e2e/unbox-preview-stance.spec.ts` (QA org, 4 green)

`--project=qa-desktop`, fixture carton `QA_FIXTURE_PO_ID` / `QA_FIXTURE_PO_NUMBER`.
Entry is the **scan bar in Preview stance**, not `?openReceivingId=` — the stance
*is* the mechanism under test, so a deep link would skip it. Preview is armed by
seeding `localStorage['scan:station-stance']`, the same durable fact the left
control writes.

| Test | Asserts |
|---|---|
| the three writes | lock band visible · plane carries `inert` · `receiving_unbox.opened_at` unchanged · `receiving_scans` count unchanged · carton **absent from `view=unbox_opened`** (the rail's own membership query, not a UI read) |
| a miss mints nothing | a value resolving to nothing opens no pane, **says so** (the surface, not the bar), and `receiving_carton` count is unchanged |
| constraint A | no **Scan it** in the band, **Close** present · a second Enter re-previews and still writes nothing · **no `[data-station-scan-display]`** and the input keeps its editable value |
| constraint B | the placeholder is empty while Preview is armed |
| every tab (×4) | previewing from Queue · Inbound · Recent · History opens **the previewed carton**, not the rail's MRU |
| Close | the lock's Close returns the stance to Scan, empties the bar, and still writes nothing |
| line-less carton | a carton with zero `receiving_line` rows still opens the station (spec seeds and drops its own carton — a permanent empty one would sit atop every other spec's rail) |

`UnboxLineWorkspace`'s inert plane gained `data-unbox-preview-plane` so the
assertion names the element that actually carries `inert` rather than inferring
it from a sibling.

## Also outstanding

- **Mode re-run** (`previewMode` on `StationScanBar`) works on Unbox only.
  Sibling stations pass no `previewMode` yet.
- **Sibling ports.** Only Unbox is wired end-to-end. Testing / Arrival / Pack /
  Shipping have the stance toggle but no `previewLookup`, so Preview there is
  inert. Port **one station at a time** per
  [`station-port-from-unbox.md`](../../.claude/rules/display/station-port-from-unbox.md);
  the resolver is receiving-shaped and each station needs its own vocabulary.
- **The lock is a band + `inert`, not a `readOnly` prop.** Deliberate: inertness
  is a property of the plane, and a per-control flag would have to be right in
  ~40 places to be right at all. Do not "improve" it into a prop thread.
- **E2E for the sibling stations.** The spec above is Unbox-only, because Unbox
  is the only station wired end-to-end. Each port brings its own.

---

## Verify

```bash
npm run verify
```

**PASSED 2026-08-19** (after `node scripts/build-sot-manifest.mjs` and
`node scripts/portfolio-sot-sync.mjs`, which the added/deleted files make stale).

Two pre-existing reds belong to other lanes, not to this work:

- `station-scan-bar-layout.guard.test.ts` — expects a `readyArm` prop the
  parallel scan-bar lane has not landed. (It also expects that lane to wipe the
  remaining *scan*-stance placeholders; this pass only cleared the Preview one.)
- `column-reference.guard.test.ts` → `orderalias` in the unmodified, committed
  `src/lib/search/order-tracking-match-sql.ts`.

Neither is picked up by `npm run verify`'s unit gate, which is green.

Never raise a ratchet baseline to pass a gate.
