'use client';

/**
 * Unbox Displays → Units topic — Units · Prebox on one carton.
 *
 * Armed-row verbs + URL drills (Photos twin):
 * `?display=units` → Actions list · `?unitsAction=units|prebox` → bodies.
 *
 * Units = active-line explosion (serials · photos · siblings).
 * Prebox = create prebox label checklist (flush, not a floating overlay).
 */

import { useEffect, useMemo, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Barcode, Package } from '@/components/Icons';
import { useDisplaysLeafChrome } from '@/components/station/displays/displays-leaf-chrome';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import { cn } from '@/utils/_cn';
import { PreboxWizard, type PreboxWizardSerial } from '@/components/receiving/PreboxWizard';
import { UnitsExplosionDisplay } from '../UnitsExplosionDisplay';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxUnitsAction } from './unbox-side-tabs';
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

function usePreboxSerials(receivingId: number | null) {
  const enabled = typeof receivingId === 'number' && receivingId > 0;
  const { data, isPending } = useQuery<{
    success: boolean;
    receiving_lines: ReceivingLineRow[];
  }>({
    queryKey: receivingSiblingsQueryKey(receivingId ?? 0),
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
      );
      if (!res.ok) throw new Error('Failed to fetch carton siblings');
      return res.json();
    },
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const lines = data?.receiving_lines ?? [];
  const serials: PreboxWizardSerial[] = useMemo(
    () =>
      lines.flatMap((l) =>
        (l.serials ?? []).map((s) => ({
          id: s.id,
          serial_number: s.serial_number,
          unit_uid: s.unit_uid ?? null,
          sku: l.sku ?? null,
        })),
      ),
    [lines],
  );
  const skuSet = new Set(lines.map((l) => (l.sku || '').trim()).filter(Boolean));
  const kitSku = skuSet.size === 1 ? Array.from(skuSet)[0] : null;
  return { enabled, isPending, serials, kitSku, hasPrebox: serials.length > 0 };
}

function PreboxDisplayBody({ receivingId }: { receivingId: number | null }) {
  const { enabled, isPending, serials, kitSku, hasPrebox } = usePreboxSerials(receivingId);

  if (!enabled) {
    return (
      <p className="px-1 py-6 text-center text-role-caption text-text-soft">
        Open a carton to create a prebox label.
      </p>
    );
  }
  if (isPending && serials.length === 0) {
    return <p className="text-role-caption text-text-soft">Loading units…</p>;
  }
  if (!hasPrebox) {
    return (
      <p className="border-y border-dashed border-border-hairline px-3 py-5 text-center text-role-caption text-text-soft">
        Scan serials on this carton before creating a prebox label.
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PreboxWizard serials={serials} sku={kitSku} embedded />
    </div>
  );
}

const UNITS_DRILL_LABEL: Record<'units' | 'prebox', string> = {
  units: 'Units',
  prebox: 'Prebox',
};

function isUnitsDrill(action: UnboxUnitsAction): action is 'units' | 'prebox' {
  return action === 'units' || action === 'prebox';
}

export function UnitsDisplayHost({
  receivingId,
  activeLineId,
  staffId,
  c,
  action,
  onActionChange,
  hasPrebox,
}: {
  receivingId: number | null;
  activeLineId: number | null;
  staffId: string;
  c: UnitsDisplayController;
  action: UnboxUnitsAction;
  onActionChange: (action: UnboxUnitsAction) => void;
  /** When false, Prebox verb is hidden (no serials yet). */
  hasPrebox: boolean;
}) {
  const { setTrail, setOnNestedPop, setOnNestedRestore } = useDisplaysLeafChrome();

  const verbs = useMemo<StationArmedVerb[]>(() => {
    const rows: StationArmedVerb[] = [
      {
        id: 'units',
        label: 'Units',
        preferredKey: 'u',
        icon: (p) => <Barcode className={p.className} />,
      },
    ];
    if (hasPrebox) {
      rows.push({
        id: 'prebox',
        label: 'Prebox',
        preferredKey: 'b',
        icon: (p) => <Package className={p.className} />,
      });
    }
    return rows;
  }, [hasPrebox]);

  const verb: UnboxUnitsAction = isUnitsDrill(action)
    ? action === 'prebox' && !hasPrebox
      ? 'actions'
      : action
    : 'actions';

  useEffect(() => {
    if (verb === 'actions') {
      setTrail([{ id: 'units', label: 'Units' }]);
    } else {
      setTrail([
        { id: 'units', label: 'Units' },
        { id: verb, label: UNITS_DRILL_LABEL[verb] },
      ]);
    }
  }, [verb, setTrail]);

  useEffect(() => {
    setOnNestedPop(() => onActionChange('actions'));
    return () => setOnNestedPop(null);
  }, [setOnNestedPop, onActionChange]);

  useEffect(() => {
    setOnNestedRestore((segmentId) => {
      if (isUnitsDrill(segmentId as UnboxUnitsAction)) {
        onActionChange(segmentId as UnboxUnitsAction);
      }
    });
    return () => setOnNestedRestore(null);
  }, [setOnNestedRestore, onActionChange]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-0" data-testid="unbox-units-display">
      {verb === 'actions' ? (
        <StationArmedVerbList
          verbs={verbs}
          listLabel="Units actions"
          testId="unbox-units-actions"
          onCommit={(id) => onActionChange(id as UnboxUnitsAction)}
        />
      ) : null}
      {verb === 'prebox' ? (
        <div className={cn('min-h-0 flex-1 px-0')}>
          <PreboxDisplayBody receivingId={receivingId} />
        </div>
      ) : null}
      {verb === 'units' ? (
        <div className={cn('min-h-0 flex-1 px-0')}>
          <UnitsExplosionDisplay
            receivingId={receivingId}
            activeLineId={activeLineId}
            staffId={staffId}
            c={c}
          />
        </div>
      ) : null}
    </div>
  );
}
