'use client';

/** Bookmarkable 2×1 special-bin label print. */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Panel, Button, IconButton, DeferredQtyInput } from '@/design-system/primitives';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { Minus, Plus } from '@/components/Icons';
import { useSetting } from '@/hooks/useSettings';
import { DEFAULT_RETURNS_TEST_BIN_BARCODE } from '@/lib/inventory/returns-test-bin-symbol';
import { clampLabelCopies, MAX_LABEL_COPIES, parseLabelCopies } from '@/lib/print/labelCopies';
import {
  printSpecialBinLabelJob,
  specialBinFaceForBarcode,
  specialBinPayloadToFace,
} from '@/lib/print/printSpecialBinLabel';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

function SpecialBinPrintBody() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { value: returnsSetting } = useSetting<string>('receiving', 'receiving.returnsTestBin');
  const [printed, setPrinted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const autoPrinted = useRef(false);

  const barcode = useMemo(() => {
    const fromQuery = (searchParams.get('barcode') ?? '').trim();
    if (fromQuery) return fromQuery;
    const fromSettings = (returnsSetting ?? '').trim();
    if (fromSettings) return fromSettings;
    return DEFAULT_RETURNS_TEST_BIN_BARCODE;
  }, [searchParams, returnsSetting]);

  const count = parseLabelCopies(searchParams.get('count'));

  const face = useMemo(
    () =>
      specialBinPayloadToFace(
        specialBinFaceForBarcode(barcode, {
          returnsOverride: returnsSetting ?? null,
        }),
      ),
    [barcode, returnsSetting],
  );

  const setCount = useCallback(
    (next: number) => {
      const copies = clampLabelCopies(next);
      const params = new URLSearchParams(searchParams.toString());
      if (copies === 1) params.delete('count');
      else params.set('count', String(copies));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const print = useCallback(async () => {
    setPrinting(true);
    try {
      const result = await printSpecialBinLabelJob(
        { barcode, name: face.center, room: face.bottomLeft },
        returnsSetting ?? null,
        count,
      );
      if (result !== 'skipped') setPrinted(true);
    } finally {
      setPrinting(false);
    }
  }, [barcode, count, face.bottomLeft, face.center, returnsSetting]);

  useEffect(() => {
    if (autoPrinted.current) return;
    const t = window.setTimeout(() => {
      if (autoPrinted.current) return;
      autoPrinted.current = true;
      void print();
    }, 200);
    return () => window.clearTimeout(t);
  }, [print]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
      <div>
        <p className="text-role-eyebrow text-text-soft">Special bin label</p>
        <h1 className="mt-1 font-mono text-role-title font-semibold text-text-default">{barcode}</h1>
        <p className="mt-1 text-role-caption text-text-muted">
          2″ × 1″ stock — silent print sends the count below as one job. Print at 100% / actual size.
        </p>
      </div>

      <Panel radius="2xl" padding="sm">
        <LabelFacePreview model={face} />
      </Panel>

      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-role-caption font-semibold text-text-default">Label count</p>
          <p className="mt-1 text-role-micro text-text-soft">
            Increment, then print. Bulk copies go out silently when a label printer is paired.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            type="button"
            size="md"
            radius="surface"
            ariaLabel="Decrease label count"
            disabled={count <= 1 || printing}
            onClick={() => setCount(count - 1)}
            icon={<Minus className="h-4 w-4" />}
          />
          <DeferredQtyInput
            min={1}
            max={MAX_LABEL_COPIES}
            aria-label="Number of bin labels"
            value={count}
            onChange={setCount}
            disabled={printing}
            className={cn(
              'h-8 w-16 border border-border-soft bg-surface-card text-center font-mono text-role-caption font-semibold tabular-nums text-text-default',
              cornerClass('control'),
              focusRing('field'),
            )}
          />
          <IconButton
            type="button"
            size="md"
            radius="surface"
            ariaLabel="Increase label count"
            disabled={count >= MAX_LABEL_COPIES || printing}
            onClick={() => setCount(count + 1)}
            icon={<Plus className="h-4 w-4" />}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={() => void print()} loading={printing}>
          {printed
            ? `Print ${count} again`
            : count === 1
              ? 'Print label'
              : `Print ${count} labels`}
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
