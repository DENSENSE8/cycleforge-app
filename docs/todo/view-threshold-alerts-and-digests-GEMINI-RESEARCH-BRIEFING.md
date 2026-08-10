# Research briefing — Watch-a-view: queue-threshold alerts + digests

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** What is the **industry-standard data model, threshold vocabulary, evaluation strategy, noise-control, and UX** for **letting an operator “watch” a saved view / work queue and be alerted when its count crosses a threshold or an item ages past an SLA — plus scheduled queue digests** — and how should Cycle Forge add this by **composing** its existing subscription + inbox engine rather than reinventing it?
**Status:** OPEN — research + design-validation gate. Not an implementation plan yet.
**Primary surface:** the rail-less **To-ship** order desk (`/shipping/orders`) and every other ops-queue workbench that now carries a **saved-views** control (Incoming · History · Unbox · Shipping · Testing · Pack).
**Relationship to prior work:** Direct complement to the just-shipped **saved views** (named filter-combination bookmarks on Band 3 of ops-queue desks). Saved views made a filter a durable, named object; this brief is the next rung of the “saved view → action” ladder: a view you can **watch**. Sibling candidates (role/shift view assignment, carrier-cutoff aging, wave release, scheduled export) are out of scope here.

**Hard framing rule for your answer:**
- The **internal notification engine and saved-views infra described in §2 are EMPIRICAL GROUND TRUTH you must compose with, not reinvent.** Recommend the smallest coherent extension of those modules.
- **Validate the design decisions — data model, threshold vocabulary, evaluation/cost strategy, noise-control, delivery, and UX — ONLY against industry standards** (named products + citable engineering/UX practice). Do not defend or cite the house design constitution; where an internal design *fact* is given (e.g. the depth-vs-event distinction in §2g), treat it as current-state to test against industry, not a law to preserve.
- Name the product **and** the surface/feature you observed, and the year/version where you can.

---

## 0. Method — read before answering

### 0.1 Your job (three deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature monitoring, helpdesk, work-tracker, CRM, and WMS products let a user **watch a saved view / query / queue** and get alerted on a **threshold** — and how do they deliver **scheduled digests**? Name products + features. Cite. State the **dominant data model** (is the watch attached to a *personal saved view*, or to an *org-level monitor/rule object* decoupled from the view?) and the **dominant threshold vocabulary** (level / change / rate / absence / per-item SLA / composite).
2. **Design validation + gap close for THIS engine.** Given the existing `staff_subscriptions` + `notification_outbox` + `staff_inbox_items` + throwable-tasks pipeline in §2, specify the **smallest standard-conformant extension**: what columns/kinds to add, how to evaluate cheaply at multi-tenant scale, how to control noise (re-arm/hysteresis, dedupe, snooze, escalation), and whether a breach should emit a **passive notification** or an **actionable assigned task**.
3. **Principles + acceptance checklist.** The exact industry-standard principles this capability must meet, each with: principle name · one-sentence rule · who ships it · a concrete acceptance criterion an engineer can verify on `/shipping/orders`.

### 0.2 What this brief is NOT

- Not “build a full monitoring platform” — it is a scoped ops-queue watch + digest.
- Not the sibling complements (role/shift view assignment; carrier-cutoff aging model; wave/batch release; scheduled CSV export) — each is its own brief.
- Not a request to reinvent the delivery pipeline (outbox → inbox → Ably) — that exists and works.
- Not reconciliation against the house design constitution.

### 0.3 Scoring axes (mandatory for every recommended design choice)

Score 1–5; report a table. No seventh axis.

| Axis | Meaning |
|---|---|
| **Signal-to-noise** | Does the design prevent alert fatigue (re-arm/hysteresis, dedupe, batching, snooze, escalation)? The #1 failure mode of alerting. |
| **Evaluation cost** | Can thresholds be evaluated at multi-tenant scale without a per-view SQL scan every minute (Neon CU-hours are a real budget)? |
| **Actionability** | Does a breach lead to a decision/action (assigned task, owner, next step), not just a red number? |
| **Engine reuse** | Does it compose the existing subscription/outbox/inbox/tasks pipeline vs forking a parallel one? |
| **Model clarity** | Is “what is watched” a clean primitive (view vs metric vs rule) that survives the view being renamed/deleted/personal? |
| **UX fit** | Is arming a watch discoverable and low-friction (on the Views control) without cluttering the dense desk? |

