# Station + cohort eval ledger

Introspective eval — machine gates, design critique, and graph impact written
back into committed docs so the next agent session compounds.

Two **sibling** cohorts under one CLI (`pnpm run eval:cohort <name>`).
**Display SoT is slot-table only.** Overlay is not a display cohort.

Repo-wide **mobile-first** product law (not a display cohort yet):
[`docs/mobile-first/SURFACE_LAW.md`](../mobile-first/SURFACE_LAW.md) — every
operator verb must be doable on `/m/*` first. Checklist:
`src/lib/mobile/mobile-first-surface.ts`. Future: `eval:cohort mobile-first`.
User: "span repo-wide" / "do everything on the mobile app first."

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
├── run-cohort-eval.mjs        ← slot-table | shortcuts
├── machine-gate.mjs           ← Host checker (Cursor stop + Hermes LOOP_VERIFY)
├── perf-target.mjs            ← Lighthouse / Speed Insights north star 95
├── perf-gate.mjs              ← baseline gap debt (+ optional live check)
├── stop-eval-gate.test.sh     ← synthetic stdin for Cursor stop hook
└── mlx-eval-chat.mjs          ← Mac MLX Qwen 27B smoke (no tree writes)
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

## Cursor `stop` eval gate

Silent checker: [`.cursor/hooks/stop-eval-gate.sh`](../../.cursor/hooks/stop-eval-gate.sh)
→ shared Host CLI [`tools/eval-ledger/machine-gate.mjs`](../../tools/eval-ledger/machine-gate.mjs)
(wired in `.cursor/hooks.json`, `timeout: 300`, `loop_limit: 1`).

**Hermes twin (forever, no per-issue wire):** for `cycleforge-app`,
`hermes-dispatch` / `hermes-land` default `LOOP_VERIFY_COMMAND` to
`node tools/eval-ledger/machine-gate.mjs` (`defaultVerifyCommandForRepo` in
Garisek `verify-gate.ts`). Local Hermes coder is the maker-on-fail; repair
prompt carries the same display law as the Cursor follow-up. Override only via
`LOOP_VERIFY_COMMAND` if needed.

**Perf north star (Lighthouse / Speed Insights ≥ 95):**
`tools/eval-ledger/perf-target.mjs` + `perf-gate.mjs`. Every machine-gate pass
runs `--mode=debt` (cheap baseline gap → `.cursor/perf-session.json`). Live
Chrome audit only when `LOOP_PERF=check` or `MACHINE_GATE_PERF=check` with
`LH_BASE_URL` set. `LOOP_PERF=strict` fails until Tier-1 floors meet 95.
Cursor stop never runs full Lighthouse by default.

| Result | Hook stdout / Hermes |
|--------|----------------------|
| Pass / skip | Cursor `{}` — **silence**; Hermes stop hop |
| Machine red, `loop_count` 0 | Cursor one `followup_message`; Hermes `buildRepairPrompt` + coder again |
| Verify hung / timed out | Cursor `{}` fail-open; Hermes unmeasured (not a pass) |

Skips (Cursor only): `status !== completed`, `loop_count >= 1`, clean tree (no
dirty under `src/` / `tools/eval-ledger/` / tables / overlay cohort / the stop
hook), or kill switch `CYCLEFORGE_EVAL_STOP=0`. Fail-open on parse / crash /
**timeout**. Subprocess budget defaults to 280s
(`CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC`). Paint / Operator verdict is **not** a
resume reason.

```bash
pnpm run eval:machine-gate          # Host checker (+ perf debt stamp)
pnpm run eval:perf-target           # print 95 north star + baseline gaps
pnpm run eval:perf-gate             # debt (default) | --mode=strict | --mode=check
pnpm run eval:machine-gate -- --dry-fail
pnpm run eval:stop-gate-test        # synthetic Cursor stdin (no MLX, no verify)
pnpm run eval:mlx-smoke             # Mac MLX Qwen 27B: ping + contract + dry-hook pipe
# Live Tier-1 ratchet (needs prod build + LH_BASE_URL + cookie):
pnpm run lighthouse:check

### Overnight local-model grind → 95

Host loop (not Cursor stop): local Hermes coder keeps attacking the worst
Tier-1 gap until floors meet 95 or the wall-clock cap. State:
`.cursor/perf-overnight-state.json`, log `.cursor/perf-overnight.log`.

```bash
# Terminal A — prod build on :3100
NEXT_DIST_DIR=.next-perf pnpm build
AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100

# Terminal B — overnight (Hermes coder + measure + ratchet)
export LH_BASE_URL=http://127.0.0.1:3100
export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
pnpm run eval:perf-overnight -- --dry-run          # preview next gap + prompt
pnpm run perf:overnight                            # nohup-friendly launcher
# or: nohup pnpm run eval:perf-overnight -- --max-hours 12 >> .cursor/perf-overnight.log 2>&1 &
```

Resume after a stop: same command; it re-reads baseline gaps. Win exit 0 when
`perf-gate` Tier-1 debt is empty. Caps: `--max-hours` (default 12),
`--max-rounds` (48). Does **not** lower floors or strip desk density.
```

MLX env: `CYCLEFORGE_MLX_BASE` (OpenAI `/v1`) — **grader of the repair brief
only**, never the Host checker. Probe order also tries `100.96.113.23:8081`,
`prometheus:8080`, `:8080`. Dry fixture: `CYCLEFORGE_EVAL_STOP=dry` or
`machine-gate --dry-fail`. No Ollama fallback — unreachable Mac fails clearly.
