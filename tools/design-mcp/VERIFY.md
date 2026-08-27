# Verification prompt — CycleForge design-system MCP

Paste everything below the line into a fresh agent session, run from
`~/Projects/cycleforge-app`. It is written to be **adversarial**: the goal is to
catch a false claim, not to confirm a true one.

---

You are verifying another agent's work on a design-system MCP server. **Assume it
is wrong or overstated.** Your job is to disprove each claim. Report `PASS`,
`FAIL` or `UNVERIFIED` per item, each with the command output you relied on.
Never mark `PASS` because something looks plausible — only because you ran it and
read the result.

Rules for this audit:

- A README claim is not evidence. Run the thing.
- Where a check says "plant a violation", actually plant it, watch it fail, then
  remove it and watch it pass. A check that has never failed is not known to work.
- Report `UNVERIFIED` honestly rather than guessing.
- **Do not print secrets.** Check that variables exist; never echo values.
- Scope is `~/Projects/cycleforge-app` only. A sibling repo `~/Projects/Garisek-OS`
  has a *different* design-system MCP; do not conflate them or copy findings across.

## 1. The commits

```bash
git log --oneline -2
```

Expect `437e8bb83` (primitive count correction) on top of `3877536a7` (the
server). Confirm each diff does what its subject says:

```bash
git show --stat 3877536a7
```

Seven files: `.mcp.json`, and under `tools/design-mcp/` — `.gitignore`,
`README.md`, `package.json`, `package-lock.json`, `run-mcp.sh`, `server.mjs`,
`smoke.mjs`.

**Trap:** `tools/design-mcp/node_modules/` must NOT be committed (~any size).
`git ls-files tools/design-mcp | grep node_modules` must be empty.

## 2. It actually boots and speaks JSON-RPC

```bash
node tools/design-mcp/smoke.mjs
```

Expect **11 assertions, all ok**, ending `smoke: all good`, exit 0.

The first assertion — "every stdout line is valid JSON-RPC" — is the one that
matters most. An MCP server that prints a diagnostic to stdout corrupts the
stream and every client sees a dead server, while the handlers themselves test
green. If that line ever fails, nothing else in this file is meaningful.

## 3. Registered for auto-discovery

```bash
python3 -c "import json;print(list(json.load(open('.mcp.json'))['mcpServers']))"
```

Expect `design-mcp` present alongside `motion`, `motion-plus`, `code-graph`,
`figma`. Its command must be `./tools/design-mcp/run-mcp.sh`.

```bash
./tools/design-mcp/run-mcp.sh </dev/null 2>&1 | head -2
```

Must print nothing on stdout and `cycleforge-design-mcp: ready` on stderr.

## 4. The variant extractor — plant a regression

This is the part that has been wrong **twice**, in opposite directions, so verify
it with exact numbers rather than "looks reasonable".

Ground truth, confirmed by reading source:

| Component | Shape | Expected |
|---|---|---|
| `src/design-system/primitives/Button.tsx` | flat map in `button-variants.ts` | **9** variants: primary, primarySoft, brand, secondary, ghost, danger, warning, success, execute |
| `src/components/ui/button.tsx` | cva | **6** variants × **4** sizes |

The smoke test asserts both as exact counts. Confirm those assertions are real
and not tautological — open `smoke.mjs` and check they compare to `9`, `6` and
`4` literally, not to whatever the server returned.

**Now plant a regression.** In `server.mjs`, change the declaration anchor regex
so it matches `_VARIANTS` anywhere rather than at a declaration:

```js
// find:  const decl = variantSource.match(/(?:const|let|var)\s+\w*VARIANTS\w*\s*(?::[^=]*)?=\s*\{/)
// break: const decl = variantSource.match(/_VARIANTS/)
```

Re-run the smoke test. It **must fail** on "flat variant map read exactly (9)" —
because that anchor also matches Button.tsx's own *import* line and sends the
brace-matcher into the import braces, reporting zero variants. Restore the line
and confirm 11/11 returns.

If the smoke test still passes with that break in place, the assertion is
vacuous and the whole extractor is unverified.

## 5. Path containment

```bash
node -e "
const {spawn}=require('child_process');const p=spawn('./tools/design-mcp/run-mcp.sh');
p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'v',version:'1'}}})+'\n');
p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'ds_critique',arguments:{file_path:'../Garisek-OS/package.json'}}})+'\n');
setTimeout(()=>{p.kill();},3000);
p.stdout.on('data',d=>process.stdout.write(d));
"
```

The `ds_critique` response must be `isError: true` with "refusing to read outside
the repo". Try two more: `/etc/passwd` and a symlink you create inside the repo
pointing outward. All three must refuse.

## 6. ds_critique finds something real, and stays quiet where it should

Run it against `src/shell/AssistantFeed.tsx`. Expect at least one
`forks-the-system` problem (a raw `<button>` where the design system has
`Button`) with a **line number that actually contains a `<button`** — open the
file at that line and confirm. A plausible line number that points at something
else is a `FAIL`.

Then run it against `src/design-system/primitives/Button.tsx`. Expect **zero**
`forks-the-system` problems — fork detection is deliberately off inside the
primitive homes, because a raw `<button>` there IS the primitive, not a fork of
it. If it flags itself, the carve-out is broken.

## 7. Claims that should NOT verify

Confirm these are still true. If any now succeeds, the report is out of date:

- **There is no `ds_adjudicate` tool.** `tools/list` returns exactly three:
  `ds_contract`, `ds_tokens`, `ds_critique`. This repo has no shared rule module
  for a verdict tool to borrow from, and a tool answering "allowed" while nothing
  enforces anything manufactures confidence. ESLint is the gate here.
- **`src/design-system/pinned.json` does not exist**, so `ds_contract` returns
  `curated_entries: 0` and no `useWhen` / `doNot` on any match. That absence
  means *nobody has written the law yet* — NOT that anything is permitted. A
  verifier reporting curated rules has found a file that should not be there.
- **Two primitive homes both exist and are both reported** — 36 `.tsx` in
  `src/design-system/primitives`, 16 in `src/components/ui`, including two
  different Buttons with different variant surfaces. The server does not resolve
  that duplication and must not claim to.
- **Nothing here blocks a write.** All `ds_critique` output is heuristic text
  matching. There is no PreToolUse hook in this repo.
- **`tests/visual/shell-baseline.spec.ts` is UNCOMMITTED and has never run.**
  It needs a signed-in `storageState` that does not exist. Do not report the
  composer's ONE ROW law as enforced.

## 8. Things deliberately not done — confirm they are still not done

- No CSS → Tailwind migration was performed. `src/shell/shell.css` should still
  be ~1,077 lines. Confirm `git log --oneline -- src/shell/shell.css | head -3`
  shows no migration commit from this work.
- `sot-lookup` / `sot-manifest.json` remain absent from `main` — they exist only
  in the worktree `.claude/worktrees/wf_febe0ee4-70c-1`, on an unmerged branch,
  and `src/lib/sot-manifest/` in main is an empty directory. Verify rather than
  assume; if they are now in main, someone merged that branch.

## Final report

One table: item, `PASS`/`FAIL`/`UNVERIFIED`, and the single piece of evidence you
relied on. Then list anything you could not check and why. Do not summarise
favourably — if the work is 80% verified and 20% unverifiable, say exactly that.
