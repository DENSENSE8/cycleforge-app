# design-mcp — CycleForge

Serves this repo's design system to any MCP-capable agent. Cursor reads
`.cursor/mcp.json`; Claude Code reads `.mcp.json`, which is a symlink to the
same file. A new agent session must show `design-mcp` green in Settings → MCP
and must have `ds_contract` / `ds_tokens` / `ds_critique` in its tool catalog.

| Question | Wrong answer it reaches for | Tool |
|---|---|---|
| What already exists for this job? | writes a new primitive | `ds_contract` |
| What values may I use on **one** axis? | `#1a1a1d`, `text-[13px]`, `axis: "all"` | `ds_tokens` (`axis` required) |
| Why is this component bad? | rewrites it from scratch | `ds_critique` |

## When the agent catalog is empty

Cursor sometimes leases project MCP servers but never surfaces their tools to
the agent (only marketplace `plugin-*` namespaces appear). Close that gap with:

1. **CLI (same handlers):** `node tools/design-mcp/ds.mjs contract|tokens|critique …`
2. **Cursor plugin path:** `tools/design-mcp/cursor-plugin/` — loaded via
   `.cursor/hooks` `workspaceOpen` (`pluginPaths`) and symlinked under
   `~/.cursor/plugins/local/cycleforge-design-mcp`
3. **Hooks:** `sessionStart` injects the dumb-station mouth recipe; `preToolUse`
   denies UI writes without a fresh `.cursor/design-mcp-session.json` stamp

## Naming (pinned)

- Omni Composer / station mouth → **StationComposerHost**
- Raw `OmnichannelComposerDock` alone → incomplete mouth
- Dumb / gun station → `showModeFaces={false}` (keep context ring); never
  `showModeRow={false}` to hide Unbox|Ticket
- Feedback / reaction / receive confirm on the mouth → **WeldedFeedbackPanel**
  (`src/components/composer/WeldedFeedbackPanel.tsx`, catalog home **staff mouth reaction**).
  Mount on `StationComposerHost` `reaction`. `ds_contract "staff reaction on the composer"`.
  Staff look at the mouth all day for what just happened and what to process next.
  Do not fork a caption band. Dockless action feedback stays `InlineActionFeedbackCard`.

## The contract is derived, not written

Garisek's equivalent server reads a hand-curated pin map with a `useWhen` /
`doNot` sentence per entry. CycleForge layers curated prose from
`src/design-system/pinned.json` onto a walk of real primitives. An absent key
means **nobody has written that law yet** — not that anything is permitted.

`ds_tokens` requires `axis` (`color` · `radius` · `spacing` · `typography` ·
`z-index` · `elevation` · `border` · `focus` · `station-skin` · `station-depth` ·
`item-record`). There is no dump. The same slices
are also MCP resources at `design://tokens/<axis>` — browse those; pass `filter`
on the tool when you already know the name. After changing a token file, run
smoke and the axis unit test, then `code-graph` `find_symbol` + `impact_analysis`
on the role function (`cornerClass`, `elevationClass`, `focusRing`,
`applyStationSkin`). Scan-station materials are **not** hexes on Unbox: they are
rows in `src/design-system/themes/station-skins.ts`, served on the `station-skin`
axis.

## Primitive homes

`src/design-system/primitives` is ops chrome (the CTA Button). `src/components/ui`
holds two kinds of file, labelled separately:

- **shadcn primitive (new-york, house tokens)** — twelve files (`button`, `input`,
  `label`, `checkbox`, `badge`, `alert`, `skeleton`, `separator`, `dialog`,
  `command`, `popover`, `calendar`). New composed / 21st.dev work starts here.
- **ui composite (house)** — CopyChip, FilterMenu, and the rest.

Two Buttons is two jobs, not a choice: ops CTA → design-system `Button`;
shadcn-lane chrome → `@/components/ui/button`. Pin keys are **filename ids**
(`badge`, not `Badge`) or they never merge.

Four homes sit outside those two because the thing an agent needs to find lives
there: `src/components/tables` (the one table engine), `src/lib/tables` (its slot
kernel, three files), `src/components/composer`, `src/components/desk` — the
`DeskPageLayout` a page mounts to wear the desk frame — `src/components/labels`
(the print-faithful 2×1" sticker + slot overlay; matched files only, the walk
is still non-recursive), and `src/components/composer/WeldedFeedbackPanel.tsx`
(staff mouth reaction — catalogued separately from other composer surfaces). The frame itself
(`DeskPageChrome`) is catalogued from `src/design-system/components`; its adapter
cannot live there because it reads `SIDEBAR_PAGE_NAV` and `AuthContext`, and the
system must not import the app's spine.

**The walk is a non-recursive `readdirSync` per home.** A component in a
subdirectory is never catalogued, so it is law no agent can reach — which is why
the desk chrome is flat in `components/` rather than in a `desk/` folder. If you
add a nested primitive, either flatten it or the walk has to change.

## No ds_adjudicate, deliberately

Garisek's version shares a rule module with a PreToolUse hook, so its verdict is
the same verdict that blocks a write. This repo has no such module. A tool
returning "allowed" while nothing enforces anything would be worse than absent —
it manufactures confidence. **ESLint is the gate here.** When a shared
adjudicator exists, `server.mjs` is where it plugs in.

Everything `ds_critique` reports is heuristic text matching, not AST proof.

## Verify

```bash
node tools/design-mcp/smoke.mjs   # stdio JSON-RPC: axes, resources, critique per-axis fixes
```

The variant extractor has been wrong twice: it once anchored on the
`BUTTON_VARIANTS` **import** rather than its declaration, and it once understood
only the cva shape. Smoke asserts **named** variants (`primary`/`ghost`/`danger`),
not a frozen count of 9.

`ds_critique` names the `ds_tokens` axis on each literal (not a generic
`var(--token)`). Plant `tools/design-mcp/fixtures/token-literal-violation.tsx`
if that ever regresses.

## Engine in Garisek-OS, law here (2026-09-02, gap report §G)

`server.mjs` is now a shim: it sets `DESIGN_MCP_PROJECT=cycleforge-app` and
imports Garisek-OS `tools/design-mcp/server.mjs`, whose `project-server.mjs`
runs the profile-driven engine (`target-engine.mjs` — the former body of this
file with every hardcoded path replaced by a field of
[`design-mcp.profile.json`](design-mcp.profile.json)). `.cursor/mcp.json`
launches Garisek's `run-mcp.sh` directly with the same env. `ds.mjs`,
`smoke.mjs` and the session hooks are unchanged.

What stays in this repo and is read by path: `src/design-system/pinned.json`,
the four cohort modules, the generated `router.json`, and the profile
(primitive homes, token sources, cohort workspaces, triage / center-lock
lists, and `adjudicator.baseRules` — the Garisek rule ids adopted here;
`no-new-component` is deliberately not adopted, its escape is the
`cohort.append_row` ask).

`ds_adjudicate` is available again: every `router.json` `refuse[]` entry with
a `diffPattern` is a Garisek adjudicator rule scoped to that route's
`engineFiles`, and the SAME rules run as the write gate on both hosts
(`.cursor/hooks/pretool-adjudicate.sh` → Garisek `adjudicate-hook.mjs --cursor`;
`.claude/settings.json` → the same script). Closed on rules, open on
infrastructure, logged to Garisek's `design-guard.jsonl` with `project`.
