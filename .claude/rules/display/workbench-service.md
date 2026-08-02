# Workbench branch `service-workspace` — the agent workspace

The **conversation-first branch of Workbench**: an agent picks a case from a durable queue, reads
and replies to a **thread**, with the customer's record beside it. Support (`/support`) is the only
member today.

**Ratified 2026-08-01** — [`support-service-workspace-PLAN.md`](../../../docs/todo/support-service-workspace-PLAN.md)
(Gemini Option B), from [`region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md`](../../../docs/todo/region-contract-branching-support-GEMINI-RESEARCH-BRIEFING.md).

**Inherits:** [`workbench.md`](workbench.md) (the contract), [`../ui-design-system.md`](../ui-design-system.md)
(Kinetic Ledger, density `ops`). This doc adds only what is *specific to the branch* — it does not
restate the Workbench contract.

---

## The middle is the work; the right side is the extras

> **The middle is what must be done right now. The right side is the extras — the context and the
> actions that help the middle.**

This is the branch's **ranking rule**, and it settles arguments the composition table cannot. It is
why Connections left the thread's tab strip: linkage *explains* the conversation, it is not the
conversation, so making the agent swap the conversation out to read it inverted the ranking.
Followed to its end (2026-08-02) it emptied the strip entirely — **the thread has no tab strip at
all now**, and every display lives on the right edge.

**It is also the entry test for every future right-rail tab — if it is the work, it belongs in the
middle.** Worked verdicts:

| Candidate | Verdict | Why |
|---|---|---|
| **The customer conversation** | **middle** | It *is* the work — the one thing the middle holds |
| **Connections** (tracking / order / serial, link, unlink) | rail | Explains the thread; the agent reads it *while* replying |
| **Timeline** (ticket activity / carrier / unit journeys) | rail | Read-only history of the record in the middle |
| **Conversations** (internal team thread) | rail *(corrected 2026-08-02)* | See below |
| **AI *suggestions*** (drafts a reply the agent still sends) | rail | It proposes; the composer in the middle commits |
| **An AI panel that SENDS** | **middle** | Sending is the work |

**Conversations moved to the rail, and the reason it was in the middle did not
hold.** The stated ground was "a second composer in the rail would be two
writers over one thread". The team thread and the customer ticket are two
*different* threads with two different audiences, so their composers write to
different stores — the collision the rule guards against cannot occur. What the
old placement did cost was real and daily: writing an internal note about the
conversation required taking the conversation off screen.

**The rail's displays are exclusive, and the middle never swaps.** One display
shows at a time, switched by a `density="icon"` strip — the Unbox Displays shape
(`display/station-workbench.md`). Each display owns its own controls; the bottom
dock stays **ticket-terminal** and is never re-labelled by a click on the right
edge, because a control in one region rewriting a control in another is the
cross-region action-at-a-distance the station law bans.

**There is no separate "Updates" display.** It rendered
`SupportContextHub onlySegment="activity"` — `bundle.timeline`, the exact array
Timeline's Activity spine already shows. Timeline is the superset (Units ·
Tracking · Activity), so it keeps the job; two homes for one fact is the thing
being avoided, not the tab count.

**A rail tab must be reachable and useful the moment it ships.** `SupportSuggestionPanel` exists but
has zero consumers and no bridge into any composer, so the AI tab is **absent** rather than mounted
empty — an empty tab that looks broken costs more trust than a missing one.

**The right edge is `RightRailHost`'s, and the branch shell has two slots.** A `service-workspace`
shell renders **list** and **thread** and nothing else; context is a rail occupant that registers
itself. `ServiceWorkspaceShell` carried a private `<aside>` for one day (2026-08-01) — a second
permanent consumer of the edge, and a duplicate of `SupportContextDetailPanel`, which was already
registering the same `SupportContextHub` correctly. Deleted, not migrated. Guard:
`service-workspace.guard.test.ts`.

