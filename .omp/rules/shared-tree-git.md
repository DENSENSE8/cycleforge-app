---
description: Shared lane tree — no git stash/checkout --/restore/add -A/commit --no-verify/reset --hard
condition:
  - '\bgit(?:\s+-[Cc]\s+\S+)*\s+stash\b'
  - '\bgit(?:\s+-[Cc]\s+\S+)*\s+checkout\b[^;&|\n"]*\s--(?=[\s"]|$)'
  - '\bgit(?:\s+-[Cc]\s+\S+)*\s+restore\b'
  - '\bgit(?:\s+-[Cc]\s+\S+)*\s+add\s+(?:-A|--all)\b'
  - '\bgit(?:\s+-[Cc]\s+\S+)*\s+commit\b[^;&|\n"]*--no-verify\b'
  - '\bgit(?:\s+-[Cc]\s+\S+)*\s+reset\b[^;&|\n"]*--hard\b'
scope:
  - 'tool:bash'
---
This lane tree is shared: another session edits it concurrently and its uncommitted work lives in the same working copy. `git stash`, `git checkout -- <path>`, `git restore`, `git add -A`, `git commit --no-verify` and `git reset --hard` destroy, sweep up or bypass checks on someone else's changes — forbidden here.

- Undo only your own edits, with the edit tool, file by file.
- Never stash, commit or revert to "clean up"; leave unexpected changes alone and adapt to them.
- Inspect with read-only git (`git status`, `git diff -- <path>`, `git log`).
