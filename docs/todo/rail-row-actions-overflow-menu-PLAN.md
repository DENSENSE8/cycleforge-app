# Rail row actions — one ⋮ per row, no edit mode

> **Directive (operator, 2026-08-22):** delete the eyebrow pencil and the bottom
> bulk-action bar. Every rail row gets a hover **⋮** carrying its exact actions —
> Delete, Dismiss, Hide, and more. "This is how it should have been from the
> beginning."

Scope: every rail that composes `SidebarRailShell` — Unboxed, Recently searched,
Testing, Pack, Shipping, Labels, Pickup, Triage. One row anatomy, so one row menu.

---

## 1. What is on disk today

| Piece | File | Role |
|---|---|---|
| Eyebrow pencil | `src/components/sidebar/rail-shell/RailEditPencil.tsx` | flips the rail into checkbox multi-select |
| Edit-mode state | `src/components/sidebar/receiving/useRailEditMode.ts` (`RAIL_EDIT_SCOPE`) | which rows are checked |
| Edit-mode context | `src/components/sidebar/rail-edit-mode.tsx` | `RailEditModeProvider` / `useRailEditMode()` |
| Bottom bar | `src/components/sidebar/receiving/ReceivingBulkActionBar.tsx` | `SelectionActionBar`, primary = **Dismiss** |
| Row checkbox | `RailRow.tsx:181` (`h-3.5 w-3.5`) | replaces the status dot while editing |
| Mounts | `ReceivingSidebarPanel.tsx:34,58` · `TriageWorkspaceView.tsx:15,16,107` | provider + bar |

**The current model costs three interactions to dismiss one row:** arm the pencil →
check the row → hit Dismiss in a bar that appears at the far end of the column.
It also spends two permanent pieces of chrome — the pencil at the top-right of
every rail, the bar across the bottom — on an action that is per-row and rare.

And the pencil's own docblock argues for its permanence on layout grounds
("anchors the right column that lines up with each row's `5h`"). That argument
survives the deletion: the age column still anchors that edge. The pencil was
never what held it.

---

## 2. Target state

**One row, one menu, one action.** Hovering a row reveals a **⋮** in the trailing
track — the same column the age label occupies. Opening it lists exactly the
actions that row supports. Selecting one performs it immediately and offers Undo.

Deleted outright:
- `RailEditPencil.tsx`
- `ReceivingBulkActionBar.tsx`
- `useRailEditMode.ts` / `rail-edit-mode.tsx` and every `editMode.*` branch in
  `SidebarRailShell` / `RailRow` (including the checkbox that swaps out the
  status dot)
- `RAIL_EDIT_SCOPE` and its toggle-all event

**Multi-select does not survive the cut.** That is the real trade in this plan
and it should be made deliberately, not by omission — see §7.

---

## 3. The action vocabulary

The four the directive names are not four of a kind. They differ in blast radius
and in who they affect, and the menu must say so:

| Action | Scope | Reversible | Where it already lives |
|---|---|---|---|
| **Dismiss** | this staffer's rail only | yes — `staff_rail_exclusions` | `ReceivingBulkActionBar` primary, `useRailExclusions` |
| **Hide** | — | — | **has no implementation.** See §7 open question |
| **Delete** | the org's record | no | `receiving-entry-deleted` / `receiving-line-deleted` buses |
| **More** | — | — | Open · Copy id · Open in new tab · Print label |

Dismiss and Delete currently sit behind the *same* checkbox flow, which is how a
per-staff hide and an org-wide delete came to look identical. Separating them
into distinct, labelled menu items is most of the value of this change.

**Delete is the only destructive one, and it is separated in the menu** — its own
group, below a divider, tinted, never adjacent to Dismiss.

---

## 4. Interaction contract

### 4a. Reveal

The ⋮ occupies the trailing track (`SIDEBAR_RAIL_TRAILING_TRACK_CLASS`) — the
same x-rail as the age label. At rest the age shows; on row hover/focus the ⋮
takes that slot. Because it swaps into a track that already has width, **nothing
reflows** — which is the AGENTS.md constraint: nothing may tween a property that
triggers reflow, and a row that shifts on hover is exactly that.

