# Handoff — Return-to-scan CTA ports (hybrid Station + Workbench)

> **Find this doc when:** the scan-station chrome CTA “does nothing”, “just goes to the Recents tab”,
> “doesn’t open the most recent carton”, “doesn’t select in the sidebar”, or when adding /
> changing a **return-to-scan** or **resume** button on Unbox · Testing · Triage · Pack ·
> Shipping · Labels. Reached from `source-of-truth.md` → **Return-to-scan chrome CTA** and
> `display/workbench.md` → **Return-to-scan contract** → Ports.
>
> **The ruling in one line:** the CTA **resumes** — it re-opens the station's most recently worked
> record (which also marks it in the left sidebar rail) and re-arms the scan bar. It does **not**
> land a bare data table. Do not re-derive this; §1.1 has the evidence and §3 has the recipe.

**For:** the next Claude Code / Cursor session  
**From:** Cycle Forge engineering  
**Status:** ready to execute  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Date:** 2026-08-02 · **amended 2026-08-03** — §1.1: the CTA **resumes the most recently unboxed carton** (opens it + marks it in the left sidebar rail) instead of landing a bare data table. Shipped for Unbox; the 2026-08-02 rail-cursor plumbing is **retired unbuilt**.

**Law (already promoted — do not re-argue):**

| Layer | Where |
|---|---|
| Hard law | [`AGENTS.md`](../../AGENTS.md) — scan stations with a Workbench strip must expose return-to-scan |
| SoT row | [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) — **Return-to-scan chrome CTA** |
| Contract | [`.claude/rules/display/workbench.md`](../../.claude/rules/display/workbench.md) → **Multi-region pages** |
| Station anti-pattern | [`.claude/rules/display/station.md`](../../.claude/rules/display/station.md) §11 + at-a-glance |

**Reference implementation (done):**  
[`src/components/receiving/unbox/UnboxWorkspaceHeader.tsx`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx) — solid primary **“Unbox”** in `WorkbenchTrailingCluster.actions` on every strip tab.

---

## 0. One-sentence goal

Port Unbox’s return-to-scan chrome altitude to every hybrid scan station, extract a shared helper so peers don’t fork, **make the click resume the station’s MRU record rather than land a table**, ratchet it in CI, and carve honest-absence so desk queues stay clean.

---

## 1. The governing contract (locked)

```text
┌─ WorkbenchChromeHeader (pinned) ──────────────────────────────┐
│  [tabs…]   …search…filters… │ Sort │ Fields? │ RETURN CTA │
└───────────────────────────────────────────────────────────────┘
┌─ KPI strip ───────────────────────────────────────────────────┐
┌─ Data table / collection map ─────────────────────────────────┐
```

| Rule | Detail |
|---|---|
| **Where** | `WorkbenchChromeHeader` `trailing` → `WorkbenchTrailingCluster` **`actions`** — top-right, **above KPIs** |
| **When** | On **every** strip tab (never tab-gated; never honest-absent on hybrids) |
| **Look** | Solid `Button` `variant="primary"` + leading station glyph + short uppercase verb |
| **Click** | (1) Resolve the station’s **MRU record** · (2) **Open it** — the operator continues the work they left · (3) Land the **bench tab underneath**, without clearing the pick · (4) Focus the **station scan bar** |
| **Never** | Clear the pick on the way (a bench-tab switch that dispatches a clear), or close an open record when the MRU lookup fails |
| **Not** | GlobalHeader · scan column · below KPI tiles · quiet icon in `right` filters |

**Unbox click — shipped sequence** (`handleReturnToUnbox`, 2026-08-03):

1. `fetchUnboxOpenedRows({ staffId })` → `mru = rows[0]` (`view=unbox_opened`, SQL first-open order)
2. `onSelectTab('recent', { clearLine: false })` — bench working set underneath; the flag is load-bearing (below)
3. `emitReceiving('receiving-select-line', { row: mru })` — opens the carton **and** marks it in the left sidebar rail, one signal
4. `emitReceiving('receiving-focus-scan')` (≈60ms delay)

---

### 1.1 The CTA RESUMES; it does not return to a table — ruled 2026-08-03

**The button lives in Unbox's own chrome, so “go to Unbox” is not something it can mean — the operator is already here.** What it can mean is *resume*: re-open the carton most recently unboxed and re-arm the scan bar, so one click returns the operator to the work they left. **The close-overlay-first sequence is superseded**, and the old non-goal “reopening the carton overlay on CTA click” is **withdrawn** for the MRU record specifically.

