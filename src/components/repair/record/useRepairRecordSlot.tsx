'use client';

/**
 * The repair record's desk slot — the open ticket's title, subtitle, header
 * verbs and view for the list's record plane (the inbound twin is
 * `useInboundRecordSlot`). A panel verb's open panel is keyed by the record,
 * so walking J / K closes it.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { RecordActionStrip } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { repairRecordModel } from '@/lib/repair/repair-record-model';
import { getCurrentPSTDateKey } from '@/utils/date';
import { RepairRecordTitle, RepairServiceRecordView } from './RepairServiceRecordView';
import { useRepairRecordVerbs } from './repair-record-verbs';

export interface RepairRecordSlot {
  title: ReactNode;
  subtitle: string;
  actions: ReactNode;
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
  const [open, setOpen] = useState<{ key: string; id: string } | null>(null);
  if (!model) return null;
  const active = open && open.key === model.key ? (verbs.find((verb) => verb.id === open.id && verb.panel) ?? null) : null;
  const close = () => setOpen(null);
  const stripVerbs = verbs.map(({ panel, ...verb }) =>
    panel ? { ...verb, pressed: active?.id === verb.id, run: () => setOpen({ key: model.key, id: verb.id }) } : verb,
  );
  return {
    title: <RepairRecordTitle title={model.title} />,
    subtitle: model.subtitle,
    actions: (
      <RecordActionStrip key={model.key} face="header" verbs={stripVerbs} label={`Repair ${model.title.face} actions`} testId="repair-record-actions" />
    ),
    view: (
      <RepairServiceRecordView
        key={model.key}
        model={model}
        onUpdate={refresh}
        panel={active?.panel ? { title: active.label, body: active.panel(close), onBack: close } : null}
      />
    ),
  };
}
