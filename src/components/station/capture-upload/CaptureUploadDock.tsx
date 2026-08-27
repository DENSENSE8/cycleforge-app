'use client';

import { useEffect } from 'react';
import { CaptureUploadStatus } from './CaptureUploadStatus';
import { useCaptureUploadStatus } from './useCaptureUploadStatus';

/**
 * The phone-side mount of {@link CaptureUploadStatus}: bottom-anchored, one per
 * mobile shell, fed by every capture queue.
 *
 * ### Why the shell, and not each capture surface
 *
 * The capture studios enqueue and then **navigate away** —
 * `MobileReceivingPhotoStudio.handleDone` fires an optimistic "Uploading N…"
 * toast and immediately calls `returnToCaller()`, so the camera unmounts while
 * the uploads are still in flight. Mounting status inside the studio would show
 * it for the few milliseconds nobody is looking. The operator's eyes are on the
 * surface they RETURN to, and every studio `returnHref` lands in `m/(shell)` —
 * `/m/pack`, the PO detail, the item detail. One shell-level mount therefore
 * covers every return path for all three domains, which is also why this is not
 * the per-station upload strip the program forbids.
 *
 * It lives in `(shell)` rather than `m/layout.tsx` deliberately: the immersive
 * group is the fullscreen camera, and a dock floating over a viewfinder would
 * cover the frame the operator is composing.
 *
 * ### Committed auto-settles; failed never does
 *
 * A confirmation that never leaves becomes furniture the operator stops
 * reading, so "N photos saved" clears itself after a short settle window. A
 * **failure has no timer** — an unseen failure is the entire defect this
 * program exists to close, so it stays until the operator retries it or
 * dismisses it by fixing it.
 */

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
