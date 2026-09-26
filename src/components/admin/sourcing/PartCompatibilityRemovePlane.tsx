'use client';

/** Remove confirm plane for /sourcing?mode=compatibility — stage-overlay over the table (recordPlane: */

import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import {
  partFitLabel,
  partOemLabel,
  type PartCompatibilityEdgeRow,
} from '@/lib/sourcing/part-compatibility-row';

export interface PartCompatibilityRemovePlaneProps {
  row: PartCompatibilityEdgeRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (row: PartCompatibilityEdgeRow) => void;
}

export function PartCompatibilityRemovePlane({
  row,
  busy = false,
  onClose,
  onConfirm,
}: PartCompatibilityRemovePlaneProps) {
  const part = row ? (row.product_title?.trim() || row.sku) : null;
  const model = row ? (row.model_name?.trim() || row.model_number) : null;
  const provenance = row
    ? [row.part_role, partOemLabel(row.is_oem), partFitLabel(row.fit)]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <DeskStageOverlay
      open={row != null}
      onClose={onClose}
      title={part ? `Unlink · ${part}` : 'Unlink part'}
      subtitle={model ? `${model}${provenance ? ` · ${provenance}` : ''}` : undefined}
      testId="part-compatibility-remove-plane"
      fill="inset"
      footer={
        row ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => onConfirm(row)}
            >
              {busy ? 'Unlinking…' : 'Confirm unlink'}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-3 px-4 py-4 text-sm text-text-default">
        <p>
          This part stops being listed as compatible with that model. Nothing about the part or the
          model itself changes — only the link between them.
        </p>
        <p className="text-text-soft">
          Re-link it from the Bose Models section; the edge is keyed by model, part and role, so
          re-adding it restores the same row.
        </p>
      </div>
    </DeskStageOverlay>
  );
}
