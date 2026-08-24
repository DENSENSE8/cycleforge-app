/**
 * One active refinement pill on a filter bar.
 * Rescued out of `@/design-system/components/FilterRefinementBar` (Warehouse-OS).
 */
export interface FilterRefinement {
  id: string;
  label: string;
  onRemove: () => void;
  /** Optional tone-specific pill chrome (e.g. incoming status facet colors). */
  pillClassName?: string;
}
