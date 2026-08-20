# Rules — on-demand depth

**Read the file your task touches. None of this is loaded for you.**

Always-on law lives in root [`AGENTS.md`](../../AGENTS.md) and
[`.claude/rules/`](../../.claude/rules/); this tree is the depth behind it.

| Touching… | Read |
|---|---|
| Any UI surface — which region contract, which primary surface | [`contextual-display.md`](contextual-display.md) |
| Tokens: type · spacing · color · focus · icons · one-row anatomy | [`ui-design-system.md`](ui-design-system.md) |
| "What is the SoT for job X?" | `node scripts/sot-lookup.mjs "<job>"`, then [`source-of-truth.md`](source-of-truth.md) |
| A scan bench (Unbox · Arrival · Testing · Pack · Shipping) | [`display/station.md`](display/station.md) · [`display/unbox-station.md`](display/unbox-station.md) · [`display/station-workbench.md`](display/station-workbench.md) |
| A desk queue / spreadsheet | [`display/workbench.md`](display/workbench.md) · [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md) |
| A right-edge panel | [`display/right-rail-inspector.md`](display/right-rail-inspector.md) |
| Animation | [`display/motion-crossfade.md`](display/motion-crossfade.md) |
| A new polymorphic / typed-fact table | [`polymorphic-tables.md`](polymorphic-tables.md) |
| Everything else | browse [`display/`](display/) |

`sot-lookup` indexes `AGENTS.md` + code symbols, **not** these files — it will
miss prose-only rows (e.g. "grid column justification"), so fall back to
[`source-of-truth.md`](source-of-truth.md) when it comes back empty.
