# 00 — The endgame

**Written 2026-08-24, from a 22-question scope interview with the operator.**
This file outranks every other document in this directory. Where it contradicts
`LAWS.md`, `04-roadmap.md`, `02-target-architecture.md`, or any `HANDOFF-*.md`,
**this file wins** — the full quoted list of what it overrules is in §10 and
[`00-endgame-contradictions.md`](00-endgame-contradictions.md). Every line here
is a decision the operator made, a refusal they stated, or an unknown flagged
with a way to find out. Nothing else was allowed in.

Decisions are numbered **D1–D16** and cited by the appendix.

---

## 1 · The endgame, in one sentence

> **“Cycle Forge is a warehouse OS where inventory is never lost.”**

The operator's words, unedited. Everything below is subordinate to that
sentence, and v1 is judged against it and nothing else. **(D1)**

## 2 · The business, and the bottleneck this software attacks

Corrected on question one: the company **buys** used and refurbished consumer
electronics — from Goodwill, eBay sellers, and AliExpress/Chinese sellers for
cables and bulk — it does not take in trade-ins. The flow: unbox → verify the
item against the listing it was bought from → **claim with the seller on any
mismatch** → QC test → failures bounce back to the unboxer, who files the
claim. Units are routinely **disassembled into parts-only bins and
reassembled**; that is normal flow, not an exception. Sales run across eBay,
Amazon, Walmart, Ecwid, plus a walk-in front desk (sales, repair drop-off,
local pickup, trade-ins).

