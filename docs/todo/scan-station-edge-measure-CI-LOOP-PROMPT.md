# Scan-station edge-to-edge middle measure — continuous-improvement loop

**For:** Claude Code (or any agent) that ports sibling scan stations to the Unbox
golden middle-measure SoT, then shrinks the ratchet baselines.
**Status:** living CI loop — paste the master block, then one adoption phase per
offender until both baselines are `0`.
**Date:** 2026-08-07.
**Golden SoT:** Unbox focused carton — `LineEditPanel` centre content + floating
notes dock both compose `STATION_WORKBENCH_COLUMN` (`w-full min-w-0`); host is
the Flex-Grow Sandwich (`StationScanPaneHost` + `StationDisplaysPushColumn`).
**Guard (enforcer):** `src/components/station/workbench/station-edge-measure.guard.test.ts`
**Census config:** `SCAN_STATION_*` in `station-workbench-chrome-config.ts`

---

## Paste this into a new session (master)

> Read `docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md` (this file) end to
> end before editing. Execute **one adoption phase at a time** (one panel from
> the missing queue). After each phase: shrink the matching baseline(s), extend
> the guard only if the panel list grows, `npm run verify` green. User owns
> commits. Attach to `:3050` — never start, restart, or kill the dev server.
> Never raise DS / edge-measure ratchet baselines.
>
> **Job:** Unbox is the **source of truth** for scan-station middle measure.
> The center column may lock at 720 when Displays is open, but **content inside
> that column is edge-to-edge** (`STATION_WORKBENCH_COLUMN` = `w-full min-w-0`).
> Identity chrome, PO / line work, and the floating notes dock share **one
> measure** — no `max-w-[720px] mx-auto` gutters that re-center a white card
> inside gray. Displays always `flex-1` fills leftover (never `ml-auto` detach).
> Flag every other scan station that still skips the token or keeps a local
> `max-w-[720px]`, port it to compose the SoT, shrink
> `SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE` /
> `SCAN_STATION_LOCAL_720_MAX_BASELINE`.
>
> **Non-goals:** changing the 720 lock math; reintroducing detach gutters /
> host `gap-*` / `justify-between`; forking a page-local twin of
> `STATION_WORKBENCH_COLUMN`; putting station tools on `RightRailHost`; raising
> baselines; commits unless asked.

---

## 0. Grammar (locked — do not re-argue)

| Rule | Detail |
|---|---|
| **Middle lock** | Displays open → center `STATION_CENTER_COLUMN_CLASS` = LOCK **720** (`shrink-0`). Displays closed → `STATION_CENTER_COLUMN_OPEN_CLASS` = `flex-1` + `min-w-[720px]`. |
| **Content measure** | Inside center: `STATION_WORKBENCH_COLUMN` = `w-full min-w-0`. Identity + lines + notes dock compose the **same** token. |
| **Displays** | `StationDisplaysPushColumn` in-flow `min-w-0 flex-1 self-stretch` — always fills leftover. Never `ml-auto shrink-0` detach (gray band). |
| **Host gutters** | `StationScanPaneHost` bans `gap-*`, `justify-between` / `justify-around`, gutter `<div>`, leading spacer. `RIGHT_RAIL_GUTTER_PX = 0`. |
| **Escape** | Genuine non-measure `max-w-[720px]` (icon centering, empty-state glyph) may use same-line / line-above `ds-station-edge-measure-exempt`. Never to keep a centered content column. |
| **Propagation** | Change `workbench-layout.ts` / `StationScanPaneHost` / `StationDisplaysPushColumn` once; stations **compose**. Never copy class strings into a panel. |

```text
WRONG (centered card gutters — debt)
+-- center column (720 or flex-1) ------------------+
|  gray  +-- max-w-[720px] mx-auto --+  gray       |
|  band  | identity / lines / dock   |  band       |
|        +---------------------------+             |
+--------------------------------------------------+

RIGHT (Unbox golden)
+-- center column ---------------------------------+
| +-- STATION_WORKBENCH_COLUMN (w-full min-w-0) -+ |
| | identity / lines / dock — one measure        | |
| +----------------------------------------------+ |
+--------------------------------------------------+
         + Displays flex-1 fills leftover (no gray band)
```

### Golden files (compose — do not fork)

| Role | Path |
|---|---|
| Content measure token | `src/components/station/workbench/workbench-layout.ts` → `STATION_WORKBENCH_COLUMN` |
| Sandwich host | `src/components/station/workbench/StationScanPaneHost.tsx` |
| Displays push shell | `src/components/station/displays/StationDisplaysPushColumn.tsx` |
| Displays stack | `src/components/station/displays/StationDisplaysPushStack.tsx` |
| Unbox golden panel | `src/components/receiving/workspace/LineEditPanel.tsx` |
| Census + baselines | `src/components/station/workbench/station-workbench-chrome-config.ts` |
| Ratchet guard | `src/components/station/workbench/station-edge-measure.guard.test.ts` |
| Frame / dual-rail math | `src/lib/right-rail/frame.ts` · `station-dual-rail.ts` |

### Watched panels (adoption queue)

Defined by `SCAN_STATION_EDGE_MEASURE_PANELS`. Census at prompt authoring:

| Panel | Status |
|---|---|
| `LineEditPanel` (Unbox) | **Golden** — composes token |
| `TriagePanel` (Arrival) | Composes token |
| `TestingPanel` | Composes token |
| `ActiveOrderWorkspace` (Shipping) | **Missing** — port |
| `PackOrderPanel` | **Missing** — port |
| `PackerReviewMode` | **Missing** — port (+ local `max-w-[720px]` debt) |
| `LabelsOrderWorkspace` | **Missing** — port |

