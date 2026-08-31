'use client';

/**
 * Unbox overview label preview — workspace label-type switcher (carton / unit /
 * As Listed / ticket) with editors matching Testing's hover overlays.
 *
 * Visibility is the Label band itself. There is no nested Show / Hide CTA —
 * opening the Label row shows the sticker, closing it hides it. Notes going
 * empty → non-empty, and Print · Receive "Edit label", ask the host to open
 * that row via {@link onReveal}.
 *
 * **No height tween** (AGENTS.md). The band unmounts this body instantly.
 */

import { useEffect, useRef, useState } from 'react';
import { WorkspaceLabelPreviewCard } from '@/components/labels/WorkspaceLabelPreviewCard';
import { AsListedEditPopover } from '@/components/labels/AsListedEditPopover';
import { LabelEditPopover } from './LabelEditPopover';
import { deriveColorFromTitle } from '@/lib/print/printProductLabel';
import type { WorkspaceLabelKind } from '@/lib/print/workspace-label-kinds';

/** Subset of useUnboxLineController fields needed by the label preview. */
export function UnboxLabelPreview({
  row,
  c,
  onReveal,
}: {
  row: {
    id?: number;
    sku?: string | null;
    item_name?: string | null;
    condition_grade?: string | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- controller return is a large bag
  c: any;
  /**
   * Open the Label band. Fired when notes first arrive or the dock asks to
   * edit the sticker — the band is the only disclose, so this is how those
   * signals reach it.
   */
  onReveal?: () => void;
}) {
  const [cartonEditorOpen, setCartonEditorOpen] = useState(false);
  const [asListedEditorOpen, setAsListedEditorOpen] = useState(false);
  const [unitEditorOpen, setUnitEditorOpen] = useState(false);
  const hadNotesRef = useRef(false);

  const options = c.labelSelectOptions ?? [];
  const notesLive = String(c.itemNote ?? '').trim();
  const hasNotes = notesLive.length > 0;

  // New carton / line → start with editors shut. The host closes the band.
  useEffect(() => {
    setCartonEditorOpen(false);
    setAsListedEditorOpen(false);
    setUnitEditorOpen(false);
    hadNotesRef.current = false;
  }, [row.id]);

  // Empty → non-empty notes: open the Label row. Manual close while notes
  // remain does not fight the operator on later keystrokes.
  useEffect(() => {
    if (hasNotes && !hadNotesRef.current) {
      onReveal?.();
    }
    hadNotesRef.current = hasNotes;
  }, [hasNotes, onReveal]);

  // Print · Receive dock "Edit label" — open the band and the editor.
  const labelEditorRequestId = c.labelEditorRequestId ?? 0;
  useEffect(() => {
    if (!labelEditorRequestId) return;
    onReveal?.();
    const kind = (c.activeLabelKind ?? 'carton') as WorkspaceLabelKind;
    setCartonEditorOpen(kind === 'carton');
    setAsListedEditorOpen(kind === 'as_listed');
    setUnitEditorOpen(kind === 'unit');
  }, [labelEditorRequestId, c.activeLabelKind, onReveal]);

  if (options.length === 0) return null;

  const active = (c.activeLabelKind ?? 'carton') as WorkspaceLabelKind;
  const showCarton = active === 'carton';
  const showAsListed = active === 'as_listed';
  const showUnit = active === 'unit';
  const sku = (row.sku || '').trim();
  const title = (row.item_name || '').trim();
  const unitMatrixValue =
    c.unitInput?.serialNumber?.trim() || c.unitInput?.sku?.trim() || sku || '—';

  const faceOverride = showUnit ? undefined : c.activeLabelFace;

  const onEdit =
    showCarton
      ? () => setCartonEditorOpen(true)
      : showAsListed
        ? () => setAsListedEditorOpen(true)
        : undefined;

  return (
    <div data-testid="unbox-label-preview">
      <div data-testid="unbox-label-open">
        <WorkspaceLabelPreviewCard
          chrome="procedure"
          showHoverChrome={false}
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
          editorOpen={showUnit ? unitEditorOpen : undefined}
          onEditorOpenChange={showUnit ? setUnitEditorOpen : undefined}
        />
        {c.labelPayload && typeof c.buildLabelPayload === 'function' ? (
          <LabelEditPopover
            open={showCarton && cartonEditorOpen}
            defaults={c.labelDraftDefaults}
            buildPayload={c.buildLabelPayload}
            onApplyAndPrint={c.applyAndPrintLabel}
            onClose={() => setCartonEditorOpen(false)}
          />
        ) : null}
        {/* Testing (and any station without As Listed) omits the builders —
            AsListedEditPopover always calls buildPayload in useMemo, so
            mounting without it throws "buildPayload is not a function". */}
        {typeof c.buildAsListedPayload === 'function' && c.asListedDraftDefaults ? (
          <AsListedEditPopover
            open={showAsListed && asListedEditorOpen}
            defaults={c.asListedDraftDefaults}
            buildPayload={c.buildAsListedPayload}
            onApplyAndPrint={c.applyAsListedAndPrint}
            onClose={() => setAsListedEditorOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
