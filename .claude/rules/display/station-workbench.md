# Station column shell — Unbox-family display anatomy

> **Not Layer A Workbench.** This file is the **Station region** right-pane
> anatomy (`@/components/station/workbench`). The pick+edit Workbench contract
> lives in [`workbench.md`](workbench.md). Prefer the prose name **Station column
> shell** so agents do not port this shell onto Support / Desk queues.

The **Station column shell** (module still exports `StationWorkbench`) is the
named SoT for right-pane unit work across Unbox, Testing, Triage, Shipping,
Packing, and Repair intake. It is the vertical anatomy Unbox pioneered — a
Station-region shell for I/O + persistence per layer, not the Workbench
fallthrough contract.

Import:

```ts
import {
  StationWorkbench,
  PairingTogglePill,
  ExternalLinkPill,
  buildSectionTabs,
  WorkspaceTimelineTab,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench';
import {
  CartonContextCard,
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
```

Reference implementation: `LineEditPanel` (Unbox). Sibling adopters:
`TestingPanel`, `TriagePanel`, `ActiveOrderWorkspace` (Shipping host —
`ShippingScanWorkspace` is its `tabs` composer, `UpNextActionDock` its dock),
`PackOrderPanel`, `RepairIntakeForm`, `LocalPickupEditPanel`.

---

## Enforcement — tiers, hard rules, CI guards (HARD SoT)

This anatomy is now **mechanically enforced**, not soft. Ratchet/positive guards:
`src/components/station/workbench/station-workbench-chrome.guard.test.ts`
(config + baselines + allowlists: `station-workbench-chrome-config.ts`) and the
registry-sync test `src/lib/station-terminal/station-terminal.test.ts` (Guard G).
They run under `npm run verify`. **Baselines only shrink — never raise one to
land a port** ([verify.md](../verify.md)).

### Tier model

| Tier | Stations | Guard stance |
|---|---|---|
| **A — Unbox-family** | Unbox, Triage, Testing, **Pack**, **Labels** (flush column; Print·Documents·Timeline centre), **Shipping**, **Packer review** | Full chrome: `StationContextBar` + two-row `CartonContextCard` above `StationWorkbench`. Secondary / exact triage detail opens in **Displays** only — never a Show-details strip under identity (`carton-context-details-in-displays.guard.test.ts`). **Unbox + Triage + Testing + Pack + Shipping + Packer review** use Displays push for reference tools; **Labels** keeps Documents · Timeline as centre tabs with Unbox flush host (`StationPanelRoot`, `bodyGap="none"`). Pack stays **terminal-exempt** (Tier C dock). |
| **B — port targets** | Pickup (when focus entity exists) | Must match 720 column + compose `StationWorkbench`; terminal via registry **or** typed exempt/allowlist |
| **C — documented exceptions** | Support ticket (`SupportTicketIdentity`, non-carton), Support orders (`ShippedPanelEditorDock` footer), Pack (no sticky dock) | Explicit allowlist below + in config |
| **D — demote / remount** | Repair intake | Adopt `StationWorkbench` + `StationContextBar`, or drop from "Unbox-family" — not both |

### Hard Always

- Mount identity with `StationContextBar` + an entity-context adapter (two-row
  `CartonContextCard`) **above** `StationWorkbench` — never in
  `entityContext`/`toolbar`. **Unbox + Arrival (`TriagePanel`) + Testing
  (`TestingPanel`) + Pack (`PackOrderPanel`):** `placement="flow"` +
  `reserveIdentityClearance={false}` (hairline abuts centre work) +
  `bodyGap="none"`.
- Identity **and** body share `STATION_WORKBENCH_*` (720 **floor**, start-aligned,
  **zero** body pad — flush to rail / Displays hairlines) from
  `workbench-layout.ts`. Identity **host** is full-bleed for layout only
  (`STATION_WORKBENCH_IDENTITY_COLUMN`); the white card face + chips + notes
  dock share `STATION_WORKBENCH_COLUMN` (`w-full min-w-0` — edge-to-edge of the
  center column; no `max-w` / `mx-auto` gutters). Compose `StationPanelRoot`
  for the outer shell.
- Terminal CTA via `useStationTerminalAction` + `STATION_TERMINAL_REGISTRY`, **or**
  a `TERMINAL_HAND_VM_ALLOWLIST` entry with a port follow-up.
- Ambient wash via `StationAmbientWash` (or `StationPanelRoot`, which renders it).
- Tabs via `buildSectionTabs` + `SectionTabsSlider`; glass worksheets via
  `WorkspaceCard` `bodyDensity="nested"`; mid-canvas jumps via
  `StationRightEdgeAction` + `stationRightEdgeActionHostClass` (never in `moreDetails`).

### Hard Never

- `max-w-3xl` (768px) or a local `max-w-[720px]` literal for an Unbox-family
  column — import `STATION_WORKBENCH_*`. Genuine non-column use: same-line
  `ds-station-max-w-exempt`.
- Copy the 3-blob ambient wash outside `StationAmbientWash`.
- Hand-roll `relative flex h-full min-h-0 flex-col bg-surface-canvas` for a
  station panel root outside `StationPanelRoot`.
- Fork a second condensed carton/order identity header (the **only** sanctioned
  fork is `SupportTicketIdentity` — ticket ≠ carton).
- Reintroduce `StationWorkbenchShell` (deleted — used `max-w-3xl`).
- Use `STATION_WORKBENCH_HEADER_COLUMN` (`px-6 sm:px-8`) for family identity/body
  — Triage toolbar / legacy skeleton pad only; Unbox skeleton uses
  `identity-tabs` + `STATION_WORKBENCH_IDENTITY_COLUMN`.
