'use client';

/**
 * Station Displays — right-edge **push** column SoT (Unbox golden · Arrival ·
 * Testing · Pack · Shipping · Review).
 *
 * **Action Plane host** (Station Action vs Context planes): every scan station
 * mounts this stack. Leaf densify / keyboard grammar lives in
 * {@link StationActionDossierShell} · {@link StationDenseFactStrip} ·
 * {@link useStationActionKeyBindings} — builders only register leaves. Esc / Back
 * stay here; leaf legends must not bind Escape. On leaf open, focus restores
 * into `[data-station-action-dossier]` when present.
 *
 * Navigation is Root-to-Leaf drill-down — ONE grammar, no mode prop:
 *   - `activeTab === 'index'` → grouped status / topic rows
 *   - leaf id → sticky top-left ← → + current title (+ optional leaf-wide
 *     trailing perspective via {@link useDisplaysLeafChrome} `setLeafTrailing`)
 *     + full-height body
 *   - Esc / Back pops one trail level (nested leaf drill → leaf root →
 *     visit back → index → close). Leaves report trail via
 *     {@link useDisplaysLeafChrome}; they never mount a second
 *     {@link StationDisplayLeafHeader}.
 *   - Forward restores nested drill first, then the visit future stack.
 *
 * Chrome bands are stage-owned (left-rail twin grammar):
 *   - Root Index **and** default leaves → {@link StationDisplaysDismissFooter}
 *     (`Filter displays…`) — the column's bottom band. Dismiss is NOT here any
 *     more: the single header band owns the far-right `→|` (2026-08-18).
 *   - Leaf opt-in → {@link StationDisplaysCommandFooter} (`/` · `→|`)
 *     when the active leaf registers commands via
 *     {@link useDisplaysLeafChrome} `setLeafCommands` (`leaf-command`)
 *
 * When {@link headerActions} is set (Unbox carton Macro), those verbs sit in the
 * single header band's right group, `⋮` last before fullscreen + close. Delete
 * and Resolve live inside `⋮`. The bottom band keeps the **filter** only and is
 * still the left context rail's twin.
 *
 * Host body is {@link DisplaysIndexLeafStage} (shared with desk
 * `DeskInspectorIndexShell`) inside the push column.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SectionTab } from '@/design-system/components';
import { isKeyboardRegionOwner } from '@/lib/keyboard/keyboard-region-owner';
import { StationDisplaysCommandFooter } from './StationDisplaysCommandFooter';
import { StationDisplaysDismissFooter } from './StationDisplaysDismissFooter';
import {
  STATION_DISPLAY_INDEX,
  deriveDisplayIndexRowsFromTabs,
  filterDisplayIndexRows,
  type DisplayIndexRow,
} from './display-index';
import type { DisplaysFooterCommand, DisplaysFooterStage } from './displays-footer-command';
import {
  DisplaysLeafChromeProvider,
  type DisplaysBreadcrumbSegment,
} from './displays-leaf-chrome';
import {
  canVisitBack,
  canVisitForward,
  createVisitHistory,
  goVisitForward,
  goLeafRootBack,
  pushVisitFrame,
  visitFrameKey,
  visitFramesEqual,
  type DisplaysVisitFrame,
  type DisplaysVisitHistoryState,
} from './displays-visit-history';
import {
  DisplaysIndexLeafStage,
  type StationDisplayIndexFilterKeys,
} from './DisplaysIndexLeafStage';
import { StationDisplayLeafHeader } from './StationDisplayLeafHeader';
import { StationDisplaysPushColumn } from './StationDisplaysPushColumn';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

const DISPLAYS_PUSH_STORAGE_KEY = 'unbox-displays-push-width';

function tabLabel(tabs: SectionTab[], id: string): string {
  return tabs.find((t) => t.id === id)?.label ?? id;
}

function defaultVisitFrame(activeTab: string): DisplaysVisitFrame {
  return { tab: activeTab };
}

export function StationDisplaysPushStack({
  tabs,
  activeTab,
  onTabChange,
  onClose,
  rightSlot = null,
  headerActions = null,
  indexRows,
  /**
   * Current visit snapshot (tab + nest). When omitted, `{ tab: activeTab }`.
   * Unbox passes photo/linkage/units/ticket nest so Forward restores verbs.
   */
  visitFrame,
  /**
   * Apply a history frame (Back / Forward). Default: `onTabChange(frame.tab)`.
   * Unbox maps nest keys onto `setDisplay` opts.
   */
  onVisitNavigate,
  /**
   * Clear visit + nested-forward stacks when this key changes (carton id).
   * Omit to keep history for the column mount only.
   */
  historyScopeKey = null,
  // Defaults match Unbox so that call site stays thin; siblings pass their own
  // storage key / aria / testids so prefs don't collide.
  ariaLabel = 'Unbox displays',
  storageKey = DISPLAYS_PUSH_STORAGE_KEY,
  testId = 'receiving-displays-push',
  resizeLabel = 'Resize displays panel',
  resizeTestId = 'unbox-displays-push-resize',
  resizeTooltip = 'Resize displays',
}: {
  tabs: SectionTab[];
  /** `index` = Root Index; otherwise a leaf tab id from {@link tabs}. */
  activeTab: string;
  onTabChange: (id: string) => void;
  onClose: () => void;
  /**
   * Procedure progress ring — column top band, leading the Macro verbs.
   * A read-only metric, so it never sits in {@link headerActions}. Optional;
   * stations without a derived procedure leave it empty.
   */
  rightSlot?: ReactNode;
  /**
   * Carton Macro verbs in the top-band trailing cluster — Unbox golden:
   * Refresh · Print · Edit · `⋯` (Resolve + Delete). Omit on stations that
   * have not wired it yet.
   */
  headerActions?: ReactNode;
  /**
   * Enriched Root Index rows (subtitle + tone + group). When omitted, rows are
   * derived from visible {@link tabs} (neutral tone + default groups).
   */
  indexRows?: DisplayIndexRow[];
  visitFrame?: DisplaysVisitFrame;
  onVisitNavigate?: (frame: DisplaysVisitFrame) => void;
  historyScopeKey?: string | number | null;
  ariaLabel?: string;
  storageKey?: string;
  testId?: string;
  resizeLabel?: string;
  resizeTestId?: string;
  resizeTooltip?: string;
}) {
  const onIndex = activeTab === STATION_DISPLAY_INDEX;
  const [filterQuery, setFilterQuery] = useState('');
  const applyFilterQuery = useCallback(
    (next: string) => {
      setFilterQuery(next);
      if (!onIndex && next.trim()) onTabChange(STATION_DISPLAY_INDEX);
    },
    [onIndex, onTabChange],
  );
  /** Footer filter → index list ↑↓/Enter/Esc bridge (cursor stays in the list). */
  const indexFilterKeysRef = useRef<StationDisplayIndexFilterKeys | null>(null);
  /** Last leaf visited — paints layout-stable active glow on Root Index return. */
  const [lastLeafId, setLastLeafId] = useState<string | null>(null);
  /** Sticky Back breadcrumb — leaf bodies deepen via {@link useDisplaysLeafChrome}. */
  const [leafTrail, setLeafTrail] = useState<DisplaysBreadcrumbSegment[]>([]);
  /** Leaf-wide header trailing (Claim New·Link) — cleared on index / leaf exit. */
  const [leafTrailing, setLeafTrailingState] = useState<ReactNode>(null);
  /** Opt-in leaf-command items — non-empty flips footer to leaf-command stage. */
  const [leafCommands, setLeafCommandsState] = useState<DisplaysFooterCommand[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const nestedPopRef = useRef<(() => void) | null>(null);
  const nestedRestoreRef = useRef<((segmentId: string) => void) | null>(null);
  /** Segment ids popped by nested Back — Forward restores before visit future. */
  const [nestedForward, setNestedForward] = useState<string[]>([]);

  const resolvedFrame = visitFrame ?? defaultVisitFrame(activeTab);
  const frameKey = visitFrameKey(resolvedFrame);
  const [history, setHistory] = useState<DisplaysVisitHistoryState>(() =>
    createVisitHistory(resolvedFrame),
  );
  /** Skip the next visitFrame sync after Back/Forward apply. */
  const historyNavRef = useRef(false);
  const prevScopeRef = useRef(historyScopeKey);
  const presentFrameRef = useRef(resolvedFrame);
  presentFrameRef.current = resolvedFrame;

  useEffect(() => {
    if (activeTab !== STATION_DISPLAY_INDEX) setLastLeafId(activeTab);
    else setLeafTrailingState(null);
  }, [activeTab]);

  // Carton / line scope change — wipe visit + nested forward.
  useEffect(() => {
    if (prevScopeRef.current === historyScopeKey) return;
    prevScopeRef.current = historyScopeKey;
    setHistory(createVisitHistory(presentFrameRef.current));
    setNestedForward([]);
  }, [historyScopeKey]);

  // Record divergent visits whenever the host frame key changes.
  useEffect(() => {
    const frame = presentFrameRef.current;
    if (historyNavRef.current) {
      historyNavRef.current = false;
      setHistory((prev) =>
        visitFramesEqual(prev.present, frame) ? prev : { ...prev, present: frame },
      );
      return;
    }
    setHistory((prev) => pushVisitFrame(prev, frame));
  }, [frameKey]);

  // Seed / reset trail when the active leaf tab changes (or returning to index).
  // Depend on activeTab only — `tabs` identity churn must not wipe a nested trail
  // the leaf just reported via setTrail.
  useEffect(() => {
    if (onIndex) {
      setLeafTrail([]);
      nestedPopRef.current = null;
      nestedRestoreRef.current = null;
      setNestedForward([]);
      setLeafCommandsState([]);
      setCommandOpen(false);
      return;
    }
    setLeafTrail([{ id: activeTab, label: tabLabel(tabs, activeTab) }]);
    nestedPopRef.current = null;
    nestedRestoreRef.current = null;
    setNestedForward([]);
    setLeafCommandsState([]);
    setCommandOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab label is read once per leaf open
  }, [activeTab, onIndex]);

  // Action Plane: when a leaf mounts a dossier shell, land keyboard focus on
  // its roving row (not the Back control). Leaves without the shell are unchanged.
  useEffect(() => {
    if (activeTab === STATION_DISPLAY_INDEX) return;
    const id = window.requestAnimationFrame(() => {
      const dossier = document.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-station-action-dossier]`,
      );
      if (!dossier) return;
      const row = dossier.querySelector<HTMLElement>('button[tabindex="0"]');
      row?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeTab, testId]);

  const resolvedIndexRows = useMemo(
    () => indexRows ?? deriveDisplayIndexRowsFromTabs(tabs),
    [indexRows, tabs],
  );

  const filteredIndexRows = useMemo(
    () => filterDisplayIndexRows(resolvedIndexRows, filterQuery),
    [resolvedIndexRows, filterQuery],
  );

  const activeLeafTab = useMemo(() => {
    if (onIndex) return null;
    return tabs.find((t) => t.id === activeTab) ?? null;
  }, [onIndex, tabs, activeTab]);

  const applyFrame = useCallback(
    (frame: DisplaysVisitFrame) => {
      historyNavRef.current = true;
      if (onVisitNavigate) {
        onVisitNavigate(frame);
        return;
      }
      onTabChange(frame.tab);
    },
    [onVisitNavigate, onTabChange],
  );

  const setTrail = useCallback((segments: DisplaysBreadcrumbSegment[]) => {
    if (segments.length < 1) return;
    setLeafTrail((prev) => {
      // Divergent drill (trail grows) clears nested Forward.
      if (segments.length > prev.length) {
        setNestedForward([]);
      }
      return segments;
    });
  }, []);

  const setOnNestedPop = useCallback((handler: (() => void) | null) => {
    nestedPopRef.current = handler;
  }, []);

  const setOnNestedRestore = useCallback((handler: ((segmentId: string) => void) | null) => {
    nestedRestoreRef.current = handler;
  }, []);

  const setLeafCommands = useCallback((items: DisplaysFooterCommand[] | null) => {
    const next = items && items.length > 0 ? items : [];
    setLeafCommandsState(next);
    if (next.length === 0) setCommandOpen(false);
  }, []);

  const setLeafTrailing = useCallback((node: ReactNode | null) => {
    setLeafTrailingState(node);
  }, []);

  const canNestedForward = nestedForward.length > 0;
  const canHistoryBack = canVisitBack(history);
  const canHistoryForward = canVisitForward(history);

  /** Pop one breadcrumb level — nested leaf drill → visit back → Displays index. */
  const popOne = useCallback(() => {
    if (leafTrail.length > 1) {
      const dropped = leafTrail[leafTrail.length - 1]!.id;
      setNestedForward((prev) => [...prev, dropped]);
      nestedPopRef.current?.();
      return;
    }
    setNestedForward([]);
    const back = goLeafRootBack(history);
    setHistory(back);
    applyFrame(back.present);
  }, [leafTrail, history, applyFrame]);

  const goForward = useCallback(() => {
    if (nestedForward.length > 0) {
      const nextId = nestedForward[nestedForward.length - 1]!;
      setNestedForward((prev) => prev.slice(0, -1));
      nestedRestoreRef.current?.(nextId);
      return;
    }
    const fwd = goVisitForward(history);
    if (!fwd) return;
    setHistory(fwd);
    applyFrame(fwd.present);
  }, [nestedForward, history, applyFrame]);

  /** Esc: command palette → clear index filter → nested → visit/leaf → index → close. Never Forward. */
  const onEscape = useCallback(() => {
    if (commandOpen) {
      setCommandOpen(false);
      return;
    }
    if (onIndex && filterQuery.trim()) {
      setFilterQuery('');
      return;
    }
    if (onIndex) onClose();
    else popOne();
  }, [commandOpen, filterQuery, onIndex, onClose, popOne]);

  /** Index Left closes the column (Layer A); leaf Left = popOne. */
  const onHistoryBack = useCallback(() => {
    if (onIndex) {
      onClose();
      return;
    }
    popOne();
  }, [onIndex, onClose, popOne]);

  // While Right owns keyboard (pointer into Displays / column open), ← → drive
  // Displays history — not Middle procedure. Yields to editables.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!isKeyboardRegionOwner('right')) return;
      if (isEditableKeyTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'ArrowLeft') onHistoryBack();
      else goForward();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onHistoryBack, goForward]);

  // Index Left always closes the column — never "Back to <prior leaf>" while
  // the topic list is showing (past may still hold a leaf under Index).
  const visitBackLabel = (() => {
    if (onIndex || !canHistoryBack) return null;
    const tab = history.past[history.past.length - 1]!.tab;
    if (tab === STATION_DISPLAY_INDEX) return 'Displays';
    return tabLabel(tabs, tab);
  })();

  const backLabel =
    leafTrail.length > 1
      ? `Back to ${leafTrail[leafTrail.length - 2]!.label}`
      : visitBackLabel
        ? `Back to ${visitBackLabel}`
        : onIndex
          ? 'Close displays'
          : 'Back to Displays';

  const forwardTargetLabel = (() => {
    if (canNestedForward) {
      const id = nestedForward[nestedForward.length - 1]!;
      // Prefer the label the leaf last painted for this segment.
      return id;
    }
    if (canHistoryForward) {
      const tab = history.future[0]!.tab;
      return tab === STATION_DISPLAY_INDEX ? 'Displays' : tabLabel(tabs, tab);
    }
    return '';
  })();

  const forwardLabel = forwardTargetLabel
    ? `Forward to ${forwardTargetLabel}`
    : 'Forward';

  /** Index Left closes; leaf Left always has a pop target (nested · visit · index). */
  const canGoBack = true;
  const canGoForward = canNestedForward || canHistoryForward;

  const historyChrome = (
    <StationDisplayLeafHeader
      segments={
        onIndex
          ? [{ id: STATION_DISPLAY_INDEX, label: 'Displays' }]
          : leafTrail.length > 0
            ? leafTrail
            : [{ id: activeTab, label: tabLabel(tabs, activeTab) }]
      }
      onBack={onHistoryBack}
      onForward={goForward}
      backLabel={backLabel}
      forwardLabel={forwardLabel}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      trailing={onIndex ? null : leafTrailing}
    />
  );

  const footerStage: DisplaysFooterStage = onIndex
    ? 'index-filter'
    : leafCommands.length > 0
      ? 'leaf-command'
      : 'leaf-dismiss';

  return (
    <StationDisplaysPushColumn
      ariaLabel={ariaLabel}
      testId={testId}
      storageKey={storageKey}
      resizeLabel={resizeLabel}
      resizeTestId={resizeTestId}
      resizeTooltip={resizeTooltip}
      onClose={onClose}
      onEscape={onEscape}
      headerRightSlot={rightSlot}
      headerNav={historyChrome}
      headerActions={headerActions}
      footer={
        footerStage === 'leaf-command' ? (
          <div data-footer-stage={footerStage} className="shrink-0">
            <StationDisplaysCommandFooter
              commands={leafCommands}
              open={commandOpen}
              onOpenChange={setCommandOpen}
              onClose={onClose}
            />
          </div>
        ) : (
          <div
            data-testid="unbox-displays-footer"
            data-footer-stage={footerStage}
            className="shrink-0"
          >
            <StationDisplaysDismissFooter
              filterQuery={filterQuery}
              onFilterChange={applyFilterQuery}
              onFilterClear={() => applyFilterQuery('')}
              onFilterKeyDown={(e) =>
                indexFilterKeysRef.current?.onFilterKeyDown(e)
              }
            />
          </div>
        )
      }
    >
      <DisplaysIndexLeafStage
        onIndex={onIndex}
        rows={filteredIndexRows}
        tabs={tabs}
        onSelectLeaf={onTabChange}
        lastLeafId={lastLeafId}
        filterQuery={filterQuery}
        onClearFilter={() => setFilterQuery('')}
        indexFilterKeysRef={indexFilterKeysRef}
        leafId={activeTab}
        leafTestId="unbox-displays-leaf"
        leafBody={
          <DisplaysLeafChromeProvider
            setTrail={setTrail}
            setOnNestedPop={setOnNestedPop}
            setOnNestedRestore={setOnNestedRestore}
            setLeafCommands={setLeafCommands}
            setLeafTrailing={setLeafTrailing}
          >
            {activeLeafTab?.content ?? null}
          </DisplaysLeafChromeProvider>
        }
      />
    </StationDisplaysPushColumn>
  );
}

export type { DisplaysVisitFrame };
