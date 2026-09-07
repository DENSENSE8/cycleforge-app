# Lane harness — handoff brief

**Purpose of this document.** A clean, self-contained brief for a fresh session that will
build out the lane harness. It contains no feature work and no prior conversation. Everything
below the "Verified inventory" heading was read off this machine and this repo, not inferred.

**One-line description of what is being built:**

> Per-feature ephemeral preview environments, each with a paired Neon database branch and a
> human promotion gate, so a single operator verifies exactly one feature at a time and only
> verified features reach `main`.

---

## 1. The problem this solves

Several AI agents write into one checkout that one `next dev` server compiles on one port
against one database. All three are shared mutable resources, so:

- **One module graph.** Any agent's write invalidates the compiler for everyone. A rebuild
  triggered by agent B can compile agent A's file *mid-edit*; React's error boundary then
  swallows the tree and the screen shows a stale render, not the new code. Observed:
  `ReferenceError: pulseAge is not defined`, `ReferenceError: AI_CHAT_SESSIONS_CHANGED_EVENT
  is not defined`, both from half-written files compiled by a foreign rebuild.
- **One port.** Two supervisors that both believe they own `:3050` produce `EADDRINUSE`,
  `exit 143`, and silent takeovers. Observed four times in one evening.
- **One database.** An unapplied migration in agent B's working tree returns
  `column "organization_id" does not exist` from `withAuth` → the root layout throws → **every
  route** 500s in every tree. Observed twice in one evening (`roles_per_org`, then
  `ai_chat_sessions.deleted_at`).

Net effect: you cannot verify a feature, because what is on screen is not what any single
agent wrote.

## 2. Industry standard for this exact shape

The pattern has a name and a stable vocabulary. Use it when describing the system:

| Concept | Industry term | Who does it this way |
|---|---|---|
| One isolated running copy per feature | **preview environment** / **ephemeral environment** / **review app** | Vercel preview deployments, Heroku Review Apps, Netlify Deploy Previews |
| One isolated schema per feature | **database branching** (copy-on-write) | Neon, PlanetScale, Supabase branching |
| Human sign-off before merge | **promotion gate** / **manual approval gate** | GitHub environments with required reviewers, Argo CD sync windows |
| Many checkouts of one repo, no clones | **`git worktree`** per feature branch | Linux kernel, Chromium, most large monorepos |

For a **one-person, AI-agent-driven** shop the standard collapses to a specific answer:

1. **Worktrees are free; servers are not.** A worktree is files on disk. Run **one** dev
   server at a time — the lane you are looking at — and let every other agent verify
   headlessly (typecheck + unit tests + static detectors, no server, no port, no browser).
2. **One database branch per lane.** Copy-on-write branches make schema isolation cost
   roughly nothing, which is what removes the "another agent's migration blanked my screen"
   class of failure entirely.
3. **The gate is a recorded human verdict bound to a commit SHA.** Not a checkbox, not a
   label. A verdict against `a1b2c3d` is invalidated automatically by the next commit, which
   is what prevents half-verified branches from landing.

## 3. Verified inventory — what already exists in this repo

Do not rebuild any of this. It works.

### `scripts/lane.mjs` (`pnpm lane …`)

Subcommands: `status | ls | list`, `new`, `up`, `down`, `land`, `rm | remove`, `doctor`.

A lane derives everything from its name:

```
name        packed-pie
worktree    ~/Projects/cycleforge-lanes/packed-pie     (DETACHED at main — never a branch)
port        3071                                        (allocatePort(), PORT_MIN base)
metrics     20301                                       (METRICS_BASE 20300 + offset)
hostname    packed-pie.michaelgarisek.com               (cloudflared tunnel lane-packed-pie)
units       cycleforge-lane@packed-pie.service
            cycleforge-lane-tunnel@packed-pie.service
registry    ~/.config/cycleforge/lanes/packed-pie.env   ← systemd EnvironmentFile, the SoT
```

Existing registry contents (real file, `loop-review.env`):

```
LANE_NAME=loop-review
LANE_PORT=3073
LANE_METRICS_PORT=20302
LANE_HOST=loop-review.michaelgarisek.com
LANE_TUNNEL=lane-loop-review
LANE_REF=main
LANE_BASE=ff75d7bef812791dbba3535dc6136aa7055f8c95
LANE_DIR=/home/michaelgarisek/Projects/cycleforge-lanes/loop-review
LANE_CREATED=2026-08-28
```

