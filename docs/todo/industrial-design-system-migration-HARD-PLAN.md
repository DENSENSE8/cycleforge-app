# HARD PLAN — Industrial design-system migration

**Authority:** This plan routes work; executable law lives in rule modules, guards, Design MCP and eval cohorts.  
**Program relationship:** Continues `design-system-fork-consolidation-2026-PLAN.md`; it does not replace it.  
**Migration unit:** one workflow cohort at a time, mobile → desk table → station. Never a raw-palette sweep.

## Non-negotiable execution loop

- [ ] Confirm the requested operator verb has a `/m` completion path.
- [ ] Run `node tools/design-mcp/ds.mjs contract "<intent>"`.
- [ ] Query exactly one relevant token axis with `ds.mjs tokens`.
- [ ] For shared infrastructure, run code-graph `find` then `impact`.
- [ ] Change the golden surface before its cohort peers.
- [ ] Run `ds.mjs critique <changed-file>`.
- [ ] Run the relevant cohort/station eval.
- [ ] Verify through `http://localhost:3050` when pixels or behavior changed.
- [ ] Run `pnpm verify:fast` and the repository fast eval command.

> Current-repo correction: `scripts/sot-lookup.mjs` and `sot-manifest.json` are
> not present in this checkout even though the older consolidation plan says
> they landed. Do not document or depend on that command until its executable
> surface is restored and gated.

## Inventory rule

The broad counts—5,248 raw palette classes, 3,026 radius classes, 49 inline
motion definitions, 734 native buttons and 370 color literals—are discovery
inventory only. They contain definitions and sanctioned exceptions. They are
not deletion targets, baselines or proof of a violation.

## Phase 1 — Ratify the translation matrix

- [x] Compare both pasted documents; they are byte-identical.
- [x] Inventory every named pasted palette, typography, spacing, component,
  motion and accessibility concept.
- [x] Map every concept exactly once to a semantic token, owned component,
  motion role, supported region, mobile behavior and named exception.
- [x] Resolve header casing: table headers remain sentence case; uppercase is
  limited to micro labels, fields, statuses and hotkeys.
- [x] Resolve color authority: tenant accent owns product actions; fixed blue
  is information semantics only.
- [x] Resolve mono authority: house `font-mono` remains IBM Plex Mono; no second
  JetBrains bundle is introduced.
- [x] Resolve dark-terminal scope: station/monitor and named inverse bands only;
  never a global desk/mobile substrate.
- [x] Preserve semantic radius roles and named soft-shell exceptions.
- [x] Reject pasted spring objects at call sites; alias behavior to motion roles.
- [x] Add a deterministic rule module, tripwire, JSON CLI and always-on gate.
- [x] Add the Design MCP face and dedicated eval cohort.

**Exit:** `industrial-translation-guard --json` reports complete, duplicate-free
coverage. No source concept requires choosing a raw hue or physics literal.

## Phase 2 — Foundations, without product restructuring

- [ ] Contrast-audit light and slate before changing either palette.
- [ ] Tune only semantic theme values; preserve the pinned light canvas unless
  its owning law is deliberately amended.
- [ ] Confirm typography roles against phone, desk and station densities.
- [ ] Add telemetry roles only for distinct semantic jobs missing from the
  current status vocabulary.
- [ ] Alias any missing motion behavior inside the motion catalog/role layer.
- [ ] Add contrast tripwires and reduced-motion tests.
- [ ] Do not add a terminal token axis.

**Exit:** foundations are semantic, theme-aware, contrast-tested and reduced-
motion-safe; no page structure changed.

## Phase 3 — One governed vertical slice

- [ ] Mobile golden: `/m/pick` completes the operator verb first.
- [ ] Desk golden: the corresponding `DataTable` family uses the same state and
  verb semantics through the canonical table contract.
- [ ] Station golden: Pack or Unbox adds telemetry only where it improves an
  active scan decision.
- [ ] Add screenshots at `http://localhost:3050` for all three surfaces.
- [ ] Run mobile-first, slot-table and station evals.

**Exit:** one interaction model works across phone, desk and station without a
second component family.

## Phase 4 — Turn decisions into firewalls

- [ ] Govern raw terminal palette classes inside migrated cohorts.
- [ ] Govern inline spring physics.
- [ ] Govern new `motion.button` primitives.
- [ ] Govern second manifest/table shells.
- [ ] Govern hidden focus rings.
- [ ] Govern uppercase table headers.
- [ ] Govern desktop verbs lacking `/m` completion.
- [ ] Port the AST Industrial Law harness to live critical assemblies.
- [ ] Keep `WorkbenchChromeHeader` retired; protect its successor instead of
  resurrecting the deleted symbol.
- [ ] Protect `StationDisplaysPushStack` through its station cohort.

**Exit:** every new law has a rule module, tripwire, CLI, MCP face and eval.

## Phase 5 — Cohort migration order

- [ ] Button and status faces.
- [ ] Table header/cell typography.
- [ ] Table seams and surface hierarchy.
- [ ] Selection/action strips.
- [ ] Scan stations.
- [ ] Remaining workbenches.
- [ ] Rollups and secondary surfaces.

For every cohort:

- [ ] Migrate the golden.
- [ ] Capture screenshot coverage on `:3050`.
- [ ] Run the cohort evaluation.
- [ ] Migrate every registered peer.
- [ ] Tighten the guard or lower a ratchet only after all peers pass.

## Completion law

The migration is complete only when authors select intents—table identity,
technical value, batch execute, live telemetry—and the system selects the face,
tokens and behavior. If a caller still chooses among raw hues, radii or spring
numbers, that cohort is not unified.
