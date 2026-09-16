# HANDOFF — switchboard: one-click "Clear cache & restart dev server"

**For:** a fresh-context coding agent (paste this whole file as the prompt).
**Written:** 2026-09-14. **Status:** LANDED 2026-09-14 — see "What landed" at the
bottom for the as-built notes, the two deviations and the verification evidence.

---

## Mission (one line)

Add a **"Clear cache & restart"** action, per switch target, to the worktree switcher board
(`GET /__switch`) — backed by ONE implementation the board and any CLI both call, so a suspect
Turbopack cache is a click instead of a remembered `rm -rf` plus a `systemctl` incantation.

## Topology — ONE origin, ONE dev server at a time (operator correction, 2026-09-12 change)

This supersedes any per-lane-URL model in older docs (including the first draft of this handoff,
which was wrong):

- **Every URL is `:3050`** — `localhost:3050`, the tailnet address, `usav-dev.michaelgarisek.com`.
  All three hit `garisek-switchboard.service`
  (`~/Projects/Garisek-OS/scripts/switchboard/server.ts`, `SWITCHBOARD_PORT=3050`, active).
- **The switchboard proxies to whichever worktree the pointer file names.** Pointer:
  `~/.config/cycleforge/switch` (`SWITCH_POINTER` in
  `~/Projects/Garisek-OS/src/lib/system/servers/lanes.ts`). It held `3077` at the time of writing —
  i.e. `:3050` was serving `~/Projects/cycleforge-lanes/prod`.
- **One target runs at a time** (a small warm set aside — `WARM_MAX_DEFAULT = 2`, ceiling 3, in
  `src/lib/system/servers/switch-exclusive.ts`). `POST /__switch` writes the pointer and leaves
  exactly one target up: `bringUpExclusively()` + `planExclusive()`. Per-lane ports (3071–3089) and
  the main checkout's `:3070` are **internals of that proxy, not URLs an operator types**.
- Targets come from `switchTargets()` (reads `~/.config/cycleforge/lanes/*.env`); a lane target maps
  to unit `cycleforge-lane@<name>.service` via `laneNameOf(targetId)`, and target #0 (main checkout,
  `~/Projects/cycleforge-app`, `:3070`) is `cycleforge-dev.service`.

**Consequence for this work:** "restart the dev server" means *restart the target the pointer names*
(or a named target), then let the switchboard keep serving `:3050`. There is no second URL to visit
and no port for the operator to learn.

## Why this exists (the incident)

2026-09-14: a Daily-desk change was reviewed at `localhost:3050` and painted stale (missing
slot-table icon). The code and the pointer were both correct — the dev server's cache/HMR state was
not. The operator's diagnosis was right ("just a problem with my dev server"), and the fix — clear
cache, restart — had no affordance anywhere near the board they were already looking at.

The server file already knows this class of failure: `watchUpstream()` reloads open tabs on an
upstream restart because "a tab that was open across a restart keeps the old build's chunks and RSC
payload", and `warmTargets()` carries a note that switching mid-compile "has already corrupted a
Turbopack cache once". This action is the missing manual lever for exactly those states.

## Ground truth you inherit (verified 2026-09-14 — do not re-derive)

1. **Board** = `GET /__switch` in `scripts/switchboard/server.ts` (~1550 lines; picker HTML is
   inlined, phone-usable). Existing endpoints: `POST /__switch` (switch), `GET /__switch/state`,
   `POST /__switch/start`, `POST /__switch/pin`, `GET /__switch/targets`, `POST /__switch/tunnel`,
   `GET /__switch/stream` (SSE → `broadcast()` pushes pointer changes to every open device).
2. **Lifecycle helpers already there:** `bringUpExclusively()`, `unitActive(unit)`,
   `warmTargets()`, `listeners`/`watchUpstream()` (pid-change detection), `headSha`/`dirtyCount`/
   `behindMain` for the row badges. Reuse them; do not add a second systemctl call path.
3. **Units:** `cycleforge-lane@<name>.service` (template `ops/systemd/cycleforge-lane@.service` in
   the cycleforge repo: `WorkingDirectory=%h/Projects/cycleforge-lanes/%i`,
   `ExecStart=… next dev --turbopack -p ${LANE_PORT}`, `Restart=always`,
   `KillMode=control-group`, `TimeoutStartSec=300`) and `cycleforge-dev.service` for the main
   checkout. `Restart=always` means a bare `stop` is honoured, but never leave a target stopped that
   the pointer names.
4. **Cache, precisely:** Next 16 + Turbopack writes `<worktree>/.next` (incl. `.next/cache`);
   `<worktree>/node_modules/.cache` may exist. Neither is source. `node_modules` is **not** cache.
5. **Worktrees:** lanes at `~/Projects/cycleforge-lanes/<name>`, main at `~/Projects/cycleforge-app`.
   `pnpm lane`/`pnpm lanes` (cycleforge repo, `scripts/lane.mjs`) still manage lane creation and
   units; its `cmdStatus` table prints ports because it is the plumbing view, not the operator URL.

## Phase 1 — the one implementation