`lane land <name>` runs `pnpm run verify:fast` against the merge result, then fast-forwards
`main` onto the lane commit — no branch, no merge commit. `--no-verify` skips the check.

House rule from `AGENTS.md`: **never create a git branch.** A lane worktree is detached at
`main`. Honour this; the harness is branch-free by design.

### `src/lib/neon/branches.ts`

Neon control-plane client for copy-on-write branches, already written and dep-injected
(`fetchFn` / `env` / `now`) so it unit-tests with zero network. Test:
`pnpm test:neon-branches`.

Exports: `NEON_API_BASE`, `VERIFY_BRANCH_PREFIX` (`'verify/'`),
`VERIFY_BRANCH_TTL_MINUTES`, `NeonBranchDeps`, `defaultNeonBranchDeps`,
`neonEndpointIdentity`, `assertNotProductionUrl`, `VerifyBranch`, `createVerifyBranch`,
`deleteBranch`, `listVerifyBranches`, `sweepExpiredVerifyBranches`.

Env it reads: `NEON_API_KEY`, `NEON_PROJECT_ID`, `DATABASE_URL`.

`assertNotProductionUrl` exists specifically so a verify run can never point at production.
Reuse it in the lane path.

### Database

Neon, single project. `.env` carries the pooled + unpooled pair:
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGHOST_UNPOOLED`, `POSTGRES_URL_NO_SSL`
(endpoint `ep-shiny-hall-adz0n0nu`).

Migrations: `pnpm db:migrate` (`scripts/run-pending-migrations.mjs`), tracked, each file
transactional, `pnpm db:migrate:dry` lists pending.

### Measured costs on this machine

| Thing | Cost |
|---|---|
| `next-server` (Turbopack, `cpus: 1` in `next.config.ts`) | **678 MB** and **1675 MB** for the two instances observed |
| Total RAM | 62 GB, ~31 GB free |
| `node_modules` | 4.8 GB real / 5.5 GB apparent |
| pnpm content-addressable store | 3.8 GB at `~/.local/share/pnpm/store/v11` |
| Extra worktree + `pnpm install` | ≈ 0 additional real bytes (hardlinks from the store) |
| `cp -al node_modules` into a worktree | 11 seconds, no meaningful disk |
| Worktrees currently registered | **32** (most stale `goal-cfg_*` / `loop-ack_*` from 2026-09-04) |
| Lane units currently running | 1 (`cycleforge-lane@mobile-arrival.service`) |

⚠️ **Do not symlink `node_modules` into a worktree.** Turbopack panics with
`Symlink [project]/node_modules is invalid, it points out of the filesystem root`. Use
`pnpm install` or `cp -al`.

---

## 4. The three gaps to close

### Gap 1 — a lane has no database of its own (highest value)

`grep -i database_url scripts/lane.mjs` returns nothing. Every lane and `:3050` share one
Neon database, which is the root cause of the cross-agent blackouts above.

**Change.** `lane new`:
1. create Neon branch `lane/<name>` from the project's default branch (extend
   `branches.ts` with a `LANE_BRANCH_PREFIX = 'lane/'` alongside the existing `verify/`,
   reusing `createVerifyBranch`'s shape and `assertNotProductionUrl`),
2. write the branch's pooled + unpooled connection strings into the lane's registry file as
   `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGHOST_UNPOOLED`,
3. record `LANE_NEON_BRANCH_ID` / `LANE_NEON_BRANCH_NAME` for teardown.

`lane rm` deletes the branch via `deleteBranch`. `lane doctor` reports orphan `lane/*`
branches with no registry file.

**Why no new plumbing is needed:** the registry file is already a systemd `EnvironmentFile`,
so the lane's Next process picks the new `DATABASE_URL` up on start. Nothing else changes.

**Result:** an agent can run `pnpm db:migrate` inside its lane and the blast radius is that
lane. Schema work stops being a global outage.

### Gap 2 — nothing enforces one server at a time

**Change.** In `cmdUp`: stop every other `cycleforge-lane@*.service` before starting the
requested one, unless `--parallel` is passed. `lane status` marks which single lane is live.

**Result:** RAM ceiling is one `next-server` ≈ **1 GB**, independent of how many agents are
working, because stopped lanes cost only disk. Verification becomes a queue, which is the
"one feature under my eye at a time" property.

### Gap 3 — there is no human gate

`lane land` today runs `verify:fast` and fast-forwards. A machine check is not a verified
feature.

**Change.**

```
pnpm lane verify <name>    # records into <name>.env:
                           #   LANE_VERIFIED_SHA=<lane HEAD at the moment of verdict>
                           #   LANE_VERIFIED_BY=<operator>
                           #   LANE_VERIFIED_AT=<iso8601>
pnpm lane land <name>      # REFUSES unless LANE_VERIFIED_SHA === current lane HEAD
                           # (--force to override, loudly)
```

Binding the verdict to a SHA is the whole mechanism: any commit after you looked invalidates
the approval automatically, so a half-built lane cannot land. Add `lane unverify <name>` for
an explicit retraction.

**Result:** `main` accumulates only features a human looked at, at the exact commit they
looked at.

---

## 5. The harness web (`/dev/lanes`)

A page in the main app, **not** a service — it adds no RAM. Server-side it reads
`~/.config/cycleforge/lanes/*.env`, runs `git -C <LANE_DIR> rev-parse HEAD`, queries
`systemctl --user is-active` per unit, and lists Neon `lane/*` branches.

One row per lane:

| lane | HEAD | Neon branch | gate | unit | link |
|---|---|---|---|---|---|
| `packed-pie` | `a1b2c3d` | `lane/packed-pie` | verified @`a1b2c3d` | stopped | packed-pie.michaelgarisek.com |
| `mobile-arrival` | `d4e5f6a` | `lane/mobile-arrival` | **stale** — verified @`9f0e720` | running | mobile-arrival.michaelgarisek.com |

Two actions per row: **Up** (stops the others) and **Verify** (records SHA + operator).
Gate the route to localhost or the design-lab org; it shells out to `lane`, so it must not be
publicly reachable.

This is the "eye distillation" surface: look at one lane, press Verify, press Up on the next.

---

## 6. Agent policy to add to `AGENTS.md`

1. Agents **never** start a dev server and **never** touch `:3050`.
2. An agent works in exactly one lane worktree, given by name.
3. An agent's own verification is serverless and fast:
   `npx tsc -p tsconfig.json --noEmit`, the relevant `node --import tsx --test` files, and
   `node .hermes/skills/impeccable/scripts/detect.mjs --json <changed files>`. All three run
   in seconds and need no port.
4. Schema changes run `pnpm db:migrate` **inside the lane** (its own Neon branch) and are
   announced in the handoff, never applied to a shared database.
5. When an agent wants eyes it reports: lane name, what to look at, and what it verified. It
   does not declare the feature done — only `lane verify` does that.

## 7. Suggested build order

1. **Gap 1** — Neon branch per lane (`lane.mjs` + `branches.ts` extension + tests in the
   existing dep-injected style). Removes the failure class that costs the most time.
2. **Gap 2** — one-lane-up enforcement in `cmdUp`. Ten lines, caps RAM.
3. **Gap 3** — `lane verify` / `lane unverify` + SHA gate in `cmdLand`.
4. **`/dev/lanes` board** on top of 1–3.
5. **Housekeeping** — `git worktree prune`, then delete the stale `goal-cfg_*`, `loop-ack_*`
   and `/var/tmp/cycleforge-ci/*` worktrees so `lane status` is the only list that matters.

## 8. Acceptance criteria for the finished harness

- `pnpm lane new x` yields a worktree, a port, a hostname, **and** a Neon branch, with the
  connection strings in `x.env`; `pnpm db:migrate` inside the lane does not affect `:3050`.
- `pnpm lane up x` leaves exactly one `cycleforge-lane@*` unit active; RSS of Node on the box
  stays around 1 GB.
- `pnpm lane land x` refuses with a clear message when the lane has commits newer than
  `LANE_VERIFIED_SHA`, and succeeds immediately after `pnpm lane verify x`.
- `pnpm lane rm x` leaves no Neon `lane/x` branch, no unit, no registry file, no worktree.
- `/dev/lanes` shows every lane's HEAD, gate state, and live unit, with working Up and Verify.
- `pnpm lane doctor` reports drift: orphan Neon branches, registry files without worktrees,
  units without registry files.
