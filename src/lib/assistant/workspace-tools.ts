'use client';

/**
 * Workspace tools — the ONE function every AI-driven action against the
 * Warehouse OS goes through.
 *
 * ## Why a dispatch table and not a switch
 *
 * `useAssistantChat.runUiTool` was a ~30-line `if` cascade with the router, the
 * Studio context and `window.dispatchEvent` inlined into it. That was fine while
 * the AI could do exactly two things (push a URL, flash a row). It stops being
 * fine the moment the model can open tiles, arrange the canvas and start
 * sessions: those are OS verbs, and an OS verb needs a place where it can be
 * logged, permission-checked and undone. A switch inside a React hook is not
 * that place — it is unreachable from a test, from the Process tool, and from
 * anything that is not the chat dock.
 *
 * So the mapping from (verb, model-supplied input) to a store call lives here,
 * as data, with its collaborators injected. Every outcome passes through
 * {@link runWorkspaceTool}: one function, one log sink ({@link WorkspaceToolDeps.log}),
 * one place a future permission check would go, and one place that reports the
 * INVERSE of what it just did (see below).
 *
 * ## >>> THE AI IS NEVER IN THE SCAN PATH <<<
 *
 * A wedge scan is ~50ms. A model round-trip is 1–3 SECONDS. The floor is loud
 * and operators wear gloves, so if the assistant were the only way to open a
 * tile, an API outage would stop the warehouse. Three properties keep that
 * true, and all three are pinned by tests rather than by this paragraph:
 *
 *   1. **`runWorkspaceTool` is SYNCHRONOUS.** It returns an outcome, never a
 *      promise. Nothing downstream can `await` it, so no scan handler can end up
 *      blocked on the agent loop by accident — the type system refuses.
 *   2. **`open_tile` never arms the scanner.** Opening a session tile restores
 *      a tab; it does not publish an active session. A tile the model opened
 *      cannot take the wedge away from the bench an operator is working.
 *      Only `start_session` (a new session) and `focus_tile` on a session tile
 *      (an explicit resume) arm, and both narrate the trade.
 *   3. **No verb here reads a scan or writes a scan result.** The scanner owns
 *      throughput; the assistant owns arrangement, presets and reflection.
 *
 * ## The model never sees the outcome — the operator does
 *
 * Client tools are fire-and-forget by construction: the server loop emits a
 * `ui_tool` SSE frame and acknowledges it to the model in the same tick, so
 * nothing the browser learns can travel back up that turn. That is not a gap to
 * paper over with an optimistic "done" — several of these verbs really can
 * refuse:
 *
 *   • `openTab` / `openTool` return `null` when every slot holds a PINNED tab.
 *     A pin is a promise; the store would rather refuse to grow than break one.
 *   • an id the model repeats back from three turns ago may name a tile the
 *     operator has since closed.
 *   • `save_layout` / `set_layout(layoutId)` / `end_session` name collaborators
 *     the shell has to supply. When it has not, they say so plainly instead of
 *     pretending — see {@link WorkspaceToolFailureCode} → `unsupported`.
 *
 * All of them return a typed failure with an operator-readable `message`, and
 * the dock renders it in the transcript. The operator is the feedback channel:
 * they can see it did not happen and say so. The system prompt tells the model
 * this contract up front (see `agent-loop.ts` → `buildSystemCore`).
 *
 * ## Arming is not a parameter
 *
 * Ruled 2026-08-22: exactly ONE scan session is armed app-wide, and
 * `getArmedScanSession()` is the entire ownership model. `setActiveSession`
 * holds one slot, so publishing a scan session DISARMS the previous one by
 * construction. There is deliberately no `armed` input on `start_session` —
 * a parameter the model could set is a parameter the model could use to try to
 * hold two, and the invariant would then live in prose instead of in the shape
 * of the code.
 *
 * ## No permission field
 *
 * Ruled: tile / session / tool descriptors carry no permission. Authority stays
 * on the ~969 `withAuth`-gated API routes and on the assistant's server tools,
 * where it is enforced against the session cookie rather than against something
 * the client could edit. A second, weaker copy of that check in the window
 * manager would be a liability, not a defence: it would read as protection
 * while protecting nothing.
 *
 * ## Every success names its own inverse
 *
 * A success carries `inverse` — the verb and input that would undo it — as
 * DATA, not as an executed rollback. `apply-agent-mutation.ts` earned the right
 * to a real `revert_mutation` because a server mutation is atomic and its
 * before-image is capturable; a workspace verb is not (the operator is moving
 * tiles at the same time). So the dispatch reports what the inverse WOULD be
 * and leaves the decision to whatever holds the undo stack — which is how the
 * shell can offer "undo that" without this module owning history it cannot see.
 */

import { ASSISTANT_HIGHLIGHT_EVENT } from '@/lib/app-events';
import {
  activateTab,
  applyCanvasPreset,
  hydrateCanvasLayout,
  serializeCanvasLayout,
  splitFocusedPane,
} from '@/lib/canvas/store';
import type { CanvasOrientation } from '@/lib/canvas/layout';
import type { CanvasPresetId } from '@/lib/canvas/presets';
import { resolveCanvasTile } from '@/lib/canvas/tile-registry';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { getTool } from '@/lib/tools/registry';
import { closeToolsOf, openTool, pinTool, unpinTool } from '@/lib/tools/store';
import {
  clearActiveSession,
  setActiveSession,
  type ActiveSession,
} from '@/lib/session-context/store';
import {
  SCAN_SESSION_TYPES,
  isScanSessionType,
  type ScanSessionType,
} from '@/lib/sessions/types';
import {
  closeTab,
  focusTab,
  getTab,
  getWorkspaceSnapshot,
  openTab,
  pinTab,
  unpinTab,
} from '@/lib/workspace/store';
import type { TabDescriptor, TabKind, TabParamValue, TabParams } from '@/lib/workspace/types';

