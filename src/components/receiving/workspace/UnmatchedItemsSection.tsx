'use client';

/**
 * Items section for an unmatched (no-Zoho-PO) receiving carton.
 *
 * Mounted by {@link LineEditPanel} where {@link PoLinesAccordion} would
 * sit for a Zoho-matched carton. Owns:
 *   - fetching the carton's existing receiving_lines
 *   - the [+] CTA → CartonAddPopover (Item = zoho_catalog search · Web · Box)
 *   - per-line condition pill updates
 *
 * Repair-service linking was retired from here — it now lives in the triage
 * Smart-Matching "Repair Service / Trade in" tab (inline Ecwid order list).
 *
 * Kept deliberately small so LineEditPanel can drop it in without
 * branching on receiving_source for every prop.
 *
 * Every receiving carton renders the unified one-row surface
 * ({@link UnmatchedAccordionSurface} — PoLinesAccordion + active-row scanner,
 * the same row anatomy a matched PO line uses; receiving-condition-serial-
 * unification-plan.md). There is no feature flag: this is the only receiving
 * path. The per-line list below ({@link UnmatchedItemsPerLineList}) survives
 * only for the tech testing workspace, which injects per-line verdict pills via
 * `renderLineActions` — a capability the single active-row editor doesn't cover.
 */

import { Loader2, PackageOpen, Pencil, Unlink } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton } from '@/design-system/primitives';
import { WorkspaceCard, InlineNotice } from '@/design-system/components';
import { HandlingUnitChip } from '@/components/receiving/HandlingUnitChip';
import { LabelIdentifyButton } from '@/components/receiving/label-identify/LabelIdentifyButton';
import { useUnmatchedItems } from './unmatched-items/useUnmatchedItems';
import { UnmatchedLineRow } from './unmatched-items/UnmatchedLineRow';
import { UnmatchedAccordionSurface } from './unmatched-items/UnmatchedAccordionSurface';
import { IntakeClassifyRow } from './unmatched-items/IntakeClassifyRow';
import { ReturnScanCard } from './unmatched-items/ReturnScanCard';
import type { UnmatchedItemsSectionProps } from './unmatched-items/unmatched-items-shared';

export type {
  UnfoundLine,
  UnmatchedLineRenderHelpers,
  UnmatchedItemsSectionProps,
} from './unmatched-items/unmatched-items-shared';

export function UnmatchedItemsSection(props: UnmatchedItemsSectionProps) {
  // The tech testing workspace injects per-line verdict pills via
  // `renderLineActions` — the unified accordion's single active-row editor can't
  // host a custom control on every line, so that ONE caller keeps the per-line
  // list. Every receiving carton uses the unified one-row surface.
  if (props.renderLineActions) {
    return <UnmatchedItemsPerLineList {...props} />;
  }
  return <UnmatchedAccordionSurface {...props} />;
}

/**
 * Per-line list surface — retained solely for the tech testing workspace's
 * `renderLineActions` (verdict pills per line). Not used by any receiving path.
 */
