# HANDOFF — next clean-context session (written 2026-09-26)

Paste the prompt at the bottom into a fresh session. Everything above it is the
record it points to.

## 1. Where this session started

- Branch `prod/worktree-2026-09-11` at `92a32d00d`, 463 modified + 103 untracked
  files from concurrent sessions, nothing committed by agents (old rule).
- Live work: To-ship ledger readability pass (`docs/design-system/HANDOFF-ledger-readability.md`),
  items 1–8 landed, 8a (staff palette) reverted to black/white initials, item 9 next.
- Owner spec arrived mid-session: Cloudflare AI Gateway, three task modes,
  desktop triage table, main→prod porting.

## 2. What changed (all pushed; agents may now commit — owner said "commit everything and push")

| Commit | What |
|---|---|
| `1ec245bfb`, `e7dc59dd7` | Concurrent sessions' in-flight work landed as-is |
| `23b4c6bba`, `f25f8aa41` | 213 dead source files, 142 one-off scripts, cohort lists pruned |
| `5d817b85b` | `docs/todo/` and every screenshot gone; `docs/**/screenshots/` gitignored |
| `3708ade9e` … `65ca3bb26` | `/m/scan` → industrial mode; one simple row per entry, every fact in a tap sheet (`MobileStationEntrySheet`) |
| `270795058` | Electron + desktop bridge, `apps/mobile` (Expo), `apps/web`, `packages/shared`, `deploy/`, `.cycle_forge_ops/`, release notes, 14 stale docs dirs, unused deps; 10 design-law gates + their cohort/law modules + source-text tests; 34 unused `/m` routes |
| `c82fed463` | Essay comments condensed (−119k lines, AST-identical code) |
| `740492be5` | 3,530 unused `export`s dropped; `lenis` ^1.3.26 + `animejs` ^4.5.0 installed (not wired) |

Net since `92a32d00d`: ~6.8k files touched, ~397k lines deleted. `docs/` 36 MB → 3 MB.

**Kept on purpose:** `vision/` (owner will port it), `framer-motion`/`motion`,
`docs/design-system`, `docs/tenancy`, `docs/security`, `docs/eval`, `docs/mobile-first`,
`scripts/apply-migrations.js`, `seed-roles.mjs`, key-rotation and openapi scripts.

**Gates now in `pnpm verify:fast`:** Lint, Typecheck, Cron contract, Tenancy isolation,
Schema drift, Boundary, Nav names, Sku identity, Design tokens, V1 OpenAPI.
**Known red:** the 10 Phase-0 tests are fixed (`c5c55a8d3`), but 15 live-DB tests
(`tenancy/idor-regression`, `neon/reason-codes-queries`, `auth/password-reset`,
`tenancy/resolve-org-from-request`) fail with `cannot execute INSERT in a read-only
transaction`: the Neon branch in `.env` (`ep-shiny-hall-adz0n0nu`) is primary with
`default_transaction_read_only=on` (quota/branch lock suspected). The prod lane logged 103
such INSERT failures 11:17–11:23 on 2026-09-26 — owner must lift it in the Neon console.
Phase 0 test fixes: Orders Pick+Pack tracks, strike via `text-decoration-thickness`, repairs default tab
`all`, full `TaskDeskRow` fixture; the live-DB test moved to
`label-ingestions/database.live-db-test.ts` — it runs only under `test:v1:data` with
`scripts/v1-disposable-db.sh` env, never in the generic sweep.

**Owner rulings (BRIEF §12):** motion and density follow the task, never the device;
industrial = 0 ms except the scan-status flash (kept); triage/assistant = expressive
motion.dev; AI inference via Cloudflare AI Gateway only (Vercel gateway removed
completely; iOS/Android/desktop call CycleForge server routes); owner cherry-picks
`main` → prod one commit at a time; `/m/scan` is industrial.

## 3. Dogfood operating mode (owner 2026-09-26)

> "I am in dog food so a work tree per session doesn't matter, just do everything in
> the production work tree, face by face, step by step, it doesn't matter if I commit
> a non-working design — I just need to iterate fast on everything."

- **One tree:** everything happens in the prod worktree
  (`~/Projects/cycleforge-lanes/prod`). No per-session worktrees or branches.
- **Speed beats green:** commit and push each step as soon as it shows on :3050,
  even if the design is unfinished or a gate is red. `git push --no-verify` is
  allowed. Say in the report what is red.
- **Face by face, step by step:** one visible face (a row, a sheet, a page frame)
  per step, a screenshot, commit, push, next.
- **Still true:** the owner's live feedback beats the queue; record rulings in BRIEF
  §12 in his words; don't revert another session's files.

## 4. Phases (owner-reviewed order; work top-down, one face at a time)

**Phase 0 — trunk you can trust. Code DONE 2026-09-26; DB red above.** Test fixes landed; knip's false
positives are in `knip.json` (script/tool/test/vision entries, `tailwind.config.mjs`,
generated + `public/` ignored). What knip still lists (21 `src/` files) is real dead
code — cut it in Phase 1; the `shipped-filter/*` cluster sits beside another session's
in-flight `ShippedLedger` work, so confirm with the owner first.

**Phase 1 — cut by usage (2–4 sessions).** Owner names the desk routes he actually
dogfoods; delete the rest, as `/m` was pruned. Pick ONE table primitive
(`DataTable`, `RecordLedger`, `LedgerGrid`, the slot-table compound engine → one)
and migrate; the `actionStrip` typed contract lands here.

