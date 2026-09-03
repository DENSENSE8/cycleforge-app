# Cycle Forge autonomy gap report

**Author:** Fable 5.1 research pass, 2026-09-01 (UTC 2026-09-02).
**Scope:** what is missing before a Cycle Forge agent can run unattended against a high-level goal, with the operator answering only typed yes/no asks, and every session leaving an exact receipt.
**Authority:** the TypeScript cohorts, the runners, and the Garisek loop code. Where [`FABLE-5.1-SYSTEM.md`](FABLE-5.1-SYSTEM.md) disagreed with a file, the file is quoted and wins.
**Implementation in this pass:** none. Every recommendation names files, schemas, and the existing function it extends.

---

## Files opened

cycleforge-app (`/home/michaelgarisek/Projects/cycleforge-app`):

- `docs/eval/FABLE-5.1-SYSTEM.md`, `docs/eval/FABLE-5-RESEARCH-PROMPT.md`, `docs/eval/README.md`
- `docs/eval/cohorts/slot-table/LEDGER.md`, `docs/eval/cohorts/shortcuts/LEDGER.md`, `docs/eval/cohorts/overlay/LEDGER.md`, `docs/eval/stations/scan-out/LEDGER.md`
- `docs/eval/cohorts/machine-gate/snapshots/2026-09-01-eval-session.json`, `docs/eval/cohorts/slot-table/snapshots/2026-09-02-{discover.json,tripwire.log,find-isSlotTableChromeTrack.json,graph-stats.json}`, `docs/eval/cohorts/shortcuts/snapshots/2026-09-02-tripwire.log`
- `src/lib/tables/slot-table-cohort.ts` (+ `.test.ts`), `src/lib/tables/slot-table-discover.ts` (+ `.test.ts`), `src/lib/keyboard/shortcut-display-cohort.ts` (+ `.test.ts`), `src/lib/station/scan-station-overlay-cohort.ts` (+ `.test.ts`)
- `src/lib/tables/slot-table-header-sort.ts`, `src/utils/queue-display-sort.ts` (exports), `src/design-system/components/grid/LedgerGridColumnHeader.tsx` (sort seam), `src/components/tables/TableStatusBar.tsx` (grep), `src/design-system/primitives/KeyboardKey.tsx` (grep)
- `tools/eval-ledger/{eval-core,run-cohort-eval,run-station-eval,run-slot-table-discover,load-cohort,machine-gate,perf-overnight}.mjs`, `tools/eval-ledger/registry.json`, `tools/eval-ledger/stop-eval-gate.test.sh`, `tools/eval-ledger/perf-target.mjs` (repair law)
- `tools/design-mcp/server.mjs` (structure, `readOverrides`, `score`, `recommendVariant`, `OVERLAY_COHORT_WORKSPACES`, the three tool handlers), `tools/design-mcp/ds.mjs`, `src/design-system/pinned.json`
- `.cursor/hooks.json`, `.cursor/hooks/{pretool-ui-design-mcp,stop-eval-gate,after-mcp-design-stamp,after-mcp-code-graph-stamp,session-start-design-mcp,session-start-garisek-engineering}.sh`, `.cursor/mcp.json`, `.mcp.json` (symlink)
- `.cursor/{design-mcp-session,code-graph-session,eval-session,eval-session.snapshot,perf-session,perf-overnight-state}.json`
- `.cursor/skills/{design-mcp,code-graph,eval-engineering}/SKILL.md`, `.cursor/rules/eval-engineering.mdc`, `AGENTS.md`, `CLAUDE.md`
- `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json` (hooks block)
- `scripts/verify.mjs`, `scripts/verify-profile.mjs`, `scripts/run-unit-tests.mjs`, `package.json` (scripts), `.gitignore` (`.cursor/*` block)
- `docs/warehouse-os/LAWS.md` (X1..X4), `docs/kill-list/07-slot-table-hand-models.md` (head)

Garisek-OS (`/home/michaelgarisek/Projects/Garisek-OS`):

- `tools/eval-engineering/cursor-eval.mjs`
- `tools/code-graph/{cg,index-cli}.mjs`, `tools/code-graph/run-mcp.sh`, `tools/code-graph/claims.mjs` (header)
- `src/lib/loops/{verify-gate,verifier-gate,hermes-dispatch,receipt-chain,run-recorder,evidence,loop-feed,ratchet,lane-isolation,anchor-authority,conformance-ledger,repo-manifests}.ts`
- `scripts/{hermes-dispatch,hermes-land,linear-poll,task-claim,sessions-capture,ratchet-run,buzz-feed}.ts`
- `scripts/hermes-profiles/claude-coder-shim.sh`, `scripts/hermes-profiles/agent-hooks/cf-coder-guard.sh`
- `scripts/observability/log-coder-trace.mjs`, `scripts/hooks/{session-claims-start,session-claims-end}.sh`
- `scripts/{033_loop_graph,040_loop_durable_execution,042_loop_provenance,043_loop_evidence,044_loop_ratchet,045_loop_interrupt,055_sessions_index,056_sessions_project_id,059_task_claims}.sql`
- `src/lib/db/queries/loops.ts` (`recordLoopRun`, `openLoopRun`, `openRunBlock`, `answerRunBlock`, `claimBlockedRun`, `LOOP_BLOCK_DECISIONS`), `src/lib/sessions/parsers.ts`, `src/lib/hermes/types.ts` (`HermesReceipt`)
- `src/app/api/loops/runs/[runId]/blocks/route.ts` and the route listing under `src/app/api/loops`
- `docs/HANDOFF-AGENT-OBSERVABILITY.md`, `docs/SESSIONS-INDEX-TRIAGE-PLAN.md` (head), `docs/loops/cycleforge-ack-build-SCHEMAS.md` (head), `docs/VERIFY-VERIFY-GATE-AND-CAGE.md` (head), `docs/VERIFY-HOST-MCP-LOOP.md` (head)
- Second pass (ownership question, §G): `tools/design-mcp/{server.mjs,README.md,package.json}`, `.mcp.json`, `scripts/guard/{adjudicate,adjudicate-hook,telemetry,telemetry-report}.mjs`, `src/design-system/pinned.ts` (head), `.claude/settings.json` (hooks), `docs/DESIGN-SYSTEM-SOT.md` (head), `docs/BRIEFING-DESIGN-SYSTEM-MCP-2026-08.md` (§4, §9), `scripts/code-graph-rebuild.ts` (head), `~/.config/systemd/user/garisek-code-graph.{timer,service}`, `systemctl --user list-timers`, and `node scripts/guard/telemetry-report.mjs`

Live measurements taken (no tree writes except the oracle stamps the CLIs always write):

- `cg.mjs stats` and `cg.mjs find isSlotTableChromeTrack`
- `ds.mjs contract` for five operator phrasings (§A.1)
- `git status --porcelain | wc -l` (307 dirty paths at session start)
- `.cursor/perf-overnight-state.json` (a finished 48-round Host loop)

---

## A. Measured architecture (what exists)

### A.1 Design oracle

| Piece | File | What it does | What a run writes |
|---|---|---|---|
| Server | `tools/design-mcp/server.mjs` (1541 lines) | Three tools only: `ds_contract`, `ds_tokens`, `ds_critique`. Catalog = non-recursive walk of `PRIMITIVE_HOMES`. `useWhen` / `doNot` / `law` come only from `pinned.json` (`readOverrides`, keys starting `_` dropped). | Nothing. Stateless per call. |
| Ranking | `score()` and `recommendVariant()` | Term overlap: id match +12, id substring +6, `useWhen` term +10, file path +2. Variant pick from `variant_notes`. There is no alias table, no cohort, no eval command, no refuse field in the response. | |
| Critique | `ds_critique` handler | `FORK_SIGNALS`, `LITERAL_PATTERNS`, size, `no-system-usage`. Self-described "HEURISTIC — text matches, not AST proof". Cohort-law `style={{ visibility }}` and `zIndex.panel` are exempted only inside `OVERLAY_COHORT_WORKSPACES`, a hand-copied `Set` of six paths (the server cannot import the TS cohort). | |
| CLI | `tools/design-mcp/ds.mjs` | Same handlers over stdio. Every command, including bare `ds.mjs stamp`, writes the stamp. | `.cursor/design-mcp-session.json` = `{source, lastTool, lastIntent?, lastTopId?, lastAxis?, lastFile?, repo, updatedAt, updatedMs}` |
| Pins | `src/design-system/pinned.json` | 54 keys (53 primitives + `_README`). This is the only place law reaches `ds_contract`. | |
| Gate | `.cursor/hooks/pretool-ui-design-mcp.sh` | Cursor `preToolUse` on `Write|StrReplace|EditNotebook|Delete`. Denies `src/**/*.{tsx,jsx,css}` and `src/design-system/**/*.{ts,tsx}` without a stamp younger than 45 min. Fail-open on non-UI paths, unreadable stamp, or any exception. `pinned.json` and `tools/design-mcp/**` are exempt. | |
| Pre-seed | `.cursor/hooks/session-start-design-mcp.sh` | Runs `ds.mjs stamp` then one fixed `contract "dumb station scan mouth …"` at session start. Comment in the file: "Always leave a stamp so the first UI write in a fresh session is not blocked solely because MCP tools were missing from the catalog." | A fresh stamp before the agent has done anything. |

Measured `ds_contract` answers for the operator phrasings in the brief (top match, and whether the answer is typed enough for a Host to act on):

| Prompt | Top match | Typed mount? | Cohort / eval / refuse in the answer? |
|---|---|---|---|
| "sort the image column" | `DataTable` (doNot names `SLOT_TABLE_PAINT_LAW.headerSort` and `isSlotTableChromeTrack`) | no | no |
| "put a date in the cell" | `DateRangePickerField`, `pickVariant: "compact"`, `mount: <DateRangePickerField variant="compact" />` | **yes** | no |
| "show keys on the buttons" | `ComposerModeRow` first; `TableStatusBar` second (its doNot text says "Do not leave standing letters") | no | refuse exists only as prose inside `doNot` |
| "no modes on this station" | `StationComposerHost` (doNot names `showModeFaces={false}`) | no | no |
| "make all data headers sortable" | `DataTable`, then `Button`, `DeskActionSlot` (noise) | no | no |

Only the date job produces a machine-actionable answer. Every other answer is correct prose a model must read and obey.

### A.2 Code graph

| Piece | File | Measured |
|---|---|---|
| CLI | Garisek `tools/code-graph/cg.mjs` | Spawns the MCP server over stdio, calls `graph_stats` / `find_symbol` / `search_code` / `impact_analysis` / `get_call_graph`. Every call, including bare `cg.mjs stamp`, writes `.cursor/code-graph-session.json` in the target repo. |
| Stamp readers | none | `grep` across `.cursor/hooks/*`, `tools/eval-ledger/*`, Garisek `scripts/*`: nothing reads `code-graph-session.json`. It is written, never consumed. |
| Pre-seed | `.cursor/hooks/session-start-garisek-engineering.sh` | Runs `cg.mjs stamp` and `cg.mjs stats` at session start. |
| Index | Garisek `tools/code-graph/index-cli.mjs` | Manual: `--path … --name cycleforge-app`. Live stats 2026-09-02: status `ready`, `last_built_at 2026-09-02T00:01:02Z`, 7016 files, 37796 nodes, 176479 edges, 37341 embedded. |
| Known validity limits | Garisek `tools/code-graph/claims.mjs` header | Documents that before the purge fix the graph carried "8,881 zombie nodes and 52,119 zombie edges for deleted files", that `signature` cannot witness interfaces, and that `indexed_at` means content-changed not graph-observed. The graph is good at finding; disk decides validity. |
| In eval | `tools/eval-ledger/eval-core.mjs` `evalStationPass` | Per `graphSymbols` name: `find --limit 3`, takes `matches[0].node_key`, then `impact --depth 2`. Writes `${day}-find-<symbol>.json` and `${day}-impact-<symbol>.json`. A `no match` is recorded as `{error:'no match'}`. Only `runSlotTable` folds that into `ok` (`graphOk`); station and shortcuts ignore it. |

### A.3 Eval cohorts and runners

Source of truth is four TS modules imported by the runners through `node --import tsx`:

| Cohort | Module | Predicates | Graph symbols | Ratchet |
|---|---|---|---|---|
| slot-table | `src/lib/tables/slot-table-cohort.ts` (203 lines) | `SLOT_TABLE_ENGINE_CONTRACT`: 21 regexes, each mapped to one engine file by `slotTableEngineContractSource` | 11 | peers derived from `PRODUCT_TABLES` (19 in the 2026-09-02 peer matrix); `SLOT_TABLE_ENGINE_LAYOUT_HOOKS` grows |
| slot-table discover | `src/lib/tables/slot-table-discover.ts` (676 lines) | 9 scanners → `delete` / `judgment`; `keepInventory` names every KEEP id | | `SLOT_TABLE_KNOWN_DEBT` = 3 ids, all judgment; measured `delete: []`, `unexpected: []`, `staleKnownDebt: []` |
| shortcuts | `src/lib/keyboard/shortcut-display-cohort.ts` (437 lines) | 15 presence + 10 absence regexes; `discoverShortcutDisplay` scanner | 4 | `SHORTCUT_DISPLAY_KNOWN_DEBT` = 2 judgment ids |
| overlay shell | `src/lib/station/scan-station-overlay-cohort.ts` (196 lines) | `SCAN_STATION_OVERLAY_CONTRACT`: 6 regexes over each member workspace | member `exportName` + extras | 6 members; `eval:cohort overlay` refused at `run-cohort-eval.mjs` `main()` |

