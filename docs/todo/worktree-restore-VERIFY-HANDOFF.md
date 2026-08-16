# HANDOFF — Verify worktree restore after accidental `git checkout HEAD -- .`

**Status:** recovery in progress · **Opened:** 2026-08-12 · **Lane:** main  
**Cause:** Agent ran `git checkout HEAD -- .` while recovering from a mass-delete event. That reset **all** uncommitted tracked WIP to HEAD, not only the deleted files. Partial Cursor-History restores followed; some were wrong (older snapshots). Deletions were later force-restored with `git restore --source=HEAD`.

**Paste into the next agent:**

> Read `docs/todo/worktree-restore-VERIFY-HANDOFF.md` and execute §3 checklist end-to-end. Do **not** run `git checkout HEAD -- .` or any broad restore that wipes dirty files. Prefer `git restore --source=HEAD -- <path>` **only for paths that are still deleted**. Preserve dirty WIP. Report a pass/fail table.

---

## 1. Why this happened (do not repeat)

1. Mid-session, `git status` showed hundreds of `D` paths (rules + guard tests). Something else had already deleted/moved them (rules also appeared under `.claude/legacy-rules-archive/`).
2. Agent tried to recover with `git checkout HEAD -- .` — **wrong tool**. That restores deleted files **and** discards every other unstaged modification on tracked files.
3. Agent then pulled some paths from Cursor local History. Several snapshots were **older than HEAD** (ticket chrome, spine seed, etc.) and briefly **regressed** good tree state; those bad restores were reverted to HEAD.
4. Remaining deletions were later cleared with path-scoped `git restore --source=HEAD --worktree --staged -- <paths>` until `git diff --name-only --diff-filter=D HEAD` was empty.

**Hard rule for recovery agents:** never `git checkout HEAD -- .` / `git restore .` on a dirty worktree. Restore **only** deleted paths, one list at a time.

---

## 2. What must still be true after verify

### A. History tracking search fix (this session’s product work) — KEEP

Armed History search must widen lineless placeholders to `zoho_po` and skip Unbox-touch:

| File | Marker |
|---|---|
| `src/lib/receiving/lines/build-sql.ts` | `searchActive` / `sourceInSql` includes `'zoho_po'` when search armed |
| `src/lib/receiving/lines/legacy-route-sql.fixture.ts` | same lockstep |
| `src/lib/receiving/lines/build-sql.test.ts` | test `armed History search includes lineless zoho_po` |
| `src/app/api/receiving-lines/route.ts` | comment mentions armed search + `zoho_po` |

Manual: `/unbox` → History → search `9434608106244428194843` (STN **50340**, carton **51390**, PO `13-15014-22971`) must return a placeholder row.

### B. Ticket bubble chrome (other session — already on HEAD) — DO NOT REGRESS

| Path | Expect |
|---|---|
| `src/components/support/zendesk/chat/ticket-bubble-chrome.ts` | exists; `TICKET_BUBBLE_SHELL`, `TICKET_COMPOSER_PAD` |
| `SupportChatComposer.tsx` | imports `TICKET_COMPOSER_PAD` |
| `SupportTicketDetail.tsx` | imports `TICKET_DETAIL_SURFACE` |
| `MergedRecordStream.tsx` | uses bubble chrome tokens |
| `ticket-chat-displays-gutter.guard.test.ts` | present (was briefly missing) |

Handoff for that work: `docs/todo/ticket-bubble-chrome-propagate-HANDOFF.md` (status: done). If files claim ledger-default again, HEAD was regressed — restore those three from `git show HEAD:…` only if disk is worse than HEAD.

### C. Session-start WIP that Cursor History could re-grow — KEEP if still dirty

These were restored from History when hist size ≥ HEAD and content differed (likely real WIP):

