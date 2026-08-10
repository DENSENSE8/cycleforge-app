# Handoff — House Band-1 chrome (pin scopes) across stations + To-ship

**Status:** SoT + To-ship slice 1 **landed** (docs + comments + guards). Cohort
display parity + Pin-list ports **not** started.  
**Date:** 2026-08-09  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.

---

## Paste this into a new agent session

```
Read docs/todo/band1-chrome-house-port-HANDOFF.md end-to-end, then execute the
AUDIT → PARITY slices in §4 for every Workbench Band-1 header listed in §3.
Do NOT invent Pin-list catalogs. Do NOT embed Unbox receiving on To-ship.
Do NOT Chrome-style pin/unpin system tabs.

GOAL
Apply the house Band-1 chrome DISPLAY METHOD (Unbox golden) across all scan-
station hybrid strips and the To-ship desk:

  1. Fixed process/system tabs — same for every staffer, never staff-hideable
  2. Three pin scopes never share a trigger/store:
       website page-pin → GlobalHeader HeaderPinsSwitcher
       strip list-pin   → leading Pin cube ONLY when a closed catalog exists
       page Views         → Band 3 WorkbenchViewsMenu (never Band-1 leading)
  3. Pin-list honest absence when no closed foreign-collection catalog
  4. Flush Band-1 host: WORKBENCH_CHROME_BAND_FACE (gap-0 p-0); Pin cube abuts
     tabs when earned
  5. Return-to-scan solid CTA on every hybrid strip tab (already SoT)

ALREADY DONE (do not re-litigate)
- AGENTS.md + source-of-truth.md → Workbench Band-1 strip + three-scope table
- display/workbench-ops-queue.md → three-way boundary + House Band-1 subsection
- Unbox = golden Pin-list (UnboxAddListPopover + unboxPinnedExtraTabs)
- To-ship = fixed lifecycle tabs + Band-3 Views; Pin-list omitted; guard in
  outbound-rail-dedup.guard.test.ts forbids UnboxAddListPopover / leading= /
  Unbox receiving embed under DashboardOrdersView

HARD LAWS
- AGENTS.md · source-of-truth.md → Workbench Band-1 strip · SCOPE decides home
- display/workbench-ops-queue.md · display/unbox-station.md (dock Band 1 ≠ strip)
- Never start/restart/kill :3050; user owns commits; no stash
- npm run verify before claiming done; never raise knip/DS baselines
- Stage only files you touched for this thread

Start at §4 Slice A (audit matrix). Then Slice B (parity comments + guards).
Stop before any Pin-list catalog invent (§5 is product-gated).
```

---

## 0. One-sentence goal

**Make every Workbench Band-1 strip obey the Unbox-proven chrome law** — fixed
system tabs, three separate pin scopes, Pin-list only when earned — without
porting Unbox receiving onto outbound or growing catalogs without product brief.

---

## 1. Locked law (already in SoT — read, do not rewrite unless drift)

