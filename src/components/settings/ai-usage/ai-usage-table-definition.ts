/**
 * `settings.ai-usage` — the ai usage table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 */

import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { AIUSAGE_COMPOUND_COLUMNS, type AiUsageGridColumn } from './ai-usage-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  AIUSAGE_GRID_CAPABILITIES,
  makeAiUsageGridDescriptor,
} from './ai-usage-grid-descriptor';

export const AIUSAGE_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.ai-usage',
  tableId: 'ai-usage',
  entityFamily: 'ai-usage',
  cellMapKey: 'ai-usage',
  ariaLabel: 'AI usage',
  testId: 'ai-usage-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: AIUSAGE_GRID_CAPABILITIES,
  columns: AIUSAGE_COMPOUND_COLUMNS,
});

export const AIUSAGE_TABLE_BINDING: TableSurfaceBinding<AiUsageTableRow, AiUsageGridColumn> = {
  definition: AIUSAGE_TABLE_DEFINITION,
  columns: AIUSAGE_COMPOUND_COLUMNS,
  makeDescriptor: makeAiUsageGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'This surface has no record plane — the row IS the fact, and its verbs run from the row menu.',
  },
};
