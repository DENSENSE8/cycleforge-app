'use client';

/** Unbox overview label preview — workspace label-type switcher (carton / unit / As Listed / ticket) with editors matching Testing's hover… */

import { useEffect, useRef, useState } from 'react';
import { WorkspaceLabelPreviewCard } from '@/components/labels/WorkspaceLabelPreviewCard';
import { AsListedEditPopover } from '@/components/labels/AsListedEditPopover';
import { useLabelFaceReceivingSlots } from '@/components/labels/LabelFaceReceivingSlots';
import { useStationComposerMode } from '@/components/composer/useStationComposerMode';
import { LabelEditPopover, type LabelCornerMode } from './LabelEditPopover';
import { scheduleFocusUnboxComposer } from './focus-unbox-composer';
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
  const { setMode: setComposerMode } = useStationComposerMode();

  const options = c.labelSelectOptions ?? [];
  const notesLive = String(c.itemNote ?? '').trim();
  const hasNotes = notesLive.length > 0;

  const patchOverride =
    typeof c.patchLabelOverride === 'function' ? c.patchLabelOverride : undefined;
  const setCornerMode =
    typeof c.setLabelCornerMode === 'function'
      ? (next: LabelCornerMode) => c.setLabelCornerMode(next)
      : undefined;

  const receivingSlots = useLabelFaceReceivingSlots(
    {
      platform: String(c.labelDraftDefaults?.platform ?? ''),
      receivingType: String(c.labelDraftDefaults?.receivingType ?? c.receivingType ?? ''),
      date: String(c.labelDraftDefaults?.date ?? ''),
      condition: String(c.cond ?? row.condition_grade ?? ''),
      cornerMode: (c.labelDraftDefaults?.cornerMode ?? 'order') as LabelCornerMode,
    },
    {
      onPlatformChange: ({ label, slug }) => {
        // Print face follows the pick, and so does the RECORD:
        patchOverride?.({ platform: label });
        if (slug != null && slug !== '') {
          c.setSourcePlatform?.(slug);
          void c.savePlatform?.(slug, {
            isReturn: String(c.receivingType ?? '').trim().toUpperCase() === 'RETURN',
          });
        }
      },
      onTypeChange: (slug) => {
        c.setReceivingType?.(slug);
        void c.saveType?.(slug);
      },
      onDateChange: (date) => {
        patchOverride?.({ date });
      },
      onConditionChange: (grade) => {
        c.setCond?.(grade);
        void c.patch?.({ condition_grade: grade });
      },
      onCornerChange: setCornerMode,
      onCenter: () => {
        setComposerMode('unbox');
        scheduleFocusUnboxComposer(50);
      },
    },
  );

  useEffect(() => {
    setCartonEditorOpen(false);
    setAsListedEditorOpen(false);
    setUnitEditorOpen(false);
    hadNotesRef.current = false;
  }, [row.id]);

  useEffect(() => {
    if (hasNotes && !hadNotesRef.current) {
      onReveal?.();
    }
    hadNotesRef.current = hasNotes;
  }, [hasNotes, onReveal]);

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
          slotHits={showCarton ? receivingSlots.slotHits : undefined}
        />
        {showCarton ? receivingSlots.menus : null}
        {c.labelPayload && typeof c.buildLabelPayload === 'function' ? (
          <LabelEditPopover
            open={showCarton && cartonEditorOpen}
            defaults={c.labelDraftDefaults}
            buildPayload={c.buildLabelPayload}
            onApplyAndPrint={c.applyAndPrintLabel}
            onClose={() => setCartonEditorOpen(false)}
          />
        ) : null}
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