Opacity-only transition. No width, no margin, no layout.

### 4b. Hover is the PRIMARY path — the other two are the floor

> **Operator ruling (2026-08-22):** the warehouse WMS is worked with a mouse.
> The ⋮ is a pointer affordance and hover-reveal is the intended interaction on
> the desk benches; the coarse-pointer branch is the FALLBACK for the surfaces
> that have no mouse, not a co-equal design.
>
> This is recorded because the research argues the other way and a later reader
> will otherwise re-open it: hover-only row actions are a documented
> anti-pattern, and WCAG **1.4.13 (Content on Hover or Focus)** requires
> hover-revealed content to be dismissible, hoverable and persistent. Both
> remain true. They are answered here not by refusing hover, but by making sure
> hover is never the ONLY way in — which is what paths 2 and 3 are for. Hover
> is the fast path for the hardware that actually runs the floor; it is not a
> load-bearing requirement for reaching the action.

Three ways in, in order of how often they are used:

1. **Pointer (primary)** — hover the row. Desk benches are mouse-driven, so
   this is the path an operator actually takes, and it is the one to optimise:
   no delay, no travel, the glyph in a track that already has width.
2. **Keyboard (the accessibility floor)** — the ⋮ is in the row's tab order, and `Shift+F10` (the
   platform context-menu key) opens it while the row has focus. That is the
   standard invocation the ARIA APG names for a context-specific menu.
   The rail already arms a per-row letter via `navRegionId="left"` + `⌘;`;
   the menu must be reachable from that armed state too.
3. **Touch (fallback)** — **there is no hover on a touch device.** `/kiosk*` is a mounted
   tablet, `/m/*` is mobile (`formFactor` in the ROUTES manifest), and warehouse
   operators wear gloves, where capacitive touch is already marginal and targets
   must be large. On any coarse pointer the ⋮ is **permanently visible**, not
   hover-revealed, and sized to a real touch target:

   ```css
   @media (hover: none), (pointer: coarse) { /* ⋮ always shown, larger hit box */ }
   ```

   Gate on `(hover: none)`, never on viewport width — a mounted tablet is
   desktop-width and still has no hover. This branch exists so those surfaces
   are not left with zero row actions; it is not a reason to make the desk
   bench wear a permanently-visible glyph it does not need.

### 4c. Menu semantics

Reuse `src/design-system/primitives/DropdownMenu.tsx` and `ContextMenu.tsx` —
both already exist; do not add a fourth menu engine. `RailPopover` is the hover
*peek*, a different thing, and must not be repurposed.

Required on the trigger: `aria-haspopup="menu"`, `aria-expanded`, and an
`aria-label` naming the row (`Actions for {title}` — never a bare "More", which
gives a screen-reader user twenty identical buttons).

Opening the menu must not select the row. Row click still opens the record; the
⋮ is a sibling control, and its click handler stops propagation. This is the
same rule `SearchRecentsDropdown` already follows for its remove button: the
affordance is a sibling of the row link, never nested inside it.

### 4d. Undo, not confirm

Dismiss and Hide are reversible, so they fire immediately with an Undo toast —
for anything genuinely reversible, undo beats a confirmation dialog, which taxes
every correct action to guard the rare accident. Confirmation is reserved for
irreversible outcomes.

**Delete is irreversible and keeps a confirm.** It is the one action where the
interruption is earned.

An optimistic row exit already exists (`deleteEvent` / `deleteGroupEvent` on the
shell) — the toast reuses it, and Undo re-inserts.

---

## 5. Which actions a row offers is the ROW's answer, not the menu's

The rails do not all support the same verbs: a Recently-searched row has no
carton to delete; a Triage stub has no label to print. So the menu is data-driven
from the feed, in the shape the rail already uses for everything else:

