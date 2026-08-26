'use client';

/**
 * Warehouse OS shell — the state half.
 *
 * ## What owns what
 *
 * **The open tiles and which one has focus live in `@/lib/workspace/store`.**
 * That store is the declared owner of "what is open right now", it is already
 * serializable, DB-free and unit-tested, and it already persists through
 * `staff_preferences.prefs.workspace`. A tile is one of its `TabDescriptor`s:
 * `ref` is what the tile is a handle on and `params` carries the tile's face
 * (title / colour / icon / session kind). Two tiles of one `ref` — which is
 * what Split produces — are two descriptors, which is exactly the case that
 * store was shaped for.
 *
 * **The rail's tab list is DERIVED from those tiles, never stored beside
 * them.** A tab is "currently open"; a stored tab list has to be mutated in
 * lockstep with the tile list, and the prototype's did not survive closing one
 * half of a split.
 *
 * **Everything else is local React state here**: pins, recents, the session,
 * the tool panel, comfort prefs, theme, the launcher. Each has a real durable
 * home (`staff_preferences.prefs.workspace.*`) and none of them is wired to it
 * in this lane — see `followUps`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { WorkSessionPurpose } from '@/lib/sessions/types';
import {
  closeTab as closeWorkspaceTab,
  focusTab as focusWorkspaceTab,
  getWorkspaceSnapshot,
  openTab as openWorkspaceTab,
  setTabParams,
} from '@/lib/workspace/store';
import { useWorkspace } from '@/lib/workspace/useWorkspace';
import type { TabDescriptor } from '@/lib/workspace/types';
import type { ScanRoute } from '@/lib/barcode-routing';
import type { ComposerCommit } from '@/lib/composer/commit';
import {
  appendOrderNote,
  dispatchOrdersTileNoteAppended,
} from '@/components/tiles/orders/orders-tile-data';
import { orderDetailTileVerdict } from '@/components/tiles/orders/order-tile-policy';
import { getOrderPlatformLabel } from '@/utils/order-platform';
import { dispatchOpenShippedDetails } from '@/utils/events';
import {
  applyHeaderTileClose,
  applyHeaderTileHover,
  type HeaderEntity,
} from '@/shell/header-entity';
import type { OrderHeaderFacts } from '@/components/tiles/orders/orders-tile-data';
import type { IconName } from '@/shell/icons';
import { syncElapsed } from '@/shell/clock';
import {
  ACCENTS,
  DENSITY,
  FEED_STARTER_REPLY,
  FEED_STARTERS,
  PALETTE,
  PIPELINE,
  PROTOTYPE_SEED,
  TILE_FLOOR_SESSION_PX,
  TILE_FLOOR_TABLE_PX,
  TILE_ICONS,
  THEME_STORAGE_KEY,
  blockElapsedSeconds,
  sessionKindOf,
  type AgentProposal,
  type AssistantFeedMessage,
  type BlockInterval,
  type FaceMode,
  type FeedAction,
  type FeedEntry,
  type FieldInputRecord,
  type RailTab,
  type RecentEntry,
  type ScanMode,
  type SessionBlock,
  type SessionKind,
  type SessionState,
  type ShellPin,
  type ShellPrefs,
  type ShellTheme,
  type ShellTile,
  type TileType,
  type ToolKey,
} from '@/shell/model';

/* ── tile ⇄ tab descriptor ───────────────────────────────────────────── */

function toTile(tab: TabDescriptor): ShellTile {
  const p = tab.params;
  return {
    id: tab.id,
    ref: tab.ref,
    title: typeof p.title === 'string' ? p.title : tab.ref,
    color: typeof p.color === 'string' ? p.color : PALETTE[0],
    icon: (typeof p.icon === 'string' ? p.icon : 'box') as IconName,
    type: tab.kind === 'session' ? 'session' : 'table',
    sessionKind: p.sessionKind === 'task' ? 'task' : 'scan',
  };
}

/**
 * One rail row per open `ref`, in the order the refs were first opened. The
 * face comes from that ref's first tile — a split sibling does not add a row.
 */
function deriveTabs(tiles: readonly ShellTile[]): RailTab[] {
  const seen = new Set<string>();
  const rows: RailTab[] = [];
  for (const tile of tiles) {
    if (seen.has(tile.ref)) continue;
    seen.add(tile.ref);
    rows.push({
      ref: tile.ref,
      title: tile.title,
      color: tile.color,
      icon: tile.icon,
      type: tile.type,
    });
  }
  return rows;
}

/* ── blocks of time — pure helpers ───────────────────────────────────── */

/** Close every open interval; the elapsed sum freezes with it (S4 lossless). */
function closeIntervals(intervals: readonly BlockInterval[], at: number): readonly BlockInterval[] {
  return intervals.map((iv) => (iv.end === undefined ? { ...iv, end: at } : iv));
}

/**
 * The NEWEST block for a ref — an ended block from earlier in the shift must
 * not shadow the parked one the operator means to resume (S5: reopening an
 * ended type is a new session, never a mutation of the old row).
 */
function lastBlockByRef(feed: readonly FeedEntry[], ref: string): SessionBlock | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i];
    if (e.kind === 'block' && e.ref === ref) return e;
  }
  return null;
}

/** Scan benches keep their surface ref; task sessions are `session-<id>`. */
function sessionBlockRef(
  kind: SessionKind,
  sessionId: number,
  scanType?: string | null,
  purposeKey?: string | null,
): string {
  if (kind === 'scan') return scanType || purposeKey || 'unbox';
  return `session-${sessionId}`;
}

/**
 * Reconstruct feed intervals from Σ active ms so the clock matches B11
 * (parked time is not work) without shipping every interval row to the client.
 */
function intervalsFromActiveMs(
  startedAtMs: number,
  activeMs: number,
  running: boolean,
  now: number,
): readonly BlockInterval[] {
  const ms = Math.max(0, activeMs);
  if (running) return [{ start: now - ms }];
  return [{ start: startedAtMs, end: startedAtMs + ms }];
}

function blockIntervalsFromRows(
  rows:
    | ReadonlyArray<{ kind: 'active' | 'parked'; startedAt: string; endedAt: string | null }>
    | undefined,
  startedAtMs: number,
  activeMs: number,
  running: boolean,
  now: number,
): readonly BlockInterval[] {
  if (!rows?.length) return intervalsFromActiveMs(startedAtMs, activeMs, running, now);
  const active = rows.filter((i) => i.kind === 'active');
  if (active.length === 0) return intervalsFromActiveMs(startedAtMs, activeMs, running, now);
  return active.map((i) => ({
    start: Date.parse(i.startedAt),
    ...(i.endedAt ? { end: Date.parse(i.endedAt) } : {}),
  }));
}