/* ── Vocabulary ──────────────────────────────────────────────────────────── */

/**
 * Every verb the model may execute in the browser.
 *
 * This union is the contract between the two halves of the feature: the tool
 * SCHEMAS in `agent-loop.ts` are typed `Record<UiToolName, …>` and the HANDLERS
 * below are typed `Record<UiToolName, …>`, so adding a verb to this list is a
 * compile error in both files until both have answered. That is the enforcement
 * mechanism — a required key with no default — not a test that greps for names.
 *
 * It lives in this (client) module rather than in the loop because the loop
 * imports the Anthropic SDK and the org-key vault; the loop takes it back as a
 * type-only import, which erases at compile time and leaves no runtime edge
 * between the server bundle and the browser store.
 *
 * ONE VERB PER JOB. There is no `open_tool` beside `open_tile` and no
 * `focus_session` beside `focus_tile`: a tile's KIND is a parameter, never a
 * second verb, because two verbs for one job is how the model comes to believe
 * they behave differently.
 */
export type UiToolName =
  // View state — router / DOM / Studio.
  | 'navigate'
  | 'highlight'
  | 'focus_node'
  | 'set_lens'
  | 'set_zoom'
  // Window manager.
  | 'open_tile'
  | 'close_tile'
  | 'focus_tile'
  | 'split_tile'
  // Arrangement.
  | 'set_layout'
  | 'save_layout'
  // Session lifecycle.
  | 'start_session'
  | 'end_session'
  // Tool palette.
  | 'pin_tool'
  | 'unpin_tool';

/**
 * The `/studio` overlay lenses `set_lens` accepts — the subset of `StudioLens`
 * the assistant is allowed to set. (`procedure` is a legal URL value the tool
 * never offered.)
 */
export const STUDIO_LENSES = ['build', 'live', 'flow', 'people', 'gaps', 'static'] as const;
export type StudioLensName = (typeof STUDIO_LENSES)[number];

/**
 * Canvas arrangements `set_layout` accepts, in the words an operator would say
 * out loud.
 *
 * The translation to `CanvasPresetId` lives here rather than in the model's
 * schema: `triptych` is an internal name that would make the tool description
 * worse, and a model guessing it would be guessing at an implementation detail
 * instead of describing what the operator asked for. An operator who wants a
 * third pane says "split it again", which is `split_tile`.
 */
export const LAYOUT_PRESETS = ['single', 'columns', 'rows', 'grid'] as const;
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];

const LAYOUT_TO_CANVAS_PRESET: Readonly<Record<LayoutPreset, CanvasPresetId>> = Object.freeze({
  single: 'focus',
  columns: 'compare',
  rows: 'stack',
  grid: 'quad',
});

/**
 * Directions `split_tile` accepts.
 *
 * Both vocabularies are here on purpose. The canvas splits on an ORIENTATION
 * (`row` / `column`) but an operator says "put the manual to the LEFT", and a
 * model told only about orientations will reach for `left` anyway. Accepting
 * both and normalizing once is cheaper than a refusal the operator experiences
 * as the assistant not understanding English.
 */
export const SPLIT_DIRECTIONS = ['right', 'left', 'up', 'down', 'row', 'column'] as const;
export type SplitDirection = (typeof SPLIT_DIRECTIONS)[number];

const SPLIT_TO_ORIENTATION: Readonly<Record<SplitDirection, CanvasOrientation>> = Object.freeze({
  right: 'row',
  left: 'row',
  row: 'row',
  up: 'column',
  down: 'column',
  column: 'column',
});

/** Tile kinds `open_tile` accepts — the workspace's own `TabKind`, unnarrowed. */
export const TILE_KINDS = ['session', 'table', 'tool'] as const;

/**
 * What a saved layout may be filed under. The scan benches plus `task`, i.e.
 * the session vocabulary — a preset is "how I arrange the canvas WHEN I am
 * doing this kind of work", so any other key would file it under something the
 * shell cannot recognise later.
 */
export const LAYOUT_SESSION_TYPES = [...SCAN_SESSION_TYPES, 'task'] as const;
export type LayoutSessionType = (typeof LAYOUT_SESSION_TYPES)[number];

function isLayoutSessionType(value: unknown): value is LayoutSessionType {
  return typeof value === 'string' && (LAYOUT_SESSION_TYPES as readonly string[]).includes(value);
}

/**
 * Operator-facing titles for a scan session started by the AI. A closed
 * `Record` over the scan vocabulary, so a new bench in `SCAN_SESSION_TYPES` is
 * a compile error here rather than a session tile labelled `undefined`.
 */
const SCAN_SESSION_TITLES: Record<ScanSessionType, string> = {
  unbox: 'Unbox',
  triage: 'Triage',
  pickup: 'Pickup',
  test: 'Testing',
  pack: 'Packing',
  outbound: 'Outbound',
};

/* ── Saved layouts ───────────────────────────────────────────────────────── */

/** One preset arrangement, filed by session type. */
export interface SavedWorkspaceLayout {
  readonly id: string;
  readonly name: string;
  /** `null` = a general-purpose layout, not tied to a kind of work. */
  readonly sessionType: LayoutSessionType | null;
  /** A `CanvasNode` tree. Opaque here — `parseCanvasLayout` is its validator. */
  readonly root: unknown;
  readonly maximizedGroupId: string | null;
  readonly savedAt: number;
}

/**
 * The durable home for {@link SavedWorkspaceLayout}s.
 *
 * A SEAM, not an implementation: saved layouts belong in
 * `staff_preferences.prefs.workspace` beside `canvas`, which is the workspace
 * lane's module to grow. Until it does, the shell passes nothing and the two
 * verbs that need it refuse with `unsupported` — which is the honest failure.
 * A local-only "saved" that evaporates on reload would teach an operator to
 * distrust every preset they make.
 */
