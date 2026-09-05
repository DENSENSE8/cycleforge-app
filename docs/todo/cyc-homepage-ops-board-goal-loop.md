# Homepage ops board goal loop

**Provenance.** The original SoT path was `/workspace/cyc-homepage-ops-board-goal-loop.md`. That file is not in this repo, not under `/workspace`, and not in Grok Bot notes on this machine. Linear MCP was unauthenticated. This copy is reconstructed from the 2026-09-04 operator paste that launched Phase A. Anything the paste did not name is marked UNKNOWN.

**This run.** All remaining phases. Original `/workspace/` file is still missing. Phases C–E below are reconstructed from the Phase A spike plus the operator paste (Zoho job, Cycle Forge chrome). Linear MCP still needs auth. Ticket ids stay UNKNOWN.

## Locks

- Linear stays task SoT. Link tickets. Do not clone them into this repo.
- Reuse Shipping / To-ship selection and row actions. Do not fork them.
- Impeccable is visual polish only. It is not a click meter. Do not run Keygraph Shannon.
- Do not steal CYC-82 OM ingest. Do not build Packing or Testing.

## Phases

| Phase | Job | Status |
|---|---|---|
| A | Investigation spike. Reusable shipping/action components. Staff directory gaps. Schema UNKNOWN marked. `decisions.tsv` started. Next paste named. No product UI. | done |
| B | Slot-table bugs. Discover DELETE = 0. `eval:cohort slot-table` green. Do not touch JUDGMENT rows. | this run |
| C | Home Tasks uses To-ship gutter + row actions. Create project, add task, change status, assign a coworker in this org. No Zoho board. No right-rail inspector. | after B |
| D | Staff directory and project roster. Assign from org `getActiveStaff()`, not USAV name lists. Project members via `ops_plan_members` when present. | after C |
| E | Impeccable visual polish only. No Shannon. No Lighthouse floor drop. | after D |

## Phase A done

- Short spike note at `docs/todo/homepage-ops-board-phase-a-SPIKE.md`
- Decision trail at `docs/todo/homepage-ops-board-phase-a/decisions.tsv`
- Explicit next paste is Phase B or Phase C per this file
- No product UI ship

## Phase B done

- Note at `docs/todo/homepage-ops-board-phase-b.md`
- Discover mechanical DELETE = 0
- `eval:cohort slot-table -- --skip-verify` `ok: true`

## Phase C done

- Note at `docs/todo/homepage-ops-board-phase-c.md`
- Live desk at `http://localhost:3050/?mode=tasks` on dirty main
- Playwright: add task, Assign Packer paints on the row, Morphing on the table

## Phase D done

- Note at `docs/todo/homepage-ops-board-phase-d.md`
- People POST QA Shipper 201 onto plan `da30e8be-d12d-426c-9b01-7d613c2e7588`

## Phase E skipped

- Note at `docs/todo/homepage-ops-board-phase-e.md`
- No Impeccable pass; no Shannon; lighthouse floors unchanged

## Next paste

None. A–E closed. Do not commit dirty main product unless asked.