| Concern | Home |
|---|---|
| Hard laws | [`AGENTS.md`](../../AGENTS.md) — three pin scopes · Workbench Band-1 |
| Detail | [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → **Workbench Band-1 strip** · Left-edge → **SCOPE decides its home** |
| Cohort recipe | [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md) → three-way boundary · **House Band-1 chrome** |
| Dock ≠ strip | [`.claude/rules/display/unbox-station.md`](../../.claude/rules/display/unbox-station.md) — Unbox **dock** Band 1 is scan-floor ACTION, not the Workbench strip |
| Unbox Pin-list golden | [`UnboxAddListPopover.tsx`](../../src/components/receiving/unbox/UnboxAddListPopover.tsx) · [`unbox-extra-tabs.ts`](../../src/lib/receiving/unbox-extra-tabs.ts) · [`unbox-default-pins.ts`](../../src/lib/receiving/unbox-default-pins.ts) |
| To-ship exemplar | [`OutboundWorkspaceHeader.tsx`](../../src/components/dashboard/OutboundWorkspaceHeader.tsx) · guard [`outbound-rail-dedup.guard.test.ts`](../../src/components/unshipped/outbound-rail-dedup.guard.test.ts) |

```text
GlobalHeader:  [ page-pin HeaderPinsSwitcher ]     ← WEBSITE-WIDE
Band 1:        [Pin?][ system tabs … ] [ CTAs ]    ← Pin only if closed catalog
Band 2:        [ KPI ]                             ← attention
Band 3:        [ find · Views · … · inspector ]    ← PAGE-WIDE Views
```

**Kill list**

- Chrome-style pin/unpin of system stages (Pending · Queue · History · …)
- Merging Views into `HeaderPinsSwitcher` or Band-1 `leading`
- Copying `UnboxAddListPopover` onto a surface with no closed catalog
- Embedding Unbox **receiving** (`LineEditPanel` / scan station) under `/shipping/orders`
- Auto-parking left rail to “save columns” when pinning
- Growing `UNBOX_EXTRA_TAB_CATALOG` / inventing `toShipPinnedExtraTabs` without product approval

---

## 2. What this thread already shipped (slice 0–1)

| Item | State |
|---|---|
| SoT constitution + detail | Done |
| Unbox Pin-list (golden) | Done (prior) |
| To-ship Band-1 comments → Workbench Band-1 strip | Done |
| To-ship guard: no Pin-list / no `leading=` / no Unbox embed | Done |
| Cohort header parity comments + per-surface guards | **Not done** — this handoff |
| Pin-list ports (Testing / Pack / …) | **Blocked** on closed catalogs |

---

## 3. Surface matrix — apply DISPLAY method here

Audit each `*WorkspaceHeader` Band-1 against the law. **Pin-list column = earned
only with a named closed catalog; otherwise omit.**

| Surface | Route / host | Header file | System tabs (fixed) | Views home | Pin-list | Return-to-scan |
|---|---|---|---|---|---|---|
| **Unbox** (golden) | `/unbox` | `UnboxWorkspaceHeader.tsx` | Inbound · Queue · Recent · History | Band 3 | **Yes** — closed catalog | Unbox CTA |
| **To-ship** | `/shipping/orders` | `OutboundWorkspaceHeader.tsx` | Pending · Tested · Packed · Shipped | Band 3 `OutboundViewsMenu` | **Omit** (honest absence) | N/A desk |
| Testing | `/test` | `TestingWorkspaceHeader.tsx` | Urgent · Returns · Pending · All · History | Band 3 | Omit until catalog | Required |
| Pack | `/pack` | `PackWorkspaceHeader.tsx` | Queue · History | Band 3 | Omit until catalog | Required |
| Shipping | Shipping workspace | `ShippingWorkspaceHeader.tsx` | Urgent · Pending · All · History | Band 3 | Omit until catalog | Required |
| Arrival / Triage | `/triage` | `TriageWorkspaceHeader.tsx` | (surface tabs) | Band 3 if Views | Omit until catalog | Required |
| Incoming | `/incoming` | `IncomingWorkspaceHeader.tsx` | Pipeline · Docked | Band 3 | Omit (L1 desk; Unbox embeds inbound) | N/A |
| Labels | `/shipping/labels` | `LabelsWorkspaceHeader.tsx` | (surface tabs) | Band 3 if Views | Omit until catalog | If hybrid |
| History (standalone) | `/receiving/history` | `HistoryWorkspaceHeader.tsx` | (surface tabs) | Band 3 | Omit | N/A |
| FBA / Repair / Photos / Locations / … | cohort | matching `*WorkspaceHeader` | fixed | Band 3 or honest absence | Omit | per hybrid SoT |

**Dock Band 1** (Unbox / Arrival / Testing scan floor) is **out of scope** for this
port — do not rename or “pin” dock ACTION segments.

---

## 4. Execution slices (display method — no catalog invent)

### Slice A — Audit matrix (read-only → fill gaps in this doc or PR notes)

For every row in §3:

1. Open the header file. Confirm Band-1 tabs are **fixed** (no staff hide/show).
2. Confirm Views (if any) mount on **Band 3** / triage `views` slot — never
   `WorkbenchChromeHeader` `leading`.
3. Confirm **no** `UnboxAddListPopover`, `unboxPinnedExtraTabs`, or bare Pin cube
   unless that surface has a closed catalog SoT module.
4. Confirm hybrid stations have return-to-scan in `WorkbenchTrailingCluster.actions`.
5. Note any drift (Views on Band-1, soft `gap-2` host air, Chrome unpin UI).

### Slice B — Parity (comments + guards)

For each drifted or undocumented header:

1. File-top / Band-1 comment citing **Workbench Band-1 strip** + three scopes +
   Pin-list honest absence (mirror `OutboundWorkspaceHeader`).
2. Source guard pattern (prefer extend existing sheet/header guards; do not fork
   a second SoT):
   - Band-1 has no Views `leading`
   - Band-1 has no Pin-list imports unless catalog module exists
   - System tab ids are not written from `staff_preferences` hide lists
3. To-ship remains the desk exemplar — do not weaken
   `outbound-rail-dedup.guard.test.ts`.

### Slice C — Flush face only (if audit finds host air)

If a header uses `density="band"` but host `gap-2` / `p-0.5` between leading
cube and tabs: migrate to `WORKBENCH_CHROME_BAND_FACE` (`gap-0 p-0`). No visual
redesign beyond SoT flush. Guard: `workbench-chrome-band.guard.test.ts`.

### Slice D — Verify

```bash
# Guards touched this thread
node --test --import tsx src/components/unshipped/outbound-rail-dedup.guard.test.ts
node --test --import tsx src/components/receiving/unbox/unbox-pinned-inbound.guard.test.ts
# Plus any new/extended surface guards

npm run verify -- --fast   # inner loop
npm run verify             # before claiming done
```

---

## 5. Product-gated (DO NOT execute in the parity pass)

Pin-list on a second surface requires a **closed outbound/station catalog** brief:

| Piece | Pattern (mirror Unbox) |
|---|---|
| Catalog SoT | `src/lib/<domain>/*-extra-tabs.ts` — foreign **system collections** only |
| Prefs | `staff_preferences.<surface>PinnedExtraTabs` + Zod cap 2 |
| Resolve | staff → role → org → `[]` (`null` inherit, `[]` clear wins) |
| Chrome | surface-local `*AddListPopover` — do not import Unbox-named components into outbound |
| Embed | triage-only + split prefs bucket vs L1 desk |
| Shared extract | Only when **second** consumer lands → `WorkbenchPinListPopover` |

**Candidates (examples only — not approved):** To-ship → FBA / Labels embed;
never Unbox receiving on To-ship. Unbox catalog growth remains frozen until
product unfreezes D3.

---

## 6. Done when (parity pass)

- [ ] §3 matrix audited; drifts listed and fixed or explicitly deferred
- [ ] Every hybrid / desk Band-1 header comments cite the house law
- [ ] Guards encode: no Views on Band-1 leading; no Pin-list without catalog;
      To-ship never embeds Unbox receiving
- [ ] No new pin catalogs / prefs keys
- [ ] `npm run verify` green
- [ ] User owns commit; stage only this thread’s files

---

## 7. Companion plans (history)

| Doc | Role |
|---|---|
| Cursor plan `sot_pin_chrome_law` | SoT constitution update (done) |
| Cursor plan `to-ship_band-1_port_map` | To-ship slice 1 comments + guard (done) |
| [`unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md`](./unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md) | Unbox Pin-list harden (landed) |
| [`unbox-pinned-inbound-tab-PLAN.md`](./unbox-pinned-inbound-tab-PLAN.md) | Original Unbox pin Inbound plan |

---

## 8. Anti-confusion glossary

| Phrase | Means |
|---|---|
| **Workbench Band-1 strip** | Lifecycle / process tabs above the sheet grid |
| **Unbox dock Band 1** | Scan-floor step ACTION instrument — different SoT |
| **Page-pin** | GlobalHeader jump-to-page (`quickAccess`) |
| **Strip list-pin** | Leading Pin cube → closed catalog extras |
| **Views** | Named filter combo (`saved_views`) on Band 3 |
| **Honest absence** | Omit Pin-list when no catalog — do not fake a Pin cube |
