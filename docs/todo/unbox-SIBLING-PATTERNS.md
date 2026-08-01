# Sibling patterns — where the Unbox lanes' logic applies elsewhere

**Date:** 2026-07-31 · `main` @ `1c226847d`
**Method:** scanned for each structural defect the lanes fix, then counted real call sites. Counts are from grep over `src/`; every claim below is verifiable by re-running the command in its section.

The lanes fix five structural patterns. Each has siblings. Ordered by **ROI = (call sites × user-visible harm) ÷ risk**.

---

## P1 — Motion presets consumed raw, bypassing the reduced-motion bridge

**23 files** import `framerPresence.*` / `framerTransition.*` without `useMotionPresence` / `useMotionTransition`.

```bash
for f in $(grep -rl "framerPresence\.\|framerTransition\." src --include="*.tsx"); do
  grep -q "useMotionPresence\|useMotionTransition" "$f" || echo "$f"; done
```

`CommandBar` · `FbaShippedTable` · `FbaQtySplitPopover` · `FbaTrackingBucket` · `FbaTrackingBundleCard` · `FbaWorkspaceScanField` · `ActiveShipmentCard` · `UniversalScan` · `EmailTriagePanel` · `InventoryFulfillmentSyncDialog` · `ShippedPanelEditorDock` · `OrderSyncDialog` · `connections-panel-pieces` · `ShippingCapturedUnits` · `ShippingSkuSerialRows` · `CollapsibleGroupRow` · `HorizontalButtonSlider` · `AnimatedStat` · `OverlaySearch` · `Skeletons` · `ChevronToggle` · `ExpandableSection` · `StaggerReveal`

**Why it matters:** `display/motion-crossfade.md` already flags this as an open gap, and `.claude/rules/display/station.md` §9 calls it a **WCAG 2.3.3 regression** — a reduced-motion user still gets the `y`-slide. `station-motion-bridge.guard.test.ts` pins only a 7-file allowlist today.

**Corrected 2026-07-31 — the "six DS primitives" claim above was wrong.** The original scan used `grep -rl` on the preset names, which also matches **doc comments**, and it did not check consumer counts. Verified per file:

| Primitive | Consumers | Real bridge defect? | Action |
|---|---|---|---|
| `Skeletons` (`SkeletonList`) | **12** | **Yes** — spreads `framerPresence.tableRow` / `upNextRow` (both carry `y`) | **Fix — the only real fan-out** |
| `StaggerReveal` | 5 | **Yes, different shape** — authors variants inline with `motionBezier` + hardcoded durations, no reduce handling | Fix — hoist variants into `motion-framer.ts` |
| `ChevronToggle` | 1 | **Yes** — raw `framerTransition.upNextChevron` | Fix — trivial |
| `ExpandableSection` | **0** | Moot | **Delete** — barrel-exported only, no call sites |
| `AnimatedStat` | 8 | **No — already compliant.** `useReducedMotion()` early-returns a static number (`:57-68`) | Leave alone |
| `OverlaySearch` | — | **No** — the `:31` hit was a stale doc comment; no import. Inline `{duration}` literals, **opacity-only so reduce-safe by construction** | Optional tidy |

So it is **three fixes plus one deletion**, not six fixes, and only `Skeletons` fans out meaningfully. The work is still worth doing first — it is cheap and mechanical — but it is smaller than originally stated. Plan: [`unbox-F-motion-bridge-PLAN.md`](./unbox-F-motion-bridge-PLAN.md).

**Mechanism:** migrate a file, then add it to `REQUIRED_BOTH` in `station-motion-bridge.guard.test.ts`. The list only grows; it becomes a ratchet. The rules already say: *"Expand this list only after a file already complies."*

