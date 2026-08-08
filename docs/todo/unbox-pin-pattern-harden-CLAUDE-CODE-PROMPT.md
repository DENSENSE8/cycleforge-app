# Claude Code prompt — Harden Unbox pin-list pattern (Gemini rulings)

**For:** Claude Code / Cursor Agent implementing session  
**From:** Cycle Forge engineering  
**Date:** 2026-08-07  
**Status:** ready to execute — architecture locked by Gemini deep research + house SoT  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Companions (read, do not re-litigate):**

| Doc | Role |
|---|---|
| [`unbox-pinned-inbound-tab-PLAN.md`](./unbox-pinned-inbound-tab-PLAN.md) | Phase 0–1 already **landed** (Plus → pin Inbound on Unbox) |
| [`unbox-importable-tables-industry-GEMINI-RESEARCH-BRIEFING.md`](./unbox-importable-tables-industry-GEMINI-RESEARCH-BRIEFING.md) | Research brief that produced the rulings below |
| [`.claude/rules/display/workbench-ops-queue.md`](../../.claude/rules/display/workbench-ops-queue.md) | Tabs vs saved views; ops-queue recipe |
| [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) | Frame column budget; context-panel collapse; Station vs Workbench |

---

## Paste this into a new agent session

```
Read docs/todo/unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md end-to-end, then execute
§4 slices S1 → S5 in order. Do not expand the Unbox pin catalog. Do not port to
other stations. Do not put Sheets tabs into the scan column.

GOAL
Harden the landed Unbox "pin list" pattern per Gemini keep/evolve rulings:
  - Rename + → Pin list (pushpin); never imply Create table/schema
  - Hard-cap pinned Band-1 extras at 2 (system tabs stay Urgent…History = 5)
  - Split column prefs: embed vs full /incoming desk (incoming_embed vs incoming)
  - Keep embed triage-only (no Check/Import/Add on Unbox Inbound tab)
  - Ship org/role default pin templates for unboxPinnedExtraTabs
Also: keep regional sidebar split (scan periphery ≠ workbench saved-views rail)
and answer left-rail collapse with existing ContextPanelLayout SoT — never
auto-park the left rail to steal grid columns.

HARD LAWS
- AGENTS.md + source-of-truth.md + display/workbench.md + workbench-ops-queue.md
- Tabs = system collections / lifecycle; saved views = facet combos — never mix
- Band-1 max vocabulary: 5 system + 2 pinned extras
- Embeds are read/triage slices; L1 /incoming keeps rich CTAs
- Context panel: operator park only — never auto-collapse for width pressure
  (SoT yield ladder: right rail compresses first; context recents = operator park)
- Compose LedgerGrid / existing IncomingGridView — no second table engine
- Never start/restart/kill :3050; user owns commits; no stash
- npm run verify before claiming done; never raise knip/DS baselines

REFERENCE (landed v1)
- Catalog: src/lib/receiving/unbox-extra-tabs.ts
- Chrome: UnboxWorkspaceHeader + UnboxAddListPopover
- Prefs: staff_preferences.unboxPinnedExtraTabs
- Embed: ReceivingLinesTable embedded && isIncomingMode → IncomingGridView
- Tab SoT: src/utils/unbox-workspace-state.ts (incoming out of UNBOX_WORKSPACE_TABS)
- Guard: src/components/receiving/unbox/unbox-pinned-inbound.guard.test.ts

Start at §4 Slice S1 (rename/re-icon). Do not touch Horizon C custom tables.
```

---

## 0. One-sentence goal

**Keep Unbox pin-Inbound, freeze catalog growth, and harden it** so Band-1 stays scannable, Plus cannot mean “create table,” embeds stay triage-only, and saved views live on the Workbench left rail — not on Band-1.

---

## 1. Locked architecture (Gemini + house SoT)

### 1.1 Regional sidebar split (ratified)

Isolate two operator jobs so muscle memory stays stable:

