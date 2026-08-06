# SpaceX Displays topic plate + flush tab stack — HANDOFF

**Superseded for four-edge plate chrome:** see
[`spacex-topic-plate-four-edge-HANDOFF.md`](./spacex-topic-plate-four-edge-HANDOFF.md)
(outer frame is `border-border-default`, not near-invisible `border-hairline`).

**Created 2026-08-05.** Paste-ready prompt for the next agent after the first
Cybertruck Displays chrome slice.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits.

**Verify:** `npm run verify` was green after this slice. Do not raise DS
ratchet baselines.

---

## What shipped (done — do not re-open)

### 1. SpaceX / Cybertruck topic plate

Unbox Displays `SectionTabsSlider` `density="icon"` is an edge-to-edge
**`h-10` instrument plate**, not a quiet `h-6` toolbar.

| Lock | Where |
|---|---|
| Plate geometry | [`SectionTabsSlider.tsx`](../../src/design-system/components/SectionTabsSlider.tsx) — `ICON_CELL_*` = `h-10` + `flex-1`; `compact` = tighter **horizontal** pad only |
| Vertical hairlines | Icon primary row: `divide-x divide-border-hairline`; ⋮ peer: `border-l` |
| Flush cancel | [`ReceivingDisplaysPushStack.tsx`](../../src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx) — `DISPLAYS_STRIP_HEADER_CLASS = '-mx-4'` |
| Mount | [`unbox-tabs.tsx`](../../src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx) — `density="icon"` + `compact` + `fillHeight` |
| SoT | [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) → Section tabs / identity chrome |
| Guard | [`tab-display-displays-hosts.guard.test.ts`](../../src/design-system/components/tab-display-displays-hosts.guard.test.ts) — `h-10`, no `h-6` compact face, `-mx-4`, `MoreVertical`, `divide-x`, `space-y-0` |

### 2. Zero vertical air between stacked tab rows

Cybertruck stack under Ticket → Claim:

```
[ Topic plate: Ticket · Photos · … · ⋮ ]   h-10, -mx-4
[ Chat · Claim ]                            TabDisplay underline, -mx-4, gap-0
[ New ticket · Link existing ]              TabDisplay segment, gap-0
[ 1.PHOTOS · 2.TICKET · … ]                 ScrollSpyNav, gap-0
```

| Lock | Where |
|---|---|
| Host stack | `TicketDisplayHost` / `PhotosDisplayHost` / `LinkageDisplayHost` / `UnitsDisplayHost` — `flex-col gap-0`; nested verbs `-mx-4` |
| Claim child chrome | [`ClaimWizardNav.tsx`](../../src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx) — `flex-col gap-0`; **no** `pt-*` / `pb-*` / `space-y-*` |
| Segment / spy | `TabDisplay` segment `p-0`; `ScrollSpyNav` `px-0 py-0`; borders zeroed on L/R so rows abut |
| Guards | Same Displays host guard + [`receiving-claim-drawer.guard.test.ts`](../../src/components/receiving/workspace/receiving-claim-drawer.guard.test.ts) |

**Body content** may still use `pt-3` under the last tab row (Photos / Linkage /
Units bodies). That is **not** spacing between tab rows.

### 3. Industrial TabDisplay SoT (prior + this tree)

- Parent: `appearance="underline"` (Chat·Claim, Browse·Move·Send, …)
- Child: `appearance="segment"` (New ticket · Link existing)
- Soft `TabSwitch` pills are **not** Displays chrome

Stitch brief (vision, not execution checklist):
[`industrial-tabdisplay-stitch-PROMPT.md`](./industrial-tabdisplay-stitch-PROMPT.md)

### Parked (knip-ignored, not this slice)

`StationRightEdgeAction` lives at
`src/components/station/entity-context/StationRightEdgeAction.tsx` (chrome tokens
co-located; barrel does not re-export). Remount Triage “Open in Unbox” later —
do not knip-delete without replacing the SoT.

---

## Explicit non-goals (next slices — pick one)

1. **Demote Chat · Claim** type/height under the topic plate (parent plate
   already outranks; nested underline can go quieter / shorter).
2. **Collapse New ticket · Link existing / ScrollSpyNav** into a denser single
   band or move ⋮ into `UnboxPushColumn` dismiss band (⋮ stays on the topic
   plate today).
3. **Workbench `TabSwitch` bands** / Support / MyDay icon rails — only if they
   share icon-cell constants; do not fork a second plate.
4. **Full industrial Stitch vision** (lifecycle bands, inverse fill retirement)
   — see stitch prompt; not required for Displays flush.

---

## Paste this into a new Claude Code / Cursor session

```
Read docs/todo/spacex-displays-topic-plate-flush-HANDOFF.md end-to-end before editing.

CONTEXT
Cycle Forge Unbox Displays push column (right edge). First Cybertruck slice
already shipped:

1. Topic strip = SectionTabsSlider density="icon" as SpaceX h-10 edge-to-edge
   plate (-mx-4, flex-1 cells, divide-x, trailing MoreVertical ⋮). compact does
   NOT shorten height.
2. Nested verb rows + ClaimWizardNav sit gap-0 flush under the plate — no
   vertical padding between Ticket → Chat·Claim → New/Link → ScrollSpyNav.
3. Guards + station-workbench SoT updated. npm run verify was green.

Lane: attach to :3050; never start/restart/kill the dev server. User owns commits.

GOAL (choose ONE next slice — ask user if unclear)
A) Demote Chat·Claim (and peer DisplayHost underlines) so the topic plate is
   unambiguously the heaviest row — shorter face and/or quieter type, still
   industrial underline, still gap-0 under the plate.
B) Condense Claim child chrome (New/Link + ScrollSpyNav) into one denser
   instrument band without reintroducing soft pills or vertical air.
C) Audit live UI on Unbox → Displays → Ticket → Claim for any remaining white
   gutter between tab rows (dismiss band ↔ plate, plate ↔ Chat·Claim, etc.)
   and close only those gaps — do not restyle body content spacing.

HARD LAWS
- Compose from TabDisplay / SectionTabsSlider SoT — never fork page-local tabs.
- Displays ≠ Desk inspector ≠ LineEdit (source-of-truth.md).
- Motion only via @/design-system/motion; no framer-motion outside DS.
- DS ratchets down only — never raise baselines.
- npm run verify before done.

DO NOT
- Re-open h-10 plate / -mx-4 / gap-0 host contracts unless a guard fails.
- Move ⋮ into UnboxPushColumn dismiss band unless the user explicitly asks.
- Soft TabSwitch / PaneHeaderTabs / rounded-full pills on Displays chrome.
- Edit the plan file at ~/.cursor/plans/spacex_displays_top_rail_*.plan.md.

VERIFY
npm run verify must pass. Extend tab-display-displays-hosts.guard.test.ts or
receiving-claim-drawer.guard.test.ts if you change chrome contracts.
```

---

## Smoke check (human)

1. Open Unbox → open Displays → **Ticket**.
2. Topic plate is tall, edge-flush, ⋮ on the same row.
3. Switch **Claim**: Chat·Claim, New/Link, and PHOTOS·TICKET·… sit **flush** —
   no white bands between those rows.
4. Nested content below the last tab row may still have normal body padding.
