# Station display — scan → crossfade → display

Deep dive on the **scan-driven operator bench** (region **contract**): the focus-locked scan loop, the single
active-entity card that replaces on each scan, scan-to-confirm gating, station-down state, the throughput HUD, and the
phone variant. Density default: **`floor`**. Presentation of the active entity is a **fact stack** resolved via SoTs —
not a browse list. This is the contract most often regressed by bolting Workbench browse affordances onto it.

House identity: **Kinetic Ledger**. Inherits: ../ui-design-system.md (tokens, density, presentation kinds, one-row
anatomy, chips, HoverTooltip, icons). This doc only adds what is *station-specific*.

> The discriminator (from ../contextual-display.md): **does this region react to a *scanner*, or to a *pointer*?**
> A scanner — keyboard-wedge/barcode/camera — short-circuits straight to Station. Hands are busy; throughput is the job;
> one transient entity at a time.

---

## 1. When to choose Station — the scanner short-circuit

- **If the primary input is a scanner/keyboard-wedge and the operator is standing at a bench, it is a Station — full
  stop.** Pack, receive/unbox, test, ship, mobile scan flows. This is Q1 of the decision algorithm and it wins over
  every other signal: cardinality, feature area, route. *Rationale: the operator's hands are on product and a scanner,
  not a mouse; any affordance that demands a pointer competes with the only thing that matters — the next scan.*
- **The anti-mix guard:** a page may host a station bench *and* a pointer-driven inspector, but **each region obeys
  exactly one archetype** — never blend them in the same region. The classic regression is dropping a browsable,
  clickable list into the scan column "so they can pick one." That is a Workbench; it belongs in a different region or a
  different page. *Rationale: a list invites a pointer and steals focus from the scan input; the moment focus leaves the
  bar, the wedge types into nothing.*

> Rule of thumb: if the input is a scanner and the operator's hands are busy, the **screen serves the scan, not the
> pointer.** No browsable lists, no hover-reveal detail, no persistent selection.

For the **right-pane unit editor** that opens after a scan (Unbox / Testing / Shipping body), compose
[`station-workbench.md`](station-workbench.md) — StationContextBar → SectionTabsSlider → terminal dock —
instead of hand-rolling a parallel shell.

---

## 2. Anatomy

Top-to-bottom, a station is four parts and nothing more:

| Part | Module | Rule |
|---|---|---|
| **Focus-locked scan bar** (top, sticky) | `StationScanBar` / `ThemedStationScanBar` (`src/components/station/scan-bar/`) | One input, auto-focused, the *only* primary control. |
| **Entity-context header** (active carton / line / ship order) | `CartonContextCard` + `StationContextBar` via `@/components/station/entity-context` | In-flow two-row identity (`placement="flow"`, `reserveIdentityClearance={false}`) above the work canvas. Unbox golden; Triage/Testing/Shipping/Pack compose via thin adapters. Never fork. |
| **Procedure progress chrome** (when the bench has a derived procedure) | `ScanStationProgressControl` + `ScanStationProgressRing` (`src/components/station/`) | Bare ring (not `GoalRing`) for stations that still mount strip progress. **Unbox:** the compact procedure-% ring sits **under the dock (Band 2 right — `UnboxScanProgressControl`)**, always mounted, and opens the Checklist Displays leaf (checklist body stays a Displays leaf). Not on a Displays `rightSlot`; closed Displays opens via `←|`. |
| **Single active-entity card** (replaces on scan) | `ActiveOrderScanFeedback`, `PackChecklist`, `StationPacking` | One card; the new scan's card *replaces* the previous one. |
| **Minimal chrome / goal HUD** | `StationGoalBar` (composed in `StationPacking`) | Ambient throughput only; never a control surface. |
| **Station-down chrome** (no app-root banner) | `connection-health` + `useNetworkOnline` / `useRealtimeLink` → Operations TV pill + mobile `NetworkChip` | First-class, non-blocking; degrade-not-block. Never a per-bench reconnect strip. |

