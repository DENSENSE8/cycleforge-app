/**
 * Facet arithmetic — pure. The facets SQL returns one row per combination of
 * facet dimension values with its row count (`n`); everything else happens
 * here, so the rule "an option's count is the list total you get by picking
 * it" is one function and is tested without a database:
 *
 * - `total` = rows matching EVERY active filter (the list's total);
 * - a group's option count = rows matching every OTHER group's active filter
 *   AND that option (a group never narrows its own options).
 */

export interface FacetCombo {
  n: number;
}

export interface FacetDimension<Row extends FacetCombo> {
  groupId: string;
  label: string;
  param: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  matches(row: Row, value: string): boolean;
}

export interface ComputedFacetGroup {
  id: string;
  label: string;
  param: string;
  options: Array<{ value: string; label: string; count: number }>;
}

/** Active value per group id; `null` = the group's param is unset. */
export type ActiveFacetFilters = Readonly<Record<string, string | null>>;

export function computeFacets<Row extends FacetCombo>(
  rows: readonly Row[],
  dimensions: ReadonlyArray<FacetDimension<Row>>,
  active: ActiveFacetFilters,
): { total: number; groups: ComputedFacetGroup[] } {
  const passes = (row: Row, skipGroupId: string | null) =>
    dimensions.every((d) => {
      if (d.groupId === skipGroupId) return true;
      const value = active[d.groupId];
      return value == null || d.matches(row, value);
    });

  let total = 0;
  for (const row of rows) if (passes(row, null)) total += row.n;

  const groups = dimensions.map((d) => {
    const pool = rows.filter((row) => passes(row, d.groupId));
    return {
      id: d.groupId,
      label: d.label,
      param: d.param,
      options: d.options.map((o) => ({
        value: o.value,
        label: o.label,
        count: pool.reduce((sum, row) => (d.matches(row, o.value) ? sum + row.n : sum), 0),
      })),
    };
  });
  return { total, groups };
}
