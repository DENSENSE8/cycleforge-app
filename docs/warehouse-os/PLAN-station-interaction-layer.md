# PLAN — Station interaction layer (staff ⇄ versioned, generated, published stations)

**Status: PLAN → BUILD. Written 2026-09-06 for an external coder (GLM).**
Backend landed the same day (uncommitted on `main`): version history / restore /
cherry-pick routes, the `station_definition.save_draft|discard_draft` mutation
kinds + `get_station_catalog` tool, 13 receiving capture actions + 2 sources,
and the Ably `station-definition.published` nudge. **Nothing staff can touch
exists yet.** This file is the whole interaction layer, lane by lane, with the
exact design-system components, their props, the laws each lane must obey, the
files to create and modify, the tests, and the eval command that gates it.

Read first: `docs/warehouse-os/LAWS.md` (I8, Q5, T2, C8, A4, T28, M1–M3),
`docs/warehouse-os/PLAN-center-lock.md`, `docs/warehouse-os/PLAN-scan-shell.md`
§0–§3, `docs/operations-studio/station-builder-ui-plan.md` §3,
`src/lib/tables/table-engine-law.ts`, `src/design-system/pinned.json`.
Companion research: `~/Work/handoff-mobile-flow-builder-2026-09-06.md`.

---

## 0 · Non-negotiables (the hooks enforce these; read before any `.tsx`)

1. **Before every `.tsx` write** call the design MCP: `ds_contract` with the
   lane's intent (given per lane below), `ds_tokens` for `radius`, `spacing`,
   `elevation`, and `ds_critique` on each file you will touch. The PreToolUse
   hook refuses unstamped `.tsx` writes. If refused, call the tools again.
   CLI fallback: `node tools/design-mcp/ds.mjs contract "<intent>"`.
2. **Before editing a shared component or hook** (`StationSlot`, `BlockRenderer`,
   `useStationEditor`, `AssistantEditsTray`, `StationComposerHost`,
   `DataTable` anything): `find_symbol` → `impact_analysis` (code-graph MCP, or
   `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find|impact`).
3. **One composer, ever** (LAWS I8). Every text entry goes through the one
   mounted `StationComposerHost`. Never a second dock, never
   `showModeRow={false}` (it is typed `true` and `router.json` refuses it),
   never a `*NotesComposer` shell (`router.json` refuses `\w+NotesComposer`).
4. **No toasts for verdicts, outcomes, or anything hinged to the mouth.**
   Feedback is `WeldedFeedbackPanel` on `StationComposerHost` `reaction`, or
   `InlineActionFeedbackCard` when no composer is mounted. The only legal toast
   is an optimistic-mutation rollback (`useOptimisticMutation`).
5. **Center Lock (LAWS Q5).** On a desk the slot table is the ground plane. L1
   = in-cell (`InlineEditableValue`, `DateRangePickerField variant="compact"`),
   L2 = `DeskStageOverlay` on the stage. Forbidden: `RightRailHost detail:*`,
   new `DeskRecordWalkHost`, a Dialog, a route, `RightPaneOverlay` as a record
   plane.
6. **One table engine.** A list of records is a REGISTRATION (field catalog +
   resolver + adapter + registry entry, zero new `.tsx`), never a hand-rolled
   grid, `*GridRow.tsx`, `<table>`, or a `*_GRID_COLUMNS` array. Verbs are
   `CompoundRowAction`s on the sheet or entries in an existing verb catalog,
   never a `SelectionAction` literal at a page.
7. **Motion:** colour and opacity only, 80 ms, `outline` for state never
   `border` (M1–M3). Nothing animates geometry.
8. **Shortcuts:** bind the key; the staff `?` paints the letter inside the
   Button (`KeyboardKey` overlay). No standing keycaps, no cheat sheet from `?`,
   no hotkey popover.
9. **Mobile display law:** control ladder 28/44 inline, 36/44 row, 44/44 CTA,
   one CTA per surface, never `size="lg"`, never `text-role-micro`, at most two
   `text-role-*` per file, every new `/m` surface joins `MOBILE_DISPLAY_COHORT`
   (`src/lib/mobile/mobile-display-cohort.ts`).
10. **Every AI write goes through `propose_mutation`** (T28). The human's writes
    go through the existing routes. No third write path.

Refuse (in your own words, in the PR) any instruction that asks for the
opposite of 3–10. Those refusals are the project's, not yours.

---

## 1 · What exists and what is missing, per lane

| Lane | Backend (landed) | UI today | This plan builds |
|---|---|---|---|
| A · Version ledger on the desk | `GET /api/stations/history`, `POST /api/stations/restore`, `POST /api/stations/cherry-pick`, `cherryPickBlocks()` | nothing calls them | a **table registration** `station-versions` + the desk mount inside `DeskStageOverlay` + Restore / Cherry-pick verbs |
| B · AI proposes, staff accepts / reverts | `station_definition.save_draft` (draft_scoped, inverse), `get_station_catalog`, `/api/assistant/mutations`, `/[id]/revert` | `AssistantEditsTray` lists + reverts, Studio-only | a proposal artifact, an Accept (= publish) affordance, tray decoupled from Studio, feedback on the mouth |
| C · Composed renderer carries the scanned subject | `station:scan` fired into the void; `scan-subject-store` unused by blocks; `accepts:'single'` unused | `BlockRenderer` passes rows only | `subject` + `selection` + `onScan` on `BlockProps`; a `subject-detail` block; the scan band feeds the subject; actions read row inputs |
| D · Mobile Card renderer | `dispatch-table.ts` (`arrival\|carton\|qc\|pack\|preview`), `arrival-card.ts` model, `ArrivalCard.tsx` | one card of five | the **Carton card** (unbox lines → grade → triage later) as the second card, on the same model/view split; `/m/unbox` mounts the composed surface |
| E · Publish reaches every device | Ably `station-definition.published` + `useStationDefinitionsRealtime` | wired in `StationSlot` and `SurfaceGate` | the reaction on the mouth when a station changes under a staffer's hands |