- **Compose the scan bar, never re-wire its chrome.** Geometry, padding, icon slot, and placeholder styling live in
  `src/components/station/scan-bar/tokens.ts` (`STATION_SCAN_BAR_INPUT_CLASS`, `STATION_SCAN_BAR_ICON_SLOT_CLASS`, …).
  Domain benches (tech, testing, receiving, pack, FBA) wrap `ThemedStationScanBar` inside `ScanBandShell` (glow), which
  layers the staff-theme border + focus + submit trace onto the core `StationScanBar`. Focused chrome is the staff
  bottom-rule + glow host — not a page-local ready HUD / armed-face overlay (reverted 2026-08-10 after it fought
  Enter/wedge submit speed). Mode-rail stations keep short placeholders + leading mode icons. Never a page-local
  cyberpunk twin or raw `motion/react` import. The mode / paste / spinner rail is an **absolute frosted veil**
  (`backdrop-blur-sm` + translucent card + left fade) over the full-bleed input — long typed text soft-peeks under
  the glyphs when idle. Clearance is **measured** (`ResizeObserver` → `padding-inline-end`), never magic `pr-*` /
  `rightPadClass`. *Rationale: one geometry SoT; frost beats an opaque wall; measured pad tracks 1–4 modes;
  wedge Enter must stay a plain form submit.*
- **Compose the entity-context header, never fork it.** Inbound carton benches (Unbox, Triage, Testing)
  and Shipping / Pack / Pickup active-order chrome import `CartonContextCard` + `StationContextBar`
  from `@/components/station/entity-context`. Thin adapters map controller bags → props; omit
  optional props to hide claim / photos / classify / lifecycle / PO$. Pair hosts with
  `reserveIdentityClearance="stacked"`. *Rationale: the two-row flush identity is the Unbox golden —
  a second header grammar splits operator muscle memory across stations.*
- **The card region uses `flex-1 overflow-y-auto`; the scan bar stays pinned above it.** See `StationPacking` — scan
  bar in the header band, results in the scroll body. *Rationale: the bar must never scroll out from under a working
  operator.*
- **Recent-activity rails scroll through `SidebarRailScrollport`.** Unbox / Triage / Testing / Shipping / Pack / Pickup /
  FBA / Support / Labels / Dashboard recents — the host wraps the feed in
  `@/components/sidebar/rail-shell/SidebarRailScrollport` (flat bottom "more below" fade via `useMoreBelow` +
  `SCROLL_MORE_BELOW_CLASS`). Never hand-roll a second bottom fade; `SidebarRailShell` stays content-sized and does
  not own vertical scroll. *Rationale: one scroll-edge affordance across every station recent dock.*

---

## 3. Focus-lock loop

The single most load-bearing behavior. A station that loses focus is a station that drops scans.

- **Every primary bar registers itself as the global hotkey's focus target via `useRegisterScanTarget`**
  (`src/lib/scan-hotkey/useScanHotkey.ts`), which `StationScanBar` calls for free (`hotkey` prop, default `true`).
  *Rationale: the most-recently-mounted bar wins the key (`registerScanTarget` pushes onto a stack in
  `src/lib/scan-hotkey/store.ts`), so the page's active bench always owns the hotkey with zero per-page wiring.*
- **The focus hotkey is global and configurable — the binding SoT is `DEFAULT_FOCUS_SCAN_HOTKEY`
  (`src/lib/schemas/staff-preferences.ts`, today `Insert`; `Insert` · `ScrollLock` · `F1`–`F12` are the legal set).**
  `store.ts` installs exactly one `keydown` listener lazily on first subscribe and focuses+selects the top target; the
  binding hydrates synchronously from `localStorage` (durable SoT is `staff_preferences`). *Rationale: an operator who
  tabbed away or clicked a modal hits one key to slam focus back to the bar — without it the wedge fails silently.*
  **Never re-type the key into prose or a test** — four rule files said "F2" for months while the code defaulted to
  `Insert`, and the first spec written from the docs failed against the real bench
  (`tests/e2e/unbox-scan-focus.spec.ts` imports the constant instead).
