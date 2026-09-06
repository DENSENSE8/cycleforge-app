# HANDOFF — AI-First Session Surface (CycleForge)

Paste this whole file as the opening prompt of a fresh session. It is the
complete state of the AI-first refactor as of 2026-09-06, the laws that keep it
coherent, and the verification gates. Do not re-explore from zero; trust these
paths and re-verify only what you touch.

---

## You are working on

Making CycleForge **fully AI-first and AI-usable**: home (`/`) is the session
surface — agent chat left, read-only artifact view right — with every business
verb reachable as an agent tool and every display rendered as a validated
artifact. The left sidebar stays as page navigation; the AI never goes away;
data answers land on the right panel.

## What exists (paths are the map)

**Surface** — `src/components/session/`
- `SessionSurface.tsx` — home page: centered landing → split (chat left /
  artifact right) morph; morph fires on first message OR first artifact; both
  panes stay mounted so the thread never drops.
- `AgentSessionPanel.tsx` — chat only. Transcript (agent replies = plain black
  markdown via `ai/MarkdownRenderer`, no bubbles), suggestions, CSV-paste
  helper strip (`data-csv-helper`), composer wiring.
- `SessionSwitcher.tsx` — session chrome lives in the GLOBAL HEADER via
  `useHeader().setPanelContent`: current title + dropdown (search business +
  recents + New conversation). Title flows through `session-title-store.ts`.
- `SessionPlusMenu.tsx` — the + menu: Add file / Add photo / Search existing
  photos (`/api/photos/library?q=`) / # Order number / Log details /
  @ Assign a task (staff picker → `POST /api/ops-plans/tasks` → dispatches a
  table artifact of that staff's open tasks).
- `artifacts/renderers.tsx` + `ArtifactViewPanel.tsx` — registry of validated
  read-only artifact views: table, timeline, ticket_thread, ticket_reply_draft
  (human Enter → `postTicketComment`), chart (SVG bar/line/donut), record,
  import_triage (human "Import accepted" → `POST /api/orders/import-csv`).
- `useSessionArtifacts.ts` — module store; listener armed at SURFACE level
  (`ensureSessionArtifactListener`) so + menu dispatches work in start state.

**Contract** — `src/lib/assistant/ui-artifacts.ts`
- Zod union for all artifact kinds + `sanitizeSessionArtifact` (boundary
  coercion: object cells → strings, stringy numbers/bools → typed, functions
  rejected) + `extractGfmTables` (chat-side table interception: any markdown
  table in agent text is MOVED to the panel).

**Loops** — `src/lib/assistant/agent-loop.ts` (Anthropic) +
`grok-agent-loop.ts` (SuperGrok via `integrations/grok/oauth.ts`).
- `render_artifact` UI tool + `print_handling_unit_labels` device tool +
  `navigate/highlight` + canvas stubs. Both loops validate `render_artifact`
  at the chokepoint via `parseRenderArtifactInput` (sanitize → zod → emit
  `{ artifact: parsed.data }`; invalid → is_error tool_result the model
  repairs in-turn).
- System core laws: render_artifact MANDATORY for data answers; chat is prose
  (no markdown tables); never navigate unless asked; CSV triage flow.

**Tools** — `src/lib/assistant/tools/` (39 registered in `index.ts`, all
permission-gated, `runAssistantTool` chokepoint; MCP-ready via
`lib/mcp/tool-server.ts`). Notables: `triage_orders_csv` (house import lane:
`parseCsv` + `autoMapCsvOrderHeaders` + `classifyCsvOrderStagingRow`),
`resolve_item_number`, `draft_ticket_reply`, home tools (daily/my-day/tasks),
29 domain reads.

**Brain** — Grok first (SuperGrok OAuth), Anthropic fallback. Re-connect:
`~/.grok/bin/grok login` → hit `GET /api/integrations/grok/connect` (imports
host session) → `GET /api/integrations/grok/health` must say ok. Refresh
tokens rotate; a stale refresh = "Invalid or unknown refresh token" in the
journal → re-login.

**Electron** — `electron/main.js`: silent print (`cf:print-html`), scan
hotkey, mirrored keybindings; single renderer bridge `src/lib/desktop/desktop-host.ts`.

**Ops** — dev server is a systemd USER unit: `systemctl --user restart
cycleforge-dev.service` (port 3050; Turbopack inotify panics after long
uptimes → restart fixes). Tunnel: `usav-dev.michaelgarisek.com` → 3050.
Composer voice: `POST /api/ai/transcribe` (multipart `audio`) → `{text}`.

## The laws (cohort-pinned — `src/lib/assistant/session-surface-cohort.test.ts`, 17 assertions)

1. Artifacts carry DATA never behavior; client zod-validates before render;
   invalid degrades to a notice, never a guess.
2. The artifact plane is READ-ONLY. Writes are: agent `propose_mutation`, or
   HUMAN Enter through existing chokepoints (ticket reply → postTicketComment;
   CSV import → /api/orders/import-csv; task → /api/ops-plans/tasks).
3. Chat is PROSE in markdown; agent replies are plain black text (no bubbles);
   tables/charts display ONLY as artifacts (leaked tables are intercepted by
   `extractGfmTables` and moved).
4. Every verb is a registered tool — page components never hand-roll backend
   actions (the two human-Enter exceptions above are deliberate).
5. Modes live in ONE dropdown (`composer-mode-dropdown`); the + trigger is
   leftmost; no standing mode faces.
6. The context ring reflects the MODEL'S real context (page, thread length,
   staged CSV) via `inlineRing` + `data-testid="model-context-list"` — never a
   static zero.
