# EXECUTION PROMPT — Cycle Forge Agentic Loop (Fable 5, ultracode)

> Paste everything below the line into a fresh Claude Code / Cursor (Fable 5) session at the repo root.
> Budget expectation: deliberately expensive, multi-workflow run with adversarial verification.
> Stop at every **HUMAN GATE** — do not push through. The plan doc’s §-2 locked table is SoT;
> do not re-litigate stack choices (Neon + Ably + Yjs + Next.js).

---

ultracode

# Mission

Execute `docs/todo/agentic-loop-master-plan.md` into this Cycle Forge codebase.

You are building the **Cycle Forge agentic meta-loop**: local Cursor (`./master-plan.mdx`) ↔
Ably+Yjs CRDT sync ↔ `/forge` Next.js dashboard ↔ Hermes/`forge.sh` ↔ Neon ephemeral branch
verification ↔ in-app issue→deploy→toast feedback.

**Product framing:** Cycle Forge is the sellable B2B warehouse/fulfillment SaaS. This loop is the
dev/agent execution plane — not a rebrand, not a parallel product. USAV is dogfood tenant only;
never frame the product as a 5-person internal tool.

**This run’s default scope:** Phase 0 contracts through Phase 3 dashboard (ALP-0.* … ALP-3.*)
end-to-end, production-quality. Phases 4–6 (Neon branching automation, issue toast loop, hardening)
are **out of scope unless the human explicitly expands the run** — still read them so you do not
paint yourself into a corner.

Get the contracts right over getting it done fast.

# Read first (in this order, before writing any code)

1. `docs/todo/agentic-loop-master-plan.md` — **SoT**. Memorize §-2 locked decisions,
   §0 architecture, §1 task IDs (ALP-*), §2 file targets, §4 out of scope.
2. `CLAUDE.md` + `.claude/rules/source-of-truth.md` + `.claude/rules/backend-patterns.md` +
   `.claude/rules/build-gotchas.md` + `.claude/rules/ui-design-system.md` +
   `.claude/rules/contextual-display.md`.
3. `docs/integrations/realtime-ai.md` — Ably + Hermes baseline.
4. Existing realtime spine (extend, don’t fork):
   - `src/lib/realtime/channels.ts` (`orgChannelPrefix`, channel helpers)
   - `src/contexts/AblyContext.tsx` + `src/hooks/useAblyChannel.ts` (ONE browser connection)
   - `src/lib/realtime/publish.ts`
   - `src/app/api/realtime/token/route.ts`
   - `tests/e2e/realtime-token.spec.ts`
5. Forge plane:
   - `src/app/forge/page.tsx` (poll-only today — you will make it live)
   - `src/app/api/forge/ingest/route.ts` + `src/app/api/forge/runs/route.ts`
   - `.cycle_forge_ops/scripts/forge.sh` + `.cycle_forge_ops/prompts/{ARCHITECT,CODER}_SYSTEM.md`
6. Assistant plane (keep SSE; do not introduce `useChat`):
   - `src/lib/assistant/agent-loop.ts`
   - `src/components/assistant/useAssistantChat.ts`
   - `src/lib/assistant/tools/` + `src/lib/assistant/mutations/apply-agent-mutation.ts`
7. Feedback / toast plane:
   - `src/components/quick-access/FeedbackWidget.tsx`
   - `src/app/api/user-issues/route.ts`
   - `.github/workflows/claude-fix-issue.yml`
   - `src/lib/toast.ts` + `src/components/Providers.tsx`
8. Neon / cost:
   - `src/lib/db.ts`, `docs/qa-org-playbook.md` (manual branch playbook)
   - `.claude/agents/neon-cost-reviewer.md`
9. Skills (mandatory when triggered): `db-migration-author`, `new-route`, `domain-unit-test`,
   `org-scope`, `sidebar-mode`, `ops-studio` (if you touch Studio — prefer not to), display
   archetype algorithm before any `/forge` UI region.

# Hard invariants (violating any is a failed run)

- **Stack lock:** Neon + Ably + Yjs + Next.js only. Do **not** add a second browser Ably Realtime
  client or a third-party CRDT host. Do **not** replace the assistant with Vercel AI SDK `useChat`
  in this plan.
- **Channel tenancy:** every new channel goes through `orgChannelPrefix(orgId)`. Prefer
  `getMasterPlanChannel(orgId)` → `org:{uuid}:forge:master-plan`.
