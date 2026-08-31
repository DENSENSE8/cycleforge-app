'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  WorkspaceCard,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';
import { IconButton } from '@/design-system/primitives';
import { Pencil } from '@/components/Icons';
import { LabelFacePreview } from '@/components/labels/LabelFacePreview';
import { useLabelFaceProductSlots } from '@/components/labels/LabelFaceProductSlots';
import {
  ProductLabelEditPopover,
  type ProductLabelDraft,
} from '@/components/labels/ProductLabelEditPopover';
import { unitLabelToFace } from '@/lib/print/printProductLabel';
import type { LabelFaceModel } from '@/lib/print/labelFace';

interface LabelPreviewCardProps {
  sku: string;
  /** Product title — fills the label's full top row. Falls back to the unit id when absent. */
  title?: string | null;
  /** @deprecated Use {@link title}. Kept for caller compatibility. */
  itemName?: string | null;
  /** @deprecated No longer rendered. */
  eyebrowLabel?: string;
  /** Condition grade rendered bottom-left — mirrors the printed label. */
  condition?: string | null;
  /** Product color rendered bottom-right — mirrors the printed label. */
  color?: string | null;
  /** Human serial — kept for caller compatibility; encoded in the DataMatrix, not shown on the face. */
  serialNumber?: string | null;
  dataMatrixValue: string;
  dataMatrixSymbology: 'gs1datamatrix' | 'datamatrix';
  heading?: string;
  /**
   * When provided, a pencil in the card header opens the {@link ProductLabelEditPopover}
   * to hand-edit the title / condition / color and print a custom label. The
   * callback receives the chosen draft so the page can persist + print.
   */
  onApplyAndPrint?: (draft: ProductLabelDraft) => void;
  /**
   * Replaces the top-left heading text with custom content (e.g. a label-type
   * dropdown that selects which label is queued for printing). Opt-in — callers
   * that don't pass it keep the plain `heading`.
   */
  headerLeft?: ReactNode;
  /**
   * Render THIS face instead of the built-in unit face (e.g. a carton label
   * selected from the header dropdown). When set, the unit edit-pencil is
   * suppressed — supply the label's own action via {@link headerAction}.
   */
  faceOverride?: LabelFaceModel | null;
  /**
   * When provided, the header pencil calls this instead of opening the built-in
   * unit editor — so a caller (e.g. the carton label) can open its OWN editor
   * popover. Keeps the same pencil → editor CTA across label types.
   */
  onEdit?: () => void;
}

/**
 * Live preview of the printed product/unit label, shared by the testing and
 * products pages. A thin card around {@link LabelFacePreview}: maps the unit
 * fields onto the common {@link LabelFaceModel} via `unitLabelToFace` — the exact
 * model `printProductLabel` prints — so the preview and the sticker can't drift.
 * Pass `onApplyAndPrint` to surface the Edit-label pencil.
 *
 * Shell = DS {@link WorkspaceCard} + {@link WORKSPACE_NESTED_FIELD}* (solid
 * Products / MultiSku surface — not the glass overview worksheet).
 */
export function LabelPreviewCard({
  sku,
  title,
  itemName,
  condition,
  color,
  dataMatrixValue,
  dataMatrixSymbology,
  heading = 'Live preview',
  onApplyAndPrint,
  headerLeft,
  faceOverride,
  onEdit,
}: LabelPreviewCardProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const productTitle = (title ?? itemName ?? '').trim();
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
  const useProductHits = !faceOverride;
  const face =
    faceOverride ??
    unitLabelToFace({
      sku,
      title: productDraft.title,
      condition: productDraft.condition,
      color: productDraft.color,
      matrix,
    });
  // Built-in unit editor: a unit face + an apply handler and no caller-owned editor.
  const builtInEditor = !faceOverride && Boolean(onApplyAndPrint);
  // The pencil shows whenever there's something to edit — a caller-owned editor
  // (onEdit, e.g. the carton label) or the built-in unit editor — so the CTA is
  // identical across label types.
  const canEdit = Boolean(onEdit) || builtInEditor;

  return (
    <>
      <WorkspaceCard
        label={headerLeft ?? heading}
        actions={
          canEdit ? (
            <IconButton
              icon={<Pencil className="h-4 w-4" />}
              ariaLabel="Edit label"
              title="Edit label — custom print"
              tone="accent"
              onClick={() => (onEdit ? onEdit() : setEditorOpen(true))}
            />
          ) : undefined
        }
      >
        {/* Themed frame; the label face inside is theme-aware (dark card + inverted
            barcode in dark mode). Print output stays black-on-white. */}
        <div className={`${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD}`}>
          <LabelFacePreview
            model={face}
            embedded
            slotHits={useProductHits ? productSlots.slotHits : undefined}
          />
        </div>
      </WorkspaceCard>

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
