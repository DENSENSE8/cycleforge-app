# History desk inspector — action floor + keybind discoverability (PLAN + deliverable)

**Status:** Phases 0–2 SHIPPED (Delete floor · actions→dock · slim identity · table Export) · Phase 3 PLANNED
**Date:** 2026-08-09
**Surface:** Unbox History tab → `HistoryCartonTriagePanel` (`detail:history`) + the receiving-lines data table.
**Companion research:** `docs/todo/history-inspector-ds-and-table-actions-GEMINI-RESEARCH-BRIEFING.md` (verb altitude map, H1–H5 scoring → **H3 winner**).

This is the actionable plan that turns that research + the operator's added guidance
(keybind discoverability, sticky-floor CTA placement) into shippable phases. It records
what already landed, what is next, and the two places the operator's guidance **diverges
from the house SoT** — flagged for a decision rather than silently resolved.

---

## Phase 0 — Delete carton (SHIPPED 2026-08-09)

The History inspector was the **outlier**: Orders (`OrderUpdateDock`), Incoming
(`IncomingDetailsPanel`), Bin, SKU and Repair peeks all mount a sticky
`InspectorActionFloor` + `InspectorFlushDelete`; History had topics but no floor and no
delete. Closed:

- `HistoryCartonTriagePanel.tsx` now mounts `InspectorActionFloor` with a flush trailing
  `InspectorFlushDelete` **only when exactly one carton is selected** (`!viewOnly && target`).
  The View-only shell (n=0) never mounts it.
- **Grain = whole carton**: `DELETE /api/receiving-logs?id=<receivingId>` (permission
  `receiving.mark_received`). This is the counterpart to the Band-1 **Add** flow, so
  "add an unfound tracking number → delete" is a closed loop.
- **Refresh**: rail cache mirror (`removeReceivingRailByCarton`) + invalidate
  `['receiving-lines-table']` (the History grid re-seeds `localRows` from it) + the shared
  `receiving-entry-deleted` event. Throws on failure so the panel stays open; closes on success.
- **Guard**: `HistoryCartonTriagePanel.tsx` added to `DESK_FLOOR_CONSUMERS` in
  `inspector-action-floor.guard.test.ts` so the floor can't silently regress.
- **E2E** (`tests/e2e/history-carton-delete.spec.ts`, QA org): an add→delete API round-trip
  (deterministic, self-contained) + a non-destructive UI smoke that the Delete control renders
  on the panel.

---

## Verb altitude map (History-class desk peek)

Condensed from the research briefing (industry-standard placements). **Shipped** rows are live;
the rest are the plan.

| Verb | Altitude | Visible when | Confirm | Status |
|---|---|---|---|---|
| Park / hide inspector | Top chrome (`DeskRailChromeRow` `→|`) | n=1 | — | shipped |
| ↑↓ prev/next queue row | Top chrome | n=1 | — | shipped |
| Open topic leaf / Back | Index shell | n=1 | — | shipped |
| Copy PO# / tracking / serial | Inline (leaf body chips) | n=1 | toast | shipped (`TrackingNumberMenuChip`, `OrderFactRow mono`) |
| Open in Unbox / station | Identity primary CTA / More | n=1 | — | shipped |
| Print label | **Sticky floor** (primary CTA when ready) | n=1 | toast | shipped (Phase 1 — moved off the identity band) |
| Edit notes / flag / pair PO | Leaf body / Open-in-Unbox | n=1 | inline | shipped (via Unbox) |
| **Delete carton** | **Sticky floor, flush trailing** | **n=1 only** | two-click arm | **shipped (Phase 0)** |
| Export view CSV | **Band-1 trailing (table toolbar)**, History-only, never the inspector | n=0/1/2+ | file | shipped (Phase 2 — `unbox-history-YYYY-MM-DD.csv`) |
| Share deep-link | Top chrome | n=1 | toast | planned (optional) |
| Column display ▦ / paint / compare / zoom | View topics cluster (table-proximal) | any | — | shipped (View cluster) |
| Bulk delete / assign | Multi-select bar / gutter | n≥2 | dialog | separate (not this peek) |

