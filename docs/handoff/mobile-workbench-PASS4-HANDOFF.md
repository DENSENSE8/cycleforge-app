# HANDOFF — Mobile repair workbench, pass 4: operator decisions → build (2026-09-24)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
Read first: `docs/handoff/mobile-exoskeleton-CONTINUE-HANDOFF.md` (working rules, verified
state, the exoskeleton plan) and `AGENTS.md`. The rules in that file are binding. The short
version:
- Probes go to `:3050` only, with every non-GET mocked. RS-4799 ↔ Zendesk #9998 is a real
  customer.
- Mint one sign-in and reuse the storage state (sign-in returns 429 after a few mints).
- Never run a session `SET` through the pooled `DATABASE_URL`.
- Migrations are authored, then applied only after the operator OKs the exact
  `npm run db:migrate:dry` list.
- Clean cutover; `pnpm verify:fast` at the end.

## Operator decisions (2026-09-24) — now build them

| # | Decision | Build |
|---|---|---|
| 1 | Video: "GCS storage — you must make the video routes" | Signed-URL upload to GCS (reuse the photo bucket/client, `videos/` prefix) → finalize route → a media record linked to REPAIR_SERVICE → the Photos grid shows a video tile and the viewer plays it inline. Mime allowlist mp4/quicktime/webm; size cap from env. |
| 2 | Customer contact: "edit CRUD from their phone" | `PATCH /api/customers/[id]`. Create + link when the repair has none; change customer (search); unlink from the repair (never delete the customer row). Contact fields editable in `RepairInfoEditSheet` even when `customer_id` is set; update `repair-info-edit.test.ts`. |
| 3 | Print: "pick one named print station" | Stable station id + name on bridge status messages; jobs carry `targetStationId`; hosts ignore other targets. Station picker on the paperwork screen (remembered per staff). Move `/m/print` onto the same client hook and fix its self-echo. Keep `POST /print-log`. |
| 4 | Stock: "tied to the specific bin, updating that bin's count" | Take-from-stock needs a bin choice (bins holding the SKU, most stock first). `bin_contents` and the SKU ledger move together in the action's transaction. Refuse when the bin has less than the qty (no negative bins). Delete reverses both. |
| 5 | Desk pickup: "desk sign off via the kiosk v2 components" | Rebuild the desk `RepairPickupFlow` sign-off from the kiosk v2 pieces (SignaturePad, entry field, decline reason, review). Still ONE write: `src/lib/repair/pickup-submit.ts`. Banner layout-slot change: accepted. |
| 6 | "auto update ticket from the repair log"; keep the hub Ticket row draft line | Each new bench log entry on a `linked` repair posts to the Zendesk ticket **as an INTERNAL note by default**, so customers are not auto-emailed. Confirm public vs internal with the operator. Server-side, after commit, idempotent (store the comment id/status per action), outbox if one exists. A failure never fails the log save. The timeline shows "Posted to ticket #…" / "Failed — Retry". |
| 7 | "it should survive the browser refresh" | Persist ONLY `['repairs','workbench',…]` queries (spec below). |
| 8 | "yes I do" | The operator will check the hub on a phone. |

## State at handoff

- **Five build agents were running in the previous session** (VideoSlice, ContactCrudSlice,
  PrintStationSlice, BenchLogSlice, DeskSignoffSlice), one per row 1–6 (4 and 6 are one
  agent). They may have finished, partly finished, or been stopped when that session
  ended. **Do not assume.** Before building a row, check the worktree:
  - `git status --short`
  - new files under `src/app/api/**` (video / customers / print), `src/lib/print/*`,
    `src/lib/repair/*`, `src/components/repair/RepairPickupFlow.tsx`
  - new `src/lib/migrations/2026-09-24*.sql` or `2026-09-25*.sql`
  - `/tmp/rs-video-*.png`, `/tmp/rs-contact-*.png`, `/tmp/rs-print-station-*.png`,
    `/tmp/rs-benchlog-*.png`, `/tmp/desk-signoff-*.png`

  Finish or redo whatever is partial. Their reports lived only in that session
  (`agent://<Name>`).
- **Row 7 is half done by me:**
  - Added dependency `@tanstack/react-query-persist-client@5.101.0` (`pnpm add -w`, root
    `package.json` + lockfile), matching the installed `@tanstack/react-query` 5.101.0.
  - `@tanstack/query-sync-storage-persister` was added and then removed (deprecated). Write
    a tiny persister yourself instead.
  - No persistence code is written yet.
- **Typecheck:** clean except two errors in other people's files:
  `src/lib/picking/sessions.ts` (missing `@/lib/picking/tote-scan`) and
  `src/app/api/packing-logs/draft/route.ts:105` (`BuyerNoteHold | undefined`).

## Row 7 spec (cache survives refresh, no cross-staff leak)

1. `src/components/providers/WorkbenchCachePersistence.tsx` (client). Mount it **inside**
   `AuthProvider` in `src/components/layout/WarehouseShell.tsx`, where `initialUser` comes
   from the server so the user is known on first render.
2. Storage: `sessionStorage` (the tab survives refresh; closing the tab clears the PII).
   The key is identity-scoped: `cf-rq-wb:${organizationId}:${staffId}`. On sign-out
   (`user` becomes null) or a staff/org change, remove every `cf-rq-wb:*` key.
3. **Restore synchronously on the first render**, before children mount their `useQuery`s:
   - guard with a `useRef`;
   - read the key and parse `{ timestamp, buster, clientState }`;
   - drop the entry if `buster !== 'wb-v1'` or it is older than 24h;
   - otherwise call `hydrate(queryClient, clientState)` from `@tanstack/react-query`.

   Children then render with the data in cache. Staleness (3 min default) decides the
   background refetch.
4. Save with `persistQueryClientSubscribe({ queryClient, persister, buster: 'wb-v1',
   dehydrateOptions: { shouldDehydrateQuery: (q) => q.queryKey[0] === 'repairs' &&
   q.queryKey[1] === 'workbench' && q.state.status === 'success' } })`.
   - The persister is your own: `persistClient` → throttled (~1s) `setItem`,
     `restoreClient` → parse, `removeClient` → `removeItem`.
   - Catch quota errors and drop the entry; never throw.
5. `queryClient.setQueryDefaults(['repairs','workbench'], { gcTime: 24 * 60 * 60 * 1000 })`,
   so restored entries aren't garbage-collected after 5 min. Leave the global defaults in
   `src/components/Providers.tsx` alone.
6. Put the parse/expiry/owner rule in `src/lib/mobile/workbench-cache.ts` as a pure module,
   with a node:test next to it (buster mismatch, expiry, owner mismatch → empty).
7. **Probe:**
   - load `/m/rs/4799`, then `page.reload()`;
   - the card and door metas render before any repair GET resolves (delay the GETs with
     `page.route`);
   - switch the storage owner → nothing from the previous staff is restored.

## Then

1. Run `npm run db:migrate:dry` and show the operator the exact pending list (other
   sessions add migrations too). Apply only after the OK. Re-run the dry run → 0 pending,
   then `npm run tenancy:coverage`.
2. Run `pnpm audit-route-auth:emit` if any route was added.
3. Update `docs/handoff/mobile-exoskeleton-CONTINUE-HANDOFF.md`: mark decisions 1–8
   answered and built, list files and routes.
4. `pnpm verify:fast` (only the two foreign errors above are allowed). Probe each row at
   :3050 with writes mocked, and save screenshots to `/tmp`.
5. Then continue the exoskeleton kit + MCP gate + rollout (tasks 1–3 of the CONTINUE
   handoff).