export interface WorkspaceLayoutStore {
  save: (layout: SavedWorkspaceLayout) => void;
  get: (id: string) => SavedWorkspaceLayout | undefined;
  list: (sessionType?: LayoutSessionType | null) => readonly SavedWorkspaceLayout[];
}

/**
 * The durable half of ending a session (`work_sessions.status = 'ended'`).
 *
 * Also a seam. `end_session` must not do a LOCAL-ONLY teardown: a session whose
 * tab is gone but whose row still reads `open` and `armed` is a split brain the
 * next device inherits, and it is exactly what `work-sessions.ts` takes a
 * partial unique index to prevent. Absent bridge → refuse, never half-end.
 */
export interface SessionLifecycleBridge {
  /** Fire-and-forget POST to the session lifecycle route. */
  end: (sessionId: string) => void;
}

/**
 * `save_layout` names are operator words; a layout ID has to survive a round
 * trip through a model that will retype it from memory. Slugging is what makes
 * re-saving "Unbox morning" REPLACE the earlier one instead of accumulating a
 * second preset the operator can no longer tell apart.
 */
export function layoutIdFor(name: string, sessionType: LayoutSessionType | null): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'layout';
  return sessionType ? `${sessionType}:${slug}` : slug;
}

/* ── Outcomes ────────────────────────────────────────────────────────────── */

export type WorkspaceToolFailureCode =
  | 'unknown_verb'
  | 'invalid_input'
  | 'unknown_tile'
  | 'unknown_tool'
  | 'workspace_full'
  /** The verb is real, but the shell did not wire the collaborator it needs. */
  | 'unsupported';

/**
 * The verb + input that would undo a success. DATA, never executed here — see
 * the file docblock on why a workspace verb cannot own its own rollback.
 */
export interface WorkspaceToolInverse {
  verb: UiToolName;
  input: Readonly<Record<string, unknown>>;
}

export interface WorkspaceToolSuccess {
  ok: true;
  verb: UiToolName;
  /** One past-tense clause, for a log line or a debug readout. */
  effect: string;
  /** The tile this verb opened / focused / closed, when it named one. */
  tileId?: string;
  /** What would undo this, when an inverse exists. Absent = not reversible. */
  inverse?: WorkspaceToolInverse;
}

export interface WorkspaceToolFailure {
  ok: false;
  /** Not narrowed to {@link UiToolName}: an unknown verb is a real outcome. */
  verb: string;
  code: WorkspaceToolFailureCode;
  /**
   * Written FOR THE OPERATOR, not for a log: this string is rendered in the
   * chat transcript, because the operator is the only channel back to the model.
   */
  message: string;
}

export type WorkspaceToolOutcome = WorkspaceToolSuccess | WorkspaceToolFailure;

/** One line of the dispatch log. Every verb produces exactly one. */
export interface WorkspaceToolLogRecord {
  verb: string;
  input: Readonly<Record<string, unknown>>;
  outcome: WorkspaceToolOutcome;
  at: number;
}

/* ── Injected collaborators ──────────────────────────────────────────────── */

/**
 * Everything the dispatch touches that is not a pure function of its input.
 * Injected so the whole table is exercisable from `node:test` with no React, no
 * DOM and no router — and so the browser bridge (router.push, the Studio
 * context) stays in the hook where the React it needs already lives.
 */
export interface WorkspaceToolDeps {
  openTab: typeof openTab;
  closeTab: typeof closeTab;
  focusTab: typeof focusTab;
  pinTab: typeof pinTab;
  unpinTab: typeof unpinTab;
  getTab: typeof getTab;
  getWorkspaceSnapshot: typeof getWorkspaceSnapshot;
  /**
   * Does anything know how to MOUNT this tile? The registry is the arbiter for
   * tables and sessions the same way `getTool` is for tools — without it the
   * model can invent a plausible ref and the operator gets an empty tile
   * instead of being told the thing does not exist. Client verbs are
   * fire-and-forget, so the model never learns from the empty tile; the
   * operator has to.
   */
  resolveTile: typeof resolveCanvasTile;
  /**
   * The TOOL palette, which is a different store from the tile strip on
   * purpose. A tool has a lifecycle a tile does not — `MAX_OPEN_TOOLS`, the
   * oldest-unfocused eviction rule, pinning by KEY rather than by instance, and
   * the WebUSB user-activation question — and all of it lives in
   * `@/lib/tools/store`. For a while both stores could answer "is the Photo
   * Library open" and disagree, because the rail palette read one and the tile
   * strip read the other. The palette wins for a tool opened BY NAME, which is
   * the only way the assistant can ask for one.
   */
  openTool: typeof openTool;
  closeToolsOf: typeof closeToolsOf;
  pinTool: typeof pinTool;
  unpinTool: typeof unpinTool;
  getTool: typeof getTool;
  /** Canvas arrangement. `activateTab` also focuses the workspace tab. */
  activateTab: typeof activateTab;
  applyCanvasPreset: typeof applyCanvasPreset;
  splitFocusedPane: typeof splitFocusedPane;
  serializeCanvasLayout: typeof serializeCanvasLayout;
  hydrateCanvasLayout: typeof hydrateCanvasLayout;
  setActiveSession: typeof setActiveSession;
  clearActiveSession: typeof clearActiveSession;
  /** `router.push` — some of the app is still route-addressable mid-refactor. */
  navigate: (href: string) => void;
  /** Studio view state (`?focus/z/lens`); hard-routes to /studio from anywhere. */
  setStudioParams: (patch: Record<string, string>) => void;
  /** `window.dispatchEvent(new CustomEvent(name, { detail }))`. */
  emitAppEvent: (name: string, detail: unknown) => void;
  /** Session-id minter. Injected so the test is deterministic. */
  newSessionId: () => string;
  now: () => number;
  /** Absent = the shell has no saved-layout store yet; those verbs refuse. */
  layoutStore?: WorkspaceLayoutStore;
  /** Absent = no durable session end is reachable; `end_session` refuses. */
  sessionLifecycle?: SessionLifecycleBridge;
  /**
   * Dispatch log. Called once per verb with the outcome, success or not.
   * Optional because a test does not need one — but it is the reason this
   * module is a single entry point rather than fifteen exported functions.
   */
  log?: (record: WorkspaceToolLogRecord) => void;
}