Add a single async routine next to `bringUpExclusively()` (same module, so it shares
`execFileAsync`, `unitActive`, logging and the SSE broadcast):

```
clearCacheAndRestart({ targetId, clearCache })
```

Order is load-bearing:

1. Resolve the target through `switchTargets()` / `laneNameOf()`. Unknown id ⇒ 404 with the id
   echoed; never fall back to "the current pointer" (a mis-click must not restart something else).
2. **Stop the unit first** (`systemctl --user stop <unit>`). Deleting `.next` under a running
   compiler is how a cache gets half-cleared — the failure this action exists to fix.
3. With `clearCache`: delete `<worktree>/.next` and `<worktree>/node_modules/.cache` only. Resolve
   the worktree from the target (never string-concatenate a user value), assert the path is inside
   `~/Projects/cycleforge-lanes/` or is `~/Projects/cycleforge-app`, and assert the deleted leaf is
   `.next` or `node_modules/.cache`. Report each path + freed size in the response.
4. Start the unit again and **wait for readiness**: poll the target port until it accepts a
   connection (cold Turbopack start after a clear is slow — allow ~180s), then return. A response
   that lands before the upstream answers is what makes an operator distrust the button.
5. Let `watchUpstream()` do the tab reload — it already observes the pid change and reloads open
   tabs. Do not hand-roll a second reload; do `broadcast()` state so every device's row updates.
6. Do not touch the pointer, the pin, or the warm set. Restarting is not switching.

Expose it as **`POST /__switch/restart`** with `{ id, clearCache?: boolean }`, alongside the existing
`/__switch/start` (which only starts a stopped target — keep it unchanged). Return
`{ ok, id, port, cleared: string[], freedBytes, readyMs }` or a non-2xx with the systemd/journal tail.

## Phase 2 — the click

In the inlined `/__switch` picker HTML, per target row:

- **Restart** and **Clear cache & restart** as two distinct controls — never one button whose meaning
  depends on a modifier key. Mark the destructive one; no confirm dialog for a cache delete (it is
  recoverable by definition), but the row must name what it deletes on hover/aria.
- Live phase while it runs (`stopping → clearing → starting → ready`), sourced from the endpoint's
  own progress, not a timer. Phone-usable: the picker is opened from the phone, so touch targets stay
  ≥44px and the row must not reflow as phases change.
- On failure show the exit status plus `journalctl --user -u <unit> -n 50`.
- Buttons stay live for a target that is **not** the pointer (fixing a cold lane before switching to
  it is the common case), and the pointed-at row makes clear that `:3050` will blink during restart.

## Hard rules

- The board owns no second lifecycle path: every start/stop goes through the helpers in
  `scripts/switchboard/server.ts` / `switch-exclusive.ts`.
- No `rm -rf` from an unvalidated string (see Phase 1 step 3). Never delete `node_modules`, `.git`,
  `.env*`, or anything outside the resolved worktree.
- Never kill by pattern (`pkill next`) — units own their process trees (`KillMode=control-group`).
- Do not change pointer/pin/warm semantics, `POST /__switch`, or `planExclusive()`.
- `:3000` (buzz-relay) and `~/CycleForge` / `~/Projects/CycleForge` (a different app on `:3001`) are
  unrelated — out of bounds.
- Restarting the main checkout target (`cycleforge-dev.service`) is allowed **only** as an explicit
  `id` from the board; nothing may restart it implicitly.

## Acceptance (operator-verifiable, in this order)

1. Open `localhost:3050/__switch`: every target row shows **Restart** and **Clear cache & restart**.
2. Click **Restart** on the pointed-at target (`3077` at time of writing): the row goes
   `stopping → starting → ready`, `localhost:3050` serves the same worktree again, open tabs reload
   themselves, and no pointer/pin change appears in `~/.config/cycleforge/switch`.
3. Click **Clear cache & restart** on that target: `~/Projects/cycleforge-lanes/prod/.next` is gone
   during the run and rebuilt after; the response reports freed bytes; first load is visibly slower;
   the stale paint from the incident is gone.
4. Click **Clear cache & restart** on a target that is NOT the pointer: it comes up warm, `:3050`
   keeps serving the pointed-at worktree throughout.
5. Force a failure (rename a worktree, click the button): non-2xx, the row shows the journal tail,
   and the switchboard itself stays up.
6. From the phone, on the same `/__switch` page: both controls are tappable and the row does not
   reflow mid-run.
7. This is ops tooling in Garisek-OS — **do not** run the cycleforge `verify`/lint/eval chain for it.
   If you find yourself editing anything under `cycleforge-lanes/*/src/`, you have left the scope.

## Non-goals

- No new switch targets, no port reallocation, no tunnel/ingress changes.
- No `pnpm install` step ("clear cache" ≠ "reinstall dependencies").
- No auto-clear on switch (the warm-set note explains why mid-compile churn is its own risk) — this
  is a manual lever the operator aims.
- No changes to the Daily desk or any app code; the work that surfaced this is already landed.

---

## What landed (2026-09-14, as-built)

