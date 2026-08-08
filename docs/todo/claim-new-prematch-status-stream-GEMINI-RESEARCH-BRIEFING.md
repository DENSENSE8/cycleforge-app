# Research briefing — Claim **New**: pre-create match probe + Cursor-class status stream

**For:** Gemini Pro (deep research)  
**From:** Cycle Forge engineering  
**Date:** 2026-08-08  
**Subject:** When the Unbox Displays Ticket leaf is on **New** (`claimMode=create`), show a **premium top-of-leaf probe** that searches for already-existing helpdesk tickets (tracking · order · related ids) *before* the operator drafts a new claim — with **authentic coding-agent status copy** (Cursor / Copilot-style “Planning next steps…”, “Searching tracking…”) — then let them **Link the match** or **still Create**.  
**Status:** READY FOR RESEARCH — no implementation until return + PLAN.  
**Lane:** stay on checkout branch · attach to **`:3050`** · never start/restart/kill the
dev server · **user owns commits**.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS; USAV is dogfood only.

**Do not re-litigate (already shipped / locked):**

| Prior decision | Where |
|---|---|
| Ticket = presence-exclusive (Claim XOR Chat) | SoT → Station Displays navigation |
| New · Link = leaf-header trailing segment + always-visible ⌥1/⌥2 | `ClaimWizardNav` + `useSegmentChords` |
| Link Find = shared `TicketPicker` → `listTicketLinkCandidates` | `ClaimLinkFindStep` / `TicketLinkPopover` seed |
| Index unlinked Ticket = quiet **No ticket** / `neutral` | `unbox-display-index.ts` |
| No second search engine / audit API / status transition | `AGENTS.md` hard laws |
| Motion only via `@/design-system/motion` | SoT |
| Displays ≠ inspector; Root Index = subjects | SoT |

Related briefs (different questions — cite, don’t reopen):

| Brief | Question |
|---|---|
| [`receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md`](./receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md) | Is the claim wizard over-built? |
| [`claim-displays-sheet-band-cohort-HANDOFF.md`](./claim-displays-sheet-band-cohort-HANDOFF.md) | Flush TicketPicker / compose faces |
| [`displays-root-to-leaf-deferred-SOT-HANDOFF.md`](./displays-root-to-leaf-deferred-SOT-HANDOFF.md) | Phase C segment chords (shipped for Claim) |

---

## 0. How to use this brief

You do **not** have the codebase. Facts in §2–§4 were measured 2026-08-08 against the live tree. Treat them as ground truth for “what we built.” Do not invent a second product (USAV = dogfood tenant only).

**Three deliverables (required):**

1. **Industry pattern catalog (2026)** — How do premium ops / helpdesk / coding-agent UIs run a **pre-create duplicate / match probe** with a **status stream** (not a spinner blob)? Name products and mechanisms:
   - **Agent status streams:** Cursor Agent / Composer status lines (“Planning next steps”, “Reading files”, “Searching codebase”), GitHub Copilot Chat / Workspace status, Claude Code / Windsurf / Devin-style step narration, Linear AI / Notion AI progressive status.
   - **Ops / helpdesk match-before-create:** Zendesk / Freshdesk / Intercom “similar tickets”, Salesforce Case duplicate detection, Loop / Narvar / AfterShip Returns “existing RMA”, Shopify / NetSuite claim attach, WMS carrier-claim “open claim on this tracking”.
   - **Loading grammar:** skeleton vs status log vs indeterminate bar (`SearchPendingBar`-class) vs staged checklist. When each wins on a **dense scan station** (wedge-safe, 720px middle lock, Displays push column).
2. **Critique of the proposed Cycle Forge shape** (§3) — Strengths, failure modes (false matches, wedge interference, latency, empty theater), simplification options, what to delete vs keep in today’s New wizard.
3. **Actionable target architecture for Cycle Forge** — Ranked plan that **composes existing SoT** (`listTicketLinkCandidates`, `TicketPicker`, `TicketLinkPopover` seed rules, Displays leaf chrome). Prefer a paste-ready HANDOFF skeleton — not a new match microservice.

Also answer every numbered question in §8 with sources. Prefer concrete UI copy, timing budgets, and failure stories over slogans (“just add AI”).

---

## 1. Product vocabulary (use these words)