7. New conversation is a ROUTED verb: ⌘N/Ctrl+N, sidebar `/?new=1`, header
   switcher — no on-screen New button.
8. The composer never welds: `weldTop` is gone; the ask stage / feedback
   renders as its own narrower card (rounded-xl, inset) and the composer keeps
   its full rounded-2xl silhouette.
9. The sidebar unpin is GEOMETRY: pointer outside the shelf rect (measured at
   drag start, cleared only after resolution) = unpin; full-area "Release to
   unpin" overlay over everything below (`data-unpin-overlay`).
10. Panel announces before it paints (`ui_tool_start` → pending skeleton).

**When you add an artifact kind**: zod schema + sanitizer case + renderer +
panel switch + cohort assertions. When you add a tool: registry entry +
read-tools.test count/skip updates. When you change UI: `node
tools/design-mcp/ds.mjs stamp` first (hooks refuse UI writes without it).

## Known gaps / next (pick up here)

1. **File/photo upload** — + menu stages references only; wire real uploads
   (photo upload endpoint exists under `/api/photos`).
2. **Voice happy path** needs a real mic (contract verified; headless can't).
3. **Import dedupe** — import returned "0 added" for fresh order numbers once;
   eyeball `ingestCanonicalOrders` counting.
4. **Domain cutover ladder** — shipping → inventory → receiving: per domain,
   add read/verb tools → flip sidebar → delete desk pages via
   `pnpm run eval:discover` + `dead-code:report`. `src/features/{home,my-day,tasks}`
   trees are the next deletion candidates (registered table bindings first).
5. **Pattern backlog** — `docs/todo/design-system-ideas-LOOP.md` (warm-luxury
   design loop, home board with per-staff watcher tree, cursor personalization)
   and `docs/todo/ai-first-session-patterns-PLAN.md` (drill-down, proposal
   cards, follow-up chips, voice, scan-as-chat, audit trail, cross-device).
6. **Concurrency hazard** — another agent session edits this same tree
   (counter-session work, sidebar rail-less Phase A). Check `git status` first;
   their Settings/Admin sidebar test failure is THEIRS, not yours. Commit early.

## Verification (run these, in this order)

```bash
node scripts/verify.mjs --fast                     # lint + typecheck
node --import tsx --test src/lib/assistant/session-surface-cohort.test.ts
node --import tsx --test src/components/sidebar/master-nav/spine-drag-containment.test.ts
node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/assistant/tools/read-tools.test.ts
node scripts/ci-status.mjs                          # CI receipts (do not re-run the full gate)
```

E2E by hand (browser at `/`): paste CSV → Triage → artifact → Import accepted;
+ menu → @ Assign a task → artifact of that staff's tasks; ⌘N → fresh landing;
drag a pin out of the sidebar → "Release to unpin" overlay → unpinned with undo.
