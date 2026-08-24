/**
 * Warehouse OS shell — the data half.
 *
 * Every registry, vocabulary and default in this file is transcribed from
 * `docs/warehouse-os/prototype/warehouse-os.html`, which is the design. The
 * prototype's own comments are kept where they carry a ruling rather than a
 * description; they are the record of *why* a value is what it is.
 *
 * Nothing here imports React, the DB, or `@/design-system`.
 */

import type { IconName } from '@/shell/icons';

/* ── vocabulary ──────────────────────────────────────────────────────── */

/** What a tile is a rendering of. A tool is NOT a tile — it is a panel. */
export type TileType = 'session' | 'table';

/**
 * A scan session owns the wedge; a task session does not. That distinction is
 * the whole reason the discriminator exists — treating every session as
 * exclusive made an order import park the packing bench.
 */
export type SessionKind = 'scan' | 'task';

export type SessionState = 'open' | 'armed' | 'parked' | 'ended' | 'error';

/**
 * The 2x2 scan matrix, with both axes doing their real jobs.
 *
 * - `input` — does my TYPING count as a scan? `auto` = wedge only (typing
 *   searches); `manual` ("key") = hand-enter a damaged barcode into the
 *   session. That is the only genuine mode here; scan-vs-search is not a mode,
 *   because a wedge burst and human typing are different input paths and both
 *   work at once.
 * - `action` — what a query does: search the org, or filter the focused tile.
 */
export interface ScanMode {
  readonly input: 'auto' | 'manual';
  readonly action: 'search' | 'filter';
}

/**
 * A per-staff DISPLAY preference for the header readout. Three states, because
 * "hide it" and "show it" are not the whole answer:
 *   pace     elapsed / target, coloured   — the clock and the verdict
 *   elapsed  elapsed only, never coloured — the clock, no verdict
 *   off      no face at all
 * MEASUREMENT IS NOT AFFECTED BY ANY OF THESE. `ops_events` records the work
 * regardless, and the settings copy says so — a preference that quietly
 * implies it stops the recording is worse than no preference.
 */
export type FaceMode = 'pace' | 'elapsed' | 'off';

/* ── tiles, tabs, pins, recents ──────────────────────────────────────── */

/**
 * One rendering on the canvas. `ref` is what it is a handle on (a session key,
 * a table key); two tiles may share a `ref` — that is what Split produces.
 */
export interface ShellTile {
  readonly id: string;
  readonly ref: string;
  readonly title: string;
  readonly color: string;
  readonly icon: IconName;
  readonly type: TileType;
  readonly sessionKind: SessionKind;
}

/**
 * A rail row. DERIVED from the open tiles, never stored beside them: a tab is
 * "currently open", so a tab that outlived its tile would be the rail claiming
 * something is open when nothing is. (The prototype kept a parallel `tabs`
 * array and had to remember to mutate both; closing one of two split tiles
 * dropped the tab out from under its surviving sibling.)
 */
export interface RailTab {
  readonly ref: string;
  readonly title: string;
  readonly color: string | null;
  readonly icon: IconName;
  readonly type: TileType;
}

/** A destination the operator always wants within reach. Not "open". */
export interface ShellPin {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
}

/**
 * RECENTS — per staff, per org. Never per session.
 *
 * `sessionId` MARKS an entry; it never scopes it, so closing a batch does not
 * delete the trail. Capped per KIND, so a 12-label print run can only evict
 * labels.
 */
export interface RecentEntry {
  readonly kind: RecentKind;
  readonly id: string;
  readonly title: string;
  readonly sub: string;
  /** Monotonic touch counter. Highest = the single most recent selection. */
  readonly at: number;
  readonly sessionId?: string;
}

export type RecentKind =
  | 'carton'
  | 'pack'
  | 'label'
  | 'pickup'
  | 'ticket'
  | 'search'
  | 'session';

/**
 * Band order is FIXED and is the whole point: a band never moves, so the
 * operator reaches for cartons at the same offset from the top no matter what
 * they did at another bench. MRU applies inside a band only.
 */
