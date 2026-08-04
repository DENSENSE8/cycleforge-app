# Resume prompt — spine Phase D (small context)

Paste this into a fresh session. Full detail:
[`spine-cloudflare-nav-PHASE-D-HANDOFF.md`](spine-cloudflare-nav-PHASE-D-HANDOFF.md).

```
Spine Phase D is code-complete and UNCOMMITTED, sitting on top of ANOTHER
uncommitted phase. Do not redo or revert either. Lane: main, no new branch.
Attach to :3050 — never start/restart/kill the dev server. `grep` is aliased to
a stale-cache ugrep; use `rg`.

FIRST JOB — re-measure, before touching anything:
  npx playwright test tests/e2e/sidebar-open-close.spec.ts --project=desktop

That spec carries a geometry probe with a shrink-only per-route budget
(floor /reports = 0 rows below fold, ceiling /products = 1). Two changes landed
AFTER the last measured run and neither has been measured: the Scan Stations
eyebrow (~22px) became a section header row (~30px, +8px of map, in the section
that sits first), and SpineTopPins moved into the 40px band (should cost the map
nothing — but that's a prediction). The ceiling already overflows by 47px with
exactly 1 row below the fold, so it is within noise of tipping to 2.

If it now reports 2: do NOT raise belowFoldBudget (baselines only shrink). Fix by
defaulting Scan Stations to COLLAPSED when it does not own the active page —
the state and control already exist (`collapsedSections` in SidebarNavList);
only the initial value changes. That reclaims eight rows.

WHAT SHIPPED (guards 64/64, typecheck clean):
- Trailing count badges deleted; cardinality moved to aria-label.
- source-of-truth.md queue-depths row re-argued onto its one surviving leg
  (nav-search does no I/O). Do NOT put a live depth badge in the vacated slot.
- Left nesting rail on child rows (a border — costs no height).
- Scan Stations = collapsible section header (glyph + label + rotated
  ChevronDown). It DISCLOSES, never navigates — a section is not a place.
- SpineTopPins (Home/Search/Media/Chat) in the spine's 40px band;
  HeaderTopPins.tsx deleted and unwired from GlobalHeader. One home only.
- Four guards RESCOPED (not deleted) + one added. Read handoff §6 before
  "fixing" any of them.

WHY two-line Cloudflare rows were rejected — measured, real runner, 1440x900:
map 562px (floor) / 732px (ceiling) vs a 685px port; a two-line row costs +12px,
projecting to 1020px at the ceiling. Do not re-litigate without a new run.

PRE-EXISTING RED, not yours: doc-catalog drift (another session's new
scan-station-procedure handoff — do NOT run portfolio-sot-sync.mjs and commit it);
grid-column/packer churn in OrdersGridView, WorkbenchTrailingCluster,
usePackerOrderPane. Report pre-existing failures rather than inheriting them.

Then: npm run verify + the three nav specs (sidebar-nav-search,
sidebar-open-close, cmdk-palette) on --project=desktop. Stop and report.
```
