# Incoming chrome display — handoff

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/incoming-chrome-display-HANDOFF.md` and start at §4.

**Lane:** `main` (WS-DOGFOOD). Stay on the checkout’s branch. User owns commits —
do not commit unless asked. Attach to the user’s dev server on `:3050`; never
start / restart / kill it.

**Status as of 2026-07-30:** Incoming workbench chrome **re-partitioned** and
**padding-aligned**. Sources live in `WorkbenchChromeHeader`; sidebar is Views
only; carrier breakdown popover is gone; chrome SoT defaults to hug tabs.
Working tree may still be **uncommitted** — verify with `git status` before
assuming `main` tip has this.

**House companion (do not conflate):** Mode + Recents in GlobalHeader is already
law — [`header-mode-switcher-UNBOX-HANDOFF.md`](./header-mode-switcher-UNBOX-HANDOFF.md)
(historical). Further chrome SoT compounds live in
[`chrome-sot-compound-PLAN.md`](./chrome-sot-compound-PLAN.md). This handoff is
**Incoming-only display chrome**, not a Mode/Recents redo.

---

## 0. The four things to internalise

1. **Altitude split is intentional.** Purchasing **source** (All · Zoho · eBay)
   is a **workbench lifecycle / facet tab** → left of
   [`WorkbenchChromeHeader`](../../src/components/dashboard/workbench-shell.tsx).
   **POS vs Email** is a **nested view** →
   [`IncomingSidebarPanel`](../../src/components/sidebar/receiving/IncomingSidebarPanel.tsx).
   Delivery attention + PO date stay in the chrome **filter popover**. Sort is
   trailing `QueueSortSwitch`, not a filter-menu twin.
2. **One writer per URL param.** See §2. Dual writers = flaky deep links.
3. **Compose the chrome SoT; do not fork a page-local tab band.** Incoming already
   uses `WorkbenchChromeHeader`. The padding fix grew that SoT (`tabsFit` default
   `hug` + even `p-1.5` inset) — it applies house-wide to every consumer.
4. **Carrier “By carrier” breakdown is deleted on purpose.** It was read-only,
   mostly `Other / UNKNOWN`, and did not drive list filters. Carrier mismatch
   remains reachable via Filters → Attention (`?state=CARRIER_MISMATCH` / tiles).
   Do not restore a truck popover or `by_carrier` payload without a product ask.

---

## 1. What shipped (keep)

| Concern | Where | Behavior |
|---|---|---|
| Sources tabs | `IncomingWorkspaceHeader` → `WorkbenchChromeHeader` `tabs` | All / Zoho / eBay; writes `?inbound=` (`all` drops the param). eBay tab only when `universal_incoming`. |
| Views rail | `IncomingSidebarPanel` | `SidebarSectionList` — Incoming POS · Email Triage; only writer of `?incview=`. |
| Attention filters | Header filter popover | Full `TILES` set (incl. **Delivered · not unboxed**); writes `?state=`. |
| Sort | Trailing `QueueSortSwitch` | Quiet display sort; not inside Filters. |
| Fields / Import / Add / page | Trailing cluster | Unchanged recipe; `GridFieldsMenu` + `IncomingChromeActions` + `PaneHeaderPagination`. |
| Chrome density | `WorkbenchChromeHeader` + `TabSwitch` | Default `tabsFit="hug"` (`px-3 py-2`); outer card `p-1.5`; hug track stays `w-max` even when `scrollable` (no short-rail stretch). |
| Dead twins removed | — | `IncomingViewBand` gone; `IncomingCarrierBreakdown` / `by_carrier` dropped from summary types + client map. Filter-menu Status/Sort/By-carrier blocks removed. |

Key files:

- [`IncomingWorkspaceHeader.tsx`](../../src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx)
- [`IncomingSidebarPanel.tsx`](../../src/components/sidebar/receiving/IncomingSidebarPanel.tsx)
- [`incoming-tiles.ts`](../../src/components/sidebar/receiving/incoming/incoming-tiles.ts) — hunt tiles incl. `DELIVERED_NOT_UNBOXED`
- [`workbench-shell.tsx`](../../src/components/dashboard/workbench-shell.tsx) — `tabsFit` + padding
- [`TabSwitch.tsx`](../../src/design-system/components/TabSwitch.tsx) — hug + scrollable track rule

---

## 2. URL ownership (do not break)

| Param | Writer | Reader |
|---|---|---|
| `?inbound=` | Workbench Sources tabs | Incoming list SQL / mode context |
| `?incview=` | Sidebar Views (`pos` default = omit) | Sidebar + Email Triage pane |
| `?state=` | Filters → Attention | List + tile active state |
| `?po_from` / `?po_to` | Filters → date | List |
| `?sort=` | Trailing `QueueSortSwitch` | List |
| `?rh_q` / search | `ToolbarSearchToggle` via `useIncomingFilters` | List |
| `?page=` | Pagination; **cleared** on facet/filter changes | List |

Same params the table already reads — no second search engine, no prop-drilled
filter state.

---

## 3. Decisions locked — do not re-open

| Decision | Verdict |
|---|---|
| Sources altitude | **Workbench chrome tabs**, not sidebar |
| POS / Email altitude | **Sidebar nested view**, not GlobalHeader Mode |
| Sort chrome | **`QueueSortSwitch` trailing** ([`workbench-sort-chrome.mdc`](../../.cursor/rules/workbench-sort-chrome.mdc)) |
| Carrier breakdown UI | **Removed** — Attention tiles cover mismatch / delivered states |
| `DELIVERED_NOT_UNBOXED` | **First-class Incoming Attention tile** (was Unbox-KPI-only / URL-only) |
| Solid tab density | **`hug` default** on `WorkbenchChromeHeader`; `fill` only if a surface truly needs a stretched strip |
| Dual chrome | Never remount Sources in the sidebar **and** the header |

---

## 4. What to do next — start here

### 4.1 Browser smoke (required before calling display “done”)

On `:3050` `/incoming` (QA or dogfood org with Universal Incoming if testing eBay):

1. **Chrome row** — Sources (All · Zoho · eBay) left-align visually with the
   search / filter / trailing `h-8` cluster (no left-heavy canyon; tabs not
   oversized vs icons).
2. **Sources** — All ↔ Zoho ↔ eBay updates `?inbound=` and the table; All drops
   the param; page resets to 1.
3. **Sidebar Views** — POS ↔ Email Triage updates `?incview=` only; Sources stay
   on the right pane when POS is active.
4. **Filters** — Attention rows (incl. Delivered · not unboxed) set `?state=`;
   date sets `po_from`/`po_to`; Clear filters clears both; sort is **not** in
   this menu.
5. **Trailing sort** — `QueueSortSwitch` changes `?sort=` without opening Filters.
6. **No truck / By carrier** block in Filters or chrome.
7. Spot-check **Outbound** (or Media Library) chrome — hug tabs should still
   look intentional; long rails still scroll.

### 4.2 Verify

```bash
npm run verify -- --fast   # inner loop
npm run verify             # before claiming done / before any commit ask
```

### 4.3 Optional polish (only if operator feedback)

- Sidebar Views eyebrow `pt-2` vs chrome card top — if the two panes still feel
  vertically stepped, align via `SIDEBAR_GUTTER` / chrome column `py-2`, **not**
  a page-local magic pad.
- Encode one paragraph in [`.claude/rules/display/workbench.md`](../../.claude/rules/display/workbench.md)
  if Incoming’s source-vs-view split should become house law for similar
  “purchasing source + nested channel view” surfaces (Ask first — pattern
  evolution, not silent scope creep).
- Guard idea (optional): assert Incoming Sources tabs are not remounted under
  `IncomingSidebarPanel` (path/string guard) — only if twin risk returns.

### 4.4 Out of scope for this handoff

- Unbox “more details” → receiving details panel (separate earlier work).
- eBay delivered-not-unboxed **backend** SLA / claim cron
  ([`ebay-delivered-not-unboxed-PLAN.md`](./ebay-delivered-not-unboxed-PLAN.md)).
- House-wide chrome SoT phases in [`chrome-sot-compound-PLAN.md`](./chrome-sot-compound-PLAN.md).
- Committing / pushing — user manages git.

---

## 5. Traps that will cost you a session

- **Re-adding Sources to the sidebar “for discoverability.”** That restores dual
  chrome. Sidebar = Views only.
- **Putting sort back inside Filters.** Violates the quiet trailing-sort law.
- **Restoring `by_carrier` / truck popover** because summary once had it. Client
  types no longer carry it; do not revive API aggregation without a linked
  filter action.
- **Defaulting `WorkbenchChromeHeader` back to `fill` / `px-5 py-2.5`** to “match
  Outbound screenshots.” Hug is the density SoT; Outbound benefits too.
- **Changing `TabSwitch` hug track to `min-w-full` again** while `scrollable` —
  that re-stretches Incoming’s three short tabs and reopens the padding
  misalignment.
- **Confusing GlobalHeader Mode** (Incoming · Arrival · Unbox · …) with
  **Sources** (All · Zoho · eBay) or **Views** (POS · Email). Three altitudes,
  three jobs.
- **Starting a new branch or a second dev server.** Stay on the lane; attach
  `:3050`.

---

## 6. Prompt (paste into a new agent session)

```text
You are continuing Cycle Forge Incoming workbench display work on the current lane.

