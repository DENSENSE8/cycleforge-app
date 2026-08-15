'use client';

import {
  formatPreviewLine,
  formatPreviewSource,
  type StationScanPreviewClassification,
} from './preview-classify';

interface StationScanPreviewCardProps {
  result: StationScanPreviewClassification;
  onScanIt: () => void;
  onDismiss: () => void;
}

/**
 * Compact result strip under the scan band — preview stance only.
 * Not a modal. `aria-live=polite`.
 */
export function StationScanPreviewCard({
  result,
  onScanIt,
  onDismiss,
}: StationScanPreviewCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-station-scan-preview-card=""
      className="flex items-center gap-3 border-b border-border-hairline bg-surface-sunken/70 px-3 py-1.5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Preview
        </p>
        <p className="truncate text-role-caption font-semibold text-text-default">
          {formatPreviewLine(result)}
        </p>
        <p className="text-role-micro text-text-faint">
          {formatPreviewSource(result)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onScanIt}
          className="ds-raw-button rounded-md bg-surface-card px-2 py-1 text-role-caption font-semibold text-text-default ring-1 ring-border-soft hover:bg-surface-raised"
        >
          Scan it
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="ds-raw-button rounded-md px-2 py-1 text-role-caption font-semibold text-text-muted hover:bg-surface-card"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