All of it is in `~/Projects/Garisek-OS` — `scripts/switchboard/server.ts` plus one
stale comment in `src/lib/system/servers/lanes.ts`. No file under
`cycleforge-lanes/*/src/` was touched, and the cycleforge `verify`/lint/eval chain
was not run (acceptance 7). Garisek-OS's own `tsc -p tsconfig.json` and `eslint`
are clean on the changed files; `lane-number.test.ts` passes (`npx tsx --test`).

**Phase 1.** `clearCacheAndRestart(target, clearCache)` beside `bringUpExclusively()`,
exposed as `POST /__switch/restart` `{ id, clearCache? }` with `GET /__switch/restart?id=`
as the live phase feed. Stop → (clear) → start → poll the port to readiness, 180 s
budget. Unknown id is a 404 with the id echoed, never a fallback to the pointer.
The cache delete resolves the worktree from the registry and then asserts it is
main's checkout or a DIRECT child of `~/Projects/cycleforge-lanes/`, and re-derives
each leaf after joining, so only `.next` and `node_modules/.cache` can ever go.
Pointer, pin and warm set are untouched.

**Why not the lane CLI, on the record.** `lane down` is `systemctl disable --now`
(it un-enables the unit) and `lane up` evicts every other live lane. Neither means
"restart", so this is the one place that calls `systemctl stop`/`start` on a lane
unit directly — on the unit it was handed, and nothing else.

**Phase 2.** Two separate controls per row, never one button with a modifier.
Phases come from the server's job record, not a timer. The destructive control is
amber and names what it deletes in `title` + `aria-label`; the live row says
localhost:3050 will blink. Failures render the exit reason plus the journal tail
inside the row that produced it, as `textContent`.

### Deviations from the plan above, and why

1. **No `port` in any new response.** The plan's §1 shape included `port`; the
   operator-facing port cut (below) makes it noise, and readiness already proves
   what the port was for. The response is
   `{ ok, id, unit, cleared, freedBytes, readyMs, error, journal }`.
2. **The picker now stacks at phone width** (`@media (max-width:560px)`). Measured
   at 390 px: name + subject + meta + two 44 px controls on one line squeezed the
   name/subject column to ~100 px, so lane names wrapped mid-word and commit
   subjects truncated to nothing — and the run message re-wrapped 3 lines → 1 as it
   finished, moving the buttons. Acceptance 6 could not be met without it.

### The port cut (operator instruction, same sitting)

"Remove the localhost ports — everything is under 3050." Struck from every
operator-facing surface: the row's `:PORT` meta column, the search placeholder and
haystack, the two-warm-servers banner, the badge/starting-page/state name fallbacks
(now `unknown worktree`), and the `/__switch/start` and `bringUpExclusively`
messages. `SwitchRow.port` is deleted outright — nothing consumed it. `grep` of the
rendered page for `:307x` returns nothing.

KEPT on purpose, because they are plumbing and not something an operator types:
the proxy's own `PORT`/`LEGACY_PORTS`, `target.port` for proxying and readiness,
`x-switch-target` (`lanes.ts` already says nothing should ever print it), the
`warm[].port` entries in `GET /__switch/state` (a TUI labels panes from that
payload), and journal lines. `lane status` keeps its port column — it is the
plumbing view, per §"Ground truth" 5.

### Verification evidence (measured, in the plan's order)

1. `GET /__switch` — 8 rows, 8 `Restart` + 8 `Clear cache & restart`, both 44 px
   tall at 390 px, no `:30xx` anywhere in the rendered text.
2. `Restart` on the pointed-at target (`lane-prod`): 200, phases
   `stopping → starting → ready`, 2.1 s, `:3050` still `x-switch-lane: lane-prod`,
   pointer `3077` and pin `lane-prod` unchanged. An open tab at `:3050` reloaded
   itself (3 navigations, driven by the existing `watchUpstream` pid change).
3. `Clear cache & restart` on it: 200, cleared `.next` + `node_modules/.cache`,
   `freedBytes: 5183684856` (4.8 GB), `.next` observed ABSENT mid-run and rebuilt
   on the next request.
4. `Clear cache & restart` on `lane-ui` (NOT the pointer): 200, freed 1.7 GB, came
   up warm; `:3050` served `lane-prod` for every sample throughout; pointer 3077.
5. Forced failure — a throwaway registry entry naming a worktree that does not
   exist: 500, `cycleforge-lane@zz-broken.service stopped while starting`, 6-line
   journal tail naming `status=200/CHDIR`, switchboard still serving. Fixture
   removed, `reset-failed` run.
6. At 390 px: both controls tappable (64×44, 136×44), row height 180 → 180 → 179
   across `stopping… → starting… → ready`.

### One hazard worth knowing

The whole picker is ONE template literal. A backtick inside a CSS comment ends it
and the remainder parses as expressions, so it TYPECHECKS and only fails at the
first request — it took this service down twice in this sitting. There is now a
`NO BACKTICKS BELOW THIS LINE` banner above `switchPage()`.

### Left alone, deliberately

`SwitchResult.port` in `src/lib/system/servers/switch.ts` still carries a port into
the app's Work place. That is a different surface from this board; if the port cut
should reach it, that is its own pass.
