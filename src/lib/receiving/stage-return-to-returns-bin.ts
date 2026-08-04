/**
 * Client helper — stage a return carton into the RETURNS-TEST bin after a
 * receiving carton-label scan. Fire-and-forget from the scan hook; never
 * blocks opening the carton.
 */

import { toast } from '@/lib/toast';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { DEFAULT_RETURNS_TEST_BIN_BARCODE, returnsTestBinSymbol } from '@/lib/inventory/returns-test-bin-symbol';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';

type StageReturnResult =
  | 'staged'
  | 'skipped_not_return'
  | 'skipped_already_staged'
  | 'no_bin'
  | 'error';

type ReturnIntakeRow = Pick<
  ReceivingLineRow,
  'id' | 'intake_type' | 'receiving_type' | 'carton_intake_type' | 'staging_location_id'
>;

async function lookupReturnsTestBinId(): Promise<number | null> {
  try {
    const res = await fetch('/api/receiving/returns-test-bin', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { location?: { id?: number } };
    const id = Number(data?.location?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * If `row` is a return intake and not already staged, PATCH staging to the
 * RETURNS-TEST bin with lane `RETURN`. Returns the outcome for tests/toasts.
 */
export async function stageReturnCartonToReturnsTestBin(args: {
  receivingId: number;
  row?: ReturnIntakeRow | null;
}): Promise<StageReturnResult> {
  const receivingId = Number(args.receivingId);
  if (!Number.isFinite(receivingId) || receivingId <= 0) return 'error';

  const row = args.row ?? null;
  if (row && !isReturnIntake(row)) return 'skipped_not_return';
  // No row facts → only stage when the caller already decided it's a return
  // (pass a return row). Without intake facts we refuse rather than staging
  // every carton into returns.
  if (!row) return 'skipped_not_return';

  if (row.staging_location_id != null) return 'skipped_already_staged';

  const binId = await lookupReturnsTestBinId();
  if (binId == null) {
    console.warn('[returns-test-bin] RETURNS-TEST bin missing — skip auto-stage');
    return 'no_bin';
  }

  try {
    const res = await fetch(`/api/receiving/${receivingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staging_location_id: binId,
        priority_lane: 'RETURN',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      console.warn('[returns-test-bin] staging PATCH failed:', data?.error ?? res.status);
      return 'error';
    }
    if (typeof window !== 'undefined' && row.id > 0) {
      dispatchLineUpdated({
        id: row.id,
        staging_location_id: binId,
        priority_lane: 'RETURN',
      });
    }
    if (typeof window !== 'undefined') {
      toast.success('Staged to returns bin', {
        description: returnsTestBinSymbol() || DEFAULT_RETURNS_TEST_BIN_BARCODE,
      });
    }
    return 'staged';
  } catch (err) {
    console.warn('[returns-test-bin] staging PATCH error:', err);
    return 'error';
  }
}
