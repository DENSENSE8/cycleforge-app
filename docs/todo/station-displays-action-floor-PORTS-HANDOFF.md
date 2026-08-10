# Station Displays action floor — cross-station port (HANDOFF)

**Status:** OPEN — ready to execute (Phase 1). Phases 2–3 are gated/context.
**Date:** 2026-08-10
**Goal (verbatim use case):** *port the icons-first carton Macro action floor
(`⋯ · … · 🗑`, equal fill-width peers) from the Unbox/Arrival golden to the
other scan stations* — so every station whose right edge is **Station Displays**
carries the same record-actions floor.

Predecessors that shipped this shape:
- Desk rails + **Unbox** (`UnboxDisplaysActionFloor`) — icons-first `InspectorActionFloor` / carton Macro floor.
- **Arrival** (`ArrivalDisplaysActionFloor`, 2026-08-09/10) — `docs/todo/arrival-displays-action-floor-HANDOFF.md`.

References: `.claude/rules/display/station-port-from-unbox.md` (identify → remove
→ compose) · `.claude/rules/display/right-rail-inspector.md` (C2 fork table) ·
`source-of-truth.md` → **Displays vs inspector** · **Scan vs desk right-edge (C2)**.

> **Method (non-negotiable): identify → REMOVE → compose.** This is NOT "add the
> floor on top of whatever the station has today." Every station port first
> **deletes** the old divergent methods — chief among them any **centre
> `SectionTabsSlider` for Displays-class tools** (*no tab strip in the middle of
> the display anymore*) — and only then composes the Displays push + floor.
> Adding the new door while the old one is still imported is a **half-port**
> (both doors mounted → the surface has two ways to do one job). See **§2**.

---

## 0. The ONE distinction that shapes the whole plan: GRAIN

The floor we built is a **carton Macro floor** — every verb and descriptor is
**receiving-carton**-grained:

- Delete = `DELETE /api/receiving-logs` (a **carton**).
- Sync = the Zoho **inventory dossier** pull (`refreshInventoryDossier`) — PO/carton-scoped.
- Edit = carton **linkage/pairing**.
- Overflow `⋯` = `stationDisplaysFloorMoreItems` (Resolve when unfound).

**Grain decides whether porting is a COPY or a DESIGN.** A station whose open
record is a carton reuses everything; a station whose record is an *order* or a
*ticket* has none of these routes, so the carton floor is a category error there.

| Station | Panel | Displays push? | Floor today? | Record grain | Verdict |
|---|---|---|---|---|---|
| **Unbox** | `LineEditPanel` | ✓ | ✓ `UnboxDisplaysActionFloor` | receiving carton | golden |
| **Arrival** | `TriagePanel` | ✓ | ✓ `ArrivalDisplaysActionFloor` | receiving carton | done |
| **Testing** | `TestingPanel` | ✓ | ✗ | **receiving carton** | **Phase 1 — direct port** |
| **Pack** | `PackOrderPanel` | ✓ | ✗ | order (`activeOrder.orderId`) | Phase 2 — gate (not a copy) |
| **Shipping** | `ActiveOrderWorkspace` | ✓ | ✗ | order | Phase 2 — gate |
| **Support orders** | `SupportOrdersFocusHost` | ✓ | ✗ | order | Phase 2 — gate |
| **Repair** | `RepairDetailsPanel` | ✓ | ✗ | `RS-####` ticket | Phase 2 — gate |
| Labels | `LabelsOrderWorkspace` | ✗ (centre tabs by design) | — | — | out of scope (no Displays push) |

**Bottom line: the direct carton-floor port is Testing, and it STOPS there.**
The order/ticket stations are a separate, gated design question (Phase 2) whose
likely answer is "no station Macro floor — record actions already live on the
desk order inspector."

---

## 1. The shared waist (compose these — C2: share the METHOD, fork the HOST)

Every carton-grain floor is ~1 thin adapter + 1 wire + 1 guard, because the
shell + presentational waist already exist:

