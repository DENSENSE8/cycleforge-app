# Verify — the gates a change must pass

Summarized in root [`AGENTS.md`](../../AGENTS.md); this file holds the detail.

## Inner loop — smallest relevant check

```bash
npx tsx --test path/to/file.test.ts        # unit tests for a file
npx tsc --noEmit -p tsconfig.json          # typecheck (heavy — use when types are in doubt)
```

## Before a task is "done" (and before any commit)

```bash
npm run verify
```

It is the local mirror of CI (`.github/workflows/ci.yml`) — lint, typecheck, unit tests (incl. the
DS-ratchet guards), knip dead-code, route-auth drift + enforce, schema drift — and reports every
failure at once. **Green locally ⇒ green in CI.**

The pre-push hook (`.githooks/pre-push`, wired by `npm install`) runs it for you and blocks a red push;
`--fast` (lint + typecheck) is the quick inner-loop variant.

**When a DS-ratchet gate fails**, migrate to the DS primitive (`Button`/`IconButton`, `HoverTooltip`,
`focusRing(...)`, `text-role-*`) or add the documented `ds-*` escape for a genuine one-off — **never**
raise a baseline count or `--no-verify` past it. Baselines only shrink.

**When the tree holds another session's work**, run the failing gate on your files before assuming the
red is yours; report which failures are pre-existing rather than silently fixing or inheriting them.

## E2E runs against the QA org, never the dogfood org

**A test asserts against `QA_ORG_ID`, not the dogfood tenant.** Point new Playwright specs at the
`qa-desktop` project (storage state `tests/.auth/qa-admin.json`) and assert on the `QA_FIXTURE_*`
constants from `src/lib/tenancy/qa-org.ts` — never on whatever rows USAV happens to have today.

- **Why:** the dogfood org is a live warehouse. Its row counts, lifecycle mix, and feature flags change
  under the test between runs, so a dogfood-backed spec fails for reasons that have nothing to do with
  the change under review — and, worse, passes vacuously when a lane happens to be empty. The QA tenant
  is provisioned to a fixed org UUID with deterministic SKUs / PO / orders and its gated flags
  force-enabled, so a spec exercises the same surface every run.
- **Do:** `pnpm provision:qa-org` (idempotent, safe to re-run) →
  `npx playwright test <spec> --project=qa-desktop`. Seed what a spec needs by extending the fixtures
  in `qa-org.ts` + `scripts/provision-qa-org.ts`.
- **Don't:** hardcode a tenant UUID in a spec, read the org id from a session, or `test.skip` around
  missing dogfood data — the skip hides the coverage gap that using the QA org would have closed.
- **Dogfood-only exception:** a spec that exists *because* of production-shaped data (a migration
  backfill probe, a live-integration smoke test) may run on `desktop` — say so in the spec's header
  comment and keep its assertions shape-based, never count-based.

## Measure in the real runner, not a convenience surface

Geometry and layout claims come from the actual test runner (Playwright) or the browser under test.
An embedded preview pane can report distorted rects — a measured `getBoundingClientRect()` that
disagrees with the viewport is a signal the surface is lying, not a result to report.

Assert on the **invariant**, not a sample: for a virtualized grid the last DOM row belongs to the
render window and may sit below the fold, so the scrollport edge — which clips every row — is the
honest thing to measure.
