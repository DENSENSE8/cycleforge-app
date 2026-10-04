---
description: Run repo tool binaries directly — never npx tsc/tsx/eslint/playwright or bare tsc --noEmit
condition:
  - '\bnpx\s+(?:-{1,2}\S+\s+)*(?:tsc|tsx|eslint|playwright)\b'
  - '(?<![\w./-])tsc\b[^;&|\n"]*--noEmit'
scope:
  - 'tool:bash'
---
`npx` resolves/downloads outside the lockfile and bare `tsc --noEmit` misses the repo's typecheck config. Use the pinned repo binaries:

- typecheck → `node scripts/typecheck.mjs`
- fast gate before calling work done → `pnpm verify:fast`
- any single tool → `node_modules/.bin/<bin>` (e.g. `node_modules/.bin/eslint <file>`, `node_modules/.bin/playwright test <spec>`, `node_modules/.bin/tsx <script>`)
