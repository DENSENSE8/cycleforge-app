# Daily triage — Frontend workbench (for validation)

**Status:** Proposal — **needs validation** (do not schedule build until pressure-tested)  
**Created:** 2026-07-31  
**Companion backend plan:** [`daily-triage-BACKEND-PLAN-VALIDATION.md`](./daily-triage-BACKEND-PLAN-VALIDATION.md)  
**Cursor plan:** `~/.cursor/plans/triage_frontend_workbench_c7e2bfc5.plan.md`  
**Execution prompt (F0 only — buildable now):** [`daily-triage-frontend-F0-EXECUTION-PROMPT.md`](./daily-triage-frontend-F0-EXECUTION-PROMPT.md)  
**Related:**
- [`contextual-my-day-home-plan.md`](./contextual-my-day-home-plan.md)
- [`home-ops-tv-collab-surfaces-plan.md`](./home-ops-tv-collab-surfaces-plan.md)
- [`.claude/rules/contextual-display.md`](../../.claude/rules/contextual-display.md)
- [`.claude/rules/ui-design-system.md`](../../.claude/rules/ui-design-system.md)
- [`docs/settings-registry.md`](../settings-registry.md)

> Validate with operators before implementation. Backend feed/APIs must land (or be stubbed) for F1+. Update the **Validation log** below as checks land.

---

## Verdict (working)

`/` Today becomes the **main daily triage** workbench. The screenshot **My Day** left column is extracted as a shared SoT rail and imported on Dashboard + Unbox. Subscription-born rows (pinned tracking, messages, bad-feedback tickets) appear as filterable tasks. No second feed logic in the client.

**Depends on:** Backend B0–B3 (feed + subscribe), B1 (pin tracking), B7–B8 (messaging + bad feedback) for full surfaces; F0 can start against current `/api/my-day`.

**Out of scope:** Webhooks/migrations/fan-out · email client · Ops TV/Brief · second link UI.

---

## Product UI goals

1. Today = categorized open/done triage (queues + subscription tasks)
2. `MyDayRail` SoT on `/`, `/dashboard`, `/unbox`
3. Filters: urgent · assignee · category · open/done
4. Pin tracking → status updates as triage rows
5. Platform messages + auto bad-feedback tickets visible on Home + Support + entity chips

---

## Phases

### F0 — Extract My Day rail SoT

Split `src/features/my-day/MyDayWorkspace.tsx`:

| Module | Role |
|---|---|
| `MyDayRail` | Do next · Assigned · Queues · Needs attention |
| `MyDayTriagePane` | Main categorized board |
| `useMyDayFeed` | Client of `GET /api/my-day` |

Mount rail on Home Today, Dashboard context, Unbox station context.

**Validate:** On Dashboard/Unbox, does the rail replace the current context panel, sit above it, or toggle? Station scan-first Unbox — is a personal triage rail welcome or noise?

### F1 — Today main triage display

Workbench list → select → detail:

- Categories match backend `TriageTask.category`
- Open/done + urgency badge
- Detail: grow `MyDayContextPane`; linked order/ticket → non-modal right rail
- Linkage strip: compose Support `LinkageStrip` / context hub

**URL filters:** `?urgent=1&assignee=mine|unassigned|<id>&category=&state=open|done`  
Inbox mode stays deep ledger; Today is the action board.

**Row actions:** Start · Mark done · Assign… · Pin/Unpin

**Validate:** Category IA for floor staff (too many buckets?). Mobile `/m/home` — same rail later or desktop-only v1?

### F2 — Pin tracking UI

`SubscribeToggle` on Incoming tracking detail, order shipped tracking row, triage tracking rows. Copy: “Pin tracking updates” / “Watch status”. Hide when `home_inbox` off.

**Validate:** Which surfaces are highest-value for pin (Incoming vs Shipped vs Unbox)? Spam risk if every status ping shows as a task?

### F3 — Platform messages UI