**Better end-state (from the crossfade doc's own gap note):** bake the reduce-to-opacity collapse **into the presets**, so consuming a preset is automatically safe and the bridge becomes redundant. Worth costing before migrating 23 files by hand.

---

## P2 — Tab strip inside the workbench body (Lane E's pattern)

**5 surfaces** mount `SectionTabsSlider` as station chrome:

| Surface | Line | Same defect as Unbox? |
|---|---|---|
| `PackerReviewMode` | `:344` | Yes — station tabs in the body |
| `SupportTicketFocus` | `:195` | Yes |
| `SupportOrdersWorkspace` | `:301` | Yes |
| `ListingLinksTab` | `:229` | **No** — nested sub-tabs inside one tab body; legitimate |
| `WorkspaceTimelineTab` | `:377` | **No** — Units/Tracking spine switcher; legitimate |

**Only the first three are candidates.** The last two are sub-navigation *within* a body, which is a different job — do not collapse them.

**Important:** `SectionTabsSlider` is **not deleted** by Lane E. It stays the SoT for legitimate sub-navigation. What Lane E removes is *station-level* tabs from the *scroll body*.

**Prerequisite:** each candidate needs a right-rail occupant to move into. Support has `SupportContextDetailPanel`; Packer Review does not obviously. **Verify a destination exists before scheduling** — Lane E's core finding is that the right slot is single-occupancy and a new occupant is a contract violation.

---

## P3 — Terminal CTA coupled to tab state (Lane E Step 1's pattern)

**4 stations** resolve their dock CTA from tab id:

| Surface | Line |
|---|---|
| `LineEditPanel` (Unbox) | `:414` |
| `TriagePanel` | `:269` |
| `TestingPanel` | `:356` |
| `UpNextActionDock` | `:62` |

The defect only *bites* when tabs and dock live in different regions — then selecting on the right silently changes the button at the bottom. So:

- **Unbox:** real, fixed by Lane E Step 1.
- **Triage / Testing / UpNext:** latent. Tabs and dock are co-located today, so the coupling is currently legible. **It becomes the same bug the moment they adopt Lane E.**

**Do not pre-emptively decouple all four.** Fix Unbox, then make decoupling a prerequisite in each station's own tab-move. Flagged here so it is not rediscovered three more times.

---

## P4 — Scan input + accumulating result list (CaptureStack candidates)

**17 surfaces** register a scan target. The subset that also accumulates results into a list is what `CaptureStack` is for:

- `UniversalScan` — **already uses the feed primitive** (`MobileFeed` + `ScanResultRow`). Free rename at Lane 1.
- `StationPacking` · `ScanOutStationBar` · `LabelsScanBand` · `StationFbaInput` · `DataWipeStation` · `rma/disposition` — scan + results, each with its own list rendering.

**This is the migration the operator's "all stations migrate" decision commits to.** Sequence it after Unbox proves the model on the floor — not before. Each adoption is a station-scoped port, not a big-bang.

**Watch:** `StationPacking` hand-rolls its keyed-card crossfade inline with **no reduced-motion handling at all** (documented in `display/motion-crossfade.md`). It is on both this list and P1 — fix the motion first, it is cheaper and independent.

---

## P5 — Per-entity right-rail ids (empty-slot on record→record navigation)

`source-of-truth.md` → Right-rail modality: *"A queue-processing inspector registers a STABLE occupant id … so record→record navigation swaps content in place instead of playing exit-then-enter with an empty slot between."*

`ReceivingDetailsStack` gets this right (`detail:receiving`, `:187`, with the reason in-comment). **Six registrars use per-entity ids:**

| Registrar | Id | Candidate? |
|---|---|---|
| `UnfoundQueueDetailsPanel:54` | `detail:claim:${row.source_id}` | **Likely** — queue surface, row→row clicking |
| `FbaBoardDetailPanel:36` | `detail:plan:${item.fnsku}` | **Likely** — board surface, card→card clicking |
| `RepairDetailsPanel:55` | `detail:claim:${repair.id}` | **Likely** — has nav-shaped code |
| `SkuDetailView:27` | `detail:sku:${sku}` | Unlikely — usually a single deep-link |
| `SupportContextDetailPanel:29` | `detail:support-context:${ticketId}` | Unlikely |
| `TestingSidebarPanel:445,456` | `box:${id}` / `manifest:${ref}` | Unlikely — scan-driven, not queue-walked |

**Do not bulk-convert.** The rule states hard preconditions: the panel must **fully re-seed** on record change, **any dirty draft must flush for the outgoing record first**, and **navigating without editing must write nothing** — guarded by a test. `LineEditPanel` deliberately does *not* meet these, which is why Unbox keeps its remount.

**Per-surface investigation, not a sweep.** Verify the operator actually walks records there, then verify the three preconditions, then convert.

---

## Recommended order

1. **P1, the six DS primitives** — one fix each, fans out to every consumer, zero design risk.
2. **P1, the remaining 17** — ratchet into the guard as you go.
3. **P5 investigation** (not conversion) — cheap to determine, tells you whether it is real.
4. **Unbox lanes A/C → E → B** — the proving ground.
5. **P4 station migrations** — only after Unbox proves the model on the floor.
6. **P2/P3 per station** — each tab-move carries its own CTA decoupling as a prerequisite.

**Do not open P2–P5 before Unbox ships.** They are the same bets on unproven ground; the point of piloting on one station is to be wrong once instead of nine times.
