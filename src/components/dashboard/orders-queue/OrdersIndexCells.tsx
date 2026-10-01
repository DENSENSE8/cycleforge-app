'use client';

/**
 * The To-ship INDEX face's cells — one line per ORDER (owner 2026-09-26, a
 * Shopify-admin order list). A cell registry, not a second grid: the columns
 * are the `orders-index` slot materialization (`ordersIndexColumnsFor`), the
 * rows are `OrdersQueueTableRow` (a single-line order or a group child) and
 * {@link OrdersIndexGroupRow} (a multi-line order), both inside `DataTable`.
 *
 * Slot bodies branch on the RESOLVED value's `kind` (`resolveOrdersIndexValue`),
 * never on a field id. Triage tokens only: sentence case, `rounded-mode*` via
 * `ui/badge`, tone via `STATE_TONE_CLASSES`.
 */

import { Fragment, type ComponentType, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CirclePause,
  MessageSquare,
  PackageCheck,
  PackageSearch,
  PackageX,
  Truck,
} from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { CompoundDateField, CompoundSlotCell } from '@/components/tables/compound/CompoundCells';
import { CompoundEdgeRail } from '@/components/tables/compound/CompoundEdgeRail';
import {
  formatCompoundDelayAgeFace,
  type CompoundRowView,
  type CompoundStageAssign,
} from '@/components/tables/compound/compound-row-model';
import { COMPOUND_GROUP_CHILD_RAIL_CLASS } from '@/components/tables/compound/compound-row-chrome';
import { gridDataCellClass, LEDGER_GRID_FROZEN_CELL } from '@/design-system/components/grid';
import { ledgerGridRowShellClass } from '@/design-system/components/grid/grid-cell-chrome';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { useOrderChannel } from '@/hooks/useCatalog';
import { carrierBrandDotPaint } from '@/lib/carrier-brand';
import { ORDERS_INDEX_ROW_PX, type OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import type {
  OrderFulfillmentBadge,
  OrderFulfillmentKey,
  OrderFulfillmentTone,
} from '@/lib/orders/order-fulfillment-badge';
import type { OrdersIndexTag, OrdersIndexValue } from '@/lib/tables/field-catalog/orders-resolve';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { platformDisplayName } from '@/lib/platform-display';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { cn } from '@/utils/_cn';

/** Polaris tone → the house state tone. Attention and warning share amber; the glyph tells them apart. */
const FULFILLMENT_TONE_STATE: Readonly<Record<OrderFulfillmentTone, StateName>> = {
  attention: 'warning',
  warning: 'warning',
  critical: 'danger',
  info: 'info',
  success: 'success',
};

/** Glyph + text, never colour alone. */
const FULFILLMENT_GLYPH: Readonly<Record<OrderFulfillmentKey, ComponentType<{ className?: string }>>> = {
  unfulfilled: CircleDot,
  in_progress: PackageSearch,
  partially_packed: PackageCheck,
  packed: PackageCheck,
  on_hold: CirclePause,
  on_hold_out_of_stock: PackageX,
  fulfilled: Truck,
};

const TAG_VARIANT: Readonly<Record<OrdersIndexTag['tone'], 'warning' | 'destructive' | 'secondary' | 'outline'>> = {
  warning: 'warning',
  critical: 'destructive',
  neutral: 'secondary',
  flag: 'outline',
};

/** Tags past this many collapse into `+N` (Shopify's index shows two). */
const TAG_FACE_MAX = 2;

/** One order row's resolved facts — shared by a lone line and a multi-line parent. */
export interface OrdersIndexRowFacts {
  /** Resolved slot values keyed by TRACK (`status:N`). */
  values: Readonly<Record<string, OrdersIndexValue>>;
  /** The row's compound view — edge rail and the Pick / Pack stage cells read it. */
  view: CompoundRowView;
  orderId: string;
  accountSource: string | null;
  /** The order carries operator notes or a buyer note. */
  hasNote: boolean;
  /**
   * A line INSIDE a multi-line order: the parent owns the order facts, so this
   * row paints its line title in the Order column and blanks Date / Customer /
   * Channel instead of reprinting them per line.
   */
  childTitle?: string | null;
}

interface OrdersIndexCellParams {
  col: OrdersQueueColumn;
  /** The MOUNTED model — frozen offsets derive from it. */
  columns: readonly OrdersQueueColumn[];
  rule: boolean;
  facts: OrdersIndexRowFacts;
  select: {
    checked: boolean | 'mixed';
    onToggle?: (event: { shiftKey: boolean }) => void;
    label: string;
  };
  /** Multi-line parent only — the disclosure beside the order number. */
  fold?: { folded: boolean; onToggle: () => void };
  /** Present ⇒ Fulfill by edits ship-by in place. */
  onCommitShipBy?: (dateKey: string | null) => void;
  /** Present on a bound Pick / Pack track ⇒ the pending mark assigns staff. */
  stageAssigns?: Readonly<Partial<Record<string, CompoundStageAssign>>>;
}

/** Order-level facts a group child leaves to its parent. */
const ORDER_LEVEL_KINDS: Readonly<Partial<Record<OrdersIndexValue['kind'], true>>> = {
  placed: true,
  customer: true,
  channel: true,
};

function IndexChannel({
  orderId,
  accountSource,
  fba,
}: {
  orderId: string;
  accountSource: string | null;
  fba: boolean;
}) {
  const channel = useOrderChannel()(orderId, accountSource);
  const face = platformDisplayName(channel);
  if (!face) return <GridCellDash />;
  return (
    <HoverTooltip label={face} asChild>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
        <span className="min-w-0 truncate text-sm text-text-default">{face}</span>
        {fba ? <span className="shrink-0 text-xs text-text-muted">FBA</span> : null}
      </span>
    </HoverTooltip>
  );
}

function FulfillmentBadge({ badge }: { badge: OrderFulfillmentBadge }) {
  const tone = STATE_TONE_CLASSES[FULFILLMENT_TONE_STATE[badge.tone]];
  const Glyph = FULFILLMENT_GLYPH[badge.key];
  return (
    <Badge
      variant="outline"
      data-fulfillment={badge.key}
      className={cn('min-w-0 max-w-full py-1 text-role-caption', tone.pill, tone.border)}
    >
      <Glyph className="size-3 shrink-0" />
      <span className="truncate">{badge.label}</span>
    </Badge>
  );
}

function IndexTags({ tags }: { tags: readonly OrdersIndexTag[] }) {
  if (tags.length === 0) return <GridCellDash />;
  const shown = tags.slice(0, TAG_FACE_MAX);
  const hidden = tags.length - shown.length;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden">
      {shown.map((tag) => (
        <Badge
          key={tag.label}
          variant={TAG_VARIANT[tag.tone]}
          className={cn(
            'min-w-0 max-w-[8rem] py-1 text-role-caption',
            tag.chipClass && cn('ring-1 ring-inset', tag.chipClass),
          )}
        >
          {tag.tone === 'critical' ? <AlertTriangle className="size-3 shrink-0" /> : null}
          <span className="truncate">{tag.label}</span>
        </Badge>
      ))}
      {hidden > 0 ? (
        <HoverTooltip label={tags.map((tag) => tag.label).join(' · ')} focusable={false}>
          <span className="shrink-0 text-xs text-text-muted">+{hidden}</span>
        </HoverTooltip>
      ) : null}
    </span>
  );
}