| Region | Job | Left / periphery content |
|---|---|---|
| **Scan Station (act-and-clear)** | “What did I just scan, and was it successful?” | **No** traditional nav/saved-views sidebar. Periphery = MRU, immediate scan history, active error toasts, scan bar. Ephemeral throughput only. |
| **Workbench (data table)** | Pick → edit → persist on a durable collection | Left rail (`ContextPanelLayout`) = **Saved Views** + tenant/collection navigation. Band-1 = **system lifecycle tabs only** (+ ≤2 capped foreign collection pins). |

```text
┌─ SCAN periphery ─┐  ┌─ WORKBENCH ──────────────────────────────────────────┐
│ MRU / scan hist  │  │ Band-1: Urgent…History [| pin≤2]   …  [Pin list] [Unbox]
│ errors / glow    │  │ Band-3: find · facets · ▦
│ (no saved views) │  │ LEFT: SavedViewsList (facets) │ GRID │ RIGHT: inspector
└──────────────────┘  └──────────────────────────────────────────────────────┘
```

**Band-1 does not host saved views.** Facet switching (Exception Triage, SLA Breaches, Special Handling, Batch Ops — see §1.3) lives in the **Workbench left rail** via `useSavedViews` / `SavedViewsList`.

### 1.2 Unbox pin-list pattern (evolve, do not kill)

| Rule | Detail |
|---|---|
| Keep | Pin a **closed catalog** foreign **system collection** onto Unbox Band-1 |
| Cap | **Max 2** pinned extras (`D2`, `D14`: 5 system + 2 pinned ≤ 7) |
| Freeze catalog | **0 new catalog entries** for 90 days (`D3`) — Inbound only |
| No port | Do **not** port composer to Arrival/Pack/Testing in 90 days (`D4`) |
| Embed chrome | **Triage/read only** — never Check / Import / Add on embed (`D8`, `C10` KILL) |
| Full desk | `/incoming` stays L1 for rich CTAs (`D7`) |
| Icon/copy | **Pin list** (pushpin), never leading bare `+` (`D12`, `C14`) |
| Sheets | **Never** bottom tab bar / workbook metaphor (`D10`, `C7` KILL) |
| Custom tables | **Never** via floor Plus — Horizon C / Studio only (`D11`, `C9` KILL) |
| Home | **Not** the pin-strip host (`D5`, `C4` KILL) |

### 1.3 Anatomy of warehouse saved views (left rail — Workbench only)

A saved view is a **persistent named facet combination** (filters + sort + column visibility delta) over **one collection** — not a second database and not a Band-1 tab.

Standard buckets for B2B ops (compose into `SavedViewsList` on Workbench rails; do not invent a second store):

| Bucket | Job | Example facets |
|---|---|---|
| **Exception triage** | Manual / manager intervention | Identity-transition / exception flags — **not** a fake terminal `FAILED` status that lies about lifecycle |
| **SLA / expedites** | Time-sensitive | Shipping SLA &lt; 2h · Overdue docked POs · Stale in Unbox 24h+; sort by time-in-state |
| **Special handling** | Physical diversion | Heavy/LTL · Hazmat/battery · VIP bypass |
| **Batch operations** | Multi-select ready | Ready for label print (shared method) → bulk print |

Storage remains polymorphic `saved_views` + `useSavedViews` (`SAVED_VIEW_SURFACES`). **Never** encode these as Band-1 tabs.

### 1.4 Left-rail collapse / expand vs grid column real estate (locked answer)

**Question:** If the left rail hosts saved views, how should collapse/expand work so the center grid does not lose crucial columns?

**Answer (house SoT — implement; do not invent a second collapse):**

1. **Operator-owned park only.** Width pressure **never auto-closes** the left context rail. Yield ladder (source-of-truth → Frame column budget): compress **right** rail first → then center floor rules → context rail parks only via **operator** gesture.
2. **Gestures (already SoT):**
   - Filter trailing collapse (`RailFilterCollapseButton` / `TechRailSearchBar` rail variant)
   - Drag trailing edge past min (`CONTEXT_PANEL_COLLAPSE` / `collapseBelowPx`)
