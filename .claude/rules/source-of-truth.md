# Source-of-truth invariants

Each concern below has exactly one source module. Read from it; never inline, copy, or re-derive the mapping.
Summarized in the root `CLAUDE.md`; this file holds the detail and rationale.

## Presentation kinds (UI waist — data drives display)

Views **assemble** resolved facts; they do **not** invent label maps, hues, or chip types. When rendering domain
fields, pick the presentation kind and import from the SoT below (Kinetic Ledger law 4 — `AGENTS.md`).

| Facet / kind | Source |
|---|---|
| Civil day / instant / warehouse zone | `src/utils/date.ts` |
| Condition grade → label | `src/lib/conditions.ts` (`conditionLabel`) |
| Condition grade → tone | `src/lib/condition-tone.ts` (+ `useConditionGradeStyle`) |
| Source platform → label / tone | `src/lib/source-platform.ts` |
| Typed identifiers (serial, FNSKU, tracking, …) | `CopyChip` family + `src/lib/copy-chip-format.ts` |
| Capability / provider nouns | `src/lib/integrations/capability-labels.ts` (+ server connections) |
| Cross-entity search row | `SearchHit` / `src/lib/search/search-hit.ts` + hybrid retrieval |
| Lifecycle / status dots | lifecycle tone registries / `workflowStageDot` (do not invent status maps) |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Spacing scale + intents | `src/design-system/tokens/spacing.mjs` (+ `Stack`/`Inset`/`Row` primitives) |
| Focus affordance | `src/design-system/tokens/focus-ring.ts` (`focusRing(archetype, tone)`) |
| Surface / box shell | `Panel` (generic) · `SectionCard` (monitor) · `CardShell` (rows) — never hand-roll |
| Station entity-context header | `@/components/station/entity-context` (`CartonContextCard`) — Unbox / Triage / Testing / Shipping active-order |
| Buttons | `src/design-system/primitives` `Button` |

If a facet has no SoT yet, **add or extend one** (pattern evolution) — do not fork a page-local map “just for this screen.”

## Dates & times (civil day vs instant)

- Source: `src/utils/date.ts`. Warehouse business zone is `WAREHOUSE_TIME_ZONE` (`America/Los_Angeles`).
- Keep **three types separate** — never collapse them into one ad-hoc `Date`:
  - **Instant** — timeline moment → ISO-8601 with `Z`/offset; store as `timestamptz`; format with `formatDateTimePST` / `formatTime12hPST` / `formatApiInstant`.
  - **Civil date** — calendar day with no time → `YYYY-MM-DD` only; use `parseDateKey`, `addDaysToDateKey`, `diffDaysDateKey`, `formatDateKeyShort`, `getCurrentPSTDateKey`, `toPSTDateKey`.
  - **Zoned wall-clock** — instant + explicit zone (SQL: `timezone('America/Los_Angeles', ts)::date`).
- **Banned** (guard: `src/utils/date-civil.guard.test.ts`):
  - `new Date(\`${dateKey}T00:00:00\`)` or any local-midnight reparse of a civil key
  - `new Date('YYYY-MM-DD')` then `getDate()` / `toLocaleDateString()` for warehouse labels
  - Host-local `ymd(new Date())` for warehouse “today” — use `getCurrentPSTDateKey()`
  - Bare `toLocaleDateString()` on ops surfaces that must match warehouse day buckets
- **Calendar widgets only:** `dateKeyToLocalDate` / `localDateToDateKey` (same local frame both ways). Do not pass those `Date`s into zoned formatters or `toISOString()` for day logic.
- **Day bounds for SQL/API:** `warehouseDayUtcBounds(dateKey)` or SQL `timezone('America/Los_Angeles', ts)::date`.
- Unit tests for civil math must pass under `TZ=UTC` (see `src/utils/date.civil.test.ts`).

## Condition grade → label

- Source: `src/lib/conditions.ts`, function `conditionLabel(code, variant)`.
- 6 variants: `pill` / `table` / `compact` / `label` / `full` / `option`.
- Never inline a grade→label map anywhere else; add a variant here instead.

