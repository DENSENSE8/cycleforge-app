---
name: new-ui-surface
description: Use before building or reshaping any UI component, popout, panel, row or page surface — asks the design system what already exists (ds_contract), then either composes it or builds new and pins it.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# New UI surface

New components are welcome — the codebase is young (AGENTS.md §3: build fast,
prove it in the app, pin it when it is good). What this skill prevents is the
SECOND copy of something that already exists.

## 1. Ask first — one call, by the JOB, not the name you would give it

```bash
node tools/design-mcp/ds.mjs contract "<what it does, in plain words>"
```

(or the `ds_contract` MCP tool). Read `useWhen` / `doNot` / `law` of the top
matches. For a value on one axis (corner, colour, spacing, type):
`node tools/design-mcp/ds.mjs tokens <axis>`. The contract only walks the
primitive homes; for anything built inside a domain folder also run
`node "$HOME/Projects/Garisek-OS/tools/code-graph/cg.mjs" search "<the job>" --project cycleforge-app`.

## 2. Compose or build

- **A match fits** → compose it. Its `doNot` is the law; follow it.
- **A match almost fits** → extend that component (a prop, a variant), do not fork it.
- **Nothing fits** → build it. Then:
  - corners, surfaces, ink and label voice from the mode utilities
    (`rounded-mode-*`, `bg-mode-*`, `text-mode-*`, `mode-label`) — never a literal
    radius or hex;
  - disclosure follows the ladder in `src/design-system/DESIGN_SYSTEM.md`
    ("Disclosure ladder"): the row shows the What; hover/Space = read-only
    glance (`HoverTooltip`); click/Enter = anchored list with inline row
    actions (`AnchoredLayer` / house `Popover`); Enter/scan = the record
    (`DeskRecordPlane`); Esc returns focus to what opened the layer.

## 3. Pin it once a second place uses it

Add an entry to `src/design-system/pinned.json` keyed by the component's
FILENAME id: `useWhen` (the words an agent would search with), `doNot` (the
fork it prevents), `law` (file path + who decided, dated). From then on
`ds_contract` returns it.

## Checks

`npx eslint <files> --quiet` · `npx tsc --noEmit -p tsconfig.json` (filter to
your files) · `pnpm verify:fast` before calling it done.
