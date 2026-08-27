'use client';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PackerRightPane } from '@/components/packer/PackerRightPane';
import {
  dispatchPackActiveFba,
  dispatchPackActiveOrder,
  usePackerOrderPane,
} from '@/components/packer/usePackerOrderPane';
import { StationDetailsHandler } from './station/StationDetailsHandler';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useRefreshSignal } from '@/lib/refresh/bus';

interface PackerDashboardProps {
  packerId: string;
}

export default function PackerDashboard({ packerId }: PackerDashboardProps) {
  useRealtimeToasts('packer');
  const queryClient = useQueryClient();
  const { activeOrderPane, setActiveOrderPane, activeFbaPane, setActiveFbaPane } =
    usePackerOrderPane();

  // Invalidate the packer-logs query in place (station-table-unification §Phase 2).
  useRefreshSignal('packer.logs', () => {
    queryClient.invalidateQueries({ queryKey: ['packer-logs'] });
  });

  return (
    <>
      <div className="relative flex h-full w-full">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <PackerRightPane
            packerId={packerId}
            activeOrderPane={activeOrderPane}
            activeFbaPane={activeFbaPane}
            onCloseActiveOrder={() => {
              dispatchPackActiveOrder(null);
              dispatchPackActiveFba(null);
              setActiveOrderPane(null);
              setActiveFbaPane(null);
            }}
          />
        </div>
      </div>
      <StationDetailsHandler stationRole="packer" />
    </>
  );
}