- **CRDT shape:** one `Y.Doc` with `Y.Text('content')` holding the raw master-plan string.
  Local file SoT path: `./master-plan.mdx` (create a starter if missing).
- **TicketStatus enum only:** `pending` | `in-progress` | `deployed`. Reject all other values.
- **AblyProvider is sacred:** all React subscriptions via `useAblyChannel` / existing context.
- **Backend skeleton:** `withAuth` → Zod → domain helper (`Deps`) → 404/409/200 → `recordAudit`
  (`AUDIT_ACTION`/`AUDIT_ENTITY` constants; never rename) → `after()` side-effects. `orgId` from
  `ctx`, never body. Never import `USAV_ORG_ID` in new code.
- **Migrations:** author only — dated immutable SQL under `src/lib/migrations/`, tenant-from-birth,
  `enforce_tenant_isolation()`, named CHECKs. Model in `src/lib/drizzle/schema.ts` same change.
  Do **not** apply migrations; do **not** `drizzle-kit push`.
- **UI:** run `pickArchetype` per region; `/forge` plan view = Monitor (or Canvas if you add
  semantic zoom — don’t blend). Semantic colors only; named z-index tokens; `HoverTooltip` not
  `title=`; canonical `Button`; motion via house framer helpers; no `dark:` Tailwind; no decorative
  card chrome on the plan hero.
- **Neon cost:** no `refetchInterval` polling on the plan/run surfaces — Ably only. Ephemeral
  branches (Phase 4) must have TTL + delete-on-success.
- **Secrets:** never commit `.env`. Document new vars in `context/ENV-VARS.md` + `.env.example`
  with blank values.
- **Git (local Claude Code sessions):** work on `main`; never `git stash`; never commit/push —
  leave the tree for GitHub Desktop. **(Cloud agents follow their own branch/PR instructions.)**
- **Out of scope this run (unless human expands):** ALP-4.* Neon branch API automation, ALP-5.*
  issue toast loop, ALP-6.* hardening, Jetson/Qwen, Studio publish automation, replacing forge MFM
  prompts wholesale.

# Orchestration directives (ultracode)

- Begin with a **parallel understanding workflow**: fan out readers over (a) the master plan §-2,
  (b) Ably channels + token route + AblyContext, (c) `/forge` + ingest, (d) assistant tool
  registry + agent-loop, (e) FeedbackWidget + user-issues, (f) forge.sh VERIFY path, (g) package.json
  for yjs/ably presence. Synthesize a structured map before any code.
- For each phase: **design → implement → adversarially verify**. Verification fan-out:
  - tenancy leak hunter (channel / orgId)
  - CRDT echo-loop / split-brain hunter
  - Ably connection-count hunter (must stay single client in browser)
  - DS-guard / archetype checker
  - permission-registry auditor
  - “violates §-2 locked decision?” reviewer
  A finding survives only if reproduced against the actual diff. Fix before advancing.
- Pipeline phases sequentially unless worktrees are required for non-overlapping files.
- After each phase, run gates honestly and paste results:
  `npx tsc --noEmit` · scoped eslint · new `node:test` files · `npm run test:ds-guards` ·
  extend/run `test:e2e:realtime-token` when token capabilities change ·
  `audit-route-auth` + permission manifest test when routes/perms change.
  A red gate blocks the next phase.
- If scouting contradicts the plan, surface the conflict + minimal resolution **before** building;
  amend the plan doc when you resolve it. Never silently substitute a different realtime or CRDT host.

# Reporting discipline

Narrate phase transitions and load-bearing discoveries. Never claim a HUMAN GATE passed without
evidence. End each phase with:

```
COMPLETED: ALP-x.y …
FILES: …
GATES: <command results summary>
NEXT: …
```

On blocker:

```
BLOCKED: ALP-x.y
REASON: …
NEXT ACTION: <human decision or skip target>
```

---

# PHASE 0 — Contracts + starter MDX (ALP-0.*)

Deliverables:

1. Confirm §-2 locked table is treated as SoT (stack = Neon + Ably + Yjs + Next.js only).
2. Add channel helper `getMasterPlanChannel(orgId)` in `src/lib/realtime/channels.ts`
   (+ unit coverage if channel helpers are tested).
