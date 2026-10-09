'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useStationComposerMode } from '@/components/composer';
import { STATION_DISPLAY_INDEX } from '@/components/station/displays/display-index';
import { useHeaderCenterTasks } from '@/contexts/HeaderContext';
import { stationHeaderTasks, type StationTask } from './station-header-tasks';

export interface StationTaskController {
  activeTask: StationTask;
  activeDisplay: string | null;
  ticketActive: boolean;
  fulfilledActive: boolean;
  photosActive: boolean;
  pairActive: boolean;
  displaysActive: boolean;
  selectTask: (task: StationTask) => void;
  /** Show a contextual tab without switching to it (Link existing ticket pressed). */
  revealTask: (task: StationTask) => void;
  openDisplay: (displayId: string) => void;
  closeDisplays: () => void;
}

/**
 * What the open record says about its contextual tabs (operator 2026-10-08):
 * Photos shows only once the carton has photos, Ticket only once a ticket is
 * linked or Claim / Link existing ticket was pressed, Pair only while the
 * carton is unmatched or `# Pair` was pressed (and only on stations that pass
 * `pair`), Return order only while a scanned serial traces to an order that
 * was packed or shipped (and only on stations that pass `fulfilledOrder`). A
 * tab the operator opened stays for that record.
 */
export interface StationTaskContext {
  hasPhotos: boolean;
  hasTicket: boolean;
  /** Omit on stations without a Pair tab. */
  pair?: { needed: boolean };
  /** Omit on stations without a Return order tab (Unbox only). */
  fulfilledOrder?: { found: boolean };
}

/**
 * The one task/display state machine used by Arrival, Unbox, and Quality Control.
 * Header task, composer mode, and the right display rail change atomically.
 */
export function useStationTaskController({
  owner,
  workLabel,
  workIcon,
  workTone,
  scopeKey,
  initialTask = 'work',
  context,
}: {
  owner: string;
  workLabel: string;
  workIcon: ComponentType<{ className?: string }>;
  /** The station's `SCAN_STATION_TONES` icon class. */
  workTone: string;
  scopeKey: string | number;
  initialTask?: StationTask;
  context: StationTaskContext;
}): StationTaskController {
  const { setMode: setComposerMode } = useStationComposerMode();
  const [activeTask, setActiveTask] = useState<StationTask>(initialTask);
  const [activeDisplay, setActiveDisplay] = useState<string | null>(
    initialTask === 'displays' ? STATION_DISPLAY_INDEX : null,
  );
  const [revealed, setRevealed] = useState<ReadonlySet<StationTask>>(() => new Set([initialTask]));

  const revealTask = useCallback((task: StationTask) => {
    setRevealed((current) => (current.has(task) ? current : new Set(current).add(task)));
  }, []);

  const selectTask = useCallback(
    (task: StationTask) => {
      revealTask(task);
      setActiveTask(task);
      setActiveDisplay(task === 'displays' ? STATION_DISPLAY_INDEX : null);
      setComposerMode(task === 'ticket' ? 'ticket' : 'unbox');
    },
    [revealTask, setComposerMode],
  );

  const openDisplay = useCallback(
    (displayId: string) => {
      setActiveTask('displays');
      setActiveDisplay(displayId);
      setComposerMode('unbox');
    },
    [setComposerMode],
  );

  const closeDisplays = useCallback(() => {
    setActiveDisplay(null);
    setActiveTask((current) => (current === 'displays' ? 'work' : current));
  }, []);

  useEffect(() => {
    setActiveTask(initialTask);
    setActiveDisplay(initialTask === 'displays' ? STATION_DISPLAY_INDEX : null);
    setComposerMode(initialTask === 'ticket' ? 'ticket' : 'unbox');
    setRevealed(new Set([initialTask]));
    // The open record owns the reset. `initialTask` is its captured arrival policy,
    // not a live preference that may override an operator's task selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const { hasPhotos, hasTicket } = context;
  const offersPair = context.pair != null;
  const pairNeeded = context.pair?.needed ?? false;
  const offersFulfilled = context.fulfilledOrder != null;
  const fulfilledFound = context.fulfilledOrder?.found ?? false;
  const visible = useMemo(() => {
    const shown = new Set<StationTask>(['work', 'displays', activeTask]);
    for (const task of revealed) shown.add(task);
    if (hasPhotos) shown.add('photos');
    if (hasTicket) shown.add('ticket');
    if (pairNeeded) shown.add('pair');
    if (fulfilledFound) shown.add('fulfilled');
    if (!offersPair) shown.delete('pair');
    if (!offersFulfilled) shown.delete('fulfilled');
    return shown;
  }, [activeTask, revealed, hasPhotos, hasTicket, pairNeeded, offersPair, fulfilledFound, offersFulfilled]);

  const tasks = useMemo(
    () => stationHeaderTasks({ workLabel, workIcon, workTone, visible }),
    [workIcon, workLabel, workTone, visible],
  );

  const registration = useMemo(
    () => ({
      owner,
      ariaLabel: `${workLabel} tasks`,
      activeId: activeTask,
      tasks,
      onSelect: (id: string) => selectTask(id as StationTask),
    }),
    [activeTask, owner, selectTask, tasks, workLabel],
  );
  useHeaderCenterTasks(registration);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[role="dialog"]')) return;
      event.preventDefault();
      selectTask(activeTask === 'ticket' ? 'work' : 'ticket');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTask, selectTask]);
  return {
    activeTask,
    activeDisplay,
    ticketActive: activeTask === 'ticket',
    fulfilledActive: activeTask === 'fulfilled',
    photosActive: activeTask === 'photos',
    pairActive: activeTask === 'pair',
    displaysActive: activeTask === 'displays',
    selectTask,
    revealTask,
    openDisplay,
    closeDisplays,
  };
}