---

## Phase 1 — Sticky action floor: full CTA layout (SHIPPED 2026-08-09)

The operator's guidance (2026-08-09) and the briefing agree the floor is the right home. The
floor already existed (Phase 0); Phase 1 filled its safe side and slimmed the identity band.

- `HistoryCartonTriagePanel.tsx`: the primary CTA (`historyInspectorPrimaryAction` — Print ·
  Open/Continue/Match in Unbox) + More moved from the identity band into the floor `actions`
  cluster; the identity band is now a **slim key** (status pill + short PO/Carton, no icon hero,
  no CTA row). Delete stays flush-trailing. Top chrome row stays navigation-only.
- Guard `history-carton-triage.guard.test.ts` rewritten: asserts the floor docks below the topic
  shell, the primary CTA sits in the floor (not the identity band), and `PaneHeaderIconBadge` is
  gone. Prose SoT updated (`right-rail-inspector.md`, `source-of-truth.md`).

**Target layout** (sticky, anchored to panel bottom, survives scroll):

```
┌─ InspectorActionFloor (shrink-0, flush) ──────────────────────┐
│ [Delete] ……………………………… [ Print label ]  [ Edit / Open in Unbox ] │
│  trailing danger icon        safe primary cluster (dominant end)   │
└───────────────────────────────────────────────────────────────┘
```

- Move **Print label** and the **Open in Unbox / Edit** primary off the tall identity band into
  the floor's `actions` cluster (safe/dominant side), per "primary + safe actions grouped on the
  dominant side."
- Keep the tall identity band's slimming (research H3): drop the icon hero + large PO number;
  a caption-density key is enough (queue already shows context).

### ⚠ Divergence 1 — Delete side + confirm modality (DECISION NEEDED)

The operator's note says Delete should be **far-left, ghost/red-outline, with a secondary
confirmation dialog**. The **house SoT diverges** and Phase 0 followed the house:

| | Operator note | House SoT (`InspectorFlushDelete`, Orders golden) | Shipped |
|---|---|---|---|
| Side | far **left** | flush **trailing** (right), `border-l` hairline | trailing |
| Style | ghost / red outline | transparent icon, red ink | transparent icon |
| Confirm | secondary **dialog** | **two-click arm** (click → "click again", 3s window) | two-click arm |

Reasons Phase 0 kept the house form: (a) `inspector-action-floor.guard.test.ts` enforces
`bg-transparent` + `border-l` (trailing), (b) Orders/Incoming/Bin/SKU are all flush-trailing —
moving History left breaks sibling consistency (a hard rule), (c) the research briefing itself
placed Delete at the "flush **end**", and (d) two-click arm keeps the operator in-flow (a
dialog steals focus — a real cost on a hours-long triage bench).

**Both target-isolation goals still hold**: Delete is on the floor, far from the top-chrome
`→|` park icon, and armed before it fires. If the operator still wants far-left + a dialog, it
is a small change (swap `delete=` → a `leading=` slot + a `requestConfirm` dialog) — but it
would need a guard amendment and a sibling-consistency ruling. **Recommend: keep trailing
two-click arm.**

---

## Phase 2 — Export & Print at the right altitude (SHIPPED 2026-08-09)

- **Export (CSV)** → **Band-1 trailing (the table toolbar)**, History-tab-only, never the
  single-row inspector (briefing Q3). Landed as a pure builder mirroring the Orders export
  precedent:
  - `src/lib/receiving/history-export-csv.ts` — pure `buildReceivingHistoryExportCsv` +
    `receivingHistoryExportFilename` (RFC-4180 quoting, honest empty cells, warehouse civil-day
    filename). Unit-tested (`history-export-csv.test.ts`, 6 cases).
  - **Band-3 was NOT used** — it is guard-locked find-only (`band3-find-only.guard.test.ts`), so
    the "table toolbar" is Band-1 trailing (`WorkbenchTrailingCluster.actions`), where Add/Check
    live. An **Export** button there (History-only) fires `receiving-export-history`;
    `ReceivingLinesTable` (the surface that holds the rows in hand — kpi + week filtered) formats
    and downloads. Never a second query.