export const RECENT_KINDS: readonly {
  kind: RecentKind;
  label: string;
  icon: IconName;
  cap: number;
}[] = [
  { kind: 'carton', label: 'Cartons', icon: 'box', cap: 3 },
  { kind: 'pack', label: 'Packs', icon: 'table', cap: 3 },
  { kind: 'label', label: 'Labels', icon: 'printer', cap: 2 },
  { kind: 'pickup', label: 'Pickups', icon: 'file', cap: 2 },
  { kind: 'ticket', label: 'Tickets', icon: 'book', cap: 2 },
  { kind: 'search', label: 'Searches', icon: 'search', cap: 2 },
  { kind: 'session', label: 'Sessions', icon: 'check', cap: 2 },
];

/* ── tools ───────────────────────────────────────────────────────────── */

/**
 * `scope` is the only availability field.
 *   global  · always listed. Needs no session, receives none.
 *   session · listed only while a session is armed; RECEIVES it.
 *   agent   · a scope of one — the assistant is the ONLY tool that writes on
 *             your behalf, and `agent_mutations.actor_kind` already separates
 *             'agent' from 'operator' in the ledger. The rail says the same.
 * `appliesTo` narrows a session tool to specific scan types. `cls` is the
 * input/attention class — it decides where a tool may live and whether it may
 * ever auto-summon, not how big it is.
 */
export interface ToolDescriptor {
  readonly key: ToolKey;
  readonly label: string;
  readonly icon: IconName;
  readonly scope: 'agent' | 'global' | 'session';
  readonly cls: 'instrument' | 'actuator' | 'library' | 'readout';
  readonly appliesTo?: readonly string[];
}

export type ToolKey =
  | 'ai'
  | 'files'
  | 'import'
  | 'calc'
  | 'photos'
  | 'manuals'
  | 'printer'
  | 'stopwatch'
  | 'pairing'
  | 'timer';

export const TOOLS: readonly ToolDescriptor[] = [
  { key: 'ai', label: 'Assistant', icon: 'assistant', scope: 'agent', cls: 'instrument' },
  // N6 — native file workspaces (desktop-first ruling, T30). Actuator: its
  // commit step moves/uploads real files.
  { key: 'files', label: 'Files', icon: 'folder', scope: 'global', cls: 'actuator' },
  { key: 'import', label: 'Import orders', icon: 'file', scope: 'global', cls: 'actuator' },
  { key: 'calc', label: 'Calculator', icon: 'calc', scope: 'global', cls: 'instrument' },
  { key: 'photos', label: 'Photo library', icon: 'image', scope: 'global', cls: 'library' },
  { key: 'manuals', label: 'Manuals', icon: 'book', scope: 'global', cls: 'library' },
  { key: 'printer', label: 'Label printer', icon: 'printer', scope: 'global', cls: 'actuator' },
  { key: 'stopwatch', label: 'Stopwatch', icon: 'stopwatch', scope: 'session', cls: 'readout' },
  {
    key: 'pairing',
    label: 'Pairing',
    icon: 'split',
    scope: 'session',
    cls: 'instrument',
    appliesTo: ['unbox', 'packing'],
  },
];

export function toolAvailable(
  tool: ToolDescriptor,
  sessionState: SessionState,
  activeRef: string | null,
): boolean {
  if (tool.scope !== 'session') return true;
  if (sessionState !== 'armed') return false;
  return !tool.appliesTo || (activeRef !== null && tool.appliesTo.includes(activeRef));
}

/* ── palettes, icons, prefs ──────────────────────────────────────────── */

export const PALETTE = [
  '#15803d',
  '#1d4ed8',
  '#b45309',
  '#b91c1c',
  '#6d28d9',
  '#0f766e',
  '#a16207',
] as const;

/** The cycle behind the tab context menu's "Change icon". */
export const TILE_ICONS: readonly IconName[] = [
  'box',
  'table',
  'file',
  'printer',
  'image',
  'book',
  'check',
];