- **Auto-refocus after every submit.** On submit the bar clears the input and the host re-focuses it
  (`setTimeout(() => inputRef.current?.focus(), 0)` in `StationPacking`'s `handleSubmit`). *Rationale: the operator
  scans the next entity immediately; a one-tick defer lets React commit the cleared value before focus returns.*
- **Add a focus-watchdog for blur/`visibilitychange`.** Modals, tab-aways, and on-screen keyboards steal focus — the
  classic wedge failure mode. Re-grab focus when the bar blurs unexpectedly or the tab regains visibility. *(The global
  hotkey target covers the manual case; a watchdog covers the silent one. Do not block the operator while down — just
  put the cursor back.)*
- **Guard against wedge terminators / split scans.** A keyboard-wedge ends a scan with Enter (form submit) but can also
  fire fast partial bursts; debounce or gate re-entrant submits (`inFlight`/`isLoading` guards in
  `StationPacking`, `MobilePackerFlow`, `UniversalScan`). *Rationale: a double-fire must be a no-op, not a double-effect
  — pair this with per-scan idempotency (§7).*

---

## 4. Scan classification

The bar is dumb; classification is a pure layer.

- **Classify the raw value before routing.** `detectStationScanType` (`src/lib/station-scan-routing.ts`) maps a raw
  string to `TRACKING | SERIAL | FNSKU | SKU | REPAIR | COMMAND` by precedence (`:` → SKU, `RS-#` → REPAIR, FNSKU shape,
  command words, then carrier/serial heuristics from `scan-resolver`). *Rationale: one classifier keeps carrier/serial
  heuristics out of every bench; the bench just dispatches on the returned type.*
- **Make classification context-aware.** `resolveScanType` (`useStationTestingController.ts`) overrides the base type
  using the active entity: when an order is still short on serials, a *carrier-unknown* "tracking-looking" barcode is
  treated as a product **SERIAL**, while known carrier prefixes still route as TRACKING. *Rationale: the operator
  shouldn't have to arm a mode mid-flow — the incomplete order tells us the next scan is almost certainly a serial.*
- **Forced types exist for explicit modes** (`handleSubmit({ forcedType })`) but are the exception; default to the
  context-aware resolver.

---

## 5. Single active-entity rule

- **One card. The new scan's card replaces the previous one.**
  **Scoped exception (2026-08-01, re-shaped 2026-08-02) — the Unbox guided
  procedure.** *Within one carton session* the procedure renders as a **focus
  deck**: one expanded step card at the bottom, its completed steps as full rows
  above it, and the next step as a single peek tucked behind it. Those are the
  SAME entity's ordered steps — that carton's own evidence trail — not a browse
  list of other entities, so the "one transient entity" contract holds. A new
  **carton** still replaces the whole deck (`UnboxProcedureDeck` remounts on
  carton change, and the focus store is carton-keyed so a pointer cannot leak
  across a scan).
  The exception buys nothing elsewhere: it does not license a scan bench to keep
  a list of previous scans, which is the browse-list-in-a-station anti-pattern §1
  bans. Recipe + geometry: [`station-workbench.md`](station-workbench.md).
  `StationPacking` and `ActiveOrderScanFeedback` render
  the active entity inside `AnimatePresence mode="wait"` keyed on the entity id (`activeOrder.tracking`,
  `activeFba.fnsku`). *Rationale: `mode="wait"` exits the old card before mounting the new one — there are never two
  cards on screen, which would imply a list the operator must choose from.*
- **Selection is ephemeral — never URL-addressable.** The controller (`useStationTestingController`) holds the active
  entity in component state (`activeOrder`), not in `searchParams`. It is resolved → acted on → cleared. *Rationale:
  act-and-clear is the station contract; a durable `?id=` selection is a Workbench tell (see ../contextual-display.md).*
- **Act-and-clear — no timed auto-hide.** The active card stays until the next scan
  replaces it or the operator clears it. Do not start a dwell timer
  (`COMPLETED_ORDER_AUTO_HIDE_MS` and twins) that hides finished work behind the
  operator's back. *Rationale: a finished entity must stay readable for confirmation /
  undo; the next scan is the clear.*

---

## Procedure cockpit — primary work surface, two views, one derivation

*(Unnumbered on purpose — the numbered sections are cross-referenced by other rule files; do not
renumber them to slot this in.)*

For a bench whose work is a **derived procedure** (Unbox golden; Testing / Triage are the port
targets). Identity + principles: [`instrument-panel.md`](instrument-panel.md).

**The centre focus deck is the most prominent component on the bench** — larger visual weight
than Displays, items reference, or the dock. The operator glances here between physical acts.
Full law: [`../source-of-truth.md`](../source-of-truth.md) → Scan-station procedure focus deck.

| Where | Surface | Answers | Module | Prominence |
|---|---|---|---|---|
| **Centre** | focus deck | *What do I do right now?* | `ProcedureDeck` via a domain wrapper — flat expandable list (full faces · one expanded body) | **Primary — hero surface** |
| **Right edge** | checklist display | *Where am I in the whole job?* | `ProcedureChecklist` as a Displays body | Secondary navigation |
| **Under the dock (Band 2 right)** | progress ring | opens / closes / switches the checklist | `ScanStationProgressControl` (`UnboxDockHost.progress`) | Checklist entry; always mounted with the dock |

- **One derivation, however many views.** Both surfaces read the same hook
  (Unbox: `useUnboxProcedureSteps`). Two views was never the hazard — two derivations drifting was.
- **Step advance is content crossfade, not layout motion.** When the pointer moves, the
  deck expands the new focus body in place; title crossfades via `swap.scan`; evidence
  uses `procedureFocusBody`. No peek pile, no `layout="position"` settle on this surface.
- **The checklist is a DISPLAY the operator picks, not a region.** It is mutually exclusive with the
  other Displays tabs, and it is not a `RightRailHost` occupant. A surface that should stay visible
  while the operator works is a display they chose, never a second permanent consumer of the edge.
- **Live is a requirement, not polish (P6).** The hook subscribes to the carton's photo realtime
  channel so a capture taken on the **phone** lands on the bench without a refocus. A display that
  lags the scan is worse than none — the operator trusts it and re-shoots.
- **A checklist row click moves the CENTRE's focus.** The map navigates the work, which is why the
  focus pointer is a shared store (`procedure-focus-store.ts`), carton-keyed and ephemeral — never a
  URL param, because Station selection is ephemeral by contract.
- **Steps are evidence-derived.** `skipped` is a waiver without evidence and never renders a check.
  Hand-ticked lists (`checklist_templates` + `/api/checklists`) were deleted 2026-08-01 and stay
  deleted.

### Ring placement + interaction matrix

The ring lives **under the dock, Band 2 right** (`UnboxDockHost.progress` →
`UnboxScanProgressControl`) — always mounted with the dock (hidden only in notes
mode), **not** on a Displays `rightSlot` (guard-banned) and not in the pane utility
corner (pane top-right stays carton `↑ ↓` only). The checklist body stays a
Displays leaf (`stripHidden`, no Lucide strip cell) and is also a Root Index row.
Closed Displays opens via `←|`.

| Current state | Ring click |
|---|---|
| Displays open on checklist | Close Displays |
| Displays open on another tab | **Switch** to checklist — do not close |
| Displays closed | Ring stays visible under the dock — click opens the Checklist leaf |

Bare 16px SVG, **no numeral inside**, no card plate behind it; `tone="selected"` while the checklist
is live. It is **not** `GoalRing` (daily-goal pace, GlobalHeader) — that swap is the most-repeated
mistake on this surface. Hover peek is suppressed while any right-edge push (Displays / Ticket / Claim / tool) is open (`railOpen`).

### Anti-patterns

- **A Checklist Lucide cell on the Displays icon strip, or a `rightSlot` ring.** The
  checklist's two entries are the under-dock procedure ring and its Root Index leaf;
  a third door is control duplication.
- **An always-on procedure column.** That is a third right-edge grammar; one was built and retired
  within a day — [`../source-of-truth.md`](../source-of-truth.md) → Right-rail modality.
- **A hand-ticked step**, or a `skipped` step drawn as done.
- **A per-station re-derivation** of step order. `deriveProcedureSteps` is the vocabulary SoT and
  `resolveActiveStep` is the pointer.
- **Demoting the deck below another centre surface** — PO accordion, label preview peer, procedure
  sidebar, or tab strip that splits attention with the focus deck.

---

## 6. Scan-to-confirm + multimodal feedback

- **Gate progress on a *matching* scan, not a click.** `PackChecklist` merges the SKU's kit-parts BOM with its QC verify
  steps; under `block_until_matched` enforcement it raises a hard "items still to include" signal until every critical
  part is confirmed, while `advisory` only warns. The blocked verdict comes from the shared SoT
  (`evaluateKitReadiness` in `src/lib/packing/kit-readiness.ts`) so the banner and the `kit_verify` engine node can
  never disagree. *Rationale: the checklist guards correctness without ever requiring the operator to leave the scan
  loop — a fresh SKU clears every tick (`resetKey`).*
- **Make pass/fail a big card state, not a toast.** `ActiveOrderScanFeedback` shows the running progress meter
  (`scanned/qty`, `complete`), a status chip, and a transient "Last serial" row on each new scan — all inside the
  active card. Status tones derive from semantic tokens / the lifecycle dot registry
  (`workflowStageDot`, `src/lib/receiving/workflow-stages.ts`), never ad-hoc hues. *Rationale: an operator three feet
  from the screen with their hands full needs a glanceable card state; a 4-second corner toast is invisible at the
  bench.*
- **Pass and fail are mutually exclusive chip states on the active card.** Emerald **Active** / **· complete** only
  when the scan is linked to a real order. Unmatched tracking (`orderFound: false` / `sourceType: 'exception'`) is an
  amber **No order** / **· not linked** exception session — never green Active, never "N units paired", never a success
  flash that implies the record was found. Hard rejects (HTTP error / 409 / ambiguous partial) clear or revert the card
  and show a **big rose fail card** in the same feedback slot (`StationTesting` / `StationPacking`), not a corner toast
  and not `window.alert`. *Rationale: silent success is the CF-02 anti-pattern; WMS "hard interrupt" modals are the
  opposite extreme — they steal scanner focus. House Station uses honest card states and keeps the bar focus-locked.*
- **Exception sessions stay in the scan loop.** Unmatched tracking opens a hold-bucket card (`orders_exceptions`); the
  operator may keep scanning serials into that session for later reconciliation. That is *continue-with-honesty*, not
  a Zebra-style blocking dismiss overlay. *Rationale: throughput + durable exception fact > modal interrupt that drops
  wedge focus.*
- **Add a non-visual cue for the eyes-down operator.** Pair the visual pass/fail with an audio/haptic confirmation
  (success vs reject tone). *Rationale: the operator is looking at product, not the screen — sound closes the loop when
  the eyes can't.*

---

## 7. Optimistic act + idempotency

- **Mint a per-scan `clientEventId` / `idempotencyKey` and thread it through the mutation.** The controller generates
  one per scan (`newStationIdempotencyKey` → `crypto.randomUUID()` in `useStationTestingController`) and passes it into
  the scan handlers' context (body and/or `Idempotency-Key` header). *Rationale: a flaky-network retry (or a wedge
  double-fire) carries the same key, so the server collapses it to a no-op.*