```ts
// feeds.ts — alongside qty / status
rowActions: 'receiving' | 'search' | 'pack' | …
```

resolved through a `RAIL_ROW_ACTIONS` registry that mirrors `RAIL_QTY` /
`RAIL_STATUS`. A rail declares its id; the registry returns the items. No rail
hand-rolls a menu, exactly as no rail hand-rolls a status dot.

An action the row cannot perform is **omitted, not disabled** — a disabled item
in a five-item menu is four items of noise and one dead end.

---

## 6. Phasing

1. ✅ **Add the ⋮ behind the existing actions.** Registry + trigger + menu, wired
   to the Dismiss that already works. Both models live at once; nothing is
   deleted. Verifiable on `/unbox` immediately. **Shipped 2026-08-22** — see
   §6a.
2. **Move Delete into the menu**, with its confirm, off the bulk path.
3. **Delete the old model** — pencil, bar, edit mode, checkbox, `RAIL_EDIT_SCOPE`.
   One commit, mechanical, once §7 is answered.
4. ✅ **Touch pass** — folded into step 1: the reveal rule and the coarse-pointer
   rule are one decision, and shipping the first without the second means
   shipping a rail with no row actions at all on `/kiosk` and `/m/*`. Verified
   under emulated touch (`(hover: none)` + `(pointer: coarse)`), not on real
   glass — a pass on a mounted `/kiosk` tablet is still owed.
5. **Rewrite the e2e** — `tests/e2e/search-station-layout.spec.ts` currently
   asserts the two-band rail; add a row-menu spec (keyboard open, Escape closes,
   focus returns to the trigger, menu does not select the row).

Step 1 is independently shippable and reversible. Do not start at step 3.

### 6a. What step 1 actually shipped

| Piece | File |
|---|---|
| Menu item contract (data-only: label · glyph token · callback) | `src/components/sidebar/rail-shell/rail-row-actions.ts` |
| Trigger + menu | `src/components/sidebar/rail-shell/RailRowMenu.tsx` |
| Mount (sibling of the row button) + `Shift+F10` | `RailRow.tsx` |
| Shell prop `rowActions` + the row's accessible name | `sidebar-rail-shared.ts` · `SidebarRailShell.tsx` |
| Verb registry, per feed | `src/lib/receiving/rail/row-actions.ts` (+ `.test.ts`) |
| Feed declaration `rowActions: 'receiving' \| 'searchRecent'` | `src/lib/receiving/rail/feeds.ts` |
| Dismiss mechanics, shared with the bulk bar | `src/components/sidebar/receiving/rail-dismiss.ts` |
| Single-row dismiss + Undo | `useRailRowDismiss.ts` |
| `coarse:` variant (`@media (hover: none), (pointer: coarse)`) | `src/app/globals.css` |

The menu is **Open · Copy tracking · Copy PO · Dismiss from my rail**. Hide is
not in it: §7 Q1 is unanswered and it has no implementation, so shipping the
word would have put two labels on one behaviour — the exact confusion this plan
exists to remove. Delete is step 2.

Two things the plan did not anticipate:

- **The ⋮ is a roving tab stop, not a per-row one.** §4b asks for the ⋮ "in the
  row's tab order", but the rail is a `role="listbox"` with roving tabindex —
  the rows themselves are `tabIndex={-1}` and the list is the single tab stop.
  Making every ⋮ tabbable would put twenty-five new stops in the sidebar. So
  only the CURRENT row's trigger is tabbable, which is one extra stop and the
  standard composite-widget answer; `Shift+F10` / `ContextMenu` still open it
  from the focused row, as §4b requires.
- **Undo needed an un-suppress channel.** The rail engine's delete-suppression
  is deliberately sticky (`deletedIds` / `deletedGroupIds` in `useSidebarRail`)
  so a racing refetch cannot resurrect a deleted row — correct for a delete and
  fatal for a reversible dismiss. New `restoreEvent` / `restoreGroupEvent` shell
  props clear it, and Undo also writes the snapshotted rows straight back into
  the rail cache: clearing suppression and invalidating alone leaves the rail
  (which paints from a local mirror) unchanged for long enough that Undo reads
  as a no-op. Measured on `/unbox` before the fix.

