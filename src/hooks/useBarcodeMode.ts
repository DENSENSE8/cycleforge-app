'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { BarcodeMode } from '@/components/barcode/ModeSelector';

const MODES: readonly BarcodeMode[] = ['print', 'auto-unit', 'sn-to-sku', 'reprint'];

function parseMode(raw: string | null): BarcodeMode {
  if (raw && (MODES as readonly string[]).includes(raw)) return raw as BarcodeMode;
  return 'print';
}

/** URL-backed barcode mode (`?mode=`). */
export function useBarcodeMode(): {
  mode: BarcodeMode;
  setMode: (next: BarcodeMode) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get('mode'));

  const setMode = useCallback(
    (next: BarcodeMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'print') params.delete('mode');
      else params.set('mode', next);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  return { mode, setMode };
}
