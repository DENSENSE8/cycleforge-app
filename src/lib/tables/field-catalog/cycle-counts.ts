/** Cycle-counts field catalog — the bindable facts of ONE cycle-count campaign. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const CYCLECOUNTS_FIELD_CATALOG: FieldCatalog = [
  { id: 'cycle-counts.id', family: 'cycle-counts', label: 'Campaign', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'cycle-counts.name', family: 'cycle-counts', label: 'Name', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'name' } },
  { id: 'cycle-counts.status', family: 'cycle-counts', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'cycle-counts.tol', family: 'cycle-counts', label: 'Tol', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'varianceTol' } },
  { id: 'cycle-counts.lines', family: 'cycle-counts', label: 'Lines', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'totalLines' } },
  { id: 'cycle-counts.counted', family: 'cycle-counts', label: 'Counted', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'countedLines' } },
  { id: 'cycle-counts.review', family: 'cycle-counts', label: 'Review', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'pendingReviewLines' } },
  { id: 'cycle-counts.approved', family: 'cycle-counts', label: 'Approved', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'approvedLines' } },
  { id: 'cycle-counts.created', family: 'cycle-counts', label: 'Created', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'createdAt' } },
  { id: 'cycle-counts.created_by', family: 'cycle-counts', label: 'By', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'createdByName' } },
];

/** The PRODUCT default: */
export const CYCLECOUNTS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'cycle-counts.id',
  statusBindings: [
    { fieldId: 'cycle-counts.lines' },
    { fieldId: 'cycle-counts.counted' },
    { fieldId: 'cycle-counts.review' },
    { fieldId: 'cycle-counts.approved' },
  ],
  subtitleBindings: [{ fieldId: 'cycle-counts.tol' }],
  amountFieldId: null,
};

export const CYCLECOUNTS_TABLE_LAYOUT_ID = 'cycle-counts';
