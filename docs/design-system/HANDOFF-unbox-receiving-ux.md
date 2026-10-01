# HANDOFF — Receiving Unbox UX/UI only

Paste everything below the rule into a fresh session at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

---

You are improving the **desktop Receiving › Unbox station** at `/unbox`.

## Scope — strict

Improve the operator-facing UX and UI of the Unbox display by simplifying the
legacy system first: delete the task-specific right-rail architecture, keep
ticket and photo work inline, then expose the shared Displays stack only as an
explicit fallback task.

**Do not measure, run, discuss, update, or optimize Lighthouse.** Do not create a
perf rig, use `lighthouse-audit`, touch Lighthouse baselines, or chase bundle/LCP/
TBT scores. That work is parked. This is a display/workflow pass only.

Do not deploy. Do not add a mobile `/m/unbox` page: the phone has no Unbox scan
station by owner decision; it handles the paired photo/capture jobs instead.

Dev origin is **only** `http://localhost:3050`:
- Lifecycle: `systemctl --user {start,restart,status} cycleforge-lane@prod`.
- Probe sign-in:
  ```bash
  curl -c /tmp/cf-unbox-cj -H 'content-type: application/json' \
    -d '{"staffId":1,"pin":"","deviceKind":"personal"}' \
    http://localhost:3050/api/auth/signin
  ```
- Never start Next manually or probe a lane port.

## Product outcome

At a bench, the operator should be able to answer these at a glance, with one
clear next verb:

1. **What did I scan?** Full tracking / PO / ticket identity; no cropped scanner
   values.
2. **What kind of carton is this?** Matched, unfound, already unboxed, return,
   blocked, or ready to receive.
3. **What must I do now?** Add/match an item, scan serials, photograph, put away,
   or receive — never a competing cluster of equivalent verbs.
4. **Where is ticket work?** In the `Unbox | Photos | Ticket | Displays` task
   switcher at the top-left of the selected-carton plane. Ticket identity
   remains in the carton header; ticket detail/history occupies the Ticket body;
   create/reply remains in the bottom composer. There is no Ticket right rail
   and no second thread.
5. **Where are photos?** In the top-left Photos task. Its gallery, selection,
   capture/view actions and `Move photos` panel all render inline in the center
   plane; Photos never opens a Displays leaf or another right-side destination.
6. **Where are fallback displays?** The Displays task explicitly opens the
   shared right push stack with Timeline and Look. It is closed by default,
   never auto-opens, and does not restore the deleted Unbox action directory.
7. **What happened after I acted?** One welded receive-feedback surface directly
   above the composer; no toast/card/second framed copy.

This is a desktop-only physical workbench, not a dense industrial dashboard.
The selected-carton work plane and bottom dock are flush to the center column:
no left or right body padding. Interactive surfaces retain clear boundaries and
generous desktop targets. The task buttons remain padded, rounded controls even
though the work plane itself is edge-to-edge. Preserve scanner focus, stable
geometry and evidence-first ordering.

## Existing work — preserve; do not rebuild it

### Header scan feedback + ticket pairing

This is built, uncommitted, and working:

- `src/lib/receiving/unbox-scan-feedback.ts` (+ 9 pure tests) models each scan.
- `src/lib/receiving/unbox-scan-feedback-store.ts` keeps the current line and the
  tab-session history; the old `unbox-scan-verdict-store.ts` is deleted.
- `useTrackingScan.ts` starts `checkUnboxScanVerdict`. `scan-apply.ts` starts
  ticket pairing after a new unfound carton is created.
- `HeaderWork.tsx` renders the scan line in the top-left. Click it to open
  `UnboxScanHistory.tsx`.
- Full tracking is mandatory in scan feedback. Example:
  `Unfound 9400111206260370400001 — linked to #10001`.
  Never restore a tail-only rendering. Scan feedback gets a `w-lg` slot and the
  history popover is `w-lg`; this is the explicit exception to the normal
  FindField 47-character rule.
- Every ticket outcome wears the **Ticket glyph**: searching, linked, several /
  none, disconnected, and error. The colour distinguishes its outcome.
- History is newest-first, capped at 20. A row reopens its carton using
  `?openReceivingId=`; `#N` opens `/support?ticket=N`.