- **Print** → already the floor primary when the carton is ready (Phase 1). Row-level print stays
  in the row context menu (`ReceivingRowTriageContextMenu`).

**Not done — the briefing's "move ▦ / View tools to a table bar, remove the View cluster from the
inspector."** That fights a hard, guarded, recently-ruled house SoT (Band-3 find-only + inspector
View cluster, shared with To-ship; `band3-find-only.guard.test.ts` + `receiving-grid-sheet.guard.test.ts`).
Editing is on the bottom dock as asked; sheet-*layout* chrome stays on the inspector View cluster.
Moving it is a separate, ask-first architecture change (see Open decisions).

---

## Phase 3 status — mostly built by PARALLEL sessions (do not duplicate)

**2026-08-09:** Phase 3's keyboard subsystem is being built concurrently in other
local sessions. Verified in the working tree, so do NOT rebuild these:

- **Global `?` cheat sheet** — `src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx`
  (mounted app-wide in `Providers.tsx`, `?`-bound in capture phase, overlay-stack
  registered, wedge-safe via `isEditableKeyTarget`, rows sourced from the live nav
  registries + `getHotkey()`). `?` is OWNED — never bind a second listener.
- **Wedge-safe panel shortcuts** — the History inspector's own hotkeys already moved to
  the `⌥`+letter model (Enter = primary; `⌥1–4` = topics; `⌥`+letter = More). Single-key
  → modifier is the *hardcoded default* on scan-adjacent surfaces, so a per-staff "require
  modifier" toggle would be a dead control — not added.
- **Scan-hotkey store** — `src/lib/scan-hotkey/{store,useScanHotkey}.ts` (+ a new
  `next-scan-chord.guard.test.ts`) modified concurrently.

**What this session added (converged with the parallel work):** the **Keyboard settings
section** — the one thing the discoverability layer lacked, a Settings home for the one
remappable global key. `src/components/settings/sections/KeyboardSection.tsx` composes
`useScanHotkey` + `FOCUS_SCAN_HOTKEY_OPTIONS` (new SoT beside `FOCUS_SCAN_HOTKEY_RE` in
`staff-preferences.ts`) to remap the focus-scan key from presets, plus a shortcuts-reference
card (`?` · `⌘;` · `⌥` policy). The parallel session independently wired `page.tsx` +
`settings-sections.ts` to the same `KeyboardSection` path — they converged. tsc + lint green.

**Remaining / open:** full nav-key remap needs a central nav-target registry that does not
yet exist (the cheat sheet hand-aggregates four scattered `*_NAV_KEY` maps); a shared `<Kbd>`
primitive would de-dup `KeyCap`/`ShortcutList` across the two cheat sheets. Both are owned by
whoever finishes the parallel keyboard work — not this session.

---

## Phase 3 (original plan) — Keybind discoverability & editing (operator guidance, 2026-08-09)

The operator's progression, mapped onto house SoTs. High-velocity B2B (Linear / Superhuman)
teaches shortcuts in-flow rather than in a manual.

1. **Inline contextual badges (the "teacher").** Every actionable control shows its key in the
   hover tooltip / menu row (right-aligned `<kbd>`). *Already partly present:* the History More
   menu renders `item.shortcut` as a `<kbd>`; extend to the floor CTAs and Print. The key label
   must be **imported from the binder**, never re-typed (house law: a false shortcut hint is worse
   than no hint — see ⌘K / pin-hotkey owners).
