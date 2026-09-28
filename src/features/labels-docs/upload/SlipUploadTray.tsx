'use client';

/**
 * The packing-slip review tray. Each picked file shows the order it will
 * file onto — the order's identity (platform dot + number) when the filename
 * or the page text named exactly one order, else an order picker (an
 * ambiguous file lists the orders it named first). Remove drops a file;
 * Confirm all stays off while any remaining row has no order, so nothing
 * attaches silently. After Confirm, each row reports Filed or Failed.
 */

import type { ReactNode } from 'react';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button } from '@/design-system/primitives';
import { AlertTriangle, Check, Loader2, Upload, X } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { OrderNumberIdentity } from '@/components/ui/OrderIdentityChips';
import type { SlipCandidate } from './slip-matching';
import type { SlipUploadRow, SlipUploads } from './use-slip-uploads';

const STATUS_BADGE: Partial<Record<SlipUploadRow['status'], { label: string; variant: 'default' | 'success' | 'destructive'; glyph: ReactNode }>> = {
  reading: { label: 'Reading', variant: 'default', glyph: <Loader2 className="animate-spin" aria-hidden /> },
  uploading: { label: 'Filing', variant: 'default', glyph: <Loader2 className="animate-spin" aria-hidden /> },
  filed: { label: 'Filed', variant: 'success', glyph: <Check aria-hidden /> },
  failed: { label: 'Failed', variant: 'destructive', glyph: <AlertTriangle aria-hidden /> },
};

function SlipRow({
  row,
  candidates,
  uploads,
}: {
  row: SlipUploadRow;
  candidates: ReadonlyArray<SlipCandidate>;
  uploads: SlipUploads;
}) {
  const named = row.match && 'ambiguous' in row.match ? row.match.ambiguous : [];
  const chosen = row.orderId === null ? null : candidates.find((candidate) => candidate.orderId === row.orderId) ?? null;
  const badge = STATUS_BADGE[row.status];
  const locked = row.status === 'filed' || row.status === 'uploading' || uploads.pending;
  const options = [...candidates]
    .sort((a, b) => Number(named.includes(b.orderId)) - Number(named.includes(a.orderId)))
    .map((candidate) => ({
      value: candidate.orderId,
      label: candidate.orderRef,
      meta: candidate.accountSource ?? undefined,
      group: named.length > 0 ? (named.includes(candidate.orderId) ? 'Named in the file' : 'Other orders') : undefined,
    }));
  const note =
    row.status === 'reading'
      ? null
      : row.orderId !== null
        ? null
        : named.length > 0
          ? `Names ${named.length} orders — pick one`
          : 'No order named — pick one';

  return (
    <li className="flex min-w-0 flex-col gap-1 py-1.5" data-status={row.status}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-role-data text-text-default" title={row.file.name}>
          {row.file.name}
        </p>
        {badge ? (
          <Badge variant={badge.variant}>
            {badge.glyph}
            {badge.label}
          </Badge>
        ) : null}
        {row.status !== 'filed' ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<X />}
            iconOnly
            aria-label={`Remove ${row.file.name}`}
            disabled={locked}
            onClick={() => uploads.remove(row.key)}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {row.status === 'reading' ? null : chosen ? (
        <div className="flex min-w-0 items-center gap-2">
          <OrderNumberIdentity orderId={chosen.orderRef} platformLabel={chosen.accountSource} />
          {locked ? null : (
            <Button variant="ghost" size="sm" onClick={() => uploads.assign(row.key, null)}>
              Change
            </Button>
          )}
        </div>
      ) : (
        <SearchableSelectField
          value={null}
          onChange={(value) => uploads.assign(row.key, value === null ? null : Number(value))}
          options={options}
          placeholder="Pick the order"
          searchPlaceholder="Order number"
          emptyMessage="No order on the desk matches"
          ariaLabel={`Order for ${row.file.name}`}
          disabled={locked}
          testId="slip-upload-order-picker"
        />
      )}
      {note ? <p className="text-role-caption text-amber-800">{note}</p> : null}
      {row.reason ? <p className="text-role-caption text-rose-700">{row.reason}</p> : null}
    </li>
  );
}

/**
 * @param uploads the desk's `useSlipUploads()` result — rows, pick/remove, Confirm all, dismiss.
 * @param candidates the same orders passed to `useSlipUploads` — the picker's options and each match's identity.
 */
export function SlipUploadTray({ uploads, candidates }: { uploads: SlipUploads; candidates: ReadonlyArray<SlipCandidate> }) {
  const { rows, pending, canConfirm, confirm, clear } = uploads;
  if (rows.length === 0) return null;
  const filed = rows.filter((row) => row.status === 'filed').length;
  const undecided = rows.filter((row) => row.status !== 'filed' && row.status !== 'reading' && row.orderId === null).length;
  const allFiled = filed === rows.length;

  return (
    <RecordGroup
      title={pending ? `Filing packing slips · ${filed} of ${rows.length}` : `Packing slips · ${rows.length}`}
      testId="slip-upload-tray"
      action={
        <Button variant="ghost" size="sm" icon={<X />} disabled={pending} onClick={clear} aria-label="Dismiss packing slips">
          Dismiss
        </Button>
      }
    >
      <ul className="max-h-96 divide-y divide-border-soft overflow-y-auto px-4" aria-live="polite">
        {rows.map((row) => (
          <SlipRow key={row.key} row={row} candidates={candidates} uploads={uploads} />
        ))}
      </ul>
      {allFiled ? null : (
        <div className="flex items-center gap-2 px-4 pb-3 pt-2">
          {undecided > 0 ? (
            <p className="min-w-0 flex-1 text-role-caption text-text-muted">
              {undecided} {undecided === 1 ? 'slip needs' : 'slips need'} an order — pick or remove
            </p>
          ) : (
            <span className="flex-1" />
          )}
          <Button variant="primary" size="sm" icon={<Upload />} loading={pending} disabled={!canConfirm} onClick={() => void confirm()}>
            Confirm all
          </Button>
        </div>
      )}
    </RecordGroup>
  );
}
