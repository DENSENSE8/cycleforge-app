'use client';

/**
 * RecordSerials — every serial on the record in ONE list with a "Copy all"
 * (owner 2026-09-29: a warehouse system; returns need every serial at once).
 * Each item still shows its own serials INLINE on the item, so which serial
 * belongs to which item reads there; this section is the whole set:
 *
 *   Serial numbers · 3 of 4                               [⧉ Copy all]
 *   ─────────────────────────────────────────────────────────────
 *   ▥ SN-8812-AX09
 *   ▥ SN-8812-AX10
 *   ▥ SN-8812-AX11
 *   Not scanned yet
 *
 * One component for every record that carries units — the outbound order,
 * the inbound purchase order / carton. Serials paint FULL (never last-8).
 */

import type { ReactNode } from 'react';
import { Copy } from '@/components/Icons';
import { SerialChip } from '@/components/ui/CopyChip';
import { Button } from '@/design-system/primitives/Button';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';

export function RecordSerials({
  rows,
  expected,
  editor,
  testId = 'record-serials',
}: {
  rows: readonly string[];
  /** Units the record expects; unscanned ones paint as open rows. Omit when unknown. */
  expected?: number;
  /** The record's own add / edit control, under the rows (the repair's one serial). */
  editor?: ReactNode;
  testId?: string;
}) {
  const open = expected != null ? Math.max(0, expected - rows.length) : 0;
  if (rows.length === 0 && open === 0 && !editor) return null;
  const count = expected != null && expected !== rows.length ? `${rows.length} of ${expected}` : String(rows.length);
  const copyAll = async () => {
    if (!(await copyToClipboard(rows.join('\n'), { historyKind: 'Serial numbers' }))) toast.error('Could not copy the serial numbers');
    else toast.success(`Copied ${rows.length} serial number${rows.length === 1 ? '' : 's'}`);
  };
  return (
    <RecordGroup
      title={`Serial numbers · ${count}`}
      testId={testId}
      action={
        rows.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Copy />}
            onClick={() => void copyAll()}
            data-testid={`${testId}-copy-all`}
          >
            Copy all
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col">
        {rows.map((serial, index) => (
          <li
            key={`${serial}:${index}`}
            className="flex min-h-9 min-w-0 items-center border-b border-mode-fact px-4 last:border-b-0"
            data-testid={`${testId}-row`}
          >
            <SerialChip value={serial} display={serial} dense width="w-auto max-w-full" />
          </li>
        ))}
        {Array.from({ length: open }, (_, index) => (
          <li
            key={`open:${index}`}
            className="flex min-h-9 min-w-0 items-center border-b border-mode-fact px-4 text-role-caption text-mode-muted last:border-b-0"
            data-testid={`${testId}-open`}
          >
            Not scanned yet
          </li>
        ))}
      </ul>
      {editor ? <div className="px-4 pb-3 pt-1">{editor}</div> : null}
    </RecordGroup>
  );
}
