# Unbox Package Pairing → the right edge HANDOFF

**Created 2026-08-02.** Move Package Pairing out of the PO card in the Unbox
centre and make it a right-edge surface of its own.

---

## Paste this into a new session

> Read `docs/todo/unbox-package-pairing-right-rail-HANDOFF.md`.
>
> Job: Package Pairing must live **entirely on the right edge**, not inside the
> PO div in the Unbox centre. Today `CartonMatchHub` renders inline at the
> bottom of `POUnboxingSection`, which is the `contents` step body of the
> procedure column, gated by a `pairingOpen` boolean whose toggle (the pencil)
> already lives in the Displays strip on the right.
>
> Ship it as a **`pairing` Displays tab** — read §2 before writing code, it
> explains why that is the right-edge grammar here and `RightRailHost` is not.
> Delete `pairingOpen` and the pencil as part of the move; the tab's own
> selected-ness is the open state. §4 is the trap list — the guard in §4.2 will
> fail by design and needs re-pointing, not silencing.
>
> Verify by call site, not by docblock. `npm run verify` before done.

---

## 1. What is true today

| Piece | Where |
|---|---|
| The hub itself | `src/components/receiving/workspace/line-edit/CartonMatchHub.tsx` |
| Rendered inline | `…/line-edit/POUnboxingSection.tsx:134` (`{showPairing ? …}`), inside a `WorkspaceCard variant="glass"` |
| That card is | the `contentsSlot` of `UnboxProcedureColumn` — `…/terminal/unbox-tabs.tsx:127` |
| Open/closed state | `pairingOpen` — `LineEditPanel.tsx:396` |
| The toggle | `PairingTogglePill` → `editPoControl` (`LineEditPanel.tsx:420`), passed as the Displays strip `rightSlot` (`:840`) |
| Header route in | `onEditPo={openPoPairing}` (`:660`) from the carton `# ----` chip; `poEditOpen` (`:664`) lights it |
| Deep-link | `dispatchReceivingOpenPairingPo()` → `RECEIVING_OPEN_PAIRING_PO_EVENT`, which `CartonMatchHub` listens for and uses to open its PO tab |

**`POUnboxingSection` has exactly ONE consumer** (`unbox-tabs.tsx:127`). Triage
looks like it shares this component but does not — it has a sibling,
`triage/TriagePoUnboxingSection.tsx`, with its own `pairingOpen`. **Nothing in
Triage changes in this handoff.** Verify that before you start: it is the single
fact that decides whether this is a small move or a two-station one.

### Why it needs moving

The pencil sits on the right edge; the surface it opens renders in the centre,
inside one step of a scroll-snap column. Until 2026-08-02 clicking it on any
other step flipped a boolean whose only consumer was off-screen and **nothing
visibly happened**. The stopgap (`focusContentsStep`, `LineEditPanel.tsx:410`)
moves the centre's pointer to `contents` so the click has a visible effect. That
is a patch over a placement error: a control on the right should open a surface
on the right, and pairing is not part of "what is in this box".

---

## 2. The grammar — a Displays tab, not `RightRailHost`

The ask says "right rail host". In this codebase that names a specific
component, and it is **the wrong one here** — `source-of-truth.md` → Right-rail
modality is explicit that every Unbox right-edge surface is a station-scoped
push column, never a `RightRailHost` occupant, because the host renders exactly
one app-wide occupant and Unbox would be a second permanent consumer of the same
edge.

Unbox has exactly two right-edge grammars:

1. **Displays push column** (`ReceivingDisplaysPushStack`) — a display the
   operator picks, which then persists. Checklist, Classify, Listings, Units,
   Zoho, Support, Tracking, Timeline.
2. **Peer push column** (`UnboxPushColumn` siblings) — Ticket, Claim, tool.
   These are *exception* surfaces that outrank reference reading.

**Pairing is a display.** It is reference-and-edit work the operator chooses to
look at, not an exception that interrupts them, and the SoT's own test applies
directly: *"a surface that should stay visible while the operator works is a
DISPLAY the operator picks, not a region that outranks the picker."* It also
already behaves like one — its toggle is sitting in the Displays strip.