- **Centre advisory / non-ops chrome** — never mount “needs attention” bands,
  ticket-history summaries, claim wizards, or dossier callouts in the locked
  centre column. Centre = **ops-flow only** (that station's exact triage / I/O).
  Contextual detail opens as a **Displays** leaf beside the middle (QC: Ticket
  via `TicketDisplayHost` + `resolveTestingTicketContextOpen`). Guard:
  `station-centre-ops-flow.guard.test.ts`.
- Raise a guard baseline to pass.

### Documented allowlists (Tier C / gaps)

- **`SupportTicketIdentity`** (`support/service-workspace/SupportTicketFocus.tsx`) — forked
  identity for a ticket entity; keeps the motion root, composes `StationAmbientWash`.
  **Support's entries here are a MIGRATION state, not a settled tier.** Ratified
  2026-08-01: `/support` is Workbench branch **`service-workspace`**
  ([`workbench-service.md`](workbench-service.md)), so its primary shell leaves
  this family entirely — `SupportTicketFocus` stops composing `StationWorkbench` /
  `StationContextBar`, and these rows retire rather than graduate. The reason
  `SupportTicketIdentity` needed a fork in the first place — *a ticket is not a
  carton* — was the early evidence for that ruling. **Do not port more
  Unbox-family chrome onto Support to "finish" the tier.**
- **Hand-built terminal VMs** (`TERMINAL_HAND_VM_ALLOWLIST`): `PackerReviewMode`,
  `SupportTicketFocus`, `LabelsOrderWorkspace` — registry slices are port follow-ups.
- **`StationWorkbench` adoption gaps** (`STATION_WORKBENCH_ADOPTION_EXEMPT`):
  `RepairIntakeForm` (remount). Shipping folded onto the SoT 2026-07-28.
- **Pack** — intentionally terminal-exempt (no sticky dock); **Support orders** —
  `ShippedPanelEditorDock` footer instead of `StationTerminalDock`.

Open ports (rules do **not** pretend these are done):
`docs/todo/station-workbench-port-FOLLOWUPS.md`.

---

## Shared Timeline tab

Unbox, Testing, Shipping, and Packing expose a **Timeline** section tab via
[`WorkspaceTimelineTab`](../../../src/components/station/workbench/WorkspaceTimelineTab.tsx)
(or Displays push on Pack / Shipping / Packer review). **Labels** keeps Timeline
as a centre `SectionTabsSlider` tab with flush host chrome (`OrderTimelineSection
flush`) — same pad grammar as Unbox, not a Displays move.

1. **Spine switcher at top** — house [`SectionTabsSlider`](../../../src/design-system/components/SectionTabsSlider.tsx)
   (**Units** default · **Tracking**). Single-spine cases hide the bar.
2. **Units** — [`StationUnitJourneys`](../../../src/components/station/workbench/StationUnitJourneys.tsx)
   only (two-line anatomy; SerialChip last-8 · clock · actor; raw `PREV → NEXT` omitted).
3. **Tracking** — full [`CarrierTrackingSection`](../../../src/components/sidebar/receiving/incoming-details/CarrierTrackingSection.tsx)
   (`stationCompact`: hero + events). Not shown on the Units spine.

PO path uses Incoming details; order/shipping uses journey `dim=tracking|order`.
Serials: explicit list or carton fetch via `useCartonSerials`.

**Unbox has NO tab strip in the workbench body.** The centre is the carton:
`buildUnboxOverview` returns **PO-line ledger + label preview** (`POUnboxingSection`
with `dockOwnsCapture` — PO meta shows condition · serial; click focuses the dock
step; no under-row editor — then `UnboxLabelPreview`). The `tabs` slot stays
deliberately empty. Capture lives in **`UnboxDockHost`** — a polymorphic flush
**two-band floor** instrument: Band 1 = **Active Step Studio** (step CTA · wedge)
with the **Resolution Terminal** (Print·Receive) trailing only when
`activeKey === null` && not received; Band 2 (always mounted) = under-row pager
(left) · compact procedure-% control (right — `UnboxScanProgressControl` in
`UnboxDockHost.progress`, opens the Checklist Displays leaf). That control is the
floor's one metric; no vanity aggregate KPIs. Centre
`ProcedureDeck` stays parked. Every other display lives in the right-edge
**Displays** push column (`StationDisplaysPushStack` in
`src/components/station/displays/`): Root Index → leaf drill-down for
**Listings · Classify · Pairing · Inventory · Units · Photos · Ticket ·
Checklist** (+ Tracking / Timeline / Support). Ticket is **presence-exclusive**
(no linked ticket → Claim New · Link with ⌥1/⌥2; linked ticket → Chat —
no Chat · Claim tabs); Photos is an **armed-row leaf** (default Actions via
`PhotosActionsArmedList` / `useArmedCursorList` — no parent TabDisplay; identity
Photos pill stays send-to-phone); drills Move · Send · Compare via
`?photoAction=` (`UNBOX_PHOTO_ACTION_ORDER` — tools then evidence); Linkage nests
Link (`CartonMatchHub`) · Zoho note (**debt:** parent underline — migrate to
armed rows); Units nests Units · Prebox (**same debt**; Prebox mode = child
segment); Inventory is a **secondary vertical drill**
(Information · Lines · PO notes · Activity via `useDisplaysLeafChrome` — never a
nested TabDisplay / second LeafHeader; reconnect → Settings → Integrations).
**Nested verb altitude:** bench first (default when the nest URL param is
absent) → tools → evidence/reference — never land a trailing verb on open
(Photos `UNBOX_PHOTO_ACTION_ORDER`; Pairing `link`; Units `units`).
Nested-leaf rule: armed-row verbs (Photos golden) **or** secondary vertical
(Inventory) — never both; never a parent TabDisplay strip for leaf-level
verbs (Linkage · Units underline = shrink-only debt). Child `segment` only
inside a tool.
**Checklist is a Displays leaf** — open from the Displays index; never a floor
% ring jump target. Tab list SoT = `buildUnboxSideTabs`; which one is showing
(and whether the column is open at all) = `resolveUnboxSideTab` /
`resolveUnboxDisplayNav` — `null` IS closed, so there is no second open flag to
drift.

### Displays Root Index (station SoT)

Shared host: **`StationDisplaysPushStack`** (+ `StationDisplaysPushColumn` ·
`StationDisplayIndexList` · `StationDisplayLeafHeader`). Desk
`RightRailHost` stays under `components/right-rail/` — different noun.
Operator noun is **Displays** (Open displays), never Inspector.

**Action Plane densify (station-wide):** leaf dossiers compose
`StationDenseFactStrip` · `StationActionDossierShell` ·
`StationActionKeyLegend` from `src/components/station/displays/` — not
`InspectorActionFloor`. Unbox Inventory (`InventoryDisplayHost`) is the first
leaf golden; Arrival · Testing · Pack · Shipping · Review inherit the same
primitives when their leaves adopt them. Law: `source-of-truth.md` → Station
Action vs Context planes.

- **Stage:** Scan-station right-edge Root Index — Unbox golden on `/unbox`
  (shared by Arrival · Testing · Pack · Shipping · Review). Not Incoming desk
  inspector, not triage centre door-flow, not shipping Workbench inspector.
- **Devices:** Warehouse desk monitors ~1440–1920 (standing scan bench +
  keyboard-wedge). Middle locks at `STATION_PUSH_CENTER_FLOOR_PX` (720);
  Displays fill leftover. Mobile `/m/*` is a separate shell — out of scope.
- **Row model:** `DisplayIndexRow` (`id` · `label` · `subtitle` · `tone` ·
  `group`) in `display-index.ts`. Icons paint from matching `SectionTab.icon`.
- **Groups (fixed order):** Verification → Assets → Context; omit empty groups.
  Eyebrows stay mounted (spatial predictability). Eyebrow **trailing** is
  reserved for group summary (`summarizeDisplayIndexGroup`) and/or a **wired**
  hotkey chip — never a second status chip that duplicates every row, never a
  decorative shortcut that is not registered.
- **Row anatomy is FROZEN — three slots, in this order, and no fourth:**

  ```text
  [icon] [label ………………………………] [tone chip]
   flush   truncates                trailing edge
   left
  ```

  Dense **44–48px** hit height (`py-3` + `h-5` icon; a `py-2.5` trial measured
  **40px** — under the bench floor, so it was reverted). `tone === 'action'`
  amber wash is attention, never selection.
- **Armed face = instant hard-cut** (`>` chevron + bottom track only).
  **Idle rows stay flush leftmost** (icon at the lead edge — one shared icon
  column). Selection state updates **sync** in React; arm paint remounts with
  the commit — **no `layoutId` FLIP**. **Never** stack a left accent rail +
  shaded row wash + focus-ring twin on top of the track — that reads as three
  selection systems. The **tone chip stays a trailing flex sibling**. Waist:
  `useArmedCursorList` + `armed-cursor-face.ts`.
  - **Leading `>` mounts only on the armed row.** **Never** reserve an empty
    chevron gutter / slot on idle peers to “keep icons from shifting” — that
    permanently parks every unselected icon in a second column and is banned
    (ruled 2026-08-08). Unselected rows stay flush left; the armed row alone
    hard-cuts `>` ahead of its icon (that one row may shift; peers must not).
  - **Ink = operator accent tokens** — `text-accent-bg` / `bg-accent-bg`
    (`ARMED_CURSOR_CHEVRON_CLASS` / `ARMED_CURSOR_TRACK_CLASS`) driven by
    `--ds-color-accent-*` (staff prefs `useStaffAccent` / `accentHex`). **Never**
    page-local hex, never `bg-amber-*` on the selection track (amber stays on
    attention tone chips only).
  - **Bottom track** — absolute `h-0.5` underline remounted on the armed row
    only (hard cut). Never spring / never shared layout.
  - **Armed-idle pulse** — opacity on `>` + track only via bare
    `animate-pulse` (`ARMED_CURSOR_MARKER_PULSE_CLASS`), composed when
    `useReducedMotion()` is false. **Never** `motion-safe:animate-pulse` (that
    silently no-ops under OS Reduce Motion and reads as a broken pulse).
    **Never** full-row / sky Infinity.
  - **Right-rail commit never withholds DOM.** Enter / Space / click calls
    `onSelect` / verb / leaf mount in the **same turn** — no hit-marker timer
    before paint (`commitArmed` is sync). SelectionPulse / press **depth juice
    on click** belongs to the scan-station **middle** only (e.g. Unbox
    procedure pager) — never delay Displays open for that juice. **No UI audio**.
  - **Density:** hit height stays **`py-3` (~44–48px)**; densify via
    `text-role-*` only. Never silent `py-*` shrink below the bench floor.
  - Looping full-row glow stays banned (MasterNav D2/D3 one-shot settle; open
    spine-pulse briefing is a separate ruling).
  - **Exactly ONE marker grammar** — accent chevron + accent bottom track +
    marker pulse. No left bar, no armed row wash, no idle reserved gutter,
    no focusRing twin while armed, no commit-timer withhold.
  - **The whole row is ONE control and holds no other.** Never nest a button,
    menu, kebab, checkbox, toggle, count-stepper or link inside a row — a row
    opens its leaf and that is the entire contract. A second control inside a
    row makes the row's own click target ambiguous at a bench, and it is
    unreachable by the keyboard path the row already owns.
  - **Icons come from `SectionTab.icon` and are never re-styled per row.** One
    glyph SoT (`iconById` off the leaf registry), one size, one ink. No
    per-row hue, no badge overlay, no second icon, no swap by tone — tone is
    already carried by the chip and the wash, and a third channel for it is a
    channel spent twice.
  - **The trailing edge belongs to the tone chip alone.** Nothing else parks
    there (no age, no count, no overflow). Leading `>` is the armed marker —
    never a trailing chevron-right twin.
- **The group eyebrow is `LABEL ……… action count`, and nothing else.**
  A per-group **Collapse** button and a per-group `kbd` hint both shipped on
  2026-08-07 and were pulled the same day: chrome repeated once per group is
  paid for N times and read once — on a ten-row index the word COLLAPSE was on
  screen three times — and the `kbd` advertised a Digit1–3 chord that only
  fired once the operator had already tabbed into the list, which is a **false
  shortcut hint** (worse than no hint — `source-of-truth.md` → ⌘K ownership).
  - **Bare digit hotkeys are banned on this surface.** A wedge scan types
    digits into the page, so a bare `Digit1–3` binding is a scan away from
    firing; scoping it to "only when the list already has focus" is what made
    the hint a lie. If group jumping is ever needed, it takes a modifier and it
    takes a visible, always-true affordance.
  - **A group trailer speaks only when it has something true to say.** The
    earlier ladder also emitted `Clear` and `Incomplete`, and `Incomplete` was
    false for pure-reference clusters — so healthy rows sat under the word
    INCOMPLETE. Chrome never invents a second story (Kinetic Ledger law 1).
    Action tones (e.g. Linkage “Unpaired” under Context) still drive
    `N pending` via `summarizeDisplayIndexGroup`. Ticket unlinked is quiet
    **No ticket** / `neutral` — not an amber index alarm.
- **Empty is answered, never blank.** No filter match → the query echoed back
  plus **Clear filter**; genuinely no displays → an honest line. A column that
  goes white when an operator mistypes reads as broken.
- **Unbox enrichment:** domain `buildUnboxDisplayIndexRows` (gates + signals).
  Other stations omit `indexRows` → `deriveDisplayIndexRowsFromTabs`.
- **Hotkeys (Right owns / index mounted) — character-select:** ↑↓ wrap an
  absolute cursor across the flattened visual order (`orderedIds`); Home/End
  jump ends; Enter/Space (and click) **commit sync** → open the leaf / run the
  verb in the same turn (never a pre-paint hit-marker withhold). While
  keyboard-region **Right** owns (`regionActive` on `useArmedCursorList`), ↑↓
  are claimed on window capture — pointer into the Displays column is enough;
  do not require a prior Tab into a row (ambient table cursors already yield
  via `list-key-scope` while the column is open). Armed face = accent `>` +
  accent bottom track + marker pulse on the **cursor** (seeded from last opened
  leaf / `activeId`). **No Tab trap, no bare digit bindings** (wedge-safe; see
  bare-digit ban above). Must not steal the global scan-bar target.
- **Collapse:** optional local UI collapse per group; no inventing Clear All /
  Override / “Updated Xm ago” without a real domain bulk mutation or freshness
  signal.
- **ONE navigation grammar — the `navMode` prop is DELETED** (2026-08-07).
  Every station drills index → leaf; Esc pops leaf → index → close; Back →
  index. Reachability now holds by construction rather than by a per-station
  flag. The retired `leaf` mode rendered a single leaf and no switcher, so
  `onTabChange` had no caller inside the column and every other display became
  unreachable — Pack (4 displays) · Shipping (2) · Review (3) shipped that way
  for a day. It was deleted rather than reserved for a hypothetical one-display
  station: an untested branch in a shared waist is where the next regression
  hides, and a one-display station is already served by a contextual
  `openDisplays(<leaf>)` that skips the index (Arrival · Pairing).
- **A gated-away leaf resolves to the INDEX, never `displayTabs[0]`.** Swapping
  in an unrelated display when the requested one gates away is the failure the
  index exists to prevent.
- **`←|` opens the INDEX on a 2+ display station; contextual
  `openDisplays(<leaf>)` skips it.** A one-display station lands its leaf
  directly (Arrival · Pairing) — an index with one row is a tap that teaches
  nothing.
- **⌘/Ctrl+] is the edge toggle.** Same action as the mounted `←|` / `→|`
  click — owned by `StationDisplaysEdgeToggle` via `displays-toggle-hotkey.ts`
  (not a per-panel listener). Closes the whole column from a leaf (toggle
  visibility); Esc still pops leaf → index → close. Guard:
  `station-displays-toggle-hotkey.guard.test.ts`.