- `src/components/receiving/unbox/UnboxLineWorkspace.tsx`
- `src/components/receiving/workspace/LineEditPanel.tsx`
- `src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx`
- `src/components/shipped/photo-gallery/PhotoLauncher.tsx`
- `src/components/station/entity-context/CartonContextCard.tsx`

### D. Still missing from session-start dirty list (no usable History, or hist was older)

Compare conversation-start dirty set vs current. Paths that are clean vs HEAD and have no better History snapshot include (non-exhaustive): photo API routes, tech/test pages, scan-hotkey / staff-preferences / keyboard WIP, `MergedRecordStream` / `ticket-bubble-chrome` further polish beyond HEAD, `unbox-immediate-paint-HANDOFF.md` edits, etc. **Do not invent.** Recover from Cursor History only when `hist ≠ HEAD` and hist is clearly the newer WIP; otherwise leave HEAD and note the gap.

Cursor History root: `~/Library/Application Support/Cursor/User/History/*/entries.json` (`resource` = `file:///…/cycleforge-app/…`).

### E. Untracked that should remain

- `docs/todo/ticket-bubble-chrome-propagate-HANDOFF.md`
- `docs/todo/scan-station-paint-port-HANDOFF.md`
- `src/lib/queries/unshipped-seed-gate.ts` (+ test)
- `src/lib/queries/ready-to-pack-shell-seed.server.ts`
- `src/lib/photos/queries/receiving-photo-row.ts`
- `.claude/legacy-rules-archive/` (archive copy — rules themselves must live again under `.claude/rules/`)

---

## 3. Checklist (execute in order)

1. **Deletions empty**
   ```bash
   git diff --name-only --diff-filter=D HEAD
   # expect: empty
   test -f .claude/rules/source-of-truth.md
   test -f .claude/rules/workflow-safety.md
   test -f src/components/support/zendesk/chat/ticket-chat-displays-gutter.guard.test.ts
   ```
   If any deleted: `git restore --source=HEAD --worktree --staged -- <path>` only.

2. **History-search markers present**
   ```bash
   rg -n "searchActive|sourceInSql" src/lib/receiving/lines/build-sql.ts src/lib/receiving/lines/legacy-route-sql.fixture.ts
   rg -n "armed History search includes lineless zoho_po" src/lib/receiving/lines/build-sql.test.ts
   ```

3. **Ticket chrome not regressed**
   ```bash
   rg -n "TICKET_COMPOSER_PAD" src/components/support/zendesk/chat/SupportChatComposer.tsx
   rg -n "TICKET_DETAIL_SURFACE" src/components/support/zendesk/chat/SupportTicketDetail.tsx
   rg -n "TICKET_BUBBLE_SHELL" src/components/support/zendesk/chat/ticket-bubble-chrome.ts
   ```

4. **Unit test for History fix**
   ```bash
   node --test --require ./scripts/register-server-only-shim.cjs --import tsx --test-reporter spec \
     src/lib/receiving/lines/build-sql.test.ts
   ```

5. **Optional: rebuild session-start dirty inventory**  
   Diff conversation-start `git_status` list against `git status -sb`. For each CLEAN path that was previously `M`, search Cursor History; restore only when hist SHA ≠ HEAD SHA and hist looks like the lost WIP (prefer larger / later timestamp). Log skips.

6. **Verify**
   ```bash
   npm run verify -- --fast
   npm run verify   # full gate before done
   ```

7. **Report** a table: path · expected · actual · pass/fail. Call out any session-start WIP that is still unrecoverable.

---

## 4. Never again

- `git checkout HEAD -- .`
- `git restore .` / `git checkout -- .` on a dirty tree
- Restoring Cursor History when hist size ≪ HEAD without reading the diff
- `git stash` (repo law)

---

## 5. Done when

- Zero deleted tracked paths vs HEAD  
- History-search fix + tests green  
- Ticket bubble chrome imports intact  
- `npm run verify` green (or only pre-documented unrelated advisory failures)  
- Handoff updated with any permanently lost WIP list  