**Cycle Forge** — multi-tenant reseller-ops SaaS. Identity: **Kinetic Ledger** (dense, state-colored, scan-aware).

**Station Displays** — right-edge `StationDisplaysPushStack`: Root Index rows → leaf. Ticket leaf is presence-exclusive.

**Claim New · Link** — child segment on the sticky leaf header (`StationDisplayLeafHeader` trailing). Short labels **New** / **Link**; chords **⌥1** / **⌥2**.

**Prematch probe** *(proposed)* — automatic search for existing tickets when the operator lands on **New**, using carton facts (tracking · marketplace order id · PO · serials) *before* compose.

**Status stream** *(proposed)* — short, sequential, honest status lines at the **top of the Ticket leaf body** while the probe runs — Cursor-class narration, not decorative Lottie.

**Match decision** — after probe: show 0…N candidates → operator **Link** (flip to Link mode + select) or **Continue create** (dismiss probe, keep New compose).

**Capability facade** — Zendesk (etc.) sits behind helpdesk search; UI copy uses capability nouns or runtime provider labels, never hardcoded “Zendesk says…” in operator chrome (Integrations hub excepted).

---

## 2. What shipped today (measured)

### 2.1 Ticket leaf anatomy

```
Displays → Ticket leaf (TicketDisplayHost)
├─ linked ticketId     → SupportTicketDetail (bubbles + composer)
└─ no ticketId         → ReceivingClaimPanel chrome="display"
     └─ Leaf header: ← → [ Ticket ] …… [ New ⌥1 | Link ⌥2 ]
          New  → Photos → Compose → File   (NO prematch today)
          Link → Find (TicketPicker) → … → Link
```

### 2.2 Match / search SoT (already exists — reuse)

| Piece | Path | Behavior |
|---|---|---|
| Candidates waist | `src/lib/zendesk-link-candidates.ts` → `listTicketLinkCandidates` | Empty → recent; `#1234` → getTicket; else Zendesk `type:ticket ${query}` full-text |
| Claim API | `GET /api/receiving/zendesk-claim/link?receivingId&lineId&query` | Receiving-gated |
| Shared picker | `TicketPicker` + `useTicketSearch` / `useClaimTicketSearch` | Link Find body |
| Seed pattern | `TicketLinkPopover` `initialQuery` = tracking | Seed is **search text**, never treated as ticket id |
| Global find pending | `SearchPendingBar` (`recv-indet-bar`) | Thin indeterminate rule — **not** a status stream |

**Gap:** Create mode never calls candidates. No staged “Searching tracking… / Searching order…” UI. No forced decision gate before compose.

### 2.3 House loading primitives (compose, don’t fork)

| Primitive | Use when |
|---|---|
| `SearchPendingBar` | Single in-flight find under a field |
| `recv-indet-bar` / station submit traces | Long station I/O |
| Skeleton / sunken placeholders | Known layout, unknown content |
| Toast | Terminal success/fail — not progressive probe steps |
| Motion | `@/design-system/motion` roles only — no `framer-motion` outside DS |

There is **no** shipped “agent status stream” SoT yet. This brief asks whether Claim New prematch is the golden to grow one — or whether a quieter pattern wins on Station.

---

## 3. Proposed operator experience (product intent — critique this)

### 3.1 Trigger

Operator opens Ticket → **New** (click or ⌥1), or lands on New by default when unlinked.

### 3.2 Top-of-leaf probe band (body, under sticky header)

While probing, paint a **premium status stream** at the top of the Claim scroll body (flush Displays gutters — `DISPLAYS_FLUSH_HOST` / rows own inset):

```
Searching tracking · 1Z999…
Searching order · 114-…
Checking recent tickets
Planning next steps…
```

Cursor / coding-agent references to study (mechanisms, not pixels):

- Sequential **status line** that updates in place or appends 1–3 short lines
- Verb-first, present participle (“Reading…”, “Searching…”)
- Specific object when known (“Searching tracking · last-8”) — never fake confidence scores
- Quiet chrome: no rainbow glow, no multi-layer shadows, no purple AI cliché
- Escape / skip: operator can **Skip — create new** without waiting

### 3.3 Outcomes

| Probe result | UI |
|---|---|
| **Hits** | Dense candidate rows (reuse `TicketPicker` / `TicketPickRow` face) + primary **Link** + secondary **Create new anyway** |
| **No hits** | One honest line “No existing ticket found” → auto-continue into New compose (or one-tap Continue) |
| **Error / timeout** | Fail open to New compose; never block filing |

