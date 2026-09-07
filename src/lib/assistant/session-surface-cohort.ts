/**
 * Session-surface cohort — SoT is the artifact CONTRACT: the agent SHOWS data
 * on the assistant view panel (the home surface) through validated, read-only
 * artifacts, and every verb is a registered tool.
 *
 * Eval: `node --import tsx --test src/lib/assistant/session-surface-cohort.test.ts`
 * (wired into scripts/verify-profile.mjs as the `Cohort: session` gate).
 *
 * Laws this cohort pins:
 *   1. Artifacts carry DATA, never behavior — the zod contract admits plain
 *      strings/numbers only; no HTML, no callbacks, no component refs. The
 *      client validates BEFORE rendering and degrades to a notice, never a
 *      rendered guess.
 *   2. Artifact views never mutate. No renderer imports the mutation/write
 *      machinery; the only sanctioned write is the ticket reply draft's human
 *      ENTER, which goes through the same photo-ticket chokepoint the support
 *      console uses under the user's own session.
 *   3. Every verb is a registered tool. Page components never hand-roll an
 *      action against the backend that the tool registry doesn't expose — the
 *      agent composes the same registry MCP serves.
 *   4. Keyboard-reachable: the view panel's interactive elements bind keys
 *      (j/k move, Enter attach, Enter send) — mouse is an alias, never the
 *      only path.
 *   5. The panel paints on ANNOUNCEMENT, not on completion: both loops emit
 *      `ui_tool_start` when the model OPENS a UI tool block, the chat hook
 *      forwards render_artifact's start to SESSION_ARTIFACT_PENDING_EVENT, and
 *      the store holds ONE pending slot the arriving artifact replaces.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SESSION_SURFACE_COHORT_TRIPWIRE =
  'src/lib/assistant/session-surface-cohort.test.ts' as const;

export const SESSION_SURFACE_ENGINE = {
  contract: 'src/lib/assistant/ui-artifacts.ts',
  agentLoop: 'src/lib/assistant/agent-loop.ts',
  grokLoop: 'src/lib/assistant/grok-agent-loop.ts',
  chatHook: 'src/components/assistant/useAssistantChat.ts',
  appEvents: 'src/lib/app-events.ts',
  artifactStore: 'src/components/session/useSessionArtifacts.ts',
  surface: 'src/components/session/SessionSurface.tsx',
  sessionPanel: 'src/components/session/AgentSessionPanel.tsx',
  sessionSwitcher: 'src/components/session/SessionSwitcher.tsx',
  sidebarNav: 'src/lib/sidebar-navigation.ts',
  artifactPanel: 'src/components/session/artifacts/ArtifactViewPanel.tsx',
  renderers: 'src/components/session/artifacts/renderers.tsx',
  draftTool: 'src/lib/assistant/tools/ticket-reply-tools.ts',
  importTriageTool: 'src/lib/assistant/tools/import-triage-tools.ts',
  toolRegistry: 'src/lib/assistant/tools/index.ts',
  boardOccupant: 'src/components/session/session-panel-occupant.ts',
  missionPane: 'src/components/session/MissionPane.tsx',
  triageLedger: 'src/components/session/TriageLedger.tsx',
  focusWake: 'src/components/session/use-focus-wake.ts',
  floorFeed: 'src/components/session/useFloorFeed.ts',
  boardRows: 'src/components/session/board/board-tiles.ts',
  boardRoute: 'src/app/api/home-board/route.ts',
  gapTool: 'src/lib/assistant/tools/roi-gap-tools.ts',
  connectPill: 'src/components/session/ConnectAppPill.tsx',
} as const;

/** Structural markers the surface files must contain (compile-checked by the tripwire below). */
export const SESSION_SURFACE_CONTRACT = {
  zodValidatedPayload: 'sessionArtifactSchema',
  discriminatedKinds: 'ticket_reply_draft',
  uiToolForward: "name === 'render_artifact'",
  deviceToolForward: "name === 'print_handling_unit_labels'",
  rendererTable: 'export function TableArtifact',
  /** One validator for both loops — and it emits the shape the client reads. */
  artifactChokepoint: 'parseRenderArtifactInput(',
  artifactEmitShape: 'input: { artifact: parsed.data }',
  rendererReplyDraft: 'export function TicketReplyDraftArtifact',
  keyboardAttach: "e.key === 'Enter'",
  keyboardMove: "'j'",
  /** Law 5 — the loops announce an opened UI tool block before its input lands. */
  uiToolStartEmit: "type: 'ui_tool_start'",
  toolStartHook: 'onToolStart',
  /** Law 5 — the client turns that announcement into the panel's pending slot. */
  pendingEventExport: "SESSION_ARTIFACT_PENDING_EVENT = 'app:session-artifact-pending'",
  pendingEventName: 'SESSION_ARTIFACT_PENDING_EVENT',
  pendingStartForward: "event === 'ui_tool_start'",
  pendingSlotReplaced: 'pending = null',
  pendingSkeletonMarker: 'data-artifact-pending',
  /** Law 6 — the session chrome lives in the GLOBAL HEADER, not on the panel. */
  headerPublish: 'setPanelContent(<SessionSwitcher />)',
  /** Law 7 — New conversation is a ROUTED verb: ⌘N/Ctrl+N, sidebar `/?new=1`,
   * and the header switcher. No on-screen New button on the panel. */
  newVerbChord: "e.key.toLowerCase() === 'n'",
  newVerbSidebar: "href: '/?new=1'",
  /** Law 8 — CSV import triage: the house lane parses, the human imports. */
  triageTool: 'triage_orders_csv',
  triageRenderHint: 'import_triage artifact',
  triageRenderer: 'export function ImportTriageArtifact',
  triageImportEndpoint: "fetch('/api/orders/import-csv'",
  triagePasteStrip: 'data-csv-helper',
  /**
   * Law 9 (rewritten 2026-09-06) — ONE COMPOSER DISPLAY.
   *
   * The home mouth is the assistant's, and it honors exactly one destination:
   * the model. It therefore
   *   • declares its mode set (`modes={['ask']}`) instead of inheriting the
   *     station's shared Unbox | Ticket | Ask session mode,
   *   • owns the field (`askOwnedBySurface`), so ONE draft is displayed,
   *     committed, and seeded — never a label draft behind an ask draft behind
   *     a ticket draft in the same textarea,
   *   • NAMES that mode on row two rather than offering a picker whose other
   *     rows commit nowhere, and
   *   • derives the row's commit control from the VISIBLE field, so an empty
   *     composer always offers the microphone and a typed one always offers
   *     send.
   *
   * The superseded law required a three-mode dropdown on this surface. It
   * shipped a Zendesk claim body and a sticker note on the assistant's home
   * screen, reachable with Shift+Tab, with a send button reporting a draft the
   * operator could not see.
   */
  composerOneMode: "modes={['ask']}",
  composerOneField: 'askOwnedBySurface',
  composerModeNamed: 'data-testid="composer-mode-name"',
  composerModeSet: 'const honoredModes',
  composerVisibleFieldCommit: 'hasText: value.trim().length > 0',
  plusMenuContent: 'plusMenuContent',
  plusTaskFile: 'src/components/session/SessionPlusMenu.tsx',
  plusTaskApi: "fetch('/api/ops-plans/tasks'",
  /** Law 10 — the context ring reflects the model's real context. */
  ringOwned: 'inlineRing',
  ringList: 'data-testid="model-context-list"',
  /**
   * Law 15 (2026-09-06) — THE FIRST ROW IS THE OPERATION.
   *
   * The row above the composer states what is stuck across the four pillars
   * this platform integrates — support, order triage, refurbishment,
   * fulfillment — worst first, and every item seeds the question its own tool
   * authored. Constraints that make it an instrument rather than decoration:
   *
   *   • its numbers come from `/api/home-board`, i.e. registered tools through
   *     `runAssistantTool`, so the row, the board rail and the model's answer
   *     are one query with one permission check. No first-row endpoint.
   *   • ranking is LANE-first, not magnitude-first: a customer waiting outranks
   *     any amount of idle stock. The lanes live in one pure, tested module.
   *   • every item carries a `question` and a click SEEDS it — never sends.
   *   • the row reads. It never posts, mutates, or writes.
   */
  pulseLedgerMarker: 'data-testid="triage-ledger"',
  pulseRowOnPick: 'onPick',
  pulseLanes: 'const LANE_RANK',
  pulseBoardFeed: "fetch('/api/home-board'",
  pulseTelemetryTotals: 'pulsePillarTotals',
  /**
   * Law 17 (2026-09-06) — THE LEDGER IS AN INSTRUMENT.
   *
   * The ranked list is the machine's panel, not a poster. Every row is the
   * same height on the same six-column grid, one typographic voice (sentence
   * titles beside mono tabular figures in fixed columns), and rank is
   * POSITION plus one gilt accent — never font size. The superseded first
   * row mixed 24px serif, ~11px pills and a caption on one baseline; that
   * mixed-voice failure is what this law exists to prevent. The WHY rides a
   * HoverTooltip (cursor-morph on the desk) — native `title` tooltips are
   * the regression, not the convention.
   */
  ledgerRowGrid: 'grid-cols-[3ch',
  ledgerMonoNumerals: 'tabular-nums',
  ledgerWhy: 'HoverTooltip',
  /**
   * Law 11 (v2 2026-09-06) — the right pane has ONE occupant, and its
   * resting face is the MISSION pane (telemetry strip over the live floor
   * feed). Artifacts push it aside; closing one returns to the floor. The
   * pane is state on `/`, never a route, so nothing here can drop the live
   * thread. ⌘B is the routed verb. The mission plane is READ-only: the
   * telemetry cells' whole behavior is seeding a question
   * (`requestComposerSeed`), and the floor feed renders — no hover verbs,
   * no links, no writes.
   */
  paneOccupantType: "export type SessionPanelOccupant = 'artifact' | 'board'",
  paneOccupantSwitch: "occupant === 'artifact'",
  boardVerbChord: "e.key.toLowerCase() === 'b'",
  missionPaneMarker: 'data-testid="mission-pane"',
  missionTelemetryMarker: 'data-testid="mission-telemetry"',
  missionFeedMarker: 'data-testid="mission-feed"',
  missionSeedVerb: 'requestComposerSeed',
  /**
   * Law 16 (2026-09-06) — THE POWER-UP.
   *
   * The greeting is the RESTING face; the mission frame is EARNED by
   * activity (`useFocusWake`: pointer travel, key, touch). The transition is
   * the surface's ONE choreographed moment — the composer is a single node
   * in both faces, so motion `layout` tweens the room together and no draft,
   * voice state or focus is ever remounted away. Reduced motion collapses
   * the choreography to a hard swap. A thread with messages PINS focus;
   * stillness with an empty thread settles back to the question. The
   * greeting is never deleted — it is the room's honest off state.
   */
  wakeHook: 'useFocusWake',
  wakePinnedThread: 'pinned: started',
  wakeOneComposer: 'data-testid="session-composer-dock"',
  wakeGreetingKept: 'function WelcomeGreeting',
  wakeReducedHardSwap: 'layout={!reduced}',
  /**
   * Law 12 — the board and the agent read the SAME registered tools. The route
   * dispatches through `runAssistantTool`, so a tile cannot drift from an
   * answer, and a tool the caller lacks permission for degrades to one denied
   * tile instead of failing the board.
   */
  boardDispatch: 'runAssistantTool(tile.tool',
  boardGapTool: 'get_roi_gaps',
  /**
   * Law 13 — an app connection is handed over IN CHAT, as a pill with one CTA,
   * and the link is always the one the server minted. The chat surface never
   * collects a credential and the model never builds an OAuth URL.
   *
   * `https://` alone is not that guarantee — it admits every https host a
   * prompt-injected document can name. Both loops therefore check PROVENANCE
   * at the same chokepoint that validates an artifact: the URL must be one a
   * connect tool returned in this turn.
   */
  connectUiTool: "name: 'request_connection'",
  connectPillMarker: 'data-connect-pill',
  connectHttpsOnly: "connectUrl.startsWith('https://')",
  connectProvenanceChokepoint: 'parseRequestConnectionInput(',
  connectProvenanceLedger: 'collectMintedConnectUrls(',
  /**
   * Law 14 — the LOCAL brain's calls are real calls. `gpt-oss` (the base under
   * the promoted CycleForge LoRA, served as `default_model`) emits tool intent
   * as Harmony channel text, never `tool_calls`, and streams its private
   * `analysis` channel as ordinary content. The loop routes both through the
   * one shared grammar in `src/lib/ai/harmony.ts` — extraction AND
   * suppression — so a fine-tuned turn dispatches tools and the operator never
   * reads the model's deliberation.
   */
  harmonyToolBridge: 'parseHarmonyToolCalls(',
  harmonyTextFilter: 'createHarmonyTextFilter(',
} as const;

/** Source patterns that would put BEHAVIOR or mutation into the artifact plane. */
export const SESSION_SURFACE_FORBIDDEN = {
  htmlInjection: /dangerouslySetInnerHTML/,
  mutationImport: /from\s+'@\/lib\/assistant\/mutations\//,
  writeToolImport: /from\s+'\.\/write-tools'|from\s+'@\/lib\/assistant\/tools\/write-tools'/,
  /** The artifact plane POSTs nowhere itself — the reply send is postTicketComment's chokepoint. */
  rawMutationFetch: /fetch\((['"`])\/api\/assistant\/mutations/,
} as const;

export function sessionSurfaceSource(rel: string): string {
  const abs = join(process.cwd(), rel);
  if (!existsSync(abs)) throw new Error(`missing ${rel}`);
  return readFileSync(abs, 'utf8');
}

/** Files the artifact plane is built from — all must stay behavior-free. */
export const ARTIFACT_PLANE_FILES = [
  SESSION_SURFACE_ENGINE.contract,
  SESSION_SURFACE_ENGINE.artifactStore,
  SESSION_SURFACE_ENGINE.artifactPanel,
  SESSION_SURFACE_ENGINE.renderers,
] as const;
