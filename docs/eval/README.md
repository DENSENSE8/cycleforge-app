# Station + cohort eval ledger

Introspective eval — machine gates, design critique, and graph impact written
back into committed docs so the next agent session compounds.

**Fable 5.1 gap report** (measured architecture, P0–P2 gaps, goal object,
typed asks, session receipts, Host sequence, build order):
[`FABLE-5.1-GAP-REPORT.md`](FABLE-5.1-GAP-REPORT.md).

**Fable / new-model research brief** (oracles, vague-prompt router, KEEP vs
DELETE, refuse list): [`FABLE-5.1-SYSTEM.md`](FABLE-5.1-SYSTEM.md).

**Fable 5 research prompt** (gaps, autonomous Host, session receipts, yes/no
queue): [`FABLE-5-RESEARCH-PROMPT.md`](FABLE-5-RESEARCH-PROMPT.md). Copy the
block under “PASTE THIS INTO FABLE 5” into a new session.

**2026 UI/UX contracts** (Manus / Lovable / Cursor / Stripe / Kiro as *quality*,
not chrome to copy; heavy no-fork mounts for hover, `motionRole`, one icon
button): [`UI-UX-2026-CONTRACTS.md`](UI-UX-2026-CONTRACTS.md).

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

FABLE-5.1-SYSTEM.md            ← research brief for new models
FABLE-5-RESEARCH-PROMPT.md     ← paste-ready Fable 5 prompt
UI-UX-2026-CONTRACTS.md        ← 2026 AI-app bar + no-fork interaction pins

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

## Incoming add extract mouth

Incoming’s paste/screenshot composer is **`StationComposerHost`**, the Unbox
mouth — a desk adapter, not a floor overlay workspace. `verify:fast` /
machine-gate only proves lint+type+unit. After edits to
`IncomingAddExtractComposer` (or the triage footer that measures it), run:

```bash
pnpm run eval:station scan-out -- --skip-verify
pnpm run eval:station scan-out
```

That station’s `critiqueExtra` + `incoming-add-composer-mouth.test.ts` are the
mouth eval. Do **not** append Incoming to `SCAN_STATION_OVERLAY_COHORT` (that
would demand idle `visibility` / `zIndex.panel` on a desk walk).

## Slot-table cohort

**SoT:** engine (`CompoundItem`, `useSlotTableLayout`, `materializeTracks`,
`DataTableFilterMenu`) + every peer in `PRODUCT_TABLES` — see
[`src/lib/tables/slot-table-cohort.ts`](../../src/lib/tables/slot-table-cohort.ts).

The filter icon always mounts beside search (`DATA_TABLE_FILTER_IDLE` when a
family has no facets). Unbox Queue/Viewed/History share `?ukpi=` via
`useReceivingTableChrome`. Do not fold page tabs into the funnel.

Every painted DATA column header is click-to-sort
(`SLOT_TABLE_PAINT_LAW.headerSort`). Chrome only: `select`, `actions`/`action`,
`_fill`. The toolbar sort menu lists the same facts (`queueColumnSortOptions`)
plus View / Platform / Carriers — Pick is a Columns row, not trigger-only.
Graph KEEP: `engine:slot-table-header-sort`,
`engine:queueSortForColumnKey`, `engine:LedgerGridColumnHeader`.

**Hard gate:** `eval:cohort slot-table` `ok` is false if the tripwire fails, any
`SLOT_TABLE_ENGINE_CONTRACT` grep fails, or any `graphSymbols` `find` returns no
match (rebuild the Garisek index). Verify fail also fails unless `--skip-verify`.

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
`--max-rounds` (48), `--max-no-progress` (3 — consecutive rounds whose attacked
gap did not shrink; state `reason: "no-progress"`). Every round writes one
`cf-session:v1` receipt through Garisek `scripts/session-receipt.ts`
(`session_id` `perf:<run>:<round>`, joined by `LOOP_RUN_ID`). Does **not**
lower floors or strip desk density.

## Goal runner (Host = Garisek-OS)

Gap report §D1–D7. A human commits `docs/eval/goals/<id>.goal.json`
(`createdBy: "human"`, zod `.strict()` in `src/lib/eval/goal.ts`); the Host
loads it from `HEAD` only — a worktree-only or dirty goal file refuses to start.