/**
 * The real deps, minus the halves only the shell can supply (the router, the
 * Studio view state, and the two durable seams). Everything else is a module
 * singleton or a policy that belongs to the dispatch rather than to whichever
 * component mounted it — id minting included, so a second caller cannot invent
 * a different scheme.
 */
export function browserWorkspaceToolDeps(bridge: {
  navigate: (href: string) => void;
  setStudioParams: (patch: Record<string, string>) => void;
  layoutStore?: WorkspaceLayoutStore;
  sessionLifecycle?: SessionLifecycleBridge;
  log?: (record: WorkspaceToolLogRecord) => void;
  /** Override only in a harness that needs deterministic ids. */
  newSessionId?: () => string;
}): WorkspaceToolDeps {
  return {
    openTab,
    closeTab,
    focusTab,
    pinTab,
    unpinTab,
    getTab,
    getWorkspaceSnapshot,
    resolveTile: resolveCanvasTile,
    openTool,
    closeToolsOf,
    pinTool,
    unpinTool,
    getTool,
    activateTab,
    applyCanvasPreset,
    splitFocusedPane,
    serializeCanvasLayout,
    hydrateCanvasLayout,
    setActiveSession,
    clearActiveSession,
    navigate: bridge.navigate,
    setStudioParams: bridge.setStudioParams,
    emitAppEvent: (name, detail) => {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    },
    newSessionId: bridge.newSessionId ?? (() => `sess-${safeRandomUUID()}`),
    now: () => Date.now(),
    layoutStore: bridge.layoutStore,
    sessionLifecycle: bridge.sessionLifecycle,
    log: bridge.log,
  };
}

/* ── Tile identity ───────────────────────────────────────────────────────── */

/**
 * Tools are SINGLETONS: one Photo Library, not one per invocation. Passing an
 * explicit id to `openTab` is what makes re-opening focus the existing tile
 * instead of minting a second, so the id has to be derivable — which also means
 * the model can name a tool tile it never saw the id of.
 */
export function toolTileId(toolKey: string): string {
  return `tool:${toolKey}`;
}

/** Session tiles get a derivable id for the same reason. */
export function sessionTileId(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Resolve whatever the model called a tile into an open tile.
 *
 * Forgiving on purpose: the model never receives the id `openTab` minted (the
 * ack it gets is "dispatched"), so it will reach for whatever string it has —
 * the tool key, the session id, the prefixed tile id it inferred from the
 * schema. Each of those names exactly one tile, so accepting all of them costs
 * nothing and refusing them would make the verbs unusable in practice.
 */
function resolveTile(raw: string, deps: WorkspaceToolDeps): TabDescriptor | undefined {
  return (
    deps.getTab(raw) ??
    deps.getTab(toolTileId(raw)) ??
    deps.getTab(sessionTileId(raw)) ??
    deps.getWorkspaceSnapshot().openTabs.find((tab) => tab.ref === raw)
  );
}

/**
 * As {@link resolveTile}, plus the one shorthand an operator actually says out
 * loud: "the unbox session". A scan type names at most one open session tile in
 * practice, because arming a second bench disarms the first.
 */
function resolveTileOrBench(raw: string, deps: WorkspaceToolDeps): TabDescriptor | undefined {
  const direct = resolveTile(raw, deps);
  if (direct) return direct;
  return deps
    .getWorkspaceSnapshot()
    .openTabs.find((tab) => tab.kind === 'session' && tab.params.scanType === raw);
}

/**
 * Rebuild the live-session record from a session tile.
 *
 * The TILE is the durable half — it survives a reload through
 * `staff_preferences.prefs.workspace` — and the active-session store is the
 * header's view of whichever one is focused. Keeping `startedAt` in params
 * rather than restamping it on focus is what makes a parked session resume with
 * its real elapsed time instead of pretending it just began.
 */
function sessionFromTile(tile: TabDescriptor, fallbackStartedAt: number): ActiveSession {
  const rawTitle = tile.params.title;
  const title = typeof rawTitle === 'string' && rawTitle ? rawTitle : 'Session';
  const rawStartedAt = tile.params.startedAt;
  const startedAt = typeof rawStartedAt === 'number' ? rawStartedAt : fallbackStartedAt;
  const scanType = tile.params.scanType;
  if (isScanSessionType(scanType)) {
    return { id: tile.ref, kind: 'scan', scanType, title, startedAt };
  }
  return { id: tile.ref, kind: 'task', title, startedAt };
}

/* ── Input coercion ──────────────────────────────────────────────────────── */

const MAX_PARAM_KEYS = 24;
const MAX_PARAM_KEY_LENGTH = 64;
const MAX_PARAM_VALUE_LENGTH = 2000;
const TOOL_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
const NODE_ID_PATTERN = /^[a-z0-9:_-]+$/i;

/**
 * Resolve an identifier to a REGISTERED tool key, or `null` if it names
 * something else (a session, a table, a tile id that is not a tool).
 *
 * Accepts both the bare key and the `tool:<key>` instance-id form, because the
 * assistant is told both are valid and because a singleton tool's instance id
 * IS `tool:<key>` — so the model will echo back whatever `open_tile` returned.
 * The registry is the arbiter: an unregistered key falls through to the tile
 * path rather than being silently treated as a tool that failed to open.
 */
function toolKeyFor(raw: string, deps: WorkspaceToolDeps): string | null {
  const bare = raw.startsWith('tool:') ? raw.slice('tool:'.length) : raw;
  if (!bare || !TOOL_KEY_PATTERN.test(bare)) return null;
  return deps.getTool(bare) ? bare : null;
}

function readString(value: unknown, maxLength = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * Coerce a model-supplied bag into {@link TabParams}.
 *
 * The clamps are not cosmetic. `prefs-schema.ts` caps a param key at 64 chars
 * and a string value at 2000, and `parseWorkspacePrefs` validates the WHOLE
 * workspace bag in one `safeParse` — so one 5,000-character param invented by a
 * model would fail the parse and the operator would lose every tile on the next
 * hydrate. Nested values are dropped rather than stringified: params are flat by
 * contract, because the prefs merge is shallow.
 */
function readTileParams(value: unknown): TabParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, TabParamValue> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PARAM_KEYS) break;
    if (!key || key.length > MAX_PARAM_KEY_LENGTH) continue;
    if (raw === null || typeof raw === 'boolean') {
      out[key] = raw;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = raw;
    } else if (typeof raw === 'string') {
      out[key] = raw.slice(0, MAX_PARAM_VALUE_LENGTH);
    }
  }
  return out;
}

