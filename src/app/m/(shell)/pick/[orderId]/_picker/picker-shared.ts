import type { SkuPlatformMapping } from '@/components/inventory/SkuIdentity';
import { pickScanKey, scanNamesUnit } from '@/lib/picking/pick-scan-unit';

// ─── Types (mirror the picking API response) ─────────────────────────────────

export interface PickTask {
  allocationId: number;
  serialUnitId: number;
  serialNumber: string | null;
  /** Minted unit id the QC / pre-box label encodes. */
  unitUid: string | null;
  /** The SEALED PREBOX package (`KIT-…`) the unit is boxed in — its label names every member. */
  packageUid: string | null;
  lineId: number;
  sku: string;
  productTitle: string | null;
  bin: string | null;
  conditionGrade: string | null;
  plannedQty: number;
  currentState: string;
  platforms: SkuPlatformMapping[];
}

export interface PickOrder {
  orderId: number;
  orderLabel: string;
  customerInitials: string;
  shipByDate: string | null;
  tasks: PickTask[];
}

/**
 * Scan-gate validator. `serial` = the QC / pre-box unit label (unit_uid, GS1
 * `(01)(21)`, Digital Link, `U-`/`/m/u/` handle), the package label (`KIT-…`)
 * the unit is boxed in, or the typed serial of THIS task's unit — the only
 * proof that pins the order's serial.
 */
export function matchScanToTask(
  rawScan: string,
  task: PickTask,
): 'serial' | 'bin' | 'sku' | 'platform' | null {
  const scan = rawScan.trim();
  if (!scan) return null;
  const lower = scan.toLowerCase();
  const key = pickScanKey(scan);
  if (key && scanNamesUnit(key, task)) return 'serial';
  if (task.bin && task.bin.trim().toLowerCase() === lower) return 'bin';
  if (task.sku && task.sku.trim().toLowerCase() === lower) return 'sku';
  for (const p of task.platforms) {
    if (p.platformSku && p.platformSku.trim().toLowerCase() === lower) return 'platform';
    if (p.platformItemId && p.platformItemId.trim().toLowerCase() === lower) return 'platform';
  }
  return null;
}
