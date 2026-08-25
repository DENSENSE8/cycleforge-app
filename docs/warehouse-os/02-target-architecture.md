# 02 — Target architecture

The Warehouse OS spec, written against modules that actually exist. Every "grow"
names the file; every "build" is honestly labelled net-new.

## 0. The core objects

Four independent object types. **Nothing owns anything else.**

| Object | What it is | Persisted as |
|---|---|---|
| **Session** | A unit of human work. **Kind is `scan` or `task`** (ruled 2026-08-22); a scan session also carries a `scanType` (Unbox, Arrival, Testing, Packing, Pickup, Triage). The kind + type dictate routing, validation, and which components display. | `work_sessions` row (new) |
| **Table** | A data grid instance. Route-independent. | tab descriptor + `saved_views` row |
| **Tool** | A utility usable from anywhere (Photo Library, Manuals, Label Printer, Process/Undo, Calculator). | tool registry entry + per-staff pin |
| **Tab** | A handle on an *open* session or table in the window manager. | `staff_preferences.prefs.workspace` |

A session is never "a page." A tool is never "a page." The URL names at most the
**focused** tile — see [`03-decisions.md`](03-decisions.md) D2.

### Scan or task — the one discriminator

```
Session
  kind: 'scan'   → has scanType.  EXACTLY ONE armed at a time, app-wide.
  kind: 'task'   → no scanType.   N may be open at once.
```

This is the whole answer to "which tile owns the next scan": **none of them.** The
global wedge listener routes to the single armed scan session, so tiles never compete,
there is no per-tile focus model, and arming a second scan session disarms the first by
construction. It also collapses the repo's seven overlapping "what kind of surface is
this" vocabularies into one field.

Sessions and sign-ins are **persistent** (D8) — no absolute timeout ends a mounted
shell mid-shift.

## 1. The shell

```
┌──────────────────────────────────────────────────────────────────────┐
│  [☰][⌕ scan/search]  │   LIVE SESSION CONTEXT   │  [pinned micro-tools]│  ← 40px, always
├───┬──────────────────────────────────────────────────────────┬───────┤
│ L │                                                          │   R   │
│ E │              MAIN CANVAS  (tiling / bento)               │   I   │
│ F │   ┌────────────────────┬───────────────────────────┐     │   G   │
│ T │   │  session tile      │  table tile               │     │   H   │
│   │   │                    ├───────────────────────────┤     │   T   │
│ r │   │                    │  tool tile                │     │       │
│ a │   └────────────────────┴───────────────────────────┘     │ tools │
│ i │                                                          │       │
│ l │  ← tabs / recents / pins / "+"          pinned tools →    │       │
└───┴──────────────────────────────────────────────────────────┴───────┘
```

**The shell already exists and already survives navigation.** `ResponsiveLayout`
sits between the providers and `{children}`, and Next preserves it across soft
navigation. The refactor replaces its single `children` slot with the canvas host —
it does not build a new shell.

### Global header — the only chrome visible 100% of the time
`GlobalHeader` already declares the four target zones. Keep the file's shape and
swap occupants one zone at a time; its geometry never changes.

| Zone | Today | Becomes |
|---|---|---|
| **nav** (left) | rail toggle · pins · recents · page face | rail toggle · **session/task context chip** |
| **scan** | `GlobalScanDock` — built, **0 publishers** | the universal input: **scan ⇄ search ⇄ preview**, mode-switched, collapsed by default, detail on hover |
| **context** (middle) | `HeaderContext.panelContent` — **0 producers** | live session context, typed data (not a `ReactNode`) |
| **actions** (right) | 5 fixed icons, rule-capped | **user-pinned micro-tools** (timer, stopwatch, connection health) |

The universal input replaces 11–14 per-station scan bars. Its logic collapses to:
**found in system → show the record + status; not found and in input mode → input it,
under the active session's type.**

> The old "rule-capped at five icons" header law and the "click-only, no hover peek"
> rail ruling were both deleted with the constitution. They are now product choices,
> not laws — but see D5 on why hover-reveal is still the wrong interaction here.

### Left rail — the window manager
Chrome-style tabs for open sessions and tables, shrinking as they crowd. Pinned
necessities (Settings, Shipping, FBA) at the bottom. Recents inline. A **"+"** that
opens a searchable master index of everything launchable, grouped by category.

**Grow, don't build:**
- The 19-branch `if` cascade in `SidebarContextPanel.tsx` → `PANEL_REGISTRY:
  Record<PanelId, {load, title, icon, sessionType, permission}>` built from the same
  19 `dynamic()` calls. **Do this before touching any panel body.**
- `ContextPanelLayout` is the only mount point for every route rail and already owns
  width, collapse, the expand strip, the hotkey and frame-cost publication → make it
  the **tab host**. No panel file has to change to become tab-hosted.
- The "+" index is a **new mount of existing code**: `buildCommandBarNavGroups` +
  `searchNav` already power both the in-spine find bar and ⌘K.