2. **Global cheat sheet (`?`).** A semi-transparent modal listing shortcuts grouped by context
   (Queue nav · Carton actions · Global). Owner must register on the overlay stack
   (`src/lib/overlay-stack/store.ts`) so Escape closes it and it yields to inner overlays; single
   binder for `?` (same discipline as the ⌘K owner). Source the map from the same registry the
   handlers read so the sheet cannot drift from what actually fires.
3. **Action toasts ("the nudge").** When a control is clicked with the mouse, a toast nudges the
   shortcut ("Label queued. Tip: press P next time"). Use `@/lib/toast`; gate on a per-staff
   "shortcut nudges" preference so it fades once learned.
4. **Keybinds settings page (enablement + remap).** A dedicated settings surface
   (`staff_preferences`, via the Settings Registry framework) letting staff/managers:
   - **Toggle single-key shortcuts → require a modifier** (`Cmd/Alt+D` instead of bare `D`).
     This is the direct fix for the wedge-scanner hazard below.
   - **Remap** keys to fit hand position at each wedge station.
   The durable SoT is `staff_preferences`; the focus-scan hotkey already lives there
   (`DEFAULT_FOCUS_SCAN_HOTKEY`) — extend that pattern, don't fork a second store.

### ⚠ Divergence 2 — single-key shortcuts on a wedge-scanner bench (answers the operator's question)

**Operator's question: "are there hardware constraints (barcode scanners as keyboards) that
interfere with single-key shortcuts?"**

**Answer: yes, decisively — and it is already the reason the house model exists.** The Unbox
family are **keyboard-wedge scan stations**: the scanner types characters and ends with Enter,
exactly like a keyboard. Consequences already baked into the codebase:

- Bare-digit and bare single-key jump targets are **banned** on these surfaces. The nav-keys
  law (`src/lib/keyboard/nav-keys/`) is a **leader-armed** model: `⌘;` arms a region, *then* a
  letter jumps — "never binds bare digits," wedge-safe (burst-detect · refuse-in-input ·
  auto-disarm). `band3-find-only.guard.test.ts` bans a page-local bare `/` for the same reason
  (a printed Digital Link makes a wedge type `/` mid-scan).
- The History panel's current `1`–`4` / single-letter More shortcuts are gated by an
  `isEditableTarget` check, but a bare key on a scan-adjacent surface is still a muscle-memory
  hazard the moment focus is anywhere non-editable during a scan burst. **Phase 3 should move
  these behind the leader (`⌘;`) or a required modifier**, controlled by the settings toggle in
  item 4.
- **Destructive keys never go bare.** There is deliberately **no bare `D`-to-delete**; Phase 0's
  Delete is pointer + two-click arm. If a delete shortcut is ever added, it takes a modifier and
  a visible, always-true affordance — never a bare `D` that a wedge could fire.

So the operator's own item 4 (toggle single-key → modifier) is not just nice-to-have here; on a
wedge bench it is the **default posture**, and single-key is the opt-in.

---

## Phasing summary

| Phase | Scope | Horizon |
|---|---|---|
| **0** | Delete carton floor (n=1) + guard + E2E | **shipped** |
| **1** | Print + Open/Edit into floor `actions`; slim identity band | **shipped** |
| **2** | Table-level Export (CSV) on Band-1 trailing (History-only) | **shipped** |
| **3** | Keybind discoverability (badges · `?` sheet · nudges) + Keybinds settings (single-key toggle + remap) | horizon |

Add-on for Phase 3, from the operator note: the record-action shortcuts now live on the floor —
wire their `<kbd>` badges into the floor buttons + the `?` cheat sheet, and make single-key
destructive/print shortcuts modifier-required by default on this wedge bench (see Divergence 2).

## Open decisions (ask-first)

1. **Delete side/confirm** — keep house trailing + two-click arm (recommended), or move to
   far-left ghost + dialog per the operator note (needs guard + sibling ruling)?
2. **Bare-key shortcuts** — confirm the wedge-safe default (leader/modifier), with single-key as
   an explicit per-staff opt-in, before building the settings page.
