'use client';

/**
 * The repair record's desk slot — the open ticket's title, subtitle and view
 * (its verbs in the view's Actions panel, operator 2026-10-08) for the list's
 * record plane (the inbound twin is `useRecordSlot`). Form verbs open the
 * strip's centered dialog; the record body never swaps.
 */

import { useMemo, type ReactNode } from 'react';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { repairRecordModel } from '@/lib/repair/repair-record-model';
import { getCurrentPSTDateKey } from '@/utils/date';
import { RepairRecordTitle, RepairServiceRecordView } from './RepairServiceRecordView';
import { useRepairRecordVerbs } from './repair-record-verbs';

export interface RepairRecordSlot {
  title: ReactNode;
  subtitle: string;
  view: ReactNode;
}

export function useRepairRecordSlot(
  repair: RSRecord | null,
  { refresh, onClose }: { refresh: () => void; onClose: () => void },
): RepairRecordSlot | null {
  const { getStaffName } = useStaffNameMap();
  const todayKey = getCurrentPSTDateKey();
  const model = useMemo(() => (repair ? repairRecordModel(repair, todayKey, getStaffName) : null), [repair, todayKey, getStaffName]);
  const verbs = useRepairRecordVerbs(repair, model, { refresh, onClose });
  if (!model) return null;
  return {
    title: <RepairRecordTitle title={model.title} />,
    subtitle: model.subtitle,
    view: (
      <RepairServiceRecordView
        key={model.key}
        model={model}
        onUpdate={refresh}
        actions={{ verbs, label: `Repair ${model.title.face} actions` }}
      />
    ),
  };
}
