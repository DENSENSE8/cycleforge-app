# HANDOFF — AI lane (written 2026-09-27)

Paste the prompt at the bottom into a fresh session. Everything above it is the
state that prompt relies on.

## PAUSED (2026-09-27, operator decision)

The AI lane is paused until the product foundations are built (the product is still in
dogfood). Don't restart the subagents or the prompt below until the operator says so.

The second restart (DbScale-2, AiServing-2, PlatformSafety-2, GexV3-2, OrdersWeight) ran for
a few minutes and was then stopped. It left partial, untested, uncommitted edits in auth hot
paths (`withAuth.ts`, `session.ts`, `current-user.ts`, `role-store.ts`, `server-session.ts`,
`pin.ts`, `api-guard.ts`, `src/app/api/auth/*`), in `src/lib/db.ts`,
`src/lib/tenancy/db.ts` and `scripts/run-pending-migrations.mjs`, and in `src/lib/ai/*`
provider/failover/usage. New files: `turn-limits.ts`, `org-spend-cap.ts`,
`response-usage.ts`, `session-user-cache.ts`, `session-sweep.ts`, the migration
`2026-09-28_ai_usage_estimated.sql` (unapplied), and throwaway `scripts/.dbscale-t*.tmp.ts`
plus `scripts/tmp-ai-chaos-drill.mts`. No reports were written. Review or revert these
before committing.
Typecheck after the stop has one error, from the half-done PIN lockout: `src/lib/auth/pin.ts:159`, TS2344.

Nothing is running: no rsync, training or :8001 candidate, and there's no vllm drop-in on
gex45. The tunnels are idle.

## Where things stand

Branch `prod/worktree-2026-09-11`, pushed through `2908754aa`. Work after that
commit is uncommitted (see "In flight"). The dev origin is `http://localhost:3050`
only (AGENTS.md §1).

### Built and pushed (commits 425be3a51 … 2908754aa)
- **Chat surface** (`/ai-chat`):
  - Per-staff sessions and the sidebar chat list.
  - Stop, regenerate, edit, copy, feedback, voice, hotkeys.
  - Inline data answers with an identity header (bold title plus copyable id chips); documents and payments open in the right rail.
  - Icon-only controls; "Thought process" opens only from the lightbulb.
  - Composer modes: Full access / Ask only (server-enforced; Shift+Tab cycles), a context ring and file drop.
- **Speed**:
  - One retrieval core (`find_records` over `findRecords`).
  - Identifier/scan fast path (`identifier-turn.ts`, no model round, ~1 s).
  - Eval went from p50 9.7 s / p95 18.2 s to 5.0 s / 6.7 s on the original 13 goldens.
- **Write tools** (confirm-before-write, via `tools/confirmable-write.ts`, `pending-confirmation.ts` and agent_mutations):
  - Orders on any channel.
  - PO import with a still-needed loop, plus the PO↔order link table `receiving_order_link`.
  - Order flags, out-of-stock and bulk scan-out.
  - Tasks.
  - Manual↔SKU link.
  - Label quote/buy/void. In dev a guard refuses real purchases unless `SHIPSTATION_SANDBOX_API_KEY=TEST_…` is set.
- **Read tools**: reconcile a pasted list, customer dossier, worklists, staff report, tracking status/watch.
- **Printing**: chat printing goes through the per-staff print-station bridge (tote labels plus order paperwork, `label_print_jobs`/`document_print_jobs` ledgers).
- **Payments**: a Square rail (payment link/invoice, `order_payments`, webhook status) and a PAN guard. Square credentials are PRODUCTION: never charge, and never send to real customers.
- **Intake form**: rebuilt inline at the top of To ship (`/shipping/orders?triage=new`, triage design system, AI product search, paste import, channel-prefix order numbers).
- **Simple-first** (`docs/product/SIMPLE-FIRST.md`):
  - `org_capabilities` plus the `org_capability_events` ledger; all existing orgs are backfilled active.
  - The nav is gated per capability.
  - Chat tools `list_capabilities` / `enable_capability`, plus an eBay import path.
  - `/settings/capabilities` with org history.
  - Template-less orgs land on `/ai-chat`.
- **Signup fix**: `$3::text` — new orgs could not sign up before it.
- **Eval**:
  - Run with `LH_COOKIE="$(cat /tmp/cf-staff1-cookie.txt)" pnpm ai:eval [--only ids] [--base-url …] [--with-payments]`.
  - 85 goldens; the last full run was 77/85, and every listed failure was fixed and passed on a targeted `--only` rerun.
  - The local model is single-request: never run two evals at once.

