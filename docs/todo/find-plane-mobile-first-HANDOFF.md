# FIND plane — mobile-first iteration (handoff)

**Lane:** `~/Projects/cycleforge-lanes/prod` ONLY. Absolute paths in every edit.
**Written:** 2026-09-13, after the desktop FIND rebuild (identifier truncation,
row anatomy, the `search-hits` DataTable mount, the three-cluster refine band,
the floating results card and the `‹ Results` back affordance).

## Why this exists

The previous pass rebuilt `/search` **desktop-first** and it is good there. The
phone twin `/m/search` renders **the same component tree** —
`src/app/m/(shell)/search/page.tsx` mounts `SearchFindSurface` exactly as
`src/app/search/page.tsx` does — so every desktop decision landed on the phone
without anyone designing it there.

The product already knows how to do phone well: the shell tabs, the item-record
product rows (`ItemRecordCard` / `ItemRecordMobileMeta` / `ItemRecordMobileStage`,
each pinned), and `MobileToShipRow` / `MobileToShipQueue`. **That vocabulary is
the target.** The FIND plane should arrive at it, not invent a second one.

## The five concrete gaps

Each is a fact in the tree today, not a taste call.

1. **The results card is sized for a desk.** `SearchBrowseShell` wraps the
   results in `DESK_STAGE_FIXED_CLASS` (1152px max) + `FIND_STAGE_GUTTER_CLASS`
   (`px-4 pb-4 pt-3`) + `cornerClass('surface')` + `elevationClass('raised')`
   (`src/design-system/tokens/desk-stage.ts`, FIND stage section). On a 390px
   phone that is a 16px gutter each side and a raised shadow on a surface that
   already fills the viewport — depth with nothing to be deep against. Decide
   the phone answer and put it in the **stage token module**, not in the
   component.

2. **The rows are a spreadsheet.** `/search` results are now a `DataTable`
   mount on the `search-hits` family: seven chrome tracks plus three bound
   tracks, `minmax()` widths, horizontal scroll. That is right on a desk and
   wrong in a hand. **Do not fork a second table** — `table-engine-law.ts`
   §1–§3. The two lawful moves are (a) a phone LAYOUT TIER of the same family,
   or (b) mounting `SearchResultRow` at `compact` density on the phone route
   while the desk keeps the mount. Pick one, say why, and make it a property
   of the MOUNT, never a branch inside the engine.

3. **One surface, two laws about width.** `SearchResultRow` gates chrome on the
   `density` prop and documents why (`SearchResultRow.tsx:35` — "a desktop
   sidebar rail is narrow too, and a viewport query corrupts it").
   `SearchDossierFrame.tsx` gates on `md:` in five places (lines 101, 113, 129,
   215, 224). Reconcile them. The row's law is the one the pin backs.

4. **The refine band does not fit a phone.** `SearchRefineControls` paints a
   scope track of 11+ faces plus status and channel bubbles plus a sort track.
   It WRAPS by design — `SearchRefinePills` documents that `overflow-x-auto`
   was removed because it cut pills off mid-word — so on a 390px screen it
   becomes four rows of chrome above the first result. A phone needs a
   different FORM (a sheet, a count trigger, the engine's own filter funnel),
   not a scroll strip. Do not reintroduce the strip, and do not name or import
   `FilterRefinementBar` (router refuse fires on the literal string).

5. **Tabs.** The operator's own read is that the existing mobile tabs are good.
   Adopt that chrome for any FIND mode switching. Page modes ride the TOP row
   (`DeskPageChrome`, operator 2026-08-31), never a `TableStatusBar` foot strip.

## Laws that bound the work

- **One table engine.** `src/lib/tables/table-engine-law.ts`. A read plane is a
  MOUNT (`READ_PLANE_IS_A_MOUNT`); a family contributes a catalog, a resolver,
  an adapter and a column array — never a cell, a row component or a host.
- **Design system first.** From inside the lane (the MCP server is rooted at
  the MAIN checkout and returns "no such file" for lane paths):
  `node tools/design-mcp/ds.mjs contract "<job>"`, `… tokens <axis>`,
  `… critique <file>` on every file touched.
- **Code graph before shared edits:**
  `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find <Symbol>` → `impact <node_key>`.
- **No dev server, no migrations, no formatters/linters, no branch/commit/push.**
  The `prod` lane server is already running on `:3077` under systemd; the
  operator owns it.

## Acceptance

```
npx tsc -p tsconfig.json --noEmit
node --import tsx --import ./scripts/register-server-only-shim.cjs --test \
  src/lib/search/*.test.ts src/components/search/**/*.test.ts \
  src/lib/tables/field-catalog/search-hits.test.ts
node tools/design-mcp/ds.mjs critique <each edited file>
pnpm run eval:cohort slot-table     # if CompoundItem / useSlotTableLayout /
                                    # the DataTable funnel is touched
```

Plus a **real phone-viewport check** at 390×844 against
`http://127.0.0.1:3077/search?q=bose` and `…/m/search?q=bose` — screenshot the
before and after. A mobile-first pass verified only on a desktop viewport has
not been verified.

## Known-not-yours

- Nine test files already fail in this lane and are unrelated:
  `sidebar-spine-peek`, `band3-find-only.guard`, `color-neutrals`,
  `grid-header-shows-label`, `cursor-label`, `morph-cursor`,
  `turn-determinism-law`, `cart-compound-view`, `order-kit-composition`.
- `src/design-system/pinned.json` still carries the 2026-09-12 "full-bleed
  band, surface tone is the separator" ruling for the FIND browse band, which
  the 2026-09-13 card ruling supersedes. The law file is the operator's to
  amend; flag it, do not quietly rewrite it.