/** Query params for `navigate` — the same bag, flattened to strings. */
function readQueryParams(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, param] of Object.entries(readTileParams(value))) {
    if (param !== null) out[key] = String(param);
  }
  return out;
}

/* ── Outcome builders ────────────────────────────────────────────────────── */

function ok(
  verb: UiToolName,
  effect: string,
  extra: { tileId?: string; inverse?: WorkspaceToolInverse } = {},
): WorkspaceToolSuccess {
  const out: WorkspaceToolSuccess = { ok: true, verb, effect };
  if (extra.tileId) out.tileId = extra.tileId;
  if (extra.inverse) out.inverse = extra.inverse;
  return out;
}

function fail(
  verb: UiToolName,
  code: WorkspaceToolFailureCode,
  message: string,
): WorkspaceToolFailure {
  return { ok: false, verb, code, message };
}

/** The refusal the operator has to resolve by hand — worth its own sentence. */
function workspaceFull(verb: UiToolName, what: string): WorkspaceToolFailure {
  return fail(
    verb,
    'workspace_full',
    `The assistant tried to open ${what}, but every tile slot is held by a pinned tile. Unpin or close one, then ask again.`,
  );
}

function unknownTile(verb: UiToolName, raw: string, doing: string): WorkspaceToolFailure {
  return fail(verb, 'unknown_tile', `The assistant tried to ${doing} "${raw}", which is not open.`);
}

/* ── Handlers ────────────────────────────────────────────────────────────── */

type WorkspaceToolHandler = (
  input: Readonly<Record<string, unknown>>,
  deps: WorkspaceToolDeps,
) => WorkspaceToolOutcome;

/**
 * One entry per verb. `Record<UiToolName, …>` is the point: the compiler
 * enumerates the table, so a verb advertised to the model without a handler
 * cannot compile.
 */
