# Research briefing — make Cycle Forge agents *use* the in-repo design-system MCP, with no markdown bloat and no guards

**For:** Gemini Pro (Deep Research)
**From:** Cycle Forge engineering, assembled 2026-08-30 from a live read of this machine
**Repos:** `cycleforge-app` (`/home/michaelgarisek/Projects/cycleforge-app`) and the sibling reference `Garisek-OS` (`/home/michaelgarisek/Projects/Garisek-OS`)
**Status:** the MCP *server exists and boots*. Agents do not call it. The smoke suite that passed on 2026-08-25 is **red today**. This brief exists so you can specify the exact wiring that makes every Cursor / Claude Code / Cursor Cloud agent consult that server as the design-system oracle — without a 10k-line always-on constitution, without PreToolUse blockers, and without the operator restating the same UI laws every session.

**You do not have the codebase.** Every number below was measured on 2026-08-30 on this machine. Treat them as ground truth. Where a fact is inferred, it is labeled **(inferred — verify)**.

---

## 0. How to use this brief

Your job is **not** “explain MCP” or “explain design systems.” It is one engineering question with a hard constraint:

> Cycle Forge already has an in-repo stdio MCP server (`tools/design-mcp/`) registered in `.mcp.json`. In a live Cursor agent session on 2026-08-30, that server **does not appear in the agent’s tool catalog**. The operator’s instruction to every future agent is: compose from the design system. They will not keep pasting that instruction. They have also banned **all** remaining agent-markdown bloat and **any guards whatsoever**.
>
> Specify the 2026 wiring — files, client discovery paths, tool descriptions, skills, Cursor vs Claude Code vs Cursor Cloud differences — such that an agent that is never told “use the design MCP” still calls `ds_contract` / `ds_tokens` / `ds_critique` before writing UI, and still cannot quietly invent a second Button.

**Hard constraints the operator will not negotiate:**

1. **No always-on constitution.** The old house-law corpus was deleted 2026-08-21. `AGENTS.md` is gone. `.claude/rules/` is empty. `CLAUDE.md` is five lines. Do not recommend reconstructing a law catalog.
2. **No guards.** Warehouse OS law X1 already states: *Laws are prose. Guards are banned.* No new `*.guard.test.ts`, no PreToolUse design-system blocker, no regex-over-source “adjudicator.” The Garisek-OS model (“the hook is the law, the MCP is a courtesy”) is **rejected for this repo**. If your answer depends on a blocking hook, it is the wrong answer.
3. **The oracle is the in-repo server**, not Impeccable, not Figma MCP, not Motion MCP, not a new DESIGN.md. Those may exist; they must not be the thing an agent reaches for first when the job is Cycle Forge UI.
4. **The operator will not re-prompt.** If the design only works when a human says “call ds_contract first,” it has already failed.

Three deliverables, kept separate:

1. **What 2026 agent runtimes actually do** to make a project MCP server *appear in the model’s tool list and get called* — Cursor (local), Claude Code, Cursor Cloud / Cloud Code, Gemini CLI if relevant. Name the exact config files, enablement UI, and known non-discovery traps. Cite docs.
2. **Take a side on each decision in §6.** Not a survey.
3. **A concrete file-level wiring plan** an engineer can apply in one session: what to delete, what to keep at ≤N lines, how the MCP tool descriptions themselves become the only instruction channel, how to prove an agent session actually has the tools.

Do not recommend rebuilding the SoT-manifest / `sot-lookup` CLI. That was a proto-MCP with a CLI instead of a protocol; the MCP already exists. Do not recommend copying Garisek’s `ds_adjudicate` + PreToolUse pair unless you can show a *non-guard* equivalent that still works when the model never calls the tool.

---

## 1. The failure being engineered against

Agents in this repo write **valid React that quietly forks the system**. That is not a lint miss. The last ten days of local + cloud conversations are the specimen set (§8). Pattern:

- Operator states a geometric law (one composer row, rounded plus-button, colored stamp chips, unbox+ticket not notes+location).
- Agent implements something plausible beside the existing primitive / token / composer host.
- Operator says “undo / revert / it used to look like X.”
- Next session, the same class of miss happens again, because nothing in the *tool catalog* told the model what already exists.

The intended remedy is already written in `tools/design-mcp/README.md`:

| Question the agent has | Wrong answer it reaches for | Tool that should have been first |
|---|---|---|
| What already exists for this job? | writes a new primitive | `ds_contract` |
| What values may I use? | `#1a1a1d`, `text-[13px]`, squared plus-button | `ds_tokens` |
| Why is this component bad? | rewrites it from scratch | `ds_critique` |