**Fit ≈ (Signal-to-noise × Evaluation cost × Engine reuse × Model clarity) / (6 − Actionability), tie-broken by UX fit.** Rank candidate designs descending.

### 0.4 Sources to cover (minimum)

| Class | Named examples (start here; expand) | Use for |
|---|---|---|
| **Monitoring / alerting** | Datadog monitors (threshold · change · anomaly · composite · no-data · **re-notify/recovery**), Grafana alerting (for/pending/hysteresis), PagerDuty (dedupe, alert grouping, escalation policies), Opsgenie | Threshold vocabulary · re-arm/hysteresis · escalation · de-noising |
| **Helpdesk / CRM automations** | Zendesk (views + **triggers/automations** + SLA policies + view-count), HubSpot workflows, Salesforce **report/list-view subscriptions** + alerts, Intercom | View/queue-driven alerts; scheduled report subscriptions |
| **Work trackers / DB tools** | **Jira filter subscriptions (scheduled email digest of a saved filter)**, Linear (subscribe + notifications), Asana rules, **Airtable automations (“when a record enters a view”)**, Notion database automations | The exact “a saved view/filter drives an alert/digest” precedent |
| **WMS / fulfillment** | Manhattan / Blue Yonder / Logiwa / Hopstack exception & SLA-breach alerting; order-aging/cutoff compliance notifications | Ops-floor alerting semantics; SLA-breach as the canonical per-item threshold |
| **Research / heuristics** | Google SRE book (alerting on symptoms, alert fatigue, actionable alerts), NN/g (notifications, digest vs interrupt), batching/quiet-hours practice | Why noise-control + actionability are the whole game |

Where industry splits (e.g. watch-the-view vs watch-a-metric; notification vs ticket), give **both** positions + the conditions each wins under, then pick a default for **this** engine.

---

## 1. Product context (facts only)

**Cycle Forge** is multi-tenant **reseller / warehouse-ops SaaS** (used-goods / electronics refurb is the dogfood tenant). Operators work dense triage desks at pointer+keyboard, multi-hour shifts. A just-shipped feature lets them save a **named filter combination** (“saved view”) on any ops-queue desk and re-apply it from a Band-3 Bookmark control. A saved view is a set of URL filter params on one surface (staff · attention · stock-status · stage · late · …), personal by default with an optional org-share flag.

The desired next capability: an operator (or a manager) can **watch** a saved view / work queue and be **notified** — or have a **task thrown to them** — when the queue crosses a threshold (e.g. “Pending > 40”, “anything late”, “an order has sat unpacked > 2h”), plus receive a **scheduled digest** of their queues (“your desks at 8am”).

---

## 2. Measured current anatomy (verified from source 2026-08-09)

Treat as ground truth. **Compose these; do not fork parallel machinery.**

### 2a. Saved views (the thing to watch)

- Polymorphic `saved_views` table (`2026-07-29g_saved_views.sql`; surfaces extended `2026-08-01a`): keyed by `organization_id` + owner `staff_id`; `is_shared BOOLEAN` (all-or-nothing org share) with partial index `idx_saved_views_org_surface_shared`; a `surface` discriminator (SoT list `src/lib/saved-views/surfaces.ts`, CHECK `saved_views_surface_chk`).
- Client: `useSavedViews` (`src/hooks/useSavedViews.ts`) — apply/save/rename/delete/share; `activeView`; URL-apply over `paramKeys`. UI: `WorkbenchViewsMenu` (Band-3 Bookmark), `SavedViewsList`. To-ship config: `outboundSavedViewsConfig` (`storageKey` + `paramKeys` per lifecycle mode).
- A view captures **filter params**; it does not today store a threshold, an owner-audience beyond personal/org, or any watch.

### 2b. Subscription engine (the evaluation half)