3. TypeScript contract for TicketStatus props/enum (shared module under `src/lib/master-plan/` or
   `src/components/forge/`).
4. Create starter `./master-plan.mdx` (or `docs/forge/master-plan.mdx` with daemon path
   configurable) containing at least one `<TicketStatus status="pending" … />` example and a short
   legend. Prefer repo-root `./master-plan.mdx` if gitignore/policy allows; otherwise document the
   path in ENV and the plan.
5. Update `context/ENV-VARS.md` + `.env.example` stubs for upcoming daemon vars (blank values).

HUMAN GATE 0: present channel name, TicketStatus types, and starter MDX path for approval.
Do not add heavy deps yet if the human wants to adjust the file path.

# PHASE 1 — Ably + Yjs real-time state (ALP-1.*)

Deliverables:

1. Add `yjs` dependency. Implement a **custom** Ably↔Yjs provider in `src/lib/master-plan/`
   (document the message protocol in a short README in that folder). Do not rely on unmaintained
   packages without vendoring/owning the protocol.
2. `createMasterPlanYDoc()` shared factory — `Y.Text('content')` only.
3. Extend `/api/realtime/token` capabilities so authorized staff can subscribe (+ publish if role
   allows) to the master-plan channel. Update `tests/e2e/realtime-token.spec.ts`.
4. Empty-doc bootstrap: seed from starter MDX string (server route or first-client wins with
   documented race policy). Never wipe Neon ops tables.

HUMAN GATE 1: demonstrate two clients merging concurrent edits to the same Y.Text (test harness
or local browsers). Paste evidence.

# PHASE 2 — Local sync daemon (ALP-2.*)

Deliverables:

1. `.cycle_forge_ops/scripts/master-plan-sync-daemon.mjs` using `fs.watch` on the configured MDX path.
2. Upstream + downstream sync with atomic writes and generation-token echo suppression.
3. PM2 entry in `ecosystem.config.cjs`; document start command.
4. Optional thin hook comment/stub in `forge.sh` for post-VERIFY TicketStatus update (full VERIFY
   wiring may wait for Phase 4 — stub is enough if Phase 4 is out of scope).

HUMAN GATE 2: round-trip Cursor file save ↔ web/Yjs update without infinite loop.

# PHASE 3 — `/forge` live plan dashboard + mutate tool (ALP-3.*)

Deliverables:

1. Upgrade `src/app/forge/page.tsx`: Ably-live run updates (replace poll-only) **and** a plan
   Monitor region bound to Y.Text.
2. `react-markdown` + custom `TicketStatus` / `AgentLog` components; semantic token chips; motion
   pulse when status becomes `deployed`.
3. Assistant server tool `mutate_master_plan` registered in the tool registry; Deps-injected;
   DB-free unit tests with fakes; agent-loop can call it. Keep SSE/`useAssistantChat` — no useChat.
4. DS guards + archetype compliance for the new regions.

HUMAN GATE 3: flip a ticket pending→deployed (via tool or daemon) and show live UI pulse without
page refresh. Full gate suite green for touched surfaces. Then STOP unless the human expands to
Phases 4–6.

---

# PHASE 4 — Neon branch verification (ALP-4.*) — only if human expands

Deliverables: Neon API client (`src/lib/neon/branches.ts`), forge outer-loop pending-ticket
ingestion, VERIFY against branch URL, success→`deployed`+delete branch, ingest metadata to
`cycle_forge_runs`. HUMAN GATE 4: prove prod `DATABASE_URL` never used for agent VERIFY.

# PHASE 5 — In-app issue → toast (ALP-5.*) — only if human expands

Deliverables: `user_reported_issues` migration (author only), dual-write `/api/user-issues`,
resolution webhook/publish `issue.resolved`, client toast with locked copy:

> The bug you reported has been fixed! Refresh the page to load the latest version.

HUMAN GATE 5: E2E reporter toast.

# PHASE 6 — Hardening (ALP-6.*) — only if human expands

Outbox `orgId` fix if needed, neon-cost pass, capability least-privilege, adversarial suite
(echo-loop, split-brain, branch leak, toast spam).

---

# Final report (end of run)

Update `docs/todo/agentic-loop-master-plan.md` status header to reflect implemented ALP-* IDs.
List migrations awaiting apply. List ENV vars the human must set. Honest stub list. Then STOP.