/**
 * A scan session is discriminated by `scan_type`; a task session by the
 * SURFACE_KEY whose job it is doing. Anything not listed here is a scan
 * session.
 */
export const SESSION_KINDS: Readonly<Record<string, SessionKind>> = {
  'fba-build': 'task',
};

export function sessionKindOf(ref: string): SessionKind {
  return SESSION_KINDS[ref] ?? 'scan';
}

/**
 * CUSTOMIZATION — three tiers, and the line between them is one question:
 * DOES CHANGING THIS CHANGE WHAT SOMETHING MEANS?
 *   arrangement  what is open and where          — unrestricted, per staff
 *   comfort      density, radius, accent, theme  — BOUNDED, per staff
 *   meaning      semantic state colour           — locked. Not a preference.
 *
 * Density is ONE scale, not N padding knobs: the tile floors were measured
 * against a density, so the floor math has to consume the same number.
 * Individual padding values would be an untested combinatorial space with
 * silently wrong floors.
 */
export interface ShellPrefs {
  readonly density: DensityKey;
  readonly radius: number;
  readonly accent: AccentKey;
}

export type DensityKey = 'compact' | 'default' | 'roomy';
export type AccentKey = 'blue' | 'teal' | 'violet' | 'amber';

export const DENSITY: Readonly<
  Record<DensityKey, { sp2: string; sp3: string; ctrl: string; floorScale: number }>
> = {
  compact: { sp2: '6px', sp3: '9px', ctrl: '22px', floorScale: 0.92 },
  default: { sp2: '8px', sp3: '12px', ctrl: '26px', floorScale: 1.0 },
  roomy: { sp2: '11px', sp3: '16px', ctrl: '32px', floorScale: 1.14 },
};

export const ACCENTS: Readonly<Record<AccentKey, { light: string; dark: string }>> = {
  blue: { light: '#1d4ed8', dark: '#60a5fa' },
  teal: { light: '#0f766e', dark: '#2dd4bf' },
  violet: { light: '#6d28d9', dark: '#a78bfa' },
  amber: { light: '#a16207', dark: '#fbbf24' },
};

/** The measured floors the density scale multiplies. */
export const TILE_FLOOR_SESSION_PX = 784;
export const TILE_FLOOR_TABLE_PX = 520;

/* ── pipeline ────────────────────────────────────────────────────────── */

export const PIPELINE: readonly string[] = ['unbox', 'packing', 'ready', 'qc'];

/**
 * Targets belong to the WORK, not to the operator. A per-person target is a
 * performance ranking rendered into the operator's chrome; that belongs in the
 * manager view if it belongs anywhere.
 */
export const STAGE_TARGETS: Readonly<Record<string, number>> = {
  unbox: 360,
  packing: 300,
  ready: 180,
  qc: 420,
};

export function pipelineLabel(stage: string): string {
  return stage === 'ready' ? 'ready to pack' : stage;
}

/* ── theme ───────────────────────────────────────────────────────────── */

export type ShellTheme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'cf.shell.theme';

/* ── seed ────────────────────────────────────────────────────────────── */

/**
 * The prototype's opening state, so the ported shell can be diffed against the
 * file it came from on sight.
 *
 * TEMPORARY. The durable source is `staff_preferences.prefs.workspace` via
 * `@/lib/workspace/persistence` (open tabs, pins, keybindings) — which is not
 * wired here because this lane owns the frame, not the prefs round-trip. When
 * it is, this constant is deleted, not "kept as a fallback": an empty
 * workspace already has a first screen, and it is `AssistantFeed`.
 *
 * The `tiles` entry is GONE (2026-08-23): the workspace boots empty so the
 * assistant feed IS the first screen. The rest still feeds the chrome around
 * the canvas until each component is rebuilt in its turn.
 */