**The rail's `push` is decided by the HOST, not the panel.** `SupportContextDetailPanel` has two
hosts with opposite answers — Unbox nests it inside an `UnboxPushColumn` (float, or two columns fight
one edge), `/support` gives it the edge outright (push). So `push` is a **required prop with no
default**: a default is a silent opt-out at every call site nobody visited
(`backend-patterns.md` → a safety classification is a required parameter). Guard:
`right-rail-push.guard.test.ts`.

---

## The three layers, kept apart

| Layer | Answer for Support |
|---|---|
| **A — Region contract** | **Workbench.** Pointer-driven, URL-addressable selection, CRUD, density `ops` |
| **B — Product domain** | **Support** — a MasterNav spine section with modes (Tickets · Orders · Voicemail · Calls · Warranty · Issues) |
| **C — Branch / composition** | **`service-workspace`** — list \| thread + composer \| context |

**A branch is a Layer C composition, never a Layer A contract.** `ARCHETYPE_IDS` stays four
(`src/lib/stations/archetype.ts`), and `service` / `support` / `inbox` will never be a fifth. Pinned
by `surface-keys.test.ts` → *"a Workbench BRANCH is a composition, not a fifth archetype"*.

### Why the registry said `station` for months

`SURFACE_REGISTRY.support.archetype` read `'station'` until 2026-08-01. That was a **category
error**, not a defensible reading: `scan` was already `null`, so Q1 of the discriminator — the only
question that returns Station — never applied, and the row contradicted itself. What it actually
recorded was the **nav promotion** (More → Stations). A spine section is a domain; a domain is not a
contract. The single most repeatable way to make this mistake again is to reason from *where a page
sits in the nav* instead of *what drives the region*.

---

## Entry test — all three, or it is not a branch member

A Workbench surface may claim `service-workspace` only when:

| # | Signal | Support today |
|---|---|---|
| 1 | `hasOmnichannelSource` — helpdesk / voice / messaging capability | **Yes** — `integrations.zendesk`, voice |
| 2 | `primaryDataShape === 'thread'` — chronological conversation, not `ledger` / `document` | **Yes** for Tickets |
| 3 | Needs SLA / timer / collision-presence chrome (**or a clear plan to mount it**) | **By plan only** — assignment ships (`ZendeskSelect`, `SupportChatHeader`); SLA and presence do not |

**Clause 3 is currently carried by its own escape hatch, and that is worth watching.** If the next
candidate also satisfies it only by plan, the clause is decorative and the test is really two
questions, not three. Do not quietly widen it to admit a domain — either the chrome lands, or say
plainly that a two-clause test admitted the surface.

---

## Composition

```text
┌────────────────────┬──────────────────────────────────┐ ┌─────────────────────────┐
│ LEFT — queue map   │ MIDDLE — thread (focus surface)  │ │ RIGHT — displays        │
│                    │                                  │ │ ▣ ▣ ▣  icon strip       │
│ durable ?ticket=   │ split header (PaneHeader blocks) │ │ Connections             │
│ STAYS MOUNTED      │ conversation body — NO tab strip │ │ Conversations           │
│ on selection       │ crossfades on ticket id          │ │ Timeline                │
│                    │ ──────────────────────────────── │ │ push · resize · collapse│
│                    │ OmnichannelComposerDock (bottom) │ │ SupportContextDetailPanel│
└────────────────────┴──────────────────────────────────┘ └─────────────────────────┘
      the SHELL's two slots — and only two            the RightRailHost's occupant
```