/* ── comfort prefs → CSS custom properties ───────────────────────────── */

function applyPrefs(prefs: ShellPrefs, theme: ShellTheme): void {
  const root = document.documentElement.style;
  const d = DENSITY[prefs.density] ?? DENSITY.default;
  root.setProperty('--sp-2', d.sp2);
  root.setProperty('--sp-3', d.sp3);
  root.setProperty('--control-h', d.ctrl);
  // Safe to expose BECAUSE the control-radius tokens do not exist. Radius
  // appears in exactly one place — the workspace frame — so this
  // parameterizes that place instead of reopening the question.
  root.setProperty('--r-hud', `${prefs.radius}px`);
  const accent = ACCENTS[prefs.accent] ?? ACCENTS.blue;
  const hex = theme === 'dark' ? accent.dark : accent.light;
  root.setProperty('--text-accent', hex);
  root.setProperty('--border-accent', hex);
  // The floors move WITH the density — otherwise `roomy` silently makes every
  // measured minimum wrong.
  root.setProperty('--tile-min-session', `${Math.round(TILE_FLOOR_SESSION_PX * d.floorScale)}px`);
  root.setProperty('--tile-min-table', `${Math.round(TILE_FLOOR_TABLE_PX * d.floorScale)}px`);
}

/* ── the hook ────────────────────────────────────────────────────────── */

/**
 * The composer's WRITE TARGET (Phase 7's `target`, first landing): prose
 * committed while this is set becomes an internal note on the named order
 * instead of a turn to the assistant. Set by an order chip commit and by the
 * Orders tile's focused detail; cleared by its chip's ✕, by leaving the
 * detail, or by the tile closing. ORDER-only until a second entity earns it.
 */
export interface ComposerWriteTarget {
  readonly entityId: number;
  readonly orderKey: string;
  readonly title: string;
}

function factsToEntity(tileId: string, facts: OrderHeaderFacts): HeaderEntity {
  return { kind: 'order', tileId, ...facts };
}

export type ShellApi = ReturnType<typeof useShell>;