**Registration is not use.** That is the whole brief.

---

## 2. What already exists (measured 2026-08-30)

### 2.1 The server

| Item | Value |
|---|---|
| Path | `tools/design-mcp/server.mjs` + `run-mcp.sh` |
| Protocol | MCP over **stdio**, JSON-RPC on stdout, diagnostics on stderr |
| Boot line (stderr) | `cycleforge-design-mcp: ready` |
| Tools | **exactly three:** `ds_contract`, `ds_tokens`, `ds_critique` |
| Deliberately absent | `ds_adjudicate`, `ds_review_file`, `ds_compare` (those exist in Garisek-OS) |
| Curated law file | `src/design-system/pinned.json` — **does not exist**. `curated_entries: 0` |
| Repo aim | `DESIGN_MCP_REPO` env, else the checkout the script sits in |
| Primitive homes indexed | `src/design-system/primitives`, `src/design-system/components`, `src/components/ui`, `src/components/composer` |
| Token CSS it reads | `src/shell/tokens.css`, `src/styles/globals.css`, `src/app/globals.css` |

Landed as `3877536a7` (server) + `437e8bb83` (primitive-count comment fix) + `240d9dc60` (VERIFY.md). Adversarial audit: [Design-system MCP verification](5eb8687f-26ec-482d-af50-88ade26bb2e2) on 2026-08-25.

### 2.2 How it is registered

Repo-root `.mcp.json` (630 bytes):

```json
{
  "mcpServers": {
    "motion": { "type": "http", "url": "https://mcp.motion.dev" },
    "motion-plus": { "type": "http", "url": "https://mcp.motion.dev/plus" },
    "code-graph": {
      "type": "stdio",
      "command": "/home/michaelgarisek/Projects/Garisek-OS/tools/code-graph/run-mcp.sh",
      "env": { "CODE_GRAPH_PROJECT": "cycleforge-app" }
    },
    "figma": { "type": "http", "url": "https://mcp.figma.com/mcp" },
    "design-mcp": {
      "type": "stdio",
      "command": "./tools/design-mcp/run-mcp.sh",
      "args": []
    }
  }
}
```

**There is no `.cursor/mcp.json`.** Cursor’s project MCP file is absent. Claude Code historically reads `.mcp.json`; Cursor historically reads `.cursor/mcp.json` (and/or a user-level MCP settings store). **This is the primary discovery-trap candidate.** Prove or disprove it with current Cursor / Claude Code docs — do not hand-wave.

### 2.3 Live proof that agents do not have the tools

On 2026-08-30, in a Cursor agent session whose workspace *is* this repo:

- The agent’s available MCP namespaces were plugin servers (Vercel, Figma, Linear, Stripe, Cloudflare, Notion, …) plus `cursor-ide-browser`.
- **`design-mcp` was not in the catalog.** Neither were `motion`, `motion-plus`, `code-graph`.
- A pattern search for `ds_` / `design-mcp` returned nothing from this repo’s server.
- Therefore every UI edit in that session was made the old way: grep, read files, invent.

If your wiring plan does not make `ds_contract` appear in *that* catalog, it is not a plan.

### 2.4 The server is already stale against the tree it describes

`node tools/design-mcp/smoke.mjs` on 2026-08-30 (the same suite that was 11/11 on 2026-08-25):

| Assertion | 2026-08-25 | 2026-08-30 |
|---|---|---|
| JSON-RPC stdout | ok | ok |
| 3 tools | ok | ok |
| `ds_contract` finds primitives | ok (catalog **56**) | ok (catalog **156**) — inventory grew, not a fail |
| Flagship Button flat map = 9 variants | ok | ok |
| shadcn `button` cva = 6 variants × **4** sizes | ok | **FAIL** — now **6v / 5s** |
| `ds_tokens` radius axis has tokens | ok | **FAIL — 0 tokens** |
| `ds_critique` on `src/shell/AssistantFeed.tsx` | ok (real `<button>` at L104) | **crash:** `no such file: src/shell/AssistantFeed.tsx` then smoke `JSON.parse` of the error string |

Also measured today:

- `src/shell/tokens.css` — **gone**
- `src/shell/shell.css` — **gone** (was 1,077 lines on 08-25)
- `src/shell/AssistantFeed.tsx` — **gone**
- Radius law now lives in **TypeScript**: `src/design-system/tokens/radius.ts` (`cornerClass(role)`), *not* CSS custom properties. `globals.css` explicitly says corner radius is “deliberately NOT here.”
- Color tokens are injected by `src/design-system/themes/registry.ts` as `<style id="app-theme-palettes">`, not declared in the CSS files the MCP greps.
- Composer SoT is `src/components/composer/*` + `src/shell/SessionComposer.tsx` (the MCP already indexes the composer folder; smoke still points at a deleted feed file).