| Slot | Owns | Never |
|---|---|---|
| **List** | The durable queue map — status tabs, search, pagination | Ephemeral selection; act-and-clear auto-advance; **being replaced by the thread** |
| **Thread** | The customer conversation, and only that; the singular focus crossfade, keyed on ticket id | **A display switcher in its body** — reaching the linkage must not take the conversation off screen; replacing the whole page with a Station focus card |
| **Header** | The **split header** — an icon action row over dense identity, composed from the `PaneHeader` **blocks** onto a card shell whose radius/border/lift match the queue card. It is the subject's ONE home on this surface | `PaneHeader`'s own `mainStickyHeaderClass` (a full-bleed squared band — it seams against the rounded queue card); a wrapping hero title; `StationContextBar` / `CartonContextCard`; **the chat header restating the subject one row below it** |
| **Composer** | `OmnichannelComposerDock`, bottom-docked on the thread, **ticket-terminal** | A second sticky Support-only composer beside it; a dock whose label changes with the rail's selected display |
| **Displays** | `SupportContextDetailPanel` — a `RightRailHost` occupant mounted *beside* the shell, hosting `SectionTabsSlider density="icon"` | A private `<aside>` in the shell; floating over the thread; a Station push-column twin for CX; a nested scroll port inside the rail's own |

### The list must stay mounted — this is the branch's whole point

`workbench.md` already says *"The collection map does not animate"* and *"keep the table mounted
`display:none` to preserve cache + scroll."* Support violated that at the structural level, not the
cosmetic one: `SupportTicketsWorkspace` returned **either** `SupportTicketsBoard` (no `?ticket=`)
**or** `SupportTicketFocus` (with `?ticket=`). The queue was *unmounted* when a ticket opened, so
closing a ticket refetched the board and threw away scroll position and page — on the surface whose
core loop is "work the queue." The left rail did not compensate: for Tickets it mounts
`SupportTicketsRecentRail`, a **recently-selected dock**, not the queue map.

**Fixed 2026-08-01.** `ServiceWorkspaceShell` renders `list` unconditionally and hides it with
`display:none` + `inert` while the thread holds the surface. Pinned by
`service-workspace.guard.test.ts` → *"the shell never unmounts the queue map"*, which also fails on a
re-introduced `if (!ticketId) return <Board/>` early return.

**Still staged: the thread COVERS the list, it does not yet sit beside it.** Side-by-side needs a
compact queue list — the board's chrome (status tabs · search · sort · pagination) does not survive a
~380px column, and standing up a second list before lifting the board's `sort`/`page` state would put
two lists over one queue with independent state, which is the drift the house rules ban. When that
state lifts, the adjacency is a slot swap: `list` takes the compact list and `listHidden` goes away.

**The branch exists for that adjacency.** Everything else here — the composer name, the context rail,
the Station chrome removal — is downstream of it.

---

## Modes are content; contracts are per region

The `/support` **route** is a domain that hosts several regions, and
[`contextual-display.md`](../contextual-display.md) is explicit that *a page may host several
contracts — each region obeys exactly one*. A mode switching the middle does **not** re-decide the
page's contract, and it does **not** drag every mode into this branch.

| Mode | Region contract | Recipe | Notes |
|---|---|---|---|
| **Tickets** | Workbench | **`service-workspace`** | The reference member: queue \| thread \| context |
| **Voicemail** | Workbench | master–detail | `?vm=` durable, real CRUD (call back · mark done · snooze · create ticket). A voicemail is a **record**, not a thread — it fails entry-test #2 |
| **Calls** | **Monitor** | stream | `CallLogView` is observe-only: ephemeral `?direction=` / `?q=` filters, no durable selection, no edit. Q2 returns Monitor |
| **Orders** | Workbench | ops-queue | Reuses the Dashboard To Ship grid + `UnshippedSidebar` wholesale — correct, do not fork it into a thread |
| **Warranty** | Workbench | master–detail / form | Coverage + claims + `?open=` claim detail |
| **Issues** | Workbench | table + fact stack (+ Monitor KPI rollup region) | `?issueId=` |

**The plan's D8 says Voicemail / Calls are "modes inside the branch, not new contracts."** What that
ruling protects is the *"not new contracts"* half, and it holds absolutely: none of these six needs
an archetype that does not already exist. But three of them are not thread-shaped, and calling a
read-only call stream a `service-workspace` member would put a reply composer under a surface with
nothing to reply to.

