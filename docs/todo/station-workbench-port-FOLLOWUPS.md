# Station Workbench — port follow-ups

Backlog left after the SoT-hardening pass (2026-07-23). Rules + CI guards now
seal the anatomy (`.claude/rules/display/station-workbench.md`,
`src/components/station/workbench/station-workbench-chrome.guard.test.ts`); these
are the panel ports the guards baseline/allowlist as **known gaps**. Priority by
alignment pain. Each closes a guard baseline or allowlist entry — never raise a
baseline to "finish" one.

1. ~~**Shipping host fold**~~ — **DONE 2026-07-28.** `tech/ActiveOrderWorkspace.tsx`
   now composes `StationPanelRoot` → `StationContextBar` (identity bookmark,
   pinned flush under GlobalHeader) → `StationWorkbench` (`entityContext`
   notices · `tabs` = `ShippingScanWorkspace` · `children` = substitution ·
   `dock` = preview Start). The dual `PaneHeader` title row is gone (its close
   button is the identity back chevron; the decorative "Scan next" hint chip was
   dropped — the sidebar scan bar owns that affordance). `shipping-terminal.tsx`
   dock track is 720. `MAX_W_3XL_BASELINE` → 0; `ShippingScanWorkspace` /
   `ActiveOrderWorkspace` off `STATION_WORKBENCH_ADOPTION_EXEMPT`
   (`ActiveOrderWorkspace` is now in `STATION_WORKBENCH_REQUIRED`).

2. **Labels registry slice** — `outbound/labels/LabelsOrderWorkspace.tsx`: replace
   the hand-built `TerminalActionVm` with a `STATION_TERMINAL_REGISTRY` `labels`
   slice + `useStationTerminalAction`; migrate the panel root to `StationPanelRoot`
   (Guard C baseline). Removes it from `TERMINAL_HAND_VM_ALLOWLIST` and drops
   `PANEL_ROOT_BASELINE` to 0.

3. **Packer review registry slice** — `features/review/packer/PackerReviewMode.tsx`:
   registry `review` slice instead of the inline VM. Removes it from
   `TERMINAL_HAND_VM_ALLOWLIST`.

4. **Support ticket** — decide: promote a sibling identity SoT for
   `SupportTicketIdentity` (ticket entity) vs. keep the documented fork; move the
   local `resolveSupportTerminal` onto the registry or keep it allowlisted with a
   rationale.

5. **Pickup** — `work-orders/LocalPickupEditPanel.tsx` (if still live post
   `/pickup` reroute): move `PaneHeaderActionBar` out of `StationWorkbench`
   `toolbar` into `StationMoreDetails` / mode chrome.

6. **Repair (Tier D)** — `repair/RepairIntakeForm.tsx`: remount on
   `StationWorkbench` + `StationContextBar`, **or** drop it from the Unbox-family
   adopter list in docs. Removes it from `STATION_WORKBENCH_ADOPTION_EXEMPT`.

7. **Pack** — formalize the terminal-exempt stance: a typed `terminalExempt` flag
   in the registry (today Pack simply mounts no dock).

8. **Mode chrome** — extend `WORKSPACE_MODES` for shipping/pickup/repair if/when
   they gain `StationHeaderToolbar` chrome (Guard G currently lists them as
   `TERMINAL_MODES_WITHOUT_HEADER_CHROME`).

9. **StationComposerDock adoption** — Unbox overview owns the first chat-style
   notes composer in the dock band (`StationComposerDock` + compact
   `SlicedActionDock` `align="end"`). Candidates to promote later: Triage
   mid-canvas notes, AssistantDock / Support auto-grow field (shared primitive),
   other station overview note buffers. Do not fork a second prompt shell.