**Phase 2 — platform seams (3–5 sessions).**
1. Cloudflare AI Gateway cutover. Seam: `src/lib/ai/org-provider.ts`
   (`GATEWAY_BASE`, `candidateFor`) + `src/lib/ai/provider.ts` (`resolveAiConfig`).
   First move the 8 call sites that bypass `postToAiProvider` (`api/ai/search`,
   `api/assistant/chat` fallback, `ai/sourcing-research`, `po-gmail/extract-llm`,
   `receiving-claim-seller-assist`, `support/suggest-reply`, `api/forge/chat`,
   `api/identification/methods/author`), one per step, extending `failover.ts` for
   streaming / multimodal / `tool_choice`. Then base URL
   `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}`,
   `new Anthropic({ baseURL })` in `src/lib/assistant/agent-loop.ts`,
   `src/lib/ai/gemini.ts` onto `embedText`, delete the Vercel `ai_gateway` credential.
   Needs from owner: account id, gateway id, token.
2. `/api/v1` is the only door for iOS / Android / desktop (OpenAPI + verifier exist).

**Phase 3 — port features from `main` (owner drives).** Inventory main-only features
(seen so far: `transcribe.ts` + `/api/ai/transcribe`, `pi-provider` (needs
`@earendil-works/pi-ai`), shortage-coverage staging, SKU manuals panel, phone arrival
station). Owner ranks them; each is rebuilt on prod's seams with `git show main:<path>`
as reference. Cherry-pick only commits that touch nothing shared. `main` has no token
package, no mode system and no ledger — never `git checkout main -- <shared dir>`.
Archive `main` at the end.

**Phase 4 — design system per mode, face by face.** Tokens → primitives → one row
per mode → page adoption with before/after screenshots. Queue: ledger readability
item 9 onward (`docs/design-system/HANDOFF-ledger-readability.md`), triage row for
`/shipping/exceptions` (stacked buyer, QTY beside SKU/BIN, stage + age right;
`/shipping/orders` stays industrial), `ModeRegion` on unmoded desk routes. Per-page
libraries (motion, `lenis`, `animejs`) are the owner's call when he builds the front end.

**Phase 5 — native clients.** SwiftUI iOS on `DesignTokens.swift` + `/api/v1`, then
Android, then Tauri desktop — only the routes Phase 1 kept.

## 5. Method for building a face

1. **One face per step.** Name it (row, sheet, frame, seam) before touching code.
2. **Read three things, nothing else:** `AGENTS.md`, `docs/design-system/BRIEF.md`
   (the law), and the one handoff for the seam. Use `find_symbol` / `impact_analysis`
   before touching a shared component.
3. **Measure before changing:** live at `http://localhost:3050` (never another port),
   Playwright numbers + a before screenshot (local only, gitignored).
4. **Fix at the lowest layer that owns it:** server = facts, `packages/design-tokens`
   = meaning/values, `src/design-system` = shared faces, the page = layout only.
   Status comes from `LIFECYCLE`; values from tokens, never literals.
5. **Mode = task.** Wrap the page in `ModeRegion mode=…`. Industrial imports no
   animation library; triage/assistant pages import their own (motion, `lenis`,
   `animejs`) inside the page's client module only.
6. **Contracts are types, not prose.** New seams are typed props/data; no JSX escape
   hatches, no cohort/law path lists, no tests that read source text. A test pins
   behavior a user would notice, or it isn't written.
7. **Comments:** one line, the why. Owner rulings keep their date:
   `// owner 2026-09-26: …`.
8. **Show, commit, push:** screenshot at :3050, commit your files, `git push
   --no-verify` if a gate is red, say what is red. Record rulings in BRIEF §12.
9. **Stage your own files by name** (`git commit -- <paths>`). Other sessions edit
   this tree at the same time; `git add -A` once swept a half-done refactor of
   theirs into history (`740492be5`, repaired in `75cc707b5` / `21b54c0b0`).

## Notes

- `animejs` is v4: modular API, `import { animate, createTimeline } from 'animejs'`
  — not the v3 `anime({...})` global most tutorials show. `lenis` (not the
  deprecated `@studio-freight/lenis`): `import Lenis from 'lenis'`.
- `c82fed463` cut every long comment to its first sentence; invariant sentences
  (MUST / NEVER / stable-array, no-layout-shift contracts) may be gone. When
  touching a file, read `git show c82fed463^:<path>` for the original reasoning.
- knip still reports ~56 "unused files" that are false positives (generated
  `tokens.css`, `public/` service-worker builds, guard scripts `verify` runs as
  child processes). Add them to `knip.json` entries before trusting knip again.

## 6. Paste-ready prompt

```text
CycleForge prod lane, dogfood speed mode. Read AGENTS.md, docs/design-system/BRIEF.md
(§12 is the latest owner law) and docs/HANDOFF-next-session.md — nothing else until
the face needs it. Work in the prod worktree only.

Phase and face: <from §4, default Phase 0 then Phase 2.1 Cloudflare AI Gateway>.

Loop per face (§5): measure on :3050 → change at the lowest layer → screenshot →
commit your own files by name → push (--no-verify is fine; say what is red) → next
face. Unfinished designs may be committed. Never revert another session's files.
Report after each face: what changed, where to look, what's next.
```