- **The server must honor the key the client already mints.** Station mutation routes (`/api/tech/scan`,
  `/api/tech/serial` + wrappers, receiving unbox) read via `readIdempotencyKey` and persist through
  `api_idempotency_responses` (`src/lib/api-idempotency.ts`). A client that sends `idempotencyKey` while the route
  drops it is a SoT bug — optimistic UI is unsafe without the server contract. *Rationale: the Station ACT step assumes
  retries are free; without route-level replay they are not.*
- **Render the acted state immediately and increment the HUD optimistically; reconcile against the server result.**
  The progress meter bumps on the local serial count (`ActiveOrderScanFeedback`) before the server confirms.
  *Rationale: at scan cadence the operator can't wait a round-trip per scan; optimistic UI sits *on top of* the
  idempotent server contract, it never replaces it.*
- **On 409 / reject, revert the card with a big fail state (not a toast).** Status changes go through
  `transition()`/`applyTransition()` with `expectedFrom` (../backend-patterns.md), which returns 409 on a conflicting
  prior state; the bench reverts the optimistic increment and shows the fail card. The reversible secondary action
  (e.g. **Undo last serial** in `ActiveOrderScanFeedback`) lives in a footer row, separated from the primary status.
  *Rationale: a conflict is a real event the operator must see at the card, and undo is a deliberate secondary action,
  not the primary signal.*

