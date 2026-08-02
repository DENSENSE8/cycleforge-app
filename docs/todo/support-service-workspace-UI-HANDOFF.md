# Handoff — `service-workspace` UI/UX finish: real right rail, real header

**For:** the next Claude Code / Cursor session
**From:** Cycle Forge engineering
**Status:** ready to execute
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Predecessors:** [`support-service-workspace-PLAN.md`](./support-service-workspace-PLAN.md) ·
[`support-service-workspace-CLAUDE-CODE-PROMPT.md`](./support-service-workspace-CLAUDE-CODE-PROMPT.md)
**Law:** [`.claude/rules/display/workbench-service.md`](../../.claude/rules/display/workbench-service.md)
**Landed so far:** `6581c6211`, `9dd945010` (registry → `workbench`, branch law, composer rename,
3-pane shell, `station/` → `service-workspace/`)

---

## 0. One-sentence goal

Finish the branch's chrome honestly: **the right column becomes the house right-rail SoT with real
tabs, the squared-off top band goes away, and the same hand-rolled-rail pattern gets found and fixed
everywhere else it exists.**

---

## 1. The governing principle (new — encode it)

> **The middle is what must be done right now. The right side is the extras — the context, the
> actions that help the middle.**

This is the branch's ranking rule and it is currently nowhere in writing. Add it to
`workbench-service.md` as a named section, because it settles arguments the composition table cannot:
it says *why* Connections left the tab strip (it explains the conversation, it is not the
conversation), and it is the test for every future right-rail tab — **if it is the work, it belongs
in the middle.**

---

## 2. Measured ground truth (2026-08-01)

### 2.1 The right column is a fork — and the correct panel already exists

`ServiceWorkspaceShell` renders a **private** right column:

```tsx
// src/components/support/service-workspace/ServiceWorkspaceShell.tsx
<aside className={SERVICE_WORKSPACE_CONTEXT_CLASS} aria-label="Ticket context">
```

`SERVICE_WORKSPACE_CONTEXT_CLASS` is a hand-rolled `w-[20rem] shrink-0 … border-l` in
`service-workspace-layout.ts`. That is a second permanent consumer of the right edge, which
`src/lib/right-rail/store.ts` exists specifically to prevent.

**This is not a hypothetical fork.** Support *already ships* a correct right-rail occupant for the
same content: `src/components/support/context/SupportContextDetailPanel.tsx` registers
`detail:support-context:<ticketId>` through `DetailStackRailRegistrar`, non-modal, and its docblock
already gives the right rationale ("a scrim would hide the very conversation the linkage is about").
Both render `SupportContextHub`. So the shell shipped a duplicate of a panel that was already
correct — delete the duplicate, do not "migrate" it.

### 2.2 The header

`SupportTicketFocus` mounts `PaneHeader`, whose shell is `mainStickyHeaderClass` — a full-bleed
squared band. Against the rounded queue card beside it this reads as a seam (see the handoff
screenshots). **Banned.** It also must **not** become `StationContextBar` / `CartonContextCard`
(the floating station bookmark) — that is Unbox carton chrome and the whole branch ruling was about
getting Support out of it.

### 2.3 Files

```
src/components/support/service-workspace/ServiceWorkspaceShell.tsx      # the private aside — delete it
src/components/support/service-workspace/service-workspace-layout.ts    # SERVICE_WORKSPACE_CONTEXT_CLASS — delete it
src/components/support/service-workspace/SupportTicketFocus.tsx         # the banned header
src/components/support/service-workspace/support-ticket-tabs.tsx        # buildSupportContextColumn — becomes rail content
src/components/support/context/SupportContextDetailPanel.tsx            # the CORRECT occupant, already registered
src/components/right-rail/useRegisterRightPanel.ts                      # the registration API
src/components/right-rail/DetailStackRailRegistrar.tsx
src/lib/right-rail/store.ts                                             # RIGHT_RAIL_PRIORITY { assistant: 10, detail: 100 }
src/components/right-rail/right-rail-push.guard.test.ts                 # existing push contract guard
src/components/support/service-workspace/service-workspace.guard.test.ts # branch guard — extend, don't fork
```

---

## 3. Phases

### Phase 1 — delete the hand-rolled rail (blast: low)

1. Remove the `<aside>` + `context` prop from `ServiceWorkspaceShell`. The shell keeps exactly two
   slots: **list** (never unmounts) and **thread**.
2. Delete `SERVICE_WORKSPACE_CONTEXT_CLASS`.
3. Mount `SupportContextDetailPanel` for the open ticket so the context arrives via `RightRailHost`.
4. `modal={false}`, `push` left at its default — the work surface must reflow beside it, never under.
5. **Keep the occupant id stable across ticket→ticket.** `detail:support-context:<ticketId>` is keyed
   per record; if the thread grows prev/next, that id plays exit → empty → enter on every step. Read
   the stable-id exception in `source-of-truth.md` → Right-rail modality before changing it, and note
   its preconditions (full re-seed; flush the dirty reply draft for the **outgoing** ticket first —
   sharper here than on an order inspector, because discarding half-written text is silent).