- Ticket pairing is real: one candidate auto-links; several candidates expose
  Pair buttons; existing `linkedToThis` is not posted again; 503 says connect
  Zendesk without a toast. Do not add a second ticket-status pill to the header.

**Header laws:** top-left is the operator's immediate scan/personal feedback;
top-right is system work only. Find / ⌘K belongs only in the find field. Use
`RollingHint`, existing motion contracts and one polite announcement per new
scan state.

### Bottom composer / receive feedback weld

This is built, uncommitted, and working:

- `LineEditPanel.tsx` passes receive feedback as `reaction` through
  `WorkspaceNotesCard.tsx` → `LineNotesCard.tsx` → `StationComposerHost.tsx`.
- `StationComposerHost` derives `weldTop` from whether the reaction is present.
- `WeldedFeedbackPanel.tsx` paints only the top of the shared silhouette: top +
  sides + top radius, **no bottom border**. The composer dock owns its own full
  outline and therefore its top seam.
- `WeldedStack` was deleted. Do not reintroduce a second raised/halo wrapper,
  `mx-*` inset around feedback, or an independent feedback card.
- With no terminal composer, feedback still renders on its own.

Visual proof already captured with a write request intercepted:
`/tmp/cmp-weld2.png`. It shows one aligned frame, not two.

### Safe smoke data

- Carton **53493**, tracking `9400111206260370400001`, is made-up unfound test
  data. It has been rescanned many times as lookup-only. Do not delete it without
  owner approval.
- Real read-only candidate: carton **53486**, tracking `9434650206217293748983`,
  returns Zendesk ticket **#10001**. Do not auto-link it during an interface
  pass without first confirming it belongs to that box.
- Carton **53487**, tracking `9302010623390270248250`, returns ticket **#10090**
  as already linked.

## Current surface map

```
/unbox page.tsx
└── UnboxBrowseShell
    └── ReceivingSurfacePage
        ├── ReceivingSidebarPanel
        │   ├── UnboxScanBand → ReceivingUnboxScanBar (Ticket · Tracking · PO)
        │   ├── ReceivingLinePicker (multi-match only)
        │   └── ReceivingFeedRail → RecentActivityRailBase (recent cartons)
        └── ReceivingDashboard → ReceivingRightPane
            └── UnboxLineWorkspace
                ├── UnboxWorkspaceView (browse underlay)
                └── ReceivingLineWorkspace (selected carton overlay)
                    └── LineEditPanel
                        ├── CartonContextCard
                        ├── Unbox / Photos / Ticket inline task bodies
                        ├── StationDisplaysPushStack (explicit fallback only)
                        └── StationComposerHost + receive feedback
```

### Binding target composition

```
LineEditPanel
├── selected-carton header / identity
├── rounded, padded local task buttons at top-left
│   ├── Unbox
│   │   └── return / PO / unfound item work, serials and condition
│   ├── Photos
│   │   ├── inline ClaimPhotoPicker gallery and actions
│   │   └── inline MovePhotosBetweenPoPanel while requested
│   ├── Ticket
│   │   └── one StationTicketPane body: linked thread OR create/link
│   └── Displays
│       └── fallback StationDisplaysPushStack: Timeline + Look, never Photos
└── StationComposerHost + welded receive feedback
```

`Unbox | Photos | Ticket | Displays` are local tasks for the open carton, not
page views. They do not belong in the contextual sidebar. Ticket resolves to
thread detail or create/link and stays synchronized with composer mode. Photos
owns the inline gallery and move workflow. Displays keeps the Unbox center body
visible and opens the shared fallback push stack only while explicitly selected.

The Unbox call to `StationScanPaneHost` passes only the fallback Displays body:
no parked rail, utility rail, visit history, auto-follow or reserved host pad.
The shared stack remains the same infrastructure used by Arrival and Testing.

### Simplification ledger — settle this before UI edits

