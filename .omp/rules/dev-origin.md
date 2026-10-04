---
description: Dev origin is http://localhost:3050 only — never bind another port, hand-start next dev, or move PW_BASE_URL
condition:
  - '\bnext\s+dev\b'
  - '\bPW_BASE_URL=(?!["'']?http://localhost:3050\b)'
  - '\bPORT=(?!3050\b)\d+'
  - '--port[=\s]+(?!3050\b)\d+'
  - '\s-p\s*(?!3050\b)\d{4,5}\b'
  - 'https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(?!3050\b)\d{2,5}'
scope:
  - 'tool:bash'
---
AGENTS.md §1: `http://localhost:3050` is the only dev origin. It is the switchboard that routes to the pinned lane and stamps the cookie scope; a lane port or a second server exercises a different cookie namespace than the operator's browser.

- All curl / Playwright / browser probes / screenshots → `http://localhost:3050` (`PW_BASE_URL=http://localhost:3050`).
- Never bind another port, never hand-start `next dev`, never move `PW_BASE_URL`. `npm run dev` hitting `EADDRINUSE` on `:3050` is correct.
- `:3050` dead or `503` with `x-switch-error` → the lane is down: `systemctl --user restart cycleforge-lane@prod`, logs `journalctl --user -u cycleforge-lane@prod -f`.
- Only exception: the `request-shape` skill's production build on an isolated `NEXT_DIST_DIR` + throwaway port; verify the result at `:3050`, then stop it.