### 3.4 Simplification thesis (argue for/against)

Possible simplifications vs today’s New wizard:

1. **Prematch replaces empty Photos-first cold start** — probe band is step 0; Photos stays after decision.
2. **Collapse New vs Link mentally** — New always *tries* Link first; Link segment remains for intentional find.
3. **Delete duplicate copy** — no “File a claim” restatement; header already says Ticket · New.
4. **Single sticky decision footer** during probe: Skip create | (disabled until pick) Link.

---

## 4. Constraints (hard — research must respect)

1. **Compose `listTicketLinkCandidates` / Claim link GET** — no second match engine, no page-local ranking API.
2. **Seed rules** (from `TicketLinkPopover`): tracking/order seeds are **search queries**, never auto-link as ticket ids; digit-only seeds that look like FedEx-style tracking must not call `getTicket(id)`.
3. **Wedge safety:** no bare-digit binds; status stream is not a nav-keys target; refuse chords while focus is in probe skip / search field if any.
4. **Station Displays chrome:** probe lives in **leaf body**, not a second `StationDisplayLeafHeader`, not column footer (`leaf-dismiss` stays `→|`).
5. **Honest latency:** do not invent fake steps to look “AI”. If only one Zendesk search runs, status lines must map to **real phases** (build query → request tracking → request order → merge) or collapse to fewer honest lines.
6. **Vendor copy:** capability / runtime provider — not “Asking Zendesk…”.
7. **Motion / tokens:** DS motion + tokens only; flush ops chrome (`cornerClass('flush')`).
8. **E2E:** assert against QA org, not dogfood tenant.
9. **Verify:** `npm run verify` before done; never raise DS/knip baselines.

---

## 5. Simplification options to evaluate (pick winners)

Score each for Station density, false-match risk, implement cost, and Kinetic Ledger fit:

| ID | Option | Sketch |
|---|---|---|
| **A** | **Auto-probe on New** | On `claimMode=create` mount, run seeded searches; status stream → decision → compose |
| **B** | **Inline probe strip only** | Always-visible collapsed “Check for existing” that expands on New; click to run (less magic) |
| **C** | **Unify New into Link-first** | Default segment = Link with tracking seed; New is “no match / create” CTA under results |
| **D** | **Background probe + badge** | Compose immediately; quiet “3 possible matches” chip that opens candidates (lowest friction create) |
| **E** | **Cursor-faithful log** | Append-only status log (3–6 lines) with checkmarks as phases complete — denser, more “agent” |
| **F** | **Single rotating status** | One line that replaces itself (less vertical jump on 24–32px band) |

Research must recommend **one primary** (A–D) + **one status grammar** (E vs F or hybrid), with timing budgets (p50/p95) and empty/error copy.

---

## 6. Status-stream design questions (answer explicitly)

1. **How many lines?** Cap for Displays width (~280–480px typical). Cursor often uses 1 active line + optional history — what fits Kinetic Ledger?
2. **Phase list for Cycle Forge facts** — propose an ordered phase set drawn only from real work, e.g.:
   - Resolve carton identifiers (tracking · order · PO)
   - Search by tracking
   - Search by order id
   - Merge / dedupe candidates
   - Ready — N matches | none
3. **Parallel vs sequential requests** — UX of parallel (faster, messy status) vs sequential (narratable). Industry winners?
4. **Minimum dwell** — Should a phase show ≥N ms so humans can read (Cursor-like), or prefer snappy skip when cache-hot?
5. **Accessibility** — `aria-live` polite vs assertive; avoid flooding screen readers with every phase.
6. **Skip control placement** — in-stream text button vs sticky footer Macro.
7. **Anti-patterns** — fake “AI thinking”, pulsing purple, progress % without a true denominator, skeleton that lies about layout.

---

## 7. Decisions we need you to take a side on

For each: current lean (if any), strongest counter-argument, your verdict.

1. **Auto-run probe on New mount (A) vs explicit “Check existing” (B).**  
   Lean: A for Station speed; fear: surprise network + false matches.
2. **Status stream SoT** — grow a named `AgentStatusStream` / `ProbeStatusBand` under `design-system` or `station/displays`, or keep Claim-local until a second consumer exists?  
   Lean: start Claim-local golden; extract when Photos/Pairing reuse.
