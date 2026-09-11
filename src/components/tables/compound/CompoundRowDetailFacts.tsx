'use client';

/**
 * Shared leaf-detail facts — serial / location / sku / View unit.
 *
 * Callers: CompoundRowDetailBand (desktop item cell), CompoundRowDetailSheet
 * (mobile BottomSheet). Affected API: CompoundRowDetailFacts. Schema:
 * CompoundRowDetail { serials, location, unitRef, sku }. User verbatim:
 * "Rendered fewer hooks than expected… Still getting this on the two ship page.
 * What exactly is the problem?" — Sheet imported Facts from Band; Turbopack
 * reported export missing → UnshippedTable crash (hooks message is the symptom).
 */

import Link from 'next/link';
import { Button } from '@/design-system/primitives';
import { GridCellDash } from '@/components/ui/grid-cells';
import type { CompoundRowDetail } from '@/components/tables/compound/compound-row-model';

export function CompoundRowDetailFacts({
  detail,
}: {
  detail: CompoundRowDetail;
  title?: string;
}) {
  const serials = detail.serials.filter((s) => s.trim());
  const serialFace = serials.length > 0 ? serials.join(' · ') : null;
  const location = detail.location?.trim() || null;
  const unitHref = detail.unitRef?.trim()
    ? `/search?sel=unit:${encodeURIComponent(detail.unitRef.trim())}`
    : null;
  const sku = detail.sku?.trim() || null;

  return (
    <>
      <span className="min-w-0 truncate font-mono text-text-default">
        {serialFace ?? <GridCellDash />}
      </span>
      <span className="min-w-0 truncate">{location ?? <GridCellDash />}</span>
      {sku ? <span className="min-w-0 truncate text-text-faint">{sku}</span> : null}
      {unitHref ? (
        <Link href={unitHref} className="shrink-0" onClick={(event) => event.stopPropagation()}>
          <Button type="button" size="sm" variant="secondary" tabIndex={-1}>
            View unit
          </Button>
        </Link>
      ) : null}
    </>
  );
}
