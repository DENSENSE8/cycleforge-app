# HANDOFF — Personal staff history timeline (owner 2026-10-01)

Paste this whole file as the implementation prompt. It is self-contained.

## Required acknowledgement before editing

Start by acknowledging these exact product decisions in plain language:

1. This is **My history**, not an all-staff operations wall.
2. The authenticated staff member's durable mobile actions are the facts; AI may summarize those facts but may not invent, merge, reorder, or mark work complete.
3. The primary visual is a live vertical timeline. Every circle is one specific action the staff member took, joined by a hairline in persisted-time order.
4. Broad labels such as Arrival, Unbox, Packing, and Scan out are task categories, not timeline entries. Entries use the exact action: what was scanned, matched, photographed, confirmed, passed, packed, labelled, staged, or scanned out.
5. Each task resolves into one stable completion receipt in the visual center. On desktop that receipt remains sticky while its selected action history is reviewed; on phone it stays in normal document flow.
6. Mobile remains the primary execution surface. Desktop is the readable history, evidence, and fallback surface—not a second station workflow.
7. Compact rows show only what is needed to triage. Expand a row or task for exact evidence, identifiers, changes, links, photos, and support follow-ups.
8. Desktop follow-ups may include Create ticket, Reply to ticket, Open record, and View photos, but every operator verb still needs a working mobile path first.
9. Realtime updates must preserve scroll, focus, selection, and disclosure state.
10. Motion clarifies arrival, grouping, completion, and disclosure. It never turns the history into a decorative animation reel.

Do not continue until the acknowledgement distinguishes **personal history** from the superseded cross-staff feed direction.

## Hard end goal

Turn the existing additive `/stations/live` implementation into the authenticated staff member's **personal, durable, live work history**.

The final surface answers, at a glance:

- What did I just do?
- Which exact actions made the task complete?
- Was the task completed entirely on mobile?
- What record, scan, serial, order, carton, unit, or shipment proves it?
- Is anything unresolved or in need of attention?
- What can I inspect or follow up on from the larger desktop screen?

Use the existing route. Do not create a second `/history` page, a right-rail feed, or another query stack.

## Product language

- Page title: **My history**.
- Live count: **N recent actions** or **N completed tasks**, whichever the current view actually counts.
- Personal voice: **You scanned…**, **You confirmed…**, **You completed…**. The actor avatar/name is redundant in the default personal view and belongs in expanded provenance only.
- Completion state: **Fulfilled** only when a canonical terminal event exists.
- Mobile provenance: **Completed on mobile** only when every action in the task is persisted with `context.origin === 'phone'` and the terminal action is also phone-origin.
- Mixed provenance: **Finished with desktop assist**. Never claim mobile-only completion when any action lacks phone provenance.
- Resolver-only scans remain **Identified**, never **Fulfilled**.
- Exception state: **Needs attention** with the exact persisted reason. Do not infer a reason from color or elapsed time.

## Display grammar

### One responsive interaction tree

Use one task selection/disclosure state and one semantic DOM tree.

- **Phone:** a single in-flow column. Each task receipt is followed by its compact action timeline. The receipt never overlays content. Touch targets follow the mobile surface law.
- **Desktop:** a readable timeline column plus a centered sticky completion receipt for the selected task. The card is sticky inside the page scrollport, not a viewport-fixed modal. It must never cover the timeline, page chrome, or focus target.
- The desktop arrangement is a wider presentation of the same task and actions. Do not mount separate mobile and desktop implementations with duplicated state.

Conceptual desktop anatomy:

```text
My history                                      Live

ACTION TIMELINE                SELECTED TASK RECEIPT (sticky)

  ● Scanned tracking           Fulfilled
  │  1Z… · 2:14 PM             You completed Unbox for Carton 1842
  │                            5 exact actions · 3m 18s
  ● Matched Carton 1842        Completed on mobile
  │  2:14 PM
  │                            [Open record] [View photos]
  ● Captured 4 photos          [Create ticket | Reply to ticket]
  │  2:16 PM
  │                            Details ▾
  ● Confirmed 3 units
     2:17 PM
```