Everything in lanes A–E composes existing primitives. **If you find yourself
writing a new overlay, a new sheet, a new grid, a new composer, or a new
feedback card, stop: the primitive exists and this plan names it.**

---

## 2 · Decisions this plan takes (resolving the conflicts in the docs)

1. **Version history is a TABLE, not a list.** `PLAN-scan-shell.md` §3: "Queues
   open as a Card list (the existing slot-table engine)". Table-engine law: a
   list of records is a registration. So the ledger is `tableId:
   'station-versions'` on the one `DataTable`, mounted inside a
   `DeskStageOverlay fill="stage"` over the station it describes. Not `?v=`
   (a route leaves the table, Q5), not a tile (C8 is for displays, this is an
   edit plane), not `RightPaneOverlay` (Center Lock).
2. **Restore is copy-forward.** The route already does this. The UI never
   offers "re-activate v3". Restore = new draft; Publish = the existing button.
3. **Config Sheet and Palette stay on `RightPaneOverlay`.** They edit
   configuration, not a queue record. Q5 governs record planes on desks.
   The builder plan §3.3 predates Q5 but is not contradicted for this job.
   Do not migrate them in this plan.
4. **Accept = Publish.** There is no "accept" verb in the mutation ledger and
   there must not be one. An AI proposal lands as a DRAFT (`draft_scoped`).
   The human's accept is the existing `POST /api/stations/publish` on that
   draft id, under their own session and permission — the same shape as
   `ticket_reply_draft` (agent drafts, only the human sends).
5. **Feedback seat.** Desk with a mounted station mouth → `WeldedFeedbackPanel`
   on `reaction`. Desk without (the builder overlay is on a desk that may have
   no composer) → `InlineActionFeedbackCard` under the action row. The Card on
   the phone → its own result line IS the reaction slot of the phone's
   `StationComposerHost` (the Field) — one seat, never two.
6. **Optimistic paint vs. `draft_scoped`.** A draft save paints as "Draft v{n}
   saved · Publish to make it live" (tone `context`), never as done. Only a
   2xx from `/api/stations/publish` paints `success`. A `proposed` (review)
   mutation paints "Queued for review" (tone `warning`).
7. **Right rail on scan stations stays** (Q5/T2) until the Scan Shell P2
   removes it. Lane C targets the composed `SurfaceRenderer` scaffold as it is
   (trigger · queue · workspace · advance); lane D targets the phone.
8. **Realtime is Ably only** (LAWS A4). Lane E adds no transport.
9. **The word "version" means a `station_definitions` row.** Never reuse it for
   the session `version` counter (S9). In UI copy say "v7", "published v7",
   "draft v8".

---

## Lane A · Version ledger: history · restore · cherry-pick

**Intent for `ds_contract`:** `"version history ledger of a station: list every
published version, restore one, pick blocks from one"` (ranks `DataTable`,
`DeskStageOverlay`, `DeskActionSlot`).

### A.1 Where it opens

- On every desk that mounts a `StationSlot` for `stations.manage` holders, the
  existing pencil (`StationSlot.tsx` ~216, `Button variant="ghost" size="sm"`
  in `HoverTooltip`) gains a sibling ghost Button **`History`** with
  `HotkeyGlyph` letter `H` (staff `?` reveals it). Not a new header CTA per
  page: the slot owns it, like the pencil.
- In Studio, `StudioNodeStationEditor.tsx` gets the same button next to its
  Save draft / Publish row (node-bound stations use `page_key='studio-node'`).
- Pressing it opens `DeskStageOverlay fill="stage" showHeader title="Versions ·
  {stationLabel}"` inside the `relative` wrapper of the desk stage. Table
  underneath stays mounted (Q5). `closeOnScrim={false}` while a pick selection
  exists. Escape closes (overlay stack owns it).

### A.2 The ledger is a table registration (zero new `.tsx`)

Follow the `audit-log` chain exactly (`src/lib/tables/field-catalog/audit-log.ts`,
`audit-log-resolve.ts`, `src/lib/audit-log/audit-log-row-adapter.ts`,
`src/components/settings/audit/audit-log-*`). Create:

| File | Export |
|---|---|
| `src/lib/tables/field-catalog/station-versions.ts` | `STATION_VERSIONS_FIELD_CATALOG`, `STATION_VERSIONS_PRODUCT_LAYOUT`, `STATION_VERSIONS_TABLE_LAYOUT_ID = 'station-versions'` |
| `src/lib/tables/field-catalog/station-versions-resolve.ts` | `resolveStationVersionSlotValue(row, fieldId)` — pure switch, no clock |
| `src/lib/tables/field-catalog/station-versions.test.ts` | ids unique, family-qualified, bindable (template `sessions.test.ts`) |
| `src/lib/stations/station-version-row-adapter.ts` | `stationVersionCompoundView(row): CompoundRowView` — strings/enums only |
| `src/components/stations/versions/station-versions-grid-layout.ts` | `stationVersionsCompoundColumnsFor(layout)` = `materializeTracks({ layout, catalog, base: compoundColumnsFor() })` **unfiltered**, `STATION_VERSIONS_COMPOUND_COLUMNS`, `stationVersionsSortFactFor(col)` |
| `src/components/stations/versions/station-versions-grid-descriptor.ts` | `STATION_VERSIONS_GRID_CAPABILITIES` (all five flags explicit), module-level `makeStationVersionsGridDescriptor` |
| `src/components/stations/versions/station-versions-table-definition.ts` | `parseTableDefinition({ id: 'stations.versions', tableId: 'station-versions', entityFamily: 'station-versions', … surface: 'sheet' })` + `STATION_VERSIONS_TABLE_BINDING` with `recordPlane: { kind: 'none', reason: 'a version is previewed inline on the ledger; the edit plane is the station itself' }` |
| `src/components/stations/versions/useStationVersionsTableLayout.ts` | `useSlotTableLayout({ tableId, catalog, productLayout, paintMorph: 'compound', identityFallbackLabel: 'Version' })` |
| `src/components/stations/versions/useStationVersionsSpreadsheet.ts` | `useCompoundSpreadsheet({ binding, columns, fields, rows, getRowId, adapter, subtitleFieldIds, resolve, sortFactFor, capabilities, sort, dir, onSortChange, search, loading, emptyMessage, ariaLabel, rowActions })` |
| `src/lib/queries/station-version-queries.ts` | `stationHistoryQuery(pageKey, modeKey)` → `GET /api/stations/history` (react-query key `['stations','history',pageKey,modeKey]`), `useRestoreStationVersion`, `useCherryPickStationBlocks` mutations (invalidate `['stations','page',pageKey]` + history) |

Fields (family `station-versions`):

| id | label | displayType | slotKinds | path |
|---|---|---|---|---|
| `station-versions.version` | Version | `id` | identity, status, subtitle | `version` (face `v{n}`) |
| `station-versions.state` | State | `text` | status | derived: `published` / `superseded` / `draft` |
| `station-versions.label` | Label | `text` | status, subtitle | `label` |
| `station-versions.updated_by` | Saved by | `person` | status, subtitle | `updatedByName`, id `updatedBy` |
| `station-versions.updated_at` | Saved | `date` | status, subtitle | `updatedAt` |
| `station-versions.blocks` | Blocks | `number` | status, subtitle | derived: `listBlockInstances(config).length` |
| `station-versions.qty` | Blocks | `number` | subtitle | (the blanket line-qty subtitle; same value) |

Product layout: identity `station-versions.version`; status bindings state ·
updated_by · updated_at · blocks. `state` tone: published → `success`,
draft → `context`, superseded → neutral. **Every data header must sort**
(`sortFactFor` returns a fact for each); chrome only `select`/`actions`/`_fill`/`thumb`.

Register (six existing files, registry lines only): `table-catalog.ts`
(`{ tableId: 'station-versions', label: 'Station versions' }`),
`registered-bindings.ts`, `table-columns.ts` (`| 'station-versions'` +
`'station-versions': []`), `table-definition.ts` (`TABLE_ENTITY_FAMILIES`),
`org-table-layouts.ts` (`SLOT_LAYOUT_TABLES`), `slot-table-cohort.ts`
(`SLOT_TABLE_ENGINE_LAYOUT_HOOKS`).

Row source: the history route, filtered to the overlay's `(pageKey, modeKey)`.
Scope is a MOUNT parameter; the registration is per entity.

### A.3 Verbs (row menu, `CompoundRowAction`, direction from row state)

`rowActions: (row) => CompoundRowAction[]` in `useStationVersionsSpreadsheet`:

| key | label | offered when | does |
|---|---|---|---|
| `preview` | Preview | always | selects the row; the overlay body renders that version's blocks read-only (see A.4) |
| `restore` | Restore as draft | `state !== 'draft'` | `requestConfirm({ description: 'Copy v{n} forward as a new draft? Nothing goes live until you publish.', confirmLabel: 'Restore' })` → `POST /api/stations/restore {id}` |
| `pick` | Pick blocks… | `state !== 'draft'` and the row has ≥1 block | enters pick mode for this row (A.5) |
| `publish` | Publish | `state === 'draft'` | `POST /api/stations/publish {id}` (the existing button's route), `requestConfirm` tone `primary` |
| `discard` | Discard draft | `state === 'draft'` and `has('stations.manage')` | `propose`-free: `DELETE` is not exposed; use the existing draft semantics — a discard is `restore` of the live version (copy-forward) followed by nothing. If the operator asks for true delete, refuse: versions are immutable rows. |

Never a `SelectionAction` literal here. Never a per-lane key list.
Hotkeys: `R` restore, `P` pick, `Enter` preview, painted by the `?` reveal via
`TableStatusBar` `selectionActions` (the foot strip) — do not add keycaps.

### A.4 Preview pane inside the overlay

Body layout (inside `TriageScrollLayout`, reading measure `max-w-4xl` inside the
body, never on the shell):

```
┌ DeskStageOverlay fill="stage" ── Versions · Unbox ─────────── [k of n] ✕ ┐
│  DataTable (station-versions)  ← the ledger, DESK_TABLE_SURFACE_CLASS      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Preview v7 (published) · Saved by Tuan · 2h ago            [Restore] [Pick]│
│  trigger  ▸ Scan bar (unbox)                                                │
│  queue    ▸ Worklist rail — Cartons awaiting unbox      [☐ pick]            │
│           ▸ Checklist — Lines of the scanned carton     [☑ pick]            │
│  advance  ▸ (empty)                                                         │
│  InlineActionFeedbackCard / WeldedFeedbackPanel (result)                   │
└ TableStatusBar: 9 versions · 1 selected · [Restore R] [Pick P] ────────────┘
```

- The preview renders each `BlockInstanceConfig` of the selected version with
  the existing `BlockRenderer` (`{ instance }`). It is permission-safe and
  returns null rather than crashing. Rows are live data — that is the point
  ("the page stays live while editing", builder plan §3.1).
- Slot headers are the five `SLOT_IDS` in order; empty slots print `(empty)`
  in `text-text-faint`. Block label from `getBlock(inst.block)?.label`, icon
  from `StationIcon`.
- The two Buttons top-right of the preview are `Button variant="secondary"
  size="sm"` (Restore) and `variant="primary" size="sm"` (Pick); on a draft
  row they become `Publish` (primary) only.

### A.5 Cherry-pick interaction

1. Press **Pick** on version N (not the live one). Each block row in the
   preview gains a checkbox (`@/components/ui/checkbox`, house tokens). The
   overlay header subtitle becomes `Picking from v{N} into v{live}`;
   `closeOnScrim={false}`.
2. The foot strip (`TableStatusBar`) shows `{k} blocks picked` and one CTA
   `Create draft with {k} blocks` (`primary`, hotkey `Enter`), and `Cancel`
   (`ghost`, `Esc` cancels pick mode before it closes the overlay).
3. Confirm → `POST /api/stations/cherry-pick { baseId: liveId, fromId: N,
   blockIds }`. Response `picked[]`/`missing[]` paints the feedback card:
   `success` "Draft v{n+1}: 2 blocks from v{N} · Publish to make it live", with
   `cta: { label: 'Publish', onClick }`. `missing` non-empty → tone `warning`
   listing the ids in the disclosure.
4. 422 (`INVALID_CONFIG`) → tone `error`, `steps: ['v{N} names a block that no
   longer exists']`, `children` = the `issues[].message` list. Never a toast.
5. After success the ledger refetches; the new draft row is selected; the
   station's own `StationSlot` repaints from `['stations','page',pageKey]`.

### A.6 Files to modify

- `src/components/stations/StationSlot.tsx` — the History button + mounting
  `StationVersionsOverlay` as a sibling in the slot's `<section>` (same place
  the palette and config sheet mount). `impact_analysis` first
  (`SurfaceRenderer` is the only consumer).
- `src/components/studio/StudioNodeStationEditor.tsx` — same button.
- `src/components/stations/versions/StationVersionsOverlay.tsx` — **the one
  new `.tsx` in lane A**, and it is composition only: `DeskStageOverlay` +
  `<DataTable {...sheet} />` + the preview list + the feedback card. If it
  grows past ~200 lines, the preview list moves to its own file; nothing
  else does.

### A.7 Tests and gates

- `station-versions.test.ts` (catalog), `station-version-row-adapter.test.ts`
  (pure), a jsdom `.test.ts` for `StationVersionsOverlay` using
  `React.createElement` (no JSX in tests; `tsx` tests are not collected) that
  asserts: opens on the button, lists versions newest first, `Restore` is not
  offered on a draft, pick mode requires ≥1 block before the CTA enables,
  Escape cancels pick mode first.
- `pnpm --config.verify-deps-before-run=false run eval:cohort slot-table`
  must pass (tripwires, engine contract, graph, critique).