| Decision | Surface / capability | Destination |
|---|---|---|
| Keep | Header scan feedback and history | Existing top-left header behavior |
| Keep | Carton identity and ticket chip | Existing context header; chip selects the inline Ticket task |
| Keep | PO/unfound items, serials, condition, evidence and receive work | Inline Unbox body |
| Keep | `StationComposerHost` and welded receive feedback | Existing bottom mouth |
| Move | Linked ticket detail/history and create/link | One inline Ticket body |
| Move | Photo evidence | Dedicated inline Photos task in the center plane |
| Move | Move photos between cartons/POs | Inline `MovePhotosBetweenPoPanel` inside Photos |
| Localize | Unfound PO matching | `UnfoundMatchStrip`; never a Pairing display |
| Localize | Tracking edit | Directly from the tracking identity; never a Tracking display |
| Localize | Location work | Existing composer/location control; never a Locations display |
| Restore as fallback | Shared Displays push stack | Explicit Displays task with Timeline and automatic Look only |
| Delete from Unbox | Parked strip, utility rail, legacy index, visit history and auto-follow | No replacement |
| Delete from Unbox | Listings, Pairing, Inventory, Units, Prebox, Photos action directory, Checklist, Tracking and Locations leaves | No replacement display; retain only the core local actions named above |
| Delete from Unbox | Displays header action floor (Edit, Link, Print, Sync, More) | Do not redistribute the cluster; Print/Receive already live in the terminal, and matching lives in its local workflow |

Deletion remains the default for the old leaf directory. The fallback is
deliberately narrow: Timeline and Look, with no Photos display destination.

### Executed source delete list

Reference searches were run immediately before each removal. The cutover
deleted:

- Displays state/navigation: `hooks/useUnboxDisplayView.ts` and test,
  `unbox-side-tabs.ts` and test, `unbox-display-index.ts` and test,
  `unbox-displays-nav.ts` and test, `unbox-right-edge.ts` and test,
  `steps/rail/`, plus the tests-only `useReceivingClaimView` /
  `useReceivingTicketView` hooks and tests.
- Legacy Displays composition: `UnboxDisplaysActionFloor.tsx` and
  `terminal/unbox-tabs.tsx`. `buildUnboxOverview` now lives in
  `terminal/unbox-overview.tsx`. `LineEditPanel.tsx` later rewired the shared
  `StationDisplaysPushStack` as an explicit Timeline/Look fallback, but no
  visit-history, auto-follow, utility-rail or reserved-right-pad wiring returned.
- Unbox-only photo leaves: `PhotosDisplayHost.tsx`,
  `PhotosActionsArmedList.tsx`, `PhotosActionsToolRuntime.tsx`,
  `PhotoLinkDisplay.tsx` and `ListingPhotoCompareHost.tsx`.
- Other unreachable leaves: `LinkageDisplayHost.tsx`,
  `InventoryDisplayHost.tsx`, `UnitsDisplayHost.tsx`,
  `PreboxDisplayHost.tsx`, `PreboxWizard.tsx`,
  `UnboxProcedureChecklist.tsx`, `UnboxLocationsLeaf.tsx`,
  `LinePoNoteCard.tsx`, `terminal/usePoNoteTabState.ts`, the obsolete shared
  `workspace/UnitsExplosionDisplay.tsx`, and the emitterless
  `workspace/ZohoSplitPane.tsx`.
- Dead adapters/bridges: `hooks/useSyncedPoNote.ts`,
  `unbox-ticket-context.ts` and test, the `receiving-open-photo-link` event and
  emitter, the Unbox right-edge yield in `IncomingBulkTrackingPanel`, the dead
  photo-display double-click bridge and
  `serializeUnboxFlowCaptureOrder` plus its implementation-only test.
- The only tracking behavior worth retaining was renamed from
  `TrackingNumbersTab.tsx` to `TrackingNumbersEditor.tsx` and mounted inline;
  no Tracking destination or navigation state survived.
- The Unbox-only `SectionTabsSlider` icon rail, overflow bucket, density API and
  partition test were also deleted. The remaining component is a small
  searchable timeline-section selector.

No compatibility aliases, deprecated exports or empty destination stubs were
left behind.

Do **not** delete shared survivors:

- `StationScanPaneHost`, `StationDisplaysPushStack` and other station Displays
  primitives now used by the narrow Unbox fallback as well as Arrival/Testing;
- `TicketDisplayHost.tsx`, which still has Triage, Testing and Pickup callers;
- `StationTicketPane.tsx`, which becomes the one inline Unbox ticket body;
- `MovePhotosBetweenPoPanel.tsx`, which becomes the inline Unbox move body and
  also has an inbound-record caller;
- `MovePhotosBetweenPoRail.tsx`, `SendPhotoNotePanel.tsx`,
  `ListingLinksTab.tsx` and `CartonDisplaysActionFloor.tsx`, which have
  non-Unbox callers;