## Stopped subagents — state at stop (2026-09-28) and restart briefs

All four were stopped by the operator before they finished, and none wrote a report. Their
transcripts stay on disk (the `agent://` links end with the session):
`~/.omp/agent/sessions/-Projects-cycleforge-lanes-prod/2026-09-27T15-16-39-819Z_01a0e370-8f0b-736d-9f93-bd2e42994a62/{DbScale,AiServing,PlatformSafety,GexV3}.jsonl`.
Nothing is running: no training, rsync or candidate server. The 5070 Ti is idle.

**Tree at stop:**
- Commits `781259cf0` (these docs) and `fe7366338` (handoff update + signup-tenant import/caller fix) are local and NOT pushed. The pre-push typecheck is red on
  other sessions' in-flight work: `RecordCard.tsx` is missing Popover imports, and
  `PaymentArtifact.tsx` doesn't know the `stripe_link` method.
- Unknown-owner Stripe work is uncommitted and not ours. Leave it alone:
  - `src/lib/order-payments/stripe.ts`
  - `src/app/api/webhooks/stripe/`
  - `src/app/api/orders/payments/methods/`
  - the edits to `order-payments/{model,service}.ts`
  - `src/lib/migrations/2026-09-27b_order_payments_stripe.sql` (pending, unapplied)

### DbScale (scale-roi rows 1, 7, 9-db, 11, A10)
- **Done (uncommitted):**
  - `src/lib/tenancy/tx-timeouts.ts`, wired into the BEGIN paths in `src/lib/tenancy/db.ts`
    (`PG_TX_STATEMENT_TIMEOUT_MS`, tested with pg_sleep through the throwaway script).
  - Migration `2026-09-27_role_statement_timeouts.sql` — written, NOT applied (dry-run lists it
    as pending).
  - Edits to `scripts/run-pending-migrations.mjs` and `src/app/api/cron/refresh-reports/route.ts`
    (long-job override).
- **Restart brief:** finish row 1 (review `db.ts`/`tx-timeouts.ts`, prove a cancel with pg_sleep,
  dry-run then apply the role migration with `--only`), then rows 7, 9-db, 11 and A10 from
  `docs/ai/SCALE-ROI.md`.

### AiServing (scale-roi rows 2, 3, 4, 12 + A1, A2, A4, A5, A7-partial, A8, A9)
- **Done (uncommitted):**
  - A9: provider-order cache — `provider-order-deps.ts` / `provider-order.ts`, plus
    `invalidateAiProviderOrder` on org settings save.
  - Row 3: work started in `failover.ts` / `provider.ts` (402/429 as faults).
  - A8: Redis fetch timeout in `redis/client.ts`.
  - It had spawned a helper, `AiServing.AiPoolTools`, for the row 2 pool; its state is unknown,
    so check `tenant-session.ts` / `grok-agent-loop.ts` in `git diff` (neither showed as
    modified at stop).
- **Restart brief:** re-read those diffs, unit-test them, then:
  1. Row 3 (Redis-shared demotion, single-flight probe; don't change the dev `.env` order).
  2. Row 4 (`max_tokens`, 270 s deadline, per-staff limiter, per-org in-flight cap, monthly
     cost cap).
  3. Row 2 (dedicated assistant pool; tools via `session.query`).
  4. Row 12 (meter every model call, Stripe usage drain).
  5. A7 partial (cap tool-result JSON; volatile context out of the system prefix).
  6. `ai:eval --only`, then one full run.

### PlatformSafety (scale-roi rows 5, 6, 8, 9-app, 14, 15)
- **Done (uncommitted):**
  - Row 6 in progress: `src/lib/auth/ensure-admin-role.ts` rewritten to seed per-org system
    roles and wire the owner to THAT org's admin only (`seedOrgRoles`,
    `ensureAdminRoleWired(staffId, orgId, db)`).
  - New `src/lib/auth/signup-tenant.ts` (`provisionSignupTenant`, the transaction body), used
    by `src/app/api/auth/signup/route.ts`.
  - `scripts/provision-qa-org.ts` updated to the new signature. Main fixed the missing import
    and caller at stop; tsc is clean for these files.
  - Not yet runtime-tested.