- **Footer is stage-owned (list vs triage leaf):** Root Index = bottom
  `TechRailSearchBar` (`Filter displays…`) with `→|` as `trailingAction`.
  Leaf triage/action = `StationDisplaysDismissFooter` (`→|` dismiss band only)
  — never mount list-filter chrome on a leaf. Filter query applies only to
  `StationDisplayIndexList` / `filterDisplayIndexRows`. Guard:
  `station-displays-footer-stage.guard.test.ts`.
- **Guard:** `station-displays-reachability.guard.test.ts` asserts the operator
  contract (*every declared display is reachable*), not the mode string. The
  per-station guards asserted `navMode="leaf"` was present and were green
  through the entire regression — a guard that pins the mechanism blesses
  whatever the mechanism does. Index chrome: `station-display-index.guard.test.ts`.
- **Follow-up (out of scope):** 48–64px icon-collapsed rail — today open (≥280)
  or closed only.

**Linkage (Package Pairing + Zoho note) is a DISPLAY, not a centre surface**
(Pairing moved 2026-08-02; condensed with Zoho note 2026-08-05). Pairing once
rendered inline at the bottom of `POUnboxingSection` behind a `pairingOpen`
boolean. **A control on the right edge must not open a surface in the centre.**

It is a display and not a peer push column because it is reference-and-edit
work the operator *chooses* to look at, not an exception that interrupts them.
Ticket (presence: Claim create/link vs Chat) and photo tools are Displays tabs
(2026-08-05) — not
separate push columns. Linkage is likewise **not** a `RightRailHost` occupant.
Claim compose Subject/Body uses sheet-band faces (`DenseComposeFields` —
underline Subject + full-bleed sunken Body); the claim scroll body is `px-0`
with section hairlines — rows own `px-3` / `inset-field`, not nested bordered
input cards. **Macro CTAs** (Claim File, Prebox Print, Move / Send photos) pin
to the Displays column floor via `FlushTerminalFooter` — in-flow sibling,
`p-0` hairline, flush `Button` — never a padded card CTA hanging under a nested
list island. Per-row Micro actions stay on `IconButton size="md"`.

The tab's **selected-ness IS the open state** — `pairingOpen`, `togglePairing`
and the pencil are deleted, and a boolean beside `activeSideTab === 'linkage'`
would re-create the drift. Gate: a carton record (`row.receiving_id != null`).
Mounted with `chrome="bare"` inside `LinkageDisplayHost` (nested Link · Note).
The carton `# ----` chip routes via `openDisplays('linkage')` plus a
**`focusTab` prop** on the hub — the intent travels as DATA, never as a timed
event.

**A timed dispatch cannot outrun a navigation.** `focusTab` is read on mount; a
`focusRequestId` bump re-selects the avenue when the host asks again. Same
handoff shape as `classifyExpand` → `TriageClassifySection`. Arrival mounts
Classify in the centre door flow (under items); Unbox keeps Classify on Displays.
Both use the same `classifyExpand` data handoff — never a timed event.

**A display's URL vocabulary lives in ONE list.** `?display=` is round-tripped
via `canonicalizeUnboxSideTab` in `UNBOX_ROUTE_PARAMS` (legacy `pairing` /
`po-note` → `linkage`). Guards: `carton-match-hub.guard.test.ts` ·
`unbox-side-tabs.test.ts` · `unbox-right-edge-chrome.guard.test.ts` ·
`route-params.test.ts`.

### Procedure status views (main vs unbox-work)

| Where | Surface | Answers |
|---|---|---|
| **Centre (main)** | `POUnboxingSection` + `UnboxLabelPreview` | *what is in the box · grade · serial · label* |
| **Centre (unbox-work)** | `ProcedureDeck` — focus deck | *what do I do right now* |
| **Right edge** | `ProcedureChecklist` — the `checklist` display (under-dock ring + Root Index leaf) | *where am I in the whole job* (optional on main) |

On **main**, the centre is PO lines + label; checklist/ring are optional procedure
status and must not require a centre `ProcedureDeck`. On **`unbox-work`**, deck +
checklist both read **`useUnboxProcedureSteps`** — one hook, one answer.

**Live is a requirement for the checklist when mounted.** The shared hook
subscribes to the carton's photo realtime channel, so the checklist reflects a
scan — including one taken on the PHONE — the moment it lands.

