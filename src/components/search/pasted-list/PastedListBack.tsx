'use client';

/** The Pasted list's way out: `?back=` (where it was opened from), else history. Esc and the title's Back share it. */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';

export const PASTED_LIST_BACK_PARAM = 'back';

export function usePastedListBack(): () => void {
  const router = useRouter();
  const back = useSearchParams()?.get(PASTED_LIST_BACK_PARAM) ?? null;
  return useCallback(() => {
    if (back?.startsWith('/') && !back.startsWith('//')) router.push(back, { scroll: false });
    else router.back();
  }, [back, router]);
}

/** Back, first on the page's title line (owner 2026-10-04). */
export function PastedListBack() {
  const goBack = usePastedListBack();
  return (
    <HoverTooltip label="Back" shortcut="Esc" asChild>
      <IconButton ariaLabel="Back" size="sm" onClick={goBack} data-pasted-list-back icon={<ArrowLeft aria-hidden className="size-4" />} />
    </HoverTooltip>
  );
}