function UnmatchedItemsPerLineList(props: UnmatchedItemsSectionProps) {
  const {
    receivingId,
    staffId,
    receivingTypeHint = 'PO',
    onFileReturnClaim,
    serialAbsent,
    serialAbsentReason,
    requireSerialConfirmation,
    onSerialAbsentChange,
    renderLineActions,
    showSerialScan = true,
    onOpenInUnbox,
    embedded = false,
    headerRight,
    suppressHeader = false,
  } = props;

  const c = useUnmatchedItems(props);

  // Header actions shared by the standalone card and the embedded form. The edit
  // pencil is dropped when embedded — the POUnboxingSection wrapper supplies the
  // single shared pencil (which also dispatches `receiving-open-pairing-add`).
  const headerActions = (
    <div className="flex items-center gap-1.5">
      {c.assignedBox ? (
        <HandlingUnitChip
          handlingUnitId={c.assignedBox.id}
          code={c.assignedBox.code}
          unitCount={c.assignedBox.total}
          dense
        />
      ) : null}
      {onOpenInUnbox ? (
        <HoverTooltip label="Open this carton in unbox mode (serial scan, photos, receive)" asChild>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onOpenInUnbox}
            ariaLabel="Open this carton in unbox mode (serial scan, photos, receive)"
            icon={<PackageOpen />}
            className="h-7 gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-blue-700 hover:bg-blue-100"
          >
            Open in unbox
          </Button>
        </HoverTooltip>
      ) : null}
      {/* Repair-service linking is retired here — it now lives in the triage
          Smart-Matching "Repair Service / Trade in" tab. */}
      {!embedded ? (
        <HoverTooltip label="Edit carton items — opens Package Pairing (catalog item, web search, or a box)" asChild>
          <IconButton
            icon={<Pencil className="h-3.5 w-3.5 text-white" />}
            ariaLabel="Edit carton items"
            onClick={() => window.dispatchEvent(new CustomEvent('receiving-open-pairing-add'))}
            className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700"
          />
        </HoverTooltip>
      ) : null}
    </div>
  );

  const body = (
    <>
      <div className="space-y-2">
        {/* Door-classification pill row — desktop triage parity with mobile
            /m/receive. Triage-only (gated on the triage-only onOpenInUnbox CTA)
            so the unbox workspace shows the read-only A4 banner instead. */}
        {onOpenInUnbox ? (
          <IntakeClassifyRow value={c.classification} onSelect={c.saveClassification} />
        ) : null}
        {c.showUnlinkPrompt ? (
          <InlineNotice
            tone="warning"
            size="sm"
            title={
              c.linkError
                ? 'Could not import — order already linked'
                : 'Order linked — no items yet'
            }
          >
            <div className="space-y-2">
              <p className="text-role-caption text-amber-900">
                {c.linkError ? (
                  <>
                    {c.linkError}
                    {c.linkedOrderNumber ? (
                      <>
                        {' '}
                        This carton is still paired to order{' '}
                        <span className="font-mono font-bold">{c.linkedOrderNumber}</span>.
                      </>
                    ) : null}
                  </>
                ) : c.linkedOrderNumber ? (
                  <>
                    Order{' '}
                    <span className="font-mono font-bold">{c.linkedOrderNumber}</span> is paired to
                    this carton but no line items were imported. Unlink to clear the pairing and
                    scan the serial again.
                  </>
                ) : (
                  'This carton has an order pairing but no line items. Unlink to clear it and try again.'
                )}
              </p>
              <HoverTooltip
                label="Clears the order#, platform, return flags, and per-line source linkage"
                asChild
                focusable={false}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={c.unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink />}
                  onClick={() => void c.handleUnlinkOrder()}
                  disabled={c.unlinking}
                  className="h-7 border-rose-200 bg-rose-50 px-2.5 text-rose-700 hover:bg-rose-100"
                >
                  {c.unlinking ? 'Unlinking…' : 'Unlink order'}
                </Button>
              </HoverTooltip>
            </div>
          </InlineNotice>
        ) : null}
        {/* Primary entry for an unfound carton: scan a serial. On a shipped-serial
            match we pull the product details and create + populate the line — no
            manual Add-item step. */}
        {showSerialScan ? (
          <ReturnScanCard
            condition={c.cartonScanCondition}
            onConditionChange={(next) => c.handleCartonConditionChange(next)}
            onAdd={(sn) => c.handleReturnSerialScan(sn)}
            serialAbsent={serialAbsent}
            serialAbsentReason={serialAbsentReason}
            requireSerialConfirmation={requireSerialConfirmation}
            onSerialAbsentChange={onSerialAbsentChange}
          />
        ) : null}
        {/* Identify an item by photographing its printed label. The LAN vision box
            OCRs the Bose model, the server resolves it to a catalog SKU, and the
            confirmed candidate is added via the same add-unmatched-line path the
            CartonAddPopover uses. Hidden when no vision box is configured. */}
        <LabelIdentifyButton
          onConfirm={(cand) =>
            c.handleAddLine({
              sku_platform_id_row: null,
              sku_catalog_id: cand.sku_catalog_id,
              sku: cand.sku ?? '',
              item_name: cand.product_title ?? cand.item_name ?? cand.model,
              image_url: cand.image_url,
            })
          }
        />
        {c.lines.map((line) => (
          <UnmatchedLineRow
            key={line.id}
            line={line}
            receivingId={receivingId}
            staffId={staffId}
            receivingType={receivingTypeHint}
            onConditionChange={c.handleConditionChange}
            onRemove={c.handleRemoveLine}
            onFileReturnClaim={onFileReturnClaim}
            onActiveConditionChange={props.onActiveConditionChange}
            serialAbsent={serialAbsent}
            serialAbsentReason={serialAbsentReason}
            requireSerialConfirmation={requireSerialConfirmation}
            onSerialAbsentChange={onSerialAbsentChange}
            renderActions={
              renderLineActions
                ? (helpers) => renderLineActions(line, helpers)
                : undefined
            }
            refresh={c.refreshLines}
          />
        ))}
      </div>

      {/* Add-item is now the Package Pairing "Items" tab (one surface). The pencil
          above dispatches `receiving-open-pairing-add` to open it. */}
    </>
  );

  // Embedded → bare sub-section (eyebrow + content) so the unified
  // POUnboxingSection wrapper owns the single card chrome + edit pencil.
  if (embedded) {
    return (
      <div className="space-y-2">
        {suppressHeader ? null : (
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-role-caption font-bold uppercase tracking-[0.14em] text-text-soft">
              PO items · {c.lines.length}
            </h3>
            <div className="flex items-center gap-1.5">
              {headerActions}
              {headerRight ?? null}
            </div>
          </div>
        )}
        {body}
      </div>
    );
  }

  return (
    <WorkspaceCard label={`PO items · ${c.lines.length}`} actions={headerActions}>
      {body}
    </WorkspaceCard>
  );
}
