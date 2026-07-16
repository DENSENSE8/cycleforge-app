'use client';

/**
 * Headerless workspace label preview — shared by Unbox and Testing.
 * Clean face at rest; hover/focus reveals the label-type selector (top-left)
 * and Edit label CTA (top-right).
 */

import { useState, type ReactNode } from 'react';
import { WorkspaceCard } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { Pencil } from '@/components/Icons';
import { LabelFacePreview } from '@/components/labels/LabelFacePreview';
import {
  ProductLabelEditPopover,
  type ProductLabelDraft,
} from '@/components/labels/ProductLabelEditPopover';
import { LabelTypeSelect, type LabelTypeOption } from '@/components/labels/LabelTypeSelect';
import { unitLabelToFace } from '@/lib/print/printProductLabel';
import type { LabelFaceModel } from '@/lib/print/labelFace';

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
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const productTitle = title.trim();
  const matrix = { value: dataMatrixValue, symbology: dataMatrixSymbology, scale: 4 } as const;
  const face =
    faceOverride ?? unitLabelToFace({ sku, title: productTitle, condition, color, matrix });
  const builtInEditor = !faceOverride && Boolean(onApplyAndPrint);
  const canEdit = Boolean(onEdit) || builtInEditor;

  const typeSelect: ReactNode =
    labelOptions.length > 1 ? (
      <LabelTypeSelect value={activeLabel} options={labelOptions} onChange={onLabelChange} />
    ) : null;

  return (
    <>
      <WorkspaceCard variant="glass">
        <div className="group relative rounded border border-border-soft bg-surface-card px-2 py-2 shadow-sm">
          <LabelFacePreview model={face} embedded />
          {typeSelect ? (
            <div className="pointer-events-none absolute left-1.5 top-1.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
              <div className="rounded-md bg-surface-card/95 px-1.5 py-0.5 shadow-sm ring-1 ring-border-soft/60 backdrop-blur-sm">
                {typeSelect}
              </div>
            </div>
          ) : null}
          {canEdit ? (
            <div className="pointer-events-none absolute right-1.5 top-1.5 w-[104px] opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil />}
                onClick={() => (onEdit ? onEdit() : setEditorOpen(true))}
                className="w-full whitespace-nowrap px-2"
              >
                Edit label
              </Button>
            </div>
          ) : null}
        </div>
      </WorkspaceCard>

      {builtInEditor && !onEdit && onApplyAndPrint ? (
        <ProductLabelEditPopover
          open={editorOpen}
          defaults={{
            title: productTitle || sku,
            condition: (condition ?? '').trim(),
            color: (color ?? '').trim(),
          }}
          sku={sku}
          matrix={matrix}
          onApplyAndPrint={onApplyAndPrint}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </>
  );
}