- `ReceivingPhotoPeek.tsx` / `PhotoPeekFan.tsx`, which remain available to
  Triage; Unbox Photos now uses the full inline `ClaimPhotoPicker`.

`CLAIM_RENDERS_IN_BOTH` also has a Testing caller. Remove Unbox from that
transitional branch, but do not change Testing as an accidental consequence of
this desktop Unbox pass.

### Primary files to reshape

- `src/components/receiving/workspace/LineEditPanel.tsx`
- `src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx`
- `src/components/receiving/workspace/line-edit/ReceivingPhotoPeek.tsx`
- `src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx`
- `src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx`
- the extracted Unbox overview module

Use `xd://lsp` references before changing exported/shared symbols. If no
language server is available, record that and use exhaustive caller searches.

## Improvement campaign — delete before decorating

### 1. Capture the current failure, then freeze the keep/move/delete ledger

Use a real browser at `:3050` and capture:

- no selected carton / browse recent;
- matched carton with the closed parked Displays strip visible;
- the Displays root index and representative non-useful leaves;
- linked Ticket in both its current center and right-side forms;
- unfound create/link state;
- current photo peek and Photos → Move display;
- already-unboxed lookup receipt / preview lock;
- return carton;
- receive feedback in flight, with the write intercepted.

Put screenshots under `/tmp/unbox-ux-before-*.png`. For each state, identify
which surface is kept, moved or deleted. Do not start by changing color,
typography or spacing.

### 2. Remove the legacy right-side system, then restore only the fallback shell

The completed cutover removed the Unbox utility rail, old index, leaf gates,
visit history, auto-follow, preloading and nested display state. Compile errors
were used as the migration checklist.

`buildUnboxOverview` moved out of `terminal/unbox-tabs.tsx`; obsolete display
builders and leaves remain deleted. The only restored path is the shared
`StationDisplaysPushStack`, mounted when the operator explicitly selects
Displays and populated with Timeline plus the stack's automatic Look entry.

Selecting a carton renders a full-width center plane with no parked strip or
reserved host pad. A right push column exists only while Displays is selected.

### 3. Keep one readable desktop task switcher

`Unbox | Photos | Ticket | Displays` is the first local control row at the
top-left of the open carton plane:

- real buttons with visible padding, focus treatment and rounded corners;
- no flush icon rail, square cells or zero-padding industrial bar;
- default to Unbox on carton change;
- Photos renders the inline gallery and inline move workflow;
- ticket chip, ticket scan result and create/link actions select Ticket;
- Ticket renders exactly one `StationTicketPane`;
- Displays opens the fallback push stack without replacing the center body;
- task selection and `StationComposerHost` mode remain synchronized;
- Esc/focus behavior returns to the tab button that opened an inline body.

Use an existing rounded local-tab primitive if its contract fits; otherwise
extend the nearest primitive instead of forking a second tab implementation.
This is a record-task switcher, not page navigation.

### 4. Keep photos and Move photos inline

The Photos task renders the existing gallery in normal document flow. Its
capture, refresh, density, fullscreen-viewer and selection controls remain in
the center plane. A direct `Move photos` button expands
`MovePhotosBetweenPoPanel` in that same scroll plane. Closing returns focus to
the button; a successful move refreshes the inline list.

The deleted Photos action directory and its Link / Send / Compare right-display
drill-downs do not return. The shared fullscreen viewer remains because
“inline” governs workflow ownership, not image zoom.

### 5. Re-home only indispensable operations

- Unfound matching stays in `UnfoundMatchStrip`.
- Serials and condition stay with their PO/item rows.
- Full tracking stays in carton identity; any edit is anchored there.
- Location stays in the composer control.
- Print and Receive stay in the terminal.
- Procedure completion may still drive the composer progress indicator, but
  it must not recreate a Checklist destination or auto-open a reference rail.

If removing a legacy leaf exposes a genuinely required operator action with no
remaining owner, place it beside the fact or operation it changes. Do not add
another generic display directory; the fallback stays Timeline + Look.

### 6. Simplify the remaining Unbox plane

After the deletion cutover:

- keep the active body and dock flush to the center column with no horizontal
  padding;