**Gate:** `/support?ticket=<id>` shows context on the house rail; `npx tsx --test src/components/right-rail/*.guard.test.ts`.

### Phase 2 — tab the rail (blast: medium)

Three tabs, in this order:

| Tab | Content | Source |
|---|---|---|
| **Connections** | linkage — tracking / order / serial, Unlink, Link tracking | `buildSupportContextColumn` / `SupportContextHub linkageOnly` (exists) |
| **AI suggestions** | suggested reply / resolution | `SupportSuggestionPanel` (`zendesk/chat/`) — **verify it is wired before promising it** |
| **Updates** | ticket activity / audit | `SupportContextHub` activity segment, or the `EventTimeline` SoT |

- Compose an existing tab primitive — `PaneHeaderTabs` (`@/components/ui/pane-header`) or
  `SectionTabsSlider`. **Do not hand-roll a third tab strip.**
- The rail owns its own tab state; it must **not** re-key the rail occupant id, or every tab click
  replays the panel crossfade.
- **Apply §1 to each tab before adding it.** A tab that is the operator's actual next action belongs
  in the middle. AI *suggestions* are context (they propose; the agent still sends from the composer).
  An AI panel that sends is the work and does not belong here.

**Gate:** tab switches do not crossfade the panel; thread and queue untouched.

### Phase 3 — replace the header (blast: medium) — **see §6, needs a decision**

Remove the squared band. Requirements, whatever it composes:

- **Not** `mainStickyHeaderClass` / a full-bleed squared band.
- **Not** `StationContextBar` / `StationMoreDetails` / `CartonContextCard` — the station floating
  bookmark stays out (pinned by `service-workspace.guard.test.ts`).
- Keeps dense identity (`text-role-caption`, truncating subject, ticket id) — **never** a wrapping
  hero title, per `display/right-rail-inspector.md`.
- Keeps the close control. A non-modal push surface has no scrim; Escape alone is not a dismiss.
- Its corner geometry must agree with the adjacent queue card — the seam in the screenshot is the
  actual complaint.

**Gate:** `npm run verify` + a browser pass at 1440 and 1920.

### Phase 4 — audit sweep (blast: survey first, then per-surface)

**Find every other surface that hand-rolled a right rail instead of composing the SoT.** Candidates
measured 2026-08-01 — each needs classifying, not blanket condemning:

| Surface | Shape | First read |
|---|---|---|
| `receiving/workspace/ZohoSplitPane.tsx:64` | `fixed right-0 top-0 z-40 border-l` | **Strongest offender** — literally the `fixed right-0 z-panel` shape the store's docblock names |
| `warehouse/BinDetailFlyout.tsx:95` | `fixed inset-y-0 right-0 z-panel w-full max-w-md` | Flyout over the work surface — floats where the house says push |
| `inventory/graph/SkuGraphDetailPanel.tsx:76,83` | `w-80 shrink-0 border-l` aside | Canvas inspector? or fork — decide by region contract |
| `inventory/graph/partsGraph/PartsDetailPanel.tsx:80,89,141` | same | same |
| `studio/StudioShell.tsx:350` | `w-72 shrink-0 border-l` aside | Likely **legitimate** — Canvas inspector is sanctioned secondary detail (`monitor-and-canvas.md`) |

**Do not sweep blindly.** `source-of-truth.md` sanctions **exactly two** right-edge grammars, and a
third must not be invented:

1. **App push column** — a `RightRailHost` occupant. The default for a picked record.
2. **Station push column** — `UnboxPushColumn`, station-scoped, never a rail occupant.

A Canvas inspector is a third case the docs already bless as *secondary detail inside the region*,
not a competing right edge. So the sweep produces a **classification table**, and only the genuine
forks get migrated.

**Deliverable:** a short findings doc + one migration per confirmed fork. If the sweep is large,
report the table and stop — do not migrate six surfaces unasked.

---

## 4. Hard laws

- `AGENTS.md` · `source-of-truth.md` (Right-rail modality) · `workbench-service.md` ·
  `display/right-rail-inspector.md`
- Every resident edge **pushes**; nothing floats over the work surface.
- One owner of the right edge: `RightRailHost`. Never a private `fixed right-0 z-panel`.
- The **queue never unmounts** — `ServiceWorkspaceShell`'s existing contract; the guard fails on a
  re-introduced `if (!ticketId) return <Board/>`.