## Condition grade → color (picker + inline badges)

- Source: `src/lib/condition-tone.ts` (`CONDITION_GRADE_TONE`, `conditionGradeTextClass`, `conditionPillClass`).
- UI hook: `src/hooks/useConditionGradeStyle.ts` — label + text class for inline readouts.
- Never hardcode per-grade Tailwind colors in components; import from here so pills and meta rows stay in sync.

## Z-index

- Source: `src/design-system/tokens/z-index.ts`, wired into Tailwind as named utilities
  (`z-panel`, `z-modal`, `z-panelPopover`, `z-toast`, `z-tooltip`).
- Never hardcode `z-[NNN]` or inline numeric `zIndex`. Add/adjust a named token instead.

## Focus affordance

- Source: `src/design-system/tokens/focus-ring.ts` — `focusRing(archetype, tone)` returns a `cn()`-ready
  class string. Archetypes: `field` (`:focus`), `control` (`:focus-visible` + offset), `wrapper`
  (`:focus-within`). Semantic tones: `accent`/`danger`/`warning`/`success`/`neutral`.
- Never hand-roll a `focus:ring-*`/`focus-visible:ring-*` recipe; compose `focusRing(...)`. Guard:
  `src/components/ui/focus-ring-tokens.guard.test.ts` (escape: same-line `ds-allow-focus`).

## Spacing (density-aware scale + intents)

- Source: `src/design-system/tokens/spacing.mjs` → `theme.extend.spacing`; each step is
  `calc(rem × var(--cf-density, 1))` (typed re-export: `spacing.ts`). `extend` merges per key —
  a key not listed in `spacing.mjs` keeps Tailwind's static stock value; add new in-use keys there.
- Recurring padding jobs resolve via the Tier-2 intents (`inset-chip/field/cozy/card/empty`,
  `stack-tight/row/section`, `row-gap/tight` — tailwind.config.ts plugin + safelist + `cn()`
  `cf-*` groups, all pinned by the keystone test) or the `Stack`/`Inset`/`Row` primitives.
  An intent is the whole padding story for its element — never mix it with raw `p-*` there.
- Never hardcode arbitrary-px spacing. Guard: `src/components/ui/spacing-tokens.guard.test.ts`
  (escape: same-line `ds-allow-spacing`, reserved for safe-area / fixed-overlay geometry).

## Integrations: capability labels, gating, and tokens

- **Product surfaces speak capabilities, never vendor brands.** Operator copy uses either a generic
  capability noun ("Save to inventory", "Sync purchase orders") or the connected provider's display
  label resolved at runtime — never a hardcoded "Zoho / Zendesk / Ecwid / Gmail" product sentence.
- Label SoT: `src/lib/integrations/capability-labels.ts` (`capabilityNoun` / `capabilityTitle` /
  `providerCatalogLabel` / `integrationsHubHref` — client-safe). Org-aware resolution + feature
  gating: `src/lib/integrations/capability-connections.ts` (`isCapabilityConnected` /
  `connectedProviderLabel` — server-only). Capability vocabulary: `Capability` in
  `src/lib/integrations/connectors/types.ts`.
- Capability facades, not direct vendor imports, in product routes/services:
  `src/lib/integrations/inventory/` (`getInventoryProvider`) and `src/lib/integrations/helpdesk/`
  (`getHelpdeskProvider`). Vendor modules (`src/lib/zoho/**`, `src/lib/zendesk.ts`) are connector
  implementation detail behind them.
- Brand strings ARE allowed in: the Integrations card (`PROVIDER_CATALOG`), deep links into vendor
  web apps ("Open in Zoho"), platform/channel chips, permission LABELS (ids like
  `integrations.zoho` never rename), and admin cron/diagnostic category names.
- **Settings → Integrations is the only connect/disconnect surface.** Tokens live ONLY in the
  `organization_integrations` vault via `src/lib/integrations/credentials.ts`; never add a new
  token home or a new USAV env fallback branch.

## Source platform → label / tone

