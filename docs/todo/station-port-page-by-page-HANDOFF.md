# Station port — PAGE BY PAGE, Arrival first (HANDOFF)

**Status:** OPEN — ready to execute (Page 1 = Arrival audit).
**Date:** 2026-08-10
**Goal (verbatim use case):** *start with the Arrival station and port the Unbox
golden **one page at a time — not all pages at once** — ensuring each page is
DONE RIGHT (all layers, verified) before advancing to the next.*

This **supersedes the slice-across-stations framing.** The prior action-floor
handoff (`station-displays-action-floor-PORTS-HANDOFF.md`) ported ONE layer (the
right-edge Displays floor) across Arrival + Testing. That was a useful slice, but
the correct method for the *rest* of the port is the opposite axis: **complete
one whole station page, verify it, THEN move to the next.**

Playbook this operationalizes: `.claude/rules/display/station-port-from-unbox.md`
(identify → remove → compose). Cockpit: `display/scan-cockpit.md`. Golden:
`display/unbox-station.md`.

---

## 0. The rule: ONE PAGE, fully done, before the next

A **page** = one station's right-pane surface (Arrival · Testing · Pack ·
Shipping · Review). Porting a page means taking it through **all six layers**
(below) — not slicing one layer across five pages.

**Why one-at-a-time is a law here, not a preference:**
- The house rule is explicit: *"Never port N stations in one pass."* The expensive
  miss it was written from (2026-08-09, Orders + Receiving custom fields in one
  wave → Orders reverted) is the exact failure mode.
- **Each page is certified by its own guard flip** (pin-the-fork → pin-Unbox). You
  cannot flip five guards honestly in one pass — and `knip` can't see a fork whose
  doors are both imported, so **only a per-page guard proves the old path is gone**.
- **Dogfood one bench, operator-verify, then propagate.** A page shipped without a
  bench check is a latent regression on a live warehouse surface.

**Hard gate:** you may not open Page N+1 until Page N's **Definition of Done**
(§1) is fully green **and** operator/QA-smoke verified. No partial pages, no
parallel pages.

---

## 1. Per-page DEFINITION OF DONE (the gate — every row, or the page isn't done)

Run **in this order** per page. This IS "done right."

| # | Layer | Done means |
|---|---|---|
| **R** | **REMOVE first** | §2 smell-grep clean: **no centre `SectionTabsSlider`** for Displays-class tools, no second open-flag (`pairingOpen`/`togglePairing`), no advisory strip / `StationRightEdgeAction` in the locked middle, no raised soft-dock / Omnichannel float as the floor. Old path **DELETED** (or a guard names the exact surviving site, shrink-only). |
| **1** | **Identity** | `StationContextBar placement="flow"` + entity adapter above `StationWorkbench`; `reserveIdentityClearance={false}`; `bodyGap="none"` (flush, zero air). |
| **2** | **Centre = ops-flow only** | that station's exact triage/I-O (lines / label / classify / verdict). Reference tools are **Displays leaves**, never a centre tab strip. |
| **3** | **Dock** | flush `UnboxDockHost` two-band geometry (Band-1 ACTION XOR terminal on settle; Band-2 pager + progress). No raised `Panel`, no Omnichannel-as-floor. *(Terminal-exempt stations declare it — Pack.)* |
| **4** | **Right edge = Displays** | `StationDisplaysPushStack` (index→leaf) for KNOW/browse; carton Macro via `StationDisplaysActionFloor` where the grain fits. Never `RightRailHost` for station tools; never desk `InspectorActionFloor`. |
| **5** | **Procedure** (if derived) | ONE derivation hook → step ACTION (dock) + `railLeaf` (cockpit), either-or guarded; cockpit auto-follow yields to close/browse. *(Door/staging benches with no derived capture procedure declare that — Arrival.)* |
| **6** | **Guards FLIPPED + verify** | station guards assert the **Unbox grammar**, not the fork; family baselines **shrank, never grew**; `npm run verify` green **for your files** (concurrent reds reported separately); a Playwright smoke on the **QA org** opening the page. |

**Do NOT check a row you did not verify.** A prose "we use Displays now" is not
row R. A green guard that still pins the fork is not row 6.

---

## 2. The removal half (row R, expanded) — delete BEFORE composing

Per pattern-evolution **Always #6**: a retirement isn't done until the old path is
DELETED or a guard names the exact surviving sites, shrink-only. **`knip` can't
see a fork whose doors are both imported — only a guard can.**

