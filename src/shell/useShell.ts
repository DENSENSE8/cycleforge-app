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
import {
  closeTab as closeWorkspaceTab,
  focusTab as focusWorkspaceTab,
  openTab as openWorkspaceTab,
  setTabParams,
} from '@/lib/workspace/store';
import { useWorkspace } from '@/lib/workspace/useWorkspace';
import type { TabDescriptor } from '@/lib/workspace/types';
import type { ScanRoute } from '@/lib/barcode-routing';
import type { IconName } from '@/shell/icons';
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
  sessionKindOf,
  type AgentProposal,
  type AssistantFeedMessage,
  type FaceMode,
  type FeedAction,
  type FieldInputRecord,
  type RailTab,
  type RecentEntry,
  type ScanMode,
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

  /* rails */
  const [leftExpanded, setLeftExpanded] = useState(false);
  const [rightExpanded, setRightExpanded] = useState(false);

  /* pins + recents — per staff, per org. Never per session. */
  const [pins] = useState<readonly ShellPin[]>(PROTOTYPE_SEED.pins);
  const [recents, setRecents] = useState<readonly RecentEntry[]>(PROTOTYPE_SEED.recents);
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);

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
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
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

  /* ── tiles ─────────────────────────────────────────────────────────── */

  /**
   * Park, don't close. The row survives with its state; only the arm and the
   * canvas slot are given up. It lands in recents so it is one click back.
   */
  const parkTile = useCallback(
    (tile: ShellTile) => {
      closeWorkspaceTab(tile.id);
      setRecents((prev) => [
        ...prev.filter((r) => !(r.kind === 'session' && r.id === tile.ref)),
        {
          kind: 'session',
          id: tile.ref,
          title: tile.title,
          sub: 'parked · state kept',
          at: prev.reduce((max, r) => Math.max(max, r.at), 0) + 1,
        },
      ]);
    },
    [],
  );

  /**
   * ONE SCAN-SESSION TILE ON THE CANVAS, EVER.
   *
   * `ux_work_sessions_armed_scan` already makes two ARMED scan sessions
   * impossible in the database. What the DB cannot stop is the UI showing two
   * session tiles that look identical while only one owns the wedge — and a
   * tile you believe is armed but is not is a mis-scan generator. So opening a
   * session PARKS the one that is open and swaps it in.
   *
   * `kind='task'` sessions are N. They do not own the wedge, so they cannot
   * compete for a barcode; treating every session as exclusive made an order
   * import park the packing bench.
   */
  const openTile = useCallback(
    (ref: string, title: string, type: TileType) => {
      const kind = sessionKindOf(ref);

      if (type === 'session' && kind === 'scan') {
        const openSession = tiles.find((t) => t.type === 'session' && t.sessionKind === 'scan');
        if (openSession) {
          if (openSession.ref === ref) {
            // Re-opening the session already on canvas focuses it — and
            // RE-ARMS it if it was parked. A resume that leaves the arm on the
            // floor means the operator is back at the bench with nothing
            // owning the wedge.
            setSessionState((s) => (s === 'armed' ? s : 'armed'));
            focusWorkspaceTab(openSession.id);
            return;
          }
          parkTile(openSession);
        }
      }

      const sibling = tiles.find((t) => t.ref === ref);
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

      if (type === 'session' && kind === 'scan') {
        setSessionName(title);
        setSessionState('armed');
        setCurrentStage(Math.max(0, PIPELINE.indexOf(ref)));
      }
    },
    [parkTile, tiles],
  );

  const focusTile = useCallback((id: string) => {
    focusWorkspaceTab(id);
  }, []);

  /** Focusing a rail row focuses that ref's first tile. */
  const focusRef = useCallback(
    (ref: string) => {
      const hit = tiles.find((t) => t.ref === ref);
      if (hit) focusWorkspaceTab(hit.id);
    },
    [tiles],
  );

  /**
   * Closing a tile closes its rail row too — once it was the LAST tile of that
   * ref. A tab is "currently open"; leaving the row behind would be the rail
   * claiming something is open when nothing is. A pin is untouched; that is
   * what a pin is for.
   */
  const closeTile = useCallback((id: string) => {
    closeWorkspaceTab(id);
  }, []);

  const splitTile = useCallback(
    (id: string | null) => {
      const tile = tiles.find((t) => t.id === (id ?? focusedTileId)) ?? focusedTile;
      if (!tile) return;
      openWorkspaceTab({
        kind: tile.type,
        ref: tile.ref,
        params: {
          title: `${tile.title} (2)`,
          color: tile.color,
          icon: tile.icon,
          sessionKind: tile.sessionKind,
        },
      });
    },
    [focusedTile, focusedTileId, tiles],
  );

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
   * does not. That is the banding/recency trade made visible. A parked session
   * in recents is RESUMABLE, not just a bookmark, which is the whole reason
   * one-session-at-a-time costs nothing.
   */
  const touchRecent = useCallback(
    (id: string) => {
      const hit = recents.find((r) => r.id === id);
      if (!hit) return;
      if (hit.kind === 'session') {
        setRecents((prev) => prev.filter((r) => r !== hit));
        openTile(hit.id, hit.title, 'session');
        return;
      }
      const at = nextTouch();
      setRecents((prev) => prev.map((r) => (r.id === id ? { ...r, at } : r)));
    },
    [nextTouch, openTile, recents],
  );

  /* ── session ───────────────────────────────────────────────────────── */

  const parkSession = useCallback(() => {
    setSessionState('parked');
    setSessionPopoverOpen(false);
  }, []);

  const endSession = useCallback(() => {
    setSessionState('ended');
    for (const tile of tiles) {
      if (tile.type === 'session') closeWorkspaceTab(tile.id);
    }
    setSessionPopoverOpen(false);
  }, [tiles]);

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

  /* ── assistant feed — THE FIRST SCREEN ─────────────────────────────── */

  /**
   * Display-first: the agent loop is not wired in this lane, so the one
   * scripted assistant turn offers REAL starter actions instead of
   * pretending to reason. `runFeedAction` opens real tiles; the reply text
   * never claims more than that.
   */
  const [feed, setFeed] = useState<readonly AssistantFeedMessage[]>([]);
  const feedSeq = useRef(0);

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

  /** A machine burst decoded to a printed handle inside the composer. */
  const handleFieldScan = useCallback(
    (claim: { value: string; route: ScanRoute }) => {
      recordFieldInput(claim.value, 'scanner');
      const id = `f${++feedSeq.current}`;
      setFeed((prev) => [
        ...prev,
        {
          id,
          role: 'assistant',
          text: `Scanned ${claim.value} — a ${claim.route.type} handle. It landed as a scan (source: scanner), not as typed text.`,
        },
      ]);
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
      const opId = `f${++feedSeq.current}`;
      const reId = `f${++feedSeq.current}`;
      setFeed((prev) => [
        ...prev,
        { id: opId, role: 'operator', text: trimmed },
        { id: reId, role: 'assistant', text: FEED_STARTER_REPLY, actions: FEED_STARTERS },
      ]);
    },
    [recordFieldInput],
  );

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
    focusRef,
    closeTile,
    splitTile,
    renameTile,
    cycleTileIcon,
    cycleTileColor,

    /* rails */
    leftExpanded,
    rightExpanded,
    toggleLeftRail: useCallback(() => setLeftExpanded((v) => !v), []),
    toggleRightRail: useCallback(() => setRightExpanded((v) => !v), []),

    /* pins + recents */
    pins,
    recents,
    recentsCollapsed,
    toggleRecents: useCallback(() => setRecentsCollapsed((v) => !v), []),
    touchRecent,
    liveSessionId: PROTOTYPE_SEED.liveSessionId,

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
    parkSession,
    endSession,
    globalContext: PROTOTYPE_SEED.globalContext,
    contextValue: PROTOTYPE_SEED.contextValue,

    /* assistant feed */
    feed,
    sendToAssistant,
    runFeedAction,

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
    sessionPopoverOpen,
    setSessionPopoverOpen,
    settingsPopoverOpen,
    setSettingsPopoverOpen,
    launcherQuery,
    openLauncher,
    closeLauncher,
    contextMenu,
    setContextMenu,
  };
}