/** The Fulfill by face — the civil day, plus how late when it is late (critical). */
function FulfillBy({
  value,
  onCommit,
}: {
  value: Extract<OrdersIndexValue, { kind: 'deadline' }>;
  onCommit?: (dateKey: string | null) => void;
}) {
  const { delay, tip } = value;
  const age = formatCompoundDelayAgeFace(delay);
  const day = delay.dateLabel ?? null;
  const face = !day
    ? '--'
    : delay.overdue && delay.days > 0
      ? `${day} · ${age.text}`
      : delay.dueToday
        ? `${day} · Due today`
        : day;
  const toneClass =
    delay.overdue && delay.days > 0
      ? 'font-semibold text-text-danger'
      : delay.dueToday
        ? 'text-text-default'
        : 'text-text-muted';
  return (
    <HoverTooltip label={tip ?? 'No ship-by date'} asChild>
      <CompoundDateField
        dateKey={delay.dateKey ?? null}
        faceLabel={face}
        toneClass={toneClass}
        onCommit={onCommit}
        label="Fulfill by"
        glyph={CalendarClock}
      />
    </HoverTooltip>
  );
}

function slotBody(
  col: OrdersQueueColumn,
  value: OrdersIndexValue | undefined,
  params: OrdersIndexCellParams,
): ReactNode {
  if (!value) return <GridCellDash />;
  if (params.facts.childTitle && ORDER_LEVEL_KINDS[value.kind]) return null;
  switch (value.kind) {
    case 'placed':
      return (
        <HoverTooltip label={value.tip} asChild>
          <span className="min-w-0 truncate text-sm text-text-default">{value.face}</span>
        </HoverTooltip>
      );
    case 'customer':
      return value.name || value.place ? (
        <HoverTooltip label={[value.name, value.place].filter(Boolean).join(' · ')} asChild>
          {/* Name only (Shopify); the place rides the hover so the name never truncates for it. */}
          <span className="min-w-0 truncate text-sm text-text-default">{value.name ?? '—'}</span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      );
    case 'channel':
      return <IndexChannel orderId={value.orderId} accountSource={value.accountSource} fba={value.fba} />;
    case 'money':
      return value.text ? (
        <HoverTooltip label={value.estimate ? 'Estimated — from the listing price' : 'Order total'} asChild>
          <span className="min-w-0 truncate text-sm tabular-nums text-text-default">
            {value.estimate ? '~' : ''}
            {value.text}
          </span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      );
    case 'fulfillment':
      return <FulfillmentBadge badge={value.badge} />;
    case 'deadline':
      return <FulfillBy value={value} onCommit={params.onCommitShipBy} />;
    case 'items':
      return (
        <HoverTooltip
          label={
            <span className="flex flex-col gap-0.5 text-left">
              {value.lines.map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </span>
          }
          asChild
        >
          <span className="min-w-0 truncate text-sm tabular-nums text-text-default">{value.face}</span>
        </HoverTooltip>
      );
    case 'delivery':
      return value.carriers.length > 0 ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {value.carriers.map((carrier) => {
            const paint = carrierBrandDotPaint(carrier);
            return (
              <BrandIdentityDot
                key={carrier.carrier}
                className={paint.className}
                style={paint.style}
                variant="ring"
              />
            );
          })}
          <span className="min-w-0 truncate text-sm text-text-default">
            {value.carriers.map((carrier) => carrier.label).join(' · ')}
          </span>
        </span>
      ) : (
        <GridCellDash />
      );
    case 'tags':
      return <IndexTags tags={value.tags} />;
    case 'bin':
      return value.path ? (
        <span className="min-w-0 truncate font-mono text-sm tabular-nums text-text-default">{value.path}</span>
      ) : (
        <span className="min-w-0 truncate text-sm text-text-warning">Unassigned</span>
      );
    case 'stage_event':
    case 'person':
    case 'value':
      return (
        <CompoundSlotCell
          trackKey={col.key}
          label={col.label ?? ''}
          iconKey={col.slotIconKey}
          displayType={col.slotDisplayType}
          stageLabels={col.slotStageLabels}
          view={{ ...params.facts.view, slots: { [col.key]: value } }}
          assign={col.fieldId ? params.stageAssigns?.[col.fieldId] : undefined}
        />
      );
  }
}

