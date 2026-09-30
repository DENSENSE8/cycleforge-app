# HANDOFF — Unbox speed (Lighthouse → 93) + local ticket mirror

Paste everything below the rule into a fresh session at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

---

You are continuing CycleForge's Unbox performance work. Owner goals, in order:
1. **Found / unfound identification must be instant** at the Unbox scan (done — keep it that way).
2. **`/unbox` Lighthouse ≥ 93** (desktop profile, production build). Currently **~88**.
3. **Ticket data lives in our DB**: ticket detail + full history render inline from our tables, no Zendesk round trip on the read path (in progress — see §3).
4. **Unfound scan → ticket linked → operator told, with history** (BUILT — see §4): a tracking number scanned at Unbox that matches no order gets its Zendesk ticket number linked to that unfound carton, and the header's top-left line says so, with a history of recent scan feedback one click away.
The owner has granted full authority to add and apply DB migrations for speed.

Dev origin is ONLY `http://localhost:3050` (lane unit `cycleforge-lane@prod`). Probe sign-in:
`curl -c cj -H 'content-type: application/json' -d '{"staffId":1,"pin":"","deviceKind":"personal"}' http://localhost:3050/api/auth/signin`.
If :3050 returns 500s with a Turbopack "restore failed" / "Can't resolve" error, `systemctl --user restart cycleforge-lane@prod` (happened once this session).
Other agents edit this worktree concurrently (`src/features/task-board/*`, `src/lib/settings/*`, `src/lib/qc/*`) — their type errors are theirs; do not touch.

## 0. Why things were slow (measured)

- Every Neon round trip from this box is ~85–95 ms. `tenantQuery` = 3 round trips (BEGIN+GUC / stmt / COMMIT); `tenantQueryOneTrip` (`src/lib/tenancy/db.ts`) = 1 round trip for a single read. Serial-query chains are the dominant cost everywhere.
- The tenant pool is `PG_POOL_MAX=5`; an open Unbox tab saturates it (connect waits 100–475 ms). Raising it is a global call — owner has not decided.

## 1. Done this session (all uncommitted)

