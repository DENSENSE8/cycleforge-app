'use client';

import { MapPin, Pencil, Barcode } from '@/components/Icons';
import { getLast8 } from '@/components/ui/CopyChip';
import { SerialPreviewStrip } from '@/components/receiving/SerialPreviewStrip';
import type { TestingScanSession } from '@/lib/testing/testing-scan-session';
import { sessionSerials } from '@/lib/testing/testing-scan-session';

/**
 * Composite feedback after STN → unit-label scans in Testing mode.
 * Shows tracking ↔ SKU pairing plus all serials linked to the unit/line
 * during testing (prepack handoff picture for the packer).
 */
export function TestingScanSessionFeedback({
  session,
}: {
  session: TestingScanSession;
}) {
  if (session.phase === 'idle' || !session.line) return null;

  const tracking =
    session.trackingRef?.trim() ||
    String(session.line.tracking_number || '').trim();
  const sku = String(session.line.sku || '').trim();
  const title = session.line.item_name || sku || `Line #${session.line.id}`;
  const serials = sessionSerials(session);
  const confirmed = session.phase === 'confirmed';

  return (
    <div
      data-testing-scan-session
      className={`mt-2 rounded-xl border px-2.5 py-2 ${
        confirmed
          ? 'border-emerald-200 bg-emerald-50/80'
          : 'border-blue-200 bg-blue-50/70'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {tracking ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-role-eyebrow uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
            <MapPin className="h-3 w-3 shrink-0" />
            TRK …{getLast8(tracking)}
          </span>
        ) : null}
        {sku ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 px-2 py-1 text-role-eyebrow uppercase tracking-widest text-yellow-800 ring-1 ring-inset ring-yellow-200">
            <Pencil className="h-3 w-3 shrink-0" />
            {sku}
          </span>
        ) : null}
        {session.unitKey ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-role-eyebrow uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Barcode className="h-3 w-3 shrink-0" />
            Unit …{getLast8(session.unitKey)}
          </span>
        ) : (
          <span className="text-role-eyebrow uppercase tracking-widest text-blue-600">
            Scan unit label to confirm
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-role-micro font-semibold text-text-muted" title={title}>
        {title}
        {confirmed ? ' · Ready for packer' : ''}
      </p>
      {serials.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">
            Serials
          </span>
          <SerialPreviewStrip serials={serials} max={8} />
        </div>
      ) : null}
    </div>
  );
}
