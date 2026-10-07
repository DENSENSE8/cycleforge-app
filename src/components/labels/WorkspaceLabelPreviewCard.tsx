'use client';

/** Headerless workspace label preview — shared by Unbox and Testing. */

import { useEffect, useState, type ReactNode } from 'react';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { useLabelFaceProductSlots } from '@/components/labels/LabelFaceProductSlots';
import type { LabelFaceSlotHandlers } from '@/components/labels/LabelFaceSlotOverlay';
import {
  WorkspaceCard,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
  WORKSPACE_NESTED_OVERLAY_CORNER,
} from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { Pencil } from '@/components/Icons';
import {
  ProductLabelEditPopover,
  type ProductLabelDraft,
} from '@/components/labels/ProductLabelEditPopover';
import { LabelTypeSelect, type LabelTypeOption } from '@/components/labels/LabelTypeSelect';
import { unitLabelToFace } from '@/lib/print/printProductLabel';
import type { LabelFaceModel } from '@/lib/print/labelFace';
import { cn } from '@/utils/_cn';
import { LabelFacePeek } from './LabelFacePeek';

/** The `peek` chrome's resting face: 0.8 × the 2 × 1 in sticker — half the bubble height of a column-filling face. */
const PEEK_FACE_SCALE = 0.8;

export function WorkspaceLabelPreviewCard({
  sku,
  title,
  condition,
  color,
  dataMatrixValue,
  dataMatrixSymbology,
  labelOptions,
  activeLabel,
  onLabelChange,
  faceOverride,
  onEdit,
  onApplyAndPrint,
  chrome = 'worksheet',
  showHoverChrome,
  editorOpen: editorOpenControlled,
  onEditorOpenChange,
  slotHits,
}: {
  sku: string;
  title: string;
  condition?: string | null;
  color?: string | null;
  dataMatrixValue: string;
  dataMatrixSymbology: 'gs1datamatrix' | 'datamatrix';
  labelOptions: ReadonlyArray<LabelTypeOption>;
  activeLabel: string;
  onLabelChange: (key: string) => void;
  /** When set, renders this face instead of the built-in unit face. */
  faceOverride?: LabelFaceModel | null;
  /** Caller-owned editor (carton / as-listed / ticket). Unit uses built-in popover. */
  onEdit?: () => void;
  onApplyAndPrint?: (draft: ProductLabelDraft) => void;
  /**
   * `worksheet` — glass + nested field (Testing / standalone).
   * `procedure` — bare host filling its column (QC Label band).
   * `peek` — bare host, small fixed face; hover grows the big face + actual size
   *   ({@link LabelFacePeek}) — the Unbox label bubble.
   */
  chrome?: 'worksheet' | 'procedure' | 'peek';
  /**
   * Hover type-select + Edit overlays. Defaults **on** for `worksheet`, **off**
   * for `procedure` (Unbox — dock owns kind + Edit).
   */
  showHoverChrome?: boolean;
  /** Controlled open for the built-in unit ProductLabelEditPopover. */
  editorOpen?: boolean;
  onEditorOpenChange?: (open: boolean) => void;
  /** Pinpoint hits on the open sticker — omit when the Label band is shut. */
  slotHits?: LabelFaceSlotHandlers;
}) {
  const [editorOpenUncontrolled, setEditorOpenUncontrolled] = useState(false);
  const editorOpen = editorOpenControlled ?? editorOpenUncontrolled;
  const setEditorOpen = onEditorOpenChange ?? setEditorOpenUncontrolled;
  const productTitle = title.trim();
  const matrix = { value: dataMatrixValue, symbology: dataMatrixSymbology, scale: 4 } as const;
  const [productDraft, setProductDraft] = useState<ProductLabelDraft>(() => ({
    title: productTitle || sku,
    condition: (condition ?? '').trim(),
    color: (color ?? '').trim(),
  }));
  useEffect(() => {
    setProductDraft({
      title: productTitle || sku,
      condition: (condition ?? '').trim(),
      color: (color ?? '').trim(),
    });
  }, [sku, productTitle, condition, color]);
  const productSlots = useLabelFaceProductSlots(productDraft, setProductDraft);
  const useProductHits = !slotHits && !faceOverride;
  const face =
    faceOverride ??
    unitLabelToFace({
      sku,
      title: productDraft.title,
      condition: productDraft.condition,
      color: productDraft.color,
      matrix,
    });
  const builtInEditor = !faceOverride && Boolean(onApplyAndPrint);
  const canEdit = Boolean(onEdit) || builtInEditor;
  const peek = chrome === 'peek';
  const procedure = chrome === 'procedure' || peek;
  const hoverChrome = showHoverChrome ?? !procedure;

  const typeSelect: ReactNode =
    hoverChrome && labelOptions.length > 1 ? (
      <LabelTypeSelect value={activeLabel} options={labelOptions} onChange={onLabelChange} />
    ) : null;

  const faceHost = (
    <div
      className={
        procedure
          ? 'relative'
          : `group relative ${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD}`
      }
    >
      <LabelFacePreview
        model={face}
        embedded
        fit={chrome === 'procedure' ? 'host' : 'capped'}
        maxScale={peek ? PEEK_FACE_SCALE : undefined}
        slotHits={slotHits ?? (useProductHits ? productSlots.slotHits : undefined)}
      />
      {typeSelect ? (
        <div className="pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          <div
            className={cn(
              'border border-border-default bg-surface-card px-1.5 py-0.5',
              cornerClass('flush'),
            )}
          >
            {typeSelect}
          </div>
        </div>
      ) : null}
      {hoverChrome && canEdit ? (
        <div
          className={cn(
            'pointer-events-none absolute w-[104px] opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100',
            procedure ? 'right-0 top-0' : WORKSPACE_NESTED_OVERLAY_CORNER,
          )}
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil />}
            onClick={() => (onEdit ? onEdit() : setEditorOpen(true))}
            className={cn('w-full whitespace-nowrap px-2', cornerClass('flush'))}
          >
            Edit label
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {peek ? (
        <LabelFacePeek face={face}>{faceHost}</LabelFacePeek>
      ) : procedure ? (
        faceHost
      ) : (
        // Nested glass + rounded-xl inset — same concentric corners as Notes.
        // Face stays sticker density (print-faithful); only the frame matches.
        <WorkspaceCard variant="glass" bodyDensity="nested">
          {faceHost}
        </WorkspaceCard>
      )}

      {useProductHits ? productSlots.menus : null}
      {builtInEditor && !onEdit && onApplyAndPrint ? (
        <ProductLabelEditPopover
          open={editorOpen}
          defaults={productDraft}
          sku={sku}
          matrix={matrix}
          onApplyAndPrint={onApplyAndPrint}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </>
  );
}