---

### 6b. Operator revisions, 2026-08-22 (after step 1 landed)

Three directives, and the fan-out:

1. **"No right side glow, just the three dots itself."** The gradient wash is
   gone. It existed to mask the age underneath; the age now *yields* instead —
   `opacity: 0` on row hover / focus-within / menu-open, never `display` or
   width, so nothing reflows. §4a always said the age gives up the slot; the
   wash was a way of avoiding that and it cost a second soft edge in the rail's
   right column on every hover.
2. **"Remove the eyebrow completely."** The `TITLE · N` band is deleted from
   `SidebarRailShell` for **every** rail, along with `eyebrowSuffix`,
   `eyebrowAction` and `hideEyebrow`. `eyebrowTitle` survives as the listbox's
   accessible name and the reveal-registry key. What is lost: the per-rail
   title, the row count, and the "You" suffix on Pack / Shipping / Testing.
3. **"The pencil icon, move it up."** `RailEditPencil` now rides the scan band's
   right rail beside the facet popover (`ReceivingSidebarPanel` →
   `filterSlot`), one band above the list it acts on, and is no longer gated on
   Preview stance. Its old docblock argued the eyebrow was permanent because the
   pencil anchored the column that lines up with each row's `5h`; deleting the
   band proved that false — the age column anchors that edge by itself.

**Fan-out to every recent rail.** `SidebarRecentRailBase` now defaults
`rowActions` from the identity facts a rail already publishes for its parked
collapse-strip peek (`getCollapsePinFacts`) — Open, plus one Copy per identity
the row carries. So Pack · Shipping · Labels · Pickup gained the ⋮ with no
per-rail wiring; `ProductLabelsRecentRail` gained it by lifting the fact list it
had inlined in `renderPopover` up to `getCollapsePinFacts` (which also fixes its
empty strip peek); Testing gets the receiving verbs minus Dismiss via
`RecentActivityRailBase`. Unit-covered in `rail-row-verbs.test.ts`.

**Dismiss is still receiving-only, and that is a gap, not a decision.**
`staff_rail_exclusions` only recognises `receiving_triage` / `receiving_unbox`
feed keys and `RECEIVING` / `RECEIVING_LINE` entity types. Giving Pack, Shipping,
Labels or Pickup a working Dismiss means new feed keys + entity types in
`rail-exclusions.ts`, the surfaces registry, and a read filter per rail. Until
then those menus omit the verb rather than show a dead one.

**`FbaItemRail` is the one rail left out.** It composes `SidebarRailShell` raw
(not the recent-rail preset) and its identity is an FNSKU, which is not one of
`RailPeekFact`'s tones. Filing it as `sku` would be a lie on a chip whose tone
drives the copy-history kind, so it waits for a real tone.

### 6c. Operator revisions, round 2 — the menu is CRUD now

> "It must display exactly the same as the on hover component. So over to the
> right side, and it must not display open PO, just the main actions, like copy
> information and share information. And there must be a delete button, a
> dismiss hide from the list — proper CRUD action buttons."

The menu on a receiving rail row now reads:

```
Copy tracking
Copy PO
Share link
────────────────────
Hide from my list
────────────────────
Delete carton          ← rose, its own group
```

- **Open is gone.** The row click already opens the record, so an Open item only
  repeated the gesture that opened the menu.