**What the table-first version actually did on the bench: nothing visible but a tab change.** Two independent defects, both silent:

1. **It highlighted a row the landed table does not contain.** The MRU comes from `view=unbox_opened` (`receiving.unbox_opened_at`); the Recent tab's table is `view=viewed`, a per-staff feed read from `receiving_line_views`. Two different memberships — and since 2026-08-01 a browse click no longer stamps a view, so they routinely disagree.
2. **Even on a hit, the highlight was nulled on arrival.** `useReceivingRowSelection` clears `selectedId` whenever the id is absent from `localRows` (`useReceivingRowSelection.ts:135`), and the CTA emitted the highlight *after* its own `await` — racing the Recent table's refetch. There was also no `scrollIntoView`, so a surviving pulse could sit below the fold.

A CTA whose success state is a 1.5s flash that frequently cannot fire is indistinguishable from a broken button. Opening the record has no such failure mode.

**Selection is the mechanism, and the sidebar mark comes free.** The rail's `selectedId` is fed `selectedLineId` ← `useReceivingSelection`'s `selectedLine.id`, so `receiving-select-line` opens the carton **and** marks it in the left sidebar rail in one signal. **This retires the `cursorId` / rail-cursor plumbing this doc proposed on 2026-08-02** — a second parked-state field would now be a second answer to “which row does the rail mark”, which is the drift it was invented to avoid. Do not build it.

**`clearLine: false` on the bench-tab switch is load-bearing.** `setUnboxView` dispatches `receiving-clear-line` unless told not to (`useUnboxWorkspaceTab.ts:25`), so the default would drop the pick the very next line makes — and, when the MRU is already the open carton, close it. This is also why the tab switch runs **before** the select: it is the same ordering the scan auto-switch already uses.

**The MRU is a row the rail can show.** `fetchUnboxOpenedRows` → `UNBOX_OPENED_SOURCE` is the *same* descriptor the sidebar Unboxed rail consumes (`unboxRecent`, `preserveServerOrder`, `UNBOX_SIDEBAR_LIMIT = 50`), so `rows[0]` is row 0 of that rail by construction. Prefer the rail's cached rows (`receivingRailCartonKey`) over a parallel fetch when this is next touched.

**A failed lookup never closes the carton in front of the operator.** If the feed throws, the handler still lands the bench tab and re-arms the scan bar but leaves any open record alone — “I could not find your last carton” is not a reason to discard the one on screen.

**What is deliberately NOT re-litigated:** the CTA's placement (`WorkbenchTrailingCluster.actions`, above KPIs, every tab) and its scan re-arm. Unbox's scan bar lives in the sidebar, so it stays focus-locked with a carton open — resume and re-arm are not in tension, which is what makes this ruling cheap.

**Open question for the ports (§3):** whether every peer resumes, or only the ones whose bench has a single resumable record. Testing/Triage share receiving's selection and inherit this for free. Pack/Shipping rails take **no** selected id (§2.1b), so “open the MRU” there is the surface's own open path, and the rail may not mark it — decide per surface, and prefer honest absence over inventing a selection those rails never had.

---

### 1.2 The recipe — copy this shape, do not re-derive it

**Shipped, in `UnboxWorkspaceHeader.tsx`.** Four steps, and the *order* is part of the contract. A port swaps the four surface-specific calls; nothing else about the shape may change.

```ts
const handleReturnToUnbox = useCallback(() => {
  void (async () => {
    let mru: ReceivingLineRow | undefined;
    try {
      // (1) MRU from the SIDEBAR RAIL'S OWN FEED — so row 0 is a row that rail
      //     can actually show. Never a feed the landed surface does not share.
      const rows = await fetchUnboxOpenedRows({ staffId });
      mru = rows[0];
    } catch {
      // Lookup failed: fall through. Land the tab, re-arm the scan bar, and
      // leave any open record ALONE. Never close the carton in front of them.
    }
    // (2) Bench tab UNDER the record — `clearLine: false` or the next line's
    //     pick is dropped (setUnboxView dispatches receiving-clear-line).
    onSelectTab('recent', { clearLine: false });
    if (mru) {
      // (3) ONE signal: opens the record AND marks the sidebar rail, because
      //     the rail's selectedId IS this record. No second cursor field.
      emitReceiving('receiving-select-line', { row: mru });
    }
    // (4) The wedge owns focus last, after the workspace mounts its controls.
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  })();
}, [onSelectTab, staffId]);
```