**On the unbox-work lane, clicking a checklist row moves the CENTRE's focus card.**
The focused step lives in `src/lib/receiving/procedure-focus-store.ts`
and not in either surface's `useState`. It is ephemeral and carton-keyed, never a URL param
(a Station's selection is ephemeral by contract).

**Never re-derive step order in a view.** `deriveProcedureSteps` is the
vocabulary SoT (hardcoding the steps breaks unfound, local pickup, returns and
multi-qty), and the POINTER is `resolveActiveStep`
(`src/lib/receiving/procedure-pointer.ts`), shared with the receipt read model.
The org-editable `checklist_templates` list and its `/api/checklists` CRUD were
deleted 2026-08-01 and **stay deleted** — a hand-ticked list is the one thing
that must not come back, because a box got ticked when someone remembered to tick
it rather than because the photo existed.

### The Procedure Focus Deck — parked on `unbox-work` (geometry law retained)

**Main Unbox does not mount this deck** (PO lines + label — see above). The law
below applies on the **`unbox-work`** lane (`../cycleforge-unbox`) and any future
derived-procedure bench that opts in.

**On that lane, this deck is the hero of the scan-station workbench.** Identity and items
are supporting chrome; Displays and the dock are secondary. Do not mount a
competing centre surface that splits visual weight with the deck.

**A flat list of fixed-height faces carrying EVERY step**, in vocabulary order.
Rigid flat foundation (amended 2026-08-04 — selection is outline-only; faces
never grow; stack / peek / layout-motion paths retired):

```text
Step face (36px, mt-3) — outline ring when selected
Step face …
Step face …
Evidence band under the list   ← ONE body; not inside the face
```

Anatomy: **icon left · label · quantity right**, on a **neutral card**
(`bg-surface-card`) — no per-step hue family. Selected face keeps the same
chrome at `h-9` with `ring-1 ring-inset ring-blue-400`. Evidence mounts in a
band under the `<ol>`, never inside the face.

**It was overbuilt into a space-aware Smart Stack** (capacity math, sticky,
top-compress, crown scrub, peeks, `layout="position"` advance). That path
produced ghosting, width dip, crushed mid-cards, and layout thrash. The flat
list is the foundation to build from.

- **Occlusion of a BODY is allowed; every RECORD stays a full face.**
  A step's **body** — its evidence — belongs to one band at a time under the
  list. Other bodies are not shown while another step is focused. (A body is
  *evidence*, not controls: since 2026-08-02 the step's action button lives in
  the dock.)
  Every step's **record** (label, state mark, summary) stays a
  36px readable face — no peek, no covered tuck, no expand-on-focus. Reachability
  is click + pager + checklist.
- **HIDING and RE-SORTING remain absolutely banned.** Every step is mounted from
  the first frame, in strict `deriveProcedureSteps` order. A deck is a
  **transform**, never a filter and never a sort; `resolveActiveStep` decides the
  focus, nothing decides membership.
- **Flat geometry.** Every step face = `PROCEDURE_STEP_FACE_HEIGHT` (`h-9` /
  36px) with `PROCEDURE_STACK_GAP_REM` (`mt-3`) gaps — including the selected
  row. Selection = `ring-1 ring-inset ring-blue-400` on the same face chrome.
  Evidence mounts in a band under the `<ol>` (`data-procedure-active-body`).
  No peek, no covered, no negative margins, no `availableRem`, no wheel arming,
  no host-scroll compress, no in-face expand.
- **No layout motion on step advance.** Evidence band uses
  `framerPresence.procedureFocusBody`. No `layout="position"`, no
  `runProcedureStackAdvance`, no `motionRole.procedure.advance` on this surface
  (role retained in catalog as deferred / unused). Travel is
  `scrollIntoView({ block: 'nearest' })` on the host port.
- **A station work surface is BOTTOM-PINNED and grows upward.** The geometry is
  `min-h-full flex flex-col justify-end` **on the host's scroll port**
  (`StationWorkbench bodyAlign="end"`), never on the column. Host `justify-end`
  keeps short content against the composer.
- **The deck is CONTENT, not a viewport.** It adds no `overflow-*`, no `flex-1`,
  no `h-full` — the host owns the port. Card gaps are per-item positive
  `margin-top` in rem — never `space-y-*`.
- **Snap belongs to the HOST port or nowhere.** Never nest `snap-y` /
  `overflow-y-auto` on the deck.

- **Exactly ONE scroll port.** No nested scroller inside a card. An operator
  with a scanner in one hand cannot be asked which of two scrollers they are in.
- The evidence band crossfades its **contents** on `activeKey`
  (`framerPresence.procedureFocusBody`).
- **No hue family.** Icons resolve from `steps/step-face.tsx`; surface / medallion /
  quantity ink are ONE neutral set for every step. State marks and the outline
  selection already say where you are. Never pick a hue at a call site.
- **Neutral card; outline on selection.** `border-border-soft bg-surface-card`
  on every row; selected face adds `ring-1 ring-inset ring-blue-400`. Evidence
  band is a plain bordered card under the list.
- **Per-step durations stay refused.** There is no `step_started_at`; the gap
  between completions is not time-on-step, and timing an operator who can waive
  steps corrupts the evidence trail.
- **Nothing here takes focus — including a clicked control.** No `autoFocus`, no
  `tabIndex` on the deck; the focus card is scrolled into view, never
  `.focus()`ed. A pager chip or a card click *natively* focuses its button, and
  the next wedge scan would then type into it and its Enter would re-activate it
  — so **every pointer control on this surface dispatches `receiving-focus-scan`
  after it acts**. The wedge owns focus, and a surface that steals it drops scans
  silently; the failure mode is invisible, which is what makes it expensive.

**Three pointer paths, and the deck alone is not one of them.** Because only one
queued card peeks, everything past the next step is reached by:

1. the **peek** (click its sliver to promote it),
2. the **step pager** — pinned chrome directly above the composer, and
3. the right-edge **`checklist` display**, which is the deck's precondition (see
   the coupling below).

**The prev/next chips came back as pinned bottom chrome (2026-08-02, same day
they were cut).** They were cut because they rendered *after* the column, which
had no scroll port of its own, so they landed mid-document with nothing anchoring
them. They belong beside the input, in the dock band, where the operator's hand
already is — never as a trailer after the content. Two hard properties:

- They resolve from the **deck neighbours** (`prevStep` / `nextNeighbour` in
  vocabulary order), **never** from `nextStep`, which is the *skip* target: a
  pager wired to that walks the operator past every settled step they can still
  reopen, silently. Paging is positional; skipping is a decision, and a decision
  needs a waiver.
- **Honest absence at the ends** — no neighbour, no chip. Never a disabled
  control and never a wrap.

**A row added to the dock must be added to the scroll clearance.** The dock
floats over the canvas, so the body's bottom padding is the only thing keeping
content out from under it — and that padding is a constant tuned to the dock's
height (`STATION_TERMINAL_SCROLL_CLEARANCE`). The pager shipped overlapping the
peek by 4px until `reserveScrollClearance="pager"` landed
(`STATION_TERMINAL_PAGER_SCROLL_CLEARANCE`). A named variant, not a bumped shared
constant: the four stations without a pager must not pay 32px of dead canvas for
one that has one.

Guards: `procedure-step-body.guard.test.ts` (every step has a body + a dock
control) · `procedure-step-face.guard.test.ts` (every step has an icon + hue) ·
`procedure-divergence.guard.test.ts` (every step has a gate) ·
`receiving-lines-procedure-gates.guard.test.ts` (every gate column survives the
API normalizer — see below).

**A gate column must survive the WIRE, not just the schema.** `normalizeRow` in
`/api/receiving-lines` is a strict allowlist with no passthrough, so a column
added to the builders but not to the normalizer reaches the client as
`undefined` — indistinguishable from "not acknowledged". All three acknowledgement
stamps (`condition_graded_at`, `contents_confirmed_at`, `label_previewed_at`)
shipped exactly that way: routes wrote them, builders selected them, gates read
them, and the `condition`, `contents` and `label` steps could never go done.
Nothing threw; the pointer just parked forever. Every layer looked correct in
isolation, which is why this is a test and not a comment.

**Every Unbox right-edge surface is a station-scoped push column, never a
`RightRailHost` occupant.** Displays / Ticket (`ReceivingTicketStack`) / Claim
(`ReceivingClaimStack`) / tool (`ReceivingToolPushStack`) all compose the one
shared shell `StationDisplaysPushColumn` (aside + leading resize grip + narrow-viewport
overlay + `DETAIL_STACK_ASIDE_SURFACE` + Escape) — do not hand-roll a fifth
copy. They are **mutually exclusive with each other and with receiving More
details** (`detail:receiving` float); Displays is lowest precedence, because an
exception surface or a just-launched tool outranks reference reading. Entries:
Displays = the Root Index → leaf faces (identity tracking · listing · classify · …);
Ticket = carton History / `?ticketView=1`; Claim = Make claim / Link ticket /
`?claimView=1` (+ optional `claimMode=link`). Support (overflow) still does not
mount the Linkage strip (link from entity chrome / console drawer). Packing is
terminal-registry-exempt (no sticky dock).