**The named leak: inventory.** QR labels are printed at unbox but are **not
paired to locations**. Items and parts vanish into rooms, racks, and bins the
system cannot see. The operator chose this over session analytics when forced
to pick one (“hard to choose… let's go with a”), and the choice is closed.

The spine, verified against the schema: the location *hierarchy* exists
(`locations`, `bin_contents`, `warehouses` — warehouse→zone→row/col bin with
barcodes), but **`bin_contents` is SKU+quantity grain and
`serial_units.current_location` is bare TEXT**, not a locations FK. The
unit↔bin pairing and parts provenance (“what's been pulled from it”) do not
exist and are the v1 build.

## 3 · The users

**8–10 people, one organization** (stated in the conditional — if today's
payroll is materially smaller, this section is wrong and the gate in §8 gets
harder). Staff are **multi-role**; “one person would be able to do anything.”
Remote same-org users are real v1 users: an overseas office, a hired
accountant reading data, remote interns doing inventory groundwork. **(D6, D7)**

| Role | The job, in the operator's terms | Device |
|---|---|---|
| CEO — mission control | Sees every live session, queues what's next by urgency, pings staff. **May never assign or interrupt a session** — direction is push, work-taking is pull | Electron desktop |
| Desk triage / work-order mgmt | Checks stock, prints only what's needed, creates and routes work orders | Electron desktop + handheld scanner |
| Operation specialist | Authors station procedures/SOPs in the “operation studio” — the corpus the AI's RAG feeds on | Electron desktop |
| Customer support | Asks the composer for RAG-grounded protocol answers; AI drafts marketplace replies, human sends them | Electron desktop |
| Receiver | Arrival scan, label + condition photos, urgency flags (pending order, expensive) | Mobile browser + desktop |
| Unboxer | Tracking scan → procedure-driven unbox → grade, serial, photos, listing-vs-actual comparison → claims | Electron desktop + handheld scanner |
| QC / testing | SOP-driven testing tool (“if this isn't working, replace this”) | Electron desktop + handheld scanner |
| Packers | Scan item + work order; SKU packing instructions, box choice, “must ship today” queue. **Never pack without a label** | Electron desktop + handheld scanner |
| Inventory triage specialist | The location czar: rooms/racks mapping, new-SKU intake, routing rules, the end-of-session **“place this item on shelf X”** CTA | **Mobile hardware with a camera**, scan-first |
| Front-desk kiosk | Sales, repair drop-off, pickup, trade-ins, receipts → queued work order. Session belongs to the *session*, not a staff member; drivable from a desktop over WebSockets **(D16)** | iPad browser → Electron host |

**The sovereignty rule (D7), amended 2026-09-26 (AI-first, approval-first):**
a work order is the thing you are handed; a session is you doing it. Work
orders may be queued and default-assigned — by the CEO, the desk, or the AI.
The AI may **propose** assigning, interrupting or switching a session; the
staffer approves it by default, and an org **auto-approve** setting per
automation lets the operator hand that verb to the AI outright.

## 4 · The product shape

- **Installed Electron desktop app for every role, remote staff included.**
  “Browser most basic, and then the desktop app, everything.” Local file
  access is the stated reason desktop is not a browser. **(D4)**
- **The web operator app is dead**, with exactly three surviving web surfaces:
  the **kiosk iPad browser** (talking to an Electron host; native port later),
  a **basic mobile-browser surface** — unbox photos, arrival scans, put-away
  double-scan, session switch/share, composer chat (today's real mobile usage
  is “just taking photos for the unboxing and scanning tracking numbers”) —
  and the **public GS1 resolvers** (T31, printed on stickers, forever).
  Consequence: **the Vercel deploy and the Lighthouse ≥90 program are dead as
  v1 gates**; only the kiosk route and resolvers keep any web-perf meaning.
- **Desktop ships first, designed mobile-first; the native mobile app comes
  after v1.** But the put-away moment is mobile *hardware* inside v1 — the
  phone browser is what records “this item, this bin, now.” **(D5)**
- **The AI is pinned in the middle, always — the conversation is the
  workspace. (D2, reinstated by operator ruling 2026-09-26.)** The 2026-08-23
  AI-centre inversion ([`HANDOFF-ai-centre.md`](HANDOFF-ai-centre.md)) is the
  front-door ruling again: “the feed is the ground”, sunken, centred,
  **always mounted, always the AI**; it never unmounts, never yields the
  centre, never navigates away. The composer stays **fixed in the centre** —
  it does not travel to a corner dock when the operator engages it. Data
  desks (tiles, ledgers, the 3-pane triage desk) render as moments inside it
  or details beside it, and the composer is reachable from every one of them.
- **The composer is a genuine model loop, not a command palette.** “AI is
  getting so fast that the one to three seconds of waiting per utterance is
  not an issue anymore” — ≤3s/utterance is the recorded tolerance. **Always-on
  internet is a hard prerequisite; offline is a non-goal** — when the network
  drops, the composer is dead and that is accepted by decision. **(D3)**
- **Single tenant.** “It would not be business to business” — B2B was
  retracted; org-to-org linkage is an explicitly deferred later plan; the
  RLS/tenancy scaffolding stays as deliberate insurance, not v1 surface. **(D6)**
- **The database is the workplace.** Files upload into the system; the NAS is
  backup and import-source only; no VPN/Tailscale requirement. **(D15)**

## 5 · The assistant's job: approval-first, auto-approve per automation

The assistant reads freely, drafts constantly, and **may perform every verb**.
Operator ruling 2026-09-26 (supersedes the D10 leash): every AI write is
**approval-first** — it lands as a proposal a named human approves — and each
automation carries an org **auto-approve** setting that flips that verb to
apply-now. Auto-applied writes keep `actor_kind: 'agent'`, land in the
`agent_mutations` ledger, and stay revertable. Vocabulary: *freely* = acts and
logs (auto-approve on by default); *approval-first* = drafts, a named human
approves each instance until the operator enables auto-approve.

| Verb | Ruling |
|---|---|
| Print product / location labels | **freely** |
| Print shipping labels | approval-first · auto-approve eligible |
| Set a grade/condition | approval-first · auto-approve eligible |
| Move a location record | approval-first · auto-approve eligible — the AI proposes the move (from scan evidence, reconciliation or its own reasoning) |
| File a seller claim (eBay/Goodwill/AliExpress) | approval-first · auto-approve eligible — AI drafts and files |
| Message a customer | approval-first · auto-approve eligible — AI drafts **and sends** through the platform send pipe |
| Change a live price | approval-first · auto-approve eligible |
| Edit listing content | approval-first · auto-approve eligible |
| Issue a refund | approval-first · auto-approve eligible — the AI issues the refund itself once approved (or instantly under auto-approve) |
| Create work orders | **freely** — they land as suggestions visible to the CEO and operation specialist |
| Ping a staffer | approval-first · auto-approve eligible |
| Propose keybinds | approval-first · auto-approve eligible (T28) |

**D14, the unification:** AI proposals are not a separate inbox. They land as
**queued work orders in the one queue**, routed by subscription to whoever
owns that concern, grouped in a triage tile. The T28 approval queue and the
work-order queue are one surface.

Transparency wants attached to this (v1-adjacent, not gate): the feedback
strip shows what the AI is doing; the **context ring**
(`src/shell/AssistantFeed.tsx` — it exists) opens to show *why* it concluded
what it did, editable. The AI provider is pluggable: BYO cloud key now, the
local/Ollama slot later (§7).

## 6 · What the shell must reach

Verified against both trees, 2026-08-24. **Build** = does not exist and is v1
work; **reach** = exists and the shell wires to it; **amend** = exists but
must change.

| Area | State | Verdict |
|---|---|---|
| Unit/parts-bin ↔ location pairing + provenance | Location hierarchy exists (`locations`, `bin_contents`, `warehouses`); `serial_units.current_location` is bare TEXT; `bin_contents` is SKU+qty grain | **BUILD — this is the spine** |
| Durable sessions (`work_sessions`, `work_session_intervals`, `ops_events`) | Schema, domain lib (`src/lib/sessions/*`), lifecycle routes all exist in this worktree. **The shell writes none of it** — its only fetches are the files import and the staff picker | **BUILD the wiring (D8)** — evaporate-on-refresh is not shippable |
| S1 armed-scan index | `ux_work_sessions_armed_scan` confirmed: unique on `organization_id` alone — one armed scan per **org** | **AMEND to per-staff/per-device (D9)** — 8–10 concurrent scanners break it |
| Work-order queue (`work_assignments`, ranking, `/api/work-orders`, `/api/assignments/next`) | Exists; worktree already links assignments↔sessions. No urgency marker on assignments (priority int only) | reach + **build urgency/summons + the D14 queue merge** |
| eBay + Amazon order reads | Full OAuth-vault sync → canonical orders upsert, both platforms | **reach** |
| ShipStation | Client, orders adapter, webhook, rates | **reach** + the queued gate in front of label purchase |
| Square kiosk / counter | Freshly finished on main (terminal checkout, reconcile, receipt HTML) — merged into this tree 2026-08-24 with its domain closure | **reach**; verify/build D16's desktop-drives-kiosk WebSocket path |
| Zendesk | Adapter, ticket cache, claim templating, routes | **reach** |
| QR/GS1 labels + print pipeline | Fully built (templates, print jobs, public resolvers) | **reach** — and the only web surfaces where perf budgets still apply |
| Photos/files into the system | ~70 modules, GCS storage, Drive client, NAS as *mirror* (already matches D15) | **reach**; extend the mobile capture surfaces |
| AI provider seam | BYOK chain exists (`org-provider.ts`: vault → openai → anthropic → ollama → platform); **no OAuth flow for any AI provider** — vault keys only. `agent-loop.ts` still pins the stale `claude-opus-4-8` id | reach + **build the OAuth path; fix the model id** |
| Marketplace buyer-message reads | **Does not exist in either tree** (eBay lib is auth/orders/browse; Amazon is orders/returns) | **build a read pipe or route inbound through Zendesk** — D10's draft replies need the thread visible |

Everything else among the 939 surviving routes is inherited plumbing: kept,
not a v1 gate, not to be “migrated” for its own sake.

## 7 · Non-goals, dated and named (2026-08-24)

- **Offline operation.** Struck with D3. When the internet is down the
  composer is dead; the operator accepts it.
- **The web operator app**, the Vercel deploy as product, and **Lighthouse ≥90
  / LCP / bundle budgets as gates.** Dead with D4. What dies with them: the
  two-tier perf gate, the route manifest's form-factor claims, the LCP
  streaming plan in main's `AGENTS.md`.
- **Multi-tenancy / org-to-org linkage.** Deferred by name; RLS stays as
  insurance only.
- **Native mobile app** and the **kiosk native port** — after v1.
- **CEO mission control** — deliberately last: “formulated when everything is
  correctly situated, so I'm not updating the mission control at each and
  every step.” **First post-v1 priority** — the cut that hurt the most.
- **Show mode polish, local AI (Ollama), AI-proposed keybinds** — slipped
  without pain.
- **Marketplace message *sending*** — permanently out of scope by leash
  ruling: draft-only, humans send.
- **Session analytics as the product** — the evening briefing survives as a
  v1 feature (§8), but “was it worth doing” analysis is not the v1 spine and
  is not judged at the gate.

## 8 · The v1 ship gate

> **Before Black Friday 2026 (in place by ~Nov 22), a staffer who is not the
> operator works a full real shift inside the system — receive, unbox, QC,
> put-away, pack — and the capstone holds: hand anyone any unit or parts bin
> in the building, they scan its QR, and the system's answer about where it
> is, where it came from, and what's been pulled from it is true.** **(D13)**

The forcing function is named: missing it means working peak season on the
broken inventory layer. “Every day is important… the sooner the better” is
posture; the date is the law.

Inside the 90 days, beyond the spine (the cut round, D12): the **evening
briefing** (draft tomorrow's sessions tonight as a rich-text view over queued
work orders; execute them tomorrow “under alignment”) and **session sharing**
(2+ staff in one session with per-staff attribution — the pallet scenario —
and the `@name !` urgent summons). Both were chosen over mission control.
The operator called both “relatively very easy”; that is a prediction, not a
measurement, and session-share touches the S1 index amendment.

Process note: the only automated gate today is the local pre-push hook
(`npm run verify`); all CI was deleted (`2f6dcd784`). The gate above is a
*product* gate; it does not replace the verify gate, and the known-red canvas
suites still need their sweep.

## 9 · Open experiments

Honest unknowns, each with how to find out. None may quietly become a
requirement (X3).

1. **Does the evening briefing change behaviour?** The operator once called
   it the main selling point; nobody has ever drafted tomorrow and executed
   “under alignment.” *Find out:* run it on paper (or the rich-text tile) for
   one week with two staffers; count how many drafted sessions actually run
   next day. If under half, it's a report, not a planner.
2. **Headcount reality.** “It would be around eight, ten people” was
   conditional. *Find out:* count the payroll on the day the first station
   goes live; if it's 4, the roster in §3 is aspiration and v1 narrows to the
   stations those 4 staff actually work.
3. **≤3s per utterance is tolerable mid-scan.** Asserted, never observed at a
   bench. *Find out:* time the composer round-trip during the first week of
   real unboxing; if operators route around the AI for lookups, the latency
   claim was wrong and deterministic paths (chips, launcher) must carry more.
4. **Token cost per operator per shift.** Never priced in the interview.
   *Find out:* meter the first dogfood week (`trust-stats` + provider logs);
   if the number is ugly, the deferred Ollama lane moves up.
5. **The context-ring training loop** (“identify more skills to train me
   more”). No defined mechanism. *Find out:* log what operators *try* to
   correct via the ring for a month; build the smallest thing that closes the
   top correction.
6. **Remote staff “making it run autonomously.”** A job description for
   people not yet hired, using features not yet scoped. Parked entirely.
7. **Desktop-drives-kiosk over WebSockets (D16).** Plausible; unverified
   against the finished counter code. *Find out:* spike it against
   `counter_sessions` before promising it at the desk.
8. **Infinite left/right column scrolling and the entity-in-the-centre
   treatment.** Prototype fights, to be settled in pixels with measurements —
   not in this file.

## 10 · Contradictions this file creates

The interview overturned or dented **146 specific lines** across 15 documents:
**37 struck, 58 to amend, 51 tensions** — every one quoted, with what it
should say instead, in
[`00-endgame-contradictions.md`](00-endgame-contradictions.md). **Do not
silently edit the source docs**; schedule the sweep and strike-through
explicitly per X3/X4. The headline strikes:

- **`HANDOFF-ai-centre.md` — the inversion itself.** “The feed is the GROUND…
  never yields the centre to a tile” → struck by D2, operator, 2026-08-24.
  Data takes the centre; the canvas returns; the composer is the permanent,
  corner-dockable One Field. Phases 1–2 of that brief remain *built* but their
  framing is dead; the blocks-of-time chronology needs a new home and, per D8,
  a durable one.
- **`LAWS.md` S1** (one armed scan session per **org**, DB index over the
  tenant column alone) → amend to per-staff/per-device (D9). Index and
  `armScanSession` both.
- **`LAWS.md` T30's justification list** — “offline as a first-class state”
  and “direct NAS writes / capture straight to disk” are struck (D3, D15).
  Native survives on files, input stack, and the local-model option (D4);
  the argument shrinks, the ruling stands.
- **Main `AGENTS.md` performance section + `docs/performance/LIGHTHOUSE.md`**
  — the Lighthouse ≥90 target, the LCP hunt, form-factor pins, and bundle
  budgets are struck as v1 gates (D4); they survive only for the kiosk route
  and the GS1 resolvers.
- **`LAWS.md` T15/A-section placement rows** — the assistant “recedes to its
  rail band” → the composer never recedes anywhere but its corner dock (D2);
  queued-proposal badges move to the unified work-order queue surface (D14).
- **`04-roadmap.md` Phase 6** (“the canvas defines its own arrangement
  vocabulary from scratch”) — un-mothballed and now *load-bearing* for D2,
  with Hyprland drag grammar as the stated vocabulary; conversely the
  roadmap's silence on the location spine is itself overruled: **Phase “0.5”
  of the real plan is §6's BUILD column**, and no roadmap phase outranks it.

---

*Method note: 22 questions, one per message; every decision played back as a
falsifiable claim; claims verified against the code both ways (two of the
operator's were corrected against the tree; two of the interviewer's were
retracted when the tree said otherwise). The interview transcript is the
session of 2026-08-24; the sweep behind §10 ran 9 agents over every governing
document.*
