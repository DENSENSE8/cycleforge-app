/** Static registration for a DataTable family. */

import type {
  FieldCatalog,
  FieldDef,
  FieldDisplayType,
} from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export type DataTableChromeKey = 'fulfillment' | 'item' | 'dates' | 'state';

export interface DataTableChromeBinding {
  field?: string;
  label?: string;
  gridLabel?: string;
  displayType?: FieldDisplayType;
  sortable?: false;
}

export const DATA_TABLE_ID_HEADER_WORD = 'Id' as const;

export interface DataTableIdentityBinding {
  field?: string;
}

export interface DataTableFamily {
  tableId: string;
  catalog: FieldCatalog;
  productLayout: DataTableColumnLayout;
  paintMorph: DataTableColumnLayout['morph'];
  identityFallbackLabel: string;
  bandLabels?: { status?: string; subtitle?: string };
  chrome?: { fulfillment?: DataTableIdentityBinding } & Partial<
    Record<Exclude<DataTableChromeKey, 'fulfillment'>, DataTableChromeBinding>
  >;
}

export function dataTableChromeField(
  family: DataTableFamily,
  key: DataTableChromeKey,
): FieldDef | null {
  if (key === 'fulfillment') {
    return dataTableIdentityField(family, family.productLayout);
  }
  const binding = family.chrome?.[key];
  if (binding?.sortable === false || !binding?.field) return null;
  return family.catalog.find((field) => field.id === binding.field) ?? null;
}

export function dataTableIdentityField(
  family: DataTableFamily,
  layout: DataTableColumnLayout,
): FieldDef | null {
  const fieldId = family.chrome?.fulfillment?.field ?? layout.identityFieldId;
  return family.catalog.find((field) => field.id === fieldId) ?? null;
}
