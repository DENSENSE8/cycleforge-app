'use client';

/**
 * Bookmarkable 2×1 special-bin label print.
 *
 *   /inventory/locations/print/special-bin
 *   /inventory/locations/print/special-bin?barcode=RETURNS-TEST
 *   /inventory/locations/print/special-bin?barcode=TECH-PARTS
 *
 * Defaults to RETURNS-TEST (or Settings → receiving.returnsTestBin when set).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { LabelFacePreview } from '@/components/labels/LabelFacePreview';
import { useSetting } from '@/hooks/useSettings';
import { DEFAULT_RETURNS_TEST_BIN_BARCODE } from '@/lib/inventory/returns-test-bin-symbol';
import {
  printSpecialBinLabelFromRow,
  specialBinFaceForBarcode,
  specialBinPayloadToFace,
} from '@/lib/print/printSpecialBinLabel';

function SpecialBinPrintBody() {
  const searchParams = useSearchParams();
  const { value: returnsSetting } = useSetting<string>('receiving', 'receiving.returnsTestBin');
  const [printed, setPrinted] = useState(false);
  const autoPrinted = useRef(false);

  const barcode = useMemo(() => {
    const fromQuery = (searchParams.get('barcode') ?? '').trim();
    if (fromQuery) return fromQuery;
    const fromSettings = (returnsSetting ?? '').trim();
    if (fromSettings) return fromSettings;
    return DEFAULT_RETURNS_TEST_BIN_BARCODE;
  }, [searchParams, returnsSetting]);

  const face = useMemo(
    () =>
      specialBinPayloadToFace(
        specialBinFaceForBarcode(barcode, {
          returnsOverride: returnsSetting ?? null,
        }),
      ),
    [barcode, returnsSetting],
  );

  const print = useCallback(() => {
    const ok = printSpecialBinLabelFromRow(
      { barcode, name: face.center, room: face.bottomLeft },
      returnsSetting ?? null,
    );
    if (ok) setPrinted(true);
  }, [barcode, face.bottomLeft, face.center, returnsSetting]);

  useEffect(() => {
    if (autoPrinted.current) return;
    autoPrinted.current = true;
    const t = window.setTimeout(() => print(), 200);
    return () => window.clearTimeout(t);
  }, [print]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <div>
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Special bin label</p>
        <h1 className="mt-1 font-mono text-role-title font-semibold text-text-default">{barcode}</h1>
        <p className="mt-1 text-role-caption text-text-muted">
          2″ × 1″ stock — same face as Unbox → Returns bin. Print at 100% / actual size.
        </p>
      </div>

      <div className="rounded-2xl border border-border-soft bg-surface-card p-4">
        <LabelFacePreview model={face} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={print}>
          {printed ? 'Print again' : 'Print label'}
        </Button>
        <Link
          href="/inventory/locations?tab=bins"
          className="inline-flex h-8 items-center rounded-lg border border-border-soft bg-surface-card px-3 text-role-caption font-medium text-text-muted hover:bg-surface-sunken"
        >
          Back to bins
        </Link>
      </div>
    </div>
  );
}

export default function SpecialBinPrintPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-canvas">
      <Suspense
        fallback={
          <div className="p-6 text-role-caption text-text-muted">Loading label…</div>
        }
      >
        <SpecialBinPrintBody />
      </Suspense>
    </div>
  );
}