So even if an agent *had* the tools today, `ds_tokens { axis: "radius" }` would return an empty list and the model would read that as “no law exists” — the exact failure `DESIGN_MCP_REPO` was written to prevent, except this time the aim is the right tree and the **readers inside the server are aimed at deleted files.**

A wiring plan that only enables discovery, and does not retarget token/contract readers at `cornerClass` / theme registry / live composer hosts, will ship a confident empty catalog.

### 2.5 Two primitive homes, still unresolved

`ds_contract` reports both `src/design-system/primitives/Button.tsx` (9 named variants including `execute`) and `src/components/ui/button.tsx` (cva, shadcn lineage). The server **must not pick a winner** until a human writes `pinned.json`. Today `pinned.json` is still absent, so an agent that *does* call `ds_contract` still sees two Buttons.

`useWhen` / `doNot` absence means **nobody has written the law**, not that anything is permitted. That sentence is already in the tool response. It is not reaching agents because the tool is not in their catalog.

### 2.6 A second, unrelated MCP in the same repo — do not conflate

`src/app/api/mcp/route.ts` is an **authenticated HTTP MCP** exposing the in-app assistant’s *read* tools to power users (`withAuth`, `assistant.chat`). It is not the design-system server. A recommendation that “the app already has MCP, use `/api/mcp`” is a category error.

### 2.7 Known product defect (still open from the 08-25 audit)

Path containment: `../Garisek-OS/package.json` and a literal `/etc/passwd` are refused. A **symlink inside the repo pointing outward** was read (`tools/design-mcp/.audit-outward-link` → `/etc/passwd`). `resolveInRepo` uses `path.resolve` + `path.relative` and never `realpath`s the target. Fix this if you touch the server; it is not the discovery problem.

---

## 3. What the agents actually load today (the bloat to delete)

The operator’s instruction: **remove all bloat within the agent’s markdown.** This is the measured always-on / first-read pile.

| Surface | Lines (2026-08-30) | What an agent does with it |
|---|---|---|
| `CLAUDE.md` | **5** | “Read `docs/warehouse-os/` before building UI. Do not reconstruct the deleted house-law corpus.” That *is* the always-on constitution now — and it points at 8,423 lines of warehouse-os markdown. |
| `AGENTS.md` | **deleted** | Good. Do not bring it back. |
| `.claude/rules/` | **empty** | Good. Do not bring it back. |
| `docs/warehouse-os/` | **8,423** lines of `.md` | CLAUDE.md sends every UI task here. Includes `LAWS.md` (367 lines, mostly `PROTO` / `PROSE` — i.e. unenforced), a dozen HANDOFF paste-prompts, and `README.md` whose “read in this order” table is itself a constitution. |
| `src/design-system/DESIGN_SYSTEM.md` | **467** | Kinetic Ledger identity. Not loaded unless the agent finds it. |
| `.claude/skills/impeccable/` | **~5,002** lines of SKILL + references | A third-party design-director skill. It tells the agent to run `context.mjs`, load PRODUCT.md / DESIGN.md (neither exists at repo root), then `craft-floor.md`. It does **not** mention `ds_contract`. It is a competing oracle. |
| `.claude/skills/motion/` | skill + best-practice tree | Points at Motion MCP (`https://mcp.motion.dev`), which is also registered and also **not in the live Cursor tool catalog**. |
| `.claude/settings.json` | PreToolUse: block `.env` edits, `db:push`, `git push --force`. PostToolUse: `next lint` on ts/tsx | **Not** a design-system gate. The 08-25 VERIFY.md claim “there is no PreToolUse hook in this repo” was **FAIL as written**; the hooks that exist do not call this MCP. |
| `.claude/settings.local.json` | Impeccable PostToolUse + Stop detector | Another competing design authority, after-the-fact, not a contract lookup. |
| Cursor user/plugin MCP | dozens of marketplace servers | These **do** appear in the live catalog. The project’s `.mcp.json` servers **do not**. |

**Doctrine already in `LAWS.md` X1 (do not contradict it, operationalize it):**

> Laws are prose. Guards are banned. An invariant may be pinned by a DB constraint, a TS type, a required prop with no default, a mounted DOM test, or an ESLint AST rule — **never** by a test that `readFileSync`s a source file and regex-asserts its contents. 16 such files, ~2.7k lines, were deleted 2026-08-22.

