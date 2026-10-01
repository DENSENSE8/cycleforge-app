'use client';

import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import type { RecordStateFace } from '@/design-system/tokens/record';
import type { ExceptionRow } from '@/lib/exceptions/types';

/**
 * The exception tag — WHY the row is an exception — as the phone's state badge:
 * the registry's own badge face (`LifecycleCode`) in the row's danger /
 * warning tone, never a hand-rolled pill.
 */
export function ExceptionTag({ row }: { row: Pick<ExceptionRow, 'kind' | 'tag'> }) {
  const face: RecordStateFace = {
    id: row.kind,
    code: row.tag.label,
    label: row.tag.label,
    tone: row.tag.tone,
    icon: row.tag.tone === 'danger' ? 'package-x' : 'circle-pause',
  };
  return <LifecycleCode state={face} className="max-w-40" />;
}