Baselines (shrink-only):

- `SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE` — panels that do not include
  `STATION_WORKBENCH_COLUMN` (start **4**).
- `SCAN_STATION_LOCAL_720_MAX_BASELINE` — non-escaped `max-w-[720px]` hits in
  those panels (start **1**).

### Laws to read first

- `AGENTS.md` → Frame width budget
- `.claude/rules/source-of-truth.md` → **Frame column budget** · Depth elevation
- `.claude/rules/display/station-workbench.md` (center edge-to-edge + sandwich)
- `.claude/rules/pattern-evolution.md` (compose → grow SoT → never fork twin)
- `.claude/rules/verify.md` (never raise ratchets)

---

## Phase 0 — Confirm SoT + print the queue (no product UI)

**Paste:**

> Execute **Phase 0** only from
> `docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`.

**Do:**

1. Read golden files in §0. Confirm `STATION_WORKBENCH_COLUMN === 'w-full min-w-0'`.
2. Run:
   ```bash
   node --test --import tsx \
     src/components/station/workbench/station-edge-measure.guard.test.ts
   ```
3. From the guard / config, list the current **missing** panels and any
   `max-w-[720px]` offenders (file:line).
4. Do **not** edit product UI. Report the queue ordered: Shipping → Pack →
   Packer review → Labels (or whatever the guard prints).

**Done when:** queue listed; guard green (or only known baseline debt).

---

## Phase N — Port one missing panel (repeat until baselines = 0)

**Paste (example — Shipping):**

> Execute **one** adoption phase from
> `docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`: port
> `components/tech/ActiveOrderWorkspace.tsx` to
> `STATION_WORKBENCH_COLUMN`. Shrink
> `SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE` by 1. Do not touch other panels.

**Do (for the chosen panel):**

1. Diff against Unbox `LineEditPanel` — find identity / body / floating dock
   wrappers that use `max-w-[720px]`, `mx-auto`, or a forked `max-w-*` column.
2. Import and compose `STATION_WORKBENCH_COLUMN` from
   `@/components/station/workbench/workbench-layout` (or an existing header /
   body helper that already embeds it — prefer the named helper over
   re-stringing).
3. Ensure the **notes / terminal dock** uses the **same** measure as identity
   (Unbox: both compose the token). Drop dock-local `maxWidth: 720` /
   `max-w-[720px]` unless escaped for a non-measure reason.
4. Do **not** change sandwich host / Displays flex-1 / 720 lock unless a host
   bug is proven.
5. Shrink baselines in `station-workbench-chrome-config.ts` to match the new
   census (missing count and/or local-720 count). **Never raise.**
6. Run the edge-measure guard, then `npm run verify`.

**Per-panel traps:**

| Panel | Watch for |
|---|---|
| `ActiveOrderWorkspace` | Shipping identity + dock max-width twins |
| `PackOrderPanel` | Pack column / composer max-w |
| `PackerReviewMode` | Terminal `maxWidth` VM / style props — migrate or escape with `ds-station-edge-measure-exempt` only if not a content measure |
| `LabelsOrderWorkspace` | Labels flush panel pad vs re-centered column |

**Done when:** that panel contains `STATION_WORKBENCH_COLUMN`; baselines match
census; `npm run verify` green.

---

## Phase Z — Zero debt + SoT hygiene

**Paste:**

> Execute **Phase Z** from
> `docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md` only when both
> baselines are already `0` or you just finished the last panel.

**Do:**

1. Assert `SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE === 0` and
   `SCAN_STATION_LOCAL_720_MAX_BASELINE === 0`.
2. Grep scan-station panels for `max-w-[720px]` / `mx-auto` content columns —
   only escaped non-measure hits remain.
3. Confirm SoT prose still names `StationDisplaysPushColumn` (not retired
   `UnboxPushColumn` re-exports) in Frame column budget + station-workbench.
4. `npm run verify` green. User owns commit.

---

## Continuous-improvement loop (how this stays alive)

```text
  ┌─ Unbox golden (SoT) ──────────────────────────────┐
  │ STATION_WORKBENCH_COLUMN + sandwich host          │
  └───────────────────────┬───────────────────────────┘
                          │
                          ▼
  ┌─ Guard (every CI / verify) ───────────────────────┐
  │ • token shape never grows gutters                 │
  │ • missing-composition count ≤ baseline (shrink)   │
  │ • local max-w-[720px] count ≤ baseline (shrink)   │
  │ • host bans gap / justify-between / ml-auto       │
  └───────────────────────┬───────────────────────────┘
                          │ fail = regression or new station debt
                          ▼
  ┌─ Agent loop (this prompt) ────────────────────────┐
  │ Phase 0 → queue → Phase N per panel → Phase Z     │
  │ shrink baselines; never raise                     │
  └───────────────────────────────────────────────────┘
```

When you add a **new** scan-station panel:

1. Add its path to `SCAN_STATION_EDGE_MEASURE_PANELS`.
2. Either ship it composing `STATION_WORKBENCH_COLUMN` on day one, **or**
   temporarily allow +1 on `SCAN_STATION_EDGE_MEASURE_MISSING_BASELINE` only
   with an explicit follow-up Phase N in the same PR series — prefer day-one
   compose.
3. Never add a page-local `max-w-[720px] mx-auto` content column.

---

## Verify

```bash
node --test --import tsx \
  src/components/station/workbench/station-edge-measure.guard.test.ts
npm run verify
```

Full `npm run verify` is the definition of done (lint · typecheck · unit · knip ·
route-auth · schema). Never raise ratchet baselines to pass.
