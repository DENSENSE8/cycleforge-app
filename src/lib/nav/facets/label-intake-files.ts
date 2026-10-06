/**
 * Labels & docs › Bulk (`label-intake.uploads`, the file list) sidebar
 * facets: Print status (Not printed · Partly printed · Printed; absence =
 * All). Counts are the list's OWN statement (`countPrintFiles`, the
 * `/api/shipping/label-intake/files` read with the page skipped), counted
 * under every OTHER filter (Find, both date windows) — never a second
 * predicate. Params parse exactly as the list route parses them.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import {
  PRINT_FILE_PRINTED_FROM_PARAM,
  PRINT_FILE_PRINTED_TO_PARAM,
  PRINT_FILE_QUERY_PARAM,
  PRINT_FILE_SORT_PARAM,
  PRINT_FILE_STATUS_LABEL,
  PRINT_FILE_STATUS_PARAM,
  PRINT_FILE_STATUSES,
  PRINT_FILE_UPLOADED_FROM_PARAM,
  PRINT_FILE_UPLOADED_TO_PARAM,
  printFileQuerySchema,
  type PrintFileParsedQuery,
  type PrintFileQueue,
} from '@/lib/label-prints/print-file-contracts';

type ParamReader = Pick<URLSearchParams, 'get'>;
export type PrintFileCountReader = (query: PrintFileParsedQuery) => Promise<PrintFileQueue['counts']>;

/** The list's own params — the facets request also carries `context` / `view`, which the list never reads. */
const LIST_PARAMS = [
  PRINT_FILE_STATUS_PARAM,
  PRINT_FILE_SORT_PARAM,
  PRINT_FILE_QUERY_PARAM,
  PRINT_FILE_UPLOADED_FROM_PARAM,
  PRINT_FILE_UPLOADED_TO_PARAM,
  PRINT_FILE_PRINTED_FROM_PARAM,
  PRINT_FILE_PRINTED_TO_PARAM,
] as const;

export async function labelIntakeFilesFacets(params: ParamReader, readCounts: PrintFileCountReader): Promise<NavFacetsResponse> {
  const status = NAV_FACET_GROUPS['label-intake.uploads'][0]!;
  const own: Record<string, string> = {};
  for (const key of LIST_PARAMS) {
    const value = params.get(key);
    if (value) own[key] = value;
  }
  const parsed = printFileQuerySchema.safeParse(own);
  if (!parsed.success) {
    return { context: 'label-intake.uploads', total: 0, groups: [{ id: status.id, label: status.label, param: status.param, options: [] }] };
  }
  const counts = await readCounts(parsed.data);
  const printing = parsed.data.printing;
  return {
    context: 'label-intake.uploads',
    // The list's total under every filter, the status included.
    total: printing ? counts[printing] : counts.all,
    groups: [
      {
        id: status.id,
        label: status.label,
        param: status.param,
        options: PRINT_FILE_STATUSES.map((value) => ({ value, label: PRINT_FILE_STATUS_LABEL[value], count: counts[value] })),
      },
    ],
  };
}
