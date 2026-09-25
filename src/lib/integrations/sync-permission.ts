/**
 * Permission a caller needs to POST /api/integrations/[provider]/sync.
 *
 * Extracted so the To-ship Sync dropdown can disable rows the operator cannot
 * fire, without drifting from the route's own gate.
 */
import type { PermissionString } from '@/lib/auth/permissions';

export function syncPermissionForProvider(provider: string): PermissionString {
  // ShipStation is the desk's Sync face — the order import every operator with
  // `orders.import` runs. Every other wired sync is an admin action.
  if (provider === 'shipstation') return 'orders.import';
  return 'admin.manage_features';
}
