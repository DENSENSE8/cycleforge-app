/** Static row metadata owned by the canonical DataTable bindings. */
const SUBTITLE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'admin-bulk-allocate': ['admin-bulk-allocate.qty', 'admin-bulk-allocate.condition'],
  'admin-holds': ['admin-holds.hold_reason'],
  'admin-returns': ['inventory-events.notes', 'admin-returns.order_ref'],
  'audit-log': ['audit-log.source', 'audit-log.actor_role'],
  'auth-sessions': ['auth-sessions.device_label'],
  'cycle-count-lines': ['cycle-count-lines.tolerance'],
  'cycle-counts': ['cycle-counts.tol'],
  packer: ['packer.qty', 'packer.condition', 'packer.serial', 'packer.sku', 'packer.item_number'],
  'part-compatibility': ['part-compatibility.model'],
  'search-hits': ['search-hits.serial', 'search-hits.condition'],
  tech: ['tech.qty', 'tech.condition', 'tech.serial', 'tech.sku', 'tech.item_number'],
  'unit-allocations': ['unit-allocations.reason'],
  'walk-in-sales': ['walk-in-sales.amount', 'walk-in-sales.detail'],
};

export function dataTableSubtitleFieldIds(tableId: string): readonly string[] {
  return SUBTITLE_FIELDS[tableId] ?? [];
}
