# HANDOFF — Personal top-left line + Unbox unfound scan → Zendesk ticket pairing

Paste everything below the rule into a fresh session at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

---

You are continuing CycleForge's header + scan-station work. Build two things, in
this order, then prove both live at `http://localhost:3050` (the only dev origin;
lane unit `cycleforge-lane@prod` is already running — never start another server).
Sign-in for probes: `POST /api/auth/signin` JSON
`{"staffId":1,"pin":"","deviceKind":"personal"}` (HTTP 429 = rate limited; wait and retry).

## 0. Where things stand (2026-09-29, all uncommitted in the worktree)

The header is split by WHO acts (owner law, 2026-09-29):

| Zone | Shows | Code |
|---|---|---|
| Top-left (right of the sidebar hairline) | What **you** do next — on `/unbox`, the last scan's feedback the instant it is known (`Checking …` → `Found — order on file for …` / `Unfound — no order matches …`; for an unfound carton, `Unfound … — searching tickets…` → `linked to #N` / `N tickets, pick one` / `no ticket mentions it` / `connect Zendesk`), glyph + tone morph; clicking it opens this session's scan history. Otherwise the page's next step from `PAGE_NEXT_ACTIONS` | `src/components/layout/HeaderWork.tsx` `HeaderNextAction` + `UnboxScanHistory.tsx`; store `src/lib/receiving/unbox-scan-feedback-store.ts` (fed by `useTrackingScan` → `GET /api/receiving/scan-verdict`, one DB round trip via `src/lib/receiving/scan-match-probe.ts`, and by `applyUnmatchedCarton`); pure model `unbox-scan-feedback.ts`; `src/lib/nav/next-actions.ts` (+ stale-key test) |
| Top-right | What the **system** is doing — Sync spins for syncs AND prints (no text); a print job exists ONLY as its overlay card (hover → red stop, Pause/Resume, macOS × dismiss); Sync's panel lists print jobs above syncs | `GlobalHeaderSync.tsx`, `PrintJobBanner.tsx`, `HeaderWork.tsx` `PrintJobOverlay`, store `src/lib/background-work/store.ts` (kinds `sync`/`print`, pause/resume/cancel + `checkpoint()`) |

Laws you must keep:
- Top-left NEVER shows system work and NEVER repeats Find / ⌘K lines ("scan or paste a tracking #…", F, ⌘K). Those live only in the search field.
- Top-right NEVER adds a second pill or counter for something already shown as a card. One thing, one place.
- Top-left text rolls via `RollingHint` (`src/design-system/components/FindField.tsx`) — it animates only on hover or when its content CHANGES (a new sentence rolls in once); it never loops on its own (`src/design-system/pinned.json` FindField law). Lines ≤ 47 characters. Exception (owner 2026-09-29): an Unbox scan line carries the FULL tracking number, right after its verb, in a `w-lg` slot, and every ticket state shows the Ticket glyph.
- Motion: transform/opacity only, springs from `@/design-system/foundations/motion-presets`, `useReducedMotion` → fades. Tokens, never literals (`node tools/design-mcp/ds.mjs tokens <axis>`); ask `node tools/design-mcp/ds.mjs contract "<job>"` before building UI.
- Clean cutover: migrate every caller, delete what the change obsoletes, no shims.

## 1. Personal top-left line — "what is waiting for YOU, live"

Goal: the top-left line becomes personal and real-time. Above the page's next
step it shows, as they arrive, the things addressed to the signed-in staffer:

1. **A message sent to you** (staff-to-staff): `/api/staff-messages`
   (`src/app/api/staff-messages/route.ts`, queries `src/lib/neon/staff-messages-queries.ts`),
   published live by `publishStaffMessage` (`src/lib/realtime/publish.ts:545`) on the
   per-staff inbox channel (`getInboxChannelName`). Line: `Dana: "Box 4 is short a cable"`.
2. **A record handed to you** (WS-TASKS): `staff_inbox_items`, written by
   `src/lib/notifications/assign-inbox-item.ts`; already surfaces as ActivityInbox kind
   `work_task` (`src/contexts/ActivityInboxContext.tsx:35-44`). Line: `Dana handed you order 12-15163`.
3. **A task assigned to you** (Daily tasks / work assignments with `assignee_staff_id` = you;
   Daily agenda rows in `src/lib/daily/daily-agenda-row.ts`, API `src/app/api/tasks`).
   Line: `New task for you: Re-test the swollen battery`.

Design (build exactly this unless the code proves it wrong):
- ONE source: read the existing `ActivityInboxContext` (it already merges
  `staff_message` + `work_task` live over the inbox channel). If assigned tasks are not
  in it, add them there as a producer — do NOT create a second inbox store.
- A pure resolver `resolvePersonalLine(inboxItems, now)` → the newest unread personal
  item (message > handed > assigned when simultaneous), or null. Unit-test precedence,
  read/unread, and staleness.
