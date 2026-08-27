export {
  AUTO_COLLAPSE_INITIAL,
  AUTO_COLLAPSE_SCROLL_PX,
  autoCollapseReducer,
} from './auto-collapse';
export type { AutoCollapseEvent, AutoCollapseState } from './auto-collapse';
export { useAutoCollapse } from './useAutoCollapse';
export type { AutoCollapseController } from './useAutoCollapse';
/**
 * The centre block face. Both consumers used to import it by path because the
 * barrel did not carry it, which is how a page-local fork (`SectionLabel` in
 * `CartonInspectionPage`) went unnoticed for as long as it did.
 */
export { StationCollapsibleBlock, StationBlockLabel } from './StationCollapsibleBlock';
