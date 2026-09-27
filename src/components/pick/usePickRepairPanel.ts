'use client';

/**
 * Repair-panel state for the Picker desk: a repair scan at the desk
 * (`handleRepairScan` → `open-repair-details`) opens the repair rail.
 */

import { useEffect, useState } from 'react';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

interface OpenRepairDetail {
  repairId: number;
  assignmentId: number | null;
  assignedTechId: number | null;
}

export interface PickRepairPanel {
  record: RSRecord;
  assignmentId: number | null;
  assignedTechId: number | null;
}

interface PickRepairPanelState {
  repairPanel: PickRepairPanel | null;
  setRepairPanel: React.Dispatch<React.SetStateAction<PickRepairPanel | null>>;
  loadingRepair: boolean;
}

export function usePickRepairPanel(): PickRepairPanelState {
  const [repairPanel, setRepairPanel] = useState<PickRepairPanel | null>(null);
  const [loadingRepair, setLoadingRepair] = useState(false);

  useEffect(() => {
    const handleOpenRepair = async (e: Event) => {
      const { repairId, assignmentId, assignedTechId } = (e as CustomEvent<OpenRepairDetail>).detail;
      setLoadingRepair(true);
      try {
        const res = await fetch(`/api/repair-service/${repairId}`);
        if (res.ok) {
          const data = await res.json();
          const record: RSRecord = data.repair ?? data;
          setRepairPanel({ record, assignmentId, assignedTechId });
        }
      } catch (err) {
        console.error('Error loading repair details:', err);
      } finally {
        setLoadingRepair(false);
      }
    };
    window.addEventListener('open-repair-details', handleOpenRepair);
    return () => window.removeEventListener('open-repair-details', handleOpenRepair);
  }, []);

  return {
    repairPanel,
    setRepairPanel,
    loadingRepair,
  };
}
