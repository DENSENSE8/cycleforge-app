# Kill list — the deletion + porting directory

> **Status:** audit complete, **nothing deleted yet.** Built 2026-08-20 against `main` @ `ceed7f0`.
> **Mode:** audit-first (operator decision). Every entry below carries its evidence; execute in waves.

## The one ruling this directory encodes

**`/unbox` is the source of truth for the whole frame** — left spine rail
(`ContextPanelLayout` + `src/components/sidebar/receiving/*`) **+** middle workspace
(`ReceivingSurfacePage` / `UnboxWorkspaceView`) **+** right-edge inspector
(`RightRailHost` + `usePanelStore`), as ONE system. Every other surface is measured against it.

Everything not on the **inbound spine** (`/unbox`, `/receiving/history`, `/incoming`,
`/carton/[id]`, `/triage`) or the **outbound spine** (`/shipping/orders`, `/shipping`,
`/pack`, `/packer`, `/pickup`) is **PARKED** — not deleted, but frozen until it is ported.
See [`04-parked-surfaces.md`](04-parked-surfaces.md).

## Files in this directory

| File | What it is | Count |
|---|---|---|
| [`01-tier1-provably-dead.md`](01-tier1-provably-dead.md) | Zero-importer files + the `/design-demo` cascade. Safe, mechanical. | **72 files** |
| [`02-tier2-dead-exports.md`](02-tier2-dead-exports.md) | Live files carrying dead symbols. | **900 exports + 1,660 types across 1,136 files** |
| [`03-frame-twins.md`](03-frame-twins.md) | Page-local forks of the Unbox frame — the real porting blocker. | **135 twins** |
| [`04-parked-surfaces.md`](04-parked-surfaces.md) | Routes frozen pending port. Not delete candidates. | **~90 routes** |
| [`05-toship-port-spec.md`](05-toship-port-spec.md) | `/shipping/orders` → Unbox frame. The first port. | 4 gaps (1 disproven) |
| [`06-shadcn-ds-replacement.md`](06-shadcn-ds-replacement.md) | The DS-replacement decision + which house laws it breaks. | 1,677 parked call sites |
| [`07-slot-table-hand-models.md`](07-slot-table-hand-models.md) | Hand column models the slot engine replaces — per-`tableId` **why**, verified 2026-08-30. Desks stay. | **20** tables · 2 Orders bindings → 1 · Ready `tested` track · StationListTable · `TABLE_COLUMNS` |
| `tier1-unused-files.txt` | Raw knip file list (machine-readable). | 65 lines |
| `tier2-dead-exports.tsv` | Raw `count \t file` (machine-readable). | 1,135 lines |

## Method (do not skip)

Per [`dead-exports-cleanup-HANDOFF.md`](../todo/dead-exports-cleanup-HANDOFF.md) §3:
**knip ranks candidates; knip is not the authority.** A word-boundary `grep` over
`src tests scripts` is, and `tsc` is the final word. Never delete on tool output alone.

Baselines only shrink. `npm run knip:baseline` may only record a *smaller* set after real
deletions — never to hide a finding.

## Relationship to the existing plans

This directory **extends**, it does not replace:
- [`docs/todo/slot-based-metadata-table-PLAN.md`](../todo/slot-based-metadata-table-PLAN.md) — slot engine; [`07`](07-slot-table-hand-models.md) is the per-`tableId` kill list (hand column models, not the desks).
- [`docs/partial/DEAD_CODE_CLEANUP_PLAN.md`](../partial/DEAD_CODE_CLEANUP_PLAN.md) — 78% done, Phase 3 knip waves are the living backlog this feeds.
- [`docs/todo/dead-exports-cleanup-HANDOFF.md`](../todo/dead-exports-cleanup-HANDOFF.md) — 15 batches landed; tier 2 here is the next tier.

## Execution order

1. **Wave 1** — `/design-demo` + its 3 exclusive dependents (72 files). Zero product risk.
2. **Wave 2** — tier-1 knip files, grep-verified one by one.
3. **Wave 3** — `/shipping/orders` port ([`05`](05-toship-port-spec.md)). Proves the frame generalizes.
4. **Wave 4** — `/tech` port (operator-chosen next surface).
5. **Wave 5** — tier-2 dead exports, batched by directory.
6. **Wave 6+** — shadcn DS replacement ([`06`](06-shadcn-ds-replacement.md)) — needs a constitution amendment first.

`npm run verify` green is the finish line for every wave.
