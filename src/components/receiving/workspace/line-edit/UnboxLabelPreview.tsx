'use client';

/**
 * Unbox overview label preview — workspace label-type switcher (carton / unit /
 * As Listed / ticket) with editors matching Testing's hover overlays.
 *
 * The sticker is **collapsed by default**. A full-width Show / Hide label CTA
 * always sits under the PO lines (same face, same width). Typing into the dock
 * notes field (live carton face center) slowly reveals the sticker.
 */

import { useEffect, useRef, useState } from 'react';
import { WorkspaceLabelPreviewCard } from '@/components/labels/WorkspaceLabelPreviewCard';
import { AsListedEditPopover } from '@/components/labels/AsListedEditPopover';
import { AnimatePresence, motion } from '@/design-system/motion';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { cornerClass } from '@/design-system/tokens/radius';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { LabelEditPopover } from './LabelEditPopover';
import { deriveColorFromTitle } from '@/lib/print/printProductLabel';
import type { WorkspaceLabelKind } from '@/lib/print/workspace-label-kinds';

/** Subset of useUnboxLineController fields needed by the label preview. */
export function UnboxLabelPreview({
  row,
  c,
}: {
  row: {
    id?: number;
    sku?: string | null;
    item_name?: string | null;
    condition_grade?: string | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- controller return is a large bag
  c: any;
}) {
  const [cartonEditorOpen, setCartonEditorOpen] = useState(false);
  const [asListedEditorOpen, setAsListedEditorOpen] = useState(false);
  const [unitEditorOpen, setUnitEditorOpen] = useState(false);
  // Sticker stays out of the way until notes arrive or the operator asks.
  const [labelOpen, setLabelOpen] = useState(false);
  const hadNotesRef = useRef(false);

  const labelCollapse = useMotionPresence(framerPresence.collapseHeight);
  // Soft + slow reveal — same altitude as the detail-stack overlay mount.
  const labelReveal = useMotionTransition(framerTransition.detailStackOverlayMount);

  const options = c.labelSelectOptions ?? [];
  const notesLive = String(c.itemNote ?? '').trim();
  const hasNotes = notesLive.length > 0;

  // New carton / line → start collapsed again.
  useEffect(() => {
    setLabelOpen(false);
    setCartonEditorOpen(false);
    setAsListedEditorOpen(false);
    setUnitEditorOpen(false);
    hadNotesRef.current = false;
  }, [row.id]);

  // Empty → non-empty notes: slowly open the sticker. Manual Hide while notes
  // remain does not fight the operator on later keystrokes.
  useEffect(() => {
    if (hasNotes && !hadNotesRef.current) {
      setLabelOpen(true);
    }
    hadNotesRef.current = hasNotes;
  }, [hasNotes]);

  // Print · Receive dock "Edit label" — open the editor for the active kind.
  const labelEditorRequestId = c.labelEditorRequestId ?? 0;
  useEffect(() => {
    if (!labelEditorRequestId) return;
    setLabelOpen(true);
    const kind = (c.activeLabelKind ?? 'carton') as WorkspaceLabelKind;
    setCartonEditorOpen(kind === 'carton');
    setAsListedEditorOpen(kind === 'as_listed');
    setUnitEditorOpen(kind === 'unit');
  }, [labelEditorRequestId, c.activeLabelKind]);

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
      {/* ds-raw-button: full-width quiet reveal / collapse — same face both states */}
      <button
        type="button"
        onClick={() => setLabelOpen((open) => !open)}
        className={cn(
          'ds-raw-button flex h-8 w-full items-center justify-center gap-1',
          'border-b border-border-hairline bg-surface-card',
          'text-role-micro font-semibold uppercase tracking-widest text-text-soft',
          'transition-colors hover:bg-surface-hover hover:text-text-muted',
          cornerClass('flush'),
        )}
        data-testid={labelOpen ? 'unbox-label-hide' : 'unbox-label-show'}
        aria-expanded={labelOpen}
      >
        {labelOpen ? (
          <ChevronUp className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden />
        )}
        {labelOpen ? 'Hide label' : 'Show label'}
      </button>

      <AnimatePresence initial={false}>
        {labelOpen ? (
          <motion.div
            key="unbox-label-body"
            {...labelCollapse}
            transition={labelReveal}
            className="overflow-hidden"
            data-testid="unbox-label-open"
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