- `useSidebarChildNav`'s read/write halves have a tested round-trip invariant — swap
  `usePathname` for the tab store and `router.push` for `openTab`. Callers keep their
  signatures.

**Net-new:** the tab model itself. `openTabs|TabStrip|WindowManager|tabStore` matches
**0 files**.

### Right rail — the tool palette
Pinnable, keybindable, drag-source tools available from any tile. The active tool's
icon is highlighted.

**The one structural change that unblocks everything:** a registration must become a
**descriptor**, not a live `ReactNode`.

```ts
// today — a tool exists only while its owning page is mounted
useRegisterRightPanel({ id, priority, node: <PhotoInspectorPanel/> })

// target — a tool is data; the host mounts it lazily from anywhere
registerTool({
  toolKey: 'photos',            // required, no default
  title, icon, group, permission,
  load: () => import('...'),    // lazy factory, not an element
  dragPayload?, keybinding?,
})
```

Then: replace `recomputeTop()`'s single `topSnapshot` with an **ordered list** (keep
`getRightRailTop()` as a shim), and change `closeRightPanel()` from implicit-top to
`closeRightPanel(instanceId)`. `RightRailHost` reads occupancy through exactly four
imported functions — **it can be replaced wholesale behind a flag without touching any
of the 43 registrants.**

Add a required `toolKey` prop with **no default** to `DetailStackRailRegistrar` so the
compiler names all 39 mount sites that have not answered "which tool am I."

**Also collapse the two other right edges:** `StationDisplaysPushColumn` (4,388 LOC,
self-labelled a fork) and `RightPaneOverlay` (29 mounts).

### Main canvas — tiling
Drag, drop, and snap into columns, rows, and splits, with hotkeys for window
manipulation. Framed by **one inset-radius token** so the app reads as a HUD.

**Grow:** `resolveRightRailFrame` is a *pure* function with 22 unit tests — generalize
it to an N-pane constraint solver in isolation, test with zero React, then swap the
store's call. `useHorizontalEdgeResize` already separates pure drag math
(`widthFromEdgeDrag`, `edgeResizeWidthCap`) from the React hook — add a vertical twin.

**Deleted 2026-08-21** (was "delete on arrival"): `unbox-compare-layout.ts` and
`orders-compare-layout.ts` were the same tiling model forked twice, and both are gone
along with `UnboxCompareHost` / `OrdersCompareHost`. The generic host therefore starts
from zero forks rather than absorbing two as presets — plan the pane-clamping and
`clayout` behaviour fresh, do not port it. Do not ship a third.

## 2. Sessions

### The table
Model `work_sessions` on **`counter_sessions`**, the only session table in the repo
that is correct in every dimension:

```
work_sessions
  id                  BIGSERIAL
  organization_id     UUID NOT NULL          -- no DDL default; enforce_tenant_isolation()
  kind                TEXT NOT NULL          -- CHECK ('scan','task')
  scan_type           TEXT                   -- NOT NULL when kind='scan', else NULL
  armed               BOOLEAN                -- partial unique index: one armed scan per org
  staff_id            ...
  device_id           ...
  status              TEXT NOT NULL          -- CHECK
  version             INTEGER                -- optimistic concurrency
  claimed_by_staff_id / claim_expires_at     -- lease, for park/resume + co-editing
  client_event_id     UUID                   -- idempotency
  started_at / ended_at / state JSONB
```

Do **not** grow this out of `station_scan_sessions` or `picking_sessions` — both lack
`organization_id` entirely, and this becomes the root object of the whole app.

### The type registry
`SURFACE_REGISTRY` is a closed `Record<SurfaceKey, SurfaceDefinition>` already carrying
archetype, scan policy, permission and workflow-node binding. **Add a required
`sessionType` field** — the `Record` type makes the compiler enumerate every surface
that has not answered. Add the five real sessions missing from it, and fix the
`outbound` entry, which currently points at a 16-line redirect stub.

`EntityStationPane` already takes `stance` as a required prop with no default. Widen
`stance` into the session discriminator; its four generic props (`entityKey`,
`identity`, `centre`, `displays`) are already the session pane's interface.

### Hyper-reactivity
Scanning does not only advance a step — it **summons tools**.

Today this exists in exactly one place: `useStationTestingController` calls
`resolveManual(sku, itemNumber)` after a scan. Generalize it: a session type declares
which tools it *summons*, and the wedge cascade gains a session-type dispatch between
the command claim and the page-claimer event.

The Unboxing listing-photo auto-fetch (download listing photos on session start,
compare against what the operator sees, flag mismatches → file a claim) is net-new
domain work with no existing seed.

## 3. One polymorphic composer

**Migrate store-first, not component-first.** Change what a composer *writes* before
changing what it looks like — `postThreadMessage` already gives idempotency,
`ops_events` emission and tenancy for free.

