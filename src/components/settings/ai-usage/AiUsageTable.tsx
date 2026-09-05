'use client';

/**
 * The AI-usage page MOUNT — spreads the feed onto the one table.
 *
 * A client island because the engine's header sort, search and Fields picker are
 * interactive; `/settings/ai` is a React Server Component and keeps the query,
 * the tenant scope and the window. The page supplies no chrome.
 */

import { DataTable } from '@/components/tables/DataTable';
import { useAiUsageSpreadsheet } from '@/components/settings/ai-usage/useAiUsageSpreadsheet';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';

export function AiUsageTable({ rows }: { rows: readonly AiUsageTableRow[] }) {
  const sheet = useAiUsageSpreadsheet({
    rows,
    emptyMessage:
      'No AI usage recorded in this window yet — usage appears here as staff search.',
  });
  return <DataTable {...sheet} totalCount={rows.length} />;
}
