# design-mcp — CycleForge

Serves this repo's design system to any MCP-capable agent via `.mcp.json` at
the repo root (a real file; the old `.cursor/mcp.json` symlink is gone). A new
agent session must show `design-mcp` in its MCP list and must have
`ds_contract` / `ds_tokens` / `ds_critique` in its tool catalog.

| Question | Wrong answer it reaches for | Tool |
|---|---|---|
| What already exists for this job? | writes a new primitive | `ds_contract` |
| What values may I use on **one** axis? | `#1a1a1d`, `text-[13px]`, `axis: "all"` | `ds_tokens` (`axis` required) |
| Is the canonical table still one industrial instrument? | split by line count, add a page toolbar slot | `ds_data_table` |
| How does the pasted industrial brief enter this system? | copy its palette, component or spring literals | `ds_industrial_translation` |
| Why is this component bad? | rewrites it from scratch | `ds_critique` |

## When the agent catalog is empty

Some harnesses lease project MCP servers without surfacing their tools. The CLI
runs the same handlers:

`node tools/design-mcp/ds.mjs contract|tokens|critique …`

design-mcp is an opt-in lookup, not a write gate. The session-stamp receipt and
every hook that enforced it were removed 2026-09-22 along with the `.cursor`
tree.

## Naming (pinned)

- Omni Composer / station mouth → **StationComposerHost**
- Raw `OmnichannelComposerDock` alone → incomplete mouth
- Dumb / gun station → `showModeFaces={false}` (keep context ring); never
  `showModeRow={false}` to hide Unbox|Ticket

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
`DeskPageLayout` a page mounts to wear the desk frame — and `src/components/labels`
(the print-faithful 2×1" sticker + slot overlay; matched files only, the walk
is still non-recursive). The frame itself
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
`ds_data_table` is the exception: it returns the versioned verdict from the
shared TypeScript-AST adjudicator used by the guard, tests, and eval cohort.

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
