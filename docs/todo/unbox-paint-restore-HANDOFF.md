# WITHDRAWN — the `/unbox` paint work was never lost; it lives in another lane

**Do not act on this file as a restore plan.** It is kept only so the false alarm
is on the record with its cause.

## What actually happened

This repo is driven by **GitButler virtual branches**. The working tree swaps
wholesale when a lane is applied or unapplied — and from inside a session that is
indistinguishable from someone running `git checkout .` on your files.

Over one session the tree presented three states:

1. **Lane A (session start, HEAD `bde439476`)** — the `/unbox` immediate-paint
   work, uncommitted.
2. **Lane B (HEAD `ace38c6c3` → `121e5264a`)** — a different lane. The paint edits
   were absent, `ssr: false` was back on the LCP surface, and the paint guards
   were gone. I read that as "the work was discarded", searched `git stash` /
   `reflog` / dangling commits, found nothing, and wrote this file as a restore
   plan.
3. **Lane A again (HEAD back to `bde439476`)** — everything present:
   `seededWorkspace` ×10, `toWireRows` ×4, `initial={false}`, the park predicate,
   and `ssr: false` correctly scoped to `UnboxWorkspaceView` only.

Nothing needed restoring. `unbox-immediate-paint-HANDOFF.md` describes the tree
you get in lane A, and it is accurate there.

## The lesson worth keeping

**Absence of a change in this tree is not evidence it was destroyed — check the
lane first.** `git log --oneline -1` is the cheap tell: if HEAD is not the commit
you started on, you are looking at different content, and greps for "is my work
still here" will lie. `git stash list` / `reflog` / `fsck` cannot find lane
content, because it was never in this lane's object graph.

Corollary for any long-running session here: re-check HEAD before concluding
anything about missing work, and again before reporting it.

## What is true regardless of lane

- The `/test` (Ready to Pack) paint port is present in both lanes — the seed
  modules, the gate, the `x-search` header, the `formFactor` pin. Its findings
  live in [`scan-station-paint-port-HANDOFF.md`](scan-station-paint-port-HANDOFF.md).
- The governance burn (`121e5264a`) really did delete 275 `*.guard.test.ts`,
  including `tier1-paint-order.guard.test.ts` — the one that made "no `ssr: false`
  on a declared LCP surface" a build failure rather than a paragraph. In whichever
  lane that burn lands, nothing enforces the paint order any more.