```bash
# from Garisek-OS
npx tsx scripts/goal-run.ts --goal data-headers-sortable --dry --no-db   # hop 0: measure only
npx tsx scripts/goal-run.ts --goal data-headers-sortable                 # Host loop: coder → measure → decide
```

Hop 0 runs every success predicate (`eval` scripts expanded to their node
body — `pnpm run` is not on the path, see `resolveEvalCommand`; `test`,
`invariant` KEEP ids, `router` refuse patterns on the diff). Decision
(`nextHopDecision`, pure): all green + empty diff → **"goal already met,
nothing to land"** (exit 0); green + diff → ask `land.apply`; red → coder hop
(Hermes profile, `HERMES_CODER_BIN`) in `.claude/worktrees/goal-<run>`;
timeout / runner infra (`isRunnerInfraFailure`) → **unmeasured**, ask
`oracle.unavailable`, never repair. Stop conditions come from the goal
(`maxHops`, `maxHours`, `maxNoProgressHops`; progress = fewer red predicates
than the previous hop) and end in a `goal.stop` ask. Eval churn under
`docs/eval/**` is excluded from the diff.

Typed asks (`loop_run_blocks.kind`, migration 060, `approve` / `reject` only)
reach the phone as a Buzz card and are answered in the Garisek cockpit
(`POST /api/loops/runs/<runId>/answer`). One open ask per run. Every hop
leaves a `cf-session:v1` receipt (`docs/eval/sessions/<month>.jsonl` mirror +
`loop_run_steps`).

Host helpers (`tools/eval-ledger/goal-cli.mjs`): `parse`, `classify`,
`resolve-eval`, `next-hop`, `classify-output`, `detect-hop-asks`,
`decide-find`, `keep`.

Asks the loop can raise: `land.apply`, `goal.stop`, `oracle.unavailable`,
`pin.promote` (yes → the Host writes the pin), `known_debt.append` (default
no → hop reverted), `cohort.append_row` and `grep.retire` (no → the file is
reverted and re-measured). Answer from the cockpit or the terminal:
`npx tsx scripts/loop-answer.ts --run <id> --decision approve|reject`
(Garisek). `--list` shows every waiting ask.

Goals on file: `data-headers-sortable` (slot-table), `slot-action-overlay-labels`,
`perf-tier1-95` (the Host-run form of perf-overnight: `eval:perf-gate --mode=strict`).

Interactive sessions leave the same receipt shape: the Claude Code `Stop`
hook and Cursor `stop` run `tools/eval-ledger/session-receipt-stop.mjs`
(`run_id: null`, keyed `claude-code:<sid>` / `cursor:<id>`, deduped per session).
Every receipt with a `run_id` is also one Langfuse trace (`cf-session`) in the
run's session, beside the coder generations. The Garisek cockpit's Sessions tab
(`/system?tab=sessions`) lists a session's receipts under its row
(`GET /api/sessions/receipts`). A goal born from a Linear issue runs with
`--issue <id> --composio-user <id>`: asks are mirrored as comments and
`agent:accept` / `agent:iterate` answer `land.apply`.

### Gates the runner leans on (Cursor + Claude Code hooks)

| Hook | Law |
|------|-----|
| `pretool-engine-graph.sh` | Write to a router `engineFiles` path needs a fresh `find_symbol` / `impact_analysis` / `search_code` stamp; `cg.mjs stamp` alone is denied |
| `pretool-ui-design-mcp.sh` + `CYCLEFORGE_STAMP_STRICT=1` (or `.cursor/stamp-strict`) | design stamp must come from a `ds_*` call; session-start no longer pre-seeds |
| `pretool-ledger-guard.sh` / `.claude/settings.json` | agents cannot write `docs/eval/**/LEDGER.md`, `docs/eval/goals/**`, `docs/eval/sessions/**` |

`bash tools/eval-ledger/pretool-hooks.test.sh` replays every case.
```

MLX env: `CYCLEFORGE_MLX_BASE` (OpenAI `/v1`) — **grader of the repair brief
only**, never the Host checker. Probe order also tries `100.96.113.23:8081`,
`prometheus:8080`, `:8080`. Dry fixture: `CYCLEFORGE_EVAL_STOP=dry` or
`machine-gate --dry-fail`. No Ollama fallback — unreachable Mac fails clearly.