const HANDLERS: Record<UiToolName, WorkspaceToolHandler> = {
  navigate: (input, deps) => {
    const path = readString(input.path, 512);
    // '/'-anchored app paths only; '//host' is protocol-relative (external).
    if (!path || !path.startsWith('/') || path.startsWith('//')) {
      return fail(
        'navigate',
        'invalid_input',
        'The assistant tried to navigate somewhere that is not an app path.',
      );
    }
    const params = readQueryParams(input.params);
    const query =
      Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : '';
    const href = `${path}${query}`;
    deps.navigate(href);
    return ok('navigate', `Navigated to ${href}`);
  },

  highlight: (input, deps) => {
    const ref = readString(input.ref, 300);
    if (!ref) {
      return fail(
        'highlight',
        'invalid_input',
        'The assistant tried to highlight a record without naming it.',
      );
    }
    deps.emitAppEvent(ASSISTANT_HIGHLIGHT_EVENT, { ref });
    return ok('highlight', `Highlighted ${ref}`);
  },

  focus_node: (input, deps) => {
    const nodeId = readString(input.nodeId, 120);
    if (!nodeId || !NODE_ID_PATTERN.test(nodeId)) {
      return fail(
        'focus_node',
        'invalid_input',
        'The assistant named a Studio node id the canvas cannot address.',
      );
    }
    deps.setStudioParams({ focus: nodeId, z: '1' });
    return ok('focus_node', `Focused Studio node ${nodeId}`);
  },

  set_lens: (input, deps) => {
    const lens = readOneOf(input.lens, STUDIO_LENSES);
    if (!lens) {
      return fail(
        'set_lens',
        'invalid_input',
        'The assistant asked for a Studio lens that does not exist.',
      );
    }
    deps.setStudioParams({ lens });
    return ok('set_lens', `Set the Studio lens to ${lens}`);
  },

  set_zoom: (input, deps) => {
    // Models hand back "1" as often as 1 — both name the same depth.
    const raw = input.z;
    const depth =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (depth !== 0 && depth !== 1 && depth !== 2) {
      return fail(
        'set_zoom',
        'invalid_input',
        'The assistant asked for a Studio zoom depth outside 0-2.',
      );
    }
    deps.setStudioParams({ z: String(depth) });
    return ok('set_zoom', `Set the Studio zoom depth to ${depth}`);
  },

  /**
   * Open a tile. THE VERB THAT NEVER ARMS THE SCANNER — see the file docblock,
   * property 2. A tool opens through the palette (its own store); a session or
   * table opens as a workspace tile after the tile registry confirms something
   * knows how to mount it.
   */
  open_tile: (input, deps) => {
    const kind = readOneOf(input.kind, TILE_KINDS);
    const ref = readString(input.ref, 160);
    if (!kind || !ref) {
      return fail(
        'open_tile',
        'invalid_input',
        `The assistant tried to open a tile without a usable kind + ref. Kinds: ${TILE_KINDS.join(', ')}.`,
      );
    }
    const params = readTileParams(input.params);

    if (kind === 'tool') {
      const toolKey = ref.startsWith('tool:') ? ref.slice('tool:'.length) : ref;
      if (!TOOL_KEY_PATTERN.test(toolKey)) {
        return fail(
          'open_tile',
          'invalid_input',
          'The assistant tried to open a tool without a usable tool key.',
        );
      }
      // Validate against the REGISTRY before opening. Without this the model
      // can invent a plausible key ("scanner", "notes") and the operator gets
      // an empty tile instead of being told the tool does not exist — and the
      // model never learns, because client verbs are fire-and-forget.
      if (!deps.getTool(toolKey)) {
        return fail(
          'open_tile',
          'unknown_tool',
          `The assistant tried to open a "${toolKey}" tool, which does not exist.`,
        );
      }
      // `openedBy: 'agent'` is load-bearing, not a log field: it is what keeps
      // an AI-opened Label Printer from counting as transient user activation,
      // so it renders a pair button instead of calling `requestDevice()` on
      // mount.
      const instanceId = deps.openTool({ toolKey, params, openedBy: 'agent' });
      if (instanceId === null) return workspaceFull('open_tile', `the ${toolKey} tool`);
      return ok('open_tile', `Opened the ${toolKey} tool`, {
        tileId: instanceId,
        inverse: { verb: 'close_tile', input: { tileId: instanceId } },
      });
    }

    const tileId = kind === 'session' ? sessionTileId(ref) : undefined;
    const probe: TabDescriptor = {
      id: tileId ?? `${kind}:${ref}`,
      kind: kind as TabKind,
      ref,
      params,
    };
    if (!deps.resolveTile(probe)) {
      return fail(
        'open_tile',
        'unknown_tool',
        `Nothing in this app knows how to show a ${kind} tile for "${ref}", so opening it would paint an empty pane.`,
      );
    }
    const opened = deps.openTab({ id: tileId, kind: kind as TabKind, ref, params });
    if (opened === null) return workspaceFull('open_tile', `the ${ref} ${kind}`);
    // A session tile opens PARKED: restoring a tab is not resuming the work,
    // and publishing it here would let a tile the model opened take the wedge
    // from the bench an operator is standing at. `focus_tile` is the resume.
    return ok(
      'open_tile',
      kind === 'session'
        ? `Opened the ${ref} session tile without resuming it (the scanner is untouched)`
        : `Opened the ${ref} ${kind} tile`,
      { tileId: opened, inverse: { verb: 'close_tile', input: { tileId: opened } } },
    );
  },

  close_tile: (input, deps) => {
    const raw = readString(input.tileId, 160);
    if (!raw) {
      return fail(
        'close_tile',
        'invalid_input',
        'The assistant tried to close a tile without naming one.',
      );
    }
    // A rail tool's instances live in the tool store, so closing "calculator"
    // must close the thing the operator can actually see rather than a tile
    // nobody opened.
    const toolCloseKey = toolKeyFor(raw, deps);
    if (toolCloseKey) {
      deps.closeToolsOf(toolCloseKey);
      return ok('close_tile', `Closed the ${toolCloseKey} tool`, {
        inverse: { verb: 'open_tile', input: { kind: 'tool', ref: toolCloseKey } },
      });
    }
    const tile = resolveTile(raw, deps);
    if (!tile) return unknownTile('close_tile', raw, 'close');
    // A closed session tile must not leave a live session behind it: the header
    // would keep narrating it and, if it was the armed scan, the wedge listener
    // would keep routing scans into a tile that no longer exists.
    // `clearActiveSession` is id-guarded, so closing a background session tile
    // cannot blank the header for the one still in front. The work_sessions row
    // is untouched — closing a window is not ending a session (`end_session`).
    if (tile.kind === 'session') deps.clearActiveSession(tile.ref);
    deps.closeTab(tile.id);
    return ok('close_tile', `Closed ${tile.ref}`, {
      tileId: tile.id,
      inverse: { verb: 'open_tile', input: { kind: tile.kind, ref: tile.ref } },
    });
  },

  /**
   * Bring a tile to the front. For a SESSION tile this is the resume — it
   * publishes the session, which for a scan session ARMS it and disarms
   * whichever bench held the scanner. That is the one place a workspace verb
   * touches scan ownership, and it is an explicit operator request every time.
   */
  focus_tile: (input, deps) => {
    const raw = readString(input.tileId, 160);
    if (!raw) {
      return fail(
        'focus_tile',
        'invalid_input',
        'The assistant tried to focus a tile without naming one.',
      );
    }
    const tile = resolveTileOrBench(raw, deps);
    if (!tile) {
      return fail(
        'focus_tile',
        'unknown_tile',
        `The assistant tried to focus "${raw}", which is not open. Open or start it instead.`,
      );
    }
    // `activateTab` brings the pane forward AND focuses the workspace tab —
    // there is deliberately one notion of focus in this app.
    deps.activateTab(tile.id);
    if (tile.kind !== 'session') {
      return ok('focus_tile', `Focused ${tile.ref}`, { tileId: tile.id });
    }
    const session = sessionFromTile(tile, deps.now());
    deps.setActiveSession(session);
    return ok(
      'focus_tile',
      session.kind === 'scan'
        ? `Resumed the ${session.title} scan session and armed it (whichever scan session held the scanner is now disarmed)`
        : `Resumed the ${session.title} session`,
      { tileId: tile.id },
    );
  },

  split_tile: (input, deps) => {
    const direction = readOneOf(input.direction, SPLIT_DIRECTIONS);
    if (!direction) {
      return fail(
        'split_tile',
        'invalid_input',
        `The assistant asked to split the canvas in a direction that does not exist. Available: ${SPLIT_DIRECTIONS.join(', ')}.`,
      );
    }
    const raw = readString(input.tileId, 160);
    let tileId: string | null = null;
    if (raw) {
      const tile = resolveTileOrBench(raw, deps);
      if (!tile) return unknownTile('split_tile', raw, 'split the canvas around');
      tileId = tile.id;
      // Focus the named tile FIRST, so "split the Unbox session to the right"
      // splits the pane holding Unbox rather than whichever pane the operator
      // happened to leave focused.
      deps.activateTab(tileId);
    }
    deps.splitFocusedPane(SPLIT_TO_ORIENTATION[direction]);
    return ok(
      'split_tile',
      tileId ? `Split the pane holding ${raw} (${direction})` : `Split the focused pane (${direction})`,
      tileId ? { tileId } : {},
    );
  },

  /**
   * Arrange the canvas — either a named shape, or a layout the operator saved
   * earlier.
   *
   * Deliberately does NOT accept a raw tile tree. A nested arrangement invented
   * by a model is a deep JSON structure with no operator intent behind it, and
   * `parseCanvasLayout` would spend its depth budget validating a guess. The
   * two things an operator actually asks for — a shape, or "my usual" — are
   * both nameable.
   */
  set_layout: (input, deps) => {
    const layoutId = readString(input.layoutId, 120);
    if (layoutId) {
      if (!deps.layoutStore) {
        return fail(
          'set_layout',
          'unsupported',
          'Saved layouts are not available in this workspace yet, so the assistant could not restore one. Ask for a shape instead: single, columns, rows or grid.',
        );
      }
      const saved = deps.layoutStore.get(layoutId);
      if (!saved) {
        const known = deps.layoutStore.list().map((l) => l.id);
        return fail(
          'set_layout',
          'invalid_input',
          `The assistant asked for a saved layout ("${layoutId}") that does not exist.${known.length ? ` Saved layouts: ${known.slice(0, 12).join(', ')}.` : ' Nothing has been saved yet.'}`,
        );
      }
      deps.hydrateCanvasLayout({
        root: saved.root,
        maximizedGroupId: saved.maximizedGroupId,
      });
      return ok('set_layout', `Restored the "${saved.name}" layout`);
    }

    const layout = readOneOf(input.layout, LAYOUT_PRESETS);
    if (!layout) {
      return fail(
        'set_layout',
        'invalid_input',
        `The assistant asked for a canvas layout that does not exist. Shapes: ${LAYOUT_PRESETS.join(', ')}, or the id of a saved layout.`,
      );
    }
    deps.applyCanvasPreset(LAYOUT_TO_CANVAS_PRESET[layout]);
    return ok('set_layout', `Arranged the canvas: ${layout}`);
  },

  save_layout: (input, deps) => {
    const name = readString(input.name, 80);
    if (!name) {
      return fail(
        'save_layout',
        'invalid_input',
        'The assistant tried to save a layout without naming it.',
      );
    }
    const rawSessionType = input.sessionType;
    if (
      rawSessionType !== undefined &&
      rawSessionType !== null &&
      !isLayoutSessionType(rawSessionType)
    ) {
      return fail(
        'save_layout',
        'invalid_input',
        `The assistant tried to file a layout under a session type that does not exist (${String(rawSessionType)}). Types: ${LAYOUT_SESSION_TYPES.join(', ')}.`,
      );
    }
    const sessionType: LayoutSessionType | null = isLayoutSessionType(rawSessionType)
      ? rawSessionType
      : null;
    if (!deps.layoutStore) {
      return fail(
        'save_layout',
        'unsupported',
        'This workspace has nowhere to keep saved layouts yet, so the assistant did not pretend to save one.',
      );
    }
    const arrangement = deps.serializeCanvasLayout();
    const id = layoutIdFor(name, sessionType);
    deps.layoutStore.save({
      id,
      name,
      sessionType,
      root: arrangement.root,
      maximizedGroupId: arrangement.maximizedGroupId,
      savedAt: deps.now(),
    });
    return ok(
      'save_layout',
      sessionType
        ? `Saved the current arrangement as "${name}" for ${sessionType} work (id ${id})`
        : `Saved the current arrangement as "${name}" (id ${id})`,
      { inverse: { verb: 'set_layout', input: { layoutId: id } } },
    );
  },

  start_session: (input, deps) => {
    // The KIND is derived from whether a bench was named, so an incoherent
    // {kind:'scan', scanType:undefined} is not expressible at the call site.
    const rawScanType = input.scanType;
    if (rawScanType !== undefined && rawScanType !== null && !isScanSessionType(rawScanType)) {
      return fail(
        'start_session',
        'invalid_input',
        `The assistant asked to start a scan session at a bench that does not exist (${String(rawScanType)}). Benches: ${SCAN_SESSION_TYPES.join(', ')}.`,
      );
    }
    const scanType: ScanSessionType | null = isScanSessionType(rawScanType) ? rawScanType : null;
    const title = readString(input.title, 80) ?? (scanType ? SCAN_SESSION_TITLES[scanType] : 'Task');

    const sessionId = deps.newSessionId();
    const startedAt = deps.now();
    const params: TabParams = scanType ? { title, scanType, startedAt } : { title, startedAt };
    const tileId = deps.openTab({
      id: sessionTileId(sessionId),
      kind: 'session',
      ref: sessionId,
      params,
    });
    if (tileId === null) return workspaceFull('start_session', `a ${title} session`);

    // Publishing IS arming: one slot, so a scan session takes the scanner from
    // whichever bench held it. No `armed` flag to set, and none to get wrong.
    deps.setActiveSession(
      scanType
        ? { id: sessionId, kind: 'scan', scanType, title, startedAt }
        : { id: sessionId, kind: 'task', title, startedAt },
    );
    return ok(
      'start_session',
      scanType
        ? `Started a ${title} scan session and armed it (any previously armed scan session is now disarmed)`
        : `Started the ${title} task session`,
      { tileId, inverse: { verb: 'end_session', input: { sessionId } } },
    );
  },

  /**
   * End a session for real — `work_sessions.status = 'ended'`, not just a
   * closed tile.
   *
   * Refuses when the shell wired no lifecycle bridge, rather than doing the
   * local half. A session whose tile is gone but whose row still reads `open`
   * and `armed` is a split brain the next device inherits — the exact state the
   * partial unique index on `armed` exists to make impossible.
   */
  end_session: (input, deps) => {
    const raw = readString(input.sessionId, 160);
    if (!raw) {
      return fail(
        'end_session',
        'invalid_input',
        'The assistant tried to end a session without naming one.',
      );
    }
    const tile = resolveTileOrBench(raw, deps);
    if (!tile || tile.kind !== 'session') {
      return fail(
        'end_session',
        'unknown_tile',
        `The assistant tried to end the "${raw}" session, which is not open here.`,
      );
    }
    if (!deps.sessionLifecycle) {
      return fail(
        'end_session',
        'unsupported',
        'This workspace cannot record a session end yet, so the assistant left the session running rather than closing the tile and leaving the record open. End it from the session header.',
      );
    }
    const title = typeof tile.params.title === 'string' ? tile.params.title : tile.ref;
    // Order matters: disarm before the tile goes, so nothing routes a scan into
    // a subtree that is unmounting.
    deps.clearActiveSession(tile.ref);
    deps.sessionLifecycle.end(tile.ref);
    deps.closeTab(tile.id);
    // No inverse: an ended session is a closed record, and "un-ending" one is
    // not a thing this system offers. Starting a NEW session is the real move.
    return ok('end_session', `Ended the ${title} session`, { tileId: tile.id });
  },

  pin_tool: (input, deps) => pinDispatch('pin_tool', input, deps, true),
  unpin_tool: (input, deps) => pinDispatch('unpin_tool', input, deps, false),
};

