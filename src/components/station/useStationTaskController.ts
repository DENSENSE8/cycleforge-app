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
  photosActive: boolean;
  displaysActive: boolean;
  selectTask: (task: StationTask) => void;
  openDisplay: (displayId: string) => void;
  closeDisplays: () => void;
}

/**
 * The one task/display state machine used by Arrival, Unbox, and Quality Control.
 * Header task, composer mode, and the right display rail change atomically.
 */
export function useStationTaskController({
  owner,
  workLabel,
  workIcon,
  scopeKey,
  initialTask = 'work',
}: {
  owner: string;
  workLabel: string;
  workIcon: ComponentType<{ className?: string }>;
  scopeKey: string | number;
  initialTask?: StationTask;
}): StationTaskController {
  const { setMode: setComposerMode } = useStationComposerMode();
  const [activeTask, setActiveTask] = useState<StationTask>(initialTask);
  const [activeDisplay, setActiveDisplay] = useState<string | null>(
    initialTask === 'displays' ? STATION_DISPLAY_INDEX : null,
  );
  const tasks = useMemo(
    () => stationHeaderTasks({ workLabel, workIcon }),
    [workIcon, workLabel],
  );

  const selectTask = useCallback(
    (task: StationTask) => {
      setActiveTask(task);
      setActiveDisplay(task === 'displays' ? STATION_DISPLAY_INDEX : null);
      setComposerMode(task === 'ticket' ? 'ticket' : 'unbox');
    },
    [setComposerMode],
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
    // The open record owns the reset. `initialTask` is its captured arrival policy,
    // not a live preference that may override an operator's task selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

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
    photosActive: activeTask === 'photos',
    displaysActive: activeTask === 'displays',
    selectTask,
    openDisplay,
    closeDisplays,
  };
}