- **Restart brief:** prove signup end to end in a rolled-back transaction or on a throwaway
  org: per-org roles exist, and the owner is linked to no other org's roles. Then:
  - follow-ups via `after()`, and a signup smoke test in CI;
  - row 5 (fail the deploy on pending migrations; no-transaction migrations plus
    lock_timeout);
  - row 8 (rate-limit keys on org+staff/email, PIN lockout, switch/step-up limiter);
  - row 9-app (`captureError` plus x-request-id in withAuth);
  - rows 14/15 (the tenant leak into USAV's activity log; the tenancy CI gate's stale file;
    "credentials unreadable" instead of a cached decrypt failure).

### GexV3 (fine-tune v3; operator rule: train ONLY on the Avion RTX 5070 Ti)
- **Done:**
  - v3 data built from the current registry (tooling `~/cf-tune/v3/`; dataset on gex45
    `/opt/cf-train/datasets/cycleforge-v3`).
  - `~/cf-train/.venv` works (torch cu130 sees the 5070 Ti).
  - `~/cf-train/train_v3_unsloth.py` (BASE from env) and `~/cf-train/measure_vram.py` exist.
  - The model copy stopped at ~706 MB of ~12 GB in `~/cf-train/models`.
  - Persistent unit `~/.config/systemd/user/cf-gex45-cand-tunnel.service` (18003→gex45:8001).
  - gex45 `vllm.service` (cf-v2-base) is active.
- **Restart brief:**
  1. `rsync -a gex45:/models/gpt-oss-20b-unsloth-bnb-4bit ~/cf-train/models/`, plus the
     tokenizer files, `gex45:/opt/cf-train/adapters/cycleforge-gpt-oss-v2` and the v3 dataset.
  2. Measure peak VRAM at 2048/2560/3072/4096 tokens and pick the largest length that leaves
     ≥1.5 GB free.
  3. Train detached and nice'd, with logs and checkpoints; watch `/api/health`.
  4. Merge, serve on gex45 vLLM :8001, then run the full eval via `--base-url
     http://127.0.0.1:18003/v1` (one eval at a time).
  5. Adopt only if passes ≥ live and it is faster. On adoption: persistent units,
     `.env` switch, Prometheus kept as failover, and a full re-eval.

## Machines
| Box | Role | Notes |
|---|---|---|
| Avion (this workstation) | dev lane `cycleforge-lane@prod`, RTX 5070 Ti 16 GB | **only** box allowed to train. The lane restarts at its memory threshold; keep browsers/load small |
| Prometheus (`ssh prometheus`, M5 Pro) | live chat model: mlx_lm gpt-oss-20b on :8080 → Avion 127.0.0.1:18088 (`cf-mlx-tunnel`) | serving only. The mlx_lm 0.31.3 bug means it serves the BASE model, not the LoRA. Restart: `ssh prometheus 'kill $(cat ~/CycleForgeAI/logs/mlx-promoted-server.pid)'`, then `cd ~/CycleForgeAI && nohup scripts/serve_promoted.sh &`. It wedges when overloaded |
| gex45 (`ssh gex45`, RTX PRO 4000 24 GB) | vLLM `cf-v2-base` (Qwen3-4B) on :8000 → 18002 (`cycleforge-gex45-tunnel`, the .env OLLAMA slot) | serving only; the fused v1 in HF format is at `/models/cycleforge-gpt-oss-v1-promoted-fused-hf` |

## Ranked plans (read before choosing work)
- `docs/ai/SCALE-ROI.md` — top 15 gaps for 1M users with heavy AI use, the AI subset (A1–A11) and a one-day plan. Rows 1–9 plus A1/A2/A8/A9/A10 were started (see "Stopped subagents" above); A6 (eval in CI with a p95 gate), A7 (prompt caching) and row 10 (heavy `/api/orders`) come after.
- `docs/ai/CHAT-ROI.md` — chat capabilities mined from 142 operator sessions. Rows 1–12 are built; next come inventory writes (bin move/adjust/temp SKU), importing a missing order/channel sync, and support ticket create/link/RMA.
- `docs/product/SIMPLE-FIRST.md` — the simple-first capability model (chat-first, unlock → sidebar, org history). Next: eBay OAuth for a real test account, then Amazon, the "customer intake counter" capability, and a factory-style build view.
- `docs/design-system/HANDOFF-search-triage-record.md` §"AI track" and `HANDOFF-manual-phone-order.md`.

