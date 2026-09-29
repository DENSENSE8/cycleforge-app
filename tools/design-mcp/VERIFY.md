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

## 1. Smoke is the contract, not a commit SHA

```bash
node tools/design-mcp/smoke.mjs
```

Expect **smoke: all good**, exit 0. Do **not** treat a historical SHA
(`3877536a7`, `437e8bb83`) as HEAD — those were the first landing; the live
server has grown. The first assertion — "every stdout line is valid JSON-RPC" —
is the one that matters most. An MCP server that prints a diagnostic to stdout
corrupts the stream.

**Trap:** `tools/design-mcp/node_modules/` must NOT be committed.
`git ls-files tools/design-mcp | grep node_modules` must be empty.

## 2. `ds_tokens` refuses a dump

Smoke already covers this. Confirm by reading `smoke.mjs`: there are calls with
no `axis` and with `axis: "all"`, and both must be `isError` with `requires axis`.
A `ds_tokens` result whose `tokens` array mixes axes is a `FAIL`.

Each advertised axis (`color`, `radius`, `spacing`, `typography`, `z-index`,
`elevation`, `border`, `focus`, `station-skin`, `item-record`) must return `count > 0`. A missing TypeScript
file must throw, never `"0 tokens"`.

Scan-station skins are a **separate axis** from colour. `ds_tokens({ axis: "station-skin" })`
must list `applyStationSkin('porcelain')` (and peers) plus `--ds-station-well`, sourced from
`src/design-system/themes/station-skins.ts`. Values on that axis must never contain a `#hex`
(character fills stay in the catalog file; leaking them is how agents paste wood hex onto Unbox).
`ds_contract("scan station theme skin porcelain packing bench")` must rank `station-skins` first.

Colour `value` fields must never contain a `#hex`. That check is **vacuous**
unless a planted hex fails it. Smoke spawns a second server with
`DESIGN_MCP_PLANT_HEX=1`, which injects `#1a1a1d` and skips the scrubber.
Confirm `smoke.mjs` asserts both:

- `colour values never include a hex` (production)
- `a planted hex fails that same predicate` (the plant is visible)

If the plant assertion is missing, mark P2 **FAIL** even when production values
are clean. A CSS-only radius reader that returns 0 tokens is also a **FAIL** —
radius lives in `src/design-system/tokens/radius.ts`. Smoke must show
`radius.ts` in `sources` and a `COMPOSER_SHELL_CORNER` row. Composer inner
corners are named literals (`VisibilityToggle` default), not `cornerClass()`.

Radius rows must include `cornerClass('surface')`. Elevation rows must include
`elevationClass('flat')` / `'raised'` / `'overlay'` and must **not** invent
`elevationClass('soft')`.

## 3. Registered for auto-discovery

```bash
python3 -c "import json; print(list(json.load(open('.mcp.json'))['mcpServers']))"
```

Expect `design-mcp` alongside `motion` and `code-graph`. `.mcp.json` is a real
file at the repo root. The `design-mcp` command is the **mise node shim** plus
`tools/design-mcp/server.mjs` — not `run-mcp.sh`: a harness spawns without a
login shell, and a PATH-dependent wrapper is how the catalog goes empty.

If a harness does not surface the tools, use the CLI — same handlers:
`node tools/design-mcp/ds.mjs contract|tokens|critique …`. The shared
agent-contract door also consumes this repo's `contractPreflight` profile: its
first matching UI write must be denied with live `ds_contract` matches and its
immediate retry must pass on the file-scoped receipt.

```bash
./tools/design-mcp/run-mcp.sh </dev/null 2>&1 | head -2
node tools/design-mcp/ds.mjs contract "dumb station scan mouth" | head -c 200
```

Must print nothing on stdout and `cycleforge-design-mcp: ready` on stderr for
`run-mcp.sh`. CLI must rank `StationComposerHost` first for the dumb-station
intent.

## 4. The variant extractor — plant a regression

This is the part that has been wrong **twice**, in opposite directions, so verify
it by **named variants**, not by a frozen count of 9.

Open `smoke.mjs`. The Button check must require `primary`, `ghost`, and `danger`
on the design-system Button, and `ghost` + size `sm` on the ui `button`. It must
**not** compare to a literal `9` / `6` / `4` — those went stale and taught
people to ignore the server.

**Now plant a regression.** In `server.mjs`, change the declaration anchor regex
so it matches `_VARIANTS` anywhere rather than at a declaration:

```js
// find:  const decl = variantSource.match(/(?:const|let|var)\s+\w*VARIANTS\w*\s*(?::[^=]*)?=\s*\{/)
// break: const decl = variantSource.match(/_VARIANTS/)
```

Re-run the smoke test. It **must fail** on "flat variant map read" — because that
anchor also matches Button.tsx's own *import* line and sends the brace-matcher
into the import braces. Restore the line and confirm smoke is green again.

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
pointing outward. All three must refuse. Smoke already plants
`src/shell/__ds_smoke_link.tsx` → `/etc/passwd`.

## 6. ds_critique finds something real, and stays quiet where it should

Run it against `src/shell/SessionComposer.tsx` (not `AssistantFeed.tsx` — that
file is gone). Expect at least one `forks-the-system` problem (a raw `<button>`
where the design system has `Button`) with a **line number that actually
contains a `<button`** — open the file at that line and confirm. A plausible
line number that points at something else is a `FAIL`.

Then run it against `src/design-system/primitives/Button.tsx`. Expect **zero**
`forks-the-system` problems — fork detection is deliberately off inside the
primitive homes, because a raw `<button>` there IS the primitive, not a fork of
it. If it flags itself, the carve-out is broken.

Plant `tools/design-mcp/fixtures/token-literal-violation.tsx` is already in
tree. Critique it. Each problem must name its `axis` (`color`, `typography`,
`radius`, `z-index`) and the **role call** (`var(--ds-color-…)`, `text-role-*`,
`cornerClass`, `z-modal`). A generic `use var(--token)` fix is a `FAIL`.

## 7. Claims that should NOT verify

Confirm these are still true. If any now succeeds, the report is out of date:

- **There is no `ds_adjudicate` tool.** `tools/list` returns exactly three:
  `ds_contract`, `ds_tokens`, `ds_critique`. This repo has no shared rule module
  for a verdict tool to borrow from, and a tool answering "allowed" while nothing
  enforces anything manufactures confidence. ESLint is the gate here.
- **`src/design-system/pinned.json` exists** and `ds_contract` returns
  `curated_entries > 0`.   `TriageScrollLayout`, `TriageScrollKnobs`, `VisibilityToggle`, and
  `useOptimisticMutation` must carry `useWhen` / `doNot`. The twelve shadcn
  filename ids (`button`, `input`, `label`, `checkbox`, `badge`, `alert`,
  `skeleton`, `separator`, `dialog`, `command`, `popover`, `calendar`) plus
  `CopyChip` and `calendar-range-select` must also be pinned. A `"Badge"` key does **not** merge onto `badge.tsx`. Absence of an
  *unlisted* id still means nobody has written that law — not that anything is
  permitted. A verifier reporting `curated_entries: 0` is reading a stale prompt.
- **Ops Button and shadcn `button` are both reported**, with different homes
  (`design-system primitive` vs `shadcn primitive`). `ds_contract("shadcn dialog")`
  ranks `dialog` first; `ds_contract("copy chip …")` ranks `CopyChip`. The server
  does not import 21st.dev — those arrive one file at a time after they exist in
  the repo.
- **`ds_critique` itself does not block a UI write.** The shared PreToolUse
  door does: for paths declared by `contractPreflight`, it queries the live
  `ds_contract` handler, denies once with the matched patterns, then admits the
  retry on a short-lived receipt. This is a workflow gate; it does not infer
  behavior by grepping TypeScript source.
- **MCP resources are mirrors, not a second SoT.** `resources/list` returns
  `design://tokens/<axis>` for each of the eight axes. Reading
  `design://tokens/radius` must match `ds_tokens({ axis: "radius" })` roles.
  There is no checked-in JSON token tree.

## 8. Things deliberately not done — confirm they are still not done

- No fourth tool (`get_token`, `search_tokens`, DTCG alias resolver, design-only
  knowledge graph). Polymorphism is inside `ds_tokens.axis` and inside each
  critique problem's `axis` field.
- Colour hex resolution is refused: `ds_tokens({ axis: "color" })` values are
  `"per theme"` / `"per staff accent"`, never `#1a1a1d`.
- Cloud agents still cannot see this stdio server. Do not report that as fixed.

## Final report

One table: item, `PASS`/`FAIL`/`UNVERIFIED`, and the single piece of evidence you
relied on. Then list anything you could not check and why. Do not summarise
favourably — if the work is 80% verified and 20% unverifiable, say exactly that.