---

## 8. Station-down is first-class

- **No app-root connection banner.** The retired layout/mobile `OfflineBanner` twins are gone (2026-08-05). Station-down
  is still first-class: the **answer** lives in `src/lib/realtime/connection-health.ts` (pure, unit-tested) and is read
  through `useNetworkOnline()` / `useRealtimeLink()` (`src/hooks/useConnectionHealth.ts`). Visible chrome is the
  Operations TV wall pill (`REALTIME_DEGRADED_LABEL`) and mobile `NetworkChip` — never a fixed top band, never a
  per-bench reconnect strip (D4). *Rationale: the top band stole viewport on every Ably blip and trained operators to
  ignore it; degrade-not-block + durable queue is the real floor safety net.*
- **THREE different problems, ONE answer, resolved in ONE pure module.** Device offline · realtime link paused · edits
  still draining are not the same failure. Debounce and classification are decided once in `connection-health.ts`.
  **Placement may differ; the answer may not.** Four surfaces each ran their own `navigator.onLine` listener before
  2026-08-02; do not reintroduce a fifth listener or a per-bench strip.
- **Realtime state is published to a MODULE STORE, never added to the Ably context value.**
  `src/lib/realtime/connection-store.ts` (`useSyncExternalStore`) carries it; `AblyContext`'s value stays exactly
  `{ getClient }` on an empty-dep `useCallback`. *Rationale: that value has ~23 consumers, and widening it so it
  changes on every reconnect re-fires precisely the effects whose churn once flooded Ably at >1000 msg/s.*
