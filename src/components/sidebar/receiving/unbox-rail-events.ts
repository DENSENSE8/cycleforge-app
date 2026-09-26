import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';

/** Like {@link dispatchLineUpdated}, but for Unbox **workspace / accordion** patches that ride the shared `receiving-line-updated` bus. */
export function dispatchUnboxRailLineUpdated(
  row: Partial<ReceivingLineRow> & { id: number },
) {
  const patch = { ...row };
  delete patch.last_activity_at;
  if (patch.unboxed_at == null) delete patch.unboxed_at;
  dispatchLineUpdated(patch);
}
