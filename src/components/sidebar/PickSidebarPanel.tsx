'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShippingSidebarPanel } from '@/components/sidebar/ShippingSidebarPanel';
import { useActiveStaffDirectory } from './hooks';

interface PickSidebarPanelProps {
  /** Signed-in picker's staff id (verified session). */
  pickerId: string;
}

/** Picker desk (`/pick`) left column — the scan band over the picker's recent scans. */
export function PickSidebarPanel({ pickerId }: PickSidebarPanelProps) {
  const queryClient = useQueryClient();
  const staffDirectory = useActiveStaffDirectory();
  const pickerName =
    staffDirectory.find((m) => String(m.id) === String(pickerId))?.name || 'Picker';

  const refreshHistory = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['desk-pick-logs'] });
  }, [queryClient]);

  return (
    <ShippingSidebarPanel
      techId={pickerId}
      techName={pickerName}
      staffId={pickerId}
      onComplete={refreshHistory}
    />
  );
}