- **Debounce the transient; never name the mechanism.** Ably `disconnected` is what a routine wifi hiccup looks like,
  so it is reported only after it holds for `REALTIME_DEGRADE_GRACE_MS` (8s); `suspended`/`failed` arrive
  pre-debounced and report on sight; pre-init is `unknown` and reports **nothing** (a sign-in page has no station link
  to be down). Operator-facing labels state the *consequence* — e.g. wall **"Sync paused"** — never `suspended`,
  `connecting`, a channel name, or an error code.
- **Degrade-not-block: keep scanning into a durable queue.** A down printer/scale/network never gates a scan; the scan
  enqueues and the idempotent retry (§7) drains it on reconnect. *Rationale: throughput is the job — blocking the bar on
  infra failure stops the line for something the operator can't repair.*
- **Printer-down / scale-down are distinct, non-blocking banners** — separate from connection-health chrome, because they
  fail independently and the operator needs to know *which* peripheral is down. *Rationale: "station down" is a family of
  orthogonal states, not one boolean.*

---

## 9. Motion

- **Crossfade the *active card* only.** Use the station presets from `src/design-system/foundations/motion-framer.ts`:
  `framerPresence.stationCard` (opacity + small-y) with `framerTransition.stationCardMount`, inside
  `AnimatePresence mode="wait"`. The serial-row and collapse transitions (`framerPresence.stationSerialRow`,
  `framerPresence.collapseHeight` + `framerTransition.stationCollapse`) handle the in-card micro-changes. *Rationale:
  one entity dissolves into the next — there is no list to crossfade, so never animate one.*
- **Route presets through the motion hooks so reduced-motion is automatic.** `useMotionTransition` /
  `useMotionPresence` (`src/design-system/foundations/motion-framer-hooks.ts`) collapse x/y to 0 under
  `prefers-reduced-motion`, leaving a pure opacity crossfade. **Primitives that own entrance motion — especially
  `CardShell` and `ActiveOrderScanFeedback` — must call these hooks**; raw `framerPresence.*` / `framerTransition.*`
  without the bridge is a WCAG 2.3.3 regression. *Rationale: reduced-motion is "replace slides with crossfades," not
  "no motion," and it must be free at the primitive, not per call site.*