3. **Parked strip:** slim expand strip (`CONTEXT_PANEL_COLLAPSE`); whole-strip click restores; mid-strip MRU peek stays available on scan-adjacent rails — scan periphery still answers “what did I just do?” when the full saved-views list is parked.
4. **Center floor:** desk surfaces keep `MIN_WORK_SURFACE_PX`; scan stations keep locked ~720 center (`STATION_PUSH_CENTER_FLOOR_PX`). Open saved-views rail + open inspector must still leave the grid usable — prefer **horizontal scroll / lean column set on embed** over stealing the left rail.
5. **Do not** auto-collapse saved views when pinning Inbound or opening ▦. That would punish view switching to “save” columns and destroy spatial predictability.

**Embed-specific column relief (Gemini D13):** split prefs buckets so the Unbox Inbound embed can hide heavy columns **without** ruining `/incoming` desk density — see Slice S3. That is how the grid keeps real estate, not by auto-parking the left rail.

---

## 2. KEEP / KILL / EVOLVE (locked from Gemini)

| ID | Candidate | Ruling |
|---|---|---|
| C12 | Cap Band-1 extras at 2 | **KEEP** — implement S2 |
| C14 | Rename Plus → Pin list | **KEEP** — implement S1 |
| C13 | Deep-link only | **EVOLVE** — keep pin UI; deep links stay |
| C11 | Org/role default pin templates | **KEEP** — implement S5 |
| C1 | Unbox pin Inbound | **EVOLVE** — harden, don't kill |
| C3 | Port to other stations | **EVOLVE** — defer &gt;90d |
| C6 | Replace pins with saved views only | **KILL** |
| C2 | Grow Unbox catalog now | **KILL** (freeze 90d) |
| C8 | Airtable Interfaces on station | **KILL** |
| C4 | Pin strip on Home | **KILL** |
| C5 | Global pins in left rail as related lists | **KILL** (left rail = facets for **active** collection) |
| C10 | Full Inbound CTAs on embed | **KILL** |
| C9 | Custom tables via Plus | **KILL** (Horizon C / Studio) |
| C7 | Sheets bottom tabs | **KILL** |

---

## 3. Forced decisions checklist (D1–D14)

Use as acceptance criteria in PRs:

- [x] **D1** Conditional keep — triage-only embed, capped pins  
- [x] **D2** Cap extras at **2** — `UNBOX_PINNED_EXTRA_TABS_MAX`, enforced in sanitize + write path + popover + Zod  
- [x] **D3** Freeze catalog 90d — guard asserts catalog stays Inbound-only (`unbox-pinned-inbound.guard.test.ts`)  
- [x] **D4** No port to other stations this quarter  
- [x] **D5** Home is not pin host  
- [x] **D6** Keep pin UI; rename/re-icon — pushpin `Pin` + "Pin list"  
- [x] **D7** `/incoming` stays L1  
- [x] **D8** No Check/Import/Add on Unbox Inbound embed — embed mounts `IncomingGridView` directly (asserted)  
- [x] **D9** Org/role default pin templates — **shipped.** Org default = registry toggle `receiving.unboxDefaultPinnedExtraTabs`; per-role = one advanced `select` (Inherit · Pinned · Not pinned) per role → flat keys `receiving.unboxDefaultPinnedByRole.<role>`; resolve order `staff → role → org → []` folded server-side (`resolveUnboxPinnedTabs`) + hydrated read-time in the chrome  
- [x] **D10** Never bottom Sheets tabs  
- [x] **D11** No custom tables on Band-1  
- [x] **D12** Rename before any catalog growth  
- [x] **D13** Split column prefs `incoming` vs `incoming_embed`  
- [x] **D14** Max strip vocabulary 7 (5+2) — enforce in chrome  

---

## 4. Implementation slices (execute in order)

### S1 — Rename & re-icon the composer (≤2 days)

**Do**

1. Replace leading bare Plus mental model in [`UnboxAddListPopover.tsx`](../../src/components/receiving/unbox/UnboxAddListPopover.tsx):
   - Icon: pushpin / pin glyph from `@/components/Icons` (not `Plus`)
   - `ariaLabel` + tooltip: **Pin list** / **Pin a list to this strip**
   - Popover eyebrow: **Pin list** (not “Add list” if that reads as create)
