'use client';

/**
 * Shared scan-out JobFace — phone `/m/id/scan-out/[orderId]` and desk overlay
 * ops centre. Mapper is {@link identificationFromScanOut}; this file only paints.
 */

import { AlertTriangle, Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { IdentificationResult } from '@/lib/identification';
import type { ScanOutCartonJson } from '@/lib/identification/scan-out-face';

const STATE_TONE: Record<IdentificationResult['face']['state'], string> = {
  blocked: 'bg-surface-danger text-text-danger ring-1 ring-inset ring-border-danger',
  miss: 'bg-surface-danger text-text-danger ring-1 ring-inset ring-border-danger',
  error: 'bg-surface-danger text-text-danger ring-1 ring-inset ring-border-danger',
  ambiguous: 'bg-surface-canvas text-text-default ring-1 ring-inset ring-border-soft',
  ready: 'bg-surface-canvas text-text-default ring-1 ring-inset ring-border-soft',
  done: 'bg-surface-canvas text-text-default ring-1 ring-inset ring-border-soft',
};

export function IdentificationJobFace({
  result,
  carton,
  identity,
  onContinue,
  continueLabel,
}: {
  result: IdentificationResult;
  carton?: ScanOutCartonJson;
  identity?: { title?: string | null; tracking?: string | null };
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const { face } = result;
  const heading =
    identity?.title?.trim() ||
    carton?.productTitle?.trim() ||
    carton?.orderId?.trim() ||
    '';
  const tracking = identity?.tracking?.trim() || carton?.tracking?.trim();
  const isBlocked = face.state === 'blocked';
  const detail =
    face.message && face.message.trim() !== face.title ? face.message : null;
  const blockedLabel = result.job === 'scan_out' ? 'Scan-out blocked' : 'Blocked';

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-3 p-4 text-left',
        cornerClass('surface'),
        STATE_TONE[face.state],
      )}
      data-testid="identification-job-face"
      data-face-state={face.state}
      data-identification-job={result.job}
    >
      <div className="flex items-start gap-2">
        {face.state === 'done' ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-role-micro font-semibold uppercase tracking-widest">{face.title}</p>
          {heading && heading !== face.title ? (
            <p className="mt-1 text-role-body font-semibold">{heading}</p>
          ) : null}
          {tracking ? (
            <p className="mt-1 font-mono text-role-caption">{tracking}</p>
          ) : null}
          {detail ? (
            <p className="mt-2 text-role-caption">{detail}</p>
          ) : isBlocked && result.job === 'scan_out' ? (
            <p className="mt-2 text-role-caption">Pull this package. Do not ship.</p>
          ) : null}
        </div>
      </div>
      {face.mutate == null && isBlocked ? (
        <Button variant="dangerSoft" size="sm" disabled className="self-start">
          {blockedLabel}
        </Button>
      ) : null}
      {face.mutate != null && face.state === 'ready' && onContinue ? (
        <Button variant="primary" size="sm" onClick={onContinue} className="self-start">
          {continueLabel ?? 'Continue'}
        </Button>
      ) : null}
    </div>
  );
}