**Center stays the sunken ground when left + right push (ruled 2026-08-03).**
Context rail + Unbox column + optional push column sit as flush siblings on
`CONTEXT_PANEL_HOST` shared canvas — depth is plane contrast, not floating
islands. Inter-column gutters are **0**; workbench body pad is **empty**
(`STATION_WORKBENCH_BODY_PAD_X`) and the content column is **edge-to-edge**
of the center (`STATION_WORKBENCH_COLUMN` = `w-full min-w-0` — identity, PO
lines, and floating notes dock share one measure; no `max-w` / `mx-auto`
gutters). **Flex-Grow Sandwich (station):** while Displays is open the host is
`[middle LOCK 720 shrink-0][Displays flex-1]` — middle is the permanent anchor
under rail pressure (`min`/`max`/`w` = 720); Displays **always fills leftover**
to the pane right edge (never `ml-auto` detach). Displays-closed center is
`flex-1` with `min-w-[720px]`. **Never** host `justify-between` / host
`gap-*` / gutter `<div>` / leading spacer / `RIGHT_RAIL_GUTTER_PX ≠ 0`. Frame
station `centerFloorPx` = `STATION_PUSH_CENTER_FLOOR_PX` (**720**). Displays
drag min is `STATION_DISPLAYS_MIN_WIDTH_PX` (**280**), below the desk
inspector 360. Host SoT: `StationScanPaneHost` + `StationDisplaysPushColumn`.
**Continuous improvement:** Unbox is golden for the middle measure; every other
scan-station panel in `SCAN_STATION_EDGE_MEASURE_PANELS` is watched by
`station-edge-measure.guard.test.ts` (shrink-only missing-token + local
`max-w-[720px]` baselines). Port siblings via
[`scan-station-edge-measure-CI-LOOP-PROMPT.md`](../../docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md).
**Station Ticket (or Claim) and app AI share the product law “one right details
column”:** when header Sparkles opens the assistant occupant, station
ticket/detail chrome yields (park / close) — do not leave both full beside each
other. Station exclusivity (Ticket | Displays | Claim | tool) remains; app
`RightRailHost` exclusivity (detail | assistant) remains. Full law:
[`source-of-truth.md`](../source-of-truth.md) → **Frame column budget** ·
**Right-rail modality** · **Depth elevation**.

**The Unbox dock is carton-terminal.** `STATION_TERMINAL_REGISTRY.unbox` is
`hasSectionTabs: false` + `defaultKind: 'mode-default'`, so the bottom primary
is always Print · Receive and never changes with a Displays selection — a click
on the RIGHT re-labelling the button at the BOTTOM is cross-region
action-at-a-distance. A tab-scoped action (save the PO note, check all, prebox,
post a reply) is a **local control inside its own display**, not a dock kind and
not an imperative bridge.

### Station Workbench: Dock Polymorphism and Floor Mount

1. **Flush Floor Instrument:** The bottom capture dock must mount `inset-x-0`
   flush to the `STATION_WORKBENCH_COLUMN`. Floating chat cards, `px-4`/`sm:px-6`
   horizontal gutters, and outer `Panel` wrappers with `radius="2xl"` or
   `elevation="raised"` are strictly banned on the procedure floor. Use a top
   hairline border and a flush `bg-surface-card` plane.
2. **Terminal Yields to Capture:** The dock is a strictly isolated step studio
   during procedure execution. Print·Receive terminals and resolution CTAs MUST
   NOT co-mount with active step prompts.
3. **Settle-State Commit:** The `StationTerminalDock` (Print·Receive) only
   claims the trailing dock space when `activeKey === null` (all steps
   fulfilled). If `isReceived` is true, the dock swaps to a "Procedure Complete"
   studio state; the terminal is never "re-labelled" as a disabled state
   mid-procedure.
4. **Serial Dominance:** On `activeKey === 'serial'`, the wedge entry field must
   consume ≥80% of the available floor band width. Peripheral utility chrome
   (FileText notes toggle) is demoted or hidden.
5. **Two-Band Floor (geometry SoT):** `UnboxDockHost` always paints a full-width
   (`w-full` — `inset-x-0` alone does nothing on an in-flow flex child) two-band
   plane: a top `border-t` hairline → **Band 1** (`h-11` current-step row: wedge /
   step CTA leading, Resolution Terminal trailing on settle) → a middle `border-t`
   hairline → **Band 2** (always mounted, hidden only in notes mode) = the step
   **pager** (left) and a compact **procedure-% control** (right —
   `UnboxScanProgressControl`, opens the Checklist Displays leaf). The pager never
   returns `null` (settled → `Complete`); the wedge is `w-full min-w-0 flex-1`
   (never a `max-w-*`/chip cap). No dock control routes off `/unbox`. The
   procedure-% control is the floor's ONLY metric — not on a Displays `rightSlot`,
   never a vanity KPI / `GoalRing`. Guard: `unbox-dock-one-shell.guard.test.ts`.

| Zone | Scope | Contract |
|---|---|---|
| **Leading** | the **active step** | that step's `UNBOX_STEP_DOCK_CONTROLS` entry + **full-width wedge** (an actionless step's wedge fills Band 1 — no empty `flex-1` sibling). Swaps with `activeKey` on `motionRole.swap.scan`. **No notes toggle on the floor** (removed 2026-08-08 — `itemNote` still live-drives the label center). |
| **Trailing** | the **carton** | Print · Receive — **only when settled** (`activeKey === null` && `!isReceived`). Unmounted during capture. Never step-scoped, never animated. |

### A step CARD carries no action button. Ever.

**The card reads; the dock acts.** A step body renders the step's CONTENT — the
photos taken for that aspect, the label face, the line list, the grade on
record. Every control that *advances* the step — camera, `Link a photo`,
*Contents match*, *Face is right*, the grade chips — renders in the dock band.

Two reasons, and the second is the one that is easy to miss:

1. **The hand is already there.** The composer, the pager and the Print · Receive
   terminal are in that band. A control in a card asks the operator to leave the
   one place they never leave.
2. **A card SCROLLS; the dock does not.** The deck is content inside the
   station's scroll port, so a control in a card sits at whatever offset the deck
   is at — including underneath the dock itself, which is exactly how the label
   preview came to slide beneath the composer before it became a step. A control
   whose position depends on scroll offset is a control you have to look for.

**This does not re-open the cross-region ban above; it applies it.** That ban is
about the **Displays column on the right edge** reaching across the workbench to
rewrite the bottom button. The active step is set in the column **directly
above** this band — same region, adjacent, and it is the operator's current work.
What the ban protects is that *the commit* stays unambiguous, and it does:
Receive means the same thing on every step.

### The invariants

- **One note target.** The composer writes `receiving_line.notes` and only that.
  The placeholder may name the step; the column it writes may not. A step-scoped
  note store is forbidden.
- **A step control is a LOCAL control, not a dock KIND.** No step ids in
  `STATION_TERMINAL_REGISTRY`, and no imperative bridge from the deck into the
  dock — both read `useUnboxProcedureSteps`, so they cannot disagree.
- **Not every step has an action, and that absence is DECLARED.**
  `UNBOX_STEP_DOCK_CONTROLS` is `Partial` on purpose: `arrival_check` reads the
  door's evidence and must not offer a camera (a bench capture there would void
  the `require_one` receive gate). That step is listed in
  `UNBOX_STEPS_WITHOUT_DOCK_ACTION` **with a reason** — a step in neither map
  fails CI, so an empty dock band is always a decision and never a gap.
  `classify` mounts the shared `TriageClassifySection` via `classifySlot` (Band 1
  grows for that step only — unfound dock-completable).
- **The leading zone crossfades on `activeKey` with `motionRole.swap.scan`** —
  the station-cadence preset with the `duration: 0` exit, never `swap.focus`. The
  trailing terminal sits outside that presence and never animates: it is the one
  thing on screen that must not move while a hand is going for it.
- **Every dock control hands focus back** (`receiving-focus-scan`, 60ms defer).
  A control that eats the wedge is the most expensive bug on this surface,
  because the failure is silent.

Code: `steps/dock/` (registry + controls) · `UnboxStepDock` (the band) ·
`buildUnboxStepDock` (slot composition, beside `buildUnboxOverview`).
Guard: `steps/dock/procedure-step-dock.guard.test.ts` — pins the either-or
membership, the shared carton-photo control, and that **no step body imports an
action primitive**.

---

## Vertical anatomy (top → bottom)