So: ESLint AST / TypeScript unions / mounted tests are still allowed *by that law*. The operator’s **new** instruction is stricter: **any guards whatsoever** are out. Your plan must say what happens to remaining `*.guard.test.ts` files (at least `src/app/head-token-order.guard.test.ts` still cites itself as pinning cascade order) and to Impeccable’s detector hook. Recommend delete vs. leave-but-do-not-load, with a reason.

**Do not** recommend a 690-line AGENTS.md “compromise.” Cycle Forge already tried a 10,462-line always-on corpus, split it, then deleted it. The empirical result of prose law is §8.

---

## 4. The sibling that works differently — Garisek-OS (contrast, not a template)

Garisek-OS `tools/design-mcp/` is the older sibling. Differences that matter:

| | Garisek-OS | Cycle Forge |
|---|---|---|
| Tools | `ds_contract`, `ds_tokens`, `ds_adjudicate`, `ds_review_file`, `ds_compare`, `ds_critique` | three advisory tools only |
| Contract source | `src/design-system/pinned.ts` imported via `tsx` | filesystem inventory of `.tsx` + optional `pinned.json` |
| Enforcement | **one** `scripts/guard/adjudicate.mjs` behind two doors: MCP `ds_adjudicate` (optional) and Claude Code `PreToolUse` (exit 2 blocks the write) | **none**. README: a tool that returns “allowed” while nothing enforces anything manufactures confidence |
| AGENTS.md | still present; states *rules a gate enforces are deleted from this file, not restated* and *ask the design-system MCP* | gone |
| Operator stance for Cycle Forge | — | **reject the hook.** MCP must be sufficient |

Garisek’s own README is blunt: *“a design-system server an agent has to remember to call is exactly as advisory as PINNED_COMPONENTS, which is to say ignored.”* That sentence is the research question. Garisek’s answer was a blocking hook. Cycle Forge’s answer cannot be that. **What is the 2026 non-hook mechanism that still wins when the model is greedy for tokens and the tool is optional?**

Candidates you must actually rank, with evidence, not list:

- MCP tool descriptions as the only prompt (already long on `ds_contract`; not working because the tools are not loaded).
- Cursor / Claude “always-on” MCP or `tool_choice` / required-tool policies.
- A **≤20-line** CLAUDE.md / Cursor rule whose *only* job is “UI write ⇒ call these three tools” — the operator wants even this gone if a runtime setting can replace it. Argue whether zero-line is possible.
- Replacing Impeccable’s SKILL.md with an 8-line skill that *only* dispatches to `ds_*`.
- Cursor Cloud: stdio MCP from `.mcp.json` may not ship to cloud VMs at all — if so, say how (HTTP MCP? bake into the cloud snapshot? disable cloud UI work?).
- Subagents: the parent’s MCP catalog often does **not** inherit. Composer/UI work in this repo is routinely delegated to `explore` / `generalPurpose` subagents that would not see `ds_*` even if the parent did.

A prior deep-research brief already exists for the *Garisek* direction: `Garisek-OS/docs/BRIEFING-DESIGN-SYSTEM-MCP-2026-08.md` (2026-08-20). It treated Cycle Forge’s then-constitution as the proven precedent and asked how to bring a machine-readable contract to Garisek. **This brief inverts that.** Cycle Forge deleted the constitution, shipped a thinner MCP, and still does not get tool calls. Do not re-answer the 08-20 brief. Answer discovery + invocation under a no-guard constraint.

---

## 5. Client-specific traps you must resolve with current docs

These are the questions an engineer will execute against. Answer with file names and 2026 docs, not slogans.

### D-discovery

1. Does Cursor 2026 auto-load repo-root `.mcp.json`, or only `.cursor/mcp.json` / user MCP settings / a plugin `mcp.json`? What is the exact enablement step after the file exists (Settings toggle? reload window? trust dialog?)?
2. Does Claude Code auto-load `.mcp.json` from the project root, and do those tools show up in Cursor when the same folder is open?
3. Cursor Cloud / Cloud Code / background agents: do they spawn local stdio servers from the repo, or only HTTP MCP? The 2026-08-24 cloud session [Omni-command composer](bc-6869e06b-ddce-42be-833e-9ef9e063690c) ran out of context mid-verify on Warehouse OS chrome — if cloud agents cannot see `design-mcp`, UI work on cloud is structurally ungoverned.
4. Relative command `./tools/design-mcp/run-mcp.sh`: which cwd does Cursor spawn with? Claude Code? A worktree under `.claude/worktrees/…`? `DESIGN_MCP_REPO` exists because a server aimed at the tool’s checkout while UI lives in a sibling worktree answers “no tokens, no composer.”
5. `run-mcp.sh` resolves node via PATH then nvm. Cursor MCP spawns **without a login shell**. The script already comments this. Is that still a boot-fail mode in Cursor’s MCP panel (server shows red, tools absent) vs Claude Code?
6. HTTP vs stdio: should Cycle Forge expose `design-mcp` as Streamable HTTP so Cursor Cloud and Gemini CLI can share one server, or keep stdio and accept that only local Claude Code/Cursor get it?