| Concern | Module | Share? |
|---|---|---|
| Station Macro shell (`h-11`, `FlushTerminalFooter layout="spread"`, null-when-empty) | `@/components/station/displays` → `StationDisplaysActionFloor` | **share** |
| Fill-peer classes | `FLUSH_TERMINAL_SPREAD_PEER_CLASS` / `_GLYPH_CLASS` (`@/design-system/primitives/FlushTerminalFooter`) | **share** |
| Flush trailing Delete | `@/components/right-rail/InspectorFlushDelete` | **share** |
| Overflow descriptors | `@/lib/receiving/station-displays-carton-floor.ts` (`stationDisplaysFloorMoreItems`) | **share** (carton grain only) |
| PushStack slot | `StationDisplaysPushStack` `actionFloor?: ReactNode` (renders above the `→|`/Filter close chrome) | **share** |
| The per-station adapter | `<Station>DisplaysActionFloor.tsx` | **fork** (thin, mirrors `UnboxDisplaysActionFloor`) |

**C2 hard line (guarded):**

| Do (station) | Do NOT |
|---|---|
| Compose `StationDisplaysActionFloor` + raw `IconButton size="fill"` peers + `InspectorFlushDelete` | Import the **desk** peers `InspectorActionFloor` / `FloorIconButton` / `FloorOverflowButton` (`@/components/right-rail/*`) |
| Keep the floor **carton-scoped** (same whether Pairing or the index is open) | Re-label the dock terminal from a Displays click (cross-region action-at-a-distance) |
| `size="fill"` (hit target IS the column) | `size="touch"` + `justify-between` (dead air); micro `h-4` glyphs on an `h-11` floor; floating `w-11` islands |

Golden to copy: `src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx`
(wired at `LineEditPanel.tsx` `actionFloor={…}`). Arrival's 4-peer variant:
`src/components/receiving/triage/ArrivalDisplaysActionFloor.tsx`.

---

## 2. Remove the old methods FIRST — identify → delete (the removal half)

Per `station-port-from-unbox.md` and pattern-evolution **Always #6**: *find every
surface that does Unbox's job differently → **retire it (delete, or
allowlist-shrink)** → compose.* **A prose "we use Displays now" claim is not a
port. It is not done until the old path is DELETED, or a guard names the exact
surviving call sites and only shrinks.**

**Why a guard, not just knip:** knip cannot see a fork whose doors are **both
imported** (a centre tab strip AND a Displays leaf both mounted → both count as
"used"). Only a guard answers *"is this the only way in."*

### Deletion targets — retire BEFORE composing the new Displays + floor

| Old method (DELETE) | Replaced by |
|---|---|
| **Centre `SectionTabsSlider` for Displays-class tools** (Photos · Ticket · Pairing · Timeline · Linkage · Checklist) — *no tab strip in the middle of the display* | Displays **leaf** + `openDisplays(<leaf>)` (right-edge push) |
| Second open-state flags: `pairingOpen` · `togglePairing` · `PairingTogglePill` | the **selected Displays tab IS the open state** (`activeSideTab === 'linkage'`) |
| Advisory / "needs attention" centre strips: `WorkflowRecommendationsStrip` · `NeedsAttention` banners in the locked middle | a Displays leaf, or delete — **never** the centre work plane |
| Raised / floating soft dock as the floor: `slicedActionDockWrapperClass({docked:false})` · `TestingDockHost` · `UpNextActionDock` shell | flush `UnboxDockHost` two-band geometry *(fuller-port lane — see Phase 3)* |
| `OmnichannelComposerDock` / notes float as the dock shell | flush host (notes mode inside `UnboxDockHost`) |
| Centre `ProcedureDeck` / `UnboxProcedureDeck` as hero | dock ACTION + `railLeaf` cockpit *(fuller-port lane)* |
| `StationRightEdgeAction` "Open in unbox" mid-canvas jump | delete (operator acts from the dock / Displays) |

### Smell-grep (run per station; each hit is a delete candidate)