- keep work in clearly bounded surfaces where the whole face is pressable;
- keep full tracking and serial identity recoverable digit-for-digit;
- preserve scanner focus and stable geometry during writes;
- reduce browse actions to distinct next jobs;
- make preview-lock and lookup-receipt states name the one safe next action;
- use existing loading faces only where pending state blocks work.

Use Unbox-local composition/variants. Do not change shared station spacing
tokens to obtain this page-specific edge-to-edge plane.

### 7. Preserve the welded composer result

Use `StationComposerHost` for all bottom-mouth work. Run:

```bash
node tools/design-mcp/ds.mjs contract "station composer receive feedback, note, ticket reply and primary receive action"
node tools/design-mcp/ds.mjs critique src/components/composer/StationComposerHost.tsx
node tools/design-mcp/ds.mjs critique src/components/receiving/workspace/WeldedFeedbackPanel.tsx
```

The feedback panel must remain flush and top-framed only. It must not cover the
dock outline, gain separate bottom corners, or return to a boxed card within a
boxed composer.

## UI laws

- The legacy Unbox Displays architecture is deleted, not restyled. The shared
  push stack is restored only as an explicit fallback with Timeline and Look.
- `Unbox | Photos | Ticket | Displays` is a local task switcher for the open
  carton, not page navigation or a second global navigation system.
- The task buttons must look and behave pressable: desktop padding, house focus
  treatment and a proper radius. The active work plane and dock have no left or
  right padding.
- Ticket identity is a header fact; ticket history/detail has one inline body;
  ticket create/reply uses the composer. Never paint a second thread.
- Photos/evidence, selection and Move photos stay inline. No Photos directory,
  right rail or utility drawer on Unbox.
- Ask `ds_contract` before building/reshaping a UI piece; run `ds_critique`
  after each touched UI file. Use `ds_tokens <axis>` before adding a visual
  literal. No invented hex, radius, raw `text-[Npx]`, hand-rolled dialog,
  popover or button when a house primitive exists.
- Motion: transform/opacity only; `motion-presets` + `useReducedMotion`; no
  looping animation except an active progress/state treatment.
- Use `StationComposerHost`; dumb stations keep `showModeRow` and set
  `showModeFaces={false}`.
- Ticket title/history is a durable record. Do not replace it with a toast or a
  transient success string.
- Keep one thing in one place. Deleting a display does not authorize a duplicate
  card elsewhere.
- Treat all other concurrent worktree changes as user work. Do not clean,
  revert, reformat or repair unrelated files.

## Verification — UX evidence, not performance

After each coherent change:

1. `ds_critique` every changed UI file; fix actual violations.
2. Run targeted unit tests only for retained/new pure behavior. Delete tests
   whose only contract was the removed Displays architecture.
3. At `http://localhost:3050/unbox`, exercise the changed interaction in a real
   browser. Capture `/tmp/unbox-ux-after-*.png` at desktop width.
4. Prove no parked Displays strip, utility rail or reserved right pad remains;
   the push column appears only after selecting Displays.
5. Exercise `Unbox | Photos | Ticket | Displays`. Verify one ticket body,
   synchronized composer mode, inline Photos ownership, fallback
   Timeline/Look, keyboard focus and scanner recovery.
6. Open and close Move photos inline, move only safe test data if a mutation is
   needed, and verify the inline photo list refreshes without opening a rail.
7. Exercise matched, unfound, return, already-unboxed and read-only states to
   ensure removed leaves did not strand a required action.
8. If testing a receive state, intercept the POST or use an already recorded
   replay state. Do not create a real ticket, alter a real Zendesk ticket, or
   receive real inventory merely to obtain a screenshot.
9. Compare before/after by task completion: what identity is visible, which
   action is primary, which duplicate disappeared, and how a keyboard/scanner
   operator remains unblocked.
10. Run `pnpm verify:fast` before calling the work complete.

No Lighthouse command belongs in this handoff or its verification.

## Update this handoff before yielding

Record:

- the final keep/move/delete ledger and any item whose disposition changed;
- exact files changed and deleted;
- every removed legacy Displays caller and every surviving shared fallback
  caller;
- the inline Ticket ownership decision and all entry points migrated;
- the inline Photos/Move photos ownership decision and the fallback Displays
  boundary;
- screenshots and browser states actually exercised;
- tests/`verify:fast` result;
- remaining UX problems with exact files and state; and
- any new test data, without deleting carton 53493 unless the owner approves.