- `pnpm --config.verify-deps-before-run=false run eval:discover` must report
  no new DELETE ids (peer-not-on-engine, layout-registry-gap, catalog-orphan,
  table-columns-nonempty all satisfied by A.2's six registry lines).
- `ds_critique` on every touched `.tsx` reports no fork.

### A.8 Done when

A `stations.manage` holder on `/unbox` presses **H**, sees every version of the
Unbox station as a sortable table, previews v3 with live rows, picks one block
from it, creates draft v8, sees the result on the feedback card, presses
Publish, and the phone on the bench repaints (lane E) — with no toast, no
dialog, no route change, and the table still mounted underneath.

---

## Lane B · AI proposes a composition; staff accept or revert

**Intent for `ds_contract`:** `"staff reaction on the composer"` (force-ranks
`WeldedFeedbackPanel`) and `"assistant edits tray accept a proposed draft"`.

### B.1 The conversation

The operator types into the one mouth (Ask mode): *"a station for returned
electronics: scan the serial, grade it, flag cosmetic damage, send to triage."*
The assistant:

1. calls `get_station_catalog` (read, `dashboard.view`);
2. proposes `propose_mutation { mutationKind: 'station_definition.save_draft',
   payload: { pageKey, modeKey, label, config } }`;
3. the chokepoint validates against the registry; on 400 the model repairs
   and re-proposes (budget `MAX_TURNS = 8`; the skill text tells it to call
   the catalog first, see B.5);
4. on success the draft row exists (`status: 'applied'`, trust `draft_scoped`,
   inverse recorded), and the model calls `render_artifact` with kind
   `record` describing the draft (B.2), then says one sentence.

### B.2 The proposal artifact (read-only by contract)

`render_artifact` kind `record`:

```json
{ "kind": "record", "title": "Draft v8 · Returns triage",
  "path": "/unbox?stationDraft=8",
  "fields": [
    { "label": "Station", "value": "receiving / receive" },
    { "label": "trigger", "value": "Scan bar (unbox)" },
    { "label": "queue",   "value": "Checklist — Lines of the scanned carton · Grade · No serial · Triage later" },
    { "label": "Status",  "value": "Draft — not live until published" } ] }
```

`path` is the app path that opens the station with the draft selected in the
ledger (lane A reads `?stationDraft=` and opens the overlay on that row).
Artifacts are read-only; the only interaction is attaching a reference to the
composer (`requestComposerSeed`). **No accept button inside the artifact.**

### B.3 Accept and revert live in the edits tray

`src/components/assistant/AssistantEditsTray.tsx` today: no props, reads
`useStudioWorkspace()` unconditionally (line ~41), lists `/api/assistant/mutations`,
offers Revert only on `status === 'applied'`. Changes:

1. **Decouple from Studio.** Add optional props
   `{ definitionId?: number | null; scope?: 'studio' | 'session' }`. When
   `scope !== 'studio'` do not call `useStudioWorkspace()`; fetch
   `?limit=15` only. `impact_analysis` on `AssistantEditsTray` first
   (`AssistantDock.tsx:190` is the mount).
2. **Row label map.** `MUTATION_KIND_LABELS: Partial<Record<MutationKind,
   string>>` in `src/lib/surfaces/mutation-labels.ts` (`.ts`, no React):
   `station_definition.save_draft → 'Station draft saved'`,
   `station_definition.discard_draft → 'Station draft discarded'`, the
   `workflow_draft.*` ones likewise. Fallback stays `replaceAll('_',' ')`.
3. **Accept affordance for station drafts.** For a row whose
   `mutation_kind === 'station_definition.save_draft'` and `status === 'applied'`,
   render a second inline affordance **Publish** next to Revert (same
   `ds-raw-button` inline pattern as the revert glyph, `HoverTooltip
   label="Publish this draft"`, glyph `Rocket`). It POSTs
   `/api/stations/publish { id: targetRef }` under the operator's session
   (`stations.manage` gate on the button: `has('stations.manage')`). This is
   the human's write path; nothing new server-side.
4. **`status === 'proposed'` (review class)** rows show a `Queued for review`
   chip and no verbs — the review UI is elsewhere and not this plan.
5. The tray stays where it is in the dock stack (context plate → thread →
   edits tray → composer). Insert nothing between the tray and the composer.

### B.4 Feedback on the mouth

`AssistantDock` mounts `StationComposerHost`; wire `reaction` with a
`WeldedFeedbackPanel` driven by the last mutation outcome for THIS session:

| event | tone | steps (one truncated line) | cta |
|---|---|---|---|
| draft saved | `context` | `Draft v8 saved · not live until published` | `Publish` → `/api/stations/publish` |
| publish 2xx | `success` | `v8 is live on Unbox · every device repaints` | `Undo` → `/api/stations/restore { id: previousActiveId }` then publish (two calls, one verb; label "Undo publish") |
| publish 422 | `error` | `v8 names a block that no longer exists` | `Open versions` → lane A overlay |
| revert 2xx | `success` | `Draft v8 discarded · v7 stays live` | — |
| review queued | `warning` | `Queued for review · a manager applies it` | — |

Rules: `reaction` does not paint in Ask mode (host line ~417 resolves it null
and welds `ComposerAskStage` instead). So the outcome panel is mounted through
the Ask stage's own reaction seat: pass it as the dock's `reaction` and let the
host's mode resolve it; when the operator is in Ask, `ComposerAskStage` shows
the same `WeldedFeedbackPanel` in its accessory slot. One panel component, one
state source (`useLastMutationOutcome()` in
`src/components/assistant/useLastMutationOutcome.ts`, fed by the
`assistant.mutation` Ably event + the publish call's own result). `steps`
content must be stable across renders (the ticker restarts on content change).

### B.5 Skill text

Add to `src/lib/assistant/page-skills.ts` a `STATION_BUILDER_SKILL` fragment
(≤ 4000 chars) registered by `StationSlot` when `canManage` (via
`useAssistantContext({ page, station, selection: { kind:'station_definition',
id }, skill })`):

- "Compose stations from `get_station_catalog` only; never invent an id."
- "A proposal is `propose_mutation station_definition.save_draft`; it lands as
  a draft; publishing is the human's Publish button. Say so."
- "To change one block, re-save the whole config with that block changed —
  the config is the unit."
- "When the operator asks for a part the catalog lacks (a print action, a
  grading input), say it is missing and name the nearest registered part.
  Do not fake it."

### B.6 Bug to fix in passing (blocking correctness of Revert)

`src/app/api/assistant/mutations/[id]/revert/route.ts` calls
`revertAgentMutation(id, org, staff)` without `ctx.permissions`, so the
per-kind permission check is skipped on the HTTP path. Pass the permission set
(the tool path at `write-tools.ts` already does). Add a test in
`apply-agent-mutation.test.ts` pattern: a `studio.manage` holder without
`stations.manage` cannot revert a `station_definition.save_draft`.

### B.7 Tests and gates

- `read-tools.test.ts` / `write-tools.test.ts` stay green (already updated).
- jsdom test for the tray: Publish appears only on applied station drafts and
  only for `stations.manage`; Revert stays on every applied row.
- `useLastMutationOutcome.test.ts`: the five outcomes above map to the five
  tone/steps/cta rows.
- `pnpm --config.verify-deps-before-run=false run eval:station scan-out`
  (composer cohort: refuses `showModeRow={false}`, `*NotesComposer`).

### B.8 Done when

An operator asks for a returns-triage station in the mouth, sees a draft
record artifact, sees "Draft v8 saved" on the mouth with a Publish verb,
presses it, sees "v8 is live", presses Undo, sees "v7 stays live" — and every
step is visible in the edits tray with Revert, with no toast, no dialog, no
second composer.

---

## Lane C · The composed renderer carries a subject, a selection, and a scan

**Intent for `ds_contract`:** `"scan station composed blocks: the scanned carton
feeds the checklist, actions read the row"`. `impact_analysis` on
`BlockRenderer`, `StationSlot`, `ScanBandBlock`, `ChecklistBlock`,
`RailFeedBlock` first.

### C.1 Contract additions (`src/lib/stations/contract.ts`)

```ts
/** The record this station is working right now — set by the trigger slot. */
export interface StationSubject { kind: 'carton' | 'line' | 'unit' | 'order' | 'tote'; id: string; raw?: string }

export interface BlockProps {
  …existing…
  /** The current subject, or null when nothing is armed. */
  subject: StationSubject | null;
  /** Rows the operator picked, by SourceRow.id. */
  selectedIds: readonly string[];
  onSelectionChange: (ids: readonly string[]) => void;
  /** A scan landed while this block is mounted. Return true to consume it. */
  onScan?: (value: string, intent: UnboxScanIntent) => boolean;
}
```

`BlockInstanceConfig.source.filters` may reference the subject with the
literal `'$subject.id'` (a closed token, not an expression language):
`{ id: 'receiving.carton_lines', filters: { receiving_id: '$subject.id' } }`.
`validateStationConfig` accepts the token only on a filter whose source
declares that filter key; the renderer substitutes it at fetch time.

### C.2 Where the subject lives

`src/lib/stations/station-subject-store.ts` (`.ts`, `useSyncExternalStore`):
one subject per `(pageKey, modeKey)` mount, TTL-less (a station keeps its
carton until the next scan or an explicit clear), persisted to
`sessionStorage` under `cf.station-subject:{pageKey}:{modeKey}` so a reload
keeps the carton. Replaces the unread `scan-subject-store.ts` for blocks
(leave that file for the command-sticker path).

### C.3 The scan reaches the blocks

- `ScanBandBlock` keeps dispatching `station:scan` (other listeners may come)
  **and** calls `setStationSubject()` when `classifyUnboxScan` returns
  `open_carton` with a resolved id. Resolution is a READ:
  `GET /api/receiving/preview-scan` then, on the Unbox verb, `lookup-po`
  (`mobile-arrival-door.ts` law: minting is a verb, never a scan side effect).
  The band shows the resolving spinner (`ThemedStationScanBar.isResolving`).
- `StationSlot` subscribes to the store and passes `subject` to every
  `BlockRenderer` in the mount; `BlockRenderer` substitutes `$subject.id`
  into the source filters and threads `subject`, `selectedIds`,
  `onSelectionChange`, `onScan` to the component.
- Selection is one store per mount too (`selectedIds` keyed by the queue
  block instance id). `RailFeedBlock` and `ChecklistBlock` drop their local
  `useState` selection for the props (they keep their own tick animation).
- The subject and selection are ALSO registered into the assistant context
  (`selection: { kind, id }`) so Ask knows what the operator is looking at.

### C.4 Actions that need operator input

v1 rule (already in the registry): the input comes from the row. The
renderer's action runner passes the row as-is, so a checklist bound to
`receiving.carton_lines` offers `receiving.set_condition` with the row's
`condition_grade` default. For the grade to be CHOSEN, not just confirmed:

- `ChecklistBlock` `display.variant` gains `'check_grade'`: each row paints a
  `ConditionGradeChip` strip (the existing desktop `ConditionPills` pattern,
  house SoT `@/lib/conditions`), and the chosen grade is written onto the
  local row copy before `action.run(row)`. No new endpoint; the action body
  reads `row.condition_grade`.
- Photo actions (`receiving.capture_photo`, descriptor-only) open the
  existing receiving photo capture for the row's stage/aspect via a typed
  event declared in `src/utils/events.ts` (`STATION_CAPTURE_PHOTO_EVENT`),
  replacing the ad-hoc `if (a.id === 'incoming.attach_tracking')` branch
  with a small map `DESCRIPTOR_ONLY_ACTIONS: Record<actionId, eventName>` in
  `src/lib/stations/descriptor-actions.ts`.

### C.5 A block for the subject itself

Register `subject_card` (`src/lib/stations/blocks/subject-card.block.ts`,
component `SubjectCardBlock.tsx`): slots `['workspace','header']`, `accepts:
'single'`, roles `title` (req), `ref`, `meta` ×3, configSchema `show_photo`.
`BlockRenderer` learns `accepts:'single'`: the source is fetched with the
subject filter and the FIRST row is the record. The card is the desk twin of
the phone Card (lane D): title · 1–3 facts · nothing else. Use
`ItemRecordThumb variant="padded"` for the photo, `CopyChip` for identifiers.

### C.6 Feedback

Block action results go to the station mouth: the `SurfaceRenderer` scaffold
mounts the station's `StationComposerHost` (faces off, ring on) in the
`advance` band when the surface's archetype is `station`, and `BlockRenderer`
reports outcomes through `useStationReaction()` (a small store the
`WeldedFeedbackPanel` on `reaction` reads). Remove `toast.error` from
`BlockRenderer.tsx` (~120) and `useStationEditor.ts` (~195, ~214) in the same
change; leave `useOptimisticMutation` rollbacks alone.

### C.7 Publish flips legacy → composed live

Already wired (`SurfaceGate` invalidates on the Ably nudge). Turn on the
per-org flag `surface_composed_render` for the dogfood org via Settings when
lane D's first Card is ready; until then the composed surfaces stay dormant.

### C.8 Tests and gates

- `validate.test.ts`: `$subject.id` accepted on a declared filter, rejected
  elsewhere.
- `station-subject-store.test.ts`: set/clear/persist/restore.
- jsdom tests for `ChecklistBlock` (`check_grade` writes the chosen grade onto
  the row passed to `run`) and `SubjectCardBlock` (first row is the record).
- `unbox-composition.test.ts` / `composition-cutover.test.ts` stay green.
- `pnpm --config.verify-deps-before-run=false run eval:station unbox`.

---

## Lane D · The phone Card renderer (Carton card: unbox → grade → triage later)

**Intent for `ds_contract`:** `"arrival card on the mobile universal scan, one
primary action"` and `"mobile card with one primary action and a scan field for
a floor station"`. Read `ArrivalCard.tsx` and `arrival-card.ts` first and copy
the split exactly: pure model in `src/lib/scan/`, dumb view in
`src/components/mobile/scan/`, `return null` when the model refuses.

### D.1 The Carton card model — `src/lib/scan/carton-card.ts`

```ts
export interface CartonCardInput {
  scan: string | ScanRoute;
  carton: { id: number; tracking: string; carrier: string | null; verdict: 'expedited'|'normal'|'unfound';
            poRef: string | null; supplier: string | null; lineCount: number; triageDone: boolean };
  lines: readonly CartonLine[];                 // from receiving.carton_lines rows
  policy: { requireSerial: boolean };
}
export interface CartonLine { id: string; title: string; sku: string | null; expected: number; received: number;
  grade: ConditionGrade | null; graded: boolean; serial: string | null; serialAbsent: boolean }
export type CartonVerb = 'grade' | 'triage_later' | 'receive';
export interface CartonCardModel {
  header: { back: 'Stack'; title: string };     // title from dispatchScan (card 'carton'), never re-formatted
  subject: { tracking: string; carrier: string | null; poRef: string | null; verdict: … };
  facts: readonly [ArrivalFact, ...ArrivalFact[]]; // 1–3
  lines: readonly CartonLine[];
  focus: CartonLine | null;                     // the next ungraded line, or null when all graded
  recommendation: { verb: CartonVerb; reason: string; actions: readonly [CartonAction, CartonAction] };
  fieldPlaceholder: string;                     // "Scan a serial — it lands on {title}" / "Scan the next carton"
}
export function cartonCardModel(input: CartonCardInput): CartonCardModel | null
export function cartonRecommendation(m): …      // pure: ungraded lines → grade; all graded & unfound → triage_later; all graded & found → receive
export function cartonOpsEvent(model, choice): { eventType: 'carton.graded'|'carton.triaged'|'carton.received'; … }
```

Rules copied from the Arrival model: recommendation is pure (no model call
between scan and Card); exactly two actions, recommended first; facts never
zero ("Prior record: none" when nothing is known); the loser is offered, never
enforced.

### D.2 The Carton card view — `src/components/mobile/scan/CartonCard.tsx`

Props mirror the model plus callbacks:
`{ model: CartonCardModel; onGrade(lineId, grade): void; onSerialAbsent(lineId): void;
onTriageLater(): void; onReceive(): void; pending: { lineId: string | null; verb: CartonVerb | null } }`.

Render order (fixed): `<h2>` title → tracking (mono, `dir="rtl"`) + `PO {poRef}`
→ `<dl>` facts → **the focus line**: `ItemRecordThumb variant="padded"`, two-line
title, `ItemRecordMobileMeta` (qty · condition · notes cluster; never split
chips), then the grade strip = `ConditionGradeChip` × `CONDITION_GRADES` as
36/44 row controls, current grade pre-selected → `Button variant="primary"`
with reason (`Grade USED_A · 2 of 3 lines left`) + `Button variant="secondary"`
(`Triage later` / `Receive`) → the remaining lines as a compact list
(`MobileStationTapeItem` entries with `emphasis='history'`, `live` only for
lines graded this session so Undo appears only on them).

- No toast, no dialog, no second textarea. One CTA per surface (the primary);
  the grade chips are row controls, not CTAs.
- Corners `MOBILE_SCAN_CARD_CORNER`; type roles ≤ 2 per file; ladder 28/36/44.
- Join `MOBILE_DISPLAY_COHORT`.

### D.3 Mount and data

- `src/components/mobile/redesign/UniversalScan.tsx` mounts `CartonCard` when
  `dispatchScan` returns `card === 'carton'` (the tracking is known), next to
  the Arrival mount; otherwise renders what renders today.
- Data: `GET /api/receiving/:id` (the `receiving.carton_lines` source's
  route) through a react-query hook `useCartonCard(receivingId)`; verbs call
  the registered actions' endpoints directly (`PATCH …/condition`, `POST
  …/serial-absent`, `POST /api/receiving/triage/complete`, `POST
  /api/receiving/mark-received-po`) via `useOptimisticMutation` (grade paints
  before the server answers; rollback may toast, verdicts may not).
- The Field is the phone's `StationComposerHost` as mounted by
  `MobileCompanionComposer` (faces off, `forceMode="unbox"`); its
  `labelPlaceholder` is `model.fieldPlaceholder`; its `reaction` is the
  `WeldedFeedbackPanel` with the last verb outcome (`Graded USED_A · next:
  line 2 of 3`). A serial scanned into the Field while the focus line is
  armed calls `POST /api/receiving/scan-serial` for that line (preview vs
  act: only the expected class acts; any other class previews).
- `triage_later` on a carton that lacks staging location / priority lane
  gets the server's 4xx message on the reaction panel (tone `error`, the
  route's own words), never invented copy.

### D.4 `/m/unbox` becomes a composed surface

`src/app/m/(shell)/unbox/page.tsx` wraps `RedesignedMobileReceive` in
`SurfaceGate surfaceKey="unbox"`, and `SurfaceRenderer` gains a **mobile
archetype branch**: when `useIsMobileShell()` (the `/m` layout context), the
Station scaffold is a single column (trigger band → workspace → queue →
advance) with no `w-80` aside. This is the only change to `SurfaceRenderer`;
`impact_analysis` first (14 desktop pages mount it through `SurfaceGate`).

### D.5 Tests and gates

- `carton-card.test.ts`: recommendation order; facts never empty; title
  equals `dispatchScan(...).title`; `null` on a scan the table does not route.
- `CartonCard.test.ts` (jsdom, `createElement`): exactly one primary button;
  grade strip pre-selects the row's grade; Undo appears only on `live` rows.
- `pnpm --config.verify-deps-before-run=false run eval:cohort mobile-display`.
- Hand gate from `PLAN-scan-shell-mobile.md`: Card paints < 100 ms after the
  scan (measure wedge timestamp → first paint); one shift with no menu opened.

### D.6 Done when

A phone on the bench scans a known tracking, sees the Carton card with the
first ungraded line focused, taps USED_A, sees "Graded" on the Field's
reaction panel, taps Triage later, and the desk's `/unbox` queue row updates
over Ably — with the phone rendering the SAME `station_definitions` config the
desk builder published.

---

## Lane E · Publish reaches the hands

Already wired: `publishStationDefinitionPublished` on the station channel;
`useStationDefinitionsRealtime` in `StationSlot` and `SurfaceGate`. Add:

1. When a mount repaints because of a publish it did NOT initiate, the
   station mouth's `reaction` shows tone `context`: `Unbox updated to v8 by
   Tuan · your carton is unchanged` for 2 ticker cycles, then clears. Source:
   the Ably payload (`id`, `version`, `pageKey`) + `updatedByName` from the
   history query. No toast.
2. `useStationDefinitionsRealtime` also invalidates `['stations','history',…]`
   so an open ledger (lane A) refreshes.
3. `reconnect: true` semantics: on Ably reconnect, invalidate `['stations']`
   wholesale (events published while offline are lost).

---

## 3 · Build order and ownership

| # | Lane | Depends on | Size |
|---|---|---|---|
| 1 | A.2 registration (catalog · resolver · adapter · layout · descriptor · definition · hooks · 6 registry lines) + tests + `eval:cohort slot-table` | — | 1 day |
| 2 | A.1/A.4/A.5 overlay + verbs + feedback card | 1 | 1 day |
| 3 | B.3 tray decouple + Publish affordance + B.6 permission fix | — | ½ day |
| 4 | B.4 mouth reaction + B.5 skill + B.2 artifact | 3 | ½ day |
| 5 | C.1–C.3 subject store, contract, scan → subject, selection props | — | 1 day |
| 6 | C.4–C.6 grade variant, descriptor-only map, subject card, mouth in the advance band, toast removal | 5 | 1 day |
| 7 | D.1–D.3 Carton model + view + mount + Field wiring | 5 | 1½ days |
| 8 | D.4 mobile archetype branch + flag on for dogfood | 6, 7 | ½ day |
| 9 | E reactions | 2, 4 | ½ day |

Lanes A and B can be built by two people at once. C blocks D.

---

## 4 · Refuse list (say no, cite this file)

- A history "list" component, a `<table>`, a `*GridRow.tsx`, a
  `STATION_VERSIONS_GRID_COLUMNS` array → §0.6, `table-engine-law.ts`.
- A `Dialog`, `RightPaneOverlay`, `RightRailHost detail:*`, or `?v=` route for
  the ledger → §0.5, LAWS Q5.
- Re-activating an old row instead of copy-forward → §2.2.
- An "Accept" mutation kind, or an accept button inside an artifact → §2.4.
- A second composer on the phone Card, `showModeRow={false}`, a
  `*NotesComposer` → §0.3.
- Any toast for a verdict, a publish, a grade, a scan → §0.4.
- Standing keycaps, a cheat sheet from `?`, a hotkey popover → §0.8.
- A third grade allow-list; grades come from `@/lib/conditions` only.
- An expression language in `filters` (only the closed `$subject.id` token) →
  builder plan §5 "no formula language".
- A new realtime transport → LAWS A4.
- Fetching inside a block → `contract.ts` "blocks never fetch on their own".

---

## 5 · Verification checklist (run before claiming any lane done)

```bash
node --import tsx --import ./scripts/register-server-only-shim.cjs --test <your test files>
./node_modules/.bin/eslint <touched files>
./node_modules/.bin/tsc --noEmit -p tsconfig.json
pnpm --config.verify-deps-before-run=false run eval:cohort slot-table      # lane A
pnpm --config.verify-deps-before-run=false run eval:discover               # lane A
pnpm --config.verify-deps-before-run=false run eval:station scan-out       # lanes B, C
pnpm --config.verify-deps-before-run=false run eval:station unbox          # lane C
pnpm --config.verify-deps-before-run=false run eval:cohort mobile-display  # lane D
pnpm --config.verify-deps-before-run=false run eval:cohort shortcuts       # lane A hotkeys
export GARISEK_OS_ROOT=/home/michaelgarisek/Projects/Garisek-OS
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

`ds_critique` every touched `.tsx`. Commit with `git commit --only <paths>`
(a bare commit sweeps other sessions' staged files). Do not stage what you did
not write.
