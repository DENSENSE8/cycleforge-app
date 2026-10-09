'use client';

/**
 * Inventory › Locations › Labels on the desk. With no `?kind=` it is a
 * two-column grid of equal tiles — Location codes left, Totes right — each
 * showing the print-faithful face and, top right, how many have printed. A
 * tile opens that sticker's printer in place; Back, Escape or the sidebar's
 * Labels row returns to the grid.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { HandlingUnitLabelFacePreview } from '@/components/labels/HandlingUnitLabelFacePreview';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { TotePlateWorkspace } from '@/components/warehouse/TotePlateWorkspace';
import { MobileFirstFrame } from '@/design-system/components/MobileFirstFrame';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { qk } from '@/queries/keys';
import { cn } from '@/utils/_cn';
import {
  LABEL_CATALOG,
  LABEL_CATALOG_KINDS,
  labelCatalogHref,
  parseLabelCatalogKind,
  type LabelCatalogKind,
} from './label-catalog';
import { LocationLabelBuilder } from './LocationLabelBuilder';

/** A specimen address for the tile face — the operator picks the real one inside. */
const SPECIMEN = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 1 } as const;

/** `GET /api/label-print-jobs` — distinct location codes and totes printed so far. */
const PrintedCountsResponse = z.object({
  counts: z.object({ location: z.number(), tote: z.number() }),
});

export function LabelCatalogDesk() {
  const kind = parseLabelCatalogKind(useSearchParams().get('kind'));
  return kind ? <LabelCatalogDetail kind={kind} /> : <LabelCatalogGrid />;
}

function LabelCatalogGrid() {
  const { identity } = useOrgGs1();
  const { data: printed } = useQuery({
    queryKey: qk.printedWarehouseLabels,
    queryFn: async () => {
      const res = await fetch('/api/label-print-jobs', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return null;
      return PrintedCountsResponse.parse(await res.json()).counts;
    },
    // Coming back from a print run must show the new total.
    refetchOnMount: 'always',
  });
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-6 pt-4 sm:px-6" data-testid="label-catalog-grid">
      <div className="grid auto-rows-fr grid-cols-2 gap-4">
        {LABEL_CATALOG_KINDS.map((kind) => (
          <Link
            key={kind}
            href={labelCatalogHref(kind)}
            className={cn(
              'group flex min-w-0 flex-col gap-3 border border-border-soft bg-surface-card p-4 transition-colors hover:border-border-info hover:bg-surface-info',
              cornerClass('surface'),
              focusRing('control'),
            )}
            data-testid={`label-catalog-tile-${kind}`}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-role-title font-semibold text-text-default group-hover:text-text-info">{LABEL_CATALOG[kind].title}</p>
                <p className="mt-1 text-role-caption text-text-muted">{LABEL_CATALOG[kind].summary}</p>
              </div>
              {printed ? (
                <p className="shrink-0 text-role-caption font-semibold tabular-nums text-text-muted group-hover:text-text-info" data-testid={`label-catalog-printed-${kind}`}>
                  {printed[kind].toLocaleString()} printed
                </p>
              ) : null}
            </div>
            {/* The iframe face would swallow the click: the whole tile is the link. */}
            <div className="pointer-events-none mt-auto" aria-hidden>
              {kind === 'tote' ? (
                <HandlingUnitLabelFacePreview fit="host" />
              ) : (
                <LocationLabelFacePreview segments={SPECIMEN} gln={identity.gln} fit="host" />
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LabelCatalogDetail({ kind }: { kind: LabelCatalogKind }) {
  const router = useRouter();
  // Escape is Back — unless a field, menu or sheet is using it first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A DOM event target is an Element; narrow before asking what it sits in.
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      // An open sheet or menu owns Escape (it closes itself).
      if (document.querySelector('[aria-modal="true"], [role="menu"], [role="listbox"]')) return;
      router.push(labelCatalogHref(null));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={`label-catalog-detail-${kind}`}>
      <div className="flex items-baseline gap-4 px-4 pb-4 pt-4 sm:px-6">
        <Link
          href={labelCatalogHref(null)}
          className={cn('text-role-body font-medium text-text-muted hover:text-text-default', focusRing('control'))}
          aria-keyshortcuts="Escape"
          data-testid="label-catalog-back"
        >
          ‹ Back
        </Link>
        <h1 className="text-role-heading font-semibold text-text-default">{LABEL_CATALOG[kind].title}</h1>
      </div>
      {kind === 'tote' ? (
        <TotePlateWorkspace />
      ) : (
        <MobileFirstFrame testId="location-labels-frame" width="workspace">
          <LocationLabelBuilder dock="float" />
        </MobileFirstFrame>
      )}
    </div>
  );
}
