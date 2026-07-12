# Monitor rollup blocks — compose, or grow the registry

> Inherits: [../ui-design-system.md](../ui-design-system.md) (Kinetic Ledger, density `rollup`), [monitor-and-canvas.md](monitor-and-canvas.md).  
> Code SoT: `src/design-system/components/monitor/`.  
> Golden page: `src/features/operations/workspace/OperationsAnalyticsView.tsx`.  
> Root law: **Pattern evolution** + **Kinetic Ledger** in `AGENTS.md` (compose → grow SoT → compose again).

**Recipe registry for observe/rollup density** — not the only way every surface looks, and not a layout religion
for Workbench/Station. Agents building **Monitor rollup** regions **compose these blocks**.  
**Inventing a page-local** `SectionCard`, KPI grid, or card shell is a bug.  
**Improving the registry primitive** when it is wrong or fights a stronger sibling is the intended upgrade path — not a freeze.

---

## When this doc applies

Region is **Monitor** (`pickArchetype` → observe-only, no durable selection, filters only).  
Examples: Operations live/analytics/history, `/dashboard` KPI strip region, reports rollups.

If the user picks a record and edits it → **Workbench** (not this doc).  
If the input is a scanner → **Station**.

---

## Always / Ask first / Never (Monitor)

### Always

- Build Monitor surfaces from `@/design-system/components/monitor` (+ documented chart siblings under features when the registry points there).
- Match the golden page’s *composition recipe*, not every historical pixel forever.
- When a gauge/tile/shell is inconsistent with a stronger house sibling (e.g. open-bottom half-gauge vs full ring for the same KPI job), **unify via the SoT** — especially single-consumer primitives (`MetricRing` only used by `MetricTile`, etc.).
- Add a *named* registry block when 2+ surfaces need the same new composition.

### Ask first

- Public API changes to a monitor block used by multiple pages.
- Introducing a second KPI / card visual language without merging or deleting the old one.
- Cross-cutting theme or chart-token renames that touch many dashboards.

### Never

- Hand-roll a page-local card shell / KPI grid that duplicates `SectionCard` / `KpiStrip`.
- Nest `SectionCard`s as list rows.
- Forever reskin around a shape mismatch when growing the registry is free.
- Leave two gauge shapes for the same job after a visual polish pass.

---

## Page composition (default recipe)

```tsx
import {
  MonitorPageShell,
  FilterBand,
  KpiStrip,
  SectionCard,
  MonitorListBlock,
  MonitorListRow,
  DeltaChip,
} from '@/design-system/components/monitor';

export function MyMonitorView() {
  return (
    <MonitorPageShell stagger>
      <FilterBand leading={<>…title…</>}>
        {/* range / segment controls that write URL params */}
      </FilterBand>

      <KpiStrip stagger items={[/* KpiTile props */]} />

      <SectionCard stagger htmlId="my-section" icon={…} eyebrow="…" title="…">
        {/* chart, table, or MonitorListBlock — not nested SectionCards as rows */}
      </SectionCard>

      {/* Named rollup zone: responsive CSS grid of SectionCards is allowed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard … />
        <SectionCard … />
        <SectionCard … />
      </div>
    </MonitorPageShell>
  );
}
```

Target: **shell + FilterBand + optional KpiStrip + 1–4 SectionCards**. Not a 15-section kitchen sink.

---

## Block registry

| Block | Path | Role |
|---|---|---|
| `MonitorPageShell` | `monitor/MonitorPageShell.tsx` | Full-height scroll shell + max-width column; optional first-load stagger |
| `FilterBand` | `monitor/FilterBand.tsx` | Ephemeral filter row; **URL params only** |
| `KpiStrip` | `monitor/KpiStrip.tsx` | **2×2 → 4-col** responsive grid of tiles |
| `KpiTile` | `monitor/KpiTile.tsx` | Eyebrow → hero number → delta |
| `SectionCard` | `monitor/SectionCard.tsx` | Eyebrow + icon + title + optional headline/meta + body |
| `MonitorListBlock` / `MonitorListRow` | `monitor/MonitorListBlock.tsx` | `divide-y` leaderboard / recent activity |
| `DeltaChip` | `monitor/DeltaChip.tsx` | Signed % with invert-for-“lower is better” |
| Shell classes | `monitor/shell.ts` | `MONITOR_SECTION_CARD_*` — theme tokens only |

