'use client';

/**
 * Custom-print editor for the As Listed disclosure sticker. Short seller-defect
 * phrase + condition; WYSIWYG via {@link LabelFacePreview} + asListedPayloadToFace.
 */

import { useMemo } from 'react';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import { Pencil, Printer, X } from '@/components/Icons';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { useLabelDraft } from '@/components/labels/useLabelDraft';
import {
  asListedPayloadToFace,
  type AsListedLabelPayload,
} from '@/lib/print/printAsListedLabel';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



export interface AsListedLabelDraft {
  disclosure: string;
  conditionCode: string;
  corner: string;
  date: string;
}

const FIELD_LABEL = `${microBadge} mb-1.5 block text-text-soft tracking-wider`;
const TEXT_INPUT =
  cn('w-full rounded-lg border border-border-soft bg-surface-card px-2.5 py-1.5 text-role-caption text-text-default transition-colors', focusRing('field', 'accent'));

export function AsListedEditPopover({
  open,
  defaults,
  buildPayload,
  onApplyAndPrint,
  onClose,
}: {
  open: boolean;
  defaults: AsListedLabelDraft;
  buildPayload: (draft: AsListedLabelDraft) => AsListedLabelPayload;
  onApplyAndPrint: (draft: AsListedLabelDraft) => void;
  onClose: () => void;
}) {
  const { draft, set } = useLabelDraft<AsListedLabelDraft>(defaults, open);

  const face = useMemo(() => asListedPayloadToFace(buildPayload(draft)), [buildPayload, draft]);

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      aria-label="Edit As Listed label"
      className="w-[min(94%,38rem)] rounded-2xl border-0 shadow-2xl ring-1 ring-border-soft"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-5 py-3">
        <span className={`${microBadge} flex items-center gap-1.5 text-text-muted`}>
          <Pencil className="h-3.5 w-3.5 text-text-soft" />
          Edit As Listed
        </span>
        <IconButton icon={<X className="h-4 w-4" />} ariaLabel="Close" onClick={onClose} />
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="rounded border border-border-soft bg-surface-card px-2 py-2 shadow-sm">
          <LabelFacePreview model={face} embedded />
        </div>

        <div>
          <label className={FIELD_LABEL} htmlFor="as-listed-disclosure">
            Seller disclosure
          </label>
          <textarea
            id="as-listed-disclosure"
            rows={3}
            value={draft.disclosure}
            onChange={(e) => set('disclosure', e.target.value)}
            placeholder="e.g. Screen scratches as listed, missing charger"
            className={`${TEXT_INPUT} resize-none`}
          />
        </div>

        <div>
          <span className={FIELD_LABEL}>Condition</span>
          <ConditionPills
            value={draft.conditionCode}
            onChange={(code) => set('conditionCode', code)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="as-listed-corner">
              Corner
            </label>
            <input
              id="as-listed-corner"
              value={draft.corner}
              onChange={(e) => set('corner', e.target.value)}
              className={TEXT_INPUT}
              placeholder="Platform or PO#"
            />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="as-listed-date">
              Date
            </label>
            <input
              id="as-listed-date"
              value={draft.date}
              onChange={(e) => set('date', e.target.value)}
              className={TEXT_INPUT}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-hairline px-5 py-3">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<Printer className="h-3.5 w-3.5" />}
          onClick={() => {
            onApplyAndPrint(draft);
            onClose();
          }}
        >
          Save & print
        </Button>
      </div>
    </RightPaneOverlay>
  );
}