Conceptual phone anatomy:

```text
Fulfilled · Completed on mobile
You completed Unbox for Carton 1842
5 actions · 3m 18s

● Scanned tracking 1Z…
│  2:14 PM
● Matched Carton 1842
│  2:14 PM
● Captured 4 photos
│  2:16 PM
● Confirmed 3 units
   2:17 PM
```

### Action circles and rail

Each circle represents one persisted action, not a phase label.

Required compact anatomy:

1. semantic action glyph inside the circle;
2. exact human verb and object;
3. relative time, with full warehouse timestamp available on focus/hover;
4. one useful identifier when present;
5. attention state only when persisted;
6. disclosure control with `aria-expanded` when more evidence exists.

Examples of acceptable action copy:

- `Scanned tracking 1Z…`
- `Matched Carton 1842`
- `Captured 4 unbox photos`
- `Confirmed 3 received units`
- `Added serial …8F31`
- `Recorded QC passed`
- `Scanned SKU CF-104 into Order 8247`
- `Completed packing for Order 8247`
- `Scanned out tracking …7721`

Examples that are too broad for a node:

- `Arrival`
- `Unbox`
- `Packing`
- `Scan out`
- `Station activity`

Those broad values remain filters/task categories only.

### Completion receipt

The receipt is the visual center, not another event row.

Compact state shows:

- `Fulfilled`, `In progress`, or `Needs attention`;
- one grounded sentence naming the task and subject;
- exact action count;
- started/completed times or duration when both persisted instants exist;
- `Completed on mobile` or the honest mixed-provenance alternative;
- the primary canonical record link.

Expanded state may show:

- all identifiers and canonical links;
- persisted before/after changes;
- station, workflow node, source ledger, and source event ID;
- photo evidence;
- linked ticket state;
- desktop follow-up actions.

Do not duplicate the same facts in a chip cloud. The compact face answers What / State / When. Disclosure owns evidence.

## AI-first, evidence-first

“AI-first” means the surface leads with a concise task-level explanation and next useful follow-up instead of making staff decode a raw event dump.

AI is not the source of truth:

- deterministic persisted events own identity, ordering, grouping, completion, counts, links, and provenance;
- an AI summary may rewrite those facts into one short sentence only after the deterministic receipt exists;
- the model receives a closed structured fact list and must return display prose only;
- it may not create an action, infer a missing terminal event, repair identity, or choose a different task group;
- every AI sentence must remain inspectable against the expanded exact actions;
- timeout, provider failure, or disabled AI falls back immediately to deterministic copy with no empty card and no layout shift;
- never make one browser-side model request per event or per reconciliation tick.

The deterministic receipt is sufficient to ship. AI enrichment is additive and cacheable, never on the realtime critical path.

## Current backend coverage — do not overpromise

The timeline target is broader than the feed currently emits. Preserve that
distinction in code, copy, tests, screenshots, and status reports:

- Arrival and Unbox are read from their canonical phone-origin `ops_events`.
- Packing and Scan out are read from their existing eligible phone-origin
  `station_activity_logs` facts.
- Resolver-only identification is read from `mobile_scan_events`.
- Exact `mobile_scan_event_id` correlation suppresses a resolver row only when
  its committed SAL or ops-event fact exists.
- Realtime catch-up advances independent SAL, ops-event, and mobile-scan
  watermarks.
- Mobile Picker commits `inventory_events`, which is not currently a feed
  source.
- Mobile QC commits `tech_verifications` plus best-effort `audit_logs`; neither
  is currently a feed source.

Therefore “every action you took” is the hard end goal, not present coverage.
The first frontend pass may render only the exact actions the current projection
returns. It must not manufacture missing Picker/QC nodes or claim producer
parity. Picker/QC require an approved read-model/source amendment; do not add
duplicate SAL or ops-event writers to make the screen look complete.