- `HeaderNextAction` shows the personal line when one exists (new icon per kind,
  morphing via `AnimatePresence mode="wait"` + `defineStateMotionContract` like the
  print card glyphs), else the page's next step. A new personal item rolls in ONCE
  (RollingHint content change). Clicking the personal line opens that item (the
  inbox item's own href / the Inbox panel focused on it) and marks it read; the line
  then falls back to the page's next step.
- Screen readers: one polite live announcement per new personal item.
- Do not duplicate: the Inbox button's count stays the inbox's count; the top-left
  shows the ONE newest item's text, never a count.

Acceptance: at :3050, staffer A (second browser context, e.g. staff 2 via the same
sign-in body) sends staff 1 a message through `/api/staff-messages` → staff 1's
top-left rolls to `A: "<text>"` within ~2 s without reload; clicking it opens the
message and the line returns to the page's next step. Same for a handed record
(assign via the existing hand-off flow) and an assigned task. Screenshots under
`/tmp/personal-*.png`.

## 2. Unbox: unfound tracking → "Searching Zendesk…" → paired ticket feedback

> **Built (2026-09-29), with the placement changed by the owner:** the ticket outcome shows
> on the header's top-left line, with a scan-feedback history. The active UX/UI
> follow-up is `docs/design-system/HANDOFF-unbox-receiving-ux.md`; its “Existing
> work” section records the result and prevents its regression. The older
> `docs/performance/HANDOFF-unbox-speed-and-ticket-mirror.md` §4 is historical
> implementation detail. The carton-pane status line this section describes was
> not built.

The owner will test this personally: scan a tracking number on the **Unbox** scan
station (`/unbox`) that matches no PO. Today the carton is created as unfound and
nothing tells the operator about support tickets.

Existing pieces (read-only map: this session's `UnboxHistoryMap` result; key facts):
- Unfound path: `POST /api/receiving/lookup-po` unmatched branch
  (`src/app/api/receiving/lookup-po/route.ts` ~L1600-1700) returns
  `{ receiving_id, exception_reason:'not_found', unbox_verdict:'unfound', … }`.
  Client: `useTrackingScan.ts` → `resolveViaLookupPo` → `applyUnmatchedCarton`
  (`src/components/sidebar/receiving/scan-apply.ts` ~L417) auto-opens the carton's
  workspace. Carton record flag `unfound` in `use-carton-record.ts` ~L124.
- Ticket search by tracking ALREADY EXISTS: `GET /api/receiving/zendesk-claim/link?receivingId=N&query=<tracking>`
  (`src/app/api/receiving/zendesk-claim/link/route.ts` L37-62) → `{ tickets: TicketLinkCandidate[] }`
  (`{id, subject, status, linkedToThis}`); 503 = helpdesk not connected. Carrier tracking is
  routed to Zendesk search (`resolveTicketLinkQueryKind`, `src/lib/support/ticket-link-query.ts`).
  Linking: `POST` on the same route (`linkTicketToAnchor`, L64), audited as
  `support.ticket.linked`. Client hooks: `useTicketSearch` (`src/components/support/link/`)
  and `buildClaimTicketSearchParams` (`useClaimTicketSearch.ts` L24) — today used only
  inside Claim → Link.

Build:
- `useUnfoundTicketProbe({ receivingId, tracking })` over the shared `useTicketSearch`
  with the route above; enabled only for an unfound carton; keyed off `receiving_id`
  (so re-opening the carton shows it too), not the transient scan result.
- Pairing rule (default — keep unless the owner says otherwise): if the search returns
  EXACTLY ONE ticket not already linked elsewhere, pair it automatically via the POST;
  if several, show them with a one-click **Pair** each; if one is already
  `linkedToThis`, show it as paired without re-posting.
- UI on the unfound carton (the auto-opened Unbox workspace, near the unfound
  verdict; follow `ds_contract` for the status-line / verdict primitive) with states:
  - searching: Search glyph + `Searching Zendesk for 9400 1081 0624 …` (format the
    tracking with the existing tracking display helper);
  - paired: Ticket glyph + **Paired to ticket #48213 — "Where is my order?"** with the
    ticket status and a link to open the ticket; success tone; this is the owner's
    proof that the system paired correctly;
  - several matches: list with Pair buttons;
  - none: `No Zendesk ticket mentions this tracking`;
  - helpdesk not connected (503): `Connect Zendesk to match tickets` + link to settings.
  Glyph morphs between states (`AnimatePresence mode="wait"`, state motion contract).
- The top-right SYSTEM side may show that a ticket search is running only if it uses
  the existing background-work store as a new kind with a card-free, icon-only
  treatment — do NOT add a pill. Simplest correct option: no header change; the
  carton UI owns the feedback.
- Mobile parity (repo law, `docs/mobile-first/SURFACE_LAW.md`): the phone unfound
  verdict (`src/components/mobile/redesign/scan-verdict.ts` 'unfound') shows the same
  searching / paired line via the same hook.

Acceptance (the owner's test):
1. On `/unbox`, scan a tracking number that has no PO but appears in a Zendesk ticket →
   the carton opens as unfound, the line reads `Searching Zendesk for …`, then
   `Paired to ticket #N — "<subject>"`. Re-opening the carton still shows it paired.
   The pairing is persisted (ticket link row + `support.ticket.linked` audit).
2. A tracking number in no ticket → `No Zendesk ticket mentions this tracking`.
3. With Zendesk disconnected → the connect hint, no error toast.
Find a real test tracking number first: query Zendesk through the existing search
route with a recent unfound tracking (Exceptions › Unfound lists them) or ask the owner
for one; never invent a tracking number or create Zendesk tickets.

## 3. Verify before calling it done

- Targeted tests for new pure code (`pnpm exec tsx --test <files>`; files that import
  the db need `set -a; . ./.env; set +a`; server-only modules run with
  `node --import tsx --import ./scripts/register-server-only-shim.cjs --test <files>`).
- `pnpm verify:fast` green.
- Live proof at :3050 with screenshots for every acceptance state above.
- Update this handoff's §0 table and `docs/design-system/HANDOFF-print-station-and-batch-printing.md`
  where behaviour changed. Do not deploy unless the owner says so.