- Today **Messaging** category
- Support: capability-gated conversation list/mode; escalate via `SupportCreateTicketModal`
- Do **not** use Zendesk composer or claim clipboard as primary marketplace reply UX until send API exists

**Validate:** Is a Support mode enough, or does messaging need its own Home mode? Reply-on-platform CTA acceptable for v1?

### F4 — Bad feedback settings + shared displays

**Settings Registry** (keys from backend B8):

- Auto-create ticket on bad feedback
- Threshold
- Default assignee

Grow `SettingPage` beyond `'receiving'` — registry-driven UI only.

| Surface | Expectation |
|---|---|
| Home Today | Feedback / Support rows; urgent for bad feedback |
| `/support?ticket=` | Focus created ticket |
| Order / Unbox chips | `ticket_links` light up |
| Dashboard / Unbox rail | Assignment interrupts |

**Validate:** Settings under Support vs Integrations? Who may change auto-ticket policy (admin only)?

### F5 — Handoff UX

Routine handoff = **Assign** + optional thread note. Create-ticket modal for net-new helpdesk only. Staff DM stays human chat, not ticket transport.

**Validate:** Does this match how support actually hand off today?

### F6 — Verify

E2E QA org: pin → Today row; bad-feedback ticket on Home + Support; filters; rail on Dashboard/Unbox. DS ratchets + `npm run verify`.

---

## Open questions (fill during validation)

1. MyDayRail placement on Unbox/Dashboard (replace vs compose)? — **Unbox half is no longer open — it's a hard constraint, not a preference.** Repo audit: Unbox's left `ContextPanelLayout` slot is a single-return dispatcher already returning the Queue/Viewed/History rail (`ReceivingSidebarPanel`), and the right edge is a mutually-exclusive stack (Displays/Ticket/Claim/tool/`detail:receiving`) that is already full. There is nowhere to mount a rail on Unbox today without evicting an existing occupant or growing a new region — this needs an explicit "evict X" or "add a region" decision, not a "welcome or noise" judgment call. Dashboard half stays open, but is now two distinct candidates, not one: the left `ContextPanelLayout` (→ `DashboardOrdersContextPanel`) and the right `RightRailHost` `detail:order` occupant — pick one explicitly.
2. Desktop-only v1 for triage pane? — **working answer: yes**, pending operator confirmation. Desktop-first is the existing precedent for every Workbench surface in this app (Products, FBA board, Outbound); the mobile/handheld-first convention from generic warehouse-ops UI belongs to the Station contract (scan-driven, floor density), not this pick+edit board. Confirm floor staff don't expect to triage *from the scan bench* — if they do, that's a Station surface question, not this one.
3. Pin notification fatigue — show all status changes or only delivered/exception? — **working answer: milestone-only** (delivered / exception / delayed). Default-to-silence is the notification-UX consensus: surface a Today row only when the event is subscribed-to *and* time-sensitive/decision-worthy; batch everything else into a digest rather than a live row per carrier scan. Encode this as a backend rule in B1/B3 so it isn't left to UI-side dedup.
4. Messaging: Home category only vs Support mode vs both? — **still open, but sharpened.** Repo audit: Home already ships a live "inbox" mode ("what changed on things I follow") powered by the same `staff_subscriptions`/`SubscribeToggle` machinery this plan wants to extend for messages — decide whether Messaging is a category inside that existing mode or a true third surface before building either, to avoid two overlapping "things I'm subscribed to" views.
5. Can F0 ship before backend B3, with triage pane as a thin shell? — **still open.** This is a build-sequencing call, not a UX question — no industry pattern resolves it.

**Surfaced by research — add to the validate list:**