- **Keep flourishes minimal on a high-frequency scan stream.** The scan-sweep shimmer in `StationScanBar` is a brief
  `motionBezier.easeOut` sweep; the active card uses opacity + transform only. **Never animate layout** (width/height/
  padding) on the **scan-result card** — for height use `grid-template-rows` / the collapse preset. **Procedure Focus
  Deck layout is the exception** — see `motion-crossfade.md` → sanctioned layout #2. Under reduced motion, suppress
  `layout` props on station scan cards. *Rationale: at scan cadence, layout animation on the result card thrashes and
  reads as lag; opacity+transform stays on the compositor.*

---

## 10. Mobile (phone) variant

The phone station is **not a distinct archetype** — it is this same Station wearing a `MobileShell`.

- **The mobile scan surface IS the canonical desktop `StationScanBar`.** `ScanInput`
  (`src/components/mobile/redesign/ScanInput.tsx`) wraps `StationScanBar` in compact chrome and tucks a ZXing camera
  toggle into its `rightContent` (`useBarcodeScanner`); the viewfinder expands below. **Do not hand-roll a separate
  mobile input.** *Rationale: one bar means the desktop focus/classification/idempotency rules apply unchanged on the
  phone.*
- **Same endpoints + query keys as desktop.** `UniversalScan` and `MobilePackerFlow` POST the same routes
  (`/api/receiving/lookup-po`, `resolveTestingScan`, `/api/orders/lookup/:id`) and invalidate the same
  TanStack keys the desktop sidebar uses, so a phone scan lands in the same triage rails. *Rationale: the phone is a
  second terminal onto one station, not a parallel data path.*
- **Phone-specific affordances stay inside the station contract.** Fullscreen camera portal, bottom sheets
  (`PrepackedProductSheet`), and a swipeable mode pager (`MobilePackerFlow`'s two-step machine, `UniversalScan`'s mode
  slider) are layout, not archetype changes: still scan-driven, still act-and-clear, still one active entity.
  *Rationale: only one camera stream can be live at a time (`cameraSuspended` parks the page scanner while a sheet's
  scanner runs) — mount/un-suspend one at a time.*

---

## 11. Anti-patterns checklist

- **Don't put a browsable, clickable list in the scan column.** That's a Workbench; split the region (§1).
- **Don't render the active entity TWICE.** A Station draws it in exactly ONE region — the **middle**. The scan
  column carries the scan bar and the recent rail; never an identity card, a scan-session summary, or a
  checklist. Two renders of one entity is not redundancy, it is two things that can disagree, on the surface
  whose whole job is telling an operator what is in their hands. **Unbox is the control** — `ReceivingSidebarPanel`
  holds no identity at all, and `LineEditPanel` mounts `StationContextBar` above `StationWorkbench`.
  When a session's state lives in the scan column, publish the computed value across the tree boundary
  (`tech-active-order-changed` · `lib/testing/testing-scan-session-bridge`) and render it in the workspace —
  one derivation, one display. **Move the display, don't delete it:** Shipping's `ActiveOrderScanFeedback` is the
  only carrier of the amber **No order** exception state (§6) and of Undo, so deleting it would have taken the
  silent-success fix with it. Guard: `station-sidebar-identity.guard.test.ts` (shrink-only allowlist).
- **Don't make the station react to hover/click.** It reacts to *scans* only; pointer-reactive detail is a Workbench
  tell.
- **Don't let focus drift.** No un-refocused submit, no missing `useRegisterScanTarget`, no modal that swallows the bar
  without a watchdog (§3).
- **Don't animate layout on the active card.** Opacity + transform only; height via `grid-template-rows` / the collapse
  preset (§9).
- **Don't make selection URL-addressable.** Station selection is ephemeral state; `?id=` is a Workbench (§5).
- **Don't surface pass/fail as a generic corner toast or `window.alert`.** Use the big active-card state + an
  audio/haptic cue (§6). Alerts steal scanner focus — toast waist is `@/lib/toast` for non-card feedback only.