export const PROTOTYPE_SEED = {
  pins: [
    { id: 'daily', title: 'Daily check', icon: 'check' as IconName },
    { id: 'shiftlog', title: 'Shift log', icon: 'file' as IconName },
  ],
  recents: [
    { kind: 'carton', id: 'C-8842-A', title: 'C-8842-A', sub: 'UPS 1Z999AA1 · grade B', at: 6, sessionId: 's7' },
    { kind: 'carton', id: 'C-8839-B', title: 'C-8839-B', sub: 'FedEx 7742 · grade A', at: 2 },
    { kind: 'carton', id: 'C-8830-K', title: 'C-8830-K', sub: 'USPS 9410 · grade C', at: 1 },
    { kind: 'pack', id: 'P-2210', title: 'Pack #2210', sub: '6 units · bin B-04-2', at: 5, sessionId: 's7' },
    { kind: 'pack', id: 'P-2209', title: 'Pack #2209', sub: '2 units · bin B-04-3', at: 3 },
    { kind: 'label', id: 'L-4471', title: 'SN-9912-D', sub: 'Zebra-ZT411 · 1 label', at: 4 },
    { kind: 'search', id: 'q-18', title: 'grade:B bin:B-04*', sub: '18 results', at: 0 },
    { kind: 'session', id: 's6', title: 'Bin 4 recount', sub: 'closed 09:41', at: 0 },
  ] satisfies RecentEntry[],
  /** The live session id the leading-edge "touched by this session" mark reads. */
  liveSessionId: 's7',
  sessionName: 'Packing #7',
  globalContext: 'Receiving',
  contextValue: 'C-8842-A',
  /**
   * Proposals the assistant queued instead of applying — the trust class for
   * that mutation kind said "review". This count must be legible WITHOUT
   * opening the panel, so it badges the rail icon.
   */
  agentQueue: [
    { id: 'm1', kind: 'receiving.grade.set', summary: 'Set C-8830-K grade C → B', why: '3 photos show no damage' },
    { id: 'm2', kind: 'shipment.split', summary: 'Split Pack #2210 into two cartons', why: 'over weight limit for one box' },
  ],
  agentApplied: 14,
} as const;

export interface AgentProposal {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly why: string;
}

/* ── assistant feed — the first screen ───────────────────────────────── */

/**
 * One field input, stamped with HOW it arrived — the Phase 1 truth layer
 * (HANDOFF-ai-first §2/§3). `source` is structural, never inferred: scanner =
 * claimed wedge burst, paste = ClipboardEvent, human = the field's own submit.
 */
export interface FieldInputRecord {
  readonly value: string;
  readonly source: import('@/lib/keyboard/find-field-scan').FindFieldSource;
  readonly at: number;
}

/** A tappable action inside an assistant turn. Opens a REAL tile. */
export interface FeedAction {
  readonly label: string;
  readonly ref: string;
  readonly title: string;
  readonly type: TileType;
}

/** One turn in the first-screen feed. */
export interface AssistantFeedMessage {
  readonly id: string;
  readonly role: 'assistant' | 'operator';
  readonly text: string;
  /** Offered by a scripted turn — real shell actions, never fake output. */
  readonly actions?: readonly FeedAction[];
}

/**
 * The centred welcome. AI-first: the empty feed is a conversation, not a
 * menu of things to open — and since the inversion it is the surface itself.
 */
export const FEED_WELCOME = {
  title: 'Welcome back',
  body: 'Tell me the work in front of you, or scan — everything runs through this feed.',
} as const;

/**
 * The one scripted assistant turn. The agent loop is not wired in this
 * lane; until it is, the assistant answers every message with real starter
 * actions instead of pretending to reason. (Absorbed from EmptySlate's two
 * starter buttons when the feed replaced it as the first screen.)
 */
export const FEED_STARTER_REPLY =
  'I can open these now, or keep describing the work and we’ll refine from there.';

export const FEED_STARTERS: readonly FeedAction[] = [
  { label: 'Start packing session', ref: 'packing', title: 'Packing', type: 'session' },
  { label: 'Open triage queue', ref: 'triage', title: 'Triage', type: 'table' },
];