| Layer | Role | SoT |
|---|---|---|
| **1. Progress stepper** | Completeness checklist (Photos → Serial → Print), not a wizard lock | `LinearWorkflowStepper` + `deriveLinearStepStates` — lives in parent shell (`ReceivingLineWorkspace`), not inside `StationWorkbench` |
| **2. Station identity chrome** | Coplanar flush band under GlobalHeader over the **sunken** work plane (no in-flow gray band, no raised bookmark). **Top padding SoT:** `STATION_IDENTITY_INSET_TOP` (`top-0`); `stationIdentityPanelClass` = `rounded-none` + hairline `border-b` + flat elevation + `bg-surface-card` on the **edge-to-edge measure** (`STATION_WORKBENCH_COLUMN`); `stationIdentityPadClass` = horizontal only (zero `pt`/`pb`). **Never** stack host `py-*` under the absolute identity. Unbox push is **flush** (no outer `my-2` / host `pr-2`). | `StationContextBar` (`stationContextBarHostClass`) + `StationMoreDetails` + `CartonContextCard` (two-row); pair with `StationWorkbench` `reserveIdentityClearance="stacked"` + Unbox `bodyGap="none"`. Tokens: `station-identity-chrome.ts` + flush `CONTEXT_PANEL_COLUMN_CLASS` / `DETAIL_STACK_PUSH_COLUMN_CLASS`. Guard: `unbox-push-gutter.guard.test.ts`. **Unbox:** Displays primary nav is **Root-to-Leaf** (`StationDisplaysPushStack` — index rows → leaf; horizontal `density="icon"` topic plate retired). Procedure progress ring seats **under the dock** (Band 2 right — `UnboxScanProgressControl` in `UnboxDockHost.progress`), always mounted, opening the Checklist Displays leaf; not on a Displays `rightSlot`; closed Displays opens via `←|` (utility-rail footer). Pane/utility carries **Displays `←|` open** (`StationDisplaysEdgeToggle`) beside carton `↑ ↓`. Open handoff: shared `layoutId` morphs into column footer `→|` — never a second pane dismiss, never `detail:receiving`. Nested verbs: Photos = armed rows + URL drills (trail via `useDisplaysLeafChrome`); Inventory = secondary vertical; Linkage · Units underline = debt. Child segment for Move/Prebox/Claim/Support. Ticket is presence-exclusive. Checklist is a Displays leaf (also a Root Index row), opened from that under-dock ring. Not `GoalRing`. Peer stations compose `ScanStationProgressControl` — never fork. |
| **2a. Context rail collapse** | Every left context-rail card may park via **display** `RailFilterCollapseButton` auto-seated by bottom `TechRailSearchBar` `variant="rail"` under `ContextPanelCollapseProvider` (age column / bottom-right; hosts may override `trailingAction`) **or** drag-past-min on the trailing resize edge (trailing **inset** hairline — drag-only sash, no sash-top collapse chevron; dashboard included); slim expand strip restores it — **whole-strip click / Enter / Space** (or footer chevron). Top-of-strip **mini scan cell** (`CollapseStripScanCell` — `PRIMARY_CHROME_ROW_FACE` Plus idle with staff-themed hover; focused = same bottom-up `ScanBandGlowHost` glow as the open band + visible caret, no placeholder; shares primary `StationScanBar` via `usePublishCollapseScan`). Mid-strip **MRU pins** (`CONTEXT_PANEL_COLLAPSE.mruPinCount` = 5) are the default for every `SidebarRecentRailBase` (shell publishes via `usePublishCollapsePins`) — status dots; **selected** pin uses open-rail `RailRow` ring (`bg-blue-50 ring-1 ring-inset ring-blue-400`); pin **click** selects (stay collapsed); pin **double-click** expands; when the open rail has more than five, a **`+N` overflow** control expands; pin **hover** always opens a `RailPopover` card — the feed's own `renderPopover` (Receiving · FBA) when it has one, else the shared **`RailPeekCard`** (title · status · **copyable `CopyChip` id facts** via `getCollapsePinFacts` · age · Open →). Never a text-only tooltip. Dashboard inbound recents thin-wires the same publish channel (not on the shell). Outset chrome hangs into **`CONTEXT_PANEL_HOST` shared ground**. Width-drawer + localStorage — not a page-local / in-row twin. LedgerDrill parent maps share the same filter-trailing grammar (`useLedgerDrillCollapse`). | `CONTEXT_PANEL_COLLAPSE` + `ContextPanelLayout` + `SidebarRecentRailBase` / `SidebarRailShell` + `TechRailSearchBar` + `RailFilterCollapseButton` + `LeftDockCollapseStrip` + `CollapseStripScanCell` + `CollapseStripMruPins`; Unbox/Triage roots use `appWorkCanvasLayoutClass` |
| **2b. Mid-canvas edge jump** | Secondary surface jump (e.g. Triage → Open in Unbox) — not the terminal CTA | `StationRightEdgeAction` + `stationRightEdgeActionHostClass` on the panel `relative` root (~`top-1/4` right). Never nest under `moreDetails`; never use `SlicedActionDock` for this |
| **3. Section tabs / Displays leaves** | Centre workbench section tabs (when used) own bar + panels; Unbox centre `tabs` stays empty. Station **Displays** navigate Root Index → leaf — never a permanent icon topic plate. Nested leaf grammar: **armed-row verbs + URL drills** (Photos golden — no parent TabDisplay) **or** secondary vertical (Inventory); in-tool child `segment` (Move To·From · Prebox mode · Support Team·Activity); **leaf-wide** Claim New·Link = `StationDisplayLeafHeader` trailing via `setLeafTrailing` on Displays chrome. **Debt (shrink-only):** Linkage · Units still mount one parent underline until migrated. Ticket is presence-exclusive. Soft `TabSwitch` / `rounded-full` pills banned. Guards: `tab-display-displays-hosts.guard.test.ts` · `station-displays-nested-grammar.guard.test.ts` · `photos-actions-armed.guard.test.ts`. Other non-Displays call sites may still use `SectionTabsSlider` `inline` underline. |
| **4. Tab body** | Whole contextual display per tab (form state survives via mounted panels) | Station-specific content. A tab-scoped action is a LOCAL control in its own body — never an imperative bridge feeding the dock (Unbox deleted all three) |
| **5. Feedback / footer** | Inline action feedback (scroll) + receive band. **Unbox:** receive band co-mounts in the absolute dock float stack **above** `UnboxDockHost` (not the in-flow `footer` — an absolute dock would cover it). Other stations may still use sticky `footer` between body and an in-flow dock. | `WorkspaceActionFeedbackSlot`, `ReceiveFeedbackRegion` |
| **6. Terminal dock band** | **Leading = the ACTIVE STEP's action control** (`UnboxStepDock` → `UNBOX_STEP_DOCK_CONTROLS`; a step card never carries a button) + pager + chat-style notes composer · **trailing = the carton's** primary CTA (**tab-aware only where the registry slice says so — Unbox is not**) | `STATION_TERMINAL_REGISTRY` → `StationTerminalDock` → `SlicedActionDock`. **Unbox = ONE floating shell on every carton**: `OmnichannelComposerDock` via `slicedActionDockWrapperClass({ docked: false })` (absolute over the canvas + `reserveScrollClearance`) with the CTA in its `trailingAction` (`<StationTerminalDock embedded>`), blue Send suppressed. **Unbox Displays / Ticket / Claim / tool** are flush right-edge push columns composing `UnboxPushColumn` (`DETAIL_STACK_PUSH_COLUMN_CLASS`; narrow overlay may use elevated aside). Ticket reopen is carton identity Reply / `?ticketView=1`. **Flush planes:** no outer push gutters — hairline against sunken center. Identity top = `STATION_IDENTITY_INSET_TOP` only. Support/Testing Ticket *tabs* (when present) still use `SupportTicketComposerDock` + `SupportChatComposer` `variant="station-dock"`. Full-width in-flow band elsewhere |