**The four substitutions a port makes — and nothing else:**

| Step | Unbox | What a port swaps |
|---|---|---|
| 1 | `fetchUnboxOpenedRows({ staffId })` | that station's rail feed fetcher; the recency **axis** must be the station's own (Triage = door scan, **not** `unbox_opened_at`) |
| 2 | `onSelectTab('recent', { clearLine: false })` | its bench tab + its own don't-clear flag. **If the surface's tab setter clears unconditionally, fix the setter** — do not work around it |
| 3 | `emitReceiving('receiving-select-line', { row })` | its own open path. On a rail with no selected id (Pack / Shipping) the rail will not mark it — accept or skip per §2.1b |
| 4 | `emitReceiving('receiving-focus-scan')` | its `*-focus-scan` signal (Testing's listener exists but **nothing emits it** — §2.1) |

**Five things that look like improvements and are regressions:**

1. Adding `dispatchReceivingWorkspaceClose()` back at the top — churn, and a visible flicker when the MRU already *is* the open record.
2. Moving `onSelectTab` after the open — the tab switch is what clears, so it drops the record it was meant to sit under.
3. Emitting `receiving-highlight-line` alongside the select — redundant (`receiving-workspace-open` already sets the table's row indicator) and a second answer to "which row is marked".
4. Adding a rail `cursorId` so the sidebar marks it "without selecting" — retired unbuilt, §1.1.
5. Firing `focus-scan` synchronously — the workspace mounts its own controls after; the wedge must take focus last.

---

## 2. Measured ground truth (2026-08-02)

### 2.1 Hybrid registry — P0 ports

| Surface | Header file | Trailing today | Bench tab | Focus plumbing | Status |
|---|---|---|---|---|---|
| **Unbox** | `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` | Primary **Unbox** in `actions` | `recent` | `receiving-focus-scan` ✓ | **Done** — resumes the MRU carton (2026-08-03); typechecked, **runtime-unverified** (see §5) |
| **Testing** | `src/components/tech/testing/TestingWorkspaceHeader.tsx` | Sort only on pending/returns; **no `actions`** | `returns` | Listener for `testing-focus-scan` in `TestingSidebarPanel.tsx` — **nothing emits it** | **Missing** |
| **Triage** | `src/components/receiving/triage/TriageWorkspaceHeader.tsx` | **No `WorkbenchTrailingCluster` at all** | `triage` | `receiving-focus-scan` ✓ | **Missing** |
| **Pack** | `src/components/packer/PackWorkspaceHeader.tsx` | `actions` = Import/Add only | `queue` | Hotkey / `StationScanBar` register only | **Missing** |
| **Shipping** | `src/components/tech/shipping/ShippingWorkspaceHeader.tsx` | Import/Add only | `pending` | Same | **Missing** |
| **Labels** | `src/components/outbound/labels/LabelsWorkspaceHeader.tsx` | Sort + Import/Add | `queue` (or Recent if MRU) | `LabelsScanBand` local refocus | **Missing** |

### 2.1b Does the sidebar rail mark the resumed record? (measured 2026-08-02, re-read 2026-08-03)

Under §1.1 the rail mark is a **consequence of selection**, not a separate mechanism — but only on rails that take a selected id. That splits the six cleanly, and it is the open question the ports have to answer per surface.

| Surface | Sidebar rail | Takes a selected id? | Resume behaviour |
|---|---|---|---|
| **Unbox** | `ReceivingFeedRail` `unboxRecent` (Unboxed) — `view=unbox_opened`, the CTA’s own MRU source | **Yes** — `selectedLineId` ← `selectedLine.id` | ✅ shipped: one `receiving-select-line` opens the carton and marks the rail |
| **Triage** | `TriageRecentRail` (`selectedLineId`) | Yes — same receiving selection | Inherits Unbox’s path for free; MRU axis is the **door scan**, not `unbox_opened_at` |
| **Testing** | `TestingRecentRail` (`selectedLineId`, `TestingSidebarPanel.tsx:424`) | Yes | Inherits the same path |
| **Pack** | `PackRecentPacksRail` (`packerId` + `filterText`) | **No** — pure history feed | Open via the surface’s own path; the rail will **not** mark it. Accept that, or skip — do **not** add a `selectedId` to a history rail on the way past |
| **Shipping** | `ShippingStaffScanHistoryRail` (`techId` + `filterText`) | **No** — same shape | Same |
| **Labels** | `OutboundSidebarPanel` — saved views, **no MRU feed** | n/a | **Honest absence.** Nothing to resume; the CTA re-arms the scan bar and stops there |

**Why “skip” is a legitimate answer for Pack/Shipping.** Their rails are per-staff *history* feeds — a log of what was packed/shipped, not a working set with a current record. A station whose bench holds no single resumable record has nothing for a resume CTA to open, and forcing one would mean minting a selection concept those surfaces deliberately never had. Prefer a three-step CTA there over a fourth step that has to invent its own target.

### 2.2 Honest absence — do **not** spray CTAs

Ready · FBA · Incoming · History desk · Outbound desk · Repair · Products · Photo library · Support board · Labels Products.

**Pickup (2026-08-03):** no longer honest-absent. Staff `/pickup` mounts
`PickupScanBand` + solid **New Pickup** in `WorkbenchTrailingCluster.actions`
(create via shared `POST /api/local-pickup-orders`). Primary trailing action is
**New Pickup**; return-to-scan (focus the scan wedge) fires after create and
after a successful open/match — full Unbox-style return-to-scan click contract
(close focus → bench tab → MRU rail cursor) lands when a Station focus pane
exists on this surface.

### 2.3 Cousin drift (P1 — after or with ports)

| Item | Where | Fix |
|---|---|---|
| Pack Back to list | `PackOrderIdentity` / pack active-order chrome | Wire `CartonContextCard.onExitToList` like Unbox / Testing / Shipping (today: MoreDetails close only) |
| Triage chrome search | `TriageWorkspaceHeader` | Add `ToolbarSearchToggle` parity with Unbox/Testing |
| Actions collision | Pack / Shipping / Labels | Compose **return-to-scan primary first**, then Import/Add — do not replace desk CTAs |
| Trailing adopters | `workbench-trailing-cluster.guard.test.ts` | Unbox (and Triage once ported) missing from `TRAILING_CLUSTER_ADOPTERS` |
| Feed mismatch is still live elsewhere | `unbox_opened` vs `viewed` (§1.1) | The CTA no longer depends on the two agreeing, but **Back to list** still lands a Recent table that may not contain the carton just closed. Not this lane; worth a line in the next receiving one |
| Deep-link restore takes the old path | `useReceivingDeepLink.ts:64` | Still emits `receiving-highlight-line` into a table that may not hold the row (the defect §1.1 documents). Route it through the resume helper once §1 lands |

### 2.4 Guard gap

| Guard | Covers return-to-scan? |
|---|---|
| `workbench-trailing-cluster.guard.test.ts` | **No** — slot order / Fields ban / lip only |
| `workbench-chrome-band.guard.test.ts` | Band density only |
| `workbench-anti-station-shell` / `workbench-collection-map` / `station-workbench-chrome` | Unrelated |
| `receiving-events.guard.test.ts` | Bans raw `new CustomEvent('receiving-…')` outside the bus — a new signal must be typed into `ReceivingEventDetail` first |
| **`src/lib/stations/return-to-scan.guard.test.ts`** | **EXISTS as of 2026-08-03.** Per-host: MRU fetch · `receiving-select-line` open · `receiving-focus-scan` · **no** `dispatchReceivingWorkspaceClose` · `clearLine: false` **in the call**. Plus `RESUME_EXEMPT` reasons and a both-lists check |

**A port adds its entry to `RESUME_HOSTS` in the same change.** The list is the coverage ledger: today it holds Unbox only, and a bench that ships a CTA without joining it is unguarded, not exempt — exemption is a `RESUME_EXEMPT` entry with a stated reason.

**The guard reads CODE, not comments, and that was learned the hard way.** Its first draft searched the file for `clearLine: false` — which every handler also mentions in the comment explaining the trap, so the assertion passed with the real argument deleted. It now strips comments and matches the call shape (`onSelectTab(… clearLine: false`). Falsified on 2026-08-03 by mutating the handler three ways (flag removed · `select-line` → `highlight-line` · close re-introduced); each turns it red. **Re-falsify after editing it** — an assertion nobody has seen fail is a comment.

**The assertion with real cost, re-aimed 2026-08-03.** The old draft wanted to ban `select-line` in a CTA handler; §1.1 makes `select-line` **the mechanism**, so that assertion would now fail the correct code. What is worth pinning instead is the trap that cannot be seen in review: **a bench-tab switch that clears the pick.** `setUnboxView` dispatches `receiving-clear-line` unless passed `clearLine: false` (`useUnboxWorkspaceTab.ts:25`), so a peer that writes `selectBenchTab()` without the flag silently drops the record it just resumed — and the button reverts to exactly the "nothing happened but a tab change" symptom this lane was opened to fix. Assert it as a **negative** in Phase 2 (§2.1).

### 2.5 Doc carve-outs still soft

| File | Issue |
|---|---|
| `display/workbench-ops-queue.md` · `.cursor/rules/workbench-sort-chrome.mdc` | “Honest absence OK” for trailing slots — fine for desks; **must carve out hybrids** |
| `display/station-workbench.md` Related | No Multi-region / return-to-scan pointer |
| `contextual-display.md` index blurb | Understates return-to-scan |
| Stale Fields handoffs | Already stubbed / superseded in places; don’t revive chrome Fields as law |

---

## 3. Phases

### Phase 0 — Shared helper (blast: low) — **do first**

Extract Unbox’s sequence into one module so five peers don’t fork:

**Proposed home:** `src/lib/stations/return-to-scan.ts` (+ thin `useReturnToScan` if hooks needed)  
**Optional chrome:** `ReturnToScanButton` (solid primary + glyph + uppercase verb) next to station icons.

```ts
export type ReturnToScanArgs = {
  /**
   * Resolve the station's MRU record — the one to resume. Returns null when the
   * bench has none, or when the lookup fails; the caller must then leave any
   * open record ALONE rather than closing it (§1.1).
   */
  resolveMru?: () => Promise<{ id: number } | null>;
  /**
   * Land the bench tab. MUST NOT clear the current pick — on Unbox that is
   * `onSelectTab('recent', { clearLine: false })`; a surface whose tab switch
   * clears unconditionally has to be fixed here, not worked around.
   */
  selectBenchTab: () => void;
  /** Open the resolved MRU (which is also what marks the sidebar rail). */
  openRecord?: (mru: { id: number }) => void;
  focusScan: () => void;
  focusDelayMs?: number; // default 60
};

export function runReturnToScan(args: ReturnToScanArgs): void;
```

**Ordering is part of the contract, not an implementation detail.** `selectBenchTab` runs **before** `openRecord`, because a tab switch is what dispatches the clear — do it after the open and it drops the record it was supposed to sit underneath. And `focusScan` runs last, on a short delay, so the wedge owns focus after the workspace has mounted its own controls.

**There is no `closeOverlay`.** The 2026-08-02 signature opened with one; §1.1 withdrew it. A resume that begins by closing whatever is open is churn at best, and when the MRU *is* the open record it is a visible flicker for no reason.

**`resolveMru` returning null is the honest-absence path, and it must not be conflated with a throw.** Both end at "land the tab, re-arm the scan bar, touch nothing else" — but only the throw deserves a log. Neither closes a record.

**Gate:** Unbox refactored to call the helper; behavior unchanged from the 2026-08-03 shipped sequence.  
`npx tsx --test` on the helper's unit test — assert the ordering above, that a null MRU skips `openRecord`, and that `focusScan` still runs when `resolveMru` throws.

---

### Phase 1a — Testing (blast: medium)

**Files:**

- `src/components/tech/testing/TestingWorkspaceHeader.tsx`
- `src/components/sidebar/TestingSidebarPanel.tsx` (listener already present)
- Testing workspace tab SoT: `src/utils/testing-workspace-state.ts`

**Do:**

1. Mount `WorkbenchTrailingCluster` `actions` on **every** tab (including History).
2. Label e.g. **“Test”** + Testing station glyph from `@/components/icons/stations`.
3. Click → `runReturnToScan` → close line overlay (`dispatchSelectLine(null)` / surface close) → `onSelectTab('returns')` → `window.dispatchEvent(new CustomEvent('testing-focus-scan'))`.
4. Confirm the sidebar listener focuses the testing scan input (select existing text like receiving).
5. **Cursor:** pass `cursorRail` for `TestingRecentRail` (`TestingSidebarPanel.tsx:424`) — it already takes `selectedLineId`, so it inherits §0b's split. MRU = row 0 of the rail's own cached feed.

**Gate:** CTA visible on Returns · Pending · History; click leaves table visible, sidebar rail cursored on the MRU, scan bar focused.

---

### Phase 1b — Triage (blast: medium)

**Files:**

- `src/components/receiving/triage/TriageWorkspaceHeader.tsx`
- Receiving close / focus: same events as Unbox

**Do:**

1. Add `WorkbenchTrailingCluster` + solid primary (e.g. **“Arrival”** / triage glyph).
2. Click → `runReturnToScan` → `dispatchReceivingWorkspaceClose()` → land `triage` tab → `receiving-focus-scan`.
3. **Cursor:** `TriageRecentRail` takes `selectedLineId` and shares receiving's selection, so it inherits §0b directly. MRU axis here is the **door-scan** time (`triageDoorScanAt`), **never** `unbox_opened_at` — Triage's recency question is "what arrived", not "what was opened".
4. **Cousin (same PR OK):** `ToolbarSearchToggle` in chrome `search` for list refine parity.

**Gate:** CTA on triage · found · unfound · done; receiving scan bar focuses; rail cursored on the most recent door scan.

---

### Phase 1c — Shipping → Pack → Labels (blast: medium–high)

**Files:**

- `ShippingWorkspaceHeader.tsx` · `PackWorkspaceHeader.tsx` · `LabelsWorkspaceHeader.tsx`
- Active-order close paths; scan bands (`ShippingScanBar` / `StationPacking` / `LabelsScanBand`)

**Do:**

1. Compose `actions` as: **return-to-scan primary** + existing `OutboundOrderChromeActions` (Import/Add).
2. Bench tabs: Shipping `pending` · Pack `queue` · Labels `queue` (or Recent if product wants MRU-first — default Queue = strip default).
3. Close active order / overlay (Shipping already has `onExitToList` — reuse).
4. Focus scan:
   - Prefer a small `*-focus-scan` custom event per surface **or** a shared “focus registered StationScanBar” API via `useRegisterScanTarget` stack — pick one pattern and use it for all three.
5. **Cursor:** Pack (`PackRecentPacksRail`) and Shipping (`ShippingStaffScanHistoryRail`) are **history rails with no selection prop** — pass `cursorRail` and nothing else. Do **not** add a `selectedId` to them on the way past; a cursor is a scroll-and-ring, and clicking a cursored history row must keep doing exactly what it does today. **Labels ships no `cursorRail`** (no MRU feed — §2.1b honest absence).
6. **Pack cousin:** wire `CartonContextCard.onExitToList` (Back to list) — don’t leave MoreDetails-only exit.

**Gate:** Each surface shows return CTA + New Order; click clears active order, shows queue table, scan bar armed; Pack/Shipping rails cursored on their MRU, Labels cursors nothing and does not regress.

---

### Phase 2 — Ratchet + docs (blast: low)

#### 2.1 Guard — partly landed 2026-08-03

`src/lib/stations/return-to-scan.guard.test.ts` **exists** and covers the resume contract per host (§2.4). What is still missing is the **placement/altitude** half, which belongs with the ports:

1. ~~**Registry** of hybrid chrome hosts~~ — landed as `RESUME_HOSTS`; grow it per port.
2. Each file composes `WorkbenchTrailingCluster` with `actions=` **not** gated by `tab === …`.
3. Actions contain solid primary pattern (`variant="primary"`) + short verb / station glyph.
4. Handler or helper mentions close-overlay + focus-scan signal.
5. Add Unbox / Triage to `TRAILING_CLUSTER_ADOPTERS` when they compose the cluster.
6. **The `clearLine` trap** (§2.4): a hybrid CTA handler that switches the bench tab must pass the don't-clear flag. Assert the call shape, not the outcome — the outcome needs a browser.
7. **Resume coverage, as a shrink-only allowlist** — hybrids with a resumable bench record pass `openRecord`; `RESUME_EXEMPT` carries **Labels** (nothing to resume) and, pending §2.1b, **Pack / Shipping** with their stated reasons. Finishing the work removes a line; nothing may add one (`pattern-evolution.md` → Always #6).

**Do not** assert the full async MRU pipeline in the ratchet — altitude only. Ordering and the null-MRU path are the helper's unit test's job (§1); "the carton actually opened and the rail marked it" needs a browser (§5).

#### 2.2 Doc carve-outs

1. `workbench-ops-queue.md` + `.cursor/rules/workbench-sort-chrome.mdc` — desk may omit trailing slots; **hybrids must not omit return-to-scan**.
2. `station-workbench.md` Related → link `workbench.md` Multi-region.
3. `contextual-display.md` index blurb — name return-to-scan CTA explicitly.
4. Optional one-liners in `kinetic-ledger.md` / `ui-design-system.md` pointing at the SoT row.
5. **`source-of-truth.md` → Return-to-scan chrome CTA** — the row still reads “close focus overlay → bench tab’s data table → focus station scan bar”. Amend it to the resume sequence (§1).
6. **`AGENTS.md`** — the hard-law one-liner carries the same close-the-overlay clause. It must say **resume**, or the constitution contradicts the shipped bench.
7. **`display/workbench.md` → Multi-region pages** and **`display/station.md` §11** — both spell out the four-step click with “close carton/line overlay so the data table is visible”. Same edit.

**Gate:** `npx tsx --test src/lib/stations/return-to-scan.guard.test.ts` (and trailing-cluster) green; `npm run verify -- --fast` before finish.

---

### Phase 3 — Cousins / consolidation (blast: medium, after P0)

1. Unify focus-scan events or shared register-target focus API.
2. Pickup: confirm Station focus retired; if revived, add to hybrid registry + CTA.
3. Optional Unbox E2E smoke → then one hybrid matrix check (Testing + one outbound).
4. Stamp any remaining Fields-in-chrome diagrams in desk-contract / industry-standards handoffs as superseded for chrome Fields (lip/hover work is separate).

---

## 4. Execution order (strict)

```text
0.  Verify the shipped Unbox resume at the bench (§5 — nobody has yet)
1.  Extract returnToScan helper; refactor Unbox onto it
2.  Testing CTA + emit testing-focus-scan (+ resume — rail marks it free)
3.  Triage trailing + CTA (+ resume, door-scan axis, search polish)
4.  Shipping CTA + focus (resume = surface's own open path; rail won't mark)
5.  Pack CTA + focus + Back-to-list fix (same)
6.  Labels CTA + focus (nothing to resume — honest absence)
7.  return-to-scan guard + trailing adopters
8.  Doc carve-outs (incl. the SoT row's click contract + the AGENTS.md clause)
9.  Optional E2E
```

**Step 0 is not a formality.** The resume path shipped typechecked but never driven — the in-app browser has no session and Playwright's auth minting 401s on this machine (§5). One click at the bench either confirms it or turns up the next silent defect, and everything after it inherits the answer.

Do **not** start Pack/Labels before the shared helper — actions-slot composition will otherwise fork.

**The 2026-08-02 “Phase 0b — rail cursor” is deleted, not deferred.** Selection already marks the rail (§1.1), so a `cursorId` beside `selectedId` would be a second answer to “which row does the rail mark”. If a future lane needs a parked-but-not-open state, re-derive it from scratch against that need — do not resurrect this one.

---

## 5. Success criteria

- [ ] Every hybrid in the registry shows a solid return-to-scan primary top-right above KPIs on **every** strip tab
- [ ] Click **resumes the station's MRU record** — it opens, and on rails that take a selected id it is marked in the left sidebar
- [ ] The **scan bar is focused** after the record mounts (Unbox's lives in the sidebar, so both hold at once)
- [ ] The bench tab lands **underneath** without clearing the pick (`clearLine: false` or the surface's equivalent)
- [ ] A **failed or empty** MRU lookup leaves any open record alone — it never closes the carton in front of the operator
- [ ] Labels ships the three-step CTA and resumes nothing, by declaration (not by omission)
- [ ] Desk queues stay honest-absence (no CTA spam on Ready / FBA / Incoming / …)
- [ ] Guard fails if a hybrid drops `actions` or tab-gates the CTA away
- [ ] Docs never read as “honest absence OK” for hybrids
- [ ] `npm run verify` green before calling the lane done

**Unverified as of 2026-08-03 — the honest state of the shipped Unbox change.** It typechecks (`npx tsc --noEmit`, clean) and every mechanism it relies on was read in source: `mode === 'receive'` on `/unbox` so `isTableOnlyMode` is false and selection does reach `dispatchReceivingWorkspaceOpen` (`useReceivingWorkspaceBridge.ts:80,91`); the rail's `selectedId` is that same record; `setUnboxView` clears unless `clearLine: false` (`useUnboxWorkspaceTab.ts:25`). **None of it has been driven in a browser.** The in-app browser pane has no session (redirects to `/signin`, and an agent must not enter credentials), and `npx playwright test` fails in `global-setup` with `account signin failed (401): INVALID_CREDENTIALS` — the E2E owner account in `.env` is not valid on this machine. Fixing that is a prerequisite for step 0 **and** for the optional E2E in step 9.

---

## 6. Non-goals

- Re-promoting the *placement* law (already in AGENTS / SoT / workbench.md / station.md) — only the **click contract** moved on 2026-08-03
- Forcing return-to-scan onto pure desk / Monitor / service-workspace pages
- Building the retired `cursorId` / rail-cursor plumbing (§1.1 — selection already marks the rail)
- Minting a recents rail for a station that has none (Labels) just to earn a resume step
- Giving Pack/Shipping history rails a `selectedId` so they can mark a resumed record
- Closing an open carton on the CTA path — including when the MRU lookup fails
- A bench-tab switch that clears the pick (the `clearLine: false` trap)
- Raising any DS ratchet baseline to pass

---

## 7. Suggested commit slices (user owns commits)

1. `fix(unbox): the Unbox CTA resumes the last carton instead of flashing a row` ← **already in the tree, uncommitted**
2. `docs(rules): the return-to-scan CTA resumes; it does not land a table`
3. `feat(stations): extract return-to-scan helper; Unbox composes it`
4. `feat(testing): return-to-scan CTA + emit testing-focus-scan`
5. `feat(triage): return-to-scan trailing CTA`
6. `feat(shipping|pack|labels): return-to-scan CTA beside New Order`
7. `test(stations): return-to-scan hybrid chrome guard`
8. `docs: hybrid honest-absence carve-out`

Slices 1 and 2 belong together — the code and the law it changed should not sit apart in history.

---

## 8. Quick file index

```
# Law
AGENTS.md
.claude/rules/source-of-truth.md
.claude/rules/display/workbench.md          # Multi-region
.claude/rules/display/station.md
.claude/rules/display/workbench-ops-queue.md
.cursor/rules/workbench-sort-chrome.mdc

# Reference
src/components/receiving/unbox/UnboxWorkspaceHeader.tsx

# Ports
src/components/tech/testing/TestingWorkspaceHeader.tsx
src/components/sidebar/TestingSidebarPanel.tsx
src/components/receiving/triage/TriageWorkspaceHeader.tsx
src/components/packer/PackWorkspaceHeader.tsx
src/components/tech/shipping/ShippingWorkspaceHeader.tsx
src/components/outbound/labels/LabelsWorkspaceHeader.tsx

# Shell / slots
src/components/dashboard/workbench-shell.tsx   # WorkbenchTrailingCluster.actions

# The resume path (read these before touching the CTA)
src/hooks/useUnboxWorkspaceTab.ts                        # setUnboxView clears unless clearLine:false (~25)
src/components/sidebar/receiving/useReceivingSelection.ts# 'receiving-select-line' → selectedLine (~118)
src/components/sidebar/receiving/useReceivingWorkspaceBridge.ts # selectedLine → workspace open (~80,91)
src/components/sidebar/receiving/receiving-sidebar-shared.ts    # ReceivingSelectLineDetail (~365)
src/lib/receiving/rail/feeds.ts                          # UNBOX_OPENED_SOURCE / fetchUnboxOpenedRows (~235)
src/components/sidebar/receiving/ReceivingFeedRail.tsx   # rail selectedLineId (~41/171)

# Rails, per §2.1b
src/components/sidebar/receiving/TriageRecentRail.tsx            # takes selectedLineId
src/components/sidebar/receiving/TestingRecentRail.tsx           # takes selectedLineId
src/components/sidebar/packer/PackRecentPacksRail.tsx            # history feed, NO selection
src/components/sidebar/shipping/ShippingStaffScanHistoryRail.tsx # history feed, NO selection

# The defect §1.1 documents (still live on other paths)
src/components/station/useReceivingRowSelection.ts  # nulls a highlight absent from localRows (~135)
src/components/station/useReceivingDeepLink.ts      # still emits the table-only highlight (~64)
src/app/api/receiving-lines/route.ts                # view=unbox_opened vs view=viewed memberships

# Guards to grow
src/components/dashboard/workbench-trailing-cluster.guard.test.ts
src/components/receiving/receiving-events.guard.test.ts
src/lib/stations/return-to-scan.guard.test.ts  # NEW
```

---

Indexed by portfolio SoT after `npm run portfolio:sot`. Law detail stays in `.claude/rules/` — this file is the **port checklist**, not a second constitution.
