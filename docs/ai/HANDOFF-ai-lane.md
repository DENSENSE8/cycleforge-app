# HANDOFF — AI lane (written 2026-09-28)

Paste the prompt at the bottom into a fresh session. Everything above it is the
state that prompt relies on.

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

### In flight when this was written (subagents; their reports land in `docs/ai/reports/<Name>.md`)
- **DbScale**:
  - Enforced statement/idle timeouts in the tenancy BEGIN paths plus an ALTER ROLE migration.
  - `staff_sessions` touch throttle, session cache and cleanup cron.
  - `pg_stat_statements`.
  - Cron lock through the pooler.
  - HNSW `iterative_scan`.
- **AiServing**:
  - Prod-safe provider chain (cloud first, local fallback; 402/429 fail over; Redis-shared demotion).
  - `max_tokens` and a 270 s turn deadline.
  - Per-staff limiter, per-org in-flight cap and monthly cost cap.
  - Dedicated assistant DB pool.
  - Meter every model call and fix the Stripe usage drain.
  - Redis fetch timeout plus tool-result caching.
  - Cap the tool-result JSON.
- **PlatformSafety**:
  - Deploy fails when migrations are pending; the runner supports no-transaction files and lock_timeout.
  - Signup seeds per-org roles, plus a CI smoke test.
  - Rate-limit keys on org+staff; PIN lockout.
  - `captureError` plus request ids in withAuth.
  - Tenant-leak fix in the activity log.
  - Show "credentials unreadable" instead of caching a decrypt failure.
- **GexV3**:
  - Trains fine-tune v3 ONLY on the RTX 5070 Ti in Avion (operator rule), with venv `~/cf-train/.venv` and data from gex45 `/opt/cf-train/datasets/cycleforge-v3`.
  - It serves the candidate on gex45 vLLM (serving is allowed there), via tunnel `cf-gex45-cand-tunnel` 18003.
  - Adoption rule: pass count ≥ the live model's on the same goldens AND faster. If it passes, switch chat to it (persistent systemd plus a tunnel user unit), keeping Prometheus as failover.

If a report is missing, check `git status` / `git diff` for its files, finish or back out the half-done work, and do not assume it landed.

## Machines
| Box | Role | Notes |
|---|---|---|
| Avion (this workstation) | dev lane `cycleforge-lane@prod`, RTX 5070 Ti 16 GB | **only** box allowed to train. The lane restarts at its memory threshold; keep browsers/load small |
| Prometheus (`ssh prometheus`, M5 Pro) | live chat model: mlx_lm gpt-oss-20b on :8080 → Avion 127.0.0.1:18088 (`cf-mlx-tunnel`) | serving only. The mlx_lm 0.31.3 bug means it serves the BASE model, not the LoRA. Restart: `ssh prometheus 'kill $(cat ~/CycleForgeAI/logs/mlx-promoted-server.pid)'`, then `cd ~/CycleForgeAI && nohup scripts/serve_promoted.sh &`. It wedges when overloaded |
| gex45 (`ssh gex45`, RTX PRO 4000 24 GB) | vLLM `cf-v2-base` (Qwen3-4B) on :8000 → 18002 (`cycleforge-gex45-tunnel`, the .env OLLAMA slot) | serving only; the fused v1 in HF format is at `/models/cycleforge-gpt-oss-v1-promoted-fused-hf` |

## Ranked plans (read before choosing work)
- `docs/ai/SCALE-ROI.md` — top 15 gaps for 1M users with heavy AI use, the AI subset (A1–A11) and a one-day plan. Rows 1–9 plus A1/A2/A8/A9/A10 are in flight above; A6 (eval in CI with a p95 gate), A7 (prompt caching) and row 10 (heavy `/api/orders`) are next.
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
> `docs/ai/HANDOFF-ai-lane.md` fully, then every file in `docs/ai/reports/`.
> Goal (operator): the app goes to a million active users with heavy AI use. It must be
> simple first (chat-first onboarding, capabilities unlock into the sidebar, org
> history), eBay first, then Amazon, and the AI must be fast, correct and safe.
>
> 1. **Reconcile in-flight work.** Check each report in `docs/ai/reports/`
>    (DbScale, AiServing, PlatformSafety, GexV3) against `git status`/`git diff`.
>    Finish or back out half-done changes. Get `pnpm verify:fast` green. Run one
>    serialized full eval (`LH_COOKIE="$(cat /tmp/cf-staff1-cookie.txt)" pnpm ai:eval`)
>    and fix real regressions at the root; don't loosen fact checks. Commit and push
>    (the operator has approved committing all changes in the worktree).
> 2. **Model.** If GexV3's report shows v3 met the adoption rule, confirm the switch,
>    with Prometheus as failover and a full eval on the switched config. If not,
>    continue training ONLY on the Avion RTX 5070 Ti and serve candidates on gex45.
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