Read docs/todo/incoming-chrome-display-HANDOFF.md and execute §4.

## Already done — do not redo
- Sources (All / Zoho / eBay) live in IncomingWorkspaceHeader → WorkbenchChromeHeader tabs (?inbound=).
- Sidebar IncomingSidebarPanel is Views only (POS / Email via ?incview=).
- Filters popover = PO date + Attention tiles (incl. DELIVERED_NOT_UNBOXED); sort is trailing QueueSortSwitch.
- Carrier By-carrier / truck breakdown removed.
- WorkbenchChromeHeader defaults tabsFit=hug + p-1.5; TabSwitch hug keeps w-max when scrollable.

## Mission
1. Browser-smoke §4.1 on http://localhost:3050/incoming (attach — never start a dev server).
2. Fix any remaining padding / dual-chrome / param-writer bugs you find — compose SoTs, no page-local twins.
3. npm run verify before claiming done. Do not commit unless asked.

## Hard laws
- One writer per URL param (§2 of the handoff).
- Do not restore by_carrier UI or Sources-in-sidebar.
- Do not raise DS / knip baselines.
```

---

## 7. Done when

- [ ] §4.1 smoke passes on `/incoming`
- [ ] No Sources twin in the sidebar; no By-carrier UI
- [ ] Param writers match §2
- [ ] `npm run verify` green
- [ ] No commit unless the user asked