### D-invocation (tools present, still ignored)

7. Once tools are in the catalog, what actually makes the model call them *before* Write? Compare: richer `description` + `useWhen` in the schema; a Cursor project rule of N lines; an agent skill with `disable-model-invocation: false` and a description that matches “button / composer / radius”; Anthropic `tool_choice`; Cursor “MCP resources” vs tools.
8. Impeccable’s skill description is a magnet for any UI task and never mentions `ds_*`. Is the correct move to **delete or disable** Impeccable in this repo, or to make its first Setup step a mandatory `ds_contract` call? The operator said take full advantage of the **in-repo** design MCP, not a generic design-director skill.
9. Figma MCP *is* in `.mcp.json` and *is* a plugin in the live catalog. Agents will happily screenshot Figma and invent Tailwind. How do you rank Figma vs `design-mcp` so the house system wins on implementation tasks?

### D-contract freshness

10. `ds_tokens` grepping CSS is now the wrong layer. Radius is `cornerClass` in TS; color is a theme registry. What is the correct 2026 shape: keep grepping CSS, import the TS token modules (Garisek uses `tsx` for this — Cycle Forge’s launcher *deliberately* avoided `--import tsx`), or emit a generated JSON the server reads?
11. Smoke tests pin exact variant counts. Those pins went stale in five days. What is the right test posture if guards are banned — keep exact counts in `smoke.mjs` (not a “guard,” a server contract test) or only assert “non-empty + both homes”?
12. `pinned.json` is still absent. Without `useWhen`/`doNot`, `ds_contract` is a fuzzy search over filenames. How many curated entries are the minimum for “agents stop inventing Buttons,” and who writes them (human-only, never an agent inventing law)?

---

## 6. Decisions you must take a side on

Each row: current state → take a side. No “it depends” without a default the engineer will ship.

| ID | Current | Decision |
|---|---|---|
| **W1** | `.mcp.json` at repo root; no `.cursor/mcp.json` | One file or two? Duplicate vs symlink vs Cursor-only? |
| **W2** | CLAUDE.md is 5 lines pointing at 8,423 lines of warehouse-os | Replace with a ≤15-line “UI ⇒ ds_* then stop” file, or delete the pointer and put that sentence only in MCP tool descriptions? |
| **W3** | Impeccable skill ~5k lines + detector hooks | Delete from this repo / leave unused / rewrite Setup step 1 as `ds_contract`? |
| **W4** | `LAWS.md` 367 lines, mostly `PROSE`/`PROTO` | Keep as human docs (not agent-loaded), fold composer/radius laws into `pinned.json`, or delete? |
| **W5** | No `ds_adjudicate`, no design PreToolUse | Stay advisory forever, or add *non-hook* enforcement (ESLint `no-restricted-syntax` for raw `<button>` outside primitive homes — operator said no guards; is ESLint a guard?)? |
| **W6** | Two Buttons, `pinned.json` absent | Pin one home in `pinned.json` now, or keep reporting both until a human decides? |
| **W7** | Token readers look at deleted CSS | Retarget at `src/design-system/tokens/*.ts` + theme registry this week, or freeze the server until discovery works? |
| **W8** | Cloud agents likely cannot spawn `./tools/design-mcp/run-mcp.sh` | Ban cloud UI work, wrap the server in HTTP, or vendor a Cursor plugin that ships the MCP? |
| **W9** | `code-graph` MCP points at an absolute Garisek-OS path | In scope for this wiring pass or a separate reliability item? |
| **W10** | VERIFY.md and smoke still name `AssistantFeed.tsx` | Update fixtures to `SessionComposer.tsx` / `ComposerModeRow.tsx` in the same change that retargets tokens |

On **W5**, be explicit: the operator said “any guards whatsoever.” If you believe a zero-enforcement MCP will be ignored even after it appears in the catalog, say so, cite evidence (Garisek telemetry thesis: *a flat line means the advisory half changes nothing*), and propose the *smallest* non-markdown mechanism that is not a PreToolUse hook. If you believe tool presence + a 10-line skill is enough, say what measurement would falsify that in one week.

---

## 7. Output contract (what to return)

Write for an engineer who will execute the same day. No architecture essay.