## Personal scope and security

The current endpoint accepts optional staff filters and defaults to all staff. Change that contract for this page.

- `GET /api/stations/live` must bind the query to `ctx.staffId` on the server.
- The RSC seed must bind the same authenticated staff ID before dehydration.
- The client must not select or submit another staff ID in the personal mode.
- Remove the staff filter from the page/contextual controls. Keep job, outcome, date, and sort filters URL-backed.
- Continue tenant-scoping every source arm by `ctx.organizationId`.
- Do not trust a query-string or request-body staff ID.
- A future supervisor/all-staff monitor is a separate explicitly permissioned product decision; do not leave a hidden toggle or compatibility mode here.

Required API tests:

- staff A receives only staff A rows even if the URL asks for staff B;
- staff B cannot see staff A rows;
- organization isolation remains intact;
- unauthenticated and permission-denied requests fail;
- the RSC seed and client catch-up use the same personal cache identity.

## Deterministic task grouping

Do not group events by visual proximity or an arbitrary time window.

Add a server-derived task projection to the wire contract:

```ts
interface StationHistoryAction extends StationFeedItem {
  actionKind: string;        // closed display registry key
  actionLabel: string;       // exact deterministic verb
  taskKey: string;           // stable persisted correlation
  terminal: boolean;
  evidenceCount: number;
}

interface StationHistoryTask {
  key: string;
  job: StationFeedJob;       // category/filter only
  state: 'in_progress' | 'fulfilled' | 'needs_attention';
  subject: StationFeedSubject;
  startedAt: string;
  completedAt: string | null;
  completedEntirelyOnMobile: boolean;
  actions: StationHistoryAction[];
}
```

Task-key precedence:

1. persisted workflow/task-run correlation when present;
2. exact resolver→commit correlation (`mobile_scan_event_id`) when that is the real task boundary;
3. canonical persisted workflow node plus canonical subject when that pair is guaranteed unique by the domain;
4. source-prefixed event ID as an honest singleton task.

Never use “same barcode within N seconds” or “same subject near the same time.” Sparse grouping is better than a false history.

Completion comes from a closed action registry beside `src/lib/station-feed/event-map.ts`. Each supported persisted event maps to:

- exact action kind and copy;
- glyph/tone;
- whether it is terminal;
- subject/canonical link requirements;
- evidence fields;
- attention semantics.

Unknown event types remain omitted and counted in diagnostics. Do not display guessed copy.

## Existing pieces to extend, not fork

- `src/components/ui/EventTimeline.tsx` — the house vertical timeline, day bands, glyph circles, rail, exact timestamps, identifiers, media, and photo viewer integration. Extend it with the smallest task/action disclosure API needed; do not build `PersonalTimeline` as a second primitive.
- `src/design-system/components/Collapse.tsx` — the only legal height reveal. Use `Collapse`/`CollapseItem`; never animate `height` directly.
- `src/components/mobile/daily/MobileTaskFollowUps.tsx` and `src/features/task-board/TaskRailTimeline.tsx` — compact two-line row and individual expansion references. Reuse their information hierarchy, not their duplicate implementation.
- `src/design-system/primitives/Panel.tsx` or `src/design-system/components/WorkspaceCard.tsx` — completion receipt shell. Use `cornerClass('surface')`; no literal radius or bespoke card shell.
- `src/components/shipped/photo-gallery/usePhotoGallery.ts` + `PhotoViewerPortal` — fullscreen photo review. Never create another lightbox.
- `src/components/photos/RecordPhotosDoor.tsx` or the existing EventTimeline media strip — learned photo doorway.
- `src/lib/support/support-sidebar-shared.ts` `supportCreateTicketHref` — order-anchored ticket creation.
- `/support?ticket=<id>` / existing ticket detail/composer — reply to a linked ticket. Do not invent another ticket composer.
- `StationFeedSubject.href` — canonical record navigation, including receiving subjects. Do not rebuild receiving claim deep links in the timeline.
- `src/hooks/useStationLiveFeed.ts` — current durable three-watermark catch-up and 30-second reconciliation. Keep it; regroup its deduplicated items into tasks.