function OrderIdentity({ facts, fold }: Pick<OrdersIndexCellParams, 'facts' | 'fold'>) {
  if (facts.childTitle) {
    return (
      <>
        <span aria-hidden data-group-child-rail="" className={COMPOUND_GROUP_CHILD_RAIL_CLASS} />
        <HoverTooltip label={facts.childTitle} asChild>
          <span className="min-w-0 truncate pl-2 text-sm text-text-muted">{facts.childTitle}</span>
        </HoverTooltip>
      </>
    );
  }
  const meta = resolveMarketplacePlatformMeta(facts.orderId, facts.accountSource);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {fold ? (
        <button
          type="button"
          className={cn(
            'ds-raw-button -ml-1 flex size-5 shrink-0 items-center justify-center rounded-mode-control text-text-muted hover:bg-surface-hover',
            focusRing('control', 'neutral'),
          )}
          aria-expanded={!fold.folded}
          aria-label={fold.folded ? `Show lines in ${facts.orderId}` : `Hide lines in ${facts.orderId}`}
          data-group-fold=""
          onClick={(event) => {
            event.stopPropagation();
            fold.onToggle();
          }}
        >
          {fold.folded ? (
            <ChevronRight className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
      {facts.orderId ? (
        <>
          <BrandIdentityDot {...platformMetaBrandDot(meta)} />
          <OrderNumberMenuChip
            value={facts.orderId}
            platformLabel={meta.value ? meta.label : null}
            openHref={marketplaceOrderUrl(facts.orderId, facts.accountSource)}
            face="full"
            plain
            dense
          />
        </>
      ) : (
        <GridCellDash />
      )}
      {facts.hasNote ? (
        <HoverTooltip label="Has notes" focusable={false}>
          <MessageSquare className="size-3.5 shrink-0 text-text-muted" />
        </HoverTooltip>
      ) : null}
    </span>
  );
}

/**
 * Paint one index track, wrapper included. Returns null for a key the index
 * does not own (the row falls through to its structural slack cell).
 */
export function renderOrdersIndexCell(params: OrdersIndexCellParams): ReactNode {
  const { col, columns, rule, facts, select } = params;
  if (col.key !== 'select' && col.key !== 'fulfillment' && !col.key.startsWith('status:')) return null;
  const gutter = col.key === 'select';
  const frozenEdge =
    col.frozen && [...columns].reverse().find((c) => c.frozen)?.key === col.key ? true : undefined;
  const className = cn(
    gridDataCellClass(col, {
      rule,
      inset: gutter ? 'none' : 'cell',
      frozenClass: LEDGER_GRID_FROZEN_CELL,
    }),
    'overflow-hidden',
    gutter && 'relative items-stretch p-0',
  );
  const style: CSSProperties = {
    height: ORDERS_INDEX_ROW_PX,
    ...(col.frozen ? { left: gridFrozenLeft(columns, col.key) } : null),
  };

  if (gutter) {
    const rail = facts.view.edgeMark ?? facts.view.importMark;
    return (
      <div
        data-col="select"
        data-select-gutter
        data-edge-mark-host=""
        data-frozen-edge={frozenEdge}
        className={className}
        style={style}
        onClick={select.onToggle ? (event) => event.stopPropagation() : undefined}
      >
        {rail ? <CompoundEdgeRail mark={rail} /> : null}
        {select.onToggle ? (
          <GridRowCheckbox
            checked={select.checked}
            onToggle={select.onToggle}
            label={select.label}
            chrome="always"
            // One line: the square sits on the text's centre line, not the top pin.
            className="items-center pt-0 pl-[3px]"
          />
        ) : null}
      </div>
    );
  }

  if (col.key === 'fulfillment') {
    return (
      <div
        data-col="fulfillment"
        data-frozen-edge={frozenEdge}
        className={cn(className, facts.childTitle && 'relative')}
        style={style}
      >
        <OrderIdentity facts={facts} fold={params.fold} />
      </div>
    );
  }

  return (
    <div data-col={col.key} data-frozen-edge={frozenEdge} className={className} style={style}>
      {slotBody(col, facts.values[col.key], params)}
    </div>
  );
}

/**
 * A MULTI-LINE order's row on the index — the order itself, one line, with
 * order sums (Total, Items, Partially packed n/m). Its lines fold under it,
 * collapsed by default. Checking it checks every line (Polaris subheader
 * `selectionRange`); a click opens the lead line's record.
 */
export function OrdersIndexGroupRow({
  columns,
  facts,
  checked,
  onToggle,
  lineCount,
  folded,
  onToggleFold,
  onActivate,
}: {
  columns: readonly OrdersQueueColumn[];
  facts: OrdersIndexRowFacts;
  checked: boolean | 'mixed';
  onToggle: () => void;
  lineCount: number;
  folded: boolean;
  onToggleFold: () => void;
  /** Row click (not the checkbox or the fold) — the host decides open vs toggle. */
  onActivate: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const noun = `${lineCount} line${lineCount === 1 ? '' : 's'}`;
  return (
    <div
      role="row"
      tabIndex={0}
      data-order-group-parent=""
      data-group-kind="order"
      data-marketplace-order-id={facts.orderId}
      aria-label={`Order ${facts.orderId} · ${noun}`}
      className={cn(
        'group/row cursor-pointer',
        ledgerGridRowShellClass(false),
        ledgerRowFillClass({ selected: checked === true, capabilities: { rowTriageFlags: false } }),
      )}
      style={{ gridTemplateColumns: gridTemplate(columns), minHeight: ORDERS_INDEX_ROW_PX }}
      onClick={onActivate}
    >
      {columns.map((col, i) => {
        const rule = i !== columns.length - 1;
        const painted = renderOrdersIndexCell({
          col,
          columns,
          rule,
          facts,
          select: {
            checked,
            onToggle: () => onToggle(),
            label: `${checked === true ? 'Deselect' : 'Select'} ${noun} in ${facts.orderId}`,
          },
          fold: { folded, onToggle: onToggleFold },
        });
        return painted ? (
          <Fragment key={col.key}>{painted}</Fragment>
        ) : (
          <div
            key={col.key}
            data-col={col.key}
            aria-hidden
            className={gridDataCellClass(col, { rule, inset: 'cell' })}
            style={{ height: ORDERS_INDEX_ROW_PX }}
          />
        );
      })}
    </div>
  );
}