### Card shell token

```txt
rounded-2xl border border-border-soft bg-surface-card shadow-sm
```

Constants: `MONITOR_SECTION_CARD_CLASS` / `MONITOR_SECTION_CARD_PADDED` / `MONITOR_KPI_TILE_CLASS`.

### KPI tile anatomy

1. **Eyebrow label** — `text-eyebrow font-black uppercase tracking-widest text-text-soft`
2. **Hero number** — `text-3xl font-black tabular-nums`
3. **Delta chip** — `DeltaChip` (theme `text-text-success` / `text-text-danger`)

### List rows inside cards

House **one-row anatomy** (title → meta → trailing). Use `MonitorListRow` or plain `divide-y` rows.  
**Never** nest `SectionCard`s as list rows.

---

## Layout rules (named rollup zones)

| Zone | Layout |
|---|---|
| Page body | Vertical `space-y-6` inside shell |
| `KpiStrip` | `grid grid-cols-2 gap-3 lg:grid-cols-4` |
| Tri-panel / multi-card zone | `grid grid-cols-1 gap-6 lg:grid-cols-3` (or 2) |
| Rows inside a card | `divide-y` linear — **not** nested cards-as-rows |

**Named rollup zones** may use CSS grid. Elsewhere, Kinetic Ledger still bans **random card soup** and nested
`SectionCard`s as list rows — boards and Studio canvas are valid non-Monitor primaries when data shape requires them.

---

## Filters & state

- Filters live in **URL** (`?mode= ?range= ?q= ?station= ?section= ?ostatus=`).
- No durable `?selectedId=` on a pure Monitor (that is Workbench).
- Filter keystrokes **re-render in place** — do not remount `MonitorPageShell` or crossfade the stream.

---

## Motion

- **First load only:** `MonitorPageShell stagger` + child `stagger` on `SectionCard` / `KpiStrip`.
- Presets: `framerVariants.monitorStaggerContainer` / `monitorStaggerItem` in `motion-framer.ts`.
- **Never** stagger or crossfade on every filter keystroke.
- Prefer routing presence through `useMotionPresence` / `useMotionTransition` when using AnimatePresence elsewhere so `prefers-reduced-motion` collapses motion.

---

## Theme / dark dashboards

- Surfaces: `bg-surface-canvas`, `bg-surface-card`, `border-border-soft`, `text-text-*`, functional `text-text-success|warning|danger|info|fulfillment`.
- Dark mode is **`data-theme`** + `src/design-system/themes/dark.ts` (and other palettes).  
- **No page-local hex** for Monitor chrome. Chart series colors may use the chart-theme SoT (`charts/chart-theme.ts`) when needed for series identity.

---

## Data & empty states

- Org-scoped queries only — never cross-tenant KPI rollups.
- Permission-gated sub-data → locked/empty placeholder, not page 500.
- Teaching empty / dashed error boxes per `ui-design-system.md`.

---

## Anti-patterns

| Don't | Do |
|---|---|
| Local `function SectionCard` | Import design-system `SectionCard` |
| Nested cards as table rows | `MonitorListRow` / `divide-y` |
| Workbench CRUD table as default live Monitor body | Link out to `/dashboard` or a Workbench region |
| Hardcoded `text-emerald-600` for deltas | `DeltaChip` / `text-text-success` |
| `useState` for range/filter SoT | URL search params |
| Crossfade list on filter typing | In-place re-render |
| 12+ custom sections on first paint | Curate: goal/KPI + attention + one feed |
| Two gauge shapes for the same KPI job (half vs full ring) | Unify the design-system primitive to the stronger house shape |
| Conservative reskin only because “compose, don’t invent” | Grow `MetricRing` / tile / shell SoT, then recompose |

---

## Multi-region pages

`/dashboard` is **Workbench** (orders collection + optional context) with a **Monitor rollup region** (`OutboundKpiStrip`).  
Each region keeps its archetype. The KPI strip may use `KpiStrip`/`KpiTile`; it must not grow durable selection (filter params only).