/**
 * `pin_tool` / `unpin_tool` share a body because they are one operation with a
 * boolean — but they are two VERBS because "unpin the photo library" should not
 * require the model to remember that a `pinned: false` flag exists on a verb
 * named `pin`. A flag it can forget is a flag it will forget, and the failure
 * mode is pinning something the operator asked to release.
 */
function pinDispatch(
  verb: 'pin_tool' | 'unpin_tool',
  input: Readonly<Record<string, unknown>>,
  deps: WorkspaceToolDeps,
  pinned: boolean,
): WorkspaceToolOutcome {
  const raw = readString(input.toolKey, 160) ?? readString(input.tileId, 160);
  if (!raw) {
    return fail(
      verb,
      'invalid_input',
      `The assistant tried to ${pinned ? 'pin' : 'unpin'} something without naming it.`,
    );
  }
  const inverseVerb: UiToolName = pinned ? 'unpin_tool' : 'pin_tool';
  // A TOOL is pinned by key in the palette, not by instance in the tile strip.
  const toolPinKey = toolKeyFor(raw, deps);
  if (toolPinKey) {
    if (pinned) deps.pinTool(toolPinKey);
    else deps.unpinTool(toolPinKey);
    return ok(verb, `${pinned ? 'Pinned' : 'Unpinned'} the ${toolPinKey} tool`, {
      inverse: { verb: inverseVerb, input: { toolKey: toolPinKey } },
    });
  }
  const tile = resolveTile(raw, deps);
  if (!tile) return unknownTile(verb, raw, pinned ? 'pin' : 'unpin');
  if (pinned) deps.pinTab(tile.id);
  else deps.unpinTab(tile.id);
  return ok(verb, `${pinned ? 'Pinned' : 'Unpinned'} ${tile.ref}`, {
    tileId: tile.id,
    inverse: { verb: inverseVerb, input: { toolKey: tile.id } },
  });
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export function isUiToolName(name: string): name is UiToolName {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

/** Every verb the model may execute, in schema order. */
export const UI_TOOL_NAMES = Object.keys(HANDLERS) as readonly UiToolName[];

/**
 * Execute one client tool.
 *
 * SYNCHRONOUS BY CONTRACT — see the file docblock, property 1. Making this
 * async is what would put a 1–3s model round-trip in reach of a 50ms scan
 * handler, so the signature is the guard.
 *
 * Never throws: a verb the model invented, a malformed input and a refused
 * store call are all outcomes the caller renders, not exceptions that take the
 * chat dock down mid-stream.
 */
export function runWorkspaceTool(
  name: string,
  input: Readonly<Record<string, unknown>>,
  deps: WorkspaceToolDeps,
): WorkspaceToolOutcome {
  const safeInput = input ?? {};
  const outcome = dispatch(name, safeInput, deps);
  // ONE log line per AI-driven workspace action, success or refusal, from the
  // one place every one of them passes through. A per-verb log would miss the
  // refusals, which are the interesting half.
  if (deps.log) {
    try {
      deps.log({ verb: name, input: safeInput, outcome, at: deps.now() });
    } catch {
      /* a broken log sink must not turn a working verb into a failure */
    }
  }
  return outcome;
}

function dispatch(
  name: string,
  input: Readonly<Record<string, unknown>>,
  deps: WorkspaceToolDeps,
): WorkspaceToolOutcome {
  if (!isUiToolName(name)) {
    return {
      ok: false,
      verb: name,
      code: 'unknown_verb',
      message: `The assistant asked for an action this app does not have ("${name}").`,
    };
  }
  try {
    return HANDLERS[name](input, deps);
  } catch (err) {
    return {
      ok: false,
      verb: name,
      code: 'invalid_input',
      message: `The assistant's "${name}" action failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
