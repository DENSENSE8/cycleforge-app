'use client';

/**
 * A record's desk slot — ONE controller per open record that hands the record
 * plane its two pieces (title, view), whatever the record is. The record's
 * verbs paint in the view's Actions panel under the party/movement block,
 * never in the header (operator 2026-10-08). A panel verb's open panel is
 * keyed by the record, so walking J / K closes it.
 */

import { useState, type ReactNode } from 'react';
import { RecordTitle, RecordView } from '@/design-system/components/record-ledger/RecordView';
import type { RecordModel, RecordVerb } from '@/design-system/components/record-ledger/record-model';

export interface RecordSlot {
  title: ReactNode;
  view: ReactNode;
}

/** Title + view (with its Actions panel) for the open record; null when none is open. `testId` prefixes every test id. */
export function useRecordSlot(
  model: RecordModel | null,
  verbs: readonly RecordVerb[],
  label: string,
  testId = 'record',
): RecordSlot | null {
  const [open, setOpen] = useState<{ key: string; id: string } | null>(null);
  if (!model) return null;
  const active = open && open.key === model.key ? (verbs.find((verb) => verb.id === open.id && verb.panel) ?? null) : null;
  const close = () => setOpen(null);
  const stripVerbs = verbs.map(({ panel, ...verb }) =>
    panel ? { ...verb, pressed: active?.id === verb.id, run: () => setOpen({ key: model.key, id: verb.id }) } : verb,
  );
  return {
    title: <RecordTitle title={model.title} testId={`${testId}-title`} />,
    view: (
      <RecordView
        key={model.key}
        model={model}
        testId={testId}
        actions={{ verbs: stripVerbs, label }}
        panel={active?.panel ? { title: active.label, body: active.panel(close), onBack: close } : null}
      />
    ),
  };
}
