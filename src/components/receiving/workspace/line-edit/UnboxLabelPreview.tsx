'use client';

/**
 * Unbox overview label preview — workspace label-type switcher (carton / unit /
 * As Listed / ticket) with editors matching Testing's hover overlays.
 */

import { useState } from 'react';
import { WorkspaceLabelPreviewCard } from '@/components/labels/WorkspaceLabelPreviewCard';
import { AsListedEditPopover } from '@/components/labels/AsListedEditPopover';
import { LabelEditPopover } from './LabelEditPopover';
import { deriveColorFromTitle } from '@/lib/print/printProductLabel';
import type { WorkspaceLabelKind } from '@/lib/print/workspace-label-kinds';

/** Subset of useUnboxLineController fields needed by the label preview. */
export function UnboxLabelPreview({
  row,
  c,
}: {
  row: { sku?: string | null; item_name?: string | null; condition_grade?: string | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- controller return is a large bag
  c: any;
}) {
  const [cartonEditorOpen, setCartonEditorOpen] = useState(false);
  const [asListedEditorOpen, setAsListedEditorOpen] = useState(false);

  const options = c.labelSelectOptions ?? [];
  if (options.length === 0) return null;

  const active = (c.activeLabelKind ?? 'carton') as WorkspaceLabelKind;
  const showCarton = active === 'carton';
  const showAsListed = active === 'as_listed';
  const showUnit = active === 'unit';
  const sku = (row.sku || '').trim();
  const title = (row.item_name || '').trim();
  const unitMatrixValue =
    c.unitInput?.serialNumber?.trim() || c.unitInput?.sku?.trim() || sku || '—';

  // Unit face is built inside WorkspaceLabelPreviewCard; other kinds use faceOverride.
  const faceOverride = showUnit ? undefined : c.activeLabelFace;

  const onEdit =
    showCarton
      ? () => setCartonEditorOpen(true)
      : showAsListed
        ? () => setAsListedEditorOpen(true)
        : undefined;

  return (
    <>
      <WorkspaceLabelPreviewCard
        sku={sku || unitMatrixValue}
        title={title || sku}
        condition={c.unitInput?.condition ?? row.condition_grade}
        color={deriveColorFromTitle(title)}
        dataMatrixValue={unitMatrixValue}
        dataMatrixSymbology="datamatrix"
        labelOptions={options}
        activeLabel={active}
        onLabelChange={(key) => {
          c.setSelectedLabelKind(key);
          setCartonEditorOpen(false);
          setAsListedEditorOpen(false);
        }}
        faceOverride={faceOverride}
        onEdit={onEdit}
        onApplyAndPrint={showUnit ? c.applyUnitAndPrint : undefined}
      />
      {c.labelPayload ? (
        <LabelEditPopover
          open={showCarton && cartonEditorOpen}
          defaults={c.labelDraftDefaults}
          buildPayload={c.buildLabelPayload}
          onApplyAndPrint={c.applyAndPrintLabel}
          onClose={() => setCartonEditorOpen(false)}
        />
      ) : null}
      <AsListedEditPopover
        open={showAsListed && asListedEditorOpen}
        defaults={c.asListedDraftDefaults}
        buildPayload={c.buildAsListedPayload}
        onApplyAndPrint={c.applyAsListedAndPrint}
        onClose={() => setAsListedEditorOpen(false)}
      />
    </>
  );
}
