'use client';

/**
 * Unbox commit `stage` — Band 1 CTA while the wedge waits for a location barcode.
 *
 * Confirm / reopen faces mirror acknowledgement docks. The actual scan lands in
 * {@link UnboxDockScanEntry} (`activeKey === 'stage'`) or via this control's
 * "Reopen" clear. Never Arrival carton `staging_location_id`.
 */

import { useCallback, useState } from 'react';
import { Check, Loader2, MapPin } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { toast } from '@/lib/toast';
import type { UnboxStepDockContext } from './types';

export function LocationScanDockControl({ row }: UnboxStepDockContext) {
  const [saving, setSaving] = useState(false);
  const staged = Boolean(row.staged_at && row.staged_location_id);

  const reopen = useCallback(async () => {
    if (row.id <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/receiving/lines/${row.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: false }),
      });
      if (!res.ok) throw new Error(String(res.status));
      dispatchLineUpdated({
        id: row.id,
        staged_at: null,
        staged_location_id: null,
        staged_location_name: null,
        staged_location_barcode: null,
        staged_location_room: null,
      });
      toast.message('Location cleared — scan a bin barcode');
    } catch {
      toast.error('Could not clear the staged location.');
    } finally {
      setSaving(false);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    }
  }, [row.id]);

  return (
    <div className="flex h-11 w-full min-w-0 items-stretch gap-0" data-unbox-stage-dock>
      {staged ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          ariaLabel="Reopen location staging — clear scanned bin"
          icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          onClick={() => void reopen()}
          className="h-full w-full min-w-0 justify-center rounded-none"
        >
          {row.staged_location_name?.trim() || 'Location set'} · Reopen
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled
          ariaLabel="Scan a location barcode to stage this unit"
          icon={<MapPin className="h-3.5 w-3.5" />}
          className="h-full w-full min-w-0 justify-center rounded-none"
        >
          Scan location barcode
        </Button>
      )}
    </div>
  );
}