```
Parent shell (Unbox = pane outer: Unbox column + optional flush push column)
├── StationContextBar          ← absolute-float identity at STATION_IDENTITY_INSET_TOP
│                                  (flush under GlobalHeader — never under host py-*)
├── StationMoreDetails         ← pane-anchored (same top + STATION_IDENTITY_INSET_RIGHT)
│                                  so Ticket push does not slide it left
├── StationRightEdgeAction     ← optional mid-canvas jump (Triage Open in Unbox); panel-root absolute
└── StationPanelRoot           ← bg-surface-sunken center plane
    └── StationWorkbench       ← transparent fill; reserveIdentityClearance + terminal clearance
        ├── scroll: children → feedback  (Unbox: `tabs` EMPTY — the carton overview
        │                                 is the whole body; entityContext/toolbar
        │                                 unused for Unbox-family)
        ├── footer (optional sticky band; Unbox leaves null —
        │            ReceiveFeedbackRegion rides in the dock float stack)
        └── dock                   ← Unbox / Support Ticket: OmnichannelComposerDock
                                     floating over the canvas (absolute; not an
                                     in-flow shelf) with embedded CTA in
                                     trailingAction; Unbox receive confirmation
                                     mounts above UnboxDockHost in this stack;
                                     tab-aware stations: full-width
                                     StationTerminalDock

Right edge (exactly one at a time, LineEditPanel wires the exclusion):
  Displays (`?display=<tab>`) ∪ `detail:receiving` ∪ AI
  — Displays index (PO-identity first): Listings · Classify · Pairing · Inventory · Units ·
    Photos · Ticket · Tracking · Timeline · Support
    (Audit folds under Timeline; checklist = under-dock ring + Root Index leaf)
  — Ticket: presence-exclusive Claim vs Chat (`?ticketAction=` derived from
    linked ticket; Claim keeps `?claimMode=` for New · Link)
  — Photos: armed-row Actions (default) + URL drills Move · Send · Compare (`UNBOX_PHOTO_ACTION_ORDER`; absent / legacy browse → Actions; Compare = evidence trailing; no parent TabDisplay; trail via `useDisplaysLeafChrome`)
  — Linkage = Pairing hub + Zoho note (`?linkageAction=link|note`) — **debt:** parent underline TabDisplay (migrate to armed rows)
  — Units = Units · Prebox (`?unitsAction=`) — **debt:** parent underline TabDisplay (migrate to armed rows; Prebox mode stays child segment)
  — Inventory = secondary vertical drill (Information · Lines · PO notes · Activity)
    via `useDisplaysLeafChrome` — top-left ← → + current title; trail depth via Back/Esc; Change PO → Linkage;
    reconnect → Settings
  — compose UnboxPushColumn (flush DETAIL_STACK_PUSH_COLUMN_CLASS)
  (no parked expand strip — ticket reopen = carton Reply → `display=ticket`;
   Displays opens from pane ←| edge toggle; checklist via under-dock progress ring;
   open ↔ close is one control via layoutId handoff onto column →|)
  AI (Sparkles) yields / is yielded — never dual full right with station push

Operator copy SoT (`StationDisplaysEdgeToggle`):
  Closed → pane top-right `←|` **Open displays**
  Open   → column footer `→|` **Hide displays** (names the REGION, not the tab)
  Chord  → **⌘/Ctrl+]** is the same action as the mounted edge toggle click
           (owner: `displays-toggle-hotkey.ts` inside `StationDisplaysEdgeToggle` —
           not a per-panel listener). Desk inspector keeps ⌘\ + bare `]`.
  Carton `↑ ↓` beside the pane `←|` are the **carton cursor** (next/prev carton) —
  not Desk inspector prev/next. Never rename this edge to “Open inspector” /
  “details editor” — that conflates Station Displays with History Band 3 /
  LineEdit. Law: source-of-truth.md → Displays vs inspector.
```


**Unbox overview dock — flush floor instrument.** The band floats over the
scroll canvas (`absolute inset-x-0` + `reserveScrollClearance`).
**`UnboxDockHost` is a flush `bg-surface-card border-t` plane** — no raised
`Panel`. Capture entry is fixed `h-11`; notes mode escalates to
`DenseComposeFields` (sunken body, may grow). Modes swap the **leading** zone
(`entry` | `notes`). Notes write `receiving_line.notes` via
`UnboxDockNotesEntry`. The FileText toggle is hidden on `serial` dominance.
`StationTerminalDock embedded` mounts in trailing **only when settled**
(`!activeKey && !isReceived`). When received, leading paints Procedure Complete /
Move to Labels. Support service workspace (`SupportTicketFocus`) keeps its
always-on raised `OmnichannelComposerDock` + embedded Reply because **the ticket
is the work entity**. Unbox **and** Testing Ticket Displays keep the composer
**inside** the card via `SupportTicketDetail` (inline) — never a second
canvas-absolute dock fighting the carton floor:

```
capture (activeKey set — terminal unmounted):
┌─────────────────────────────────────────────────────────┐
│ [SERIAL wedge ≥80% / step CTA]              [FileText?] │
│ · Scan device serial to continue                        │
└─────────────────────────────────────────────────────────┘

settled (!activeKey && !isReceived):
┌─────────────────────────────────────────────────────────┐
│ [empty / done cue]              [ ▾ | 🖨 Print · Receive ] │
└─────────────────────────────────────────────────────────┘

notes (DenseCompose escalate — may grow):
┌─────────────────────────────────────────────────────────┐
│ NOTE / ENTRY                                   [Done]   │
│ ░░░░░░░░░ sunken DenseCompose body ░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────────────┘
```

- `SlicedActionDock` `embedded` renders **only** the pill track (`h-9`,
  no band padding / safe-area / absolute float) — the host control owns
  placement. `slicedActionDockWrapperClass()` is the pure placement SoT.
- Dock notes: Done / ⌘Enter saves + closes notes; blur still saves. Never fire
  Print·Receive from notes commit during capture. Tall `OmnichannelComposerDock`
  / insert rail are not in this band (PO-note display owns sync / insert chrome).
- The VM→dock mapping stays in `StationTerminalDock` (`embedded` prop) so the
  registry remains the single terminal path — never hand-thread `TerminalActionVm`
  fields into `SlicedActionDock` at a call site.
- `disabledReason` is the host's line above the dock band (settle only).
- **Never** mount a second `StationTerminalDock` band under the overview dock.
- **Never** co-mount Print·Receive with an active step studio
  (guard: `unbox-dock-one-shell.guard.test.ts`).

`StationWorkbench` still accepts optional `toolbar` / `entityContext` for legacy
or non-identity chrome (e.g. Labels Queue/Print band, Triage recommendations
strip, Pickup product summary). Do **not** put `CartonContextCard` identity
there for Unbox-family stations — mount it in `StationContextBar` instead.

Overlays (photo peek, modals) compose **around** `StationWorkbench`, not inside it.

Unbox overview mounts the dock as an **absolute float over the canvas** via
`UnboxDockHost` + `slicedActionDockWrapperClass({ docked: false })` with the
Receive/Print split-CTA **inside** that shell — not a mid-canvas nested notes
card, not an in-flow shelf/lip band, and not a second CTA row beneath it. Label
preview stays in the scroll body. Other Unbox tabs keep a full-width centered
terminal.

---

## Introspective reuse (new station checklist)

1. Add one row to `WORKSPACE_MODES` only for receiving-family chrome; every docked adopter adds `STATION_TERMINAL_REGISTRY`
2. Thin adapter: controller → `CartonContextCard` props (omit optional claim/photos/classify/lifecycle/PO$)
3. Mount adapter in `StationContextBar` above `StationWorkbench` (`placement="flow"`). Refresh / Pair corner `StationHeaderToolbar` is retired on Testing — Pairing is a Displays tab; Unbox may still pane-anchor utilities when Ticket can push. Lookup utilities → `/carton/[id]`
4. Tab defs with visibility gates → `buildSectionTabs()`
5. Terminal resolver in `{station}/terminal/` — tab id → `TerminalActionVm`
6. Compose `StationWorkbench` — never hand-roll `relative flex h-full min-h-0 flex-col`

Adding a tab = one registry row + one content component + one resolver branch.
Shell, bookmark chrome, slider chrome, and dock renderer stay untouched.

---

## Cross-station procedure port checklist (Tier A)

What a Tier-A bench must adopt to claim the instrument-panel procedure pattern. Identity:
[`instrument-panel.md`](instrument-panel.md). **Chrome guards can pass while the UX diverges** —
this list is the part the guards do not cover.

| # | Requirement | Status |
|---|---|---|
| 1 | A **single derivation hook** returning `ProcedureStepRow[]` + `activeKey` | **Must** — no bench may compute steps twice |
| 2 | Step order from a `deriveProcedureSteps`-shaped vocabulary SoT | **Must** — pinned by `src/lib/stations/procedure-divergence.guard.test.ts` |
| 3 | Active-step pointer via `resolveActiveStep` | **Must** — shared with the read model |
| 4 | Centre **focus deck** (`ProcedureDeck`) | **Must on `unbox-work` / derived-procedure benches**; **main Unbox exempt** (PO lines + label — see Unbox centre above) |
| 5 | **Realtime subscription** on the evidence channel | **Must** — P6; a lagging checklist is worse than none |
| 6 | Edge **checklist display** + under-dock **ring** entry | **Must** — under-dock ring + Root Index leaf; no strip cell / `rightSlot` |
| 7 | Terminal action via `STATION_TERMINAL_REGISTRY` | **Must**, or a `TERMINAL_HAND_VM_ALLOWLIST` entry with a port follow-up |
| 8 | Ephemeral, entity-keyed focus store | **Must** — never a URL param |

