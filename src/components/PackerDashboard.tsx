'use client';

import React from 'react';
import { PackerRightPane } from '@/components/packer/PackerRightPane';
import {
  dispatchPackActiveFba,
  dispatchPackActiveOrder,
  usePackerOrderPane,
} from '@/components/packer/usePackerOrderPane';
import { StationDetailsHandler } from './station/StationDetailsHandler';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';

export default function PackerDashboard() {
  useRealtimeToasts('packer');
  const { activeOrderPane, setActiveOrderPane, activeFbaPane, setActiveFbaPane } =
    usePackerOrderPane();

  return (
    <>
      <div className="relative flex h-full w-full">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <PackerRightPane
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