- **Don't paint emerald Active / · complete over an unmatched or exception session.** That is silent success (§6).
- **Don't invent a hard-dismiss modal that blocks the next scan** for unmatched tracking. Exception = honest amber
  card + continue; 409/reject = rose fail card (§6–§7).
- **Don't bypass `useMotionTransition` / `useMotionPresence` on station card primitives** (§9).
- **Don't drop a client-minted `idempotencyKey` on the server** (§7).
- **Don't block the bench on infra.** Printer/scale/network down → distinct non-blocking banner + durable queue, never a
  gated scan (§8).
- **Don't add a fifth `navigator.onLine` listener, a per-bench reconnect strip, or a second degraded-state answer.**
  Read `useConnectionChrome()` / `useNetworkOnline()` / `useRealtimeLink()`; grow the pure module if the answer is
  wrong (§8, D4).
- **Don't invent hex or hardcode `z-[NNN]`.** Color from `src/design-system/tokens/colors/semantic.ts`, z-index from the
  named scale, status tones from `workflowStageDot`.
- **Don't ship a hybrid Station+Workbench page without a return-to-scan CTA.** When the page hosts a workbench strip
  (Recent / Queue / History / …) beside a scan dock, chrome **must** expose a solid primary in
  `WorkbenchTrailingCluster.actions` (top-right of the context bar, **at or above any KPI display, never below**) on every strip tab that **resumes**
  — re-opens the station's most recent record (which also marks it in the sidebar rail) and re-focuses the scan bar.
  It does **not** land a bare data table (ruled 2026-08-03): the button is already inside the station's chrome, so
  "go here" is not a meaning it can carry, and the table-first version's row pulse silently could not fire on the feed
  it landed. **This is not the single-active-entity exception** — resuming replaces the active card with one carton, as
  a scan would; §5 still holds. Unbox is the reference (`UnboxWorkspaceHeader`); Testing / Pack / Shipping compose the
  same altitude. Detail: [`workbench.md`](workbench.md) → Multi-region pages.

---

## At a glance

| | Station rule |
|---|---|
| Driven by | a scanner / keyboard-wedge / camera |
| Primary input | focus-locked `StationScanBar`, global hotkey target |
| Selection | ephemeral, one at a time, **never** in the URL |
| Hybrid exit | return-to-scan CTA in `WorkbenchTrailingCluster.actions` (every strip tab, at or above any KPI display) — **resumes** the MRU record, never lands a bare table |
| What crossfades | the **active card** (`framerPresence.stationCard`, `mode="wait"`) |
| Confirm model | scan-to-confirm (`PackChecklist`), optimistic + `clientEventId` idempotency |
| Feedback | big card pass/fail (emerald Active vs amber No order vs rose fail) + audio/haptic; never toast/`alert()` |
| Idempotency | client mints key; server **must** honor via `api_idempotency_responses` |
| Down state | `connection-health` + durable queue; TV pill / `NetworkChip`; degrade-not-block |
| Connection health | offline · realtime-degraded · syncing — one answer from `connection-health.ts`, debounced, no Ably jargon |
| Mobile | same Station on `MobileShell` via `ScanInput`; same endpoints/keys |

## Background — industry references

- **Serial single-tasking** — one transient entity at a time; the bench is optimized for the *next* item, not for
  navigating a set. ([NN/g — serial vs. parallel task switching](https://www.nngroup.com/articles/serial-task-switching/))
- **Keyboard-wedge scanning** — the scanner types into the focused input and ends with Enter; focus-lock is the whole
  game. ([Barcode scanners simplified](https://medium.com/@mypascal2000/barcode-scanners-simplified-1a4fb7ef621b))
- **Idempotency keys** — a per-scan `clientEventId` makes a retry a safe no-op.
  ([Stripe — idempotency](https://stripe.com/blog/idempotency))
- **Graceful degradation / single-app kiosk** — "station down" is a designed-for state on a locked-down bench, not an
  error page. ([Designing systems that fail gracefully](https://www.cleverence.com/articles/business-blogs/how-to-design-systems-that-fail-gracefully-4827/))

---

Indexed by ../contextual-display.md.
