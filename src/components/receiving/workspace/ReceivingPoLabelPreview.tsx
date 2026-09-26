'use client';

import { LabelFacePreview } from '@/components/labels/LabelFacePreview';
import { receivingPayloadToFace, type ReceivingLabelPayload } from '@/lib/print/printReceivingLabel';

/** On-screen render of the printed PO / carton label. */
export function ReceivingPoLabelPreview({
  embedded,
  ...payload
}: ReceivingLabelPayload & { embedded?: boolean }) {
  const face = receivingPayloadToFace(payload);
  if (!face.matrix.value) return null;

  if (embedded) {
    return <LabelFacePreview model={face} embedded />;
  }
  return (
    <div className="border-t border-border-soft bg-surface-canvas">
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <span className="text-role-eyebrow tabular-nums text-text-soft tracking-widest">03</span>
        <span className="text-role-eyebrow uppercase tracking-[0.18em] text-text-muted">
          Review &amp; print
        </span>
      </div>
      <div className="px-3 pb-3">
        <LabelFacePreview model={face} />
      </div>
    </div>
  );
}