Before React edits, call `ds_contract` for EventTimeline, Collapse, the receipt shell, photo doorway, and action row. After edits, run `ds_critique` on every changed UI file.

## Desktop fallback actions

Actions live in the selected task receipt, near the evidence they affect. Do not put a global action bar above the history.

- **Open record:** always uses `task.subject.href`.
- **View photos:** shown only when canonical media exists; opens the shared `PhotoViewerPortal`.
- **Create ticket:** shown only when the subject has a supported canonical create path. For order subjects use `supportCreateTicketHref`. Receiving subjects navigate through the existing canonical record/ticket display; do not add a timeline-owned claim flow.
- **Reply to ticket:** shown only when a linked ticket ID exists; opens the existing support ticket surface/composer.
- **No ticket or photos:** omit the action. Do not paint disabled noise.

No N+1 reads:

- the initial history request must not fetch linkage/photos once per task;
- load heavy photo/ticket detail only for the selected/expanded task, or include a bounded summary in the primary response;
- reuse React Query identities already owned by photo/ticket surfaces;
- changing selection cancels or supersedes stale detail work.

Mobile parity is binding:

- View photos already has a mobile viewer path;
- ticket reply uses the existing mobile ticket thread;
- any new Create ticket doorway must have a working `/m/*` path before the desktop button ships;
- desktop may make these easier to read, but may not become the only place to perform them.

## Motion and Motion Plus contract

The repository already uses `motion@12.42.2` and a guarded Motion Plus wrapper.

- Import Motion through `@/design-system/motion`, never `framer-motion`.
- Put any new transition/presence recipe in `src/design-system/foundations/motion-presets.ts` and consume it through the reduced-motion hooks.
- Use stable source IDs/task keys. A reconciliation containing the same IDs must produce no new animation.
- RSC-seeded history paints immediately. Do not stagger all initial rows on hydration.
- A newly prepended realtime action may fade/translate a few pixels into place and briefly resolve its circle/rail state. Use transforms and opacity only.
- When a terminal action arrives, the completion receipt may crossfade/settle once. No bounce, confetti, pulsing green loop, or repeated celebration.
- The vertical rail may reveal with `scaleY` and a fixed transform origin; never animate width/height.
- Task/row expansion uses `Collapse`, not raw Motion height animation.
- Layout movement uses `LayoutGroup`/position layout only when needed and is disabled under reduced motion.
- Motion Plus is optional and must come through existing wrappers. `AnimatedStat` may animate the exact action count or duration once; do not use Typewriter for operational facts.
- Reduced motion keeps instant state changes or short fades, removes travel/scale/stagger, and preserves every fact.
- New completion is announced once through a polite live region. Motion is never the only completion signal.

Performance invariants:

- no object allocation in per-frame callbacks;
- no `MotionValue.get()` during render;
- no always-running animation;
- no scroll-linked effect for this history;
- no remounting the whole task list on a watermark change.

## Realtime behavior

Continue using the durable sources and wake-up-only realtime design already present:

- `station_activity_logs` → `activity.logged`;
- `ops_events` → `ops.event.logged`;
- `mobile_scan_events` → `mobile.scan.logged`;
- one organization station channel;
- catch up by all three source watermarks;
- visible-page reconciliation every 30 seconds;
- exact source-ID dedupe.

Personal scope is applied to the snapshot/catch-up query, not to the channel grant. A notification wakes the personal query; it does not carry trusted row content.

When a new action arrives:

1. merge by namespaced source ID;
2. derive/update its deterministic task;
3. preserve current task selection and open disclosures;
4. do not scroll unless the user explicitly activates a `New activity` affordance;
5. if the selected task becomes terminal, update the receipt and announce completion once;
6. if the page is degraded, keep cached history and show the honest delayed state.