2. Popover row copy stays catalog label + one-line description; no “Create…” verbs.
3. Update [`unbox-pinned-inbound.guard.test.ts`](../../src/components/receiving/unbox/unbox-pinned-inbound.guard.test.ts) + any Plus-specific selectors (`data-testid="unbox-add-list"` → `unbox-pin-list`).
4. Touch [`docs/todo/unbox-pinned-inbound-tab-PLAN.md`](./unbox-pinned-inbound-tab-PLAN.md) status note: Plus renamed (do **not** edit the Cursor `.plan` file).

**Done when:** dogfood Unbox shows pin icon; no `+` affordance on Band-1 leading cluster.

### S2 — Band-1 hard cap of 2 pins (≤1 day)

**Do**

1. In pin write path ([`UnboxWorkspaceHeader.tsx`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx) / prefs):
   - Reject pin when `sanitizeUnboxPinnedExtraTabs(...).length >= 2`
   - Popover: disable remaining catalog rows + caption “2 lists pinned — unpin one to add another”
2. Centralize constant in [`unbox-extra-tabs.ts`](../../src/lib/receiving/unbox-extra-tabs.ts): `UNBOX_PINNED_EXTRA_TABS_MAX = 2`.
3. Unit test: third pin does not persist.
4. Zod already `.max(8)` — tighten to `.max(2)` on `unboxPinnedExtraTabs` in [`staff-preferences.ts`](../../src/lib/schemas/staff-preferences.ts).

**Done when:** cannot pin a third extra; system five tabs unaffected.

### S3 — Split column preference buckets (≤2 days)

**Do**

1. Introduce embed table id (name locked): **`incoming_embed`**.
   - Add to `TableId` / `TABLE_COLUMNS` if required by Fields plumbing, **or** pass `tableId="incoming_embed"` only through `TableColumnConfigProvider` with columns cloned from Incoming layout SoT (prefer one descriptor factory, two prefs buckets).
2. Embedded Unbox path in [`ReceivingLinesTable.tsx`](../../src/components/station/ReceivingLinesTable.tsx): `tableId="incoming_embed"` (today wrongly shares `"incoming"`).
3. Full `/incoming` desk keeps `tableId="incoming"`.
4. Guard: embed branch must not use `tableId="incoming"`.
5. Document in unbox-pinned-inbound plan: D13 split.

**Done when:** hiding Tracking on Unbox Inbound does **not** hide it on `/incoming`.

### S4 — Strip rich CTAs from embed (≤1 day)

**Do**

1. Assert Unbox Inbound tab does **not** mount `IncomingChromeActions` / Check·Import·Add (already true for header — keep guard).
2. If grid descriptor or trailing cluster grows Incoming actions later, gate with `embedded` / surface capability `headerActions: false` for embed.
3. Optional quiet link in Band-3 or empty-state: “Open full Inbound” → `/incoming` (deep link only; not a third CTA cluster).

**Done when:** guard fails if Check/Import/Add appear under Unbox Inbound embed chrome.

### S5 — Org / role default pin templates (≤1 week)

**Do**

1. Settings (admin/supervisor): org or role default for `unboxPinnedExtraTabs` (closed enum `incoming` only for now).
2. Resolve order: **staff override → role default → org default → `[]`**.
3. Prefer settings-registry / org settings flat key (e.g. `receiving.unboxDefaultPinnedExtraTabs`) + existing staff prefs override — follow [`docs/settings-registry.md`](../settings-registry.md); no ad-hoc table unless registry cannot express it.
4. On first load with empty staff pins, hydrate from role/org default (do not overwrite an explicit empty staff choice once “cleared” — define: absent key = inherit; `[]` = staff cleared).
5. Unit tests for resolve order.

**Done when:** shift lead can set default Inbound pin for a role; new staff see it without personal Plus click.

---

## 5. Explicit non-goals (90 days)

