# Dev serving triage — "why don't I see my change?"

One command walks the entire serving chain (port → process → checkout → unit →
tunnel → HTTP):

```bash
node scripts/dev-serving-triage.mjs [port]      # default 3050
node scripts/dev-serving-triage.mjs 3050 --cold # stop unit, rm -rf .next, start
```

Run it BEFORE assuming anything. Every incident below is a real one from this
box.

## The ladder (in order — cheapest diagnoses first)

1. **Which port are you actually on?** Main dev is **:3050**. `:3000` on this
   machine is a **foreign app** (answers `relay: no community is configured`).
   Lane worktrees run their own ports (e.g. mobile-arrival `:3075`).
2. **Whose process, which checkout?** The script maps listener pid → cwd →
   git HEAD. A `MISMATCH` line means the port serves a different checkout than
   the one you are editing in.
3. **Stale turbopack cache?** Symptom (seen 2026-09-06): runtime
   `ReferenceError: <symbol> is not defined` for a symbol that **exists in
   source** (e.g. `pulse` in `AgentSessionPanel`), plus
   `Switched to client rendering because the server rendering errored` in the
   journal — the served chunk predates the source. Pages then render a
   degraded/stale shell that reads as "my change never shipped".
   Fix: `node scripts/dev-serving-triage.mjs 3050 --cold`
   (stop `cycleforge-dev.service` → `rm -rf .next` → start). A plain
   `systemctl --user restart cycleforge-dev.service` reuses `.next` and can
   keep serving the stale graph.
4. **Which session is the browser in?** UI gated on `memberships.length > 1`
   (org switcher, ambient workspace chip) is **invisible by design** to
   single-org accounts. To see multi-org surfaces: sign in at `/signin` as
   `qa-admin@cycleforge.test` (see `docs/qa-org-playbook.md` — two-org fixture:
   QA Sandbox ↔ Test Iso A). Also: the spine (and its footer) lazy-mount —
   open the navigation first.
5. **Browser cache?** Almost never. `src/app/layout.tsx` unregisters every
   service worker and deletes every CacheStorage cache on each load. If in
   doubt, hard-reload (Ctrl+Shift+R).
6. **Tunnel.** `usav-dev.michaelgarisek.com → :3050`, but the main tunnel is
   **remotely managed** — the Cloudflare dashboard ingress WINS over
   `~/.cloudflared/config.yml`. If the hostname misroutes, check the dashboard.
   Lane tunnels (`~/.config/cycleforge/lanes/*.yml`) are locally managed.

## Journal quick check

```bash
journalctl --user -u cycleforge-dev --since "-10min" --no-pager | grep -iE "error|ready"
```

## Never again

- Restart through the unit (`systemctl --user restart cycleforge-dev`), never
  `kill <pid>` — systemd owns the process tree.
- After ANY "I don't see my change" report: triage script first, fix second.
- If a runtime error names a symbol that exists in source, it's the cache —
  go straight to `--cold`.