## Files expected to change

Primary:

- `src/app/stations/live/page.tsx`
- `src/app/api/stations/live/route.ts`
- `src/lib/station-feed/types.ts`
- `src/lib/station-feed/event-map.ts`
- `src/lib/station-feed/query.server.ts`
- `src/lib/queries/station-live-feed.ts`
- `src/lib/queries/station-live-feed-seed.server.ts`
- `src/hooks/useStationLiveFeed.ts`
- `src/components/stations/live/StationLiveFeed.tsx`
- `src/components/ui/EventTimeline.tsx` only for a genuinely reusable extension
- `src/design-system/foundations/motion-presets.ts` only for named missing motion roles
- `src/lib/sidebar-navigation.ts` for label/copy, not another route

Tests live beside their contracts. Do not create source-text or animation-timing tests.

## Migration status

The owner approved applying every pending migration on 2026-10-01 and then
explicitly authorized clearing the migration-integrity blocker.

Confirmed migration target for this worktree:

- `DATABASE_URL` was loaded from the worktree `.env`, not the process
  environment or `.env.local`;
- target fingerprint (SHA-256 prefix of host/database):
  `2a61d8e1f2da4bd3`;
- database: `neondb` on the configured pooled Neon endpoint;
- `DATABASE_URL_UNPOOLED` is configured for migrations that require a direct
  session;
- configured SSL mode is `require`. The emitted libpq compatibility notice is
  a future-driver warning, not a migration failure.

The exact blocker was a post-apply edit to the untracked
`2026-09-30_backfill_stn_org_from_packer_logs.sql` file. The ledger held SHA-256
`d83fecbbe7e07fd5625ec59a8c3e60916c0d737805b9c3ffa30aea3ae332a7bc` from
`2026-10-01T03:41:44.042Z`; the current file hash was
`5bf920744addb2715dac49123267d2e4cdc809991ae93673c11683113653340e`.
The exact applied bytes were unavailable.

Resolution and observed postconditions:

- One guarded transaction locked the ledger row, required the old hash,
  re-executed the current idempotent repair SQL, passed its post-check, changed
  only that ledger hash to the current file hash, and preserved `applied_at`.
- The supported `pnpm db:migrate` runner then found and applied
  `2026-09-30_station_live_feed_indexes.sql` and the concurrently added
  `2026-10-01_backfill_sep30_forgotten_scan_out.sql`.
- `pnpm db:migrate:dry` now reports
  `up to date — 786 migrations on record, 0 pending`.
- Ledger hashes exactly match all three current files.
- All five station-feed indexes are present:
  `idx_sal_org_phone_created`,
  `idx_sal_org_phone_mobile_scan_event`,
  `idx_ops_events_org_phone_occurred`,
  `idx_ops_events_org_phone_mobile_scan_event`, and
  `idx_mse_org_created_id`.
- The ownership repair post-check reports zero derivable NULL-organization
  tracking rows.
- The forgotten-scan-out migration inserted its expected two durable rows.

No before/after `EXPLAIN (ANALYZE, BUFFERS)` artifact was captured before the
station indexes were applied. Keep the query-plan evidence gate open; do not
reconstruct or fabricate a historical baseline.

## Implementation order

1. Enforce personal server scope and add route/RSC tests.
2. Add the exact action registry and deterministic task projection without changing producer truth.
3. Build the compact task/action model and completion receipt from current durable facts.
4. Reshape `/stations/live` into My history using the existing EventTimeline and one responsive tree.
5. Add selected-task photo/ticket fallbacks without N+1 requests.
6. Add named Motion presets, reduced-motion behavior, and live announcements.
7. Prove realtime insertion, terminal completion, refresh durability, and canonical links at `http://localhost:3050`.
8. Treat the station-feed indexes as applied; capture current query plans before changing the query or index set again.
9. Run repository verification and reconcile this handoff against observed evidence.

## Exact acceptance contract

### Personal truth

