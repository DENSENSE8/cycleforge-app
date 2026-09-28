'use client';

import { Badge } from '@/components/ui/badge';
import { recordedProcedureVersionIds } from '@/lib/qc/bench-client';
import { useQcProcedureVersion } from '@/lib/qc/use-qc-bench';

/**
 * The procedure version a unit's checklist runs on — beside the checklist. `results` are the unit's
 * checklist GET rows (their `procedure_version_id`); with none recorded it names the SKU's current
 * version. Renders nothing when the SKU has no published procedure.
 */
export function QcProcedureVersion({
  skuCatalogId,
  results,
}: {
  skuCatalogId: number | null;
  results: ReadonlyArray<{ procedure_version_id?: string | number | null }>;
}) {
  const label = useQcProcedureVersion(skuCatalogId, recordedProcedureVersionIds(results));
  if (!label) return null;
  return (
    <Badge variant="outline" data-testid="qc-procedure-version" title="QC procedure version">
      {label}
    </Badge>
  );
}