**Unbox is the reference implementation of all eight.** Testing and Triage are the port targets;
port a bench in one change rather than adopting rows piecemeal, because rows 1 and 6 are only
coherent together — a checklist reading a second derivation is the exact failure the two-view model
exists to prevent.

**Tier B (Shipping, Pickup, Labels, Packer review) does not inherit this.** Those benches keep
the 720 column and `StationWorkbench`; whether they get a progress instrument at all is open (their
work is not a derived per-entity procedure, so the ring may have nothing honest to draw). **Pack**
is Tier A for Displays grammar but stays **ring-exempt** with its terminal-exempt dock (no sticky
procedure progress). Do not
port the ring to a Tier-B bench just for visual parity — a ring that always reads 0% or 100% is
chrome inventing a second story.

**Tier C (Support ticket, Support orders, Pack terminal) is exempt by documented exception** — do
not force Unbox chrome onto them.

### Porting gotcha — the export surface

`ProcedureDeckProps` and `ProcedureCardFace` are currently **module-private**, and
`ProcedureStepState` is not in the `procedure/` barrel. A porting bench must supply a `face()`
mapper whose return type it cannot yet import. **Export those in the same change that first consumes
them** — exporting ahead of a consumer adds a new knip finding and fails `npm run verify`.

---

## What stays station-specific

| Concern | Local | Shared waist |
|---|---|---|
| Form state / handlers | Controllers (`useUnboxLineController`, …) | — |
| Tab content bodies | Domain cards | `WorkspaceCard`, `SectionTabsSlider` |
| Overview Notes + Label preview | Notes: `UnboxDockHost` notes mode (`UnboxDockNotesEntry`); label: `UnboxLabelPreview` in scroll; step CTA via `UnboxStepDock` | `UnboxDockHost` + `StationTerminalDock`; glass worksheets for label / other tabs via `WorkspaceCard` `bodyDensity="nested"` + `WORKSPACE_NESTED_FIELD*` |
| Content tabs (checklist / units / timeline / manuals) | Station tab bodies | Same `bodyDensity="nested"` — keep `space-y-*` on inner wrappers |
| Terminal VM assembly | `resolveUnboxTerminal`, … | Registry + `StationTerminalDock` |
| Step gate inputs | Photo count, serial, label printed | `deriveLinearStepStates` walk |
| Entity field wiring | Classify, linked order | `CartonContextCard` props |

---

## Glass nested worksheet recipe

Stacked overview cards and non-overview content tabs share one body pad via
`WorkspaceCard` `variant="glass"` + `bodyDensity="nested"` (`p-3`). Label inside
the procedure focus deck uses `WorkspaceLabelPreviewCard` `chrome="procedure"`
(bare face — Smart Stack evidence card owns the frame); Testing / non-deck hosts
keep `chrome="worksheet"` (default glass + nested). Inner white fields compose:

| Token | Value | Role |
|---|---|---|
| `WORKSPACE_NESTED_FIELD` | `rounded-xl border … bg-surface-card` | White inset (concentric: glass `3xl` − `p-3` ≈ `xl`) |
| `WORKSPACE_NESTED_FIELD_PAD` | `inset-field` (`px-3 py-2`) | Default inset pad (Label, PO note, claim) |
| `WORKSPACE_NESTED_OVERLAY_CORNER` | `right-1.5 top-1.5` | Default overlay inset (Label Edit, claim insert rail) |

Unbox overview carton notes use **`OmnichannelComposerDock`** floating over the
terminal dock edge (absolute band via `slicedActionDockWrapperClass({ docked: false })`,
not nested-field chrome and not an in-flow shelf).

**Do not** force this recipe onto flush entity chrome (`CartonContextCard`
`px-0 py-0`), Shipping solid pairing cards, ShippedNotesComposer, or admin
`rounded-lg` regions.

## Multi-section scroll host — floor ownership (Section Host)

**Ruled 2026-08-04** — `docs/todo/station-multi-section-scroll-host-RULING.md` (research:
`station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md` +
`station-multi-section-scroll-host-MOTION-FINDINGS.md`). Extends **Scroll ownership**
(`ui-design-system.md`) and the Procedure Focus Deck law above with the host that will sit
**above** the deck once Items reference gains its own immersive triage mode. Industry name: an
**exclusive-disclosure panel system** — the VS Code Panel / Secondary Side Bar and the
Shopify POS cart-vs-grid shell are the closest named precedent: click a chrome header, it claims
the shared floor above a persistent bottom action plane, siblings collapse to chrome — never two
competing immersive scrollports, never a modal takeover.

- **Exactly one floor owner.** Named sections (`items`, `procedure`, …) each carry a **chrome**
  face (collapsed) and a **body** (floor). One `activeId` state value decides which section is
  immersive — same shape as Radix `Accordion.Root type="single"` (one value, one setter,
  `isOpen = activeId === id`), **not** its `height: auto` mechanism (below).
- **Default owner is `procedure`, never a split resting state.** The deck stays the hero at rest
  (prominence law, above) — WMS/POS directed-workflow precedent (Manhattan, Toast) keeps the
  active task dominant at rest; a permanently split view dilutes the one thing a focus-locked
  wedge operator should be looking at. Items immersive is a **transient, operator-invoked mode**,
  not a second resting state — compatible with "deck is the hero" the same way opening Displays
  is: it is a mode the operator chose, not a standing demotion (Square POS line-item overlay is
  the same shape — the checkout plane stays pinned underneath).
- **Mechanism: bare `layout` + `LayoutGroup`, never `layoutId`.** Each section is a flex/grid item
  whose size changes via a class/style swap (`flex-grow` or `grid-template-rows`), carrying
  Motion's `layout` (or `layout="position"`) prop; both sections wrap in one `LayoutGroup` so a
  re-render in one is visible to the other in the same frame (`react-layout-animations` docs —
  "Group layout animations"). **A shared-element (`layoutId`) full-screen modal/overlay is
  refused** — that is Motion's own closest canonical example (`app-store`) and it is the wrong
  grammar: a scrim takeover conflicts with the non-modal, always-visible-siblings requirement here.
  `AnimatePresence mode="popLayout"` does not apply either — sections never unmount (procedure
  steps stay evidence-derived and mounted; see Non-negotiable invariants).
- **Motion: reuse `motionRole.push.rail` (`motionBezier.layout`, 0.24s tween), do not mint a new
  duration.** This job — a panel that makes room for itself, tween not spring, because a sibling
  measures against the resulting size — is exactly `push.rail`'s stated job
  (`motion-crossfade.md`). Do **not** reach for a spring (overshoots the value the collapsing
  sibling's chrome height must land on) and do **not** share `procedure.advance`'s 0.55s (that is
  step-pointer content settle inside the Procedure section, a different job one layer down).
  Reduced motion: instant reflow, opacity-only fade (~0.1s) on the newly-immersive content.
- **Clearance stays a named fixed rem** (`STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` = `10rem`,
  unchanged) — **never** a per-frame `ResizeObserver` on dock height; that thrashes layout and
  makes the stick point jump when the notes composer opens. When notes expand the dock band, swap
  to a second, larger named token — let the CSS transition, don't measure.
- **Collapsed chrome carries a minimum height of `56px` (`3.5rem`)**, not a bare 40px strip. A
  chrome row immediately above the dock is a Fitts's-Law hazard — too short and a "return to
  work" tap risks the dock's own CTA instead. Precedent: Spotify Now Playing bar, iOS Mail's
  bottom-anchored structural headers, both hold this floor. Give the collapsed face a clear
  state change (or a "back to Procedure" chevron) so a misclick reads as recoverable, not silent.
- **The wedge keeps focus. Full stop.** A section-expand control is a click target, never a focus
  target — do not `.focus()` into the newly-immersive section on expand. The scan bar's
  `useRegisterScanTarget` binding must survive every expand/collapse; the same "hand focus back"
  rule the Smart Stack's own controls already follow (`instrument-panel.md` — "Let the wedge own
  focus"). Keyboard: the chrome trigger itself is a normal Tab/Enter-reachable control (WCAG
  2.1.1) — that's the full a11y surface; it must not additionally steal or trap focus once
  activated.
- **Mobile ports the same definite-height contract, not a new one.** `min-h-0`/`flex-1` on
  `100dvh` is the same recipe Material bottom-sheets and iOS web full-screen routes already use;
  do not special-case the CSS contract for phone, only the chrome (full-screen route per section
  vs in-column chrome collapse is a layout *choice* the contract supports either way).

## Related

- Station scan contract: [`station.md`](station.md)
- Workbench (master–detail) contract: [`workbench.md`](workbench.md)
- Code: `src/components/station/workbench/`
- Entity header + bookmark chrome barrel: `src/components/station/entity-context/`
- Terminal registry: `src/lib/station-terminal/`
- Nested field SoT: `src/design-system/components/WorkspaceCard.tsx`
