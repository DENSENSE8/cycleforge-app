'use client';

/**
 * Locations desk primary CTA — mint an empty tote (handling unit / LPN) and
 * print its 2×1 sticker. Header create verb, not a table-toolbar print.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import {
  GLOBAL_ADD_INTENT_EVENT,
  consumeGlobalAddIntent,
  peekGlobalAddIntent,
  type GlobalAddIntent,
} from '@/lib/global-add/catalog';
import { useStationLabelPrint } from '@/hooks/useStationLabelPrint';
import { toast } from '@/lib/toast';

function isToteLabelIntent(intent: GlobalAddIntent | null): boolean {
  return intent?.kind === 'locations-new';
}

export function LocationsNewToteLabelAction() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const { print: printStationLabel } = useStationLabelPrint();

  const mintAndPrint = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/handling-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        handling_unit?: {
          id: number;
          code?: string | null;
          location_name?: string | null;
          rollup?: { total?: number };
        };
      };
      if (!res.ok || !json.success || !json.handling_unit) {
        throw new Error(json.message || json.error || `Could not mint tote (${res.status})`);
      }
      const hu = json.handling_unit;
      const via = await printStationLabel({
        kind: 'handling_unit',
        payload: {
          handlingUnitId: hu.id,
          code: hu.code,
          unitCount: hu.rollup?.total ?? 0,
          locationName: hu.location_name ?? null,
          date: new Date().toLocaleDateString(),
        },
      });
      if (via === 'skipped') {
        throw new Error('Could not print tote label');
      }
      toast.success(`Printed ${hu.code || `H-${hu.id}`}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not print tote label');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [printStationLabel]);

  useEffect(() => {
    const parked = peekGlobalAddIntent();
    if (!isToteLabelIntent(parked)) return;
    consumeGlobalAddIntent();
    void mintAndPrint();
  }, [mintAndPrint]);

  useEffect(() => {
    const onGlobalAdd = (event: Event) => {
      const intent = (event as CustomEvent<GlobalAddIntent>).detail;
      if (!isToteLabelIntent(intent)) return;
      void mintAndPrint();
    };
    window.addEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
    return () => window.removeEventListener(GLOBAL_ADD_INTENT_EVENT, onGlobalAdd);
  }, [mintAndPrint]);

  const control = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="primary"
        size="sm"
        icon={<Plus aria-hidden />}
        loading={busy}
        disabled={busy}
        onClick={() => void mintAndPrint()}
        data-testid="locations-new-tote-label"
        ariaLabel="New tote label"
      >
        New tote label
      </DeskHeaderAction>
    ),
    [busy, mintAndPrint],
  );

  return <DeskActionSlotRegistrar role="primary">{control}</DeskActionSlotRegistrar>;
}
