# Search & Details station — the 3-column read surface

> **`/search`** renders a record in scan-station chrome, preview stance.
> Inherits [`unbox-station.md`](unbox-station.md) (the anatomy) and
> [`station-workbench.md`](station-workbench.md) (the column shell).
>
> **Reference implementation:** `src/components/search/station/SearchOrderStationPane.tsx`

## The anatomy

```
┌─ GlobalHeader ─────────────────────────────────────────────┐
├──────────────┬──────────────────────────┬──────────────────┤
│ ZONE 1       │ ZONE 2 — centre          │ ZONE 3           │
│ find bar     │ 1 carton context (pinned)│  Photos          │
│ ┄┄┄┄┄┄┄┄┄┄┄┄ │ 2 Items             [▾]  │  Status info     │
│ Recently     │ 3 warehouse thread       │  Timeline ← BOTH │
│ searched     │   composer               │    halves of     │
│ (rail)       │                          │    Status live   │
│ ┄┄floating┄┄ │                          │    here          │
│ quick note   │                          │  Units · Ticket  │
│              │                          │  Support · Warr. │
└──────────────┴──────────────────────────┴──────────────────┘
   all three columns: bg-surface-card (#ffffff), zero shell padding
```

| Zone | Host | SoT |
|---|---|---|
| 1 · rail | `SearchSidebarPanel` | `TechRailSearchBar` + `SidebarRecentRailBase` + `SearchRailQuickNote` |
| 2 · centre | `EntityStationPane` `stance="preview"` | `SearchOrderCentre` · `SearchUnitCentre` |
| 3 · edge | `StationDisplaysPushStack` | `buildSearchOrderDisplayIndexRows` · `buildSearchUnitDisplayIndexRows` |

## Which `?sel=` branches are stations

| `?sel=` | Host | Why |
|---|---|---|
| `order:` | `SearchOrderStationPane` | ported 2026-08-20 |
| `unit:` | `SearchUnitStationPane` | ported 2026-08-21 — see below |
| `receiving:` | `CartonInspector` | a thin re-export shared with `/carton/[id]`; its DISPLAY LANGUAGE is ported (`carton-read.md`), its assembly is the open follow-up |
| `sku:` | `SkuDetailView variant="page"` | **deliberately not a station** — see below |
| `repair:` · `fba:` | `EmptyState` + deep-link CTA | no in-page detail shell exists |

- **A unit's identity bar is THIN, and that is the ruling.** `UnitStationIdentity`
  maps only the serial (into the lead slot `OrderStationIdentity` already puts an
  order number in) and the unit's tracking. SKU · grade · status · location go to
  the CENTRE facts, because `CartonContextCard` has no slot for any of them and
  its own 2026-08-21 ruling took the lifecycle chip OFF that strip for width.
  Cramming a SKU into `poDisplay` — a PO slot with `onEditPo` / `poOpenHref`
  semantics — is a page-local twin wearing the SoT's clothes.
  `unit-station-identity-vm.ts` was written against that deleted `lifecycle`
  prop; its resolved status face now lands on a fact row in `SearchUnitCentre`.
  Same SoT, different seat — and the VM finally has a consumer.

- **The unit preview has no grade / hold, deliberately.** `stance="preview"`
  forces `resolvedDock = null`, and grading a unit from a find surface has no
  station context behind it — the same reason the order centre omits
  `editableShippingFields`. Read-only-ness is the ABSENCE of the capability;
  `UnitDetailsPanel` (the inventory overlay, a WORK surface) still owns
  `GradeActionCard` and `HoldActionCard`. Two hosts, two region contracts, one
  read model — the split `SearchOrderStationPane` already has with
  `ShippedDetailsPanel`.

- **`sku:` stays `SkuDetailView`.** It is a full EDITING page on this surface
  today — stock adjust, location, deactivate — spread over four cards with **19
  interactive sites and no capability prop**. Moving it to `preview` would either
  strip an operator's writes silently or produce the lobotomized work chrome
  `pattern-evolution.md` #5 bans. The port is real but it is a REQUIRED `stance`
  threaded through `useSkuDetailView` + its four cards first (no default — a
  defaulted classification is a silent opt-in for every site you did not visit),
  visiting all three mounts: here, `BySkuView`, and the panel path.

## Hard rules

- **All three columns are one white sheet.** `bg-surface-card`
  (`#ffffff` in the light theme) on the rail, the centre
  (`EntityStationPane surface="card"`) and the Displays column, with the
  station ambient wash dropped. It is the TOKEN, never a literal `bg-white` —
  raw neutrals are ratcheted to zero (`color-neutrals.test.ts`) and a literal
  would also ignore every non-light theme. The rail paints its own plane rather
  than flipping `CONTEXT_PANEL_HOST_CLASS`, which would repaint every rail in
  the app. Remaining `bg-surface-sunken` inside the columns is hover / badge
  depth — interaction state, not an ambient plane; leave it.

- **Centre order is a contract, not a preference:** carton context (pinned) →
  Items → thread. Three blocks, and the numbering in the JSX comments has to
  match — it read 3/4 for months after the block above them left.

- **Status is NOT in the centre — neither half of it** (ruling 2026-08-21). The
  visual stepper AND the activity trail are both the right-edge `timeline` leaf.
  The centre is the record and the conversation; "what happened / where in the
  pipeline" is reference, and reference lives on the edge. An earlier revision
  put the audit log in the centre and it opened on 25 rows of machine events
  with the thread pushed below the fold.