- Source: `src/lib/source-platform.ts` (`SOURCE_PLATFORM_OPTS` / `SOURCE_PLATFORM_LABELS` derive from it).
- Urgency / priority is a priority-tier picker on `receiving.priority_tier`; SoT is `src/lib/receiving/priority-override.ts`
  (`is_priority` = synced tier-0).

## Copy-chip / serial display

- Three layers: pure helpers in `src/lib/copy-chip-format.ts`; behavior in `useCopyChip` / `useChipTooltip` (`@/hooks`);
  `CHIP_TONES` tone registry in `CopyChip.tsx` (incl. `price` for unit cost).
- Condition meta chips use `ConditionGradeChip` → `src/lib/condition-tone.ts` for per-grade underline/icon hue.
- `resolveSerialDisplay` / `resolveChipDisplay` are the label SoT for serials/chips.

## Buttons

- Canonical `Button` (5 variants) lives in `src/design-system/primitives`. `PrimaryButton` is now a thin alias.
- New code uses `Button`; don't hand-roll button class strings.
- Icon-only actions use `IconButton` with a `size` (xs/sm/md/lg/touch) for the hit-box — never a hand-set
  `h-N w-N` on the button (guard: `control-size-tokens.guard.test.ts`). `touch` = the 44px tap floor that
  `tokens/touch.ts` used to own (retired).

## Station entity-context header (inbound carton + shipping active order)

- **SoT:** `@/components/station/entity-context` → `CartonContextCard` (implementation under
  `receiving/workspace/line-edit/`; barrel is the public waist).
- Condensed one-row anatomy: listing · PO# / order# · tracking · CLAIM · photos · platform/type/priority.
  Editors slide below on demand — do not regroup into stacked form sections.
- **Compose for Unbox / Triage / Testing / Shipping (active order)** via thin adapters
  (`LineCartonContextSection`, `TestingCartonHeader`, `ShippingEntityContextHeader`).
  Omit optional props to hide claim / photos / classify per station.
- **Never fork** a second condensed identity header (no page-local title + "Open listing" card).

## SKU identity (data-integrity)

- `items` (Zoho) and `sku_catalog` are **two independent SKU numbering schemes**.
- **Never join on the SKU string** — they collide. `items.name` is the title-display SoT
  (`get-title-by-sku` prefers `items.name`, not `sku_catalog` / `sku_stock`).

## Cross-entity search (AI search — the narrow waist)

- **Engine SoT**: `src/lib/search/hybrid-retrieval.ts` (`hybridSearch`) over `entity_search_docs`
  (migration `2026-07-03d`) is the single cross-entity search engine — exact-identifier bypass →
  keyword (trgm GIN) → pgvector cosine → RRF. **Never build a new per-surface search
  implementation**; new consumers call `hybridSearch` (server) / `POST /api/ai/retrieve` (client via
  `src/lib/search/ai-search-client.ts` + `useAiQuickJump`).
- **Result shape SoT**: `SearchHit` in `src/lib/search/search-hit.ts` — including the DB↔UI entity
  vocabulary, per-entity deep-links (`searchHitHref`), and scope-filter hrefs (`searchScopeHref`).
  Tools and endpoints return `SearchHit[]`, never raw rows; render via `AiQuickJumpResults` / `CmdRow`.
- **Doc-freshness SoT**: DB triggers → `entity_search_outbox` → the cron worker
  (`src/lib/search/search-outbox-worker.ts`). **Never call an upsert-search-doc helper from domain
  code** — a new searchable entity = extend `build-search-text.ts` + add triggers in a migration
  (keep the two column lists in sync; see the 2026-07-03d header).
- **Keyword-arm SQL rule**: every predicate must textually match the indexed expression
  `lower(search_text)` using GIN-supported operators (`=`, `LIKE`, `<%`) — `BTRIM`/raw-column
  variants force a per-org Seq Scan (EXPLAIN-verified 2026-07-04).
- The exact fast paths (`src/lib/search/global-entity-search.ts`) are deterministic parent-table
  truth and are **never removed** (plan non-goal); legacy query libs survive as typed tools.
