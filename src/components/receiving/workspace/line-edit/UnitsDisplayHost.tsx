'use client';

/**
 * Unbox Displays → Units leaf (Assets group).
 *
 * Active-line explosion (serials · photos · siblings). Prebox is a peer Assets
 * leaf ({@link PreboxDisplayHost}) — never nested under Units.
 */

import type { RefObject } from 'react';
import { UnitsExplosionDisplay } from '../UnitsExplosionDisplay';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  useSerialLookup,
  type SerialMatchedOrder,
} from '../SerialMatchResult';
import type { ActiveRowSerial } from '../PoLinesAccordion';

/** Narrow controller surface shared with {@link UnitsExplosionDisplay}. */
interface UnitsDisplayController {
  cond: string;
  setCond: (next: string) => void;
  patch: (patch: Partial<ReceivingLineRow>) => void | Promise<void>;
  serialSubmitting: boolean;
  headerSerialEdit: ActiveRowSerial | null;
  setHeaderSerialEdit: (next: ActiveRowSerial | null) => void;
  enqueueSerial: (raw?: string, conditionGrade?: string | null) => void | Promise<void>;
  deleteSerialUnit: (serialUnitId: number, lineId?: number) => void | Promise<void>;
  replaceSerialUnit: (
    original: { id: number; serial_number: string; condition_grade?: string | null },
    nextSerial: string,
  ) => void | Promise<void>;
  setUnitGrade: (serialUnitId: number, grade: string) => void | Promise<void>;
  setUnitLabelCondition: (next: string | null) => void;
  serialAbsent: boolean;
  serialAbsentReason: string | null;
  requireSerialConfirmation: boolean;
  commitSerialAbsent: (next: { absent: boolean; reason: string | null }) => void;
  serialRef?: RefObject<HTMLInputElement | null>;
  handleFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null) => void;
  /** RETURN match → Displays Timeline. */
  handleOpenReturnHistory?: () => void;
  serialLookup?: ReturnType<typeof useSerialLookup>;
}

export function UnitsDisplayHost({
  receivingId,
  activeLineId,
  staffId,
  c,
}: {
  receivingId: number | null;
  activeLineId: number | null;
  staffId: string;
  c: UnitsDisplayController;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-0" data-testid="unbox-units-display">
      <div className="min-h-0 flex-1 px-0">
        <UnitsExplosionDisplay
          receivingId={receivingId}
          activeLineId={activeLineId}
          staffId={staffId}
          c={c}
        />
      </div>
    </div>
  );
}
