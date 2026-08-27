import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';

/**
 * Like {@link dispatchLineUpdated}, but for Unbox **workspace / accordion**
 * patches that ride the shared `receiving-line-updated` bus.
 *
 * The Unboxed sidebar dock does **not** subscribe to that bus
 * (`acceptLineUpdateBus: false` on `unboxRecent`). Dock renames go through
 * `patchUnboxRailTitleByCarton` (title fields only). Prefer narrow
 * patches here (`{ id, serials }`, scan-serial `line_patch` for siblings).
 * Never broadcast a full by-id `GET ?id=` row — that Testing hydration pattern
 * cannot reproduce feed sort axes.
 *
 * This helper only strips fields that historically arrived null/wrong on Unbox
 * PATCH responses (`last_activity_at`, null `unboxed_at`).
 */
export function dispatchUnboxRailLineUpdated(
  row: Partial<ReceivingLineRow> & { id: number },
) {
  const patch = { ...row };
  delete patch.last_activity_at;
  if (patch.unboxed_at == null) delete patch.unboxed_at;
  dispatchLineUpdated(patch);
}