Related history only:
`docs/performance/HANDOFF-unbox-speed-and-ticket-mirror.md` contains the earlier
scan/ticket implementation and the parked performance work. Do not resume its
Lighthouse section during this UX/UI pass.

## Execution record — cutover and fallback amendment complete

### Final ownership decisions

- `PaneHeaderTabs` is the shared rounded record-task primitive. Unbox uses it
  for `Unbox | Photos | Ticket | Displays`; `blocks.tsx` no longer owns a
  private copy.
- A carton change selects Unbox. Composer mode, ticket chip, linked-ticket scan
  result, and ticket create/link flow converge on the Ticket task. Ticket mounts
  exactly one `StationTicketPane`.
- `UnboxPhotosTask` owns photo work in a normal-flow `WorkspaceCard`.
  `ClaimPhotoPicker mode="view"` exposes the inline gallery and its actions; one
  `Move photos` button mounts `MovePhotosBetweenPoPanel chrome="inline"` in the
  same scroll plane. Escape closes it and returns focus to that button.
- Displays is a fallback only. It opens `StationDisplaysPushStack` with Timeline
  and automatic Look while leaving the Unbox center body visible. There is no
  Photos display leaf, parked strip, visit history or auto-follow state.
- The selected-carton body and bottom dock have zero left/right outer padding.
- Tracking edit is `TrackingNumbersEditor` beside carton identity. Matching
  remains in `UnfoundMatchStrip`; serial/condition remain in the item row;
  location remains in the composer control; print/receive remain in the
  terminal. The procedure ring opens only the nearest status/history owner.
- `SectionTabsSlider` is now a 74-line searchable section selector. Its
  Unbox-only icon rail, overflow bucket, hidden-tab partition, density API,
  Motion treatment, and implementation test were deleted rather than retained
  as generic design-system weight.
- Photo capture now exposes only Upload and Send to phone. All remaining
  operator copy and the dock's `data-unbox-photo-segments="2"` contract agree;
  Link has no hidden segment or stale label.
- The always-mounted `ZohoSplitPane` was also deleted. Its
  `open-zoho-pane` event had no emitter anywhere in the repository, so it was
  unreachable right-rail UI rather than an operator escape hatch.
- The unreferenced 65-line full-workbench branch in
  `UnboxWorkbenchSkeleton.tsx` was removed; only the table fallback imported by
  `UnboxWorkspaceView` remains.

### Exact source inventory

The cutover changed or added these implementation files:

```text
src/components/composer/ComposerModeRow.tsx
src/components/receiving/ReceivingSurfacePage.tsx
src/components/receiving/ReceivingRightPane.tsx
src/components/receiving/receiving-events.ts
src/components/receiving/triage/TriagePanel.tsx
src/components/receiving/triage/build-triage-displays.tsx
src/components/receiving/unbox/UnboxLineWorkspace.tsx
src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx
src/components/receiving/workspace/LineEditPanel.tsx
src/components/receiving/workspace/claim/components/ClaimPhotoPicker.tsx
src/components/receiving/workspace/ReceivingAuditPanel.tsx
src/components/receiving/workspace/ReceivingClaimPanel.tsx
src/components/receiving/workspace/ReceivingLineWorkspace.tsx
src/components/receiving/workspace/line-edit/ActiveLineConditionSerial.tsx
src/components/receiving/workspace/line-edit/CartonMatchHub.tsx
src/components/receiving/workspace/line-edit/ItemPhotoCaptureStrip.tsx
src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx
src/components/receiving/workspace/line-edit/LineNotesCard.tsx
src/components/receiving/workspace/line-edit/LinePoItemsSection.tsx
src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx
src/components/receiving/workspace/line-edit/POUnboxingSection.tsx
src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx
src/components/receiving/workspace/line-edit/PhotoPeekStack.tsx
src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx
src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx
src/components/receiving/workspace/line-edit/ReceivingPhotoPeek.tsx
src/components/receiving/workspace/line-edit/ReceivingTicketChip.tsx
src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx
src/components/receiving/workspace/line-edit/TrackingNumbersEditor.tsx
src/components/receiving/workspace/line-edit/UnboxNotesLocationControl.tsx
src/components/receiving/workspace/line-edit/UnfoundMatchStrip.tsx
src/components/receiving/workspace/line-edit/WorkspaceNotesCard.tsx
src/components/receiving/workspace/line-edit/UnboxPhotosTask.tsx
src/components/receiving/workspace/line-edit/steps/dock/PhotoStepDockStrip.tsx
src/components/receiving/workspace/line-edit/terminal/unbox-overview.tsx
src/components/receiving/workspace/line-edit/terminal/unbox-terminal.test.ts
src/components/receiving/workspace/line-edit/useUnboxProcedureSteps.ts
src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx
src/components/station/displays/StationDisplaysPushStack.tsx
src/components/station/entity-context/CartonContextCard.tsx
src/components/station/workbench/WorkspaceTimelineTab.tsx
src/components/ui/pane-header/PaneHeaderTabs.tsx
src/components/ui/pane-header/blocks.tsx
src/components/ui/pane-header/index.ts
src/design-system/components/SectionTabsSlider.tsx
src/design-system/components/WorkspaceCard.tsx
src/lib/receiving/recent-staged-location.ts
src/lib/receiving/recent-staged-location.test.ts
src/lib/routing/route-params.test.ts
src/lib/stations/unbox-flow-capture-order.ts
src/lib/stations/unbox-flow-capture-order.test.ts
```