export function useShell() {
  const workspace = useWorkspace();

  const tiles = useMemo(
    () => workspace.openTabs.filter((t) => t.kind !== 'tool').map(toTile),
    [workspace.openTabs],
  );
  /**
   * Drag-reorder is a LOCAL override on top of the store's insertion order.
   * `@/lib/workspace/store` has no `reorderTabs`, and growing it is outside
   * this lane — see `needsOutsideLane`. Ids the override does not name keep
   * their store order, at the end, so opening a tile mid-drag cannot vanish it.
   */
  const [order, setOrder] = useState<readonly string[]>([]);
  const orderedTiles = useMemo(() => {
    if (order.length === 0) return tiles;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...tiles].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [order, tiles]);

  const moveTile = useCallback(
    (dragId: string, overId: string) => {
      if (dragId === overId) return;
      const ids = orderedTiles.map((t) => t.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      setOrder(ids);
    },
    [orderedTiles],
  );

  const tabs = useMemo(() => deriveTabs(orderedTiles), [orderedTiles]);
  const focusedTileId = workspace.focusedTabId;
  const focusedTile = tiles.find((t) => t.id === focusedTileId) ?? null;
  const activeRef = focusedTile?.ref ?? null;

  /* beam identity — last hovered entity tile (composer/assistant never steal) */
  const [headerPayloads, setHeaderPayloads] = useState<Readonly<Record<string, HeaderEntity>>>(
    {},
  );
  const headerPayloadsRef = useRef(headerPayloads);
  headerPayloadsRef.current = headerPayloads;
  const focusedTileIdRef = useRef(focusedTileId);
  focusedTileIdRef.current = focusedTileId;
  const [headerEntity, setHeaderEntity] = useState<HeaderEntity | null>(null);

  const setHeaderPayload = useCallback((tileId: string, facts: OrderHeaderFacts | null) => {
    const entity = facts ? factsToEntity(tileId, facts) : null;
    setHeaderPayloads((prev) => {
      if (entity === null) {
        const { [tileId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [tileId]: entity };
    });
    setHeaderEntity((cur) => {
      if (entity === null) return cur;
      if (cur?.tileId === tileId || focusedTileIdRef.current === tileId) return entity;
      return cur;
    });
  }, []);

  /* rails — NO STATE LEFT (2026-08-25, operator ruling). Both rails are
     always-mounted floating icon stacks now: the left lost its expanded
     mode with the icons-only ruling, and the right lost peek/pin/expand
     when it was rebuilt as the left's mirror (HANDOFF-session-composer-ux
     §5). `leftExpanded` / `rightExpanded` / `leftRailOpen` /
     `rightRailOpen` and their toggles died with `useRailPeek`. */

  /* Pins are per staff, per org. Recents are SCOPED TO THE CURRENT SESSION
     since 2026-08-24 (H1 superseded — see LAWS.md) — the rail shows the
     armed block's own recent items, not the whole shift's cross-session
     trail. `RailSessions` filters `recents` by `armedBlock?.ref`. */
  const [pins] = useState<readonly ShellPin[]>(PROTOTYPE_SEED.pins);
  const [recents, setRecents] = useState<readonly RecentEntry[]>(PROTOTYPE_SEED.recents);
  /* Recents is ALWAYS expanded (2026-08-24, operator ruling — supersedes
     the 2026-08-23 default-collapsed ruling above). It no longer needs a
     collapse state at all: since H1a the list is scoped to the current
     session (a handful of rows at most, never a shift-long history), so
     there is nothing left to collapse it AGAINST. */

  /* session — boots with NONE. The first screen is the assistant feed
     (AI-first), so there is no session until the operator starts one and
     the header narrates "starting session" until they do. */
  const [sessionName, setSessionName] = useState<string>('');
  const [sessionState, setSessionState] = useState<SessionState>('ended');
  const [currentStage, setCurrentStage] = useState(0);
  const [scanMode, setScanMode] = useState<ScanMode>({ input: 'auto', action: 'search' });
  const [faceMode, setFaceMode] = useState<FaceMode>('pace');

  /* tools */
  const [openTool, setOpenTool] = useState<ToolKey>('timer');
  /* Closed on load. A pushing panel that opens itself takes 280px of canvas
     from an operator who did not ask for it. */
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [agentQueue, setAgentQueue] = useState<readonly AgentProposal[]>(PROTOTYPE_SEED.agentQueue);
  const [agentApplied, setAgentApplied] = useState<number>(PROTOTYPE_SEED.agentApplied);

  /* chrome */
  const [offline, setOffline] = useState(false);
  const [theme, setThemeState] = useState<ShellTheme>('light');
  const [prefs, setPrefs] = useState<ShellPrefs>({ density: 'default', radius: 4, accent: 'blue' });
  /* `sessionPopoverOpen` is gone (2026-08-25): the beam's ⋯ is the TOOLS
     entry now, and park/end live on the composer's session header. */
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tileId: string | null } | null>(null);

  /* ── theme: read the stamp the boot script already applied ─────────── */
  useEffect(() => {
    const stamped = document.documentElement.getAttribute('data-theme');
    if (stamped === 'dark' || stamped === 'light') {
      setThemeState(stamped);
      return;
    }
    setThemeState(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    applyPrefs(prefs, theme);
  }, [prefs, theme]);

  const setTheme = useCallback((next: ShellTheme) => {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode / quota — the stamp still holds for this tab. */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [setTheme, theme]);

  /* ── recents ───────────────────────────────────────────────────────── */

  const nextTouch = useCallback(
    () => recents.reduce((max, r) => Math.max(max, r.at), 0) + 1,
    [recents],
  );

  /* ── the feed — THE SURFACE, a chronology of blocks ────────────────────
     Declared ahead of the open/park handlers so state churn can land in it.
     The chronology is heterogeneous (Phase 2): plain turns between blocks,
     BLOCKS OF TIME within it. One block is armed at a time — the
     chronology's open stretch — and line items land inside it while it is. */
  const [feed, setFeed] = useState<readonly FeedEntry[]>([]);
  const feedSeq = useRef(0);
  const blockSeq = useRef(0);
  const [composerMode, setComposerMode] = useState<null | 'start' | 'end'>(null);
  const [purposes, setPurposes] = useState<readonly WorkSessionPurpose[]>([]);
  const [composerBusy, setComposerBusy] = useState(false);
  const { user, isLoaded } = useAuth();
  const myStaffId = user?.staffId ?? null;
  const feedRef = useRef<readonly FeedEntry[]>([]);

  const armedBlock = useMemo(
    () => feed.find((e): e is SessionBlock => e.kind === 'block' && e.state === 'armed') ?? null,
    [feed],
  );
  feedRef.current = feed;

  /* Today's org timeline — staff can see each other's blocks. Fail open if
     the purpose migration is not applied yet (404/500). */
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    void fetch(
      `/api/sessions/summary?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (body: {
          sessions?: ReadonlyArray<{
            session: {
              id: number;
              kind: SessionKind;
              scanType: string | null;
              status: 'open' | 'parked' | 'ended';
              armed: boolean;
              title: string | null;
              purposeId: number | null;
              notes: string | null;
              wrapUp: string | null;
              staffId: number | null;
              startedAt: string;
            };
            purpose: { id: number; key: string; label: string } | null;
            staffName: string | null;
            metric: { active: { ms: number } };
            intervals?: ReadonlyArray<{
              kind: 'active' | 'parked';
              startedAt: string;
              endedAt: string | null;
            }>;
          }>;
        } | null) => {
          if (cancelled || !body?.sessions?.length) return;
          const now = Date.now();
          const mineOpen = body.sessions.filter(
            (row) =>
              row.session.status === 'open' &&
              (myStaffId == null || row.session.staffId === myStaffId),
          );
          const armedScan = mineOpen.find((row) => row.session.kind === 'scan' && row.session.armed);
          const armedId = (armedScan ?? mineOpen[mineOpen.length - 1])?.session.id ?? null;
          const mapped: SessionBlock[] = body.sessions.map((row) => {
            const mine = myStaffId == null || row.session.staffId === myStaffId;
            const isArmed = row.session.id === armedId && row.session.status === 'open';
            const state: SessionBlock['state'] =
              row.session.status === 'ended' ? 'ended' : isArmed ? 'armed' : 'parked';
            return {
              kind: 'block',
              id: `ws${row.session.id}`,
              ref: sessionBlockRef(
                row.session.kind,
                row.session.id,
                row.session.scanType,
                row.purpose?.key,
              ),
              title: row.session.title || row.purpose?.label || `Session ${row.session.id}`,
              sessionKind: row.session.kind,
              state,
              intervals: blockIntervalsFromRows(
                row.intervals,
                Date.parse(row.session.startedAt),
                row.metric.active.ms,
                isArmed,
                now,
              ),
              items: [],
              collapsed: state !== 'armed',
              workSessionId: row.session.id,
              purposeLabel: row.purpose?.label,
              purposeId: row.session.purposeId ?? undefined,
              notes: row.session.notes ?? undefined,
              wrapUp: row.session.wrapUp ?? undefined,
              staffName: row.staffName ?? undefined,
              mine,
            };
          });
          const already = feedRef.current.some(
            (e) => e.kind === 'block' && e.workSessionId != null,
          );
          if (already) return;
          const protoArmed = feedRef.current.some((e) => e.kind === 'block' && e.state === 'armed');
          const incoming = protoArmed
            ? mapped.map((b) =>
                b.state === 'armed' ? { ...b, state: 'parked' as const, collapsed: true } : b,
              )
            : mapped;
          setFeed((prev) => {
            if (prev.some((e) => e.kind === 'block' && e.workSessionId != null)) return prev;
            return [...incoming, ...prev];
          });
          const mineArmed = protoArmed ? null : incoming.find((b) => b.state === 'armed' && b.mine);
          if (mineArmed) {
            setSessionName(mineArmed.title);
            setSessionState('armed');
            syncElapsed(blockElapsedSeconds(mineArmed.intervals, now), true);
          }
        },
      )
      .catch(() => {
        /* fail open — composer still works against a live API */
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, myStaffId]);

  /** A line item lands INSIDE the armed block when there is one, and at the
      chronology's top level when nothing is armed. */
  const appendItem = useCallback((msg: Omit<AssistantFeedMessage, 'id'>) => {
    const full: AssistantFeedMessage = { id: `f${++feedSeq.current}`, ...msg };
    setFeed((prev) => {
      const i = prev.findIndex((e) => e.kind === 'block' && e.state === 'armed');
      if (i < 0) return [...prev, { kind: 'message', ...full }];
      const block = prev[i] as SessionBlock;
      const next = [...prev];
      next[i] = { ...block, items: [...block.items, full] };
      return next;
    });
  }, []);

  const narrate = useCallback(
    (text: string) => appendItem({ role: 'assistant', text }),
    [appendItem],
  );

  /* ── blocks of time — the session verbs ────────────────────────────── */

  /* ── PAGES PER SESSION — the Spaces model (operator, 2026-08-24) ──────
     "The pages would work per session… think mission control, macOS —
     windows or pages per desktop." Every session owns its own set of open
     tiles. Parking stows the WHOLE canvas under the session's ref and
     restores the no-session space (key ''); resuming restores that
     session's pages exactly (same descriptors, same ids). In-memory like
     the chronology it mirrors — durability rides D8. */
  const spacesRef = useRef<Map<string, readonly TabDescriptor[]>>(new Map());

  /** Stow the live canvas under `fromKey`, then mount `toKey`'s pages. */
  const switchSpace = useCallback((fromKey: string, toKey: string) => {
    const live = getWorkspaceSnapshot().openTabs;
    spacesRef.current.set(fromKey, live);
    for (const tab of live) closeWorkspaceTab(tab.id);
    for (const tab of spacesRef.current.get(toKey) ?? []) {
      openWorkspaceTab({ id: tab.id, kind: tab.kind, ref: tab.ref, params: tab.params });
    }
  }, []);

  /**
   * Park the armed block: its interval closes, it collapses to one line
   * (title · state · elapsed) in place, and its PAGES stow with it — the
   * canvas returns to the no-session space. S3: parking is a work event,
   * never a lookup. S4: lossless — items, elapsed, and pages all survive.
   */
  const parkArmedBlock = useCallback((): void => {
    const block = armedBlock;
    if (!block || block.mine === false) return;
    const at = Date.now();
    setFeed((prev) =>
      prev.map((e) =>
        e.kind === 'block' && e.id === block.id
          ? { ...e, state: 'parked' as const, collapsed: true, intervals: closeIntervals(e.intervals, at) }
          : e,
      ),
    );
    switchSpace(block.ref, '');
    syncElapsed(blockElapsedSeconds(closeIntervals(block.intervals, at), at), false);
    setSessionState('parked');
    if (block.workSessionId) {
      void fetch(`/api/sessions/${block.workSessionId}/park`, { method: 'POST' });
    }
  }, [armedBlock, switchSpace]);

  /**
   * Resume a parked block IN PLACE: a new interval opens (the UI twin of a
   * `work_session_intervals` row) and elapsed continues from where it froze.
   * The incumbent armed block parks first — one armed block, ever.
   */
  const resumeBlock = useCallback(
    (ref: string) => {
      const block = lastBlockByRef(feed, ref);
      if (!block || block.state === 'ended') return;
      if (block.mine === false) return;
      if (block.state === 'armed') {
        const open = tiles.find((t) => t.ref === ref);
        if (open) focusWorkspaceTab(open.id);
        return;
      }
      parkArmedBlock();
      const at = Date.now();
      setFeed((prev) =>
        prev.map((e) =>
          e.kind === 'block' && e.id === block.id
            ? {
                ...e,
                state: 'armed' as const,
                collapsed: false,
                intervals: [...closeIntervals(e.intervals, at), { start: at }],
              }
            : e,
        ),
      );
      // Spaces: the parked session's pages come back exactly as stowed.
      // No session tile to re-open — the session's face is the composer
      // header (HANDOFF-session-composer-ux §1).
      switchSpace('', ref);
      setSessionName(block.title);
      setSessionState('armed');
      setCurrentStage(Math.max(0, PIPELINE.indexOf(ref)));
      syncElapsed(blockElapsedSeconds(block.intervals, at), true);
      if (block.workSessionId) {
        void fetch(`/api/sessions/${block.workSessionId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'resume' }),
        });
      }
    },
    [feed, parkArmedBlock, switchSpace, tiles],
  );

  /**
   * ONE ARMED SCAN SESSION, EVER — and since Phase 2 it IS a block of time.
   *
   * `ux_work_sessions_armed_scan` already makes two ARMED scan sessions
   * impossible in the database. What the DB cannot stop is the UI showing two
   * blocks that look armed while only one owns the wedge — and a block you
   * believe is armed but is not is a mis-scan generator. So opening a scan
   * session PARKS the armed block and cuts a new one at the chronology's
   * tail; reopening a ref with a live block RESUMES that block in place.
   *
   * `kind='task'` sessions are N (S6). They do not own the wedge, so they
   * cannot compete for a barcode; treating every session as exclusive made an
   * order import park the packing bench. They stay tabs + a narration line,
   * not blocks.
   */
  const openTile = useCallback(
    (ref: string, title: string, type: TileType) => {
      const kind = sessionKindOf(ref);

      if (type === 'session' && kind === 'scan') {
        const existing = lastBlockByRef(feed, ref);
        if (existing && existing.state !== 'ended') {
          resumeBlock(ref);
          return;
        }
        parkArmedBlock();
        const at = Date.now();
        setFeed((prev) => [
          ...prev,
          {
            kind: 'block',
            id: `b${++blockSeq.current}`,
            ref,
            title,
            sessionKind: kind,
            state: 'armed',
            intervals: [{ start: at }],
            items: [],
            collapsed: false,
          },
        ]);
        // Spaces: a NEW block starts with an empty desktop — including when
        // it reuses an ended block's ref (S5: a new session, never the old
        // one's leftovers). NO SESSION TILE (operator ruling, 2026-08-25 —
        // HANDOFF-session-composer-ux §1): the session's face mounts in the
        // composer, so arming opens no canvas tile and the canvas stays
        // free for data tiles (C8).
        spacesRef.current.delete(ref);
        switchSpace('', ref);
        setSessionName(title);
        setSessionState('armed');
        setCurrentStage(Math.max(0, PIPELINE.indexOf(ref)));
        syncElapsed(0, true);
        return;
      }

      // HARD RULE (operator, 2026-08-24): a display never overrides another
      // tile and never stacks a duplicate of itself — reopening a ref goes
      // to the MOST RELEVANT tile, which is the one already showing it.
      // (Split, when it exists, duplicates deliberately and bypasses this.)
      const sibling = tiles.find((t) => t.ref === ref);
      if (sibling && type !== 'session') {
        focusWorkspaceTab(sibling.id);
        return;
      }
      const color = sibling?.color ?? PALETTE[tiles.length % PALETTE.length];
      openWorkspaceTab({
        kind: type,
        ref,
        params: {
          title,
          color,
          icon: sibling?.icon ?? (type === 'table' ? 'table' : 'box'),
          sessionKind: kind,
        },
      });
      narrate(`Opened ${title}.`);
    },
    [feed, narrate, parkArmedBlock, resumeBlock, tiles],
  );

  /**
   * ⌘N — CUT a new session block (S12). Parks the current block losslessly
   * and opens the purpose composer. Does not mint a fake `Session N` scan.
   */
  const cutSession = useCallback(() => {
    parkArmedBlock();
    setComposerMode('start');
    void fetch('/api/sessions/purposes')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { purposes?: WorkSessionPurpose[] }) => setPurposes(body.purposes ?? []))
      .catch(() => setPurposes([]));
  }, [parkArmedBlock]);

  /**
   * Rename the ARMED session — double-click on the beam's session name
   * (operator, 2026-08-25; the popover's name field left with it). One
   * fact, three mirrors: the beam string, the block's title in the
   * chronology, and the session tile's face.
   */
  const renameArmedSession = useCallback(
    (title: string) => {
      const next = title.trim();
      const block = armedBlock;
      if (!next || !block) return;
      setSessionName(next);
      setFeed((prev) =>
        prev.map((e) => (e.kind === 'block' && e.id === block.id ? { ...e, title: next } : e)),
      );
      for (const tab of getWorkspaceSnapshot().openTabs) {
        if (tab.ref === block.ref) setTabParams(tab.id, { title: next });
      }
      if (block.workSessionId) {
        void fetch(`/api/sessions/${block.workSessionId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'rename', title: next }),
        });
      }
    },
    [armedBlock],
  );

  const closeSessionComposer = useCallback(() => {
    setComposerMode(null);
    setComposerBusy(false);
  }, []);

  const confirmStart = useCallback(
    async (input: { title: string; purposeId?: number; purposeLabel?: string; notes: string }) => {
      setComposerBusy(true);
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: input.title,
            purposeId: input.purposeId,
            purposeLabel: input.purposeLabel,
            notes: input.notes || undefined,
            parkSessionId: armedBlock?.workSessionId,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | {
              session?: {
                id: number;
                kind: SessionKind;
                scanType: string | null;
                title: string | null;
                purposeId: number | null;
                notes: string | null;
                armed: boolean;
              };
              purpose?: { id: number; key: string; label: string };
              error?: string;
            }
          | null;
        if (!res.ok || !body?.session) {
          narrate(`Could not start session${body?.error ? ` — ${body.error}` : ''}.`);
          setComposerBusy(false);
          return;
        }
        const n = ++blockSeq.current;
        const session = body.session;
        const purposeLabel = body.purpose?.label;
        const kind = session.kind;
        const ref = sessionBlockRef(kind, session.id, session.scanType, body.purpose?.key);
        const title = session.title ?? input.title;
        const at = Date.now();
        const fromKey = armedBlock?.state === 'armed' ? armedBlock.ref : '';
        setFeed((prev) => [
          ...prev.map((e) =>
            e.kind === 'block' && e.state === 'armed'
              ? { ...e, state: 'parked' as const, collapsed: true, intervals: closeIntervals(e.intervals, at) }
              : e,
          ),
          {
            kind: 'block',
            id: `b${n}`,
            ref,
            title,
            sessionKind: kind,
            state: 'armed',
            intervals: [{ start: at }],
            items: [],
            collapsed: false,
            workSessionId: session.id,
            purposeLabel,
            purposeId: session.purposeId ?? undefined,
            notes: session.notes ?? input.notes,
            mine: true,
          },
        ]);
        // Spaces: a fresh desktop for a fresh session. The session's face is
        // the composer header, never a tile (HANDOFF-session-composer-ux §1).
        switchSpace(fromKey, ref);
        setSessionName(title);
        setSessionState('armed');
        syncElapsed(0, true);
        setComposerMode(null);
      } catch {
        narrate('Could not start session.');
      } finally {
        setComposerBusy(false);
      }
    },
    [armedBlock, narrate, switchSpace],
  );

  const confirmEnd = useCallback(
    async (input: { wrapUp: string }) => {
      const block = armedBlock;
      if (!block) {
        setComposerMode(null);
        return;
      }
      setComposerBusy(true);
      const at = Date.now();
      if (block.workSessionId) {
        try {
          await fetch(`/api/sessions/${block.workSessionId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'end', wrapUp: input.wrapUp || undefined, wrapUpSource: 'staff' }),
          });
        } catch {
          /* local end still stands — the row may already be ended */
        }
      }
      setFeed((prev) =>
        prev.map((e) =>
          e.kind === 'block' && e.id === block.id
            ? {
                ...e,
                state: 'ended' as const,
                collapsed: true,
                wrapUp: input.wrapUp || e.wrapUp,
                intervals: closeIntervals(e.intervals, at),
              }
            : e,
        ),
      );
      syncElapsed(blockElapsedSeconds(closeIntervals(block.intervals, at), at), false);
      setSessionState('ended');
      setComposerMode(null);
      setComposerBusy(false);
    },
    [armedBlock],
  );

  const openEndComposer = useCallback(() => {
    if (!armedBlock || armedBlock.mine === false) return;
    setComposerMode('end');
  }, [armedBlock]);

  const focusTile = useCallback((id: string) => {
    focusWorkspaceTab(id);
  }, []);

  /** Focus-follows-mouse AND promotes the tile's header payload when it has one. */
  const hoverTile = useCallback((id: string, ref: string) => {
    focusWorkspaceTab(id);
    setHeaderEntity((cur) =>
      applyHeaderTileHover(cur, ref, headerPayloadsRef.current[id] ?? null),
    );
  }, []);

  /** Focusing a rail row focuses that ref's first tile. */
  const focusRef = useCallback(
    (ref: string) => {
      const hit = tiles.find((t) => t.ref === ref);
      if (hit) {
        focusWorkspaceTab(hit.id);
        setHeaderEntity((cur) =>
          applyHeaderTileHover(cur, hit.ref, headerPayloadsRef.current[hit.id] ?? null),
        );
      }
    },
    [tiles],
  );

  /**
   * Closing a tile closes its rail row too — once it was the LAST tile of that
   * ref. A tab is "currently open"; leaving the row behind would be the rail
   * claiming something is open when nothing is. A pin is untouched; that is
   * what a pin is for.
   */
  const closeTile = useCallback(
    (id: string) => {
      const remaining = tiles.filter((t) => t.id !== id);
      const fallbackId =
        focusedTileId && focusedTileId !== id ? focusedTileId : remaining[0]?.id;
      const fallback =
        fallbackId && fallbackId !== id
          ? (headerPayloadsRef.current[fallbackId] ?? null)
          : null;
      closeWorkspaceTab(id);
      setHeaderPayloads((prev) => {
        const { [id]: _dropped, ...rest } = prev;
        return rest;
      });
      setHeaderEntity((cur) => applyHeaderTileClose(cur, id, fallback));
    },
    [tiles, focusedTileId],
  );

  /* Split died with the canvas (the inversion): two views of one ref was a
     tiling verb, and the well is not a tiling surface. */

  /**
   * Rename / recolour / re-icon apply to every tile of the ref, so the rail
   * row and both halves of a split stay one thing. (The prototype edited the
   * target tile and its tab separately and let a split sibling drift.)
   */
  const patchRef = useCallback(
    (ref: string, patch: { title?: string; color?: string; icon?: IconName }) => {
      for (const tile of tiles) {
        if (tile.ref !== ref) continue;
        setTabParams(tile.id, patch);
      }
    },
    [tiles],
  );

  const renameTile = useCallback(
    (id: string, title: string) => {
      const tile = tiles.find((t) => t.id === id);
      if (!tile || !title.trim()) return;
      patchRef(tile.ref, { title: title.trim() });
    },
    [patchRef, tiles],
  );

  const cycleTileIcon = useCallback(
    (id: string) => {
      const tile = tiles.find((t) => t.id === id);
      if (!tile) return;
      const next = TILE_ICONS[(TILE_ICONS.indexOf(tile.icon) + 1) % TILE_ICONS.length];
      patchRef(tile.ref, { icon: next });
    },
    [patchRef, tiles],
  );

  const cycleTileColor = useCallback(
    (id: string) => {
      const tile = tiles.find((t) => t.id === id);
      if (!tile) return;
      const next = PALETTE[(PALETTE.indexOf(tile.color as (typeof PALETTE)[number]) + 1) % PALETTE.length];
      patchRef(tile.ref, { color: next });
    },
    [patchRef, tiles],
  );

  /**
   * Selecting a recent re-stamps it as the newest — the marker moves, the band
   * does not. That is the banding/recency trade made visible.
   */
  const touchRecent = useCallback(
    (id: string) => {
      const at = nextTouch();
      setRecents((prev) => prev.map((r) => (r.id === id ? { ...r, at } : r)));
    },
    [nextTouch],
  );

  /* ── session ───────────────────────────────────────────────────────── */

  /* `parkSession` is gone (2026-08-25): it was `parkArmedBlock` plus a
     popover-close for the deleted SessionPopover. The session header in the
     composer calls `parkArmedBlock` directly — one park verb, not two. */

  /** End seals the block: interval closed, collapsed to one line, no recents
      row — an ended session is history, not a resumable (S5). The canvas is
      left as the operator had it; only the block's own state changes. */
  const endSession = useCallback(() => {
    if (armedBlock && armedBlock.mine !== false) {
      setComposerMode('end');
      return;
    }
    setSessionState('ended');
  }, [armedBlock]);

  /* ── tools ─────────────────────────────────────────────────────────── */

  const toggleTool = useCallback(
    (key: ToolKey) => {
      if (openTool === key && toolPanelOpen) {
        setToolPanelOpen(false);
        return;
      }
      setOpenTool(key);
      setToolPanelOpen(true);
    },
    [openTool, toolPanelOpen],
  );

  const closeToolPanel = useCallback(() => setToolPanelOpen(false), []);

  /**
   * Applying a queued proposal makes it an APPLIED agent mutation. It does not
   * become an operator action — `actor_kind` stays 'agent', because the trust
   * stats read acceptance rate and a human approving a proposal is exactly the
   * signal that widens that kind's trust class.
   */
  const agentApply = useCallback((id: string) => {
    setAgentQueue((prev) => prev.filter((m) => m.id !== id));
    setAgentApplied((n) => n + 1);
  }, []);

  const agentDismiss = useCallback((id: string) => {
    setAgentQueue((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const agentUndo = useCallback(() => setAgentApplied((n) => Math.max(0, n - 1)), []);

  /* ── launcher ──────────────────────────────────────────────────────── */

  const openLauncher = useCallback((prefill = '') => setLauncherQuery(prefill), []);
  const closeLauncher = useCallback(() => setLauncherQuery(null), []);

  /* ── assistant feed — turns and input truth ────────────────────────── */

  /**
   * Display-first: the agent loop is not wired in this lane, so the one
   * scripted assistant turn offers REAL starter actions instead of
   * pretending to reason. `runFeedAction` opens real refs — they land on
   * the left rail and narrate into the feed; the reply text never claims
   * more than that. (The feed state itself is declared above the tile
   * handlers, which narrate into it.)
   */

  /* ── the input truth layer (Phase 1, HANDOFF-ai-first) ─────────────────
     Every value the mounted field emits lands here with its source stamped:
     scanner (claimed wedge burst) · paste (ClipboardEvent) · human (the
     field's own submit). Nothing downstream guesses. The durable half —
     carrying `source` into ops_events.payload — waits on the session write
     path; this ring is the client truth the suggestion row (Phase 3) and the
     session record will both read. */
  const [inputTruth, setInputTruth] = useState<readonly FieldInputRecord[]>([]);

  const recordFieldInput = useCallback((value: string, source: FieldInputRecord['source']) => {
    setInputTruth((prev) => [...prev.slice(-4), { value, source, at: Date.now() }]);
  }, []);

  /** A machine burst claimed inside the composer. The stamp is the whole job
      now — the omni-command composer owns the outcome (chip, typeahead, or
      plain text), and its commit narrates into the armed block. */
  const handleFieldScan = useCallback(
    (claim: { value: string; route: ScanRoute }) => {
      recordFieldInput(claim.value, 'scanner');
    },
    [recordFieldInput],
  );

  /** A paste landed in the composer — stamped, treated as typed, never a scan. */
  const handleFieldPaste = useCallback(
    (paste: { value: string }) => recordFieldInput(paste.value, 'paste'),
    [recordFieldInput],
  );

  const sendToAssistant = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      recordFieldInput(trimmed, 'human');
      appendItem({ role: 'operator', text: trimmed });
      appendItem({ role: 'assistant', text: FEED_STARTER_REPLY, actions: FEED_STARTERS });
    },
    [appendItem, recordFieldInput],
  );

  /* ── orders tiles ⇄ composer (HANDOFF-orders-first) ────────────────────
     The queue is ref `orders`; a focused order is ALWAYS ITS OWN TILE, ref
     `order:<orderKey>` (hard rule, 2026-08-24: a display never overrides a
     tile — it opens as another tile, or goes to the most relevant one
     already showing that display). `composerTarget` is the write-target the
     mounted detail tile reports; see `ComposerWriteTarget` above. */
  const [composerTarget, setComposerTarget] = useState<ComposerWriteTarget | null>(null);

  const clearComposerTarget = useCallback(() => setComposerTarget(null), []);

  /** The mounted order-detail tile resolved — the write-target snaps to it. */
  const setOrdersWriteTarget = useCallback(
    (focus: ComposerWriteTarget) => setComposerTarget(focus),
    [],
  );

  /** A detail tile left the canvas. Release the target ONLY if it still
      points at that order — a retargeted tile's unmount must not wipe the
      claim its successor just made. */
  const releaseOrdersWriteTarget = useCallback((orderKey: string) => {
    setComposerTarget((cur) => (cur && cur.orderKey === orderKey ? null : cur));
  }, []);

  /**
   * Open (or refocus) an order's OWN detail tile. The decision is
   * `orderDetailTileVerdict` — the pure, unit-pinned half of the hard rule:
   * one order-detail tile at a time, a different order RETARGETS it, and
   * the queue tile is never touched.
   */
  const openOrderDetailTile = useCallback(
    (orderKey: string) => {
      const verdict = orderDetailTileVerdict(tiles, orderKey);
      if (verdict.kind === 'focus') {
        focusWorkspaceTab(verdict.tileId);
        return;
      }
      if (verdict.kind === 'retarget') closeWorkspaceTab(verdict.closeTileId);
      openTile(verdict.ref, `#${orderKey}`, 'table');
    },
    [openTile, tiles],
  );

  /** An order line's product opens beside it — `product:<key>` refs mount
      the Product tile (Step 3). `openTile` dedupes by ref, so a product
      already on the canvas is refocused, never doubled. */
  const openProductTile = useCallback(
    (ref: { sku: string | null; itemNumber: string | null; title: string }) => {
      const key = ref.sku || ref.itemNumber;
      if (!key) return;
      openTile(`product:${key}`, key, 'table');
    },
    [openTile],
  );

  /* ── tile filters — set through the MAIN COMPOSER only ─────────────────
     (Operator, 2026-08-24: the queue's own filter box is gone; I8 as
     amended.) `filter: bose` narrows the queue tile; `filter:` clears.
     Keyed by tile ref so a second filterable tile costs one map entry. */
  const [tileFilters, setTileFilters] = useState<Readonly<Record<string, string>>>({});

  /** The refs that actually consume a filter — a filter landing on a tile
      with no rows is a silent lie, so anything else narrates a refusal. */
  const FILTERABLE_REFS = useMemo(() => new Set(['orders']), []);

  /** Returns true when the prose WAS a filter command and got consumed. */
  const applyComposerFilter = useCallback(
    (raw: string): boolean => {
      const m = /^(?:filter|flt)\s*:\s*(.*)$/i.exec(raw.trim());
      if (!m) return false;
      const text = m[1].trim();
      const targetRef =
        focusedTile && FILTERABLE_REFS.has(focusedTile.ref)
          ? focusedTile.ref
          : (tiles.find((t) => FILTERABLE_REFS.has(t.ref))?.ref ?? null);
      if (!targetRef) {
        narrate('Nothing filterable is open — the orders queue takes filter:.');
        return true;
      }
      setTileFilters((prev) => ({ ...prev, [targetRef]: text }));
      narrate(text ? `Filtering ${targetRef} — “${text}”.` : `Filter cleared on ${targetRef}.`);
      return true;
    },
    [FILTERABLE_REFS, focusedTile, narrate, tiles],
  );

  /** `?` (bottom-left, the Linear pattern) — help opens as a TILE (C8),
      placed LEFTMOST so it is the most prominent surface while open. */
  const openHelpTile = useCallback(() => {
    const existing = getWorkspaceSnapshot().openTabs.find((t) => t.ref === 'help');
    let id: string | null;
    if (existing) {
      focusWorkspaceTab(existing.id);
      id = existing.id;
    } else {
      id = openWorkspaceTab({
        kind: 'table',
        ref: 'help',
        params: { title: 'Help', color: PALETTE[0], icon: 'book' },
      });
    }
    if (id) {
      const rest = orderedTiles.map((t) => t.id).filter((x) => x !== id);
      setOrder([id, ...rest]);
    }
  }, [orderedTiles]);

  /** The beam's session dropdown footer — the week's sessions as a tile. */
  const openSessionsWeekTile = useCallback(() => {
    openTile('sessions-week', 'Sessions', 'table');
  }, [openTile]);

  /* ── the omni-command composer's commit sink ───────────────────────────
     One hydration point (docs/omni-command-composer.md): a chip paints the
     feed summary AND opens the orders tile — commit is an OS event, never a
     navigation. Scan-sourced commits skip the truth record here because the
     field's own scan handler already stamped them. */
  const onComposerCommit = useCallback(
    (commit: ComposerCommit) => {
      switch (commit.kind) {
        case 'order': {
          // QUEUED TASK (operator ruling, 2026-08-25 — docs/warehouse-os/
          // HANDOFF-order-in-composer.md): with NO session armed, an order
          // search must EMBED in the composer instead of opening tiles;
          // only an armed session opens the tile pair below. Not built —
          // open questions in the task file need the operator first.
          if (commit.source === 'human') recordFieldInput(commit.token, 'human');
          const { order } = commit;
          const platform = getOrderPlatformLabel(order.order_id, order.account_source);
          appendItem({
            role: 'assistant',
            text: `${order.order_id} — ${order.product_title || 'Order'}${platform ? ` · ${platform}` : ''}`,
          });
          // The queue tile opens (or refocuses) AND the order lands as its
          // own tile beside it — never inside it (hard rule). The write-
          // target snaps to the order immediately; the detail tile confirms
          // it when its lookup resolves.
          openTile('orders', 'Orders', 'table');
          openOrderDetailTile(order.order_id);
          setComposerTarget({
            entityId: order.id,
            orderKey: order.order_id,
            title: order.product_title || '',
          });
          // Beside the OS hydration: any mounted shipped-details listener
          // receives the same resolved row.
          dispatchOpenShippedDetails(order, 'queue');
          break;
        }
        case 'action': {
          const { run } = commit.action;
          if (run.kind === 'tool') toggleTool(run.tool);
          else openTile(run.ref, run.title, run.type);
          break;
        }
        case 'miss': {
          if (commit.source === 'human') recordFieldInput(commit.token, 'human');
          narrate(`No order matched “${commit.token}”.`);
          break;
        }
        case 'prose': {
          // `filter: …` outranks everything — it is a command about a tile,
          // not words for anyone (operator: filtering goes through the main
          // composer).
          if (applyComposerFilter(commit.text)) break;
          // Phase 7's target: prose with a write-target set is a COMMENT ON
          // THE ORDER — an append-only `order_notes` row through the existing
          // gated route — not a turn to the assistant.
          if (composerTarget) {
            const target = composerTarget;
            const text = commit.text.trim();
            if (!text) break;
            recordFieldInput(text, 'human');
            appendItem({ role: 'operator', text });
            appendOrderNote(target.entityId, text)
              .then(() => {
                narrate(`Noted on #${target.orderKey}.`);
                dispatchOrdersTileNoteAppended(target.entityId);
              })
              .catch(() => narrate(`Note failed on #${target.orderKey} — not saved.`));
            break;
          }
          sendToAssistant(commit.text);
          break;
        }
      }
    },
    [
      appendItem,
      applyComposerFilter,
      composerTarget,
      narrate,
      openOrderDetailTile,
      openTile,
      recordFieldInput,
      sendToAssistant,
      toggleTool,
    ],
  );

  /* ── blocks — collapse ─────────────────────────────────────────────── */

  const toggleBlockCollapsed = useCallback((id: string) => {
    setFeed((prev) =>
      prev.map((e) => (e.kind === 'block' && e.id === id ? { ...e, collapsed: !e.collapsed } : e)),
    );
  }, []);

  /** Collapse-all — the shift reads as one line per block: title · state ·
      elapsed (absorbed from HANDOFF-ai-first Phase 4). */
  const collapseAllBlocks = useCallback(() => {
    setFeed((prev) => prev.map((e) => (e.kind === 'block' ? { ...e, collapsed: true } : e)));
  }, []);

  const runFeedAction = useCallback(
    (action: FeedAction) => openTile(action.ref, action.title, action.type),
    [openTile],
  );

  /**
   * What the beam narrates about the session lifecycle. AI-first: with
   * nothing armed the shell is in its getting-started state, not an error
   * state — so the empty case reads "starting session", and opening one
   * flips it to "session started".
   */
  const sessionNarration = useMemo(() => {
    switch (sessionState) {
      case 'armed':
        return 'session started';
      case 'parked':
        return 'session parked';
      case 'error':
        return 'session error';
      default:
        return 'starting session';
    }
  }, [sessionState]);

  /* ── boot ──────────────────────────────────────────────────────────────
     NO TILE SEED. The workspace boots empty on purpose: the first screen
     is the assistant feed, and the operator (or its starter actions)
     opens the first tiles. PROTOTYPE_SEED still feeds the chrome around
     the canvas — pins, recents, the carton context — until each of those
     components is rebuilt in its turn. */

  return {
    /* canvas */
    tiles: orderedTiles,
    moveTile,
    tabs,
    focusedTileId,
    focusedTile,
    activeRef,
    openTile,
    focusTile,
    hoverTile,
    focusRef,
    closeTile,
    headerEntity,
    setHeaderPayload,
    renameTile,
    cycleTileIcon,
    cycleTileColor,

    /* pins + recents */
    pins,
    recents,
    touchRecent,

    /* session */
    sessionName,
    setSessionName,
    sessionState,
    sessionNarration,
    currentStage,
    scanMode,
    setScanMode,
    faceMode,
    setFaceMode,
    endSession,
    globalContext: PROTOTYPE_SEED.globalContext,
    contextValue: PROTOTYPE_SEED.contextValue,

    /* assistant feed + blocks of time */
    feed,
    armedBlock,
    narrate,
    sendToAssistant,
    onComposerCommit,

    /* orders tiles ⇄ composer target */
    composerTarget,
    setOrdersWriteTarget,
    releaseOrdersWriteTarget,
    clearComposerTarget,
    openOrderDetailTile,
    openProductTile,

    /* composer-driven tile filters · help · the week's sessions */
    tileFilters,
    openHelpTile,
    openSessionsWeekTile,
    runFeedAction,
    cutSession,
    renameArmedSession,
    resumeBlock,
    parkArmedBlock,
    toggleBlockCollapsed,
    collapseAllBlocks,
    composerMode,
    purposes,
    composerBusy,
    closeSessionComposer,
    confirmStart,
    confirmEnd,
    openEndComposer,

    /* input truth */
    inputTruth,
    handleFieldScan,
    handleFieldPaste,

    /* tools */
    openTool,
    toolPanelOpen,
    toggleTool,
    closeToolPanel,
    agentQueue,
    agentApplied,
    agentApply,
    agentDismiss,
    agentUndo,

    /* chrome */
    offline,
    toggleOffline: useCallback(() => setOffline((v) => !v), []),
    theme,
    setTheme,
    toggleTheme,
    prefs,
    setPref: useCallback(
      <K extends keyof ShellPrefs>(key: K, value: ShellPrefs[K]) =>
        setPrefs((prev) => ({ ...prev, [key]: value })),
      [],
    ),
    settingsPopoverOpen,
    setSettingsPopoverOpen,
    launcherQuery,
    openLauncher,
    closeLauncher,
    contextMenu,
    setContextMenu,
  };
}