| Old method (DELETE) | Replaced by |
|---|---|
| **Centre `SectionTabsSlider` for Displays tools** (Photos · Ticket · Pairing · Timeline · Linkage · Checklist) — *no tab strip in the middle of the display* | Displays **leaf** + `openDisplays(<leaf>)` |
| `pairingOpen` · `togglePairing` · `PairingTogglePill` | the **selected Displays tab IS the open state** |
| `WorkflowRecommendationsStrip` · `NeedsAttention` centre strips | a Displays leaf, or delete — never the work plane |
| `slicedActionDockWrapperClass({docked:false})` · `TestingDockHost` · `UpNextActionDock` as the floor | flush `UnboxDockHost` |
| `OmnichannelComposerDock` float as the dock | flush host (notes mode inside `UnboxDockHost`) |
| centre `ProcedureDeck`/`UnboxProcedureDeck` hero · `StationRightEdgeAction` "Open in unbox" jump | dock ACTION + `railLeaf` cockpit · delete |

```bash
grep -nE 'SectionTabsSlider|WorkflowRecommendationsStrip|NeedsAttention|OmnichannelComposerDock|slicedActionDockWrapperClass|pairingOpen|togglePairing|PairingTogglePill|StationRightEdgeAction|UnboxProcedureDeck' \
  src/components/<station-panel>.tsx
```

---

## 3. The page order (start Arrival) — scope each page WHEN you reach it

The grounded "remaining" below is a **starting map**, not a spec to batch. Re-run
the §2 smell-grep at the top of each page — state drifts under concurrent work.

| Page | Station | Panel | Grounded state (2026-08-10) | This page's job |
|---|---|---|---|---|
| **1** | **Arrival** | `TriagePanel` | All 6 layers present (flow identity · door-flow centre · flush `UnboxDockHost` + `ArrivalDockScanEntry` waist · Displays push + `ArrivalDisplaysActionFloor` · no centre tab strip) | **AUDIT & CERTIFY** — verify, close residual, bless as the reference |
| **2** | **Testing** | `TestingPanel` | Centre clean (no `SectionTabsSlider`) · Displays push + floor **done** (2026-08-10) · **raised `TestingDockHost` + `slicedActionDockWrapperClass`** · no derivation/cockpit | **COMPLETE** — flush the dock; add procedure derivation + `railLeaf` cockpit |
| **3** | **Pack** | `PackOrderPanel` | **order grain** · terminal-exempt · centre papers/rollup debt (scorecard) | centre chrome only; Displays floor = grain gate (likely none) |
| **4** | **Shipping** | `ActiveOrderWorkspace` | **order grain** · `UpNextActionDock` preview · advisory banners · Pack centre (no tab strip) · Units on Displays | strip advisory; remaining layers (dock flush / procedure if earned) |
| **5** | **Review / Labels** | `ReviewPacking*` / `LabelsOrderWorkspace` | Labels = centre tabs **by design** (no Displays push) | registry / hand-VM slice only — **do NOT force Displays on Labels** |

**Order rationale:** Arrival is the most-complete → certify it as the reference
first (cheap, high-confidence). Testing is next-closest (floor done, one dock +
cockpit gap). Pack/Shipping are order-grain (different, and under concurrent
`unit-pack-placement` churn — do them after their tree settles). Review/Labels
are registry-only.

---

## 4. PAGE 1 — Arrival: AUDIT & CERTIFY (execute now)

Arrival has ~no remaining build work; its role is to be the **verified reference**
every later page is measured against. Do the audit rigorously — a wrong reference
propagates.

