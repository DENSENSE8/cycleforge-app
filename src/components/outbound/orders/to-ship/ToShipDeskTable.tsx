'use client';

/**
 * To-Ship desk queue table — the desk-only mount of the unshipped fulfillment
 * feed. Data layer matches {@link UnshippedTable}; grid mounts via the desk
 * fork ({@link ToShipDeskShelfBoard}) instead of the shared `orders` family.
 */

import type { UnshippedTableProps } from '@/components/unshipped/UnshippedTable';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';

type ToShipDeskTableProps = Omit<UnshippedTableProps, 'variant'>;

export function ToShipDeskTable(props: ToShipDeskTableProps) {
  return <UnshippedTable {...props} variant="desk" />;
}