6. Category IA — cap `TriageTask.category` at 5–7 buckets (Miller's Law: primary IA categories degrade in findability beyond that) and confirm the set via a card-sort with floor staff rather than by assumption. Linear's own Triage view deliberately keeps groupings closed (ordering only) rather than open-ended.
7. Row actions — planned set (Start · Mark done · Assign… · Pin/Unpin) skews toward "do the work," matching Linear's accept/decline/duplicate/snooze pattern except for a Snooze/defer equivalent. If F5 handoff volume turns out high, revisit whether "defer without losing it" needs its own action.

---

## Validation findings — repo audit (2026-08-01)

Complementary to the industry-pattern pass above: this checks the plan's file/component claims against actual code. **Net: F1/F4/F5/F6 are accurately scoped. F0 overstates what's left to extract in one place and understates a real structural blocker in another. F2 proposes a placement that conflicts with an already-shipped house rule.**

**F0 — the "split" is smaller than described, and Unbox has no free slot.** `useMyDayFeed` and `MyDayContextPane` are **already** separate files, imported by `MyDayWorkspace.tsx` — nothing to extract there; the plan lists them as F0 deliverables when they pre-exist (this is presumably why the companion F0 execution prompt could be written already). The actual unextracted piece is the left list (inline JSX inside `MyDayWorkspace.tsx` today) — that's the real `MyDayRail` scope; `MyDayTriagePane` isn't a distinct thing yet, `MyDayWorkspace` plays that role today. Unbox placement is a hard constraint, not an open question — see Open Question #1 above. Also: composing `SidebarRailShell` for `MyDayRail` would be the wrong move even though house law says "compose, don't fork" — that shell's actual prop contract is one homogeneous fetch + per-row optimistic patch + grouping (the recent-activity-feed job), while My Day's data is four heterogeneous shapes (`doNext` single object, `assigned[]`, `interrupts[]`, `queueCards[]` counts) with no per-row patch semantics. Growing a new named shell here is the honest `pattern-evolution.md` call, not a fork — worth stating explicitly so a reviewer doesn't bounce the PR citing the rail SoT.

**F1 — mostly accurate; two gaps.** `MyDayContextPane` exists and already runs through the reduced-motion bridge, so "grow" is the right verb, not "create." Reusing `RightRailHost` will work, but the plan omits the **stable-occupant-id requirement**: a queue-walking inspector (which F1's "select → detail" implies) should register a stable id like `detail:triage-task`, not per-record `detail:triage-task:<id>`, to avoid an exit→empty→enter flash on every arrow-step — the same rule `detail:order`/`detail:receiving` already follow. `LinkageStrip` exists and does the right job but is coupled to `'receiving'|'tracking'` anchor types only — "compose" undersells the bundle-shaping needed once `TriageTask` categories go beyond those two. **URL param collision:** `?category=` already has a live meaning on `/dashboard` (read there as a legacy alias for `?mode=` domain routing) — not active on bare `/` today, but a landmine if this rail is later composed onto Dashboard per OQ1. `urgent`/`assignee` are clean; `state` is reused elsewhere with no live collision.

**F2 — proposes a placement that conflicts with a shipped rule.** `SubscribeToggle` exists and is already used on the Home inbox row, but its own docblock states it's *deliberately excluded from station surfaces (Unbox, Triage, Testing)* per `display/station.md` — station rows don't carry a bell. F2's "triage tracking rows" placement, if that means Station Triage, directly conflicts with this; "Incoming tracking detail" and "order shipped tracking row" are fine (Workbench surfaces). Resolve which one before F2 is scheduled — don't ship both as written. `home_inbox` flag spelling is confirmed exact as used in the doc.

**F3 — low structural risk; one real gap.** Support's `?mode=` dispatcher takes a new branch cheaply. `SupportCreateTicketModal` and the "claim clipboard" reply flow (AI drafts a seller message, copies to clipboard, no send-to-marketplace API exists) are both confirmed real — the plan's caution is well-grounded, not hypothetical. Gap: see Open Question #4 — Home's existing "inbox" mode overlap isn't named in the plan.

**F4/F5/F6 — confirmed accurately scoped.** `SettingPage` is a literal `'receiving'` type today (single registry entry, single render branch) and `docs/settings-registry.md` already anticipates widening it — real but mechanical work, matching the plan's framing. `WorkOrderAssignmentCard` (prev/next carousel, confirm→advance) and `ThreadNoteComposer` (tied to `entity_threads`) both exist and do exactly what F5 assumes. The QA-org E2E pattern in F6 matches `verify.md` exactly.

**Naming collision:** `MyDayRail` — zero hits anywhere in the codebase today, clear to use.

---

## Validation log

| Date | Who | Result |
|---|---|---|
| 2026-08-01 | Claude (repo audit) | **F0:** `useMyDayFeed`/`MyDayContextPane` already exist as separate files — nothing to extract there; real scope is only the left list. Unbox has zero free slots for a rail (both context-panel and right-edge regions are already fully occupied) — a hard placement constraint, not a UX call. `MyDayRail` should be a new named shell, not a `SidebarRailShell` fork (data shapes don't match that contract). |
| 2026-08-01 | Claude (repo audit) | **F1:** `MyDayContextPane`/`RightRailHost` reuse is sound but needs a stable occupant id (`detail:triage-task`, not per-record) to avoid exit/empty/enter flash on queue walk. `LinkageStrip` is real but anchor-type-coupled to receiving/tracking only. `?category=` collides with an existing `/dashboard` alias for `?mode=` — fine on bare `/`, a risk if composed onto Dashboard. |
| 2026-08-01 | Claude (repo audit) | **F2:** `SubscribeToggle`'s own docblock excludes it from station surfaces (Unbox/Triage/Testing) per `display/station.md` — the plan's "triage tracking rows" placement conflicts with this if it means Station Triage. Resolve before scheduling. |
| 2026-08-01 | Claude (repo audit) | **F3:** Home already ships an overlapping "inbox" mode on the same subscription machinery — name the relationship to the new Messaging surface before building. F4/F5/F6 confirmed accurately scoped as written; no changes needed. |
| 2026-08-01 | Claude (industry-pattern research) | **Category IA (F1, OQ1):** cap `TriageTask.category` at 5–7 buckets (Miller's Law precedent) and validate the set with a card-sort against real floor staff rather than assuming it. Linear's own Triage view only lets you reorder, not invent new groupings — resolution is a fixed small state set. |
| 2026-08-01 | Claude (industry-pattern research) | **Pin notification fatigue (F2, OQ3):** notification-UX consensus is default-to-silence — surface a task only if explicitly subscribed, time-sensitive, needs a decision only that user can make, or carries context unavailable elsewhere. Recommend pin subscriptions mint a Today row only on milestone events (delivered/exception/delayed), not every intermediate carrier scan; batch the rest into a digest (Notion's pattern) rather than a live ping. Should be encoded in B1/B3, not left to UI-side dedup. |
| 2026-08-01 | Claude (industry-pattern research) | **Settings shape (F4):** standard notification-preference centers split into category / channel / frequency axes — matches the planned auto-create toggle + threshold + default assignee shape already in the doc. No change needed. |
| 2026-08-01 | Claude (industry-pattern research) | **Desktop-only v1 (F1, OQ2):** generic warehouse-ops UI convention leans mobile/handheld-first, but that convention belongs to the Station contract (scan-driven, floor density), not this board. Daily triage is Workbench-shaped (durable URL selection, pick+edit, `ops` density) per `contextual-display.md`, and desktop-first is the existing precedent for Workbench surfaces (Products, FBA board, Outbound) — so desktop-only v1 is consistent with the chosen archetype, not a compromise. |
| 2026-08-01 | Claude (industry-pattern research) | **Row actions (F1):** planned set (Start · Mark done · Assign… · Pin/Unpin) mirrors Linear's accept/decline/duplicate/snooze but skews toward "do the work" over "route the work," which fits an ops-triage board. Flag: if F5 handoff volume is high, consider a Snooze-equivalent (defer without losing) — the one Linear affordance not currently planned. |

---

## Out of scope (frontend)

Webhook handlers · migrations · fan-out worker · general email client · Ops TV / Brief · second polymorphic link UI
