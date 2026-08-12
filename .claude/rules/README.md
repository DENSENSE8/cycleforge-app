# Rules (post governance reset)

Active agent law lives in root **`AGENTS.md`**. Historical rule prose was archived
to **`.claude/legacy-rules-archive/`** on 2026-08-12 (controlled burn).

Do not restore archived files into the always-on prompt. Prefer:

1. `AGENTS.md` hard laws + region/SoT tables
2. `node scripts/sot-lookup.mjs "<job>"` (indexes `sot-manifest.json`)
3. Live code under `src/design-system/` and named hosts in `AGENTS.md`
