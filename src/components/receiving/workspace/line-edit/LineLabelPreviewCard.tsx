'use client';

import { useState } from 'react';
import { WorkspaceCard } from '@/design-system/components';
import { Button } from '@/design-system/primitives';
import { Pencil } from '@/components/Icons';
import { ReceivingPoLabelPreview } from '../ReceivingPoLabelPreview';
import { ReceivingProductLabelPreview } from '../ReceivingProductLabelPreview';
import type { ReceivingLabelPayload } from '../receiving-label-helpers';
import { LabelEditPopover, type LabelEditDraft } from './LabelEditPopover';

/**
 * Inline preview of the label that "Print · receive" will produce. Shows the
 * PO/receiving label when the carton has a scan value; otherwise falls back to
 * a product (SKU) label preview. Renders nothing when neither is available.
 *
 * For the PO label the face stays a clean display at rest; on hover (or
 * keyboard focus) a light scrim reveals a centered "Edit label" button that
 * opens {@link LabelEditPopover} to hand-edit the printed face (platform /
 * notes / condition / reference / date) and print a one-off custom label —
 * built for unfound cartons that need info filled in manually. No eyebrow
 * header row. The product-label branch has no editor (it's a SKU label, not
 * the carton face).
 */
export function LineLabelPreviewCard({
  scanValue,
  labelPayload,
  sku,
  itemName,
  serialNumber,
  labelDraftDefaults,
  buildLabelPayload,
  onApplyAndPrint,
}: {
  scanValue: string;
  labelPayload: ReceivingLabelPayload;
  sku: string | null | undefined;
  itemName: string | null | undefined;
  serialNumber: string;
  /** Seed values for the Edit-label popover. */
  labelDraftDefaults: LabelEditDraft;
  /** Assembles the exact payload a draft previews + prints. */
  buildLabelPayload: (draft: LabelEditDraft) => ReceivingLabelPayload;
  /** Persist (where it can) + apply the print-time override + print. */
  onApplyAndPrint: (draft: LabelEditDraft) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);

  if (!scanValue && !sku) return null;

  // Themed frame matching the testing/products LabelPreviewCard so all label
  // previews read identically. The label face inside is theme-aware (dark card
  // + inverted barcode in dark mode); print stays black-on-white.
  const preview = scanValue ? (
    <ReceivingPoLabelPreview {...labelPayload} embedded />
  ) : sku ? (
    <ReceivingProductLabelPreview
      sku={sku}
      title={itemName ?? ''}
      serialNumber={serialNumber}
      embedded
    />
  ) : null;

  return (
    <>
      {/* No eyebrow header — clean label face; hover/focus reveals the edit overlay. */}
      <WorkspaceCard variant="glass">
        <div className="group relative rounded border border-border-soft bg-surface-card px-2 py-2 shadow-sm">
          {preview}
          {scanValue ? (
            // Idle: invisible + pointer-events-none so it never eats a click on the
            // face. Hover or keyboard focus fades in a labeled button, top-right.
            <div className="pointer-events-none absolute right-1.5 top-1.5 w-[104px] opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
              {/* A touch wider than the 84px DataMatrix so the label breathes. */}
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil />}
                onClick={() => setEditorOpen(true)}
                className="w-full whitespace-nowrap px-2"
              >
                Edit label
              </Button>
            </div>
          ) : null}
        </div>
      </WorkspaceCard>

      {scanValue ? (
        <LabelEditPopover
          open={editorOpen}
          defaults={labelDraftDefaults}
          buildPayload={buildLabelPayload}
          onApplyAndPrint={onApplyAndPrint}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </>
  );
}