- **The trail on that leaf is `OrderTimelineSection`, the order-record SoT.**
  Not a local merge of three spines: it already carries carrier scans, RMA rows
  and thread messages, and owns the lens / serial-grouping toggles a local merge
  had no answer for. It passes no `title`, so the heading reads **Activity** —
  the E2E asserts that word, and asserts the centre carries neither it nor the
  stepper. Do not compose `ShippedDetailsPanelContent activeSection="shipping"`
  into the `status` leaf either: it leads with the same three milestones, which
  would put them on two leaves of one column.

- **`units` is additive to `timeline`, not a second copy of it.**
  `StationUnitJourneys` shows each serial's OPERATIONS journey — everything that
  unit ever did, across orders, with its stage photos — where Timeline is the
  trail of THIS order. It used to ride `WorkspaceTimelineTab`, whose other spine
  is the carrier feed that `OrderTimelineSection` already merges, so every
  tracking event printed twice on one column. The leaf is gated on the order
  having serials, and `buildSearchOrderDisplayIndexRows` gates its Root Index
  row on the SAME condition — a row whose leaf was not built navigates nowhere
  (`search-order-display-index.test.ts` pins the pair).

- **Zero padding on the structural shells.** The rail panel, the centre stack and
  the Displays column carry no `p-*` / `m-*`. Every inset is component-level:
  `TechRailSearchBar` owns its band rhythm (and says so on its `density` prop —
  a host `p-*` stacked on that intent silently no-ops), `SidebarRecentRailBase`
  nests its column pad inside each `RailRow` via `railInset="scanDock"`, and
  `StationWorkbench` owns the centre body column pad. Vertical rhythm between
  centre blocks is flex `gap`, never `space-y-*` — `space-y` margins lose to
  `mb-auto` on a bottom-pinned body.

- **The identity header is pinned by STRUCTURE, not `position: sticky`.**
  `EntityStationPane` renders `StationContextBar` as a flex sibling ABOVE the
  workbench scrollport, so the body scrolls under a header that never moves. Do
  not add `sticky` on top of that — two pin mechanisms on one row is how a
  header ends up double-offset.

- **Auto-collapse is one shared controller, never per-block state.** Blocks open
  expanded and collapse together on either signal — scroll down, or composer
  focus. Rules live in `station/collapse/auto-collapse.ts` (pure, tested);
  `useAutoCollapse` is the binding. A manual toggle outranks both triggers until
  the operator returns to the top; blur does **not** re-expand, because yanking
  blocks back mid-read shoves the thread down the page.

- **The warehouse thread and the customer ticket are ONE face.** `ThreadPanel`
  composes `ConversationMessageCard` + `conversation-chrome`, and its composer
  is `OmnichannelComposerDock` — the same shell as Unbox carton notes. It
  hand-rolled its own textarea until 2026-08-21; that fork is what made the two
  threads visibly different surfaces for the same job.

- **Staff faces are `StaffAvatar`, never text initials.** It resolves
  `staff.avatar_photo_id` through the authenticated photo route and falls back
  to initials + the staffer's assigned colour only when no photo is linked.

- **The centre never edits.** Read-only is the ABSENCE of a capability prop
  (`/search` omits `editableShippingFields`), never a forked component with the
  editors deleted. The Displays column still writes — preview is about the
  centre, not the edge.

- **The rail's bottom entry FLOATS.** `SearchRailQuickNote` is absolutely
  positioned over the rail with `chrome="bare"` — no band, no border, no fill —
  so the recents scroll behind it. The scrollport carries matching bottom
  clearance; without it the composer sits permanently over the last row, which
  is unreachable rather than merely obscured. It posts to the SELECTED record's
  thread through the same `useThread` path as the centre panel (one thread, two
  entry points) and is inert with nothing selected, because a note with no
  anchor has nowhere to go.

  **It composes `ThreadNoteComposer variant="float"`** (2026-08-21) — it mounted
  `OmnichannelComposerDock` raw and hardcoded `visibility: 'internal'` for one
  day, which is the fork that component had just been written to end. In the
  float variant visibility is a FIXED declaration by the host (`isOnRecord` is
  still required, still undefaulted) and no toggle renders, because posting
  on-record from a rail with no record header in view is too easy to do by
  accident. **Its anchor vocabulary is `toDbEntityType` + `isSurfaceEntityType`,
  never a local map** — a hand-written three-key table left `?sel=repair:` and
  `?sel=fba:` inert although both are real thread anchors. `?sel=sku:` stays
  inert on purpose: SKU is a `thread_links` discriminator, not an
  `entity_threads` anchor, so `POST /api/threads` 400s on it.

- **The `?sel=` body is covered by `SearchPrimaryPaintShell` on cold land**, and
  that shell is where `search:primary` is stamped — when the cover LIFTS, never
  on mount. `SearchBrowseShell` used to stamp both marks unconditionally as it
  mounted, so the `?sel=` path reported no Tier-1 paint at all and the `?q=`
  path reported a fast LCP for a blank plane. The cover is one-way: record→record
  after that is `SearchDetailWorkspace`'s opaque hard-cut crossfade
  (`motionRole.swap.scan` + `mode="sync"`, the same cover-replace contract Unbox
  uses carton→carton), and re-covering would flash a field over a seamless swap.

## The find bar is a deliberate exception

`/search` used to be rail-less on the rule that **find lives only in
`GlobalHeaderSearch`**. That rule still holds everywhere else. This rail carries
a find bar because the surface *is* find: the centre is now a record, so the
left column is the way back to another one, and a rail of recents with no way to
start a new search sends the operator back to the header for every hop.

One field, not two: the draft filters the recents beneath it, and Enter commits
it to `?q=` (dropping `?sel=` — a new search is not the old record). Two boxes in
a 360px rail is how an operator ends up typing into the wrong one.