```bash
grep -nE 'SectionTabsSlider|WorkflowRecommendationsStrip|NeedsAttention|OmnichannelComposerDock|slicedActionDockWrapperClass|pairingOpen|togglePairing|PairingTogglePill|StationRightEdgeAction|UnboxProcedureDeck' \
  src/components/<station-panel>.tsx
```

### Grounded state (2026-08-10) — what's already deleted vs what remains

| Station | Centre `SectionTabsSlider` | 2nd open-flag | Raised dock | Advisory / edge-jump |
|---|---|---|---|---|
| Unbox / Arrival | **gone ✓** (guarded) | gone ✓ | flush `UnboxDockHost` ✓ | gone ✓ |
| **Testing** | **gone ✓** — pinned by `arrival-displays-push` → *"centre has no SectionTabsSlider"* | gone ✓ | **raised `TestingDockHost` + `slicedActionDockWrapperClass`** (fuller-port lane) | none |
| Shipping | verify its `tabs` composer (`ShippingScanWorkspace`) | — | `UpNextActionDock` preview | advisory banners (scorecard) |
| Pack / Repair | clean | clean | Pack terminal-exempt | — |

**So for the flagship (Testing) the centre `SectionTabsSlider` is already deleted
— the job there is "verify + never regress it," not "delete it now."** The
delete-it-now step bites when someone ports a station that still has a centre tab
strip; the recipe must run either way. Testing's one remaining removal is the
**raised dock**, which belongs to the fuller port (Phase 3), not the floor slice.

### The guard FLIP (every removal)