So: **add `pairing` to the Unbox side-tab vocabulary.** Do not add a fourth push
column, and do not register a `RightRailHost` occupant.

---

## 3. The move

1. **Vocabulary** — `…/line-edit/unbox-side-tabs.ts`: add `'pairing'` to
   `UnboxSideTab`, to `UNBOX_SIDE_TAB_ORDER`, and a gate in
   `isUnboxSideTabVisible`. Order matters: it belongs near `classify` (both are
   "what IS this carton" work), ahead of Listings/Units. Extend
   `unbox-side-tabs.test.ts` (6 cases today).
2. **Tab** — `…/terminal/unbox-tabs.tsx`, in `buildUnboxSideTabs`: a `pairing`
   entry mounting `CartonMatchHub` with `tabSet="unbox"` and the same `autoMatch`
   bag the inline site builds (it is assembled from `c`, which
   `buildUnboxSideTabs` already receives — copy it verbatim from
   `POUnboxingSection.tsx:145–158`, do not re-derive it).
3. **Remove the inline render** — `POUnboxingSection.tsx`: drop the
   `{showPairing ? … }` block, `showPairing`, `canCollapsePairing`,
   `pairingCollapsed`, the `headerRight` pencil `useMemo`, and the
   `pairingOpen` / `onPairingToggle` props. The component becomes the PO **line
   list** and nothing else, which is what the `contents` step is for.
4. **Delete the open state** — `LineEditPanel.tsx`: `pairingOpen`,
   `togglePairing`, `editPoControl`, `focusContentsStep`, and the `pairingOpen` /
   `onPairingToggle` entries in both memo bags (`:468`, `:503`). The strip's
   `rightSlot` (`:840`) loses the pencil — check whether anything else wants that
   slot before deleting the prop from `ReceivingDisplaysPushStack`.
5. **Re-point the header route** — `onEditPo` (`:660`) becomes
   `() => openDisplays('pairing')`, matching how `onEditTracking` /
   `onEditListing` already work two lines above. Keep the
   `dispatchReceivingOpenPairingPo()` dispatch **after** the display opens (an
   `requestAnimationFrame`, as today) so the hub is mounted when the event
   fires. `poEditOpen` (`:664`) becomes `activeSideTab === 'pairing'`.
6. **Re-check the hub's embedded props.** `embedded`, `collapsed`,
   `showTopRule` and `autoFocusSearch` exist for the inline-inside-a-card case.
   In a display the column IS the card: `collapsed` is always false, and
   `showTopRule` had a rule to sit under. Do not pass them by reflex — decide
   each, and delete any that no longer has a caller.

---

## 4. Traps

### 4.1 `PairingTogglePill` has a second consumer

`TriagePanel.tsx:217` builds its own `editPoControl` from the same primitive.
Deleting Unbox's must not delete the primitive.

### 4.2 `carton-match-hub.guard.test.ts` will fail — by design

Line ~54: *"POUnboxingSection no longer mounts a sibling UnfoundMatchStrip"*
asserts `POUnboxingSection` **matches** `/CartonMatchHub/` and `/autoMatch=/`.
Once pairing leaves that file both assertions break.

**Re-point them at the new home** (the `pairing` tab in `unbox-tabs.tsx`) and
keep what they were protecting: Auto-match embeds *inside* the hub rather than
as a sibling strip. Do not delete the assertions and do not weaken them to
`doesNotMatch` only — the "no sibling strip" half is still a live invariant.

### 4.3 The `contents` step's done-ness is unrelated to pairing

`contents` is settled by `contents_confirmed_at`, not by anything pairing
writes. Removing pairing from that step body must not change
`derive-capture-step-states.ts`. If `procedure-column-order.test.ts` or the
step-body guard goes red, you changed the step vocabulary by accident.

### 4.4 The deep-link event is order-sensitive

