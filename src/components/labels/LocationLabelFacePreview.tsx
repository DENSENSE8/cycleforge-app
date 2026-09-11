'use client';

/**
 * Print-faithful 2×1 location sticker — same iframe as Unbox / special-bin.
 * Incomplete addresses show an empty paper slot instead of a second layout.
 */

import { Printer } from '@/components/Icons';
import { LabelFacePreview } from '@/components/labels/LabelFacePreview';
import { useAuth } from '@/contexts/AuthContext';
import { locationLabelToFace } from '@/lib/print/printLocationLabel';
import type { LocationSegments } from '@/lib/barcode-routing';

export function LocationLabelFacePreview({
  segments,
  roomName,
  gln,
  fit = 'host',
  maxScale,
}: {
  segments: LocationSegments | null;
  roomName?: string | null;
  gln: string;
  fit?: 'capped' | 'host';
  /** Passed to LabelFacePreview when fit is capped (dense print-run tiles). */
  maxScale?: number;
}) {
  const { user } = useAuth();
  const face = segments
    ? locationLabelToFace({
        segments,
        roomName,
        gln,
        orgSlug: user?.organizationSlug,
      })
    : null;

  if (!face) {
    return (
      <div className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1 bg-white py-3 text-center ring-1 ring-border-soft/60">
        {/* ds-allow-raw-neutral: empty sticker paper */}
        <Printer className="h-4 w-4 text-text-faint" />
        <p className="px-2 text-role-micro font-medium text-text-faint">
          Completes when aisle, bay, and level are picked
        </p>
      </div>
    );
  }

  return <LabelFacePreview model={face} embedded fit={fit} maxScale={maxScale} />;
}