What each runner writes:

| Runner | Executes | Writes |
|---|---|---|
| `run-cohort-eval.mjs slot-table` | tripwire tests (`node --import tsx --test` on 2 files), `verify:fast` unless `--skip-verify`, 6 critiques, 11 find+impact, `graph_stats`, discover, 21 contract greps | `docs/eval/cohorts/slot-table/snapshots/${day}-{tripwire.log,verify-fast.log,critique-*.txt,find-*.json,impact-*.json,graph-stats.json,discover.json}`; patches every `<!-- eval-ledger:auto:* -->` block in the LEDGER (15 keys, including the 5 that `evalStationPass` owns); prints `{ok, tripwire, verify, engineContract, graph, peers, discoverNext, runId}`. `ok = tripOk && verifyOk !== false && contractOk && graphOk` (line 360). |
| `run-cohort-eval.mjs shortcuts` | tripwire tests (2 files), verify unless skipped, 4 critiques, 4 find+impact, discover, contract greps | same shape under `cohorts/shortcuts/snapshots`. `ok = tripOk && verifyOk !== false` (line 614). **Contract and graph results are written to the LEDGER and ignored for `ok`.** |
| `run-station-eval.mjs <id>` | `evalStationPass`: verify unless skipped, critiques, find+impact | `docs/eval/stations/<id>/snapshots/…`, 5 auto blocks. `ok: result.verifyOk !== false`. **The `tripwires` array is rendered as a bullet list; no test is executed.** |
| `run-slot-table-discover.mjs` | `discoverSlotTable` + `assertKnownDebtRatchet` | `${day}-discover.json`; exit by ratchet |

Human sections in every LEDGER (`Locked wins`, `Operator verdict`, `Open gaps`) are free prose. Every `Operator verdict` measured today reads "initial scaffold — awaiting first operator walk". Every `Open gaps` reads "none filed yet" or points at Discover.

Snapshot churn: the runners rewrite dated files under tracked `docs/eval/**/snapshots/` on every run. At session start `git status --porcelain` listed 307 dirty paths, the majority of them eval snapshots and LEDGER auto blocks.

Measured runner drift (shortcuts): the LEDGER engine-contract table shows six `**FAIL**` rows (`opaqueKeycap`, `softKeyRim`, `keyElevation`, `squaredKeycap`, `ignoreKeyRepeat`, `absent:mutedTeachingLetter`) while the tripwire log shows `pass 10 fail 0` and the runner printed `ok: true`. Cause: `run-cohort-eval.mjs:541-554` greps `barSrc` (`TableStatusBar.tsx`) for every predicate except two, but the TS cohort and its test locate `opaqueKeycap` / `softKeyRim` / `keyElevation` / `squaredKeycap` in `KeyboardKey.tsx` and `ignoreKeyRepeat` in the hook and cheat sheet. `absent:mutedTeachingLetter` fails because `TableStatusBar.tsx:212` legitimately paints tab text with `text-text-muted`. The runner is wrong, the TS is right, and `ok` hides it.

### A.4 Cursor stop gate and the Hermes twin

