# Feature lanes — isolated preview + e2e, one command each

One machine is the source of truth (this box). You SSH into it from wherever you
are. A **lane** is one feature's isolated place to live: its own worktree, its
own port, its own public hostname, its own supervised processes — none of which
can disturb `:3050` or `usav-dev.michaelgarisek.com`.

```bash
pnpm lanes                # what exists, what is up, what URL
pnpm lane new packed-pie  # create one
pnpm lane up packed-pie   # start its server + tunnel
pnpm lane land packed-pie # verify, fast-forward main, push
pnpm lane rm packed-pie   # retire it
```

---

## 1 · One name derives everything

Nothing is remembered, looked up, or chosen twice. Given the lane name
`packed-pie`:

| | |
|---|---|
| Worktree | `~/Projects/cycleforge-lanes/packed-pie` — **detached at `main`** |
| Port | `3071` — allocated once from 3071–3089, recorded in the registry |
| Hostname | `https://packed-pie.michaelgarisek.com` |
| Tunnel | `lane-packed-pie` (locally-managed, its own config) |
| Dev unit | `cycleforge-lane@packed-pie.service` |
| Tunnel unit | `cycleforge-lane-tunnel@packed-pie.service` |
| Registry | `~/.config/cycleforge/lanes/packed-pie.env` + `.yml` |
| Logs | `journalctl --user -u cycleforge-lane@packed-pie -f` |

The registry directory **is** the source of truth — systemd reads those `.env`
files natively as `EnvironmentFile`, so there is no second copy to drift out of
sync. `~/Projects/cycleforge-lanes/<name>` is a hard convention rather than a
setting because `WorkingDirectory=` cannot expand an `EnvironmentFile` variable.

## 2 · Why systemd and not tmux

You are SSHing in from different computers, so the lane must not belong to a
shell session:

- it survives your disconnect, and comes back after a reboot (lingering is on);
- `pnpm lanes` gives the identical picture from every machine you connect from;
- `journalctl --user -u cycleforge-lane@<name>` is per-lane history, not scrollback;
- a crash-loop stops after 5 failures in 5 minutes and *says so* in
  `systemctl --user status`, instead of burning CPU quietly.

Two templated units (`ops/systemd/cycleforge-lane@.service` and
`…-tunnel@.service`) are installed once and reused by every lane forever.
`pnpm lane doctor` re-installs them after you edit the templates in the repo.

## 3 · Why each lane gets its own tunnel

`usav-dev` is a **remotely-managed** tunnel: `cloudflared` pulls its ingress from
the Cloudflare dashboard, and that config wins over anything local. It fronts
main on `:3050` and it is main-only per `AGENTS.md`.

A lane instead gets its own **locally-managed** named tunnel plus its own config
file, so its ingress is a local fact and it can never inherit or perturb
`usav-dev`. The explicit `--config` in the unit is load-bearing: without it
`cloudflared` reads `~/.cloudflared/config.yml`, which is `usav-dev`'s.

> **Teardown leaves a DNS record behind.** `cloudflared` can create a route but
> not delete one, so `pnpm lane rm` deletes the tunnel and the worktree and then
> tells you to remove the CNAME in the dashboard. Skip that and the hostname
> serves error 1033 forever.

## 4 · Data is *not* isolated — tenancy is

Every lane, every Vercel preview and production all read the **same Neon
database**. `DATABASE_URL` is a single value spanning Development, Preview and
Production (verified 2026-08-27), and prod and localhost return byte-identical
`/api/orders/queue-counts` from an identical staff roster.

So a lane protects prod from your **code**, and not at all from your **writes**.
The isolation that does exist is tenancy:

```bash
PW_BASE_URL=http://localhost:3071 npx playwright test <spec> --project=qa-desktop
```

`qa-desktop` runs as the QA org (`cycleforge-qa`) with `tests/.auth/qa-admin.json`,
and RLS keeps its writes inside that tenant. The default `desktop` project runs
as the USAV dogfood org — the real data. Reads are safe either way; the moment a
spec packs, voids or stages something, the project flag is what stands between
you and live orders.

Use `localhost`, never `127.0.0.1` — the session cookie is host-scoped, so the
loopback IP gives a false failure on the first probe. Cookies ignore port, so a
session minted against `:3050` works on any lane port.

## 5 · Landing — no branch, ever

`AGENTS.md` forbids branches, so a lane worktree is **detached** at `main`.
`git branch` stays exactly as short as it is today.

`pnpm lane land <name>` refuses to do anything surprising:

1. the lane must be committed (no uncommitted changes);
2. the lane must be *ahead of* main — if main moved, it stops and hands you
   `git -C <lane> fetch origin && git -C <lane> rebase main`, so what lands is
   what your e2e actually ran against;
3. `npm run verify` runs **inside the lane** (`--no-verify` to skip, at your own risk);
4. the MAIN checkout must be clean — other sessions edit that tree, and a
   fast-forward over someone's in-flight work is how their work disappears;
5. `git merge --ff-only <lane sha>` then `git push origin main`. No merge commit,
   no branch, and the pre-push hook runs the full gate again.

## 6 · The repeatable loop

```bash
pnpm lane new packed-pie      # worktree, .env, pnpm install, port, tunnel, units
pnpm lane up packed-pie       # start it (yours to run — agents never do)
```

Build the feature in `~/Projects/cycleforge-lanes/packed-pie`. Preview at
`http://localhost:3071` on this box, or `https://packed-pie.michaelgarisek.com`
from a phone or another laptop. Run its e2e against the lane port. Commit inside
the lane. Then:

```bash
pnpm lane land packed-pie
pnpm lane rm packed-pie
```

Several lanes run at once — each on its own port and hostname, each landing
independently. `pnpm lanes` is the one view that tells you which is which.

## 7 · What this tooling will never touch

`cycleforge-dev.service` (`:3050`) and `cloudflared.service` (`usav-dev`) are the
operator's. `lane up` / `lane down` act only on `cycleforge-lane*@<name>` units.
Nothing here starts, restarts or kills the main dev server or the main tunnel —
that rule is in `AGENTS.md` and it is the reason this tool exists at all.
