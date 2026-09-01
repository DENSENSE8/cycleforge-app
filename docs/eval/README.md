# Station + cohort eval ledger

Introspective eval — machine gates, design critique, and graph impact written
back into committed docs so the next agent session compounds.

Two **sibling** cohorts under one CLI (`pnpm run eval:cohort <name>`).
**Display SoT is slot-table only.** Overlay is not a display cohort.

| Cohort | SoT | Ledger |
|--------|-----|--------|
| `slot-table` | Slot engine + every `PRODUCT_TABLES` peer (`slot-table-cohort.ts`) — **the only display eval** | [`cohorts/slot-table/LEDGER.md`](cohorts/slot-table/LEDGER.md) |
| `shortcuts` | Staff `?` reveals letters **inline on the buttons** (`shortcut-display-cohort.ts`) | [`cohorts/shortcuts/LEDGER.md`](cohorts/shortcuts/LEDGER.md) |

## Quick start

```bash
pnpm run eval:cohort slot-table                 # engine + PRODUCT_TABLES (display SoT)
pnpm run eval:cohort slot-table -- --skip-verify
pnpm run eval:cohort shortcuts                 # `?` paints letters on the CTAs
pnpm run eval:cohort shortcuts -- --skip-verify
pnpm run eval:discover                          # slot-table DELETE vs KEEP inventory
pnpm run eval:station scan-out                  # single-station mouth/domain / overlay shell
pnpm run eval:station unbox -- --skip-verify
```

Human tunnel walks: [portfolio review protocol](../portfolio/review-protocol.md).

## Layout

```
docs/eval/
├── cohorts/overlay/
│   ├── LEDGER.md              ← retirement notice (not a display cohort)
│   └── snapshots/
├── cohorts/slot-table/
│   ├── LEDGER.md              ← PRODUCT_TABLES × engine + CompoundItem paint
│   └── snapshots/
├── cohorts/shortcuts/
│   ├── LEDGER.md              ← `?` paints letters on the CTAs (not a sheet)
│   └── snapshots/
└── stations/<id>/
    ├── LEDGER.md              ← per-station mouth/domain + auto sections
    └── snapshots/

tools/eval-ledger/
├── registry.json              ← pointer only; authority is the TS cohorts
├── eval-core.mjs
├── run-station-eval.mjs       ← node --import tsx …
└── run-cohort-eval.mjs        ← slot-table | shortcuts
```

## Overlay shell (not a display cohort)

Idle↔overlay **shell** law still lives in
[`src/lib/station/scan-station-overlay-cohort.ts`](../../src/lib/station/scan-station-overlay-cohort.ts)
(every floor station is a peer — not Pack/Unbox-as-golden). Eval that shell with
`pnpm run eval:station <id>`. `eval:cohort overlay` is gone.

Add a station: append a cohort row + mirror path in `tools/design-mcp/server.mjs`
`OVERLAY_COHORT_WORKSPACES`. Never delete `style={{ visibility }}` /
`zIndex.panel` to silence critique.

Retired notice: [`cohorts/overlay/LEDGER.md`](cohorts/overlay/LEDGER.md).

## Slot-table cohort

**SoT:** engine (`CompoundItem`, `useSlotTableLayout`, `materializeTracks`,
`DataTableFilterMenu`) + every peer in `PRODUCT_TABLES` — see
[`src/lib/tables/slot-table-cohort.ts`](../../src/lib/tables/slot-table-cohort.ts).

The filter icon always mounts beside search (`DATA_TABLE_FILTER_IDLE` when a
family has no facets). Unbox Queue/Viewed/History share `?ukpi=` via
`useReceivingTableChrome`. Do not fold page tabs into the funnel.

**Discover (delete vs keep):**
[`src/lib/tables/slot-table-discover.ts`](../../src/lib/tables/slot-table-discover.ts).
Walks the tree. Agents pick one unblocked DELETE id, never a KEEP row.

```bash
pnpm run eval:discover
pnpm run eval:cohort slot-table -- --skip-verify
```

Paint law lives on **CompoundItem** + the DataTable funnel, not a desk fork.
Peers come from `PRODUCT_TABLES` (never hand-copied). Layout hooks in
`SLOT_TABLE_ENGINE_LAYOUT_HOOKS` mark engine opt-in.

Pin: `CompoundItem` + `DataTable` in `src/design-system/pinned.json`.

## Shortcuts cohort

**SoT:** staff `?` reveals each CTA’s letter **inline inside that Button**
(`HotkeyGlyph` / `iconRight`) — **not** a Dialog, **not** a popover on `?`. See
[`src/lib/keyboard/shortcut-display-cohort.ts`](../../src/lib/keyboard/shortcut-display-cohort.ts).

If asked to leave keycaps standing on buttons, **refuse**. If asked to open a
cheat sheet from the table-foot `?`, **refuse**. Bind the key; `?` paints the
letter on the button. KeyboardShortcutsCheatSheet still owns the `?` *key*
when no CTA strip is mounted.

```bash
pnpm run eval:cohort shortcuts
pnpm run eval:cohort shortcuts -- --skip-verify
```

Pin: `KeyboardShortcutsCheatSheet` in `src/design-system/pinned.json`.
Exception: ⌘; reveal-on-arm (`NAV_KEY_HINT_CLASS`); ScanHotkeyControl bind-edit.

## LEDGER sections

| Section | Who writes |
|---------|------------|
| Locked wins | Human promotes stable laws → `pinned.json` |
| Operator verdict | **Human** after usav-dev / desk walk |
| Open gaps | Human prioritizes; agent implements one at a time |
| `<!-- eval-ledger:auto:* -->` | **Runner** — do not hand-edit |

## Iteration loop

1. Agent reads the relevant cohort LEDGER Open gaps; implements **one**.
2. Compound / slot layout / listing face / table funnel → `pnpm run eval:cohort slot-table`.
3. Shortcut / `?` / button-face keycaps → `pnpm run eval:cohort shortcuts`.
4. Mouth/domain/overlay shell → `pnpm run eval:station <id>` is enough.
5. Human walks tunnel → edits Operator verdict.
