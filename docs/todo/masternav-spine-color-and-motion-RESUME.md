# Resume prompt — MasterNav spine color + motion (small context)

Paste this into a fresh session. Full detail:
[`masternav-spine-color-and-motion-HANDOFF.md`](masternav-spine-color-and-motion-HANDOFF.md).

```
Read docs/todo/masternav-spine-color-and-motion-HANDOFF.md and execute §5 first
(the live visual pass), then stop and report.

Everything else is DONE and UNCOMMITTED — code complete, guards green,
npm run verify PASSED. Do not redo the box-to-box padding removal, the
section-color reinstatement, the repair violet→orange fix, or the guard
tests; §1-§4 of the handoff are a record of what shipped, not a to-do list.

The only open item: every attempt to run the sidebar E2E spec or get an
authenticated screenshot this session hit the same wall —

  [global-setup] account signin failed (401): INVALID_CREDENTIALS

— six times, identically, unrelated to any of this session's changes. Try
tests/e2e/sidebar-open-close.spec.ts --project=desktop once. If it's fixed:
confirm both MEASURE tests report 0 rows below fold, screenshot a selected
Sales or Shipping row (should be a solid hue fill + white text + inset ring,
settling once with no residual motion), and confirm Repair's icon reads
distinctly orange against its amber Receiving siblings. If it's still 401:
report that plainly and stop — do not retry more than once, sign in
manually, or try to route around it.

Attach to :3050; never start/restart/kill the dev server.
```
