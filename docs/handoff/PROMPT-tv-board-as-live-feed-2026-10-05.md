# PROMPT: Make the Operations TV wall board look exactly like the Live feed (2026-10-05)

Paste everything below the line into a fresh agent session.

---

## Context

Repo: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md` first. Dev origin is **http://localhost:3050 only** (lane `cycleforge-lane@prod`). Never start servers or bind ports. If `:3050` is dead, run `systemctl --user start cycleforge-lane@prod`; the Next dev server has crashed from memory pressure before. Curl and browser auth: the `cf_sid` cookie from `tests/.auth/admin.json`. **Other sessions edit this tree at the same time.** Re-read every file right before editing it, never revert changes you didn't make, and don't treat their red gates as yours.

Background reading, mandatory: `docs/handoff/HANDOFF-live-feed-triage-2026-10-04.md`. It describes the Live feed: data, APIs, UI, conventions, and how to verify.

## Owner ruling (2026-10-05, verbatim intent)

> "The on-time board should look exactly the same as the live feed. Mostly just displaying the to-pick, picked, packed. Remove the progress in terms of plans and anything like that."

"On-time board" here means the **Operations TV wall board**: `/operations?tv=1`, the unattended wall screen, `src/features/operations/workspace/OperationsTvBoard.tsx`. If the operator meant something else, stop and ask before building.

## What exists today

- `OperationsTvBoard.tsx` (368 lines), mounted from `OperationsWorkspace.tsx`, paints these sections in order:
  1. a task KPI strip (`KpiStrip`);
  2. `TvLiveFeedPanel`, a big-number package summary added 2026-10-05;
  3. "Slipping · Overdue" and "Today · Due today" task lanes;
  4. "Load · By station";
  5. "Progress · Active plans" (`PlanProgressRow`).
- Data for those sections:
  - `GET /api/operations/tv-board` → `buildTvBoard` (`src/lib/ops-plans/tv-board.ts`) supplies tasks, plans and station load.
  - `GET /api/operations/tv-board/live-feed` → `toTvLiveFeed(loadLiveFeedBoard(orgId))` (`src/lib/ops-plans/tv-live-feed.ts`) supplies numbers only, with no cards and no customers. The client hook is `useOperationsTvLiveFeed` in `useOperationsTvBoard.ts`. It uses the Live feed's realtime triggers and refetches every 5 minutes.
- Gate: both routes need `operations.tv.view` plus the `ops_tv_board` flag (on for the dogfood org). The "TV Kiosk" role holds **only** `operations.tv.view`, so the wall can never call `/api/live-feed/*`, which needs `packing.view`. The regression test is in `src/lib/auth/route-permission-manifest.test.ts`: "operations.tv.view gates the unattended TV wall board".
- The Live feed board (`src/features/live-feed/`) provides:
  - `LiveFeedBoard`, the orchestrator;
  - `StageColumn`, a column with header, scrolling list and IntersectionObserver "load more" that calls `/api/live-feed/lane`;
  - `PackageCard`, the card face: photo, title, channel, order last-8, carrier, SLA / stalled / out-of-stock / box / tag pills, `PackageFacts` (qty above 1, grade, green price), stage track, age, last staffer;
  - `BoardHeadline` (`Headline`, `LiveDot`), `PaceStrip`, `PickupStrip`, `stage-look.ts` (Allocate's stage glyphs and hues).
  - Shared arithmetic lives in `src/lib/live-feed/pace.ts`.
- Data state, after the 2026-10-05 backfill: every package that was Packed was scanned out at its pack time by staff 1 (10 shipments, `SHIP_CONFIRM` with `metadata.source = 'bulk-scan-out'`). The Packed column is currently **empty**, so verify that its empty state looks right.

## The change

1. **The wall becomes the Live feed board, read-only.**
   - Show the same headline: In the building, Late, Stalled, and Scanned out today. Show the same pickup countdown strip (`PickupStrip`) and, if it fits, the pace line.
   - Below that, show **three columns: To pick → Picked → Packed**. Use the same `StageColumn` header (glyph tile, label, "N late · N stalled · N from earlier", count) and the same `PackageCard` faces.
   - Scanned out appears as the headline number only, not as a column.
   - It must be visually identical to `/operations/live-feed` at 1920×1080 apart from the omissions below. Reuse the Live feed components. **Do not fork them.** Where the wall needs different behaviour, add a prop. For example, a read-only mode on `StageColumn` / `PackageCard`:
     - no open target, no checkbox, no hover state;
     - no `/api/live-feed/lane` paging, because the kiosk can't call it;
     - the first page (25 per stage) followed by a quiet "+N more" line.
   - Keep the stage hues and glyphs from `stage-look.ts`. Keep state outlines as overlay borders: `STATE_OUTLINE_CLASS`. Never `ring-*`; the `verify:fast` "Ring state" gate enforces this.
2. **Remove everything else on the wall:** the task KPI strip, Overdue, Due today, By station, Active plans / plan progress, and `TvLiveFeedPanel`'s big-number layout, which the board view replaces. Do a clean cutover:
   - delete the components, hooks, types and builders that no longer have a caller: `buildTvBoard` and its task/plan/station types, `PlanProgressRow`, `TaskLane`, `TvLiveFeedPanel`, the `toTvLiveFeed` number-only projection;
   - delete `GET /api/operations/tv-board` if nothing else reads it (grep first, then run `pnpm audit-route-auth:emit`, and update the manifest regression test);
   - keep the flag-off empty state ("Operations TV board isn't enabled here") and the realtime/offline indicators the frame already shows.
3. **Data for the wall.** Change `GET /api/operations/tv-board/live-feed`, keeping the same gate, `operations.tv.view` plus the flag, so it returns what the read-only board needs:
   - the three open columns with their counts and first-page cards, the headline numbers, pickups and pace;
   - all from `loadLiveFeedBoard(orgId)` with no filters. **No new SQL.**
   - Strip what an unattended screen in the building must not show: `customer`, `latestNote`, comment text. Keep the projection pure and unit-tested in `src/lib/ops-plans/tv-live-feed.ts` or its successor.
   - The wall refreshes through the existing realtime triggers plus the 5-minute safety refetch.
4. **TV legibility.** No interaction and nothing hover-only. If a column holds more cards than fit on screen, show what fits; a slow auto-scroll is optional and must respect `prefers-reduced-motion`.
5. **Docs.** Update `docs/handoff/HANDOFF-live-feed-triage-2026-10-04.md` (the TV wall section) and remove obsolete mentions of the plan/task wall anywhere you find them.

## Non-goals

- Don't change the Live feed page itself, except the read-only prop(s).
- Don't add filters or controls to the wall.
- Don't touch the pickup cutoff settings.
- Don't write to the database. Scan-outs and the backfill are done.

## Acceptance

- `/operations?tv=1` at 1920×1080 shows the Live feed headline, pickups and the three columns To pick / Picked / Packed, card-for-card the same as `/operations/live-feed`. There are no task, plan or station sections.
- The column counts equal `curl /api/live-feed/board | jq '[.columns[]|{stage,count}]'`, and the card order equals the board's first page.
- The wall's route answers with only `operations.tv.view` in the session: there is a manifest test, plus a curl check. The JSON contains no customer names or note text.
- Removed code is actually gone: grep shows no callers of the deleted symbols, and `pnpm audit-route-auth:emit` is clean.
- `pnpm test:live-feed`, the TV projection test, eslint on touched files and `node scripts/typecheck.mjs` show no errors in your files. Run `pnpm verify:fast` once at the end and report any red gates by file owner.
- Visual proof in a headless browser: open a **fresh** tab, use `wait_until: 'domcontentloaded'`, and poll about 40s for hydration. `tab.waitForText` caps at 29s, and `/m` pages and the TV page can take about 35s on this lane. Take screenshots at 1920×1080 of both `/operations?tv=1` and `/operations/live-feed` for side-by-side comparison.

## Report back

Files changed and deleted, the route contract (JSON shape), how the read-only mode is expressed (props added to which components), the screenshots, and any decision you had to make without the owner.
