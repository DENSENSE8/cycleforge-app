import type { ComponentType } from 'react';
import { Images, LayoutDashboard, Ticket } from '@/components/Icons';
import type { HeaderCenterTask } from '@/contexts/HeaderContext';

export type StationTask = 'work' | 'photos' | 'ticket' | 'displays';

export function stationHeaderTasks({
  workLabel,
  workIcon,
}: {
  workLabel: string;
  workIcon: ComponentType<{ className?: string }>;
}): readonly HeaderCenterTask[] {
  return [
    { id: 'work', label: workLabel, icon: workIcon },
    { id: 'photos', label: 'Photos', icon: Images },
    { id: 'ticket', label: 'Ticket', icon: Ticket },
    { id: 'displays', label: 'Displays', icon: LayoutDashboard },
  ];
}