3. **On hits, auto-flip segment to Link vs stay on New with Link CTA.**  
   Lean: stay on New visually; Link CTA calls `selectLinkTicket` + `handleModeChange('link')` so URL/`claimMode` stays honest.
4. **Photos step before or after probe?**  
   Lean: probe → decision → existing Photos → Compose order (don’t ask for photos until create is chosen).
5. **Use one combined Zendesk query (“tracking OR order”) vs two status-visible searches.**  
   Lean: two visible phases if both identifiers exist; one phase if only one.
6. **Idle after no-match:** auto-advance to compose in 0ms vs 400ms acknowledgment line.

---

## 8. Numbered questions (answer all with sources)

1. Which 2026 products best exemplify **match-before-create** for tickets/cases/RMAs, and what is their step count before compose?
2. What is the best published guidance on **agent/status narration** UX (Cursor-class) that remains trustworthy (no theater)?
3. For barcode/wedge environments, does industry prefer auto-probe or explicit check? Cite WMS/3PL/RMA examples.
4. How should **false-positive ticket matches** be mitigated in UI (confirm step, show why matched, last-8 tracking in row meta)?
5. What latency budget keeps a status stream feeling premium vs sluggish on a 150–800ms helpdesk search?
6. Should the probe reuse **exact** `TicketPicker` rows or a tighter “match card” — when does each win?
7. How do top coding agents handle **cancel / skip** mid-status without looking broken?
8. Recommend copy deck (≤12 strings) for phases + empty + error + CTAs that fits Kinetic Ledger (no vendor product sentences).
9. Propose a **minimal SoT module list** (files to add/grow) that an engineer can turn into a HANDOFF without inventing a second search stack.
10. Rank simplification wins: what can we **delete** from today’s New path if prematch ships?

---

## 9. Success criteria for the research return

A return is complete when it includes:

1. Industry catalog with **named products + mechanisms** (status stream + match-before-create).
2. A **single recommended Cycle Forge shape** (option letter + status grammar) with ASCII wireframe for the Ticket leaf.
3. Verdicts on §7 (1–6) with one-sentence rationale each.
4. Answers to §8 (1–10) with sources / links where possible.
5. A **HANDOFF-ready implementation order** (≤8 bullets): SoT modules, guards, verify, E2E smoke on QA org.
6. Explicit **Never** list (theater steps, second API, parent tabs, bare digits, floating overlays on Displays).

---

## 10. ASCII wireframe (critique / improve)

```
┌─ StationDisplayLeafHeader (h-6) ─────────────────────────────┐
│ ← →  Ticket                          [ New ⌥1 | Link ⌥2 ]   │
├──────────────────────────────────────────────────────────────┤
│  PROBE BAND (only while claimMode=create && probing)         │
│  ● Searching tracking · …9A2F                                │
│  ○ Searching order · …4412                                   │
│  ○ Planning next steps                                       │
│                                         [ Skip — create new ]│
├──────────────────────────────────────────────────────────────┤
│  IF hits: TicketPickRow × N                                 │
│     #48291  Damaged inbound · 2h                             │
│     [ Link this ticket ]                                     │
│     Create new anyway                                        │
│  IF none: (auto or) Continue to photos                       │
├──────────────────────────────────────────────────────────────┤
│  (after decision) Photos → Compose …                         │
│  sticky File footer                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 11. Paste prompt for Gemini

```
Read docs/todo/claim-new-prematch-status-stream-GEMINI-RESEARCH-BRIEFING.md
and produce the three deliverables in §0 plus answers to §8.

Do NOT propose a second ticket search API — compose listTicketLinkCandidates /
GET receiving zendesk-claim/link and TicketPicker / TicketLinkPopover seed rules.
Do NOT put the probe in StationDisplayLeafHeader or the Displays footer.
Do NOT invent fake AI thinking steps without real I/O phases.
Do NOT reopen presence-exclusive Ticket or New·Link leaf-header segment.
Respect Kinetic Ledger, flush ops chrome, wedge law, and npm run verify.

Return: recommended option (A–D) + status grammar (E/F/hybrid), §7 verdicts,
§8 answers with sources, HANDOFF-ready implementation order, Never list,
and an improved ASCII wireframe.
```
