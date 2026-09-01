/**
 * Permission a caller needs to POST /api/integrations/[provider]/sync.
 *
 * Extracted so the To-ship Sync dropdown can disable rows the operator cannot
 * fire, without drifting from the route's own gate.
 */
import type { PermissionString } from '@/lib/auth/permissions';

export function syncPermissionForProvider(provider: string): PermissionString {
  if (provider === 'ebay') return 'integrations.ebay';
  if (provider === 'amazon') return 'integrations.amazon';
  if (provider === 'zoho') return 'integrations.zoho';
  // Order-import sources whose sync replaces the legacy transfer-orders
  // buttons (INT-020) keep the permission those buttons required, so the
  // Unshipped sidebar's importers don't silently start 403ing operators.
  if (provider === 'google_sheets' || provider === 'ecwid') return 'orders.import';
  return 'admin.manage_features';
}