1. With authenticated staff A, initial HTML and every catch-up response contain only staff A's actions.
2. Supplying staff B in the URL cannot expose staff B's rows.
3. The page has no staff picker and no hidden all-staff mode.
4. Refresh, tab close/reopen, and realtime reconnect preserve the same durable personal history.

### Action and task truth

5. Every circle corresponds to one persisted source ID and shows a specific action, not merely a broad job name.
6. Every task key follows the deterministic precedence above; no time-window grouping exists.
7. Resolver identification is visually distinct and never completes a task.
8. `Fulfilled` appears only after a mapped terminal event.
9. `Completed on mobile` appears only when all grouped actions and the terminal action prove phone origin.
10. Unknown event types are omitted and counted, never guessed.
11. Exact identifiers and canonical links survive compacting/expansion.

### Surface and disclosure

12. The newest task is readable without expanding anything.
13. A compact action row exposes exact verb, useful identifier, and time.
14. Expanding one action reveals evidence without collapsing another action or moving focus.
15. Desktop keeps one centered sticky selected-task receipt without covering the rail.
16. Phone renders the same receipt/actions in flow with no horizontal overflow at 375px and 390px.
17. Keyboard users can select tasks, toggle actions, open links, and reach every fallback action; focus returns correctly after overlays.
18. Empty, loading, reconnecting, cached-stale, and hard-failure states remain distinct.

### Desktop fallback, mobile primary

19. Open record reaches `StationFeedSubject.href`.
20. View photos opens the shared fullscreen viewer and only appears with media.
21. Create ticket uses an existing canonical support/record path and only ships when its mobile equivalent works.
22. Reply opens the existing linked ticket thread/composer and only appears for a linked ticket.
23. No Pick, Pack, Unbox, QC, Arrival, or Scan-out commit control exists on desktop history.
24. A completed task can be demonstrated end to end with all task actions performed on `/m/*`, then reviewed on desktop.

### Realtime and motion

25. A new current-staff phone action appears on the open desktop without manual refresh.
26. Another staff member's action may wake the channel but never appears in the personal query result.
27. Duplicate wake-ups and reconciliation do not duplicate or reanimate existing actions.
28. New rows do not steal focus, jump scroll, change selection, or close disclosures.
29. A terminal action updates the selected receipt once and announces completion once.
30. RSC-seeded rows do not replay a full-list entrance animation on hydration.
31. Reduced-motion mode removes travel/scale/stagger while preserving state and feedback.
32. Expansion uses `Collapse`; no raw height animation or literal motion timings are introduced.

### Request shape and verification

33. Initial render uses the RSC seed and one personal feed query, not per-task or per-event requests.
34. Photo/ticket detail loads only for the selected/expanded task or from a bounded primary payload.
35. API tests cover staff enforcement, organization isolation, filters, cursors, and three watermarks.
36. Contract tests cover action mapping, terminal semantics, task-key precedence, mobile-only provenance, unknown types, and dedupe.
37. Hook tests cover duplicate wake-ups, missed-message catch-up, reconnect, selected-task preservation, and all watermark merges.
38. Authenticated browser smoke at `http://localhost:3050` performs a real mobile action, observes the exact action node, verifies the receipt, refreshes, opens the canonical record, and exercises any available photo/ticket fallback.
39. Verify the actual surface at phone and desktop widths, with normal and reduced motion.
40. `pnpm verify:fast` passes. Run `pnpm verify`; report unrelated concurrent failures with exact current files instead of repairing unrelated work.

## Refusals

- No all-staff default or staff picker.
- No client-trusted actor filter.
- No heuristic task grouping.
- No AI-authored facts or completion state.
- No second timeline primitive.
- No N+1 photo/ticket queries.
- No desktop execution clone.
- No right-rail feed.
- No raw `framer-motion` import, inline transition literals, manual height animation, confetti, perpetual pulse, or typewriter operational facts.
- No further migration-runner bypass or manual migration-ledger edit.
