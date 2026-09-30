'use client';

/**
 * The local pickup as the shared `RecordModel` (owner 2026-09-29, Step 3): one
 * purchase we collected ourselves, many items, one `receiving_line` each. The
 * external half is the pickup (date, collector, payment), never a carrier; the
 * internal ladder is `PICKUP_LIFECYCLE` (Ordered → Collected → Unboxed →
 * Graded → Tested → Put away) with k/N per step. The desk (`/pickup`) and the
 * phone (`/m/receiving/pickup`) read this one adapter, so the identifier, the
 * status word and the next step are the same everywhere.
 */

import type { ReactNode } from 'react';
import { FileText, MapPin, PackageOpen, Printer, ShieldCheck, Star, Warehouse } from '@/components/Icons';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { RecordFacts } from '@/design-system/components/record-ledger/RecordView';
import type { RecordFact, RecordModel, RecordModelItem } from '@/design-system/components/record-ledger/record-model';
import { Button, Checkbox } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { PICKUP_LIFECYCLE, STATE_TONE_CLASSES, type PickupLifecycleState, type StateName } from '@/design-system/tokens/lifecycle';
import { conditionLabel } from '@/lib/conditions';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import type { TestVerdict } from '@/lib/tech/recordTestVerdict';
import { formatDateKeyMedium } from '@/utils/date';
import { cn } from '@/utils/_cn';
import type { PickupCardModel } from './pickup-card-model';
import {
  pickupItemMatches,
  pickupLadder,
  pickupLineGrade,
  pickupText as text,
  pickupUnits,
  plural,
  type PickupItemFilter,
  type PickupUnitView,
} from './pickup-ladder';
import type { PickupLine } from './pickup-lines';

const STEP_ICON: Readonly<Record<PickupLifecycleState, ReactNode>> = {
  ordered: <FileText aria-hidden />,
  collected: <MapPin aria-hidden />,
  unboxed: <PackageOpen aria-hidden />,
  graded: <Star aria-hidden />,
  tested: <ShieldCheck aria-hidden />,
  putAway: <Warehouse aria-hidden />,
};

const FILTER_FACE: readonly { id: PickupItemFilter; label: string; tone: StateName }[] = [
  { id: 'all', label: 'All', tone: 'neutral' },
  { id: 'grade', label: 'To grade', tone: PICKUP_LIFECYCLE.graded.tone },
  { id: 'test', label: 'To test', tone: PICKUP_LIFECYCLE.tested.tone },
  { id: 'failed', label: 'Failed', tone: 'danger' },
];

/** What the open record's controls do — absent on a read-only reading (a phone card). */
export interface PickupRecordUi {
  filter: PickupItemFilter;
  onFilter: (filter: PickupItemFilter) => void;
  /** Checked pickup item ids — the batch verbs' scope. */
  selected: ReadonlySet<number>;
  onToggle: (itemId: number) => void;
  onSelectAll: (itemIds: readonly number[]) => void;
  /** The receiving line whose labels are printing. */
  printingLineId: number | null;
  onPrintLine: (lineId: number) => void;
  /** The serial unit whose verdict is saving. */
  verdictUnitId: number | null;
  onVerdict: (serialUnitId: number, verdict: TestVerdict) => void;
  /** The Tested step's in-line tester — every untested line at once. */
  onAssignTester: (staffId: number | null) => Promise<unknown>;
  refresh: () => void;
  /** Phone: open the camera from the item tile. */
  capturePhotos?: boolean;
  photos: ReactNode;
}