## Known open issues
- `/search` has no bin record, so bin answers link to `/inventory/locations?tab=bins&q=`.
- Pick-scan migrations from another session are applied only partly (the `work_type_pick` enum). The data migrations `2026-09-27_sal_pick_scans_from_tech_tracking.sql` and `2026-09-27b_order_pick_assignments_from_test.sql` belong to that session; don't apply them.
- Stored integration creds don't decrypt on the dev lane (`INTEGRATION_KMS_KEY` mismatch), so ShipStation and Zoho are live-unverified here.
- The CF Workers AI free quota is exhausted daily, and paid gateway providers return 402. Funding a primary plus a second vendor is an operator decision.
- The `mode=stopped` log line after a Stop is intermittent (observability only).
- Other OMP sessions edit this tree concurrently (sidebar IA, order cards, receiving). Their in-flight edits have broken :3050 several times: don't fix their files; wait or message.

## Working rules that saved time
- Shared chat files (`tools/index.ts`, `write-tools.ts`, `surfaces/registry.ts`, `apply-agent-mutation.ts`, `pending-confirmation.ts`, `tool-labels.ts`, `tool-subsetting.ts`, `agent-loop.ts`, `ui-artifacts.ts`, `artifact-placement.ts`, `scripts/ai-eval/goldens.ts`):
  - Put new tools in their own files.
  - Registration edits must be small and additive, and must compile on their own.
  - Re-read before editing, then check `/api/health` = 200.
- Don't mint sessions (sign-in rate-limits); reuse `/tmp/cf-staff1-cookie.txt` (`cf_sid=…`).
- To put multi-line text in the composer in browser automation, set the textarea value via the native setter plus an `input` event; typing `\n` submits.
- Browser: a headed Chrome with CDP at `http://127.0.0.1:9411` (supervised service `cf-avion-chrome2`), signed in as staff 1. Open your own tab and close it after.
- Before every push: run `pnpm verify:fast`. The pre-push hook also checks route-permission drift (`pnpm -s audit-route-auth:emit`) and lint.
- Clean up test rows. Soft-delete only `eval-*`/`cftune-*` chat sessions; never delete another staffer's chats.

---

## Prompt (paste into a fresh session)

> You are continuing the CycleForge **AI lane** in the prod worktree
> (`/home/michaelgarisek/Projects/cycleforge-lanes/prod`). Read `AGENTS.md`, then
> `docs/ai/HANDOFF-ai-lane.md` fully (especially "Stopped subagents").
> Goal (operator): the app goes to a million active users with heavy AI use. It must be
> simple first (chat-first onboarding, capabilities unlock into the sidebar, org
> history), eBay first, then Amazon, and the AI must be fast, correct and safe.
>
> 1. **Restart the four stopped subagents in parallel** (DbScale, AiServing,
>    PlatformSafety, GexV3). Give each its section from "Stopped subagents" (what's
>    done, uncommitted files, restart brief) plus the matching rows of
>    `docs/ai/SCALE-ROI.md`, and the shared-file rules. Each must first re-read its
>    uncommitted diff, then finish its brief, then write its report to
>    `docs/ai/reports/<Name>.md`. GexV3 trains ONLY on the Avion RTX 5070 Ti and serves
>    candidates on gex45. Don't touch the unknown-owner Stripe files.
> 2. **Integrate.** Get `pnpm verify:fast` green (foreign in-flight errors: wait or ask,
>    don't edit their files). Run one serialized full eval
>    (`LH_COOKIE="$(cat /tmp/cf-staff1-cookie.txt)" pnpm ai:eval`) and fix real
>    regressions at the root; don't loosen fact checks. Commit and push (the operator
>    has approved committing all changes in the worktree; local commits `781259cf0` and
>    `fe7366338` are unpushed). If v3 meets the adoption rule, confirm the switch with Prometheus as
>    failover and a full eval on the switched config.
> 3. **Next ROI**, in order:
>    - `docs/ai/SCALE-ROI.md`: A6 (ai:eval in CI against a preview build with a p95
>      gate), A7 (prompt/tool caching), row 10 (`/api/orders` weight).
>    - Then `docs/ai/CHAT-ROI.md`'s next tier: inventory writes, importing a missing
>      order/channel sync, and support tickets/RMA.
>    - Then `docs/product/SIMPLE-FIRST.md`'s next steps: a real eBay connect +
>      product import on a test org, a customer intake counter capability, and the
>      org build-history view.
>
> Rules: use subagents for independent slices, with one owner per shared file. Tests
> must be deterministic, and each slice needs browser proof on :3050 with screenshots.
> Money and external systems are test-mode only. Additive migrations only
> (dry-run, then `--only`). Report exact evidence, and state plainly what was not
> verified.
