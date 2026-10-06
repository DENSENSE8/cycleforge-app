'use client';

import { useMemo } from 'react';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Panel, Button, IconButton, TextField } from '@/design-system/primitives';
import { Check, Pencil, Printer, X } from '@/components/Icons';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { useLabelDraft } from '@/components/labels/useLabelDraft';
import { unitLabelToFace } from '@/lib/print/printProductLabel';
import type { LabelFaceModel } from '@/lib/print/labelFace';



/** The hand-editable product/unit label-face fields. */
export interface ProductLabelDraft {
  /** Full top-row title. */
  title: string;
  /** Bottom-left condition grade code. */
  condition: string;
  /** Bottom-right product color. */
  color: string;
  /** Custom text under the title; only editable where the host opts in (`customText`). */
  text?: string;
}

const FIELD_LABEL = `${microBadge} mb-1.5 block text-text-soft tracking-wider`;

/** Custom-print editor for the product/unit (testing, products page, prepack) label. */
export function ProductLabelEditPopover({
  open,
  defaults,
  sku,
  matrix,
  onApplyAndPrint,
  onClose,
  customText = false,
  applyLabel,
}: {
  open: boolean;
  /** Seed values — re-read every time the popover opens. */
  defaults: ProductLabelDraft;
  sku: string;
  /** The DataMatrix the label encodes — rendered in the live preview as-is. */
  matrix: LabelFaceModel['matrix'];
  /** Apply the chosen fields (+ print, unless the host relabels the verb with `applyLabel`). */
  onApplyAndPrint: (draft: ProductLabelDraft) => void;
  onClose: () => void;
  /** Offer the custom text line (the face's centre slot). The host must persist it. */
  customText?: boolean;
  /** The footer verb when applying does not print (prepack: the form's Print does). Default "Save & print". */
  applyLabel?: string;
}) {
  const { draft, set } = useLabelDraft<ProductLabelDraft>(defaults, open);

  const face = useMemo(
    () =>
      unitLabelToFace({
        sku,
        title: draft.title,
        condition: draft.condition,
        color: draft.color,
        note: customText ? draft.text : null,
        matrix,
      }),
    [sku, draft.title, draft.condition, draft.color, draft.text, customText, matrix],
  );

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      aria-label="Edit label"
      className="w-[min(94%,38rem)] rounded-2xl border-0 shadow-2xl ring-1 ring-border-soft"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-5 py-3">
        <span className={`${microBadge} flex items-center gap-1.5 text-text-muted`}>
          <Pencil className="h-3.5 w-3.5 text-text-soft" />
          Edit label
        </span>
        <IconButton
          icon={<X className="h-4 w-4" />}
          ariaLabel="Close"
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-muted"
        />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Live preview — identical to the printed face. */}
        <Panel radius="xl" padding="none" className="mb-4 bg-surface-card/80 px-3 py-3">
          <LabelFacePreview model={face} embedded />
        </Panel>

        <div className="space-y-3.5">
          <TextField label="Title (top row)" value={draft.title} onChange={(value) => set('title', value)} autoComplete="off" />

          {customText ? (
            <TextField
              label="Custom text (under the title)"
              value={draft.text ?? ''}
              onChange={(value) => set('text', value)}
              maxLength={120}
              autoComplete="off"
              data-testid="label-custom-text"
            />
          ) : null}

          <div>
            <span className={FIELD_LABEL}>Condition</span>
            <ConditionPills value={draft.condition} onChange={(g) => set('condition', g)} />
          </div>

          <TextField label="Color (bottom-right)" value={draft.color} onChange={(value) => set('color', value)} autoComplete="off" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-hairline bg-surface-canvas px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-role-micro"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={applyLabel ? <Check className="h-3.5 w-3.5" /> : <Printer className="h-3.5 w-3.5" />}
          onClick={() => {
            onApplyAndPrint(draft);
            onClose();
          }}
          className="text-role-micro"
        >
          {applyLabel ?? 'Save & print'}
        </Button>
      </div>
    </RightPaneOverlay>
  );
}
