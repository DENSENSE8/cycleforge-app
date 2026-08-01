# url-param-isolation

Portable skill for stopping query-param leaks when operators switch modes or surfaces.

## What it does

Teaches agents to **construct** destination URLs from a declared param set and **parse** at a per-route schema boundary — instead of copying the current search string and denylist-deleting keys. Route segments are called out as layout/remount tools, **not** isolation.

## When to use it

- Adding or changing mode / surface navigation
- Declaring or auditing query-param ownership
- Cross-surface URL hygiene (shared keys like `open`, `q`, `sort`)
- Debugging params that "follow" the user between modes or pages
- Replacing `MODE_SCOPED_*` / `stripCrossSurface*` denylists with specs

## Installation

Copy this folder into your project's skills directory (e.g. `.claude/skills/url-param-isolation/`), or reference `SKILL.md` from your agent skill loader. No runtime dependencies beyond whatever schema library you already use (Zod-style examples in the skill).

## Contents

| File | Role |
|------|------|
| `SKILL.md` | Portable contract + generic TypeScript patterns |
| `reference/examples.md` | Cycle Forge worked examples (paths are illustrative, not requirements) |

## Credits

Extracted from Cycle Forge's nav/routing isolation work (construct-don't-copy + per-route param schemas + ownership guards), including the trap where fixing only a surface `updateMode` hook left the master-nav path leaking.
