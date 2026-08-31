# design-mcp — CycleForge

Serves this repo's design system to any MCP-capable agent. Cursor reads
`.cursor/mcp.json`; Claude Code reads `.mcp.json`, which is a symlink to the
same file. A new agent session must show `design-mcp` green in Settings → MCP
and must have `ds_contract` / `ds_tokens` / `ds_critique` in its tool catalog.

| Question | Wrong answer it reaches for | Tool |
|---|---|---|
| What already exists for this job? | writes a new primitive | `ds_contract` |
| What values may I use? | `#1a1a1d`, `text-[13px]` | `ds_tokens` |
| Why is this component bad? | rewrites it from scratch | `ds_critique` |

## The contract is derived, not written

Garisek's equivalent server reads a hand-curated pin map with a `useWhen` /
`doNot` sentence per entry. This repo has no such file, and its primitives carry
no docblocks to derive those sentences from — `Button.tsx` opens straight into
imports. Writing 56 `doNot` rules from outside would be inventing law and
serving it with authority.

So `ds_contract` reports what the repo can **prove**: every primitive that
exists, where it lives, its real variant options read out of source, and the
interaction states it declares. Curated prose layers on top from
`src/design-system/pinned.json` when that file exists. It is optional, starts
absent, and grows one justified entry at a time.

An absent `useWhen` means **nobody has written the law yet** — not that anything
is permitted.

## Two primitive homes

`src/design-system/primitives` (36 `.tsx`) and `src/components/ui` (16) both hold
primitives — there are two Buttons. That duplication is a real open question and
this server does **not** resolve it: it reports both, labelled, so an agent sees
the choice instead of picking whichever it grepped first.

## No ds_adjudicate, deliberately

Garisek's version shares a rule module with a PreToolUse hook, so its verdict is
the same verdict that blocks a write. This repo has no such module. A tool
returning "allowed" while nothing enforces anything would be worse than absent —
it manufactures confidence. **ESLint is the gate here.** When a shared
adjudicator exists, `server.mjs` is where it plugs in.

Everything `ds_critique` reports is heuristic text matching, not AST proof.

## Verify

```bash
node tools/design-mcp/smoke.mjs   # 11 assertions over real stdio JSON-RPC
```

The variant extractor has been wrong twice and both cases are pinned as exact
counts: it once anchored on the `BUTTON_VARIANTS` **import** rather than its
declaration (reporting the flagship primitive as having zero variants), and it
once understood only the cva shape, missing flat maps entirely.