- `staff_subscriptions` (`2026-07-28c_staff_subscriptions.sql`) — three kinds:
  - **`entity`** — watch one record.
  - **`rule`** — event predicate: `match_event_keys`, `match_sku`, `match_platform`, `match_station`, `match_severity_min`.
  - **`sla`** — **absence-based**: armed by `sla_event_key`, disarmed by `sla_resolve_event_key`, breaches after `sla_breach_after` (INTERVAL), evaluated by a cron walker.
- **There is no `saved_view_id`, no count/aggregate-threshold kind, and no digest concept.** Subscriptions match *events* or *event-absence*, never a *queue count* or a *saved-view membership*.

### 2c. Delivery + inbox (the fan-out half — already solved)

- `notification_outbox` + `staff_inbox_items` (`2026-07-28d`), drained by `POST /api/cron/notification-outbox` (**every minute**, `vercel.json`), fanned to Ably `org:{org}:inbox:{staff}`, with **dedupe + collapse**. `staff_inbox_items` state machine: `unread · read · done · snoozed` (so **snooze already exists**).
- Surfaces: header bell `ActivityInboxPopover` (ephemeral, dismissible); Home → Inbox `HomeInboxMode` (durable ledger over `staff_inbox_items`); Home → Tasks (`/api/ops-plans/inbox`).

### 2d. Throwable tasks (the actionable-output option)

- `ThrowTaskPanel` (⌘⇧U) → `POST /api/tasks`; domain `src/lib/tasks/`; `assign-inbox-item.ts` writes `staff_inbox_items` **directly** (bypasses the outbox on purpose — it already names a recipient); `publishInboxItem` (`src/lib/realtime/publish.ts`) emits the live event; `resolveThrowTargets`. So an alert can either be a **passive inbox notification** (via outbox fan-out) or an **assigned task** (via direct assignment).

### 2e. Internal precedent — `stock_alerts` (a threshold alert already exists)

- `stock_alerts` (`2026-05-14_stock_alerts.sql`) + `GET /api/cron/stock-alerts` already implement a **level-threshold** alert (stock crossing a reorder point). Plus `claims-escalation` cron. **Use this as the internal reference for how a threshold walker is wired** — the question is how to generalize it to “a saved view’s count” without a per-view scan every minute.

### 2f. The gap (why this brief exists)

The whole delivery + inbox + tasks + snooze + dedupe pipeline exists and works. **The missing piece is the trigger**: nothing can watch a **saved view / queue count / per-item aging** and emit into that pipeline. Adding it is a *composition* problem (new subscription kind(s) + a cheap evaluator + a UX to arm), not a new platform.

### 2g. An empirical design fact to test against industry (not a law to defend)

The current system deliberately distinguishes a **queue depth** (an ambient, ever-present count — treated as *not* a dismissible notification and kept out of the header badge, because “a depth is not a thing you dismiss”) from a **discrete event** (dismissible, belongs in the inbox). A **threshold crossing** is arguably a discrete event (it happens at an instant, you act, it clears) even though the underlying quantity is a depth. **Ask industry where the line sits** between surfacing an ambient count and firing a threshold *alert*, and let that adjudicate whether a view-threshold breach belongs in the dismissible inbox, as a thrown task, or both.

---

## 3. Industry question stack (answer every item)

### Q1 — What is watched: view vs metric vs rule?
Is the alert attached to a **personal saved view** (dies if the view is renamed/deleted; scoped to one person’s filters), to an **org-level “monitor/rule” object** that references a query independent of any personal view (Datadog/Grafana model; Zendesk trigger model), or to a **saved view promoted to shared/monitored**? Which survives contact with reality (renames, personal vs shared, a manager arming for a role)? Pick a default primitive and say what the saved view contributes (the filter definition) vs what the monitor owns (threshold, audience, cadence, state).

### Q2 — Threshold vocabulary
Which threshold types are table-stakes vs advanced? Level (`count > N` / `< N`), **change** (Δ over window), rate, **per-item aging / SLA breach** (an item in the view older than T — maps to the existing `sla` kind), **no-data/staleness**, **composite**. For an ops queue, what is the minimum viable set? Where does “anything in this view at all” (count > 0) fit?

