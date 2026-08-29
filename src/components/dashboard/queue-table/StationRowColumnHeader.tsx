'use client';

import { Barcode, Box, Clock, Hash, MapPin, Package, Tag } from '@/components/Icons';
import { tableHeader } from '@/design-system/tokens/typography/presets';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
import { CHIP_COL } from '@/components/ui/ChipColumns';
import { META_COL, metaIndentFor } from '@/components/ui/RowMetaColumns';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { dashboardOrderRowShellClass } from '@/lib/dashboard-order-row-layout';
import { cn } from '@/utils/_cn';

interface StationRowColumnHeaderProps {
  isMobile?: boolean;
  selectMode?: boolean;
  /** Hide serial chip column label (Incoming rows omit serials). */
  includeSerial?: boolean;
  /** Meta `rest` column — stage clock on receiving / testing rows. */
  stageLabel?: string;
  className?: string;
}

/**
 * Sticky column guide for legacy two-zone queue rows (`dashboardOrderRowShellClass`)
 * — title + meta grid left, identity chips right. Mirrors
 * {@link ReceivingLineOrderRow} tracks so qty / condition / stage decode at a glance.
 */
export function StationRowColumnHeader({
  isMobile = false,
  selectMode = false,
  includeSerial = true,
  stageLabel = 'Stage',
  className,
}: StationRowColumnHeaderProps) {
  const isHidden = useIsColumnHidden();
  const showQty = !isHidden('qty');
  const showCondition = !isHidden('condition');
  const showRest = !isHidden('rest');
  const showPlatform = !isHidden('platform');
  const showOrderId = !isHidden('orderid');
  const showTracking = !isHidden('tracking');
  const showSerialChip = includeSerial && !isHidden('serial');

  if (isMobile) return null;

  const metaTracks: string[] = [];
  if (showQty) metaTracks.push(META_COL.qtyColWide);
  if (showCondition) metaTracks.push(META_COL.poCondCol);
  if (showRest) metaTracks.push(META_REST_TRACK);

  const metaIndent = metaIndentFor('wide', selectMode);

  return (
    // No `role="row"`. This is a VISUAL column guide over legacy two-zone queue
    // rows (`dashboardOrderRowShellClass`) that carry no table semantics — and
    // its own HeaderCells emit no `role="columnheader"`, so it was never a
    // meaningful row. `StationListTable` also renders it standalone (empty and
    // non-virtualized paths) with no table/rowgroup ancestor, where the role was
    // an orphan and therefore spec-invalid. Restore it only alongside real
    // `columnheader` cells AND a guaranteed table context.
    <div
      className={cn(
        'shrink-0 border-b border-border-hairline bg-surface-canvas/95',
        QUEUE_ROW.px,
        'py-1.5',
        dashboardOrderRowShellClass(false),
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center">
          {selectMode ? <span className="mr-2 h-4 w-4 shrink-0" aria-hidden /> : null}
          <span className={cn('shrink-0', META_COL.dotTrackWide)} aria-hidden />
          <HeaderCell icon={Package} label="Line" />
        </div>
        {metaTracks.length > 0 ? (
          <div
            className="mt-0.5 grid min-w-0 items-center gap-x-0.5"
            style={{ paddingLeft: metaIndent, gridTemplateColumns: metaTracks.join(' ') }}
          >
            {showQty ? <HeaderCell icon={Hash} label="Qty" compact /> : null}
            {showCondition ? <HeaderCell icon={Tag} label="Cond" compact /> : null}
            {showRest ? <HeaderCell icon={Clock} label={stageLabel} compact /> : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-end justify-end gap-0.5 pr-1 -mr-1.5">
        {showPlatform ? (
          <ChipHeaderCell icon={Box} label="Plat" width={CHIP_COL.platform} />
        ) : null}
        {showOrderId ? (
          <ChipHeaderCell icon={Hash} label="PO" width={CHIP_COL.id} />
        ) : null}
        {showTracking ? (
          <ChipHeaderCell icon={MapPin} label="Trk" width={CHIP_COL.tracking} />
        ) : null}
        {showSerialChip ? (
          <ChipHeaderCell icon={Barcode} label="Ser" width={CHIP_COL.serial} />
        ) : null}
      </div>
    </div>
  );
}

/** Flex track for stage / workflow facts in the meta `rest` cluster. */
const META_REST_TRACK = 'minmax(4.5rem, auto)';

function HeaderCell({
  icon: Icon,
  label,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1', tableHeader, compact && 'tracking-wider')}>
      <Icon className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}

function ChipHeaderCell({
  icon: Icon,
  label,
  width,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  width: string;
}) {
  return (
    <div className={cn('flex justify-end', width)}>
      <HeaderCell icon={Icon} label={label} compact />
    </div>
  );
}
