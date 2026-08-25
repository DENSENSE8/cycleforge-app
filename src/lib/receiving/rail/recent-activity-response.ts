/**
 * Recent-activity rail feed response shape.
 * Rescued out of `@/components/sidebar/receiving/RecentActivityRailBase`
 * (Warehouse-OS) — `rail/feeds.ts` types its fetchers with it.
 */
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
}