`CartonMatchHub` subscribes to `RECEIVING_OPEN_PAIRING_PO_EVENT` on mount. If
the event is dispatched in the same tick as the display opens, the hub is not
mounted yet and the PO tab silently does not open. The existing
`requestAnimationFrame` is load-bearing — keep it, and assert it.

### 4.5 Unfound cartons

`autoMatch` is only built when `c.isUnfound`. An unfound carton's Quick-match
actions live inside the hub, so moving the hub moves them. Check the unfound
lane specifically — it is the one where pairing is not optional.

### 4.6 Do not leave the tab gated on a boolean

The whole point is that the tab's selected-ness IS the open state
(`resolveUnboxSideTab` returns `null` for "closed", so there is no second flag).
A `pairingOpen` that survives next to `activeSideTab === 'pairing'` re-creates
the drift this move removes.

---

## 5. What this deletes (the win)

- `pairingOpen` state + `togglePairing` + `openPoPairing`'s toggle branch.
- `focusContentsStep` — the 2026-08-02 stopgap, which exists **only** because the
  control and its surface were on opposite sides. It should not survive.
- `showPairing` / `canCollapsePairing` / `pairingCollapsed` and the `headerRight`
  pencil in `POUnboxingSection`.
- The Displays strip `rightSlot` pencil.

Net: one fewer boolean, one fewer cross-region reach, and `POUnboxingSection`
goes back to doing one job.

---

## 6. Key files

| Role | Path |
|---|---|
| The hub | `src/components/receiving/workspace/line-edit/CartonMatchHub.tsx` |
| Inline render to remove | `…/line-edit/POUnboxingSection.tsx` |
| Tab builder | `…/line-edit/terminal/unbox-tabs.tsx` (`buildUnboxSideTabs`) |
| Vocabulary + gates | `…/line-edit/unbox-side-tabs.ts` (+ `.test.ts`) |
| State to delete | `src/components/receiving/workspace/LineEditPanel.tsx` |
| Displays column | `…/workspace/ReceivingDisplaysPushStack.tsx` |
| Header chip route | `…/line-edit/LineCartonContextSection.tsx` (`onEditPo` / `poEditOpen`) |
| Guard to re-point | `…/line-edit/carton-match-hub.guard.test.ts` |
| Event | `src/utils/events.ts` (`RECEIVING_OPEN_PAIRING_PO_EVENT`) |
| Laws | `.claude/rules/source-of-truth.md` → Right-rail modality · `.claude/rules/display/station-workbench.md` |

---

## 7. Verify

- **Attach to the dev server on `:3050`** — never start, restart, or kill one.
  This change is visual; it must be looked at, not just typechecked.
- Walk both lanes: a **matched** carton (pairing = change/unlink the PO) and an
  **unfound** one (pairing = Quick-match + link). The unfound lane is where the
  hub carries the most.
- Click the carton `# ----` chip and confirm it opens the `pairing` display
  **with the PO tab already selected** — that is §4.4.

```bash
npx tsx --test src/components/receiving/workspace/line-edit/carton-match-hub.guard.test.ts src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
```

```bash
npm run verify
```

**Known-red on arrival, NOT yours** (another session's in-flight files, all
untracked): `raw-button` ratchet 56 vs 54 (`UnboxProcedurePager.tsx`),
`dialog-shell` ratchet 41 vs 40 (`StaffAvatarEditor.tsx`,
`ScanStationProgressControl.tsx`), and a `tsc` error in
`tests/e2e/__deck-probe2.spec.ts`. Check whether a failing file is one you
touched before attributing it.

---

## 8. Also update when this lands

- `.claude/rules/display/station-workbench.md` — the Displays strip order line
  currently reads `Checklist · Classify (unfound) | Listings (matched) · Units ·
  Zoho` and names "the `PairingTogglePill` pencil in the strip's `rightSlot`".
  Both change.
- `.claude/rules/source-of-truth.md` → Right-rail modality, if the pairing
  display needs naming beside the other Unbox displays.