**Audit checklist (verify each against `TriagePanel.tsx`):**
- [ ] **R** — smell-grep clean (centre `SectionTabsSlider` absent in code, not just comments; no `pairingOpen`/advisory/`StationRightEdgeAction`). Confirmed 2026-08-10; re-confirm.
- [ ] **1** — `placement="flow"` + `reserveIdentityClearance={false}` + `bodyGap="none"` (lines ~382/408/410).
- [ ] **2** — centre = `DISPLAYS_FLUSH_HOST` door-flow (`POUnboxingSection` items no-units-chrome + `TriageClassifySection`); no advisory in the middle.
- [ ] **3** — flush `UnboxDockHost` + `data-arrival-dogfood-terminal` Save-for-unbox + `ArrivalStagingDockControl` Band-1 ACTION. **Confirm the newly-added `ArrivalDockScanEntry`** is wired as the Band-1 compact `w-8` scan waist (Unbox `UnboxDockScanEntry` parity — always-left, no placeholder), not a regression.
- [ ] **4** — `StationDisplaysPushStack` (Pairing-only) + `ArrivalDisplaysActionFloor` (⋯ Sync Edit Delete) above the close chrome.
- [ ] **5** — Arrival is a **door/staging** bench (no derived capture procedure) — declare that; Staging is the Band-1 ACTION, not a cockpit. This is a legitimate "no procedure layer," not a gap.
- [ ] **6** — Arrival guards pin the Unbox grammar (`arrival-displays-push` · `triage-classify-section` · `classify-no-dual-unmatched` · `triage-workspace-sheet`); `npm run verify` green; QA-org smoke opens an Arrival carton + its Displays + the floor.

**Output of Page 1:** Arrival certified. Update the `station-port-from-unbox.md`
scorecard row (delete any stale "advisory/Omnichannel remains" claim — it's out).
**Only then open Page 2.**

---

## 5. PAGE 2 — Testing: COMPLETE the port (after Page 1 certifies)

Floor shipped 2026-08-10 (`TestingDisplaysActionFloor`, verify green). Remaining
for a full page:
- **Row 3 (dock):** DELETE the raised `TestingDockHost` + `slicedActionDockWrapperClass({docked:false})` → compose flush `UnboxDockHost` geometry. Flip `testing-qc-dock.guard` from pinning-the-raised-dock to pinning-Unbox-flush.
- **Row 5 (procedure):** add a Testing procedure derivation hook (step ACTION + `railLeaf`), either-or guarded, per `scan-cockpit.md`. Testing exposes `isUnfound`; its QC steps (works-as-listed → serial → grade → Pass·Print) are the vocabulary.
- Rows R/1/2/4 already pass — verify, don't rebuild.
- **Gate before Page 3:** the full DoD (§1), verify green, QA smoke.

*(Scope Pages 3–5 when you reach them — re-run the smell-grep; the order-grain
Displays-floor question for Pack/Shipping is the Phase-2 GATE in the action-floor
handoff, likely "no floor — it's the desk order inspector's job.")*

---

## Per-page PR checklist (copy in)

```markdown
### Station port — PAGE: <station>
- [ ] This is the ONLY page in flight (prior page certified + smoke-verified)
- [ ] Row R — smell-grep clean; old methods DELETED (not added beside); guard names any surviving site (shrink-only)
- [ ] Row 1 — flow identity (placement=flow · reserveIdentityClearance={false} · bodyGap=none)
- [ ] Row 2 — centre ops-flow only (no centre SectionTabsSlider / advisory)
- [ ] Row 3 — flush UnboxDockHost (or terminal-exempt, declared)
- [ ] Row 4 — StationDisplaysPushStack (+ floor where grain fits); no RightRailHost/desk InspectorActionFloor
- [ ] Row 5 — one derivation → ACTION + railLeaf (or "no derived procedure", declared)
- [ ] Row 6 — guards FLIPPED to pin-Unbox; baselines shrank; npm run verify green (concurrent reds separate); QA-org smoke
- [ ] Scorecard row updated (station-port-from-unbox.md); stale claims deleted
```

---

## Collision note (2026-08-10)

`main` was red earlier today from a concurrent `unit-pack-placement` session
(Pack/Shipping-side); it has since landed (tsc + knip clean, `npm run verify`
green). **Pages 3–4 (Pack/Shipping) touch that session's surface** — re-check the
tree is settled before starting them. Pages 1–2 (Arrival/Testing) are
receiving-side, out of that blast radius. Build in-place on `main` (the
dogfood/integration lane) — a true `git worktree` can't see the uncommitted
action-floor shared waist (`StationDisplaysActionFloor` et al. are untracked in
main), so a worktree from `HEAD` strands the port.

## References

- `.claude/rules/display/station-port-from-unbox.md` — identify → remove → compose · per-station scorecard · smell-greps
- `.claude/rules/display/unbox-station.md` — the golden (all 6 layers)
- `.claude/rules/display/scan-cockpit.md` — the DO/KNOW split (row 5)
- `docs/todo/station-displays-action-floor-PORTS-HANDOFF.md` — the right-edge floor layer (row 4) + the order/ticket-grain GATE