1. **Discovery recipe** — numbered, per client (Cursor local, Claude Code, Cursor Cloud). Exact filenames, whether a UI toggle is required, how to confirm the tool list contains `ds_contract` (what the human sees vs what the model sees).
2. **Invocation recipe** — the minimum bytes that make the model call the tools without being asked. Show the proposed CLAUDE.md / Cursor rule / skill text in full if any remain. If the answer is “zero bytes, tool descriptions suffice,” quote the descriptions that must change.
3. **Server retarget** — which files `ds_tokens` and `ds_critique` fixtures must read after `tokens.css` / `AssistantFeed.tsx` died. Do not invent a new architecture; patch this server.
4. **Delete list** — agent-markdown and hooks to remove so competing oracles die. Every deletion needs a one-line “what replaces it.”
5. **Acceptance test** that does not reconstruct VERIFY.md’s stale `git log -2` claim. A fresh agent session, given only “add a status chip to the composer,” must (a) have `ds_contract` in its tool list, (b) call it before Write, (c) import an existing primitive rather than a raw `<div className="rounded-xl">`. Specify how the operator observes (a) and (b) in Cursor’s UI.
6. **What you are uncertain about** — labeled. Do not mark unverified client behavior as fact.

**Forbidden in the answer:** a new house-law corpus; a PreToolUse design adjudicator; “just remind the agent”; cloning Garisek’s six-tool surface unless each extra tool has a Cycle Forge implementation to share; treating `/api/mcp` as the design system.

---

## 8. Conversation ledger — issues the operator had to revert or undo

Sources: Cursor local transcripts under this workspace, Cursor `SearchConversations` (local + `cloud-cache`), and git history on this checkout. Cloud Code / Cursor Cloud transcripts are only searchable when cached; two relevant cloud sessions are included. This is not a complete git bisect — it is what the operator actually fought in chat.

Cite format: [title](conversation-id).

### 8.1 Last 48 hours — composer geometry (the reason this brief exists)

**Session:** local transcript `0e35ed06-ccfd-468e-8a77-9871ba88b4f9` (2026-08-30, ~10:54 through ~19:24 local). Same day as this briefing. The agent was never given `ds_contract`.

The operator had to **undo or revert, in order:**

| When (PDT) | Operator instruction | What went wrong |
|---|---|---|
| 12:06 | Hand off collapsing line-items; **focus on composer first** | Scope bled into scan-station chrome |
| 12:18 | Slim to one row; ticket/notes as **left icons**, no right-side dropdown; send = enter-key icon not paper plane; plus on the far left | Agent kept a padded multi-control row |
| 12:25 | Plus **inside** the outline, far left; mode dropdown **below** the outline with context ring; rounded outline; one row + second row outside like Cursor/Claude Code | Layout fought the “one row” law |
| 12:29 | Expand-on-newline like Cursor; start in notes; condense enter into print-label; plus hover radius = composer radius | Radius of plus diverged from the outline |
| 12:44 | Placeholder not aligned; everything in **one row**, no internal padding mix; ticket icon orange like carton context; enter icon gray, no bubble | Vertical centering / extra chrome |
| 12:48 | **Hard rule:** mode + context ring **below** the outline | Agent put them inside |
| 12:52 | Remove extra bottom padding under ticket + ring | Mystery spacer |
| 18:48 | “fix the unevenness… **undo the squaring** of the plus-button corner radius” | Plus was squared after having been round |
| 19:05 | **Undo notes and location as modes.** Only **unbox** (current scan station) and **ticket**. Not a dropdown — horizontal left/right under the composer | Agent had invented extra modes |
| 19:10 | Unbox + ticket, icons always left, unbox icon blue; save-location **inside** the composer | Location had been promoted to a mode |
| 19:17 | Operator pasted a structural spec (flex-col, textarea above action bar) because the agent would not land one-row-then-grow | Prompt replaced the missing oracle |
| 19:20 | “In a previous commit this plus button was rounded. What happened?” | Radius regression **inside the same session** |
| 19:21 | “**the stamp selections must be reverted back**, it had colors for stamp ticket subject and more” | Colored stamp chips were flattened |
| 19:24 | Add corner radius; last-notes at bottom of rows | Follow-on after the stamp revert |

This is the loop the MCP is supposed to kill: **radius, color, composer host, and mode set already exist in-repo**, and the agent still redesigned them. `ds_tokens` would have named the radius role; `ds_contract` with intent `"composer"` would have returned `src/components/composer` instead of a new dock; `ds_critique` would have flagged a squared plus next to a rounded outline. None of those tools were in the session.

### 8.2 Warehouse OS merge vs the live operator tree

