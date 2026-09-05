# PLAN — the Scan Shell (v2 of the interaction layer)

**Split 2026-09-04 into two executable plans:**
[`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md) (G1–G3) and
[`PLAN-scan-shell-desktop.md`](PLAN-scan-shell-desktop.md) (G4–G5). Each goal
has a `GOAL-<id>.md` in this folder and a Host JSON. This file is the
umbrella: the model, the evidence, the dispatch table, what is replaced.

**Status: PLAN (propose). Written 2026-09-04.** Supersedes the ranked plan
in [`PLAN-ai-interaction-layer.md`](PLAN-ai-interaction-layer.md); that
file's inventory, fights and P0.2a build status still hold and are cited,
not repeated. Operator ruling for this version: *"I don't care what my laws
say right now. I need to break my laws to break free."* So this plan cites
LAWS.md only where a law is being **replaced**, and otherwise argues from
evidence.

---

## 0 · The model in one paragraph

Every device — phone, desk, bench — shows **three things and nothing else**:

| Primitive | Where | What it is |
|---|---|---|
| **The Field** | bottom | One input: scan · type · say. Its placeholder always names where the input goes. |
| **The Card** | middle | One object, its state, and **one next action**. Full width. Everything else is one tap deeper. |
| **The Stack** | top-left | Where you have been and what is waiting: your session blocks in reverse order, plus the standing queues (Tasks · Work orders · Picker queue · To-ship). |

There is no sidebar, no menu, no tab bar of destinations. **What you scan
decides what the Card is.** A dispatch table maps *scan class × the object's
current state* to a card and a session title. The session is renamed for
that block of time by the dispatch, and the operator can edit the name.

---

## 1 · Why this is the fastest display, with the evidence

| Claim | Evidence | What it rules |
|---|---|---|
| One instruction at a time beats a screen of options | Voice-directed picking (Lucas Jennifer, Honeywell Vocollect) reports 10–90 % productivity gains over RF screens, average 36 %, and the gain is attributed to *not stopping to read a screen or press function keys*. | The Card shows one next action. The system says what is next; the operator does not choose from a menu. |
| Fewer choices, faster decisions | Hick's law: decision time grows with log₂(n+1). Cutting a flow from eight questions to three cut completion time by a third. | One primary action, at most two secondary. Everything else behind "more". |
| Optimistic, keyboard-first triage is the fastest queue processing there is | Superhuman: one item at a time, single-key verbs, every action paints before the server answers, undo as the safety net, target 50–60 ms because perceived responsiveness degrades above 100 ms. | A write on the Card is one press, paints immediately, and is undoable. The Card must paint under 100 ms after a scan. The model never sits between a scan and its Card. |
| Scan-driven, verification-style flows are the floor standard | SAP EWM RF "screen flow verification": fields are closed, you verify by scanning what the step expects, and the posting fires with no touch. Modern SAP shops replace RF menus with task flows entirely. | The armed session decides what a scan means. A scan the step expects **acts**; any other scan **previews** without touching the session. |
| Back is history, not a sitemap | Android and iOS both define Back as the reverse-chronological stack of screens; iOS 14 added long-press on Back to jump to any level. | The Stack is the back button. Long-press jumps. Nothing else is behind top-left. |
| The resolver model already exists for barcodes | GS1 Digital Link resolvers read the application identifier plus request context and redirect. | The dispatch table is a resolver whose context is "which session is armed and what state is this object in". |

---

## 2 · The dispatch table (the whole navigation)

Scan class → object state → Card. Titles are data (`work_sessions.title`),
dispatch keys are code (`surface_key`). A second warehouse renames the jobs
without a migration.

| Scan class | State | Card | Session title |
|---|---|---|---|
| Carrier tracking number | never seen | **Arrival**: photos of label + box, then *Unbox now / Rack it* with the system's pick preselected and its reason | `Arrival · {carrier} {last4}` |
| Carrier tracking number | known carton | that carton's current stage Card | carton's existing title |
| License plate / SSCC | open QC record | **QC**: works / doesn't, ticket note, test feedback | `QC · LPN {n}` |
| License plate / SSCC | staged for pack | **Pack** | `Pack · {order}` |
| Bin / tote | paired to a pending order | **Pack**: order → label | `Pack · {order}` |
| Bin / tote | unpaired | **Bin** overview (contents, put-away) | — (preview) |
| Serial unit | any | **Unit** overview, actions filtered by state | — (preview unless a session expects it) |
| SKU / GTIN | any | **Product** overview, in every station | — (preview) |
| Kit manifest | any | **Kit** Card | `Kit · {n}` |
| Support ticket | any | **Ticket** Card | — (preview) |
| Typed prose / voice | — | the assistant answers on the Card; queues open as Card lists | — |

Rules that make the table safe with no menu:

1. **Preview versus act is state, not a switch.** No session armed → every
   scan previews. Session armed → a scan whose class the session expects
   acts; any other class previews *over* the session without parking it.
2. **Ambiguity resolves by prior state; only a tie asks**, as one line on
   the Field with two answers.
3. **Every dispatch announces its destination in words** before it acts
   (the placeholder and the Card header), and every act is losslessly
   reversible from the Stack.
4. **The three classes the router lacks today** — carrier tracking number,
   SSCC, bin-paired-to-order — are added to `barcode-routing.ts`. The
   existing eight (SKU, bin, carton, line, unit, LPN, kit, ticket) stay.

---

## 3 · The Card, exactly

```
┌──────────────────────────────────────────┐
│ ◀ Stack        ARRIVAL · UPS 4471        │  header: back, dispatch, title
├──────────────────────────────────────────┤
│ 1Z 999 AA1 01 2345 4471                  │  the object
│ from: Goodwill Ohio · 2 cartons expected │  state, 1–3 facts
│                                          │
│ [ photo: label ]  [ photo: box ]         │  the step's inputs, if any
│                                          │
│ ▶ UNBOX NOW  · 3 orders waiting on this  │  ONE primary, preselected,
│   Rack it for later                      │  with the reason; ≤2 secondary
├──────────────────────────────────────────┤
│ ⌕  Scan · type · say  → lands in Arrival │  the Field, destination named
└──────────────────────────────────────────┘
```

- **One Card on screen.** Queues open as a *Card list* (the existing
  slot-table engine, sortable, Enter or tap opens a row as a Card).
- **Detail is one tap deeper**, never on the first screen.
- **Feedback lands on the Card**, not a toast: what just happened, what is
  next. (The existing welded feedback panel on the composer is that seat.)
- **Desk and phone are the same three primitives.** The desk gets a wider
  Card and may show a Card list beside it when asked. The phone shows one.
- **The AI is for exceptions and questions**, reached through the Field. It
  never gates the scan-to-Card path, so the 100 ms budget holds.

---

## 4 · The Stack — the answer to "can people go back"

Top-left, one press. Long-press jumps to any level.

| Band | Contents | Backed by today |
|---|---|---|
| **Now** | the armed block: title · state · elapsed | `work_sessions` + `work_session_intervals` |
| **Earlier today** | blocks in reverse order, each resumable in place | the same, S12's interval math |
| **Queues** | Tasks · Work orders · Picker queue · To-ship, as Card lists | `tasks`, `work_assignments`, picks, `orders` product tables |
| **Find** | type to search anything openable | `launch-index.ts` |

Where the old laws put this: recents (H1a, session-scoped), blocks (S12),
and the rails (R9: pins → tabs → recents). **The Stack replaces both rails
and the well.** Nothing in it is a destination that is not also a Card; the
"sitemap" is gone because every place is reachable by scanning its object,
by asking, or from the Stack.

---

## 5 · What is replaced, what stays

**Replaced by this plan** (laws named so nothing dies by accident):

| Old | New |
|---|---|
| Two rails (R-series), the well, the beam's session chip | The Stack |
| Mode picker on the composer (Unbox · Ticket · Ask), R2 dock | The Field: one input, destination named, no mode faces |
| Displays on the right of a station | The Card's "more" and the Card list |
| "Assistant is the first screen" (T15) | The Field is the first screen; the Card is empty until a scan or a question |
| Recents band (H1a) | The Stack's "Earlier today" |

**Stays, because it is the engine, not the display:** one armed scan
session (S1), lossless park (S4), switching type ends and opens (S5), titled
sessions (S10), assignments as the unit of work (S11), reads free / writes
gated by trust class (T28), the wedge detector, `ingestCanonicalOrders` and
the staging draft, the tool registry with one write chokepoint, the slot
table engine.

**Stays from v1 of this plan:** the inventory (§1 there), fight A (the floor
is scan-first; voice is the exception path — the voice-picking numbers above
are *directed* voice, one instruction spoken to the operator, not free
dictation per carton), the industry-standard stack (AI SDK 6 loop, a
json-render style catalog for "show me X", MCP Apps later), and the built
P0.2a paste intake.

---

## 6 · The plan, ranked

### P0 — the Scan Shell on the phone *(now)*

| # | Build | Gate |
|---|---|---|
| **P0.A** | Dispatch table as data + tests. Three new scan classes. The preview-versus-act rule. | 20 scans across 5 classes land on the right Card. Card paints < 100 ms after the scan (measured). A non-fitting scan parks nothing. |
| **P0.B** | The Card on the phone for four dispatches: **Arrival** (photos → Unbox now / Rack it, recommendation + reason), **QC** (works / doesn't, note, ticket), **Pack** (bin → order → label), **Preview** (product / unit overview). | One real shift on one phone with **no menu opened**. Count every time the operator wanted a menu; each is a missing dispatch row. |
| **P0.C** | The Stack: Now · Earlier today · Queues · Find. Long-press jump. | Any work order from the shift reachable in ≤ 2 presses. Resume a parked block in place. |
| **P0.D** | *(carry from v1)* companion voice validation; paste → staging is BUILT. | as v1 |

### P1 — the Field gets the model *(weeks 2–4)*

- Swap the custom agent loop for AI SDK 6 (ToolLoopAgent, typed tool
  parts, `needsApproval` = the trust class). The Field's prose and voice
  path rides it.
- A json-render style **catalog** whose components are the Card, the Card
  list (slot table) and tiles. "Show me the picker queue" paints a Card
  list. This is the vocabulary you manage.
- The caged-row conversation (v1 P0.2b) and assignments by chat (v1 P0.2d).

### P2 — the desk becomes the same three primitives *(weeks 5–8)*

- Remove both rails and the well; mount the Stack top-left, the Field
  bottom, the Card (and Card list beside it) in the middle.
- The Reticle and the wheel (v1 §7) as the desk's mouse plane.

### P3 — demand-gated

- Templates and the community catalog; native shell; desk microphone.

---

## 7 · Questions only the operator can answer

| # | Question | Blocks |
|---|---|---|
| Q1 | Which four dispatches ship first? This plan picks Arrival, QC, Pack, Preview. | P0.B |
| Q2 | The phone hardware: camera scan, or a Zebra gun in keyboard-wedge mode? The wedge path exists; DataWedge keystrokes ride it unchanged. Camera needs the 150 ms feedback-to-close timing Scandit measured. | P0.A |
| Q3 | Does the desk lose its rails in P2, or the day the Stack ships on the phone? | P2 |
| Q4 | "Fall back to staff Y when X is not scheduled" — still not a modelled rule anywhere. | P1 |
| Q5 | Who names the session: the dispatch title, always editable, or the operator first? This plan says dispatch first. | P0.A |

---

## 8 · Sources

- Lucas Systems, voice picking compared to RF — https://www.lucasware.com/voice-picking-compared-to-rf/
- Lucas Systems, order picking productivity — https://www.lucasware.com/order-picking-productivity-strategies/
- Superhuman: speed as the product — https://blakecrosley.com/guides/design/superhuman
- Hick's law, LogRocket — https://blog.logrocket.com/ux-design/using-hicks-law-help-users-make-decisions/
- Progressive disclosure, Jakob Nielsen — https://jakobnielsenphd.substack.com/p/progressive-disclosure
- SAP RF Navigation — https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9832125c23154a179bfa1784cdc9577a/8fc8cb53ad377114e10000000a174cb4.html
- Modern warehouse execution beyond RF screens, Neptune — https://www.neptune-software.com/resources/modern-warehouse-execution-on-sap-ewm-requires-more-than-rf-screens/
- Android back stack principles — https://developer.android.com/guide/navigation/principles
- iOS 14 navigation history stack — https://sarunw.com/posts/what-should-you-know-about-navigation-history-stack-in-ios14/
- GS1-Conformant Resolver Standard — https://ref.gs1.org/standards/resolver/
- Scandit, scanning at scale UX — https://www.scandit.com/blog/scanning-at-scale-ux-insights/
- Zebra DataWedge — https://techdocs.zebra.com/datawedge/15-0/guide/about/
