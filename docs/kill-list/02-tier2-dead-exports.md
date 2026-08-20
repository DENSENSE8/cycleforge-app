# Tier 2 — dead exports inside live files

**900 dead exports + 1,660 dead types across 1,136 files.** These files are alive; the symbols
in them are not. Raw data: [`tier2-dead-exports.tsv`](tier2-dead-exports.tsv) (`count \t file`,
sorted descending).

## Why this tier matters more than tier 1

Per [`dead-exports-cleanup-HANDOFF.md`](../todo/dead-exports-cleanup-HANDOFF.md): roughly half of
prior deletions in this tier were not merely unused — they were **second copies of something that
already had a home** (`SOURCE_PLATFORM_LABELS`, `ClaimSeverity`, `canTransition`,
`CONDITION_GRADES` declared three times). Two copies drift, and the same fact then reads two ways
on two screens. **You cannot see the duplicates until you go hunting the dead ones.**

That is the same defect class as [`03-frame-twins.md`](03-frame-twins.md), one altitude down.

## Top 15 offenders

| Dead symbols | File | Read |
|---|---|---|
| 78 | `src/design-system/components/grid/index.ts` | **A barrel hiding corpses.** `export *` keeps retired grid pieces "reachable" so nothing reports them. Narrow this first — it will cascade. |
| 16 | `src/components/station/workbench/station-workbench-chrome-config.ts` | Station chrome config with 16 unused knobs. |
| 16 | `src/lib/threads/threads.ts` | |
| 14 | `src/lib/realtime/publish.ts` | |
| 13 | `src/lib/surfaces/registry.ts` | Surface-composition registry — check `SurfaceGate` consumers before cutting. |
| 13 | `src/lib/zoho.ts` | Connector facade; per `AGENTS.md` vendor connectors are capability-faced — dead vendor exports are safe. |
| 12 | `src/lib/receiving/returned-serial-link.ts` | |
| 12 | `src/lib/user-issues/issues.ts` | |
| 11 | `src/lib/settings/accessors.ts` | |
| 11 | `src/design-system/components/monitor/index.ts` | **Second barrel corpse.** Same fix as the grid barrel. |
| 11 | `src/components/station/ReceivingLinesTable.tsx` | Inside the inbound spine — cut carefully. |
| 10 | `src/utils/events.ts` | |
| 10 | `src/lib/interop/gs1-keys.ts` | |
| 10 | `src/lib/warranty/mutations.ts` | |
| 10 | `src/lib/timeline/index.ts` | **Third barrel corpse.** |

## Method

Batch by directory, not by count. For each symbol:

```bash
grep -rnw "<symbol>" src tests scripts docs
```

Zero hits outside its own file → delete. Then `npx tsc --noEmit -p tsconfig.json`.

**Start with the three barrels** (`grid/index.ts`, `monitor/index.ts`, `timeline/index.ts`).
A dead `export *` line keeps a whole retired family reachable — that is precisely how the
pre-flush-square DS shell family (10 files) survived long after `RedesignedMobileShell` replaced
it. Narrowing a barrel makes the next knip run far more honest.

**knip cannot see a fork whose doors are both imported.** Chrome Fields and the table lip both
mounted the same panel, so both read as "used" for months. A dead-code tool answers *"is this
reachable"*, never *"is this the only way in"* — only a guard answers the second. When you finish
a retirement here, either delete the old path or add a shrink-only allowlist guard naming the
surviving call sites (`pattern-evolution.md` law 6).