**So the honest split is: the SHELL is shared across the domain; the BRANCH LAW governs the thread
modes.** One `list | middle | context` frame gives `/support` a single spatial grammar — that is the
Layer C win, and it is why a non-thread mode may mount the shell. What a non-thread mode does *not*
inherit is thread physics: no composer dock, no thread crossfade, and for Calls no durable selection
at all.

**A mode that cannot fill the middle yet renders a teaching empty in the shell** — never a stub with
Station scan UI, and never a new archetype.

---

## Forbids

| Forbid | Why |
|---|---|
| Ephemeral selection | A ticket must survive reload and be shareable — `?ticket=` is the state SoT |
| Barcode-first act-and-clear auto-advance | Not a scan floor. Nothing here answers to a wedge |
| The primary queue in a compact **scan** column | Station grammar, and the browse-list-in-a-station anti-pattern from the other direction |
| `StationWorkbench` / `StationContextBar` as Support's **primary** shell | Unbox-family *carton* anatomy on a conversation. See below |
| Unmounting the queue to show the thread | The defect the branch exists to fix |
| A Support-only composer fork | One shared dock — see Composer SoT |
| Forcing the Desk **`ops-queue`** recipe (LedgerGrid middle + right inspector) as the Support MVP | Right recipe, wrong data shape — see [`workbench-ops-queue.md`](workbench-ops-queue.md). That recipe stays for Sales / Fulfillment / Inbound |

### Station chrome on Support — what actually has to go

`SupportTicketFocus` composes `StationContextBar` + `StationMoreDetails` + `StationWorkbench` +
`StationAmbientWash` + `StationTerminalDock`. That is the **Unbox carton bench** anatomy
([`station-workbench.md`](station-workbench.md)), built for a scanner-driven operator holding one
transient carton — reserved identity clearance, ambient wash, a terminal dock whose primary action
completes the unit and clears it.

A ticket is not a transient unit: it persists, it is assigned, it is returned to. Ticket identity is
a **Workbench identity header** (`PaneHeader` blocks / `SupportTicketIdentity`), not a carton context
bar.

**Compose, don't fork.** `SupportTicketIdentity` is an allowlisted deliberate fork in
`station-workbench-chrome.guard.test.ts` precisely because *a ticket is not a carton* — that
allowlist entry is evidence for this ruling, not an exception to it. When the shell lands, grow the
Workbench identity SoT rather than porting more carton chrome across.

---

## Composer SoT — one dock, not Station-owned

The reply composer and Unbox's carton-notes composer are **the same shell**:
`StationComposerDock` → renamed **`OmnichannelComposerDock`** in Phase 2 (`@/design-system/primitives`).

- **Support** reaches it through `SupportChatComposer` (inline under the thread, and
  `variant="station-dock"` via `SupportTicketComposerDock`).
- **Unbox** reaches it through `LineNotesCard` / `WorkspaceNotesCard`.

The rename is a **naming** correction, not a split: the shell was never Station-*contract* property,
it was just born there. Sharing it is the point — a chat-style composer with auto-grow, an attach
row, and a trailing primary action is the same widget in both places.

**Never invent `SupportComposerDock`.** A second amber sticky composer beside this shell is already
banned by [`source-of-truth.md`](../source-of-truth.md) → Station composer dock.

---

## Motion

- **Crossfade the thread, never the list.** `framerPresence.workbenchPane` +
  `framerTransition.workbenchPaneMount` (0.18s) — or `motionRole.swap.focus`, which resolves to
  exactly that pair. The queue map does not animate on selection.
- **This is a pointer surface, so it keeps the pointer preset.** Do **not** reach for
  `framerPresence.stationCartonSwap` / `motionRole.swap.scan` (0.12s, `duration: 0` exit). That
  sibling exists for *scan cadence* — swapping physically different cartons at a bench. Support has
  no scan cadence; borrowing the station preset would be importing the grammar this branch removed.
- **The context rail pushes; it does not float.** `motionRole.push.rail` — tween, never a spring
  (a spring overshoots the width every sibling lays out against).
