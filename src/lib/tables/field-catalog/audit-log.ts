/** Audit-log field catalog — the bindable facts of ONE `audit_logs` row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const AUDITLOG_FIELD_CATALOG: FieldCatalog = [
  { id: 'audit-log.entity_id', family: 'audit-log', label: 'Entity id', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'entity_id' } },
  { id: 'audit-log.entity_type', family: 'audit-log', label: 'Entity', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'entity_type' } },
  { id: 'audit-log.action', family: 'audit-log', label: 'Action', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'action' } },
  { id: 'audit-log.source', family: 'audit-log', label: 'Source', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'source' } },
  { id: 'audit-log.actor', family: 'audit-log', label: 'Actor', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'actor_name', name: 'actor_name', value: 'actor_staff_id' } },
  { id: 'audit-log.actor_role', family: 'audit-log', label: 'Role', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'actor_role' } },
  { id: 'audit-log.when', family: 'audit-log', label: 'When', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'created_at' } },
  { id: 'audit-log.ip', family: 'audit-log', label: 'IP', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'ip_address' } },
];

/** The PRODUCT default: */
export const AUDITLOG_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'audit-log.entity_id',
  statusBindings: [
    { fieldId: 'audit-log.actor' },
    { fieldId: 'audit-log.ip' },
  ],
  subtitleBindings: [
    { fieldId: 'audit-log.source' },
    { fieldId: 'audit-log.actor_role' },
  ],
  amountFieldId: null,
};

export const AUDITLOG_TABLE_LAYOUT_ID = 'audit-log';