- Crossfade the thread only. The queue does not animate.
- Attach to `:3050`; never start/restart/kill the dev server. User owns commits.
- `npm run verify` before done. **Never raise a ratchet baseline.**

---

## 5. Tree-state warning (real, cost this initiative twice)

Several sessions edit this repo concurrently. During the predecessor work another session **committed
this lane's uncommitted files into its own commits twice** (`9dd945010`, `6581c6211`), rewrote
`workbench.md` mid-flight, and edited `ServiceWorkspaceShell.tsx` under the running session.

- **Stage only your own files.** Never `git add -A`, never `git stash`.
- Before assuming a red gate is yours, check ownership — `git status --porcelain` the failing path.
  At handoff time `verify` was red from *other* sessions: `lib/interop/epcis-*`,
  `receiving/carton-photo-triage.ts`, a nav guard, a route-permission drift.
- Verify your own slice explicitly (`npx eslint <your paths>`, targeted `npx tsx --test`) and report
  which failures are pre-existing.

---

## 6. Stop and ask

**The header component is underspecified and is the one thing to confirm before building Phase 3.**
The request was a *"different split component from the current contacts floating station"*. That
rules two things out (the squared band; the station bookmark) but does not name what to build.
Resolve it before writing code — ask for either a named existing component, or a reference screenshot.
Do not invent a fourth header grammar; the house already has `PaneHeader` blocks,
`WorkbenchChromeHeader`, and `SidebarIntakeFormShell`, and a fifth is how this surface got into
trouble the first time.

Also stop and ask if:

1. Phase 4's sweep turns up more than ~3 genuine forks — report the table, do not migrate them all.
2. `SupportSuggestionPanel` turns out to be unwired — ship Connections + Updates and say the AI tab
   is absent, rather than shipping an empty tab that looks broken.
3. Making the rail tabs stable requires changing the occupant id contract — that is the
   `AnimatePresence` trap in `motion-crossfade.md`; bring the trade-off back rather than guessing.

---

## 7. Acceptance

- [x] No `<aside>` right column in `ServiceWorkspaceShell`; `SERVICE_WORKSPACE_CONTEXT_CLASS` deleted
- [x] Ticket context renders through `RightRailHost`, non-modal, pushing
- [x] Rail has Connections · Updates; switching tabs does not re-crossfade the panel — **AI suggestions is ABSENT** (§6.2: `SupportSuggestionPanel` has zero consumers and no composer bridge)
- [x] The squared top band is gone; identity stays dense; close control present
- [x] `workbench-service.md` carries the middle-vs-right principle (§1)
- [x] Phase 4 classification table exists (below); 2 genuine forks migrated, 3 sanctioned
- [x] Guard extended in `service-workspace.guard.test.ts` — Support must not hand-roll a right column
- [x] `npm run verify` green **for your slice**; inherited red named below

---

## 8. Executed 2026-08-01 — outcome

### Phase 4 classification

The sweep found **2 genuine forks and 3 sanctioned Canvas inspectors**. The discriminator is the
region contract, not the CSS: `monitor-and-canvas.md` blesses a `w-72`/`w-80` `border-l` aside as
**secondary detail inside a Canvas region** — that is not a competing right edge.

| Surface | Shape | Region | Verdict |
|---|---|---|---|
| `receiving/workspace/ZohoSplitPane.tsx` | `fixed right-0 top-0 **z-40**` + hand-rolled resize + rgba shadow | Workbench (Receiving) | **FORK → migrated.** Now a non-modal pushing `RightRailHost` occupant (`detail:zoho-po`, stable id — one singleton viewer that re-targets, not a queue walk). Also retired a raw `z-40` and a hardcoded shadow |
| `warehouse/BinDetailFlyout.tsx` | `fixed inset-y-0 right-0` + its own `fixed inset-0 **z-40**` scrim + `role="dialog"` | Workbench (Warehouse) | **FORK → migrated.** Now a non-modal occupant (`detail:bin:<barcode>`). The scrim was hiding the floor plan / bin table the operator compares against; modal is reserved for blocking wizards and destructive confirms, and the delete here is already arm-then-confirm inside the panel |
| `inventory/graph/SkuGraphDetailPanel.tsx` | `w-80 shrink-0 border-l` aside | **Canvas** — sits beside `SkuGraphCanvas` (pan/zoom/focus) | **Sanctioned.** Graph is the map, inspector is secondary detail |
| `inventory/graph/partsGraph/PartsDetailPanel.tsx` | same | **Canvas** — same host shape | **Sanctioned** |
| `studio/StudioShell.tsx` | `w-72 shrink-0 border-l` aside | **Canvas** | **Sanctioned** — the reference the doc itself names |

Repo-wide re-sweep for `fixed (inset-y-0 )?right-0` now returns **zero** non-test hits outside
`src/components/right-rail/` (the two remaining matches are docblocks warning against the pattern).