### Q3 — Evaluation strategy & cost (the hard engineering question)
A saved view is arbitrary filter params → a SQL query. Evaluating every watched view every minute per org is a Neon CU-hour risk. How do mature systems evaluate query/threshold alerts economically? Options to weigh: (a) **event-driven counters** (maintain a materialized count per (surface, facet) updated on state transitions, alert off the counter — cheap, but only for pre-modeled facets); (b) **periodic query with a sane interval** (e.g. 1–5 min) + guardrails (cap watched views/org, only evaluate when membership could have changed); (c) **piggyback the existing per-order `deadline_at` / event stream** for the SLA/aging case so no view scan is needed. Recommend a default and the interval, and state which threshold types each strategy can serve.

### Q4 — Noise control (the #1 alerting failure mode)
Specify the industry-standard de-noising this must ship: **re-arm / hysteresis** (do not re-fire while still breached; recovery notification when it clears — Datadog/Grafana `for`/recovery), **dedupe** (already in outbox — is it sufficient?), **batching/quiet-hours**, **snooze** (exists on `staff_inbox_items`), **escalation** (unacknowledged breach → escalate to a role/manager — PagerDuty). What is the minimum set for an ops floor, and what is over-engineering at this scale?

### Q5 — Passive notification vs actionable task
Should a view-threshold breach emit a **passive inbox notification** (via `notification_outbox` fan-out) or an **assigned task** (via `assign-inbox-item` / `/api/tasks`), or be configurable per watch? Compare the monitoring “alert” model vs the PagerDuty “incident” / Zendesk “assign” / Jira “create issue” models. When does a breach deserve an owner vs a glance?

### Q6 — Digest (scheduled queue summary)
Model the digest against **Jira filter subscriptions** and **Salesforce report subscriptions**: cadence (daily/weekly/shift-start), content (one view or a bundle of a staffer’s watched views/queues with counts + deltas + oldest item), channel (in-app inbox vs email), and per-staff vs per-role. Is a digest a separate object or “a watch with cadence = scheduled and threshold = always”? Recommend the cleanest model.

### Q7 — Ownership & audience (ties to shared views)
Who arms a watch and who receives it: **personal** (I watch my own view), **shared** (manager arms a watch on a shared/monitored view for a role/shift — depends on the sibling “role/shift assignment” gap), **team** (everyone on a role sees the breach). What is the standard ownership model, and what is the minimum that ships without the role/shift-assignment work?

### Q8 — Where the UX lives
Is arming a watch an item on the just-shipped **Views ▾ (Bookmark)** control (“Watch this view…”), a dedicated **Alerts / Monitors** management surface, or both (quick-arm on the view + a management list)? Compare Airtable (“when a record enters a view” lives in an Automations panel, not the view switcher), Zendesk (triggers in Admin, not the view), Jira (subscribe is *on* the filter). Recommend placement that keeps the dense desk uncluttered.

---

## 4. Industry principles you must cover (minimum catalog)

For each: **industry rule · citations · Cycle Forge fit (`PASS` / `PARTIAL` / `FAIL` given §2) · the extension it implies.**

| # | Principle | Prompt |
|---|---|---|
| P1 | **Alert on a symptom, actionably** | Every alert names a condition a human can act on; no alert that no one owns or can resolve (SRE) |
| P2 | **Re-arm / hysteresis is mandatory** | Fire once on crossing; do not re-fire while breached; notify on recovery |
| P3 | **Dedupe & batch to beat fatigue** | Repeated/related breaches collapse; digests batch the non-urgent |
| P4 | **Snooze & acknowledge** | A recipient can silence/ack a breach without it re-nagging |
| P5 | **Escalation for the ignored** | An unacknowledged high-severity breach escalates to an owner/role |
| P6 | **Cheap, bounded evaluation** | Thresholds evaluate within a cost/interval budget; watched-object counts are capped |
| P7 | **The watch survives the view** | The monitor object is not silently orphaned when a personal view is renamed/deleted |
| P8 | **One pipeline, not two** | Alerts flow through the existing outbox/inbox/tasks rails, not a parallel notifier |
| P9 | **Depth ≠ alert** | An ambient count is shown ambiently; only a *crossing/breach* becomes a dismissible event |
| P10 | **Digest is opt-in and scoped** | Scheduled summaries are per-recipient, bounded, and cover their own queues |

---

## 5. Decision table (pick one default per row — no soft hybrids without a default)