Each station guard moves from **pinning the fork** (*"Testing mounts
DisplaysPushStack; centre has no SectionTabsSlider"*) to **pinning the Unbox
grammar** (*"centre is ops-flow only; reference tools are Displays leaves; the
floor is `StationDisplaysActionFloor`"*). **Baselines only shrink** — finishing a
removal deletes a line; nothing adds one.

---

## Phase 0 — Prep & lane

1. **Take a worktree lane.** `main` is currently RED from a concurrent
   `unit-pack-placement` session (`ShippingScanBand.tsx` imports a not-yet-created
   `@/lib/queries/unit-pack-placement-queries`; knip + tsc fail on it). That
   session is churning **Pack/Shipping** — the exact Phase 2 stations. Testing is
   receiving-side, out of their blast radius, but a lane keeps `npm run verify`
   attributable. The station golden files (`StationDisplaysActionFloor`,
   `UnboxDisplaysActionFloor`, `ArrivalDisplaysActionFloor`,
   `station-displays-carton-floor.ts`) are **untracked-new** — a worktree from
   `HEAD` would strand the port without them, so branch from the working tree
   or receive/commit those first.
2. **Confirm the shared waist** compiles in isolation (Arrival guard is green:
   `npx tsx --test src/components/receiving/triage/arrival-displays-push.guard.test.ts`).

---

## Phase 1 — Testing (the direct carton-grain port) ★ FLAGSHIP, executable

Testing (`src/components/tech/TestingPanel.tsx`) is a **receiving-carton** station
(`row.receiving_id`, `patchReceivingRailTicketByCarton`), already mounts
`StationDisplaysPushStack` with `buildTestingDisplayTabs`, and takes a single-arg
`openDisplays(tab: TestingDisplayTab)` — the same shape Arrival has. So the carton
delete grain and the shared shell all apply.

**But the controller diverges** — Testing uses `useTestingLineController`, NOT
`useUnboxLineController`. Verified surface:
- ✓ `c.isUnfound` (via `shouldUseLocalReceiveOnly`) → the `⋯ Resolve` signal exists.
- ✗ **no** `refreshInventoryDossier` / `inventoryRefreshing` → **Sync peer drops** (Testing is QC, not an inventory-dossier surface).
- Print lives in the Testing **dock** (`TestingDockHost`: works-as-listed · notes · Pass · Print) — the floor's Print must wire to Testing's print handler (locate it; it is not a bare `c.runPrintLabel` on this controller).

### 1a. Verb set (RECOMMENDED — differs from both siblings)

`⋯ More (Resolve, unfound) · Print · Edit (→ linkage) · 🗑 Delete carton` = **4 peers**.
- **Sync DROPS** vs Unbox's 5 (no inventory dossier on Testing).
- **Print STAYS** vs Arrival's 4 (Testing has a printable label; Arrival did not).
- Net: same count as Arrival, different middle peer.

### 1b. The port (ordered)

**Step 0 — REMOVE first (run §2).** Smell-grep `TestingPanel.tsx`. Result today:
the centre `SectionTabsSlider` is **already deleted** (keep it that way — the
`arrival-displays-push` Phase E guard pins *"centre has no SectionTabsSlider —
reference tools live on Displays"*; do **not** regress it, and do **not** add the
floor beside a resurrected centre tab strip). No `pairingOpen`/`togglePairing`
flags, no advisory strip, no `StationRightEdgeAction` — all clean. The one
surviving old method is the **raised `TestingDockHost` + `slicedActionDockWrapperClass`**,
which is the fuller-port lane (Phase 3), **not** this floor slice — the floor
hangs on the Displays push independent of the dock. Only after Step 0 is clean:

1. **Create `src/components/tech/testing-panel/TestingDisplaysActionFloor.tsx`** —
   thin, mirroring `ArrivalDisplaysActionFloor` (which itself mirrors Unbox). Props:
   `receivingId`, `isUnfound`, `openDisplays`, `onDeleted`, `editSelected`,
   `canPrint`, `runPrintLabel`. **Omit** `onInventorySync`/`inventorySyncing`/`canInventorySync`.
   Delete copies Unbox's `handleDelete` **verbatim** (`DELETE /api/receiving-logs`
   + `removeReceivingRailByCarton` + `receiving-lines-table` invalidate +
   `emitReceiving('receiving-entry-deleted')`).
2. **Testids:** `testing-displays-floor-{more,primary,edit,delete}` (`-primary` = Print here).
3. **Wire into `TestingPanel.tsx`** — add `actionFloor={<TestingDisplaysActionFloor …/>}`
   to the `StationDisplaysPushStack` (~line 470). Pass:
   - `receivingId={row.receiving_id}`
   - `isUnfound={c.isUnfound}` (or `shouldUseLocalReceiveOnly(row)` for parity with the controller)
   - `openDisplays={openDisplays}`
   - `onDeleted={closeDisplays}`
   - `editSelected={activeSideTab === 'linkage'}`
   - `canPrint` / `runPrintLabel` → Testing's print path (see 1a).
4. **Guard** (§Guards).
5. **Verify** (§Acceptance).

### 1c. Open decisions (confirm before/while porting)

- **Print wiring** — confirm the Testing print handler (`TestingDockHost` / terminal
  VM). If Print cannot be cleanly reached from the floor without threading a new
  prop, thread it from `TestingPanel` (where the dock's print already lives) rather
  than reaching into the dock from the floor.
- **Edit target** — Testing has **both** `pairing` (SKU pairing) and `linkage`.
  Recommended `Edit → openDisplays('linkage')` (direct Unbox analog); `editSelected`
  underlines while linkage is open. Alternative: `pairing`. Pick one; don't wire both.
- **Delete carton at Testing is NEW capability** (same call Arrival faced). It
  matches Unbox/Arrival/Incoming/History and is the natural far-right peer, but
  confirm deleting a carton from the QC bench is wanted. If not, drop the delete
  peer → `⋯ · Print · Edit` (a floor with no delete still renders — it's carton
  macro, not a delete bar).
- **`⋯` when never-unfound** — if a Testing carton is rarely/never unfound, `⋯` is
  disabled (empty overflow). Acceptable (mirrors Unbox-when-matched); don't invent a filler verb.

---

## Phase 2 — Order / ticket stations (Pack · Shipping · Support-orders · Repair) — GATE, not a copy

These mount a Displays push (for Photos · Timeline · Listings reference) but their
open record is an **order** (`activeOrder.orderId`) or a **ticket** (`RS-####`),
so the carton floor's routes do not exist:

| Carton verb | Order/ticket equivalent | Reality |
|---|---|---|
| `DELETE /api/receiving-logs` | delete an order? | You don't delete an order from a pack/ship bench — different verbs (cancel / unassign), different routes, likely **absent** |
| Zoho inventory dossier `Sync` | marketplace order sync | different capability facade — not this floor's `refreshInventoryDossier` |
| carton `Edit → linkage` | order pairing | different surface |
| `Print` (carton sticker) | postage / shipping label | different print (Postage stays on `/shipping/labels`) |

**Do the design question FIRST, and it is Ask-first (product decision):**

1. **Do these stations even need a Displays Macro floor?** An order's record
   actions (assign · urgent · notes · ship · delete) already live on the **desk
   order inspector** bottom dock (`OrderUpdateDock` / `InspectorActionFloor` —
   `right-rail-inspector.md`). A station Displays Macro floor for an order may be
   **redundant** with that. The honest default answer is likely **"no floor"** for
   Pack/Shipping/Support-orders; Repair may want a thin ticket floor.
2. **If yes:** reuse **only the shell** (`StationDisplaysActionFloor` +
   `FLUSH_TERMINAL_SPREAD_*` + `InspectorFlushDelete`) with a **NEW verb set** and
   **NEW descriptors** (do NOT reuse `station-displays-carton-floor.ts`; it's
   carton-grained). Decide the delete grain explicitly (probably none).
3. **Never** put the carton floor (or `receiving-logs` delete) on an order/ticket station.

Escalate this phase before building — it changes what an order station's right
edge means, and the concurrent `unit-pack-placement` session is already reshaping
Pack/Shipping.

---

## Phase 3 — The bigger picture (the floor is ONE row of the full station port)

The action floor is a single row of the 6-row port scorecard in
`.claude/rules/display/station-port-from-unbox.md` (identity · centre · dock ·
right-edge · procedure · guards). Testing's **fuller** port is a separate,
larger lane and is **not** folded into the Phase 1 slice:

- Testing's dock is still a **raised `TestingDockHost`** (not flush `UnboxDockHost` geometry).
- Testing has no procedure derivation / `railLeaf` cockpit yet (`scan-cockpit.md`).

Phase 1 (the floor) is deliberately **dock-independent** — it hangs on the
Displays push and ships on its own, exactly as Arrival did. When someone takes
Testing's fuller port, they flush the dock → add the derivation + `railLeaf`
cockpit → and `testing-qc-dock.guard` flips from pinning-the-fork to
pinning-Unbox. Track that under `station-port-from-unbox.md` + `docs/todo/station-workbench-port-FOLLOWUPS.md`, not here.

**Guardrails (all phases):** **remove the old methods FIRST (§2 — delete, don't
add beside)** · one station at a time · verb-set + delete-grain decision per
station · share the method / fork the host (C2) · flip each guard from
pinning-the-fork to pinning-the-Unbox-grammar · **baselines only shrink**.

---

## Guards

- **Phase 1:** extend the existing **"Phase E — Testing Displays push"** describe in
  `src/components/receiving/triage/arrival-displays-push.guard.test.ts` (that's
  where Testing's Displays push is already pinned), OR add
  `src/components/tech/testing-panel/testing-displays-action-floor.guard.test.ts`.
  Assert: `TestingPanel` passes `actionFloor={<TestingDisplaysActionFloor …/>}`;
  the floor composes `StationDisplaysActionFloor` + `IconButton size="fill"` +
  `InspectorFlushDelete`; verb order More → Print → Edit → far-right Delete;
  **no Sync peer** (Testing has no inventory dossier); C2 — **no** import of
  `InspectorActionFloor`/`FloorIconButton`/`FloorOverflowButton`; no `size="touch"`,
  no `w-11`. (Mirror `arrival-displays-push.guard.test.ts` → "Arrival Displays
  carton Macro floor".)
- `station-displays-action-floor.guard.test.ts` already pins the spread golden for
  the shared shell — no change unless you broaden its consumer list.
- Baselines only shrink; never raise one to land this.

## Acceptance (per station)

- [ ] **Old methods DELETED first** — §2 smell-grep is clean (no centre `SectionTabsSlider` for Displays tools, no second open-flag, no advisory strip / edge-jump); the guard **pins the Unbox grammar**, not the fork. Any surviving site is guard-named and shrink-only.
- [ ] Displays column shows an `h-11` icon row **above** the `→|`/Filter close chrome.
- [ ] Row = the station's verb set, equal fill-width columns, delete far-right, no dead air.
- [ ] Delete removes the carton + refreshes rail/grid; Edit opens linkage with `selected` underline; `⋯` disabled unless unfound.
- [ ] No desk `InspectorActionFloor`/`FloorIconButton` import in the station (C2 guard).
- [ ] `npm run verify` green **for your files** (report pre-existing concurrent-tree reds separately); floor guard + `station-displays-action-floor` guard green.
- [ ] A Playwright smoke on the **QA org** (`pnpm provision:qa-org` → `--project=qa-desktop`) opening that station's Displays. (Live browser smoke on `main` is auth-walled + blocked by the concurrent breakage until the tree is green.)

## Traps

- **Half-port (both doors imported)** — adding the floor / Displays leaf while a centre `SectionTabsSlider` (or any §2 old method) still mounts. knip won't catch it (both are "used"); a guard must. Delete the old path FIRST.
- **A prose-only retirement** — "we use Displays now" in a comment is not a deletion. Remove the code or shrink-list the exact surviving site.
- **`IconButton size="fill"`**, never `size="touch"` + `justify-between` — the hit target IS the column.
- **Floor returns `null` when empty** — never force an empty bar.
- **Delete grain is the carton** (`/api/receiving-logs`) — carton-grain stations only; never on an order/ticket station.
- **Do not reuse `station-displays-carton-floor.ts` on an order/ticket floor** — it's carton-grained.
- **Do not re-label the dock terminal** from a Displays click (cross-region action-at-a-distance).
- **Testing controller ≠ Unbox controller** — no `refreshInventoryDossier`; don't assume Unbox's prop surface.

---

## Per-phase agent checklist (copy into the PR)

```markdown
### Station Displays action floor port — <station>
- [ ] Grain confirmed CARTON (has receiving_id + /api/receiving-logs) — else STOP (Phase 2 gate)
- [ ] Worktree lane taken (main is red from concurrent unit-pack-placement)
- [ ] REMOVE FIRST (§2): smell-grep run; old methods DELETED (centre SectionTabsSlider for Displays tools / advisory strip / 2nd open-flag / Open-in-unbox jump) — NOT added beside
- [ ] Guard FLIPPED pinning-the-fork → pinning-the-Unbox-grammar (baseline shrank, never grew); any surviving site guard-named + shrink-only
- [ ] <Station>DisplaysActionFloor.tsx created (mirrors Unbox/Arrival; verb set decided)
- [ ] Wired actionFloor into <Station>Panel's StationDisplaysPushStack
- [ ] Verb-set decisions recorded (Sync? Print? Edit target? Delete? — with reasons)
- [ ] Guard added/extended; asserts C2 (no desk peers) + order + no-dead-air
- [ ] Delete copies Unbox handleDelete verbatim (rail mirror + invalidate + emitReceiving)
- [ ] Guard tests green; tsc clean for touched files
- [ ] npm run verify — pre-existing/concurrent reds reported separately from mine
- [ ] Playwright smoke on QA org opening the station's Displays (or deferred w/ reason)
```

---

## Collision note (shared main tree, 2026-08-10)

`main` is RED from a concurrent `unit-pack-placement` session:
`ShippingScanBand.tsx` → unresolved `@/lib/queries/unit-pack-placement-queries`
(tsc + knip); `UnboxDockScanEntry.tsx` → `AuthSessionUser.id`;
`workbench-chrome-cube-menu.tsx` / `unit-pack-placement.ts` (knip). Those are
**Pack/Shipping-side** — the Phase 2 stations. Two reasons to start with
**Testing**: it's the only grain-compatible target, and it sidesteps the live
collision. Take a worktree lane; the station golden floor files are untracked-new,
so branch from the working tree (not `HEAD`) or they'll be missing.
