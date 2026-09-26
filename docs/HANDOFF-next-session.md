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
**Known red:** 10 unit tests, identical before and after the diet (compound
title strike, orders shared-tracks derivation, daily field-catalog slot values,
walk-in history target, V1 label-ingestion live DB invariants). Typecheck may be red while another
session is mid-refactor on the desk sidebar (`DesktopRouteShell.tsx`).

**Owner rulings (BRIEF §12):** motion and density follow the task, never the device;
industrial = 0 ms except the scan-status flash (kept); triage/assistant = expressive
motion.dev; AI inference via Cloudflare AI Gateway only (Vercel gateway removed
completely; iOS/Android/desktop call CycleForge server routes); owner cherry-picks
`main` → prod one commit at a time; `/m/scan` is industrial.

## 3. Highest-ROI next work (in order)

1. **Cloudflare AI Gateway cutover.** Seam: `src/lib/ai/org-provider.ts`
   (`GATEWAY_BASE`, `candidateFor`) + `src/lib/ai/provider.ts` (`resolveAiConfig`).
   First move the 8 call sites that bypass `postToAiProvider`
   (`api/ai/search`, `api/assistant/chat` fallback, `ai/sourcing-research`,
   `po-gmail/extract-llm`, `receiving-claim-seller-assist`, `support/suggest-reply`,
   `api/forge/chat`, `api/identification/methods/author`) one per pass, extending
   `failover.ts` for streaming / multimodal / `tool_choice` instead of degrading the
   site. Then point the base URL at
   `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}`, pass it to
   `new Anthropic({ baseURL })` in `src/lib/assistant/agent-loop.ts`, move
   `src/lib/ai/gemini.ts` onto `embedText`, delete the `ai_gateway` (Vercel) credential.
   Needs from owner: account id, gateway id, token.
2. **Green baseline.** Fix or delete the 10 red unit tests so every future red is yours.
3. **Mode coverage.** Many desk routes mount no `ModeRegion` (`/unbox`, `/receiving/**`,
   `/packer`, `/tracking-exceptions`, `/m/work`, …). One page per session.
4. **Triage row for `/shipping/exceptions`** (spec §4: stacked buyer, QTY beside
   SKU/BIN, stage + age right). It mounts the industrial `OutboundOrdersLedger` today;
   `/shipping/orders` stays industrial (owner ruling).
5. **Ledger readability item 9** (vertical compartment rules → ink, delete trial
   `sectionRules`) and the rest of that queue.
6. **DataTable `actionStrip`** typed contract (6 call sites) — deferred by owner.

## 4. Foundational method for building anything here

1. **One seam per session.** One page, one route, or one library seam. Name it first.
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
8. **Prove, then record:** after screenshot + numbers, `pnpm verify:fast`, the
   affected unit tests, commit by path (never sweep another session's files), push.
   Record rulings in BRIEF in the owner's words.

## 5. Paste-ready prompt

```text
CycleForge prod lane, fresh session. Read AGENTS.md, docs/design-system/BRIEF.md
(§12 is the latest owner law) and docs/HANDOFF-next-session.md — nothing else until
the seam needs it. Follow §4 "Foundational method" exactly.

Seam for this session: <pick one from §3, default #1 Cloudflare AI Gateway cutover>.

Rules: :3050 only; one seam; measure → fix at the lowest layer → prove live →
pnpm verify:fast → commit by path and push. Other sessions edit this tree
concurrently: never stage, revert or reformat their files. Report: what changed,
proof, what's next.
```
