/** My-Day field catalog — the bindable Today-triage facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const MY_DAY_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'my-day.task',
    family: 'my-day',
    label: 'Task',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'id' },
  },
  {
    id: 'my-day.lane',
    family: 'my-day',
    label: 'Lane',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'lane' },
  },
  // The coarse category of a record the `record` track already names precisely,
  // so on a narrow viewport it is the track that costs most and says least. The
  // old `tier: 'optional'`, expressed as an unbound fact.
  {
    id: 'my-day.queue',
    family: 'my-day',
    label: 'Queue',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'queueLabel' },
  },
  {
    id: 'my-day.record',
    family: 'my-day',
    label: 'Record',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'recordLabel' },
  },
  {
    id: 'my-day.due',
    family: 'my-day',
    label: 'Due',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'deadlineAt' },
  },
  // NULL on every interrupt — only work orders carry a lifecycle — so on an
  // interrupt-heavy day a bound Status is a half-empty ruled band. Unbound for
  // that reason, not to hit a number.
  {
    id: 'my-day.status',
    family: 'my-day',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
];

/** The PRODUCT default My-Day layout — visual parity with the retired hand model's CORE view (`select · task · lane · record · due`): */
export const MY_DAY_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'my-day.task',
  statusBindings: [
    { fieldId: 'my-day.lane' },
    { fieldId: 'my-day.record' },
    { fieldId: 'my-day.due' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Home · Today entry. */
export const MY_DAY_TABLE_LAYOUT_ID = 'my-day';