- Growing `UNBOX_EXTRA_TAB_CATALOG` beyond `incoming`
- Porting pin composer to Arrival / Pack / Testing / Shipping
- Home pin strip / My Day as multi-collection Band-1
- Docked lane inside Unbox embed
- Check / Import / Add on Unbox Inbound tab
- True custom tables / Studio DDL from floor UI
- Sheets bottom tab bar
- Auto-collapsing left context rail to “make room” for columns
- Replacing system Urgent/Recent/Queue/All/History with personal freeform tabs

---

## 6. Key files (touch list)

| Area | Path |
|---|---|
| Pin popover | `src/components/receiving/unbox/UnboxAddListPopover.tsx` |
| Strip chrome | `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` |
| Catalog + max | `src/lib/receiving/unbox-extra-tabs.ts` (+ `.test.ts`) |
| Embed mount | `src/components/station/ReceivingLinesTable.tsx` |
| Prefs schema | `src/lib/schemas/staff-preferences.ts` |
| Prefs types | `src/lib/neon/staff-preferences-queries.ts` |
| Table ids | `src/lib/tables/table-columns.ts` (if `incoming_embed` registered) |
| Incoming layout | `src/lib/receiving/incoming-grid-layout.ts` |
| Context collapse SoT | `src/components/sidebar/context-panel-column.ts`, `ContextPanelLayout.tsx` |
| Saved views list | `src/components/saved-views/SavedViewsList.tsx` |
| Guards | `unbox-pinned-inbound.guard.test.ts`, kpi/history guards if chrome copy changes |

---

## 7. Verify

```bash
npm run verify
```

Also run focused:

```bash
node --import tsx --test \
  src/lib/receiving/unbox-extra-tabs.test.ts \
  src/components/receiving/unbox/unbox-pinned-inbound.guard.test.ts \
  src/utils/unbox-workspace-state.test.ts
```

Manual dogfood:

1. Unbox → Pin list → Inbound (pin icon, not +).  
2. Second pin blocked with clear copy (when a second catalog entry exists later; today catalog size 1 — still enforce max in code).  
3. Hide a column on Unbox Inbound → `/incoming` columns unchanged.  
4. No Check/Import/Add on Unbox Inbound.  
5. Unbox CTA still resumes scan.  
6. Collapse left rail via filter trailing — grid gains width; **re-open** does not require reload; width pressure from right inspector does **not** auto-park left rail.

---

## 8. Anti-roadmap (do not build even if asked mid-session)

- Spreadsheet workbooks / bottom tabs / open cell lifecycle overwrite  
- “Create table” from floor Band-1  
- Full-power embeds duplicating L1 desks  
- Infinite horizontal Band-1 carousel of personalized lists  
- Auto-yield that parks saved-views rail whenever the inspector opens  

---

## 9. Open risks → mitigations (track in PR descriptions)

| Risk | Mitigation |
|---|---|
| Training fragmentation | S5 org/role defaults |
| Dual front doors | S4 triage-only embed; `/incoming` remains L1 |
| Plus/Airtable misread | S1 pin icon + copy |
| Band-1 overflow on 1080p | S2 hard cap 2 |

---

## 10. Status log

| Date | Note |
|---|---|
| 2026-08-07 | Phase 0–1 pin Inbound **landed** (`unbox-pinned-inbound-tab-PLAN.md`) |
| 2026-08-07 | Gemini research → this harden prompt (S1–S5 locked) |
| 2026-08-07 | **S1–S5 executed.** S1 pushpin/copy · S2 cap-2 (sanitize+write+popover+Zod) · S3 `incoming_embed` prefs split · S4 triage-only embed guard · S5 org default (registry toggle) + `resolveUnboxPinnedTabs` (staff→role→org→[]) + server fold + `useUnboxDefaultPins`. Tests green (resolver 5, extra-tabs, schema cap, guard). |
| 2026-08-07 | **Per-role admin control added** (D9 fully done) — generated advanced `select` rows per role in the settings registry (`receiving.unboxDefaultPinnedByRole.<role>`, tri-state Inherit/Pinned/Not-pinned); accessor reads flat keys + `canonicalRole` fold; `unbox-role-default.test.ts` covers the fold. **Remaining deferral:** optional "Open full Inbound" embed link (S4 item 3, cosmetic). |