| ID | Decision | Options |
|---|---|---|
| D1 | Watched primitive | Personal saved view · Org “monitor” referencing a query · Saved view promoted to monitored |
| D2 | New `staff_subscriptions` kind(s) | `view_count` only · `view_count` + reuse `sla` for aging · a generic `metric` kind |
| D3 | Threshold vocab (MVP) | Level only · Level + per-item aging · Level + change + aging |
| D4 | Evaluation strategy | Event-driven counters · Periodic query (interval = ?) · Hybrid (counters for facets, query for arbitrary) |
| D5 | Evaluation interval | 1 min (reuse outbox cron) · 5 min · per-watch configurable |
| D6 | Re-arm model | Edge-trigger + recovery event · Level with cooldown · Both configurable |
| D7 | Breach output | Passive inbox notification · Thrown/assigned task · Configurable per watch |
| D8 | Escalation | None (MVP) · Time-based to role/manager · Configurable |
| D9 | Digest model | Separate object · A watch with cadence=scheduled · No digest in MVP |
| D10 | Digest channel | In-app inbox only · Email · Both |
| D11 | Audience | Personal only (MVP) · Personal + shared-to-role · Team |
| D12 | Arm UX home | On Views ▾ control · Separate Monitors surface · Quick-arm + management list |
| D13 | Success metric | Alert→action rate · False-positive/ack-without-action rate · Evaluation CU-hours/day · % breaches acted on before SLA |

---

## 6. Required report shape

1. **Executive answer (≤12 lines):** the smallest standard-conformant way to add view-threshold watches + digests on top of the existing engine.
2. **Pattern survey table** (§0.4 products × what-is-watched × threshold vocab × delivery × digest).
3. **Design scorecard:** candidate designs (per D1/D4/D7) scored on §0.3 axes, ranked by the fit formula.
4. **Data-model recommendation:** exact columns/kinds to add to `staff_subscriptions` (or a new sibling table), and why — composing §2, not forking.
5. **Noise-control spec:** re-arm, dedupe, snooze, escalation — the minimum viable set + what to defer.
6. **Principles catalog** P1–P10 with PASS/PARTIAL/FAIL + citations.
7. **Decision table** D1–D13 with one default each + a one-line defense.
8. **Acceptance checklist** on `/shipping/orders` (e.g. “arm ‘Pending > 40’; drive the count over 40 once → exactly one inbox item; hold above 40 → no re-fire; drop below → recovery; snooze silences re-arm”).
9. **Explicit non-goals** (what industry would *not* build at this scale).

---

## 7. Code pointers (optional verification)

If you have repo access, open these — do not invent siblings:

| Path | Why |
|---|---|
| `src/lib/migrations/2026-07-28c_staff_subscriptions.sql` | The subscription kinds to extend (entity/rule/sla) |
| `src/lib/migrations/2026-07-28d_*.sql` | `notification_outbox` + `staff_inbox_items` (delivery + snooze) |
| `src/app/api/cron/notification-outbox/route.ts` | The per-minute drain the pipeline already runs |
| `src/lib/migrations/2026-05-14_stock_alerts.sql` + `src/app/api/cron/stock-alerts/**` | Internal precedent: an existing level-threshold walker |
| `src/lib/tasks/**` + `src/app/api/tasks/route.ts` + `assign-inbox-item.ts` | The actionable-task output option |
| `src/lib/realtime/publish.ts` | `publishInboxItem` — live fan-out |
| `src/hooks/useSavedViews.ts` + `src/lib/saved-views/**` | The saved-view object + surface discriminator + `paramKeys` |
| `src/lib/dashboard/outbound-metrics.ts` | Existing queue-count/aging computation to reuse for evaluation |

---

## 8. Closing reminder

The delivery half is solved: outbox → inbox → Ably → tasks, with dedupe and snooze already in place. The research must specify the **trigger** — a standard-conformant, cheap-to-evaluate, low-noise way to watch a **saved view / queue count / per-item aging** and emit into that pipeline, plus a **digest** modeled on Jira/Salesforce subscriptions. Compose the existing engine; validate every model, threshold, and noise-control choice against named industry practice; and say plainly where an ambient **queue depth** stops and a dismissible **alert** begins.