| Piece | File | Behaviour |
|---|---|---|
| Host checker | `tools/eval-ledger/machine-gate.mjs` | Exit 0 pass, 1 red (repair brief on stdout), 124 timeout, 75 infra. `FORCE` when `--force`, `LOOP_RUN_ID`, or `HERMES_CODER_WORKTREE` is set; otherwise a clean tree passes. Always runs `cursor-eval --fast`. Scopes `eval:cohort slot-table --skip-verify` when a dirty path contains one of eight hand-listed `TABLE_MARKERS`; `eval:station <id> --skip-verify` when a dirty basename matches one of six hand-listed `STATION_WORKSPACES`. Then `perf-gate --mode=debt`. `sweepHermesDebris()` deletes `__ds_smoke*` files (the one tree write, despite the header "never writes the tree"). |
| What `--fast` is | `scripts/verify-profile.mjs` | `fast` = Lint + Typecheck. `Unit tests` (every `src/**/*.test.ts`, which is where all four tripwires live) is `profiles: 'full'` only. |
| Repair law | `machine-gate.mjs` `CYCLEFORGE_REPAIR_LAW` and Garisek `verify-gate.ts` `buildRepairPrompt` | Two hand-maintained copies of the same sentences. |
| Cursor stop | `.cursor/hooks/stop-eval-gate.sh`, `hooks.json` `timeout: 300, loop_limit: 1` | `{}` on: `status != completed`, `loop_count >= 1`, no dirty path under `INTERESTING`, missing gate, outer timeout, crash, gate exit 124/75, or "timed out after" in output. Red → `{followup_message: brief}`. Covered by `stop-eval-gate.test.sh` (7 cases; case 7 asserts timeout → `{}`). |
| Stamp | Garisek `tools/eval-engineering/cursor-eval.mjs` `writeStamp` | `.cursor/eval-session.json` = `{ok, source, lastCommand, mode, exitCode, durationMs, repo, updatedAt, updatedMs}`. Matches the committed snapshot exactly. Nothing else is recorded. |
| Hermes twin | Garisek `src/lib/loops/verify-gate.ts` | `defaultVerifyCommandForRepo('cycleforge-app')` → `node tools/eval-ledger/machine-gate.mjs`. `VERIFY_ATTEMPT_CAP = 3` (compile-time). `shouldRetryVerify` returns true for any non-zero **and for `null`**. `buildRepairPrompt` carries the Cycle Forge display law and the five suppression prohibitions. |
| How Hermes consumes exit codes | Garisek `scripts/hermes-dispatch.ts`, verify block in `main()` | `exitCode = v.code` from the child. Only a thrown timeout (Hermes' own 420 s `LOOP_VERIFY_TIMEOUT_MS`) yields `null`. A machine-gate `124` (inner 280 s) or `75` (infra) arrives as an ordinary red and spends a repair hop whose log says "timeout after 280s". |

### A.5 Garisek autonomous loop (the pattern to reuse)

Rail: Linear label machine in `scripts/linear-poll.ts` (`agent → agent:running → agent:done → agent:coding → agent:review → agent:iterate|agent:accept → agent:landing → agent:landed|land-failed`, plus `hold` and `stalled`). `openLoopRun` opens the `loop_runs` row at start (040). `scripts/hermes-dispatch.ts` per run: `ensureWorktree` under `<repo>/.claude/worktrees/loop-<runId>`, `linkNodeModules`, `acquireLease` (one writer per repo), coder hop (`hermes -p coder --in <wt> -z <prompt>` or `claude-coder-shim.sh` → `claude -p --permission-mode acceptEdits --disallowedTools Bash,WebFetch,WebSearch,Agent,Task,NotebookEdit --max-turns 30 --output-format json`), verify loop under the cap, optional verifier verdict (a model reading the diff, JSON only, `null` = unverified never approved), reporter, Linear comment, `agent:stalled` on give-up, `hermes-feature-review.ts` screenshots to Buzz. `scripts/hermes-land.ts` on `agent:accept`: re-verify in the worktree, refuse on dirty overlap, `git apply --3way`, commit on main.

Receipts: `loop_run_steps` (033: `run_id, node_id, seq, status, model, profile, tokens, cost, latency, http_status, receipt jsonb, payload_sample, artifacts`), 042 adds `prompt_id, prompt_hash, graph_version, prev_hash, entry_hash`, 043 adds `payload_full` and `loop_step_evidence`. `src/lib/loops/receipt-chain.ts`: `canonicalJson`, `genesisHash(runId)`, `entryHash(prev, seq, receipt)`, `chainBatch`, `verifyChain` with verdicts `valid | unchained | broken`. Its header is explicit: "tamper-evidence against accident and partial edits, not tamper-proofing against an adversary holding write access." `run-recorder.ts` `persistLoopRun` reads the row back before claiming persistence and never throws.

Human interrupt: `loop_run_blocks` (045): one `waiting` block per run (partial unique index), `payload` frozen at ask time, `decision IN ('retry','abandon')` (`LOOP_BLOCK_DECISIONS` in `queries/loops.ts`), `answerRunBlock` conditional on `waiting`, `claimBlockedRun` as the resume lock. Routes: `GET /api/loops/runs/[runId]/blocks`, `POST /api/loops/runs/[runId]/answer`. "Nothing automatic ever touches a blocked run."

Observability: LiteLLM → Langfuse v3, `session_id = runId` from the Hermes client; Claude coder hops traced by `scripts/observability/log-coder-trace.mjs` direct ingestion with `sessionId = LOOP_RUN_ID`, `name: 'claude-coder'`, generation `coder-attempt-N`, `totalCost` from Claude's own report. `loopTraceUrl(runId)` deep-links the session. Buzz `#loop-feed` posts and a live canvas (`postToBuzz`, `updateBuzzCanvas`, fail-soft).

Two more Garisek surfaces matter here:

- **Session index** (055/056, `scripts/sessions-capture.ts`, `src/lib/sessions/parsers.ts`): a daemon indexes every `~/.claude/projects/**/*.jsonl` and Hermes session into `session_index` with `title, message_count, input/output tokens, project_id`. `summary` is null at capture. No tool calls, no files, no outcome. 113 transcripts exist for this project directory today.
- **Task claims** (059, `scripts/task-claim.ts`, user-level `SessionStart` hook): every Claude Code session is armed with identity `claude-code:<session_id>` and a 4 h TTL claim on `trk_tasks`. This is already a Host-assigned identity for interactive sessions.

A Host loop already lives inside cycleforge-app: `tools/eval-ledger/perf-overnight.mjs`. It has a goal (Tier-1 ≥ 95), caps (`--max-hours`, `--max-rounds`, `--hops`), worktree, Hermes coder, `machine-gate --force`, measure, and a state file. Its last run (`.cursor/perf-overnight-state.json`): 48 rounds, 5 wins, `reason: max-rounds`, and rounds 18 through 48 all attacked `/test:performance:6` with no movement. It has no no-progress exit, no receipts, and its state is gitignored.

### A.6 The two logs are not the same log

| | Cycle Forge eval snapshot | Garisek loop receipt | Cycle Forge stamps | Garisek session index |
|---|---|---|---|---|
| Unit | one cohort or station run | one model hop (`loop_run_steps`) | last CLI call | one transcript file |
| Key | `${day}` + cohort id (`runId` only in the LEDGER footer) | `run_id` + `seq` | none | `(source, source_ref)` |
| Records | predicate pass/fail, critique text, find/impact JSON, discover verdicts | model, tokens, cost, prompt id/hash, payload, evidence lines, chain hashes | `ok`, `lastCommand`, `lastTool` | title, counts, tokens |
| Goal / prompt | no | `loop_runs.goal`, `goalSlug` | no | title only |
| Files touched / refused | no | `git status` text inside the Linear comment | no | no |
| Outcome sentence | no | `formatVerifyLine` in the Linear comment | no | no |
| System upgrade with reason | no (LEDGER auto blocks show state, not delta or why) | ratchet verdict (044) | no | no |
| Chained | no | yes (042) | no | no |
| Phone-readable | no | Buzz + Linear + Langfuse | no | `/tracker` only |

The gap: a Cycle Forge desk walk that succeeds leaves dated snapshot files and a 9-field stamp, all gitignored or noise-diffed, keyed by day, with no goal, no prompt, no file list, no refusal, no reason for any pin or debt change, and no id that Langfuse, Buzz, or Linear can join on.


---

## B. Gap analysis (why it cannot yet run unattended)

### B.0 Trace: "make all DATA headers sortable, then stop" through today's code

Assume the operator types that sentence and walks away. Three hosts could pick it up. What each does:

**Cursor agent (the only host with the design gate).** `sessionStart` pre-stamps design and graph (§A.1, §A.2), so the first `Write` to `OrdersQueueTableRow.tsx` is allowed whether or not the model called an oracle. Nothing routes the sentence; `AGENTS.md` prose says "engine, not desk", the model may or may not comply. Suppose it edits `useOrdersSpreadsheet.tsx` and adds `sortable: false` to the Image column to "fix" a click that did nothing. Stop hook: dirty path under `src/components/dashboard/…` matches `INTERESTING` → `machine-gate` → `cursor-eval --fast` (lint + typecheck) green → `useOrdersSpreadsheet` contains none of the eight `TABLE_MARKERS` substrings → no cohort eval → perf debt stamp → exit 0 → `{}`. **Silent pass.** The tripwire that would have caught it (`assertCompoundFamilyHeaderSort`) lives in `slot-table-cohort.test.ts`, which on this path only `verify --full` would run, and the gate runs `--fast`. If instead the model edits `CompoundCells.tsx`, the marker matches and `eval:cohort slot-table --skip-verify` runs the tripwire; a red produces one `followup_message`, then `loop_count=1` → `{}` forever. If `cursor-eval` exceeds 280 s (the committed 2026-09-01 snapshot shows 87.8 s for a fast verify; the same day's stamp shows 9.6 s; the spread is what a loaded box eats, and `tsc` here already needs `--max-old-space-size=6144`) → exit 124 → `{}`. **Silent skip, indistinguishable from pass.** Nothing records the sentence, the files, or that the gate never ran.

**Claude Code (this session's harness, and the Hermes coder seat via `claude-coder-shim.sh`).** `.claude/settings.json` has no design gate, no graph gate, no stop gate; `CLAUDE.md` claims "project hooks enforce a session stamp" and that is false for this host. In the shim, `--disallowedTools Bash` means the coder physically cannot run `ds.mjs` or `cg.mjs`; its only oracle path is native MCP from the worktree's `.mcp.json`, which is exactly the path the brief calls unreliable. The Host (`hermes-dispatch.ts`) runs `machine-gate` after the hop, with `HERMES_CODER_WORKTREE` set so `FORCE` is on. Same scoping hole as above. On a `124` the Host spends a repair hop on a timeout. On red it repairs up to `LOOP_VERIFY_MAX_ATTEMPTS` (default 2, cap 3) then stamps `agent:stalled`. There is no "then stop when every DATA header sorts" predicate anywhere; the loop stops when verify is green, which it already is.

**perf-overnight (the only goal loop).** Wrong goal; but it shows the shape: 31 identical no-progress rounds before `max-rounds`.

Where the sentence would hang: nowhere. Where it would fork: the desk row (no router, no graph requirement). Where it would silently pass: unscoped machine-gate, fail-open timeout, `eval:station` never running its tripwire, shortcuts `ok` ignoring its contract. Where it would leave a receipt: nowhere a human can find next morning.

### B.1 Ranked gaps

Each row: file, what fails, what an autonomous run does wrong today, whether Garisek already solved a cousin.

#### P0

**G1. No session receipt (confirmed, and worse than the brief says).**
- Files: Garisek `cursor-eval.mjs` `writeStamp`; `.cursor/eval-session.json`; `run-cohort-eval.mjs` (writes snapshots, never the stamp); `.gitignore:133` (`.cursor/*` banned, so every stamp is local-only).
- Fails: the stamp is nine fields about the last command. Cohort runs are keyed by `${day}` and overwrite each other within a day. No goal, prompt, expansion, oracle calls, file list, refusal, or reason for a pin / debt / cohort change exists anywhere. The Garisek session index captures title and token counts only (`parsers.ts` `SessionCapture`).
- Unattended: the morning after, the operator has dated snapshot diffs in `git status` and a Buzz feed that says nothing about Cycle Forge desk work. "This session did X because Y; outcome Z; system upgraded W" cannot be reconstructed without re-reading a transcript.
- Cousin: yes. `loop_run_steps` + `receipt-chain.ts` + `run-recorder.ts` are the pattern; `HermesReceipt` is the payload shape for a model hop, not for a session. Reuse the chain, add a session-shaped receipt (§D3).

**G2. Oracles are not the Host; the stamp is a liveness token, not proof (confirmed, refined).**
- Files: `pretool-ui-design-mcp.sh` (Cursor only), `.cursor/hooks.json` (`preToolUse` matcher), `session-start-design-mcp.sh` and `session-start-garisek-engineering.sh` (pre-stamp), `ds.mjs` and `cg.mjs` (`stamp` subcommands write without any oracle call), `.claude/settings.json` (no design or graph hook), `claude-coder-shim.sh` (`--disallowedTools Bash`), `after-mcp-code-graph-stamp.sh` (writes a stamp nobody reads).
- Fails: (a) the gate exists on one of three hosts; (b) the stamp is pre-seeded at session start so it proves nothing about the edit; (c) `impact_analysis` is never required by anything before a `CompoundItem` edit; (d) in the automated rail the coder cannot reach the CLI fallback at all.
- Unattended: the model decides whether to consult the oracle, on every host. The Host never sees the oracle's answer, so it cannot check the edit against the mount.
- Cousin: yes, in shape. `cf-coder-guard.sh` is a fail-closed `pre_tool_call` cage ("a guard that disappears when it breaks is a guard that reports PASS while enforcing nothing"), and `anchor-authority.ts` makes commands data the model cannot author. Neither knows about design or graph oracles.

**G3. No machine router (confirmed by measurement).**
- Files: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, `.cursor/skills/*/SKILL.md`, `FABLE-5.1-SYSTEM.md` §7 (five prose copies of the same table); `server.mjs` `score()` (term overlap, no alias table); `machine-gate.mjs` `TABLE_MARKERS` and `STATION_WORKSPACES` (a sixth copy, as substrings).
- Fails: §A.1 table. Only the date job yields a typed mount. "show keys on the buttons" ranks `ComposerModeRow` first; the refuse is prose inside `TableStatusBar.doNot`. No answer carries a cohort, an eval command, graph symbols, or a refuse list.
- Unattended: "sort the image column" resolves to a file the model picks. Nothing turns the sentence into `{cohort: slot-table, eval: eval:cohort slot-table, symbols: [isSlotTableChromeTrack, queueSortForColumnKey, LedgerGridColumnHeader], refuse: [sortable:false on a labeled fact]}` before the first edit.
- Cousin: partial. Garisek `anchor-authority.ts` and `repo-manifests.ts` resolve "what may run" as data from non-model sources. The same discipline applied to "what cohort is this" is §D5.

**G4. Verify is a gate, not a goal loop (confirmed; perf-overnight is the exception and shows the missing pieces).**
- Files: `stop-eval-gate.sh` (`loop_count >= 1` → `{}`), `hooks.json` (`loop_limit: 1`), `hermes-dispatch.ts` (attempt loop ends at green verify), `perf-overnight.mjs` (no `maxNoProgressRounds`, no receipts, gitignored state), `loop_run_blocks` (`decision IN ('retry','abandon')`).
- Fails: no durable goal object with success predicates; stop = "verify green" or "cap hit"; the human queue is `retry|abandon`, which cannot express "approve this pin" or "delete this judgment row".
- Unattended: the loop stops early (green verify with the goal unmet) or late (perf-overnight's 31 wasted rounds). Anything needing a human is either guessed or stalls the whole run.
- Cousin: yes. `loop_runs` (goal, goalSlug, status incl. `blocked`), `loop_run_blocks` (one open question, frozen payload, answer route), ack-build's named convergence exits (`dry_streak`, `max_rounds`, `empty_gap_report` in `cycleforge-ack-build-SCHEMAS.md`). Extend the decision vocabulary and the payload; do not build a second queue (§D1, §D2).

**G5. Critique vs law: the overlay tripwire is never executed on the unattended path (refined; worse than the brief).**
- Files: `eval-core.mjs` `evalStationPass` (renders `manifest.tripwires` as a list; no `node --test`), `run-station-eval.mjs` (`ok: result.verifyOk !== false`; with `--skip-verify` that is always true), `machine-gate.mjs` (station scoped with `--skip-verify`; `cursor-eval --fast` excludes unit tests per `verify-profile.mjs`).
- Fails: delete `style={{ visibility }}` and `zIndex.panel` from `TestingLineWorkspace.tsx` to silence `ds_critique`; `machine-gate` runs `eval:station testing --skip-verify`; critique is now quiet; verify skipped; `ok: true`; exit 0. `scan-station-overlay-cohort.test.ts` runs only under `pnpm run verify` (full), which no unattended path invokes.
- Unattended: the repair law forbids the deletion in text; the only structural check is off the path. The design-mcp allowlist `OVERLAY_COHORT_WORKSPACES` and its sync test are also only exercised by the full profile.
- Cousin: no. Garisek's `check:loops` conformance suite is a cockpit gate, not a target-repo gate.

**G6. Fail-open is indistinguishable from pass, and Hermes retries on a timeout (confirmed, refined).**
- Files: `stop-eval-gate.sh` (124 / 75 / "timed out after" → `{}`; test case 7 pins this), `machine-gate.mjs` (`process.exit(124)` on inner timeout, `75` on infra), `hermes-dispatch.ts` verify block (`exitCode = v.code`; only its own thrown timeout yields `null`), `verify-gate.ts` `shouldRetryVerify` (retries on `null` too), `perf-overnight.mjs` (`gate.code !== 0 && hop < HOPS` → re-prompt on 124).
- Fails: interactive fail-open is defensible; unattended it is the only Host check silently skipped. On the Hermes rail a `124` or `75` becomes a red that costs a coder hop with a log that says "timeout"; `formatVerifyLine` reports it as `FAILED exit 124`, not as unmeasured. There is no `LOOP_UNATTENDED` flag anywhere (grep: none).
- Unattended: a slow box turns every hop into either a silent pass (Cursor) or a wasted repair (Hermes). Neither produces "unmeasured".
- Cousin: yes, the vocabulary. `ratchet.ts` refuses to decide when any component is `unknown` ("Absence of a measurement is not a measurement of absence"). Apply it to the gate's exit codes (§D7 item 3).

**G7. Runner and cohort disagree on where a predicate lives, and `ok` hides it (found by reading; not in the brief).**
- Files: `run-cohort-eval.mjs:541-554` and `:614`; `shortcut-display-cohort.test.ts` (reads `KeyboardKey.tsx` for the same predicates); `docs/eval/cohorts/shortcuts/LEDGER.md` engine-contract block (six FAILs beside `ok: true`).
- Fails: §A.3. The LEDGER publishes six false FAILs on a clean tree.
- Unattended: a repair hop handed "make that contract green" and this LEDGER will either move `bg-surface-sunken` into `TableStatusBar` (a fork) or strip `text-text-muted` from the tab labels (a paint change the law forbids). Both are the failure the stack exists to prevent, seeded by its own ledger.
- Cousin: yes. Garisek's `conformance-ledger.ts` keeps predicates as typed data and `chk-54-ledger-parity` asserts the manifest against the docs. The fix is the same shape: the cohort exports `(name, regex, sourceFile)` and the runner iterates that (the slot-table cohort already does this via `slotTableEngineContractSource`; shortcuts does not).

#### P1

**G8. Index staleness: a twice-daily timer exists; the gap is the intra-day window and no on-demand trigger (refined; the brief's "tribal knowledge" claim is wrong).**
- Files: `eval-core.mjs` (`find --limit 3`, `matches[0]` assumed correct), `run-cohort-eval.mjs` (`graphOk` fails on `no match`), `index-cli.mjs` (called by Garisek `scripts/code-graph-rebuild.ts` under `garisek-code-graph.timer` at 03:40 and 15:40, `Persistent=true`; no on-demand path from any runner), `claims.mjs` header (zombie nodes until the purge fix).
- Fails: adding a `graphSymbols` name fails the cohort until the next timer window (up to about twelve hours), and a repair hop inside that window sees only red. `matches[0]` for a common name (`DataTable`, `Button`) may be the wrong node; nothing checks `location` against the cohort's own `SLOT_TABLE_ENGINE.*` path.
- Unattended: red until the timer fires, unless the Host triggers `code-graph-rebuild.ts --name cycleforge-app --max-age-hours 0` itself. A repair hop under `CYCLEFORGE_REPAIR_LAW` may "fix" it sooner by removing the symbol from `graphSymbols`.
- Cousin: yes. `claims.mjs` `observe()`/`verify()` hashes disk, not the graph, for validity. Use `find` for discovery, verify `location` against the cohort path, rebuild once when empty (§D7 item 7).

**G9. Split brain: no join key between a Cycle Forge session and Langfuse / Buzz / Linear (confirmed).**
- Files: `log-coder-trace.mjs` (`sessionId = LOOP_RUN_ID`), `machine-gate.mjs` (`FORCE` on `LOOP_RUN_ID`), `loop-feed.ts` `loopTraceUrl`, `stop-eval-gate.sh` (no id at all).
- Fails: `LOOP_RUN_ID` already reaches machine-gate and the coder trace on the Hermes rail; Cursor and Claude Code sessions have no run id, and cohort runs have only a `${day}` and a `runId` timestamp in the LEDGER footer that nothing else references.
- Unattended: the phone feed shows Linear-born runs only. A goal-driven desk walk has no card.
- Cousin: yes, entirely. The join is `LOOP_RUN_ID` (§D6).

**G10. Human LEDGER sections are writable by any agent (confirmed).**
- Files: `eval-core.mjs` `patchLedger` (touches only auto blocks, correctly), `.cursor/hooks.json` `preToolUse` (no matcher for `docs/eval/**/LEDGER.md`), `.claude/settings.json` (none).
- Fails: nothing prevents an agent `Write` to `Operator verdict` or `Open gaps`. Today every verdict is scaffold text and every gap list is empty, so an autonomous agent's only machine queue is Discover (`delete: []`) and the false FAILs in G7.
- Unattended: an agent with "implement one Open gap" and an empty list invents one, or edits the verdict to match its work.
- Cousin: yes. `loop_run_blocks.note` is "the audit record of that choice, not an instruction to a model"; `session_triage` proposals never write the tracker. Same rule: human sections move behind a deny hook, agent proposals go to the ask queue (§D2, §D7 item 9).

**G11. machine-gate scoping is a hand list that misses the shortcuts cohort and design-system primitives (found by reading).**
- Files: `machine-gate.mjs` `TABLE_MARKERS`, `STATION_WORKSPACES`; `shortcut-display-cohort.ts` `SHORTCUT_DISPLAY_ENGINE` paths.
- Fails: a dirty `KeyboardKey.tsx`, `useSelectionStatusBarHotkeys.ts`, or `KeyboardShortcutsCheatSheet.tsx` triggers nothing; a dirty `TableStatusBar.tsx` triggers slot-table (via the `src/components/tables/` substring) and not shortcuts. The six station basenames duplicate `SCAN_STATION_OVERLAY_COHORT`.
- Unattended: standing keycaps land green.
- Cousin: n/a; fix is derivation from the cohorts (§D5, §D7 item 4).

**G12. No no-progress stop condition in the one goal loop that exists.**
- Files: `perf-overnight.mjs` (`while (round < MAX_ROUNDS && Date.now() < deadline)`), `.cursor/perf-overnight-state.json` (31 identical rounds).
- Cousin: yes, ack-build's `dry_streak` exit. Port it (§D1 `stopConditions.maxNoProgressHops`).

**G13. `OVERLAY_COHORT_WORKSPACES` is a hand copy the oracle cannot derive.**
- Files: `server.mjs:1189` comment "design-mcp cannot import the TS module"; sync asserted only by `scan-station-overlay-cohort.test.ts` (which G5 shows is off the unattended path).
- Unattended: a new station joins the cohort, critique nags its `visibility` style, the repair hop deletes it.
- Fix: a generated JSON the server reads (§D5).

#### P2

**G14. X1 vs greps (analysis, not a defect).** See §B.2.

**G15. Two copies of the repair law.** `machine-gate.mjs` `CYCLEFORGE_REPAIR_LAW` and `verify-gate.ts` `buildRepairPrompt` are parallel hand copies. Drift is invisible. Receipts should carry a hash of the law text they ran under (§D3), and Garisek should read the law from `machine-gate.mjs --print-law` rather than restating it.

**G16. Snapshot churn and staging.** Every eval run rewrites tracked dated files; `hermes-land.ts` stages with `git add -A -- . ':(exclude)node_modules'`, so a landed patch would carry snapshot noise. The receipt's `files_touched` must come from `git diff --name-only` minus `docs/eval/**/snapshots/**`, and land should exclude the same (§D7 item 14).

**G17. `sweepHermesDebris` deletes files without a receipt.** Minor, but in unattended mode a deletion with no record is the exact shape this report is about. Log it into the receipt's `system_upgrade` as `kind: 'debris_swept'` or move it into the coder cage.

**G18. Verifier verdict is a model grading a diff.** `verifier-gate.ts` is honest (`null` = unverified, never approve) and non-gating for landing. Keep it advisory; never let it replace the mechanical gate in §D4.

### B.2 X1 versus the engine-contract greps

Law X1 (`docs/warehouse-os/LAWS.md`): "never by a test that `readFileSync`s a source file and regex-asserts its contents." The cohorts do exactly that, on purpose, as named shrink-only tripwires. The brief's position (§10) is the right one: the greps stay until each is replaced one at a time by a behavioural test, and a grep is never deleted to "comply". Classification of the 52 predicates:

| Class | Predicates | Verdict |
|---|---|---|
| **Convert to behaviour first** (a rename or refactor will break the grep while the behaviour holds) | slot-table `headerClickUsesIsSortable`, `compoundTrackMapsThumb/State/Amount`, `titleIdleDefault`, `titleHoverUnderline`, `dateFieldNoYearFace`, `shipByCompactVariant`; overlay `visibilityHide`, `inert`, `zIndexPanel`; shortcuts `insideRightOverlay`, `gatedReveal`, `ignoreKeyRepeat`, `cheatSheetYields` | A mounted-DOM test (jsdom + `createElement`, `.test.ts` so the runner collects it) or a pure-function assertion (`queueSortForColumnKey('thumb') === 'image'`, `isSlotTableChromeTrack('select') === true`). Note `assertCompoundFamilyHeaderSort` in `slot-table-cohort.test.ts` already is the behavioural form of `headerClickUsesIsSortable`; that grep can die first. |
| **Keep as export-existence seams** | `useSlotTableLayoutExport`, `materializeTracksExport`, `headerSortLawExport`, `toolbarSortListsColumnFacts`, `hookToggle`, `hotkeyGlyph`, `dateFieldCompactDecl`, `assignOptimistic`, `filterMenuAlwaysMounted`, `filterIdleChrome` | These pin that a seam exists in a named file. A TS import in the test (`import { isSlotTableChromeTrack } from …`) is the X1-compliant form and the tripwire test already does that for several; convert by adding the import and deleting the regex. |
| **Keep as absence tripwires** (no behaviour to test; the thing must not exist) | all ten `SHORTCUT_DISPLAY_FORBIDDEN`; slot-table test's `doesNotMatch` for `type=date`, `InlineEditableValue`, `CompoundShipByEditor`; `motionSwap`, `pointerEventsNone` | Best home is an ESLint `no-restricted-syntax` / `no-restricted-imports` rule scoped to the engine files, which X1 explicitly allows ("an ESLint AST rule"). Until then the grep stays. |
| **Replace with data derivation** | overlay test "design-mcp OVERLAY_COHORT_WORKSPACES stays in sync"; `keyboardKeyImport` | Generate the JSON the server reads from the cohort (§D5); the sync test becomes a build step. |
| **Copy-text predicates** (`titleItemNumberActions`, `editItemNumber`, `listingAriaOpen`, `listingCopyItemNumber`, `actionWrap`, `hotkeyCapTestId`, `opaqueKeycap`, `softKeyRim`, `blackLetter`, `keyElevation`, `squaredKeycap`) | Keep; they pin aria labels, test ids and token classes that a render test would assert the same way. Convert opportunistically. |

Rule for the Host: a grep may be deleted only in the same change that adds the behavioural test, and the receipt records `system_upgrade: {kind:'grep_to_test', target:<predicate>}`.

---

## C. Foundation to build upon (what not to replace)

1. **TypeScript cohorts are the SoT.** `slot-table-cohort.ts`, `slot-table-discover.ts`, `shortcut-display-cohort.ts`, `scan-station-overlay-cohort.ts`. Everything below imports them; nothing below restates them in markdown. The 2026-08-21 corpus was deleted because prose did not compose; `registry.json` already says "Authority is the TS cohort modules".
2. **KEEP / DELETE via Discover; shrink-only `KNOWN_DEBT`.** `nextDeleteGap`, `assertKnownDebtRatchet`, and the `keepInventory` ids are the deletion API. The ask queue (§D2) routes judgment rows to a human; it does not add a second inventory.
3. **`pinned.json` is the only growing law surface `ds_contract` can see.** Pins stay `useWhen` / `doNot` / `law`. The router (§D5) adds `cohort`, `evalCommand`, `refuse` as a sibling generated file, not as more prose in pins.
4. **`CYCLEFORGE_REPAIR_LAW` stays paint-frozen.** Repair hops may only make named contracts green. The Host reads it from one place.
5. **Garisek receipts are the receipt pattern.** `loop_run_steps` + `receipt-chain.ts` (`loop_run_steps:v1`) + `run-recorder.ts`. No third hash format. A session receipt is a new `receipt` payload under the existing chain, not a new table.
6. **`loop_run_blocks` is the human interrupt.** One open question per run, frozen payload, conditional answer. Extend the decision vocabulary; do not build a second queue.
7. **`LOOP_RUN_ID` is the join key.** machine-gate, the Claude coder trace, Langfuse sessions, and the Buzz canvas already agree on it.
8. **Overlay is not a display cohort.** `eval:cohort overlay` stays refused. The overlay contract is enforced per station, but its tripwire must actually run (§D7 item 1).
9. **`perf-overnight.mjs` is the local prototype of a goal loop.** Its worktree, cap, and gate wiring are right; it lacks a goal object, receipts, and a no-progress exit. Generalise it into the goal runner rather than starting a third orchestrator.
10. **`cf-coder-guard.sh` is the model for fail-closed enforcement.** Its header is the design rule: a guard that disappears when it breaks reports PASS while enforcing nothing.

---

## D. What to add so it can run autonomously

Target operating mode (operator's words): *I set a high-level goal. The loop runs. I only approve or reject small, typed asks. Every session leaves a log: this session did this thing for this reason; this was the outcome; this is why something in the eval/graph/pin/cohort system upgraded.*

Ownership split, decided once: **Garisek-OS is the Host** (goal runner, receipts, asks, phone feed). **cycleforge-app supplies oracles, evals, the router, and the goal files** as CLIs and committed data. This matches `verify-gate.ts` ("the loop lives in the Host") and `CHK-28` (Garisek `scripts/` may spawn; `src/lib/loops` may not).

### D1. Goal object

**File:** `docs/eval/goals/<goal-id>.goal.json` in cycleforge-app, validated by `src/lib/eval/goal.ts` (zod, `.strict()`).

```ts
export type CycleForgeGoal = {
  id: string                       // kebab, e.g. "data-headers-sortable"
  statement: string                // the operator's sentence, verbatim
  createdBy: 'human'               // literal; see "who may create"
  createdAt: string                // ISO
  successPredicates: Array<
    | { kind: 'eval'; command: 'eval:cohort slot-table' | 'eval:cohort shortcuts' | `eval:station ${string}` | 'eval:discover' | 'verify:fast' | 'verify'; expect: 'exit0' }
    | { kind: 'invariant'; keepIds: string[] }            // Discover KEEP ids that must survive (from keepInventory)
    | { kind: 'router'; refuse: string[] }                // refuse ids from the router that must never appear in files_touched
    | { kind: 'test'; file: string }                      // a src/**/*.test.ts the Host runs by name
  >
  stopConditions: {
    maxHops: number                // coder hops, hard cap 12
    maxHours: number
    maxNoProgressHops: number      // default 3; progress = fewer failing predicates than the previous hop
    onUnmeasured: 'block'          // never 'repair'
    onRed: 'repair' | 'block'      // repair under CYCLEFORGE_REPAIR_LAW until maxRepairs, then block
    maxRepairs: number             // ≤ VERIFY_ATTEMPT_CAP (3)
  }
  budget: { maxCostUsd?: number }
  routerHint?: string              // optional operator phrasing to feed routePrompt when statement is abstract
}
```

**Command allowlist:** `successPredicates[].command` must be a key of `package.json` `scripts` (the Host checks with `readScript` semantics from `cursor-eval.mjs`; F: "never invent a pnpm script").

**Who may create:** human only, enforced mechanically, not by prose: the Host loads a goal with `git -C <repo> show HEAD:docs/eval/goals/<id>.goal.json`. Agents never commit (AGENTS law, `cf-coder-guard.sh` blocks `git commit`), so a goal that exists only in the working tree is invisible to the runner. A goal file edited after commit shows as dirty and the Host refuses to start ("goal file dirty; commit it").

**Where the run lives:** Garisek `loop_runs` row opened by `openLoopRun({ runId: 'cfg_<goalId>_<ts>', definitionId: 'cycleforge-goal', trigger: 'goal', repo: 'cycleforge-app', goal: statement, goalSlug: goalId, meta: { goalHash, goalCommit } })`. The goal file is the human artifact; the run row is the Host's.

Example for the trace goal:

```json
{
  "id": "data-headers-sortable",
  "statement": "Every PRODUCT_TABLES DATA header click-sorts; no dual SoT; overlay peers stay on contract.",
  "createdBy": "human",
  "createdAt": "2026-09-02T00:00:00Z",
  "successPredicates": [
    { "kind": "eval", "command": "eval:cohort slot-table", "expect": "exit0" },
    { "kind": "test", "file": "src/lib/tables/slot-table-cohort.test.ts" },
    { "kind": "eval", "command": "eval:discover", "expect": "exit0" },
    { "kind": "eval", "command": "eval:station pack", "expect": "exit0" },
    { "kind": "invariant", "keepIds": ["engine:slot-table-header-sort", "engine:queueSortForColumnKey", "engine:LedgerGridColumnHeader"] },
    { "kind": "router", "refuse": ["slot-table.sortable-false-on-fact", "slot-table.new-grid-columns-array"] }
  ],
  "stopConditions": { "maxHops": 8, "maxHours": 6, "maxNoProgressHops": 3, "onUnmeasured": "block", "onRed": "repair", "maxRepairs": 2 },
  "budget": { "maxCostUsd": 15 }
}
```

### D2. Typed approval queue (yes/no only)

**Store:** `loop_run_blocks`, extended by migration `060_loop_block_kinds.sql`: widen `loop_run_blocks_decision_chk` to `('retry','abandon','approve','reject')`, add `kind text` with a CHECK over the enumeration below, and keep the partial unique index (one open ask per run). `LOOP_BLOCK_DECISIONS` in `queries/loops.ts` grows the same way. Existing `answerRunBlock` / `claimBlockedRun` / `GET blocks` / `POST answer` are reused unchanged.

**The only decisions that may block for a human** (everything else is automatic):

| `kind` | When the Host enqueues it | Auto-outcome if the human says no |
|---|---|---|
| `pin.promote` | a Locked-win candidate: the same `ds_contract` mount was used and eval stayed green across ≥2 hops, and no `pinned.json` key covers it | nothing changes; candidate recorded in the receipt |
| `discover.delete_judgment` | the next gap is a `verdict: 'judgment'` row and the goal needs it gone | row stays; goal blocks or picks the next unblocked DELETE |
| `cohort.append_row` | a new floor station or product table must join `SCAN_STATION_OVERLAY_COHORT` / `SLOT_TABLE_ENGINE_LAYOUT_HOOKS` | the file is not created; goal blocks |
| `known_debt.append` | the only way to green is a new debt id (F: normally refused). The Host may ask; the default recommendation is **no** | hop is reverted; goal blocks |
| `grep.retire` | a behavioural test now covers a grep predicate and the hop wants to delete the regex | grep stays |
| `land.apply` | the worktree diff passes every success predicate; apply to `main` (today's `agent:accept`) | worktree kept, no commit |
| `goal.stop` | budget, hours, or no-progress exhausted with predicates still red | run marked `stalled` |
| `oracle.unavailable` | design-mcp or code-graph could not be reached and `onUnmeasured: 'block'` | run stays blocked; human fixes infra |

Never an ask: paint changes, Operator verdict text, Open gaps text, new DELETE ids, new stations, new table engines, new composer mouths.

**Payload the human sees** (frozen at ask time, `loop_run_blocks.payload`):

```ts
type AskPayload = {
  kind: AskKind
  goalId: string; runId: string; hop: number
  summary: string                       // one sentence, mechanical template per kind
  proposedDiff: { files: string[]; stat: string; excerpt: string /* ≤ 2000 chars */ }
  evalSnippet: { command: string; exitCode: number | null; snapshot: string; tail: string /* ≤ 800 chars */ }
  blastRadius: { symbol: string; nodeKey: string; filesAffected: number; snapshot: string }[]
  recommendation: 'yes' | 'no'
  why: string                           // template + the predicate names that decided it
  answerUrl: string                     // POST /api/loops/runs/<runId>/answer
  traceUrl: string                      // loopTraceUrl(runId)
}
```

**Surface:** notification via `postToBuzz` + `updateBuzzCanvas` (exists), answer via the Garisek cockpit `POST /api/loops/runs/[runId]/answer` (exists, tailnet-reachable from the phone). When the goal was born from a Linear issue, mirror the ask as a comment and reuse `agent:accept` / `agent:iterate` only for `land.apply`; do not invent a second label machine.

### D3. Session receipt log (the missing sentence)

**Schema:** `src/lib/eval/session-receipt.ts` in cycleforge-app (type + zod), produced by the Host, never by the model.

```ts
export type CycleForgeSessionReceipt = {
  v: 'cf-session:v1'
  session_id: string                 // claude-code:<sid> | cursor:<sid> | hermes:<runId>:<attempt> | goal:<runId>:<hop>
  run_id: string | null              // LOOP_RUN_ID; null for interactive sessions
  goal_id: string | null
  host: 'cursor' | 'claude-code' | 'hermes' | 'goal-run' | 'perf-overnight'
  started_at: string; finished_at: string
  prompt_raw: string
  prompt_expanded: {                 // from routePrompt(), not from chat
    routes: { cohort: string; evalCommand: string; graphSymbols: string[]; engineFiles: string[]; refuse: string[]; mounts: string[] }[]
    unrouted: boolean
  }
  oracles_called: {                  // Host-observed: CLI invocations it made, or MCP stamps it verified
    tool: 'ds_contract' | 'ds_tokens' | 'ds_critique' | 'find_symbol' | 'impact_analysis' | 'search_code'
    args_digest: string; top_id: string | null; snapshot: string | null; at: string
  }[]
  files_touched: string[]            // git diff --name-only in the worktree, minus docs/eval/**/snapshots/**
  files_refused: { path: string; by: 'hook' | 'router' | 'cage'; reason: string }[]
  eval_runs: { command: string; exitCode: number | null; durationMs: number; snapshots: string[]; ok: boolean | null }[]
  outcome: 'pass' | 'repair' | 'blocked_for_human' | 'refused' | 'unmeasured' | 'stalled'
  outcome_sentence: string           // template: "<host> did <route.cohort> for goal <id> because <predicate>; <eval> exit <n>; <outcome>"
  system_upgrade: {
    kind: 'pin' | 'known_debt_shrink' | 'cohort_row' | 'index_rebuild' | 'grep_to_test' | 'debris_swept'
    target: string; reason: string; evidence: string   // evidence = snapshot path or ask id
  }[]
  law_hash: string                   // sha256 of CYCLEFORGE_REPAIR_LAW as printed by machine-gate --print-law
  prev_hash: string | null; entry_hash: string | null  // filled by the chain writer
}
```

Compared with today: `.cursor/eval-session.json` has `ok, lastCommand, exitCode, durationMs` and nothing else; `loop_run_steps.receipt` (`HermesReceipt`) has model, tokens, cost, prompt id/hash, payload hash, and is per model call. The session receipt is the third shape, and it is written **as a `loop_run_steps` row** with `node_id = 'cf:session'`, `receipt = <this object>`, chained by the existing `chainBatch` under `loop_run_steps:v1`. No new hash format.

**One store, decided:** Garisek `loop_run_steps` is the store of record, because the chain, the blocks, the Langfuse session, the ratchet lineage, and the phone feed already key on `run_id`, and a file in cycleforge-app has no reader on the phone. A committed human-readable mirror, `docs/eval/sessions/YYYY-MM.jsonl` in cycleforge-app, is appended by the same writer with the same `entry_hash`, so the file can be checked against the row and read in a PR without a database. The mirror is derived and may lag; the row is authoritative. If the DB is unreachable the writer still appends the mirror with `persisted: false` and the Host treats the hop as `unmeasured` when `LOOP_UNATTENDED=1`.

**Writer:** Garisek `scripts/session-receipt.ts --run-id --receipt <json>` (scripts may touch the DB; `src/lib/loops` may not). Called by the goal runner after every hop, by `hermes-dispatch.ts` after every coder attempt, and by a new Claude Code `Stop` hook for interactive sessions (best-effort, `run_id: null`). Hash-chain honesty is inherited verbatim from `receipt-chain.ts`: tamper-evident, not tamper-proof.

### D4. Host, not the model, owns the loop

**Driver:** Garisek `scripts/goal-run.ts` (new). It is `hermes-dispatch.ts` with the Linear intake replaced by a goal file, and `perf-overnight.mjs`'s round structure. Extract the shared mechanics from `hermes-dispatch.ts` into `scripts/lib/hop.ts` (`runCmd`, `ensureWorktree`, `linkNodeModules`, `acquireLease`, `readGitStatus`) so both rails call one implementation.

Sequence per run, with the exact function each step calls:

1. **Load goal.** `git show HEAD:docs/eval/goals/<id>.goal.json` → zod parse → `openLoopRun` (`queries/loops.ts`). Export `LOOP_RUN_ID`, `LOOP_UNATTENDED=1`, `HERMES_CODER_WORKTREE`.
2. **Expand the prompt via data.** `node --import tsx tools/eval-ledger/route.mjs --json "<statement>"` (§D5) → `prompt_expanded`. If `unrouted` and no `routerHint`: enqueue `oracle.unavailable`? No: enqueue nothing, mark `refused`, stop. A sentence the router cannot place is not permission to guess.
3. **Run the oracles as the Host.** For every route with `engineFiles`: `node tools/design-mcp/ds.mjs contract "<statement>"` and `ds.mjs tokens <axis>` for axes named by the route; for every `graphSymbols` entry: `cg.mjs find <sym> --limit 3` and `cg.mjs impact <node_key> --depth 2`. Record each in `oracles_called` with the snapshot path. The **oracle output is injected into the coder prompt**; the stamp files become irrelevant to the unattended rail.
4. **Verify `find` locations.** For each symbol, `matches[].location` must start with the cohort's own file for that symbol (`SLOT_TABLE_ENGINE.*`, `SHORTCUT_DISPLAY_ENGINE.*`, member `workspace`). No match → one `index-cli.mjs --path <repo> --name cycleforge-app` rebuild, receipt `system_upgrade: {kind:'index_rebuild'}`, re-find; still none → `unmeasured` → block.
5. **Coder hop.** `buildCoderPrompt` (extend `CoderPromptInput` with `route`, `oracleAnswers`, `refuse`) → `claude-coder-shim.sh` or Hermes. The cage (`cf-coder-guard.sh` or the shim flags) stays.
6. **Refuse check before verify.** `files_touched` ∩ route `refuse` file patterns, and a grep of the diff for refuse tokens (`sortable: false` on a labeled key, `showModeRow={false}`, `FilterRefinementBar`, `input type="date"`): hit → outcome `refused`, worktree reset to the pre-hop commit, receipt written, next hop with the refusal named in the prompt. This is the one place a regex is the right tool: it guards the model's output, not the product's source.
7. **Named eval.** Run every `successPredicates[].command` with `runCmd`, 420 s each. Not only the dirty-path scoping in machine-gate. Also `machine-gate.mjs --force` for lint/typecheck/perf debt.
8. **Classify.** exit 0 → predicate green; 1 → red; 124 / 75 / thrown → `unmeasured` (new `isUnmeasured(code)` in `verify-gate.ts`; `shouldRetryVerify` returns false for it when `LOOP_UNATTENDED=1`).
9. **Receipt.** `scripts/session-receipt.ts` → `loop_run_steps` row + JSONL mirror. `postToBuzz` one line = `outcome_sentence`; `updateBuzzCanvas`.
10. **Branch.** All predicates green → progress check → if goal complete enqueue `land.apply` (§D2) and stop. Any red and repairs left → `buildRepairPrompt` (`verify-gate.ts`, with `failingFiles` from `extractFailingFiles`) → step 5. Repairs exhausted, `unmeasured`, or a judgment row needed → `openRunBlock` with the typed payload → status `blocked`; the resumer never touches it (045). No-progress streak ≥ `maxNoProgressHops` → `goal.stop` ask.
11. **Never** write `Operator verdict`, `Open gaps`, or `Locked wins`. The Host has no code path to those sections; proposals are asks.

Cursor's stop hook and Claude Code's interactive sessions keep their current fail-open behaviour; they are not the unattended rail. What they gain is the receipt (`run_id: null`) and the router.

### D5. Prompt router as code

**File:** `src/lib/eval/prompt-router.ts` in cycleforge-app. Imports the four cohort modules and nothing else. Every route is derived from cohort constants; a tripwire test asserts that every `graphSymbols`, `engineFiles`, and `evalCommand` string in a route exists in a cohort or in `package.json` scripts, so the router cannot become a second list.

```ts
import { SLOT_TABLE_ENGINE, SLOT_TABLE_PAINT_LAW } from '@/lib/tables/slot-table-cohort'
import { SHORTCUT_DISPLAY_ENGINE, SHORTCUT_DISPLAY_FORBIDDEN, SHORTCUT_DISPLAY_PAINT_LAW } from '@/lib/keyboard/shortcut-display-cohort'
import { SCAN_STATION_OVERLAY_COHORT, SCAN_STATION_OVERLAY_CONTRACT } from '@/lib/station/scan-station-overlay-cohort'

export type RefuseRule = { id: string; why: string; diffPattern?: RegExp }
export type RouteRule = {
  cohort: 'slot-table' | 'shortcuts' | `station:${string}` | 'discover' | 'composer'
  keywords: readonly string[]            // lowercase tokens; matched after the same terms() split ds_contract uses
  evalCommand: string                    // must be a package.json script (+ args)
  graphSymbols: readonly string[]        // from the cohort
  engineFiles: readonly string[]         // from the cohort
  mounts: readonly string[]              // canonical mount strings, e.g. '<DateRangePickerField variant="compact" />'
  refuse: readonly RefuseRule[]
  tokenAxes?: readonly string[]          // ds_tokens axes the Host pre-fetches
}
export type RouteResult = { routes: RouteRule[]; refusals: RefuseRule[]; unrouted: boolean }
export function routePrompt(text: string): RouteResult
```

The four compilations the brief asks for:

| Operator text | `routes[0].cohort` | `evalCommand` | `graphSymbols` | `mounts` | `refuse` hit |
|---|---|---|---|---|---|
| "sort the image column" | `slot-table` | `pnpm run eval:cohort slot-table` | `isSlotTableChromeTrack`, `queueSortForColumnKey`, `LedgerGridColumnHeader`, `CompoundItem` | (none; engine edit) | `slot-table.sortable-false-on-fact` (`diffPattern: /sortable:\s*false/`), `slot-table.new-grid-columns-array` (`/export const \w+_GRID_COLUMNS/`) |
| "date in the cell" / "ship by" | `slot-table` | same | `DateRangePickerField`, `CompoundState`, `useOptimisticMutation` | `<DateRangePickerField variant="compact" />` | `slot-table.native-date-input` (`/type=["']date["']/`), `slot-table.range-variant-in-cell`, `slot-table.inline-editable-date` |
| "show keys on the buttons" | `shortcuts` | `pnpm run eval:cohort shortcuts` | `KeyboardKey`, `TableStatusBar`, `useSelectionStatusBarHotkeys` | `HotkeyGlyph` overlay (existing) | **refusal returned, no edit route**: `shortcuts.standing-keycaps` (why = `SHORTCUT_DISPLAY_PAINT_LAW.refuse`), plus every `SHORTCUT_DISPLAY_FORBIDDEN` regex as a `diffPattern` |
| "no modes" / "dumb station" | `composer` + `station:<id>` when a station name is present | `pnpm run eval:station <id>` | `StationComposerHost`, `ComposerModeRow`, member `exportName` | `showModeFaces={false}` | `composer.show-mode-row-false` (`/showModeRow=\{false\}/`), `composer.notes-composer` (`/\w+NotesComposer/`) |

**Consumers, all importing or reading the same module:**

- `tools/eval-ledger/route.mjs --json "<text>"`: the Host's CLI (and the receipt's `prompt_expanded`).
- `machine-gate.mjs`: replace `TABLE_MARKERS` and `STATION_WORKSPACES` with `routeDirtyPaths(paths)` exported from the router (`engineFiles` → cohort → eval command). This closes G11 with no new list.
- `tools/design-mcp/router.json`: generated by `node --import tsx tools/eval-ledger/route.mjs --emit-json` (the server cannot import TS). `ds_contract` reads it and adds `cohort`, `evalCommand`, `refuse` to each match whose id appears in a route's `engineFiles`; `OVERLAY_COHORT_WORKSPACES` is read from the same JSON, retiring the hand copy (G13). A tripwire asserts the JSON equals a fresh emit.
- Skills / `AGENTS.md`: keep the prose, but each row cites the route id; a doc test can assert every route id is mentioned, so prose can lag the code but never contradict it silently.

### D6. Observability join

Use what exists: **`LOOP_RUN_ID` is the Langfuse `session_id`**. The goal runner mints `cfg_<goalId>_<ts>`, exports it, and every child already behaves: `machine-gate.mjs` forces, `log-coder-trace.mjs` posts the coder hop into that session, `loopTraceUrl(runId)` deep-links it, `updateBuzzCanvas({ runId })` resets the phone board. The receipt writer additionally posts one Langfuse `trace-create` per hop with `name: 'cf-session'`, `sessionId: runId`, `input: prompt_expanded`, `output: outcome_sentence`, `metadata: { evalRuns, filesTouched, systemUpgrade }`, using the same ingestion call as `log-coder-trace.mjs` (keys from the stack `.env`, fail-soft). That gives one session per goal run containing coder generations and session receipts side by side.

**Interactive sessions are the wrong join.** Cursor's and Claude Code's model calls do not pass through LiteLLM, so there is no generation to attach; forcing them into Langfuse would produce sessions with receipts and no traces. For them the minimum morning log is: the JSONL mirror (`docs/eval/sessions/`), the `session_index` row they already get (title, tokens), and a `Stop`-hook receipt with `run_id: null` keyed by `claude-code:<session_id>` (the identity the claims hook already mints). The `/tracker` sessions view can list receipts by `session_id` without Langfuse.

**What the operator reads next morning, in order:** Buzz canvas (one line per hop: `outcome_sentence`), `GET /api/loops/runs/<runId>/blocks` (waiting asks), `loopTraceUrl(runId)` (only if a hop looks wrong), `docs/eval/sessions/*.jsonl` in the PR.

### D7. Reliability upgrades, ordered, with acceptance tests

| # | Pri | Change | Files | Acceptance test |
|---|---|---|---|---|
| 1 | P0 | `evalStationPass` executes `manifest.tripwires` with `node --import tsx --test`; `run-station-eval.mjs` `ok = tripOk && verifyOk !== false && critiqueOk && graphOk` | `tools/eval-ledger/eval-core.mjs`, `run-station-eval.mjs` | Delete `style={{ visibility }}` from `TestingLineWorkspace.tsx` in a scratch worktree; `pnpm run eval:station testing -- --skip-verify` exits 1 and the LEDGER tripwire block shows the failing predicate. |
| 2 | P0 | Shortcuts contract gets `shortcutEngineContractSource(name)` (mirror of the slot-table helper) and the runner iterates it; `ok` includes `contractOk && graphOk` | `shortcut-display-cohort.ts`, `run-cohort-eval.mjs:541-554, :614` | Clean tree → 0 FAIL rows in the LEDGER; inject `toggleShortcutOverview` into `TableStatusBar.tsx` → exit 1. |
| 3 | P0 | Unattended fail-closed: `LOOP_UNATTENDED=1` makes `machine-gate` print `UNMEASURED` and exit 124/75 unchanged; `verify-gate.ts` adds `isUnmeasured(code)`; `shouldRetryVerify` returns false for unmeasured when unattended; `hermes-dispatch.ts` and `goal-run.ts` block instead of repair; `formatVerifyLine` prints "unmeasured (timeout)" not "FAILED exit 124". Cursor stop unchanged. | `machine-gate.mjs`, `verify-gate.ts`, `verify-gate.test.ts`, `hermes-dispatch.ts` | `CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC=1 LOOP_UNATTENDED=1 node machine-gate.mjs --force` → exit 124; the Host's receipt says `outcome: 'unmeasured'` and no repair prompt is built. `stop-eval-gate.test.sh` case 7 still passes. |
| 4 | P0 | Router module + `route.mjs`; machine-gate scoping derived from `routeDirtyPaths` | `src/lib/eval/prompt-router.ts` (+ test), `tools/eval-ledger/route.mjs`, `machine-gate.mjs` | Touch `KeyboardKey.tsx` only → machine-gate log shows `eval:cohort shortcuts --skip-verify`. `route.mjs "show keys on the buttons"` returns `refusals[0].id === 'shortcuts.standing-keycaps'` and zero edit routes. |
| 5 | P0 | Session receipt type + writer + JSONL mirror + chain reuse | `src/lib/eval/session-receipt.ts`, Garisek `scripts/session-receipt.ts`, `docs/eval/sessions/` | Two receipts for one run → `verifyChain` returns `valid, checked: 2`; edit one line of the mirror → `scripts/session-receipt.ts --verify` reports the seq that diverges. |
| 6 | P1 | Goal file schema + `goal-run.ts` driver (extracted hop helpers; per-predicate eval; asks; no-progress exit) | `src/lib/eval/goal.ts`, `docs/eval/goals/`, Garisek `scripts/goal-run.ts`, `scripts/lib/hop.ts` | Dry run of `data-headers-sortable` on a clean tree: every predicate green on hop 0 → the only ask is `land.apply` with an empty diff, which the runner short-circuits to "goal already met, nothing to land". Dirty goal file → refuses to start. |
| 7 | P1 | Typed asks: migration 060, `LOOP_BLOCK_DECISIONS` widened, `AskPayload` zod, Buzz card | Garisek `scripts/060_loop_block_kinds.sql`, `queries/loops.ts`, `scripts/buzz-feed.ts` | `openRunBlock({ kind:'discover.delete_judgment' })` then a second open → unique-index violation; `answerRunBlock({ decision:'approve' })` flips exactly once. |
| 8 | P1 | Graph requirement Host-enforced: `goal-run.ts` refuses the coder hop when a route has `graphSymbols` and any impact snapshot is missing; interactive Cursor gets a fail-open `preToolUse` graph gate on route `engineFiles` that accepts a stamp only if `lastTool ∈ {find_symbol, impact_analysis, search_code}` and `source !== 'stamp'` | `goal-run.ts`, new `.cursor/hooks/pretool-engine-graph.sh`, `hooks.json` | Fresh worktree, only `cg.mjs stamp` run → `Write` to `CompoundCells.tsx` denied with the impact command in `agent_message`; after `cg.mjs impact …` → allowed. |
| 9 | P1 | Design stamp strictness: `CYCLEFORGE_STAMP_STRICT=1` (set by the unattended rail and optionally by the operator) makes `pretool-ui-design-mcp.sh` reject `source: 'stamp'` and require `lastTool ∈ ds_*`; session-start hooks stop pre-seeding when strict | `pretool-ui-design-mcp.sh`, `session-start-design-mcp.sh`, `session-start-garisek-engineering.sh` | Strict + `ds.mjs stamp` only → deny; strict + `ds.mjs contract` → allow. |
| 10 | P1 | Index freshness as a Host step: on `no match`, one `npx tsx scripts/code-graph-rebuild.ts --name cycleforge-app --max-age-hours 0` (the timer's own script) then re-find; verify `location` prefix against the cohort file | `eval-core.mjs`, `goal-run.ts` | Unit test on a pure `decideFind(matches, expectedFile)` helper: wrong-file match → `{ ok:false, reason:'location' }`; empty → `{ rebuild:true }`. |
| 11 | P1 | Human-section write guard: `preToolUse` denies agent `Write|StrReplace` to `docs/eval/**/LEDGER.md` and `docs/eval/goals/**` (the runner writes with `fs`, not the agent tool); Claude Code gets the same in `.claude/settings.json` | `.cursor/hooks/pretool-ledger-guard.sh`, `hooks.json`, `.claude/settings.json` | Hook stdin with `file_path: docs/eval/cohorts/slot-table/LEDGER.md` → `permission: deny`; `pnpm run eval:cohort slot-table` still patches auto blocks. |
| 12 | P1 | `ds_contract` reads `router.json`: adds `cohort`, `evalCommand`, `refuse[]`; `OVERLAY_COHORT_WORKSPACES` from the same file; tripwire compares the JSON to a fresh emit | `server.mjs`, `tools/design-mcp/router.json`, `scan-station-overlay-cohort.test.ts` | `ds.mjs contract "show keys on the buttons"` → top match `TableStatusBar`, `refuse` non-empty, `evalCommand === 'pnpm run eval:cohort shortcuts'`. |
| 13 | P1 | No-progress exit in `perf-overnight.mjs` (`--max-no-progress`, default 3) and receipts per round via the same writer | `perf-overnight.mjs` | Replay the 2026-09-01 state: the loop would have stopped at round 20 with `reason: 'no-progress'`. |
| 14 | P2 | One behavioural test retires one grep: jsdom-mount `LedgerGridColumnHeader` with `isSortable` false for `select` and true for `thumb`; click each; assert `onSortColumn` fired once, for `thumb` only; delete `headerClickUsesIsSortable` from `SLOT_TABLE_ENGINE_CONTRACT` in the same change; receipt `grep_to_test` | `src/design-system/components/grid/LedgerGridColumnHeader.test.ts`, `slot-table-cohort.ts` | `pnpm run verify` collects the new test (`.test.ts` + jsdom + `createElement`; `.tsx` tests are not collected); contract count drops from 21 to 20; slot-table cohort green. |
| 15 | P2 | One repair-law source: `machine-gate.mjs --print-law`; `buildRepairPrompt` receives `law: string` from the caller (goal-run / hermes-dispatch spawn `--print-law` once); receipts carry `law_hash` | `machine-gate.mjs`, `verify-gate.ts`, `hermes-dispatch.ts` | `verify-gate.test.ts`: prompt contains the printed law verbatim; a mutated law changes `law_hash`. |
| 16 | P2 | Snapshot hygiene: `files_touched` and `hermes-land.ts` staging exclude `docs/eval/**/snapshots/**`; runners also write `latest.json` per cohort (overwritten, untracked) for the Host to read instead of guessing the day | `hermes-land.ts`, `eval-core.mjs` | Land a worktree whose only dirty snapshot files are eval churn → commit touches zero snapshot paths. |
| 17 | P2 | Absence tripwires as ESLint rules scoped to engine files (`no-restricted-syntax` for `type="date"` on compound engine, `showModeRow={false}` on station workspaces, `FilterRefinementBar` import anywhere under `src/components/tables`) | `eslint.config.*` | `verify:fast` (which every host already runs) goes red on the forbidden token; the corresponding grep can then be retired via item 14's rule. |

### D7 status — 2026-09-02 (session claude-code cycleforge-app-31)

Landed in the working tree (uncommitted, like P0). Acceptance as run:

| # | Status | Evidence |
|---|---|---|
| 6 | landed | Garisek `scripts/goal-run.ts` rewritten: hop loop (coder → measure → `nextHopDecision`), typed asks, no-progress exit, runner-infra → `unmeasured`, eval churn excluded from `diffEmpty`, per-eval snapshot logs. `goal-cli.mjs` gained `resolve-eval` / `next-hop` / `classify-output`. Uncommitted goal file → `goal file not committed; commit it` (exit 2); dirty goal on the fixture → `goal file dirty; commit it` (exit 2). Clean-tree dry-run needs a scratch worktree with the whole working tree committed (`scratch/goal-run-acceptance`) because main carries 600+ in-flight files; hop-0 verdict on the fixture (`cfg_data-headers-sortable_2026-09-02T0814`): six predicates green (cohort 69 s, test, discover, station pack 18 s, KEEP ids, router refuse), `files_touched: []`, **`goal already met, nothing to land`**, exit 0, one receipt in the mirror. |
| 7 | landed | `060_loop_block_kinds.sql` applied to the dev DB; `LOOP_BLOCK_DECISIONS` = retry/abandon/approve/reject with a kind↔decision CHECK; `src/lib/loops/ask-payload.ts` (zod, Buzz card); answer route takes typed asks without re-entering ack-build; `BlockedRunPanel` Approve/Reject face. `scripts/check-loop-block-kinds.ts`: second open → same waiting row, raw second insert → 23505, approve flips once, retry on a typed ask → 23514. |
| 8 | landed | `.cursor/hooks/pretool-engine-graph.sh` on router `engineFiles`; `cg.mjs stamp` alone denied, `impact_analysis` / `find_symbol` / `search_code` allowed, stale denied, non-engine + missing router fail open. `pretool-hooks.test.sh` 8 cases. |
| 9 | landed | `CYCLEFORGE_STAMP_STRICT=1` or `.cursor/stamp-strict`: `source: stamp` / non-`ds_*` lastTool denied; session-start hooks stop pre-seeding. 4 cases. |
| 10 | landed | `eval-core.mjs` `graphFindFresh`: empty find → one `code-graph-rebuild.ts --max-age-hours 0` → re-find; location judged only where the cohort places the symbol (`graphExpectedFiles` / station export). `decideFind` unit tests. Live check: real hit ok, wrong file → `location`, unknown symbol → one rebuild (38 s) then `rebuild:true`. |
| 11 | landed | `.cursor/hooks/pretool-ledger-guard.sh` + `.claude/settings.json` inline guard: `docs/eval/**/LEDGER.md`, `docs/eval/goals/**`, `docs/eval/sessions/**` denied on both hosts; snapshots and source allowed. 10 cases. |
| 12 | landed | `router.json` regenerated (was stale: `routes: []`); `ds.mjs contract "show keys on the buttons"` → `TableStatusBar`, cohort `shortcuts`, `pnpm run eval:cohort shortcuts`, 11 refuse ids. `prompt-router.test.ts` compares the file to a fresh emit. |
| 13 | landed | `perf-overnight.mjs --max-no-progress` (default 3), `reason: "no-progress"`, one `cf-session:v1` receipt per round via `session-receipt.ts`, `LOOP_RUN_ID` minted once. Replay of the 2026-09-01 history (`perf-target.test.mjs`): the rule stops at **round 6**, not round 20 — rounds 4–6 already had no floor improvement (log 11:29–11:34); the tail 18–48 would have ended at its third round either way. |
| 14 | landed | `LedgerGridColumnHeader.test.ts` (jsdom + `createElement`, collected by the unit runner): `thumb` click sorts once, `select` never, no `onSortColumn` → nothing. `headerClickUsesIsSortable` deleted from `SLOT_TABLE_ENGINE_CONTRACT`; contract count 28 → 27 on the current tree (the report's 21 predates 2026-09-01 rows). |
| 15 | landed | `machine-gate.mjs --print-law`; `buildRepairPrompt({ law })` uses the printed text verbatim; `repairLawHash`; `hermes-dispatch.ts` prints once per run and logs the hash. |
| 16 | landed | `hermes-land.ts` staging excludes `docs/eval/**/snapshots/**` and `latest.json`; every runner writes `<snapshotsDir>/latest.json` (gitignored). |
| 17 | landed | `eslint.config.mjs` blocks derived from `router.json`: `type="date"` / `variant="range"` on slot-table engine files, `showModeRow={false}` on station workspaces, `FilterRefinementBar` import under tables. Red on each token via `--stdin`, green on the real engine files. |
| §G | landed | Engine in Garisek `tools/design-mcp` (`server.mjs` dispatcher → `project-server.mjs` + `target-engine.mjs`, the lifted Cycle Forge server with every path a field of `design-mcp.profile.json`); cycleforge `server.mjs` is a shim, `.cursor/mcp.json` launches Garisek `run-mcp.sh` with `DESIGN_MCP_PROJECT`. `ds_adjudicate` is back: `rulesFromRouter` turns every `refuse[]` `diffPattern` into an adjudicator rule scoped to the route's `engineFiles`; the same rules gate writes on Claude Code (`adjudicate-hook.mjs`, target-aware) and Cursor (`--cursor`, `.cursor/hooks/pretool-adjudicate.sh`). `no-new-component` not adopted (profile `adjudicator.baseRules`). Both smokes green (Garisek self, cycleforge through the shim). |

Second pass, same day (after the P1/P2/§G table):

| Area | Status | Evidence |
|---|---|---|
| §D2 remaining asks | landed | `goal-run.ts`: `pin.promote` (ds_contract top id not in `pinned.json` after ≥2 green hops; yes → the Host writes the pin, receipt `system_upgrade: pin`), `known_debt.append` (default no; no → hop reverted, run stalled), `cohort.append_row` and `grep.retire` (no → the named file is reverted and the hop re-measured). Detection is the pure `detectHopAsks(diff, filesTouched)` in `goal.ts` (tested); `goal-cli.mjs detect-hop-asks`. `discover.delete_judgment` and `oracle.unavailable` were already routed. Terminal door: Garisek `scripts/loop-answer.ts --run <id> --decision approve\|reject`. |
| §D3 interactive receipts | landed | `tools/eval-ledger/session-receipt-stop.mjs` on the Claude Code `Stop` hook and Cursor `stop` (`stop-session-receipt.sh`): `run_id: null`, `claude-code:<sid>` / `cursor:<id>`, last user prompt from the transcript, routed by `route.mjs`, stamps as oracle evidence, last eval as `eval_runs`; deduped per session on the measurable events (eval / design / graph stamps, never the shared dirty-file list) and throttled to one line per 15 min unless a new eval result arrived; tmp and marker files are keyed by host because Cursor-hosted Claude Code sessions fire both stop hooks. The first cut fingerprinted the dirty tree and wrote 51 lines from peer sessions in twenty minutes; those derived lines were pruned. Exercised on this session: a second Stop with nothing changed wrote nothing; `session-receipt.ts --verify` reports the chain valid. |
| §D6 observability join | landed | `scripts/session-receipt.ts` posts one Langfuse `trace-create` per receipt (`name: cf-session`, `sessionId = run_id`, input = `prompt_expanded`, output = `outcome_sentence`, metadata = eval runs / files / upgrades / law hash / entry hash) with the same ingestion call and keys as `log-coder-trace.mjs`; fail-soft; interactive receipts are not traced. |
| §G.2 item 1 | landed | `docs/eval/goals/perf-tier1-95.goal.json` (`eval:perf-gate --mode=strict` + `verify:fast` + KEEP); `eval:perf-gate` added to `ALLOWED_EVAL_SCRIPT_HEADS`. `perf-overnight.mjs` keeps its Lighthouse measure loop; the goal file is the Host-run form. |
| §B.2 grep → behaviour | 8 retired | slot-table 28 → 21: `headerClickUsesIsSortable` (mounted click), `useSlotTableLayoutExport` / `materializeTracksExport` / `headerSortLawExport` / `toolbarSortListsColumnFacts` (TS imports), `compoundTrackMapsThumb` / `State` / `Amount` (`queueSortForColumnKey('thumb') === 'image'` …). shortcuts: `hookToggle` (import). Each in the same change as its behavioural test. |
| §D7 item 15 in goal-run | landed | goal-run prints the law once and carries `law_hash` on every receipt. |
| Real run (DB, lease, coder worktree) | passed | `cfg_data-headers-sortable_2026-09-02T1604`: worktree `goal-<run>` planted from HEAD, six predicates green, `goal already met, nothing to land`, run row `complete`, one chained `cf:session` step in `loop_run_steps`, one Langfuse `cf-session` trace in that session. A first attempt (`…T1558`) exposed an expected-file heuristic that blocked hop 0 on `oracle.unavailable`; fixed by routing per-symbol expected files through `router.json` `graphExpectedFiles`. |
| Sessions view lists receipts | landed | Garisek `GET /api/sessions/receipts?session=…\|run=…\|session_index=…` merges `loop_run_steps` cf:session rows with every registered target's `docs/eval/sessions/*.jsonl` mirror (`src/lib/loops/session-receipts.ts`, tested); `SessionsPanel` shows each session's receipt sentences with outcome chips and `system_upgrade` under the expanded row, resolving the `session_index` row to `<source>:<sourceRef>`. No Langfuse needed. |
| Linear-born goals mirror asks | landed | `goal-run.ts --issue <id> --composio-user <id>`: every ask is posted as an issue comment (the same card), `land.apply` also accepts the existing `agent:accept` / `agent:iterate` labels as the answer (recorded on the block row as `answeredBy: linear`), and a landed run comments and stamps `agent:landed`. Helpers extracted to `scripts/lib/linear-issue.ts`, shared with `hermes-dispatch.ts`. Not exercised end to end here (needs a live issue + Composio user). |
| Typed ask end to end | passed | Dirty fixture + assumed-green predicates → `land.apply` ask on `loop_run_blocks` (card: files, stat, recommendation), `scripts/loop-answer.ts --decision reject` from the terminal → goal-run exit 1, "worktree kept, no commit", run aborted. |

Runner infrastructure found on the way: pnpm 11's pre-run dependency check exits 1 in one second inside any worktree whose `node_modules` is a planted symlink (every Host coder worktree), which read as a red eval. `resolveEvalCommand` runs the script body, `cursor-eval.mjs` passes `--config.verify-deps-before-run=false`, and `isRunnerInfraFailure` classifies that output as `unmeasured`.

"After this" statements the operator asked for: after item 1 an unattended hop cannot delete a cohort-law `visibility` style and stay green; after item 3 a timeout cannot look like a pass when `LOOP_UNATTENDED=1`; after item 4 a shortcuts edit cannot bypass its cohort; after items 5 and 11 an unattended hop cannot delete a KEEP row or write Operator verdict (KEEP is asserted by `slot-table-discover.test.ts`, which item 6's `kind:'test'` predicate runs by name).

### D8. The same goal through D1–D7

Operator commits `docs/eval/goals/data-headers-sortable.goal.json` and runs `npx tsx scripts/goal-run.ts --goal data-headers-sortable --repo cycleforge-app`. The Host opens `cfg_data-headers-sortable_<ts>`, routes the statement (`slot-table`, symbols `isSlotTableChromeTrack`, `queueSortForColumnKey`, `LedgerGridColumnHeader`, `CompoundItem`; refuse `sortable-false-on-fact`, `new-grid-columns-array`), runs `ds_contract` (top `DataTable`, now carrying `evalCommand` and `refuse`) and four `impact` calls (snapshots recorded), then hop 0: every predicate already green (the 2026-09-02 tripwire log shows `pass 18`), no diff, `outcome: 'pass'`, sentence: "goal-run did slot-table for goal data-headers-sortable because headerSort; eval:cohort slot-table exit 0; pass (goal already met)". The run stops with no ask. If the operator's tree had a dead Image header: hop 1 coder edits `queue-display-sort.ts`; the refuse check finds no `sortable: false`; `eval:cohort slot-table` green; `eval:discover` green; KEEP intact; `land.apply` ask on the phone with the diff stat and the tripwire tail; yes → `hermes-land` applies to `main`, receipt `system_upgrade: []`. If instead the coder had edited `OrdersQueueTableRow.tsx`, the impact snapshot for `CompoundItem` names 19 peers, the router's `engineFiles` do not include that path, and the Host marks the hop `refused` before running eval.

---

## E. How the operator works after this lands (one page)

1. **Set a goal.** Write `docs/eval/goals/<id>.goal.json` (statement in your words, the eval commands that define done, the KEEP ids that must survive, caps). Commit it. Only committed goals run; agents cannot commit, so the file is your signature.
2. **Start the loop.** From Garisek-OS: `npx tsx scripts/goal-run.ts --goal <id> --repo cycleforge-app`. Or arm it from Hermes cron like `linear-poll.ts`. The run id `cfg_<id>_<ts>` appears on the Buzz canvas within a minute. Go to sleep.
3. **Morning: read the receipt list.** Buzz `#loop-feed` shows one line per hop in the form "goal-run did <cohort> for <goal> because <predicate>; <eval> exit <n>; <outcome>". The canvas shows the run's current state and the Langfuse link. `docs/eval/sessions/<month>.jsonl` has the same lines with file lists and snapshot paths, ready for the PR.
4. **Answer the cards.** `GET /api/loops/runs/<runId>/blocks` lists at most one waiting ask. Each card shows: kind, one-sentence summary, diff stat and a 2 KB excerpt, the eval tail, blast radius, and the Host's recommendation. Tap yes or no. Kinds you will see: `land.apply`, `pin.promote`, `discover.delete_judgment`, `cohort.append_row`, `grep.retire`, `goal.stop`, rarely `known_debt.append` (default no) and `oracle.unavailable` (fix the box, then yes).
5. **The loop continues or stops.** Yes on `land.apply` → `hermes-land` applies the worktree to `main` and the goal closes. Yes on a judgment delete → the next hop performs it and shrinks `KNOWN_DEBT`. No → the Host records the refusal in the receipt and either picks the next unblocked gap or stops with `stalled`. Budget, hours, or three no-progress hops → `goal.stop` card; the run never spins.
6. **System upgrades are visible only with a reason.** A new `pinned.json` key, a shorter `KNOWN_DEBT`, a new cohort row, a rebuilt index, or a retired grep appears in the diff only alongside a receipt line `system_upgrade: { kind, target, reason, evidence }` whose evidence is a snapshot path or an ask id you answered. Operator verdict, Open gaps, and Locked wins are yours; the hooks deny agent writes to them, and the Host has no code path that touches them.

What you never have to do: read a transcript to find out what happened, rebuild the graph by hand, run `verify` to learn whether a hop was measured, or wonder whether a green run was a timeout.

---

## F. What this report does not recommend

Each item below was considered and rejected; the section that explains why is noted.

- Reconstructing the deleted house-law constitution. The router and receipts are code and data; prose stays short and cites route ids (§C.1, §D5).
- A new display eval cohort named overlay. The overlay contract is enforced per station; the fix is to execute its tripwire (§D7 item 1), not to revive `eval:cohort overlay`.
- Screenshot baselines as a resume reason. Screenshots stay a human gate on the phone (`hermes-feature-review.ts`); no predicate in §D1 reads a pixel.
- Lowering Lighthouse floors or stripping desk density to hit 95. `PERF_REPAIR_LAW` is unchanged; the only perf change here is a no-progress exit (§D7 item 13).
- Letting the model write Operator verdict. Deny hook plus no Host code path (§D4 step 11, §D7 item 11).
- Standing keycaps or a cheat sheet from staff `?` as improvements. The router returns a refusal with no edit route (§D5).
- `showModeRow={false}` to hide Unbox|Ticket. A refuse `diffPattern` in the composer route (§D5).
- Inventing `pnpm` scripts not in `package.json`. Goal predicates are validated against `scripts` (§D1).
- A second table engine or a second composer mouth. `cohort.append_row` is the only way a new surface enters the system, and it is a human ask (§D2).

---

## G. Ownership decision: engine in Garisek-OS, law in the target repo

Added after the operator asked whether the design oracle and the coding loop should simply live in Garisek-OS, the always-on control plane, instead of being rebuilt per repo.

### G.1 What a second read found

**Two design-mcp servers already exist, born the same day.** cycleforge `3877536a7` and Garisek `a1d6f42`, both 2026-08-25. They share tool names and the README table's rhetoric and almost no code (a symbol-level diff of the two `server.mjs` files overlaps on `json`, `lineOf`, and `REPO_REAL`).

| | cycleforge `tools/design-mcp` (1541 lines) | Garisek `tools/design-mcp` (976 lines) |
|---|---|---|
| Tools | `ds_contract`, `ds_tokens`, `ds_critique` | those three plus `ds_adjudicate`, `ds_compare`, `ds_review_file` |
| Catalog | source walk of `PRIMITIVE_HOMES` (variant axes read from code), pins merged from `pinned.json` | `PINNED_COMPONENTS` in `pinned.ts`, read live through tsx |
| Tokens | parsers over `tailwind.config.mjs` and `src/design-system/tokens/*.ts` (11 axes) | `@theme` block in `globals.css` |
| Enforcement door | Cursor `preToolUse` stamp-freshness check (45 min), pre-seeded at session start; no rule adjudicator by design ("`ds_adjudicate` ... manufactures confidence") | `scripts/guard/adjudicate.mjs`: a pure `RULES[]` over inserted text, wired as a Claude Code `PreToolUse` hook (exit 2 blocks) and as the `ds_adjudicate` tool from the same module: "one rule set, two doors, only one optional" |
| Failure posture | fail-open everywhere | closed on rules, open on infrastructure (documented in `adjudicate-hook.mjs`) |
| Telemetry | none | `.garisek_os_ops/logs/design-guard.jsonl` + `telemetry-report.mjs` |
| Repo targeting | `DESIGN_MCP_REPO` override exists | hardcoded to its own checkout |

**Garisek's telemetry already answers the report's central claim.** `telemetry-report.mjs` on 435 log lines: 214 edits inspected by the hook, 6 blocked (2.8 %), 13 `ds_*` calls to the server, and **zero** edits that were reviewed through the server in the ten minutes before the write. The advisory door is barely used; the hook door does the work. Two files were blocked more than once ("the agent did not learn from the first block"). cycleforge has no equivalent measurement at all.

**The graph is already always-on.** `garisek-code-graph.timer` rebuilds every registered project twice daily (§G8 corrected above). `garisek-linear-poll.timer` and `garisek-loop-resume.timer` fire every five minutes; `garisek-sessions-capture.service` is a resident daemon. The control plane the operator describes is real and running.

### G.2 Decision

1. **The Host is Garisek-OS.** Unchanged from §D4: `scripts/goal-run.ts` lives there and reuses `hermes-dispatch.ts` mechanics. Every coding request that touches cycleforge runs graph find and impact through Garisek's code-graph (already wired: `.cursor/mcp.json` points `code-graph` at Garisek's `run-mcp.sh` with `CODE_GRAPH_PROJECT=cycleforge-app`). `perf-overnight.mjs` is not generalised in place; it becomes a goal file plus a `measure` predicate, and §D7 item 13 shrinks to "retire after goal-run lands".
2. **The design engine is one server in Garisek `tools/design-mcp`, targeting a repo by profile.** Same shape as code-graph: engine in Garisek, project named by `DESIGN_MCP_PROJECT=cycleforge-app` in the target's `.cursor/mcp.json`, launched from Garisek's `run-mcp.sh`, stamps and telemetry written into the target repo's `.cursor/` and ops log (as `cg.mjs` already writes `code-graph-session.json` into the target). The merged engine keeps Garisek's spine (`adjudicate.mjs` `RULES[]`, `adjudicate-hook.mjs`, `telemetry.mjs`, `ds_compare`, `ds_review_file`) and takes cycleforge's loaders (source-walk inventory with variant axes and `pickVariant`, the eleven token-axis parsers, `ds_critique` fork signals) as profile-driven modules rather than hardcoded constants.
3. **The law stays in the target repo.** `pinned.json`, the four cohort modules, the eval runners, `docs/eval/goals/`, the generated `router.json` (§D5), and a new `design-mcp.profile.json` (`primitiveHomes`, `shadcnFiles`, `tokenSources`, `cohortWorkspaces`, `triageLayoutFiles`) do not move. Reasons: the cohorts import product modules (`PRODUCT_TABLES`, `TABLE_COLUMNS`, `SLOT_LAYOUT_TABLES`) and only run under the product's `tsconfig` and `node_modules`; a pin or a cohort row must land in the same PR as the code it governs, which a cross-repo file cannot; and Garisek's own doctrine in `anchor-authority.ts` and `repo-manifests.ts` is that only the target repo knows its real scripts and landmarks. The engine reads the law by path; it never owns it.
4. **cycleforge's refuse rules become adjudicator rules.** Each `router.json` `refuse[]` entry with a `diffPattern` maps onto Garisek's `RULES[]` shape (`appliesTo` from the route's `engineFiles`, `test` from `diffPattern`, `message` from `why`, `fix` from the mount). That gives cycleforge the hard door it lacks on Claude Code and the Hermes coder seat, from one rule module, on both hosts. §D7 item 9 (strict stamps) becomes secondary: stamps remain receipts of oracle calls (`oracles_called` in §D3), not the gate.
5. **Both doors ship from one script.** cycleforge's gate is Cursor-only; Garisek's is wired for Claude Code. The merged engine registers the same hook script under `.cursor/hooks.json` `preToolUse` and `.claude/settings.json` `PreToolUse`, keeping Garisek's posture: closed on rules, open on infrastructure, logged either way.
6. **Order.** §D7 items 1 through 5 first; they are runner fixes and are independent of where the engine lives. The consolidation is its own goal file after that. Entangling them would block the P0 fixes behind a refactor of roughly 900 lines of loader code.

### G.3 What this does not change

- Garisek-OS stays single-user and deploy-disabled; a stdio oracle spawned per session is supplier-side tooling, not hosted multi-tenant runtime, so the constraint recorded on 2026-08-22 does not apply.
- `ds_adjudicate` returns to cycleforge only because it now has a shared enforcer; the 2026-08-30 objection was to a verdict tool with none.
- Garisek's `no-new-component` rule is not adopted for cycleforge unmodified; its escape ("the operator adds the file") is the `cohort.append_row` ask in §D2, and the profile decides which paths it applies to.

---

## Appendix: measurements quoted in this report

| Measurement | Value | Source |
|---|---|---|
| Graph index | status `ready`, built 2026-09-02T00:01:02Z, 7016 files, 37796 nodes, 176479 edges | `cg.mjs stats` |
| `find isSlotTableChromeTrack` | one match, `function:src/lib/tables/slot-table-header-sort.ts:isSlotTableChromeTrack` | `cg.mjs find` |
| slot-table tripwire | 18 tests, 18 pass | `2026-09-02-tripwire.log` |
| shortcuts tripwire | 10 tests, 10 pass; LEDGER engine-contract shows 6 FAIL; runner `ok: true` | `2026-09-02-tripwire.log`, `LEDGER.md` |
| Discover | `delete: []`, judgment 3, `unexpected: []`, `staleKnownDebt: []` | `2026-09-02-discover.json` |
| `eval-session.json` | `{ok, source, lastCommand, mode, exitCode, durationMs, repo, updatedAt, updatedMs}`; last fast verify 9.6 s (2026-09-02) and 87.8 s (committed 2026-09-01 snapshot) | `.cursor/eval-session.json`, `docs/eval/cohorts/machine-gate/snapshots/` |
| Dirty tree at session start | 307 paths, mostly `docs/eval/**` snapshots and LEDGER auto blocks | `git status --porcelain` |
| perf-overnight last run | 48 rounds, 5 wins, `reason: max-rounds`, rounds 18–48 all `/test:performance:6` | `.cursor/perf-overnight-state.json` |
| `pinned.json` | 54 keys incl. `_README` | `python3 -c json.load` |
| Claude Code transcripts for this project | 113 `.jsonl` files | `~/.claude/projects/-home-michaelgarisek-Projects-cycleforge-app/` |
| `ds_contract` on five prompts | only "put a date in the cell" returns `pickVariant` + `mount` | `ds.mjs contract` (§A.1 table) |
| Cursor stop timeout handling | exit 124 / 75 / "timed out after" → `{}` | `stop-eval-gate.sh`, test case 7 |
| Hermes handling of machine-gate 124 | ordinary red → repair hop | `hermes-dispatch.ts` verify block, `verify-gate.ts` `shouldRetryVerify` |
| `eval:station` tripwire execution | none; rendered as a list | `eval-core.mjs` `evalStationPass` |
| `verify:fast` gates | Lint + Typecheck; unit tests are `full` only | `scripts/verify-profile.mjs` |
| Code-graph rebuild schedule | twice daily 03:40 / 15:40, `Persistent=true`, last ran 15:48 on 2026-09-01 | `garisek-code-graph.timer`, `list-timers` |
| Garisek design-guard telemetry | 435 lines; 214 inspected edits; 6 blocked; 13 `ds_*` calls; 0 reviewed-first edits | `node scripts/guard/telemetry-report.mjs` |
| Two design-mcp servers | cycleforge 1541 lines / 3 tools; Garisek 976 lines / 6 tools; both first committed 2026-08-25 | `git log`, `wc -l` |