The exact deleted tracked files are:

```text
src/components/receiving/PreboxWizard.tsx
src/components/receiving/workspace/UnitsExplosionDisplay.tsx
src/components/receiving/workspace/ZohoSplitPane.tsx
src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx
src/components/receiving/workspace/line-edit/LinePoNoteCard.tsx
src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx
src/components/receiving/workspace/line-edit/ListingPhotoCompareHost.tsx
src/components/receiving/workspace/line-edit/PhotoLinkDisplay.tsx
src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx
src/components/receiving/workspace/line-edit/PhotosActionsToolRuntime.tsx
src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx
src/components/receiving/workspace/line-edit/PreboxDisplayHost.tsx
src/components/receiving/workspace/line-edit/TrackingNumbersTab.tsx
src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx
src/components/receiving/workspace/line-edit/UnboxLocationsLeaf.tsx
src/components/receiving/workspace/line-edit/UnboxProcedureChecklist.tsx
src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx
src/components/receiving/workspace/line-edit/hooks/useReceivingClaimView.test.ts
src/components/receiving/workspace/line-edit/hooks/useReceivingClaimView.ts
src/components/receiving/workspace/line-edit/hooks/useReceivingTicketView.test.ts
src/components/receiving/workspace/line-edit/hooks/useReceivingTicketView.ts
src/components/receiving/workspace/line-edit/hooks/useSyncedPoNote.ts
src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.test.ts
src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts
src/components/receiving/workspace/line-edit/steps/rail/index.ts
src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx
src/components/receiving/workspace/line-edit/terminal/usePoNoteTabState.ts
src/components/receiving/workspace/line-edit/unbox-display-index.test.ts
src/components/receiving/workspace/line-edit/unbox-display-index.ts
src/components/receiving/workspace/line-edit/unbox-displays-nav.test.ts
src/components/receiving/workspace/line-edit/unbox-displays-nav.ts
src/components/receiving/workspace/line-edit/unbox-right-edge.test.ts
src/components/receiving/workspace/line-edit/unbox-right-edge.ts
src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
src/components/receiving/workspace/line-edit/unbox-side-tabs.ts
src/components/receiving/workspace/line-edit/unbox-ticket-context.test.ts
src/components/receiving/workspace/line-edit/unbox-ticket-context.ts
src/design-system/components/section-tabs-slider.test.ts
```

Documentation and design-system metadata updated with the cutover:

```text
docs/carton-order-identity-plan.md
docs/design-system/HANDOFF-unbox-receiving-ux.md
docs/integrations/zoho.md
docs/refactors/sidebar/HANDOFF-inventory-port-prepack-labels.md
src/design-system/DESIGN_SYSTEM.md
docs/design-system/HANDOFF-unboxed-triage.md
docs/refactors/sidebar/PARITY.md
src/design-system/pinned.json
```