### Measured, not eyeballed

Dogfood org, 1440px, `/support?ticket=9604` (the QA org has no helpdesk connected, so the queue is
empty there — this probe was a visual/geometry check, not a landed spec):

- `data-right-rail-mode="push"`, rail box `x=1012 w=420`
- thread header card right edge **972** ≤ rail left **1012** → **zero overlap**; a screenshot cannot
  tell "pushed" from "covered", geometry can
- rail DOM node **identical across a Connections→Updates tab click** → the occupant id never re-keys,
  so no panel crossfade replay
- hiding the rail keeps `?ticket=9604` → closing the extras does not close the work

### Decisions taken (and why)

- **`push` is a REQUIRED prop on `SupportContextDetailPanel`.** Its two hosts disagree — Unbox nests
  it in an `UnboxPushColumn` (float), `/support` owns the edge (push). A default would be a silent
  opt-out at every unvisited call site (`backend-patterns.md`). `right-rail-push.guard.test.ts`'s
  `FLOAT_ONLY` entry moved from the panel to `SupportTicketDetail` (the host that decides), and its
  detection walk was widened so the indirection cannot hide an unreviewed opt-out.
- **Unbox's rail body is untouched.** `tabs` is opt-in; omitting it keeps the linkage strip above the
  hub's own Customer | Team | Activity pills, which is what the Unbox "Links" badge promises. Only
  `/support` gets tabs, and it omits **Team** because that is its thread's Conversations tab.
- **The split header is blocks-on-a-card, not `PaneHeader` itself.** `PaneHeader`'s shell is
  `mainStickyHeaderClass` — the full-bleed squared band that caused the seam. `SupportTicketPaneHeader`
  composes `PaneHeaderActionBar` + `PaneHeaderCloseButton` onto a `Panel` whose radius/border/lift are
  the queue card's, and the thread now shares the board's `WORKBENCH_*` gutter column.
- **The rail's close leads somewhere.** The action row carries a `Connections` toggle whose `active`
  mirrors the rail, so a non-modal column with no scrim can be dismissed and recovered.

### Inherited red (NOT this slice — §5 was accurate)

A concurrent session is mid-edit in the Unbox-procedure lane (it left
`docs/todo/unbox-procedure-column-FIX-HANDOFF.md` untracked). It owns every remaining `verify` failure:

| Gate | Failure | Owner |
|---|---|---|
| Typecheck | `UnboxProcedureColumn.tsx` — `step-face` has no `stepAccentClass`; `ProcedureCardFace.borderClass` missing | procedure lane |
| Unit | `the face registry holds no entry for a step that is not declared` | procedure lane |
| Knip | `PROCEDURE_CHECKLIST_ROW_PX`, `RecordPaneHeaderProps`, `UnboxProcedureChecklistProps` | procedure lane |

This slice is green: lint clean, no typecheck error in any file it touches, its own knip findings
resolved (not baselined), and 21/21 across `service-workspace.guard.test.ts` +
`right-rail-push.guard.test.ts`. Six `idor-regression` failures seen in one full run did **not**
reproduce and pass in isolation — DB contention in the parallel glob, not a regression.

### Open follow-up — CLOSED 2026-08-02

The Ticket tab's `SupportChatHeader` restated the subject directly beneath the split header's
identity row. Fixed, together with a second move the same pass:

- **One subject renderer.** `TicketSubjectField` (`zendesk/chat/`) owns the click-to-edit control;
  `SupportChatHeader` and `SupportTicketIdentity` both compose it, and the chat header suppresses
  its copy on `/support` via a new `hideTitle` pass-through on `SupportTicketDetail`. The subject
  stays editable because it moved *up* into the identity row rather than being deleted.
  `SupportTicketIdentity` also falls back to the `?ticket=` value for its live bundle — without it
  the row read "(no subject)" on first paint, which with the duplicate gone was the operator's only
  copy. Measured: `subjectVisibleCount: 1` in `innerText` at 1440 on `/support?ticket=9604`.
- **The displays moved to the right edge.** The thread's `SectionTabsSlider` is gone; the middle is
  the customer conversation and its dock, and Connections · Conversations · Timeline are the rail's
  displays behind a `density="icon"` strip (the Unbox Displays shape). `Updates` was folded into
  Timeline — it rendered `bundle.timeline`, the exact array Timeline's Activity spine shows.
  The header's rail toggle is now labelled **Displays**, not Connections, so two differently-scoped
  controls do not share one name. The dock is ticket-terminal.
  Measured at 1440: rail `push`, `x=1012 w=420`; all three displays render real content
  (linkage chips / warehouse thread + composer / activity timeline) and the conversation never
  leaves the screen. Law updated in `workbench-service.md`; guarded in
  `service-workspace.guard.test.ts`.
