# Portfolio SoT — Plans · Worktrees · Review

> **Living hub** for the messy `docs/**` surface: one catalog that attaches every
> open plan to a **lane** (main dogfood vs topic worktree), a **phase**, and a
> **human review** gate on the `usav-dev` tunnel before anything is treated as
> done for dogfood.

This is the same *dual-layer* idea as
[`docs/master-connections-and-refactor/`](../master-connections-and-refactor/README.md),
but for **portfolio governance** (what are we building, where, and who signed off)
instead of inventory/journey spines.

---

## Which document do I open?

| I am… | Open this |
|-------|-----------|
| **Orienting / finding a plan** | [`INDEX.md`](./INDEX.md) — SoT catalog |
| **Attaching a Git worktree / branch** | [`INDEX.md`](./INDEX.md) § Worktree registry + [`dev-worktrees.json`](../../dev-worktrees.json) |
| **Running tunnel verify + human review** | [`review-protocol.md`](./review-protocol.md) |
| **Executable tickets (live in app)** | Repo-root [`master-plan.mdx`](../../master-plan.mdx) → `/forge` Plans Live (or `https://usav-dev…`) |
| **Cross-feature connection rules** | [`master-connections-and-refactor/README.md`](../master-connections-and-refactor/README.md) |
| **Open plan dump (forward index only)** | [`docs/todo/README.md`](../todo/README.md) — must stay consistent with this hub |

```
┌──────────────────────────────────────────────────────────────────┐
│  PORTFOLIO INDEX (this hub)                                      │
│  docs/portfolio/INDEX.md                                         │
│  Plan ↔ worktree ↔ phase ↔ review checkmark                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ ticketId + href
┌────────────────────────────▼─────────────────────────────────────┐
│  LIVE MDX  master-plan.mdx  ↔  Yjs  ↔  /forge Plans Live         │
│  <TicketStatus pending|in-progress|deployed />                   │
│  Agent build + VERIFY; human review noted in INDEX + feedback    │
└────────────────────────────┬─────────────────────────────────────┘
                             │ tunnel
┌────────────────────────────▼─────────────────────────────────────┐
│  usav-dev (CLOUDFLARE_DEV_TUNNEL_HOST) + local worktree switcher │
│  Human walks the surface → review protocol checkmarks            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layers (do not collapse them)

| Layer | Authoritative for | Not for |
|-------|-------------------|---------|
| **Portfolio INDEX** | Catalog of plans, worktree attachment, phase, **human review** | Detailed API design |
| **Long-form plan** (`docs/todo/*`, `docs/operations-studio/*`, …) | How / why / phases of one initiative | Global ordering of all work |
| **`master-plan.mdx`** | Executable tickets + forge loop status | Narrative essays |
| **`dev-worktrees.json`** | Local switcher paths/ports/unlock | GitHub remote truth |
| **Git branch / worktree** | Code isolation for a topic | Product expose (nav allowlist still gates prod) |

**Rule:** a plan may exist without a worktree (main-only dogfood work).  
A worktree must **not** exist without a row in the portfolio INDEX.

---

## Status vocabularies (keep separate)

### A. Agent / forge tickets (`master-plan.mdx`)

Locked: `pending` | `in-progress` | `deployed`  
(`src/lib/master-plan/ticket-status.ts` — do not invent statuses here.)

| Status | Means |
|--------|--------|
| `pending` | Queued for agent/human build |
| `in-progress` | Active on a worktree or main |
| `deployed` | Code merged + automated VERIFY green (not “human loves UX”) |

### B. Portfolio phase (INDEX table)

| Phase | Meaning |
|-------|---------|
| `P0-catalog` | Documented only; no code lane |
| `P1-branch` | Branch/worktree exists; not actively built |
| `P2-build` | Implementation in progress |
| `P3-tunnel` | On `usav-dev` / local tunnel for dogfood look |
| `P4-human-review` | Waiting on human checklist in review-protocol |
| `P5-promote` | Approved; merge + unlock/park decision |
| `P6-done` | On dogfood surface (or deliberately archived) |

### C. Human review (INDEX + protocol)

| Review | Meaning |
|--------|---------|
| `—` | Not ready for review |
| `needed` | Human should walk tunnel |
| `approved` | Human signed off (name + date in INDEX) |
| `changes` | Feedback filed; stay in build/tunnel |

**Human approval never auto-sets `TicketStatus=deployed`.**  
After approve → promote PR → VERIFY → then `deployed`.

---

## Lifecycle (long-term use case)

```
1. Idea / plan doc lands in docs/todo or domain folder
2. Add row to portfolio INDEX (lane, plan href, ticketId prefix)
3. Optional: create topic branch + worktree; attach in INDEX + dev-worktrees.json
4. Build on worktree (unlock parked surfaces only there)
5. Switcher → dev:tunnel → walk on usav-dev
6. Human review protocol → approved | changes
7. Merge to main (still nav-parked if unfinished product)
8. Promote to dogfood allowlist when connection-card DoD is met
9. TicketStatus → deployed; INDEX phase → P6-done
```

Dogfood **main** stays stations + shipping. Topic worktrees are **build lanes**, not alternate products, until promote.

---

## Folder map

```
docs/portfolio/
  README.md              ← you are here
  INDEX.md               ← human SoT (workstreams, phases, review)
  DOC-CATALOG.md         ← machine SoT (every docs/** file + DOC-id + live worktrees)
  WORKTREE-LANES.md      ← code lanes (topic worktrees); docs stay in monorepo
  review-protocol.md     ← tunnel + human checkmarks
  templates/
    workstream-row.md    ← copy-paste for a new INDEX row
```

Regenerate catalog + worktree snapshot from real git/disk:

```bash
pnpm portfolio:sot          # write DOC-CATALOG.md + patch INDEX §1 + sync switcher cards
pnpm portfolio:sot:check    # fail if catalog stale
```

---

## Maintenance

1. **New plan file?** Add INDEX row the same day (even if phase = `P0-catalog`).
2. **New worktree?** INDEX worktree registry + `dev-worktrees.json` card.
3. **Human reviewed on tunnel?** Update INDEX review cell + note; flip related tickets only after merge/VERIFY.
4. **Plan shipped / deleted?** INDEX row → `P6-done` or remove; drop worktree attachment.
5. Keep [`docs/todo/README.md`](../todo/README.md) as a short forward list that **points here** for attachments/review.

Related: parked surfaces SoT `src/lib/dogfood/parked-surfaces.ts`; switcher `pnpm dev:switcher`.