**Local session** (transcript `4bb54fec-6ac2-431e-b80c-441ad0e65f36`): GitHub merge `ee773f9ec` — *“Merge claude/warehouse-os-refactor-8f2dc3 — the Warehouse OS shell lands on main”* — replaced `/` with an empty HUD (`page.tsx` returned `null`, `ShellRoot` painted the frame). localhost:3050 showed **No session** and a demo work-order column. The operator thought it was a cache. It was not.

**What was done:** a **local working-tree restore** of the pre-merge operator tree (`9ad0817c3`) onto the main checkout. Explicitly **not** a revert on GitHub. `:3050` became the Daily home workbench again.

This is why `DESIGN_MCP_REPO` and worktree aiming exist, and why smoke fixtures died: **the shell files the MCP was tested against (`AssistantFeed.tsx`, `tokens.css`, `shell.css`) are not a stable path.** An agent that “reads warehouse-os then builds UI” will follow whichever tree is mounted. An agent that calls `ds_contract` against the wrong tree will conclude the composer does not exist.

Related local: [Claude work tree folder](6a419ae2-f9d2-4c3d-ae52-b7798df80740), [Claude work tree folder](ee4b1e87-8087-4d7b-9d29-8c2f3644c940) — mapping what lived only in `.claude/worktrees/warehouse-os-refactor-8f2dc3` (`src/shell/`, `docs/warehouse-os/`) vs main. Agents were told “restore via git checkout if needed” for chrome that was not the target.

**Cloud:** [Omni-command composer](bc-6869e06b-ddce-42be-833e-9ef9e063690c) (2026-08-24) — implement Omni-Command Composer on the Warehouse OS shell, **not on main**. Previous agent **ran out of context mid-verify**. Work uncommitted. The cloud session could not have used a local stdio `design-mcp` unless Cursor Cloud injects it **(unverified — you must answer W8)**.

**Cloud:** [Laws AI session model](bc-5348c652-3cbe-4487-b047-73014c288b42) (2026-08-24) — numbered Warehouse OS law catalog **wiped**. PR to delete laws rather than restore rows. Instruction: *do not write new house laws until a surface exists.* That cloud decision is why this briefing forbids reconstructing AGENTS.md.

### 8.3 Packed header — a real git revert

- Commit `ad4c2fa1d` added a Packed header control (today’s boxes by packer).
- Commit `7a401b7dc` **reverted the Packed header chrome** and recorded how the daily packer count should land instead.
- Merge `058592a98`: *keep the Packed revert*.
- Local: [Packer operations page plan](a4881860-f2e0-4a49-af8d-447d8af49e17) identified the control on origin/main as the thing to plan around, not re-invent.

Agent built chrome the operator then reverted. A `ds_contract` intent `"packed today count"` would at least have shown `PackedTodayTile` if it was indexed; composer/primitives indexing does not yet include tiles. **Gap:** the inventory is primitive-folder-shaped, not job-shaped, until `pinned.json` grows.

### 8.4 Concurrent-session overwrite (not a git revert, same pain)

Local transcript `a9684cd1-ee5f-4971-8bd2-fe293077f66d`: unmatched-items “order linked” banner. Agent removed it; **another session reverted the files on `main`**. Agent had to delete the notice again. Two agents, no shared contract, last-write wins.

### 8.5 Dead-export sweep that deleted live modules

Git `a4179bb3f`: *“Repair the tree the sweep left red — restore live modules, drop stale twins.”* Earlier `b73a49b53` removed dead exports **and the DS shell family**. Live modules came back in the repair. This is knip/sweep false-confidence — the 08-20 Garisek brief already recorded that knip cannot see a fork whose both doors are imported. Reverts here are “we deleted the working thing.”

Other restore commits in recent history (context, not all operator-chat): `e11befa73` command-book import; `ccbc6e850` merge dropped imports; `7f2493852` Unbox notes bubble dock; `40e061cf3` UnboxCaptureStack swept by a staging race; `509849862` **revert(pickup)** defer pickup group row; `941387d2a` dashboard bulk-bar reserve; `8c65e6c12` Unbox sidebar Unboxed rail.

### 8.6 Corner radius — restore after agents squared the shell

Local (duplicates of one thread): [Shadcn UI corner radius](9d230093-bed8-42cd-8356-2d9521c61832), [Shadcn UI corner radius](8f6e9122-a832-41c0-adac-d0b90249ec46) (2026-08-25). Prompt: restore shadcn-style corner radius on Warehouse OS chrome. Explicit: **do not write a new house-law corpus.** `nestedCorner` already exists. After restore it starts painting again — do not bypass it with a raw `rounded-*`.

