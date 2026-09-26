'use client';

import { useEffect } from 'react';
import { CaptureUploadStatus } from './CaptureUploadStatus';
import { useCaptureUploadStatus } from './useCaptureUploadStatus';

/** The phone-side mount of {@link CaptureUploadStatus}: */

/** How long the resting "saved" confirmation holds before clearing itself. */
const COMMITTED_SETTLE_MS = 6_000;

export function CaptureUploadDock() {
  const { entries, summary, retryAllFailed, dismissCommitted } = useCaptureUploadStatus();

  const settled = summary.tone === 'committed';

  useEffect(() => {
    // Only the pure-committed resting state auto-clears. `tone` is already the
    // precedence winner (failed > active > committed), so this cannot fire
    // while anything is in flight or failed.
    if (!settled) return;
    const t = setTimeout(dismissCommitted, COMMITTED_SETTLE_MS);
    return () => clearTimeout(t);
  }, [settled, dismissCommitted]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-fab flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" // ds-allow-spacing: fixed-overlay safe-area geometry
    >
      <div className="w-full max-w-md">
        <CaptureUploadStatus
          entries={entries}
          summary={summary}
          onRetryAll={retryAllFailed}
          onDismissCommitted={dismissCommitted}
        />
      </div>
    </div>
  );
}