**Scan identification (was 4–6 s → ~0.15–0.4 s to the verdict):**
- `src/lib/receiving/scan-match-probe.ts` — all seven tracking tiers (STN exact / last-8 / digit-prefix, Incoming mirror, receiving_scans last-8, PO Reference# exact / near-miss) in ONE statement; precedence in pure pickers `pickCartonMatch`, `pickLocalPoId`, `scanVerdictFromProbe` (+ `scan-match-probe.test.ts`, 7 tests).
- `lookup-po` uses the probe (started eagerly, memoized); `resolve-inbound-tracking.ts` (+test) deleted as obsolete; hot-path reads → `tenantQueryOneTrip`.
- Migrations APPLIED: `2026-09-29f_scan_match_indexes.sql`, `2026-09-29g_scan_match_prefix_indexes.sql` (expression + text_pattern_ops indexes; probe exec 64 ms → 7–12 ms).
- `GET /api/receiving/scan-verdict?tracking=` (one round trip, ~125–190 ms) → `src/lib/receiving/unbox-scan-feedback-store.ts` (was `unbox-scan-verdict-store.ts`; see §4), fired from `useTrackingScan` on Unbox tracking scans → header top-left (`HeaderWork.tsx` `HeaderNextAction`) shows `Checking …` → `Found — order on file for …` (success tone) / `Unfound — no order matches …` (warning tone), glyph morph, one polite announcement.
- **Still slow:** `lookup-po` itself takes ~2.5–4 s to OPEN the carton (≈30 serial writes: `recordReceivingScan` internals, `upsertOpenTrackingException`, unbox stamps, dup `resolveUnboxScanKind`). Next lever: batch those writes into one transaction / `after()` where the response doesn't need them.

**Lighthouse `/unbox` 55 → ~88** (median of 3, desktop, prod build):
| Fix | File |
|---|---|
| Empty (unfound) MRU carton seed counts as seeded → no 2.8 s blank loader | `src/components/receiving/unbox/UnboxBrowseShell.tsx` |
| Sidebar column space reserved from SSR (static rollout fallback + same-width spacer until the column chunk mounts; hydration-safe pre-mount `columnOpen`) → CLS 0.178 → 0 | `DesktopRouteShell.tsx`, `SidebarNavColumn.tsx` (`onMounted`), `useNavContext.ts` (tri-state `useContextualSidebarActive`) |
| Seed reads one-trip + parallel; activation gate parallel with seed → TTFB 0.95 → 0.48 s | `src/lib/queries/unbox-spine-seed.server.ts`, `src/app/layout.tsx` |
| Print-job executors split out of the every-page print bridge | `src/lib/print/station-job-executor.ts`, `src/hooks/useStaffPrintBridgeHost.ts` |
| bwip-js (~1 MB) off first paint: label preview loads the label shell on demand | `src/lib/print/label-html-loader.ts`, `src/components/labels/LabelFacePreview.tsx` |
| Hidden desk grid under an open carton mounts on first show only | `src/components/receiving/unbox/UnboxLineWorkspace.tsx` |
| `formatPSTTimestamp` Intl formatter cached | `src/utils/date.ts` |

Last run: perf 88, LCP 1.51 s, SI 1.64 s, TBT 175 ms, CLS 0, TTFB 0.49 s.

## 2. Next: get `/unbox` from ~88 to 93

Remaining cost is **module evaluation** at hydration: ~109 JS chunks / ~2.1 MB on first load; `instantiateModule` ~200 ms self time plus React render (`renderWithHooks`). Two long tasks of ~149 ms each during hydration.
1. Find which modules the first paint evaluates that it doesn't need (drawers, dialogs, the claim/ticket surfaces, Studio/`StudioWorkspaceProvider`, settings UI, `LocationCrudDialog`, `UnboxNotesStatusDialog` all showed up in the profile). Put them behind `dynamic()` / render-on-open. Chunk `1b4qn…` (ReceivingLinesTable, CartonCard, CartonClaimPanel — 87 KB gz) still loads even with the desk deferred: find its static importer.
2. `CompactActivityRow` / `RailRow` (sidebar recents rail) rendered ~120 ms inclusive: check per-row cost (`cn` merges, `formatLaneAgeCompact` → `fromZonedTime`) and memoize.
3. `useComposerTicketClaim` fires the claim preview POST on every unticketed carton open; gate on the Ticket tab being opened.
4. Consider the `lookup-po` write batching above (scan-to-open time, not Lighthouse).

**How to measure (never on :3050 — it is `next dev`):**
- Build an isolated rig on the SAME filesystem (Turbopack refuses a symlinked `node_modules`; `/tmp` is tmpfs so hard links fail there):
  ```bash
  SRC=$PWD; DST=../.perf-rig-prod; mkdir -p $DST
  rsync -a --delete --exclude node_modules --exclude '.next*' --exclude .git --exclude lighthouse --exclude .garisek $SRC/ $DST/
  cp -al $SRC/node_modules $DST/node_modules
  # rig-only: other agents' WIP breaks typecheck
  sed -i '0,/const nextConfig: NextConfig = {/s//const nextConfig: NextConfig = {\n  typescript: { ignoreBuildErrors: true }, \/\/ PERF RIG ONLY/' $DST/next.config.ts
  (cd $DST && NEXT_DIST_DIR=.next-perf node_modules/.bin/next build --no-mangling)
  (cd $DST && AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf node node_modules/next/dist/bin/next start -p 3100)
  ```
  Re-sync after edits: `rsync -a --delete $SRC/src/ $DST/src/` then rebuild (~25 s).
  The rig directory from this session still exists at `../.perf-rig-prod` (server on :3100 was STOPPED at handoff): re-sync `src/`, rebuild, restart the server; remove the directory when done.
- Lighthouse: `LH_BASE_URL=http://localhost:3100 LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs | tail -1)" node scripts/lighthouse-audit.mjs --routes /unbox --runs 3` (add `--ignore-load` only if the host is busy; noise is ±3).
- Scratch profilers (copy into the repo root to run, delete after): `/tmp/unbox-perf-scripts/` — `.prof.tmp.mjs` (inclusive time by component), `.prof2.tmp.mjs` (self time; `BYFILE=1` groups by chunk), `.chunks.tmp.mjs` (chunks loaded with size + start time). They use `@playwright/test` against :3100.
- When 93 is reached and stable, `node scripts/lighthouse-audit.mjs --routes /unbox --runs 3 --update-baseline` (floors ratchet up only).

## 3. Local ticket mirror — sub-agent STOPPED mid-work at handoff; restart it

The `LocalTicketMirror` sub-agent was cancelled when this handoff was written
(no agent is running). State it left (verified at handoff):

- **Migration APPLIED:** `src/lib/migrations/2026-09-29_helpdesk_ticket_mirror.sql` (in `schema_migrations`). DB has `support_ticket_comments`; `support_tickets` gained `ticket_payload`, `requester_zendesk_user_id`, `assignee_zendesk_user_id`, `priority`, `ticket_type`, `tags`, `provider_external_id`, `external_created_at`, `external_updated_at`, `mirrored_at`. Applied migrations are immutable — fixes go in a NEW file. (The `2026-09-29h_…` name belongs to another agent's pending `repair_service_receiving_line_link.sql` — not ours; always apply ours with `--only <file>`.)
- **New files (untracked):** `src/lib/support/ticket-mirror.ts` (521 lines), `src/lib/support/ticket-mirror-core.ts` (+ `ticket-mirror-core.test.ts`), `scripts/backfill-ticket-mirror.ts` (not known to have run).
- **Modified (uncommitted) by it:** `src/app/api/zendesk/tickets/[id]/{bundle,comments,route,assign}/route.ts`, `src/app/api/receiving/zendesk-claim/thread/route.ts`, `src/hooks/useZendeskQueries.ts`, `src/lib/jobs/zendesk-ticket-watch.ts`, `src/lib/zendesk-{links,users-cache,assignments}.ts`.
- `npx tsc --noEmit` was clean for these files at handoff. Tests, eslint, live timing proof, backfill run: **not done / unverified**.

**Restart it as the first act of the new session** — spawn one `task` sub-agent (name `LocalTicketMirror`) with this brief, and keep working §2 in parallel (disjoint files):

> Finish the local Zendesk ticket mirror in `/home/michaelgarisek/Projects/cycleforge-lanes/prod` so ticket detail + full history render from our DB with no Zendesk call on the read path. Prior partial work (verify, don't redo): migration `2026-09-29_helpdesk_ticket_mirror.sql` applied; `src/lib/support/ticket-mirror.ts`, `ticket-mirror-core.ts` (+test), `scripts/backfill-ticket-mirror.ts`; modified routes `src/app/api/zendesk/tickets/[id]/{bundle,comments,route,assign}`, `src/app/api/receiving/zendesk-claim/thread`, `useZendeskQueries.ts`, `zendesk-ticket-watch.ts`, `zendesk-{links,users-cache,assignments}.ts`. Read `git diff` of those first. Design: local-first reads via one-trip `readTicketMirror`; background revalidation in `after()` when `mirrored_at` is older than ~60 s; live fetch + write only when no mirror exists; write-through after any reply/status/subject/create call; the cron writes the full mirror; remove the Upstash 90 s bundle cache if now unused (clean cutover). Acceptance: identical response shapes vs before (diff JSON keys using a real linked ticket from `ticket_links`); warm bundle read makes zero Zendesk calls (prove via log/count) with before/after curl timings at :3050; run the backfill once (rate-limited, idempotent) and report counts; pure-piece tests pass (`pnpm exec tsx --test src/lib/support/ticket-mirror-core.test.ts`; server-only modules via `node --import tsx --import ./scripts/register-server-only-shim.cjs --test`); `npx tsc --noEmit -p .` and `npx eslint <touched files>` clean. Only :3050 is the dev origin (restart `cycleforge-lane@prod` if Turbopack wedges). Other agents edit `src/features/task-board`, `src/lib/settings`, `src/lib/qc`, repair_service migrations — don't touch. Recommend (don't build) a Zendesk webhook for push updates.

Context: `SupportTicketDetail` (via `StationTicketPane` in `LineEditPanel`) fetches the bundle on every ticketed carton open; `MergedRecordStream` renders history from `useTicketComments`.

**Handoff rule for the next session:** before writing its own handoff, stop every sub-agent and service it started (`read proc://`, `write proc://<id>/kill`), record exactly what each left (files, migrations applied, verified vs not), and put a restart brief like the one above in the handoff.

## 4. Unbox: unfound scan → ticket pairing → top-left feedback + history (BUILT, uncommitted)

Owner ask (2026-09-29): enter a tracking number at the Unbox scan; when it's an **unfound** order, the Zendesk ticket number is **linked to that Unbox identification** (the unfound carton), and the operator gets **feedback in the header top-left** plus a **feedback history** there. This replaces the placement in `docs/design-system/HANDOFF-header-personal-line-and-unfound-ticket.md` §2 ("no header change; the carton UI owns the feedback").

**How it works:**
- Pure model + tests: `src/lib/receiving/unbox-scan-feedback.ts` (+ `.test.ts`, 9 tests).
  - Entry shape: `{ id, tracking, receivingId, phase, lineCount, ticket, at }`.
  - `ticket` states: `searching` / `paired {ticketId, subject, status, url}` / `choose {candidates}` / `none` / `not_connected` / `error`.
  - `decideUnfoundPairing(candidates)`: `linkedToThis` → already paired, no re-post; exactly one → auto-link; several → operator picks; zero → none. The candidates route (anchor mode) already hides tickets linked to another item.
  - `unboxFeedbackLine` prints the FULL tracking number (owner 2026-09-29: never a truncated tail), placed right after the verb: `Unfound 9400111206260370400001 — linked to #10001`. When the slot is too narrow, the ellipsis cuts the outcome clause, never the number. A test pins this. This overrides the ≤ 47-char FindField limit for scan lines. The header slot widens to `w-lg` while a scan line shows, and the history popover is `w-lg`.
  - Log helpers: newest-first, capped at 20.
- Store: `src/lib/receiving/unbox-scan-feedback-store.ts`. It replaces `unbox-scan-verdict-store.ts`, which is deleted. The history lives in module memory for the tab session.
  - `checkUnboxScanVerdict` creates the entry.
  - When the verdict is unfound and the carton already exists (`scan-verdict` returns `receivingId`: a rescan / reopen), pairing starts immediately.
  - A brand-new carton is paired from `applyUnmatchedCarton` (`scan-apply.ts`, Unbox branch) once lookup-po mints it.
  - `pairUnboxUnfoundTicket` calls `GET /api/receiving/zendesk-claim/link?receivingId&query=<tracking>`, then the `POST` on the same route. It has a per-carton in-flight guard. A 409 on auto-link → `none`; 503 → `not_connected`.
  - `pairUnboxTicketChoice` backs the Pair buttons; a 409 drops that candidate.
  - `noteUnboxTicketLinked` is called from `useReceivingClaimController.submitLink`, so a manual Claim → Link lands on the same entry.
  - `retireUnboxScanLine` runs when you leave `/unbox`: the line goes, the history stays.
  - The spec's `useTicketSearch`-based hook was not used: that hook is a debounced picker bound to a mounted modal. The probe is a module function, so it runs whether or not any carton UI is mounted.
- Header: `HeaderWork.tsx` `HeaderNextAction` shows the entry's line.
  - Faces: `checking` (spinning Loader2), `found` (PackageCheck, success), `unfound` (PackageX, warning), `error`. Every ticket state wears the **Ticket glyph**, toned by outcome: `ticket-searching` (muted, pulsing), `ticket-linked` (success), `ticket-open` = choose / none (warning), `ticket-off` = not connected (muted), `ticket-error` (danger).
  - On `/unbox`, once there is history, the line is a button. It opens the design-system `Popover` with `UnboxScanHistory` (`src/components/layout/UnboxScanHistory.tsx`).
  - Rows show glyph + line + age (`formatLaneAgeCompact`). Clicking a row pushes `?openReceivingId=` via `applyUnboxOpenReceivingParams`. A paired row links `#N` → `/support?ticket=N` (`searchHitHref`). A `choose` row lists candidates with a **Pair** button each.
- Mirror tie-in: `POST /api/receiving/zendesk-claim/link` calls `refreshTicketMirror` in `after()`, so opening the linked ticket reads from our tables the first time. `linkTicketToAnchor` is unchanged: returning the ticket from it would have leaked into `/api/support/tickets/link`'s spread response.
- Mobile: no parity work. The phone has no Unbox scan station (removed by the operator 2026-09-15, see `ReceivingLive.tsx` header); the phone scan is Arrival (`useArrivalStation`).
- Composer weld (owner 2026-09-29: "framed twice, corners don't align"): the Unbox receive feedback (`ReceiveFeedbackRegion` → `WeldedFeedbackPanel`) now mounts through `StationComposerHost`'s `reaction` slot. The path is `LineEditPanel` → `WorkspaceNotesCard.reaction` → `LineNotesCard.reaction`.
  - Inside the host, it sits flush on the dock at the dock's exact width.
  - The panel frames only the top of the shared outline: top + side strokes and top radius, no bottom border. The dock keeps its own full border, so its top stroke is the seam and nothing covers it.
  - The dock's `weldTop` is derived from "reaction present".
  - `WeldedStack`, the extra raised/halo box around the whole host, is deleted, along with the `weldTop` prop chain through the host and the notes cards.
  - With no composer on screen (`terminalVm` null), the panel renders on its own as before.

**Verified at :3050 (scratch Playwright, screenshots `/tmp/unbox-ticket-*.png`):**
- Real, carton 53493 (made-up tracking): `Checking …` → `… searching tickets…` (2.9 s, lane cold) → `Unfound …70400001 — no ticket mentions it`. The GET was real Zendesk. The rescan was "logged as a lookup" (no unbox write).
- Client flow with the link route intercepted (no writes to real tickets):
  - one candidate → auto `POST {receivingId:53493, ticketId:10001}` → `linked to #10001` + `#10001` link in history;
  - three candidates → `3 tickets, pick one` → Pair on the 2nd → `POST ticketId:10002` → `linked to #10002`;
  - 503 → `connect Zendesk`, no toast.
- History: survives `/unbox` → `/support` → `/unbox` (client navigation). On `/support` the line falls back to the page step. The row click → `/unbox?openReceivingId=53493`.
- Real Zendesk search, read-only: the GET for carton 53486 (`9434650206217293748983`) returns ticket **#10001**, unlinked. Carton 53487 (`9302010623390270248250`) returns #10090 `linkedToThis`.

**Owner's test still to run (writes a real link):** at `/unbox`, scan `9434650206217293748983`. Expect `Unfound …93748983 — linked to #10001`, with `receiving_carton.zendesk_ticket = '#10001'` on 53486 and a `ticket_links` row. Check first that ticket #10001 ("EBAY DRAGON 14-15137-66334") really belongs to that box; unlink via the carton's ticket chip if not. Then scan `#10001` → carton 53486 opens (reverse link, the existing `lookup-po` ticket branch).

## 5. Loose ends

- **Test data created this session:** unfound carton **53493** (tracking `9400111206260370400001`, made up), scan 6820, exception 1113, STN 180898. The §4 smoke runs rescanned it about 10 times, all logged as lookups. Ask the owner before deleting.
- `pnpm verify:fast`: GREEN on 2026-09-29 after §4 (lint, typecheck, cron, tenancy, schema drift, boundary, nav names, SKU identity, layer laws, tokens, OpenAPI). `inbound-writer-law.test.ts` failed earlier on `src/lib/qc/queue.ts`, which is not ours; not re-run.
- Header handoff `docs/design-system/HANDOFF-header-personal-line-and-unfound-ticket.md`: its §1 (personal line) is still unbuilt. Its §2 (Zendesk ticket probe on unfound cartons) is built as §4 above, with the feedback in the top-left + history. The carton-pane status line that §2 described was not built; the header line and history carry that feedback.
- Do not deploy unless the owner says so.