Five days later (session 8.1) the plus-button was squared **again**. `ds_tokens { axis: "radius" }` returning **0 tokens today** means even a well-wired agent would get “no radius law” and invent `rounded-none` or `rounded-md`. **Retarget is not optional.**

### 8.7 Design-MCP verification — what was actually true on 08-25

[Design-system MCP verification](5eb8687f-26ec-482d-af50-88ade26bb2e2): adversarial audit of VERIFY.md. Score against the prompt: **16 PASS, 3 FAIL, 1 UNVERIFIED**.

FAILs: (1) expected `git log -2` already stale because VERIFY.md itself was the tip; (2) **symlink escape**; (3) “no PreToolUse hook in this repo” overstated — secret/`db:push`/force-push hooks exist, none design-related.

PASSes that are **now false** (do not copy them into a new VERIFY): smoke 11/11, AssistantFeed fork at L104, radius tokens present, cva 6×4. Any acceptance test you write must be re-measured against §2.4.

### 8.8 Architecture interrogation — MCP is off the Garisek train

[Cycle Forge architecture interrogation](807b225f-e4a0-44a9-a192-fcfaf84d6bf2) (2026-08-26): Garisek-OS graph acknowledges a repo and emits a markdown procedure. **Design MCP / Lighthouse / Feature Validator: not on those rails.** Ingress hard-codes `writeArtifact: false`. The graph does not write Cycle Forge UI. So even a perfect local Cursor wiring does not automatically cover the phone → Linear → Hermes loop. If you mention that loop, say it is out of band — do not pretend `ds_contract` is in the diamond.

### 8.9 What this ledger implies for your answer

Every revert above is **fork or drift**, not a crash:

- squared radius vs named `cornerClass` / composer outline
- extra composer modes vs two modes (unbox, ticket)
- flattened stamp colors vs tokenized subject colors
- empty Warehouse OS HUD vs the operator Daily tree
- Packed header chrome vs a planned Operations surface
- concurrent banner restore

Prose in `docs/warehouse-os/LAWS.md` (F9 concentric radius, I8 one composer) was already written. Agents did not obey it. **That is the evidence that more markdown will not work.** Your wiring must move those laws into `ds_tokens` / `pinned.json` *and* into the tool catalog of the client that is actually editing.

---

## 9. Suggested first query to paste into Gemini Deep Research

You can paste this file as the brief. If the product wants a short starter question as well, use:

> Using the attached Cycle Forge briefing as the only source of repo facts, specify how to wire the existing stdio MCP server at `tools/design-mcp/` so Cursor local, Claude Code, and Cursor Cloud agents actually receive and call `ds_contract`, `ds_tokens`, and `ds_critique` before any UI write — with no house-law markdown corpus and no PreToolUse/guard tests. Include the exact config files Cursor vs Claude Code read, why a live 2026-08-30 Cursor session on this repo had zero `design-mcp` tools despite `.mcp.json`, how to retarget `ds_tokens` now that `src/shell/tokens.css` is gone and radius lives in `src/design-system/tokens/radius.ts`, and an acceptance test that a fresh “add a status chip to the composer” session must pass. Take a side on W1–W10. Do not recommend reconstructing AGENTS.md or copying Garisek-OS’s adjudicate hook.

---

## 10. File index for a human executing after Gemini returns

| Path | Role |
|---|---|
| `tools/design-mcp/server.mjs` | The oracle |
| `tools/design-mcp/run-mcp.sh` | Stdio launcher (node via PATH/nvm) |
| `tools/design-mcp/smoke.mjs` | Contract tests — currently **red** |
| `tools/design-mcp/README.md` | Intent; two homes; no adjudicate |
| `tools/design-mcp/VERIFY.md` | Adversarial prompt — **stale** vs HEAD |
| `.mcp.json` | Registration — **not appearing in live Cursor tool list** |
| `.cursor/mcp.json` | **Missing** — likely the Cursor discovery hole |
| `CLAUDE.md` | 5 lines → 8,423 lines of warehouse-os |
| `docs/warehouse-os/LAWS.md` | X1 bans guards; F9 radius; composer laws |
| `src/design-system/tokens/radius.ts` | Actual radius SoT (`cornerClass`) |
| `src/design-system/themes/registry.ts` | Actual color SoT |
| `src/components/composer/` | Actual composer SoT |
| `src/app/api/mcp/route.ts` | Unrelated in-app assistant MCP |
| `Garisek-OS/tools/design-mcp/` | Sibling with hooks — do not copy the hook |
| `Garisek-OS/docs/BRIEFING-DESIGN-SYSTEM-MCP-2026-08.md` | Prior research, inverted question |