- **Grouped by blast radius**, not by theme — `read` (changes nothing) · `mine`
  (changes what THIS operator sees; reversible, fires with an Undo) · `danger`
  (changes the org's record; irreversible, earns a confirm). Dividers appear
  only between groups that both exist, so a row missing a verb never shows a
  leading or doubled rule.
- **Hide and Dismiss are one verb.** §7 Q1 asked what "Hide" was; the answer is
  that there was only ever one implementation (`staff_rail_exclusions`), so
  there is one item, labelled for the blast radius it actually has.
- **Delete answers §7 Q3.** `DELETE /api/receiving-logs?id=` — the same endpoint
  and the same cache refresh the History carton peek uses. Gated twice: the row
  must have a carton, and the operator must hold `receiving.mark_received` (what
  the route enforces), so nobody sees a button that can only 403. The confirm
  names the carton and says the radius out loud, and points at Hide as the
  softer option.
- **In-place swap, no plate.** The ⋮ glyph now sits in an inner `w-8` cell so its
  centre is identical whether the trigger's hit box is `w-8` (mouse) or `w-11`
  (touch). Measured on `/triage`: age box `x=327 w=32`, glyph cell `x=327 w=32`,
  both centred at `(343, 89.1)`. On hover the age goes to `opacity: 0` and the ⋮
  to `1` — one mark swapping for another in the same cell.
- **The peek yields to the menu.** The hover peek opens on a 0ms delay, so it is
  always up by the time a hand reaches the ⋮. It is now dismissed on
  `pointerenter` of the trigger; letting it unmount in the same commit that
  mounted the menu made Radix read the churn as an outside interaction and close
  the menu it had just opened.

Non-receiving rails keep the read verbs only (Copy per published fact). Share
needs a per-row link the shell cannot derive; Hide and Delete need stores and
routes those surfaces do not have. Still gaps, still not decisions.

## 7. Open questions — answer before step 3

1. **What is "Hide"?** Dismiss (per-staff, `staff_rail_exclusions`) exists. Hide
   has no implementation and no table. Is it a synonym for Dismiss — in which
   case the menu must show only one of them — or a *permanent* per-staff
   suppression distinct from a reversible one? Two words for one action is how
   the current bar came to read as a delete.
2. **Does multi-select die?** Today's flow can dismiss twenty rows in three
   clicks; the row menu makes that twenty menus. If clearing a batch after a
   shift is real operator behaviour, the honest answer is a menu item —
   *Dismiss all below* / *Dismiss everything older than 7d* — not the checkbox
   flow returning by the back door. If it is not real behaviour, say so and the
   deletion is clean.
3. **Is Delete on the rail at all?** It removes an org record from a per-staff
   recents list. Dismiss is what the rail is for; Delete may belong on the
   workspace, where the record's full context is on screen.

---

## 8. Verification

- `npm run verify` (lint · typecheck · unit).
- Keyboard: Tab to the ⋮, `Enter`/`Space`/`Shift+F10` open, `↑`/`↓` move,
  `Esc` closes **and returns focus to the trigger**, `Tab` closes.
- Touch: `/kiosk` at real size — ⋮ visible at rest, hit box ≥ the house minimum.
- Reflow: hovering a row must not move its neighbours. Verify by measuring a
  sibling row's `y` before and during hover; it must be identical.
- Screen reader: each trigger announces its own row.

---

## 9. Sources

- [Best Practices for Providing Actions in Data Tables — UX Design World](https://uxdworld.com/best-practices-for-providing-actions-in-data-tables/)
- [Accessible Navigation Menus: Best Practices — Level Access](https://www.levelaccess.com/blog/accessible-navigation-menus-pitfalls-and-best-practices/)
- [Kebab Menu UI: A Practical Guide](https://digitalidiom.co.uk/kebab-menu-ui/)
- [WAI-ARIA Authoring Practices — Menu and Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menu/)
- [ARIA: menu role — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/menu_role)
- [Confirmation Dialogs Can Prevent User Errors — NN/g](https://www.nngroup.com/articles/confirmation-dialog/)
- [How To Manage Dangerous Actions In User Interfaces — Smashing Magazine](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
- [How to use hover in a user interface — Embedded](https://www.embedded.com/how-to-use-hover-in-a-user-interface/)
- [Finding Industrial Touchscreens That Actually Work With Gloves](https://www.lcdonsale.com/info/finding-industrial-touchscreens-that-actually-103232263.html)