const QC_FACE: Readonly<Record<ReceivingUnitStageFactView['qc_state'], { label: string; tone: StateName }>> = {
  PENDING: { label: 'Untested', tone: 'neutral' },
  TEST_AGAIN: { label: 'Retest', tone: 'warning' },
  PASSED: { label: 'Passed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

function Chip({ tone, children, testId }: { tone: StateName; children: ReactNode; testId?: string }) {
  return (
    <span
      className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-mode-pill px-2 text-role-caption font-semibold', STATE_TONE_CLASSES[tone].pill)}
      data-testid={testId}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', STATE_TONE_CLASSES[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

const VERDICTS: readonly { verdict: TestVerdict; label: string; variant: 'success' | 'secondary' | 'danger' }[] = [
  { verdict: 'PASS', label: 'Pass', variant: 'success' },
  { verdict: 'TESTING_FAILED', label: 'Fail', variant: 'danger' },
  { verdict: 'TEST_AGAIN', label: 'Retest', variant: 'secondary' },
];

/** One unit on its item: identity, grade · QC · label chips, and the verdict when it can take one. */
function PickupUnitRow({ unit, ui }: { unit: PickupUnitView; ui: PickupRecordUi | null }) {
  const qc = QC_FACE[unit.qc];
  const serialUnitId = unit.fact?.serial_unit_id ?? null;
  const open = unit.qc === 'PENDING' || unit.qc === 'TEST_AGAIN';
  const busy = ui != null && serialUnitId != null && ui.verdictUnitId === serialUnitId;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-mode-fact py-1.5"
      data-testid="pickup-record-unit"
      data-qc={unit.qc}
      data-label={unit.labelPrinted ? 'printed' : 'missing'}
      data-graded={unit.grade ? '' : undefined}
    >
      <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 basis-full truncate @sm:basis-0')} title={unit.fact?.serial ? `SN ${unit.fact.serial}` : undefined}>
        {unit.identity}
      </span>
      <Chip tone={unit.grade ? 'info' : 'warning'} testId="pickup-unit-grade">
        {unit.grade ? conditionLabel(unit.grade, 'label') : 'Ungraded'}
      </Chip>
      <Chip tone={qc.tone} testId="pickup-unit-qc">
        {qc.label}
      </Chip>
      <Chip tone={unit.labelPrinted ? 'success' : 'warning'} testId="pickup-unit-label">
        {unit.labelPrinted ? 'Labelled' : 'No label'}
      </Chip>
      {unit.fact?.primary_support_ticket_id ? <Chip tone="info">Ticket #{unit.fact.primary_support_ticket_id}</Chip> : null}
      {ui && open && serialUnitId != null ? (
        <span className="flex shrink-0 gap-1" role="group" aria-label={`Verdict for ${unit.identity}`}>
          {VERDICTS.filter((verb) => unit.qc !== 'TEST_AGAIN' || verb.verdict !== 'TEST_AGAIN').map((verb) => (
            <Button
              key={verb.verdict}
              type="button"
              size="sm"
              variant={verb.variant}
              disabled={ui.verdictUnitId != null}
              loading={busy}
              onClick={() => ui.onVerdict(serialUnitId, verb.verdict)}
              data-testid={`pickup-unit-verdict-${verb.verdict.toLowerCase()}`}
            >
              {verb.label}
            </Button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Under the item's ruler: the batch checkbox, the item's label print, then one row per unit. */
function PickupItemUnits({ row, units, ui }: { row: PickupLine; units: readonly PickupUnitView[]; ui: PickupRecordUi | null }) {
  const lineId = row.receiving_line_id ?? null;
  const printed = units.some((unit) => unit.labelPrinted);
  return (
    <div className="flex min-w-0 flex-col pb-2" data-testid="pickup-record-item-units" data-item-id={row.id}>
      {ui ? (
        <div className="flex min-w-0 items-center gap-2 pb-1.5">
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-role-caption font-medium text-mode-muted">
            <Checkbox
              checked={ui.selected.has(row.id)}
              onCheckedChange={() => ui.onToggle(row.id)}
              aria-label={`Select ${row.product_title || row.sku || 'item'}`}
              data-testid="pickup-record-item-select"
            />
            Select
          </label>
          <span className="flex-1" />
          {lineId ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<Printer aria-hidden />}
              loading={ui.printingLineId === lineId}
              disabled={ui.printingLineId != null}
              onClick={() => ui.onPrintLine(lineId)}
              data-testid="pickup-print-unit-labels"
            >
              {printed ? 'Reprint labels' : 'Print labels'}
            </Button>
          ) : (
            <span className="text-role-caption text-mode-warn">Not on a receiving line yet</span>
          )}
        </div>
      ) : null}
      {units.map((unit) => (
        <PickupUnitRow key={unit.key} unit={unit} ui={ui} />
      ))}
    </div>
  );
}

/** One pickup item on the shared ruler. `collected`: the goods are in hand, so every unit counts received. */
function pickupItem(row: PickupLine, ui: PickupRecordUi | null, collected: boolean): RecordModelItem {
  const units = pickupUnits(row);
  const qty = Math.max(1, Number(row.quantity) || 1);
  const total = Number(row.total_price);
  const floorGrade = pickupLineGrade(row) ?? units.map((unit) => unit.grade).find(Boolean) ?? null;
  const boughtAs = text(row.condition_grade);
  const note = text(row.missing_parts_note) ?? text(row.condition_note);
  const facts: RecordFact[] = [
    ...(boughtAs && floorGrade && boughtAs !== floorGrade ? [{ label: 'Bought as', value: conditionLabel(boughtAs, 'label') }] : []),
    ...(text(row.parts_status) ? [{ label: 'Parts', value: row.parts_status === 'MISSING_PARTS' ? 'Missing parts' : row.parts_status }] : []),
    ...(note ? [{ label: 'Notes', value: note, wide: true }] : []),
  ];
  return {
    key: `pickup-item:${row.id}`,
    title: text(row.product_title) ?? text(row.sku) ?? 'Unidentified item',
    sku: text(row.line_sku) ?? text(row.sku),
    skuCatalogId: row.sku_catalog_id ?? null,
    photoUrl: text(row.image_url),
    received: collected ? qty : 0,
    expected: qty,
    short: false,
    condition: floorGrade || boughtAs ? conditionLabel(floorGrade ?? boughtAs, 'label') : null,
    conditionGrade: floorGrade ?? boughtAs,
    listing: null,
    serials: [],
    serialNote: null,
    cost: Number.isFinite(total) ? { unit: total / qty, qty, total } : null,
    facts,
    extra: <PickupItemUnits row={row} units={units} ui={ui} />,
    current: false,
  };
}

/** The Items header: All · To grade · To test · Failed (counted in items), and select-all over what is shown. */
function PickupItemsHeader({ rows, ui }: { rows: readonly PickupLine[]; ui: PickupRecordUi }) {
  const shown = rows.filter((row) => pickupItemMatches(row, ui.filter)).map((row) => row.id);
  const chips: StatusChip<PickupItemFilter>[] = FILTER_FACE.map((chip) => ({
    ...chip,
    count: rows.filter((row) => pickupItemMatches(row, chip.id)).length,
  }));
  const allShownChecked = shown.length > 0 && shown.every((id) => ui.selected.has(id));
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="pickup-record-items-header">
      <span className="min-w-0 max-w-[28rem]">
        <StatusChipRail
          chips={chips}
          active={new Set(ui.filter === 'all' ? [] : [ui.filter])}
          onToggle={(key) => ui.onFilter(key === ui.filter ? 'all' : key)}
          onReset={() => ui.onFilter('all')}
          label="Filter items"
          testId="pickup-record-filters"
        />
      </span>
      <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-role-caption font-medium text-mode-muted">
        <Checkbox
          checked={allShownChecked}
          disabled={shown.length === 0}
          onCheckedChange={() => ui.onSelectAll(allShownChecked ? [] : shown)}
          aria-label="Select every shown item"
          data-testid="pickup-record-select-all"
        />
        {ui.selected.size > 0 ? `${ui.selected.size} selected` : 'Select all'}
      </label>
    </span>
  );
}

/** The external half: the pickup itself. */
function PickupNode({ order }: { order: PickupCardModel }) {
  return (
    <div className="min-w-0 py-1" data-testid="pickup-record-external">
      <RecordFacts facts={pickupMovement(order)} />
    </div>
  );
}

function paymentFace(order: PickupCardModel): string | null {
  const method = text(order.paymentMethod);
  return method ? method.charAt(0) + method.slice(1).toLowerCase().replace(/_/g, ' ') : null;
}

function pickupMovement(order: PickupCardModel): RecordFact[] {
  const payment = paymentFace(order);
  return [
    {
      label: 'Date',
      value: order.pickupDate ? formatDateKeyMedium(order.pickupDate, { weekday: 'short', withYear: true }) : <span className="text-mode-muted">Not recorded</span>,
    },
    ...(text(order.line.created_by_name) ? [{ label: 'Collected by', value: order.line.created_by_name }] : []),
    ...(payment ? [{ label: 'Payment', value: payment }] : []),
    ...(order.line.receiving_id ? [{ label: 'Carton', value: <span className={RECORD_ID_CLASS}>{order.line.receiving_id}</span> }] : []),
  ];
}

/**
 * One local pickup as the shared record. `ui` wires the open record's
 * controls; without it (a phone card, a peek) the model reads the same words
 * with no controls.
 */
export function pickupRecordModel(order: PickupCardModel, ui: PickupRecordUi | null = null): RecordModel {
  const rows = order.rows;
  const line = order.line;
  const ladder = pickupLadder(order);
  const shown = ui ? rows.filter((row) => pickupItemMatches(row, ui.filter)) : rows;
  const payment = paymentFace(order);
  const paid = order.paidAmountCents == null ? null : order.paidAmountCents / 100;
  const po = text(line.po_number);
  const reference = text(line.reference_number);
  const testLines = rows.filter((row) => row.receiving_line_id && pickupItemMatches(row, 'test'));
  const testers = [...new Set(testLines.map((row) => row.assigned_tech_id ?? null))];
  return {
    key: `pickup:${order.lead.orderId}`,
    title: {
      // The card's identity word (PO, else LCPU id) — card and header read one word.
      ref: order.identity,
      platform: null,
      channel: 'Local pickup',
      date: order.pickupDate
        ? {
            label: formatDateKeyMedium(order.pickupDate, { weekday: 'none' }),
            tip: `Picked up ${formatDateKeyMedium(order.pickupDate, { weekday: 'short', withYear: true })}`,
          }
        : null,
    },
    status: ladder.status,
    alerts: ladder.failed > 0 ? [{ key: 'failed', label: `${plural(ladder.failed, 'unit')} failed QC — resolve before put away` }] : [],
    exception: null,
    internalLabel: 'Receiving',
    flow: 'inbound',
    movementTitle: 'Pickup',
    dates: [
      ...(order.pickupDate ? [{ label: 'Picked up', value: formatDateKeyMedium(order.pickupDate, { weekday: 'none' }) }] : []),
    ],
    promise: null,
    external: { node: <PickupNode order={order} /> },
    internal: ladder.steps.map((step) => ({ ...step, icon: STEP_ICON[step.key] })),
    stepAssign:
      ui && testLines.length > 0
        ? {
            stepKey: 'tested',
            label: 'tester',
            role: 'technician',
            staffId: testers.length === 1 ? testers[0]! : null,
            onCommit: ui.onAssignTester,
          }
        : null,
    items: shown.map((row) => pickupItem(row, ui, ladder.steps.some((step) => step.key === 'collected' && step.state === 'done'))),
    itemsHeader: ui ? <PickupItemsHeader rows={rows} ui={ui} /> : undefined,
    itemsNotice:
      rows.length === 0 ? 'No items on this pickup yet.' : shown.length === 0 ? 'No item matches this filter.' : null,
    itemsSummary: plural(ladder.units, 'unit'),
    serials: [],
    expectedUnits: undefined,
    notes: [],
    staffNote: null,
    price: {
      rows: [
        { label: 'Items', value: order.totalValue },
        { label: payment ? `Paid · ${payment}` : 'Paid', value: paid },
      ],
    },
    currency: 'USD',
    refresh: ui?.refresh ?? null,
    capturePhotos: ui?.capturePhotos,
    photos: ui?.photos ?? null,
    party: [
      { label: 'Seller', value: order.customer ?? <span className="text-mode-muted">Unknown</span> },
      ...(reference ? [{ label: 'Reference #', value: <span className={cn(RECORD_ID_CLASS, 'select-all')}>{reference}</span> }] : []),
      ...(po ? [{ label: 'Zoho PO', value: <span className={cn(RECORD_ID_CLASS, 'select-all')}>{po}</span> }] : []),
      ...(text(line.zoho_status) ? [{ label: 'PO status', value: line.zoho_status }] : []),
    ],
    movement: pickupMovement(order),
    loadFailed: null,
  };
}