The shared station Displays infrastructure is now also the narrow Unbox
fallback; Arrival/Testing remain its other owners. Triage/Testing/Pickup still
call `TicketDisplayHost`; the inbound record still calls
`MovePhotosBetweenPoPanel`; and the other shared photo/action leaves named
above remain for their non-Unbox callers. No alias, re-export, query-state shim,
or empty destination stands in for a deleted file.

### Browser evidence

The original handoff fixture IDs 53486, 53487, and 53493 returned no current
line rows, so the browser proof used live read-only replacements:

- matched/unlinked: receiving 53276, PO 65570633, tracking 877707728112;
- linked: receiving 53389, ticket #10099, tracking 9434608106245618486304;
- unfound return: receiving 53546, ticket #10100;
- unreceived receive-feedback fixture: receiving 53048, PO 65411580,
  tracking 877377316970.

At `http://localhost:3050`, authenticated Playwright exercised browse/matched,
unlinked Ticket, linked Ticket, unfound return, scan-selected Ticket,
preview/read-only inertness, inline Move open/Escape/focus return, Ticket
Escape/focus return, welded receive failure, the four-task selector, inline
Photos, and the fallback Displays root/Timeline/close flow. The receive POST was
intercepted and fulfilled with HTTP 500; exactly one request was observed and
the response appeared in the welded panel. No inventory, ticket, location, or
photo mutation was allowed.

Captured proof:

```text
/tmp/unbox-ux-after-53276.png
/tmp/unbox-ux-after-inline-move.png
/tmp/unbox-ux-after-unlinked-ticket.png
/tmp/unbox-ux-after-linked-ticket.png
/tmp/unbox-ux-after-unfound.png
/tmp/unbox-ux-after-read-only.png
/tmp/unbox-ux-after-linked-scan.png
/tmp/unbox-ux-after-receive-feedback.png
/tmp/unbox-ux-after-final-smoke.png
/tmp/unbox-ux-photos-inline-nav.png
/tmp/unbox-ux-photos-inline-final.png
/tmp/unbox-ux-fallback-displays.png
/tmp/unbox-ux-photos-inline-gallery.png
/tmp/unbox-ux-photos-inline-selection.png
```

The current screenshots show `Unbox | Photos | Ticket | Displays`, edge-to-edge
center content, inline photo/Move work, and the fallback right push column.
Measured offsets from center to task body, task host, dock left and dock right
were all `0px`. Receiving 53276 loaded 12 inline photos; opening Move and
selecting one produced one selected tile without mounting a Displays panel or
mutating data. The fallback root contained Timeline and Look, contained no
Photos entry, and closing it returned selection to Unbox. The first current
smoke also observed an unrelated development compiler page error:
`TechAllGridRow.tsx` imports missing `isSlotTrackKey` from
`materialize-tracks.ts`; the final photo-selection smoke had zero page errors.

No valid pre-cutover screenshot could be recreated after the old named
fixtures stopped resolving; `/tmp/cmp-weld2.png` remains the earlier weld
baseline.

One runtime request to the Zoho purchase-order endpoint returned HTTP 500
because the development organization has no active Zoho connection. The body
explicitly directs the operator to Settings → Integrations; it is environment
state, not a hidden Unbox destination.

### Verification result

- Design-system critique ran on all three amendment UI files. The standard
  photo controls now use `Button` / `IconButton`; `UnboxPhotosTask.tsx` and
  `ClaimPhotoPicker.tsx` report no problems. `LineEditPanel.tsx` reports only
  the existing size advisory (793 lines).
- Focused behavior suite: 55/55 pass across terminal receive actions, named
  Unbox flows/capture order, station composition, recent staged location,
  selection URL behavior, and scan feedback.
- Targeted ESLint on `LineEditPanel.tsx`, `UnboxPhotosTask.tsx`, and
  `ClaimPhotoPicker.tsx`: pass with no warnings.
- Final `pnpm verify:fast`: 9/11 gates pass. Boundary ratchet, cron, tenancy,
  schema drift, nav names, SKU identity, layer laws, design tokens, and V1
  OpenAPI pass. Lint and typecheck are red only in concurrent unrelated files:
  `src/components/CommandBar.tsx:724` has malformed JSX (also the single
  typecheck error), and lint reports that plus 29 unused imports spread across
  spreadsheet hooks and `ReceivingSelectionVerbs.tsx`. None of the three
  amendment UI files reports a lint or typecheck error.

No new test data was created, deleted, received, linked, moved, or relabeled.
