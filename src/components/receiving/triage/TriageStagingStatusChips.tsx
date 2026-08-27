'use client';

/**
 * Shared Staged / shelf / lane chip row — used by rail popovers
 * ({@link TriageStagingChips}) and the Staging tab body.
 */

import { Check, MapPin } from '@/components/Icons';
import { triageLaneLabel } from '@/lib/receiving/triage-lane-policy';

export function TriageStagingStatusChips({
  complete,
  locationLabel,
  lane,
}: {
  complete?: boolean;
  locationLabel?: string | null;
  lane?: string | null;
}) {
  if (!complete && !locationLabel && !lane) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {complete ? (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 inset-chip text-role-eyebrow uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Check className="h-2.5 w-2.5" />
          Staged
        </span>
      ) : null}
      {locationLabel ? (
        <span className="inline-flex items-center gap-1 rounded bg-blue-50 inset-chip text-role-eyebrow uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
          <MapPin className="h-2.5 w-2.5" />
          {locationLabel}
        </span>
      ) : null}
      {lane ? (
        <span className="inline-flex items-center gap-1 rounded bg-surface-sunken inset-chip text-role-eyebrow uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
          {triageLaneLabel(lane)}
        </span>
      ) : null}
    </div>
  );
}