- Reduced motion is handled by the app-wide `MotionConfig` floor; reach for
  `useMotionPresence` / `useMotionTransition` only for stronger-than-default reduction.

Full law: [`motion-crossfade.md`](motion-crossfade.md).

### Occupant id — a queue walk swaps in place

If the thread ever moves to a `RightRailHost` occupant, or grows prev/next ticket navigation, it
registers a **stable** occupant id (`detail:support-ticket`), not one keyed per ticket — otherwise
each step plays exit → empty → enter. Preconditions are non-negotiable: full re-seed on ticket
change, and **the dirty reply draft must flush for the OUTGOING ticket first**, while the save
closure still points at it. A composer holding unsent text makes this sharper than it is on an order
inspector — silently discarding a half-written reply is worse than a slow transition.

---

## Right edge

Context is a **push** column, not a float — the house right-edge law
([`source-of-truth.md`](../source-of-truth.md) → Right-rail modality). When rail-hosted it is a
`RightRailHost` occupant with `modal={false}`; when route-local it is `ContextPanelLayout`. Either
way it is resizable + collapsible, and it takes its width from the **left** (spine, then context
rail) before it takes it from the thread.

**A non-modal panel owns an explicit close control** — there is no scrim to click off. **And that
close must lead somewhere**: the thread's action row carries a `Connections` toggle whose `active`
state mirrors the rail, so dismissing the extras never strands the agent without a way back.
Closing the rail must not close the ticket — the thread is the work.

---

## Branch slope rule

A new domain earns a **formal Workbench branch** only when **both** hold:

1. the primary **data shape** mandates a different composition axis — chronological **thread** vs
   tabular **ledger**; **and**
2. it needs **persistent global chrome** unique to that axis — SLA timers, collision presence, an
   omnichannel source strip.

A domain that only introduces different business **entities** (SKUs vs Orders vs Quotes) uses an
**existing** Workbench recipe. Different nouns are not a different grammar.

| Domain | Branch? | Recipe |
|---|---|---|
| **Support** | **Yes — `service-workspace`** | list \| thread \| context |
| **Sales** | No | **`ops-queue`** (grid \| inspector) — law: [`workbench-ops-queue.md`](workbench-ops-queue.md) |
| **Fulfillment Desk** | No | **`ops-queue`**; Scan-out stays **Station** |
| **Inbound Desk** | No | **`ops-queue`** / boards + inspector |

**The slope this blocks is real and named:** `SalesContract`, `FulfillmentContract`,
`InboundContract` — a contract per nav domain. That is the same mistake as
`SURFACE_REGISTRY.support.archetype: 'station'`, just pointing the other way: one read a domain off a
contract, the other would write a contract off a domain.

---

## Who else may join the branch

Later members must pass the entry test on their own — not inherit membership from living under
`/support`. A plausible future member is a customer-messaging surface for a non-helpdesk channel
(marketplace messaging, SMS). **Warranty and Issues are not candidates**: both are record/form work
that happens to sit in the Support domain.

---

## Do / Don't

| Do | Don't |
|---|---|
| Keep the queue mounted; crossfade only the thread | Return list **or** thread from the same branch |
| Write the ticket id to the URL (`?ticket=`) | Hold selection in `useState` |
| Put every non-conversation display on the right edge | Mount a display switcher in the thread body |
| Keep the dock ticket-terminal | Re-label the bottom dock from a right-edge click |
| Render the subject once, in the split header | Restate it in the chat header below |
| Compose one `OmnichannelComposerDock` | Fork a Support-only composer |
| Push the context column; give it a close control | Float it over the thread |
| Let a non-thread mode mount the shell with an honest middle | Force a composer onto a read-only call stream |
| Grow a Workbench identity header for a ticket | Port `StationContextBar` carton chrome across |
| Add a branch only when data shape **and** chrome both differ | Mint a contract per nav domain |

---

Indexed by [`../contextual-display.md`](../contextual-display.md)
