import type { ComponentType } from 'react';
import { Images, LayoutDashboard, Link2, Ticket } from '@/components/Icons';
import type { HeaderCenterTask } from '@/contexts/HeaderContext';

export type StationTask = 'work' | 'photos' | 'ticket' | 'pair' | 'displays';

/**
 * The station's header tabs (operator 2026-10-08). Each reads as icon + word
 * and the selected one wears the Scan Stations switcher's selected face
 * (`HeaderTaskTabs`). Every icon carries its own colour: the work tab the
 * station's Scan Stations tone (Unbox blue), Pair violet, Photos sky (with a
 * lighter word), Ticket orange, Displays emerald. Contextual tabs come and go
 * with the record — `useStationTaskController` decides `visible`.
 */
export function stationHeaderTasks({
  workLabel,
  workIcon,
  workTone,
  visible,
}: {
  workLabel: string;
  workIcon: ComponentType<{ className?: string }>;
  /** The station's `SCAN_STATION_TONES` icon class. */
  workTone: string;
  visible: ReadonlySet<StationTask>;
}): readonly HeaderCenterTask[] {
  const all: ReadonlyArray<HeaderCenterTask & { id: StationTask }> = [
    { id: 'work', label: workLabel, icon: workIcon, tone: workTone },
    { id: 'pair', label: 'Pair', icon: Link2, tone: 'text-violet-600' },
    { id: 'photos', label: 'Photos', icon: Images, tone: 'text-sky-600', labelTone: 'text-text-muted' },
    { id: 'ticket', label: 'Ticket', icon: Ticket, tone: 'text-orange-600' },
    { id: 'displays', label: 'Displays', icon: LayoutDashboard, tone: 'text-emerald-600' },
  ];
  return all.filter((task) => visible.has(task.id));
}