```ts
// the required target, no default — the compiler names every unanswered site
target: { entityType, entityId, buffer }
```

Then collapse the four design-system faces into **modes on one dock**, deleting a
competing face per mode added:

| Absorbed | By |
|---|---|
| `DenseComposeFields` | `chrome='flush'` |
| `LedgerCellEditor` | `mode='cell'` (commit-on-unmount contract) |
| `ExpandableComposerField` | `expandable` |
| 14 hand-rolled `<textarea>` reason fields | the dock, with a `target` |

Widen the anchor vocabulary one migration at a time (SKU, PO, LOCATION, STAFF,
**SESSION**), redefining the CHECK as a **full union** — never appending — and widening
`entity_signals` / `feed_memberships` / `thread_links` in the *same* migration.

Resolve the order-record anti-pattern (two live composers on one entity) **before**
introducing the unified one, or it becomes the third.

## 4. Reversibility — the Process tool

Every action, scan, and status change in a session is logged; the operator can undo,
delete, or reverse it from a dedicated Process tool.

**The spine exists and is AI-only.** `applyAgentMutation` has 19 trust-classed
`MUTATION_KINDS`, captured inverse descriptors and a working `revert_mutation`.

**Route operator (non-AI) session actions through the same chokepoint** so the Process
tool reads one ledger instead of a parallel undo stack. This is the honest hard part:
`transition()` and `transitionReceivingLine()` are append-only with no inverse, and
`recordAudit` is fire-and-forget that never throws — neither is a replay log.

## 5. Manager reporting

Add a nullable `session_id` + `session_type` to **`ops_events`** — the only event table
already shaped polymorphically — then redirect writers one domain at a time.

**`journey.ts`'s branch count is the migration progress bar:** it starts at **7** unioned
sources (`JOURNEY_SOURCES` in `journey-helpers.ts`: sal, inventory, audit, carrier,
warranty, thread, ticket); reporting is done when it reads `ops_events` alone. For the
record, the three numbers people conflate: 7 sources, 5 `UNION ALL` browse branches
(thread and ticket are entity-mode only), 8 distinct event tables in entity mode.

⚠️ `audit_logs.organization_id` **exists** — added 2026-05-23, backfilled 2026-06-20d,
FORCE-RLS'd by 2026-06-28b, and `recordAudit` has stamped it since. The earlier claim
that the column was missing was wrong. The REAL hazard is that it is still **NULLABLE**
while the table is FORCE-RLS'd: under the canonical
`organization_id = current_setting(...)` policy, a NULL-org row is invisible to every
tenant read, with no error. Manager reporting must not be built on it until the column is
`NOT NULL` — see `2026-08-23c_audit_logs_org_not_null_prep.sql` for the two preconditions
and for why it deliberately does not add a blocking CHECK (`recordAudit` swallows its own
errors, so refusing NULL writes would turn invisible-on-read into gone-on-write).

## 6. Personalization

Everything goes in `staff_preferences.prefs` — per (org, staff), Zod-gated, RLS from
birth, **no migration needed**:

```ts
workspace: {
  openTabs, pinnedTabs, pinnedTools, iconColors,
  bentoLayouts, activeLayoutId, keybindings,
}
```

An absent key **is** "start from empty" — the target's requirement comes free.

Two required fixes: the shallow JSONB merge does not survive concurrent writes from
multiple panes (send whole sub-maps, or promote hot collections to rows), and the
localStorage mirror key must carry staff + org identity.

**Classify every persisted key as a MACHINE fact or a PERSON fact.** Printer profiles,
panel widths and the silent-print toggle are per-workstation and must stay device-local.
Pins, tools, layouts and keybindings follow the person.

## 7. AI orchestration

Add OS verbs to the existing `UI_TOOLS` array — `open_tool`, `pin_tool`, `close_tool`,
`start_session`, `focus_session`, `set_layout`, `split_pane` — with matching cases in
`runUiTool`. Nothing else in the agent loop changes, and they appear over MCP for free.

Replace `runUiTool`'s switch body with a dispatch into the workspace store, so every
AI-driven workspace action goes through one function that can be logged,
permission-checked, and undone.

## 8. What this deletes

| Deleted | Scale |
|---|---|
| 21 redirect-only page shells (**keep the 7 GS1 label resolvers**) | 568 LOC |
| 7 receiving + 8 inventory duplicate page files | ~15 files |
| 3 of 4 competing composer faces + ~14 hand-rolled textareas | ~4,300 LOC |
| 2 forked tiling/compare modules — **done 2026-08-21** | 1,556 LOC |
| `StationDisplaysPushColumn` + `RightPaneOverlay` as separate right edges | ~4,700 LOC |
| The 19/9/4-branch panel dispatch cascades | ~200 LOC + the coupling |
| Per-station scan bars (11–14 mounts) | — |
| 28 `TableRebuildPlaceholder` stubs (rebuilt as bindings, not pages) | 1,102 LOC |
