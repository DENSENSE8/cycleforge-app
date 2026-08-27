'use client';

/**
 * Detail-overlay state for the tech dashboard: the repair panel (from repair-card
 * clicks). Carton "look" navigates to `/carton/[id]` from the inbound feed
 * (decision 2a) — editable ReceivingDetailsStack is no longer mounted here.
 */

import { useEffect, useState } from 'react';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

interface OpenRepairDetail {
  repairId: number;
  assignmentId: number | null;
  assignedTechId: number | null;
}

export interface TechRepairPanel {
  record: RSRecord;
  assignmentId: number | null;
  assignedTechId: number | null;
}

export interface TechDetailOverlays {
  repairPanel: TechRepairPanel | null;
  setRepairPanel: React.Dispatch<React.SetStateAction<TechRepairPanel | null>>;
  loadingRepair: boolean;
}

export function useTechDetailOverlays(): TechDetailOverlays {
  const [repairPanel, setRepairPanel] = useState<TechRepairPanel | null>(null);
  const [loadingRepair, setLoadingRepair] = useState(false);

  // Repair card clicks dispatched by RepairCard (inside the sidebar).
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
