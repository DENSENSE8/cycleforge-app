export {
  AUTO_COLLAPSE_INITIAL,
  AUTO_COLLAPSE_SCROLL_PX,
  autoCollapseReducer,
} from './auto-collapse';
export type { AutoCollapseEvent, AutoCollapseState } from './auto-collapse';
export { useAutoCollapse } from './useAutoCollapse';
export type { AutoCollapseController } from './useAutoCollapse';
/**
 * One altitude down from the band: which LINE inside a band shows its body.
 * Same shape (pure reducer + a React binding the host owns), so a surface never
 * grows a second disclosure mechanism for rows.
 */
export {
  LINE_COLLAPSE_INITIAL,
  isLineExpanded,
  lineCollapseReducer,
} from './line-collapse';
export type { LineCollapseEvent, LineCollapseState } from './line-collapse';
export { useLineCollapse } from './useLineCollapse';
export type { LineCollapseController } from './useLineCollapse';
/**
 * Between the two: which BAND is open inside a centre that is not fully
 * yielding its column. {@link StationBandStack} is the one component that
 * renders them, because only something that owns every band can know they are
 * all closed and offer Expand all on the first header.
 */
export {
  BAND_COLLAPSE_INITIAL,
  bandCollapseReducer,
  isBandOpen,
} from './band-collapse';
export type { BandCollapseEvent, BandCollapseState } from './band-collapse';
export { useBandCollapse } from './useBandCollapse';
export type { BandCollapseController } from './useBandCollapse';
export { StationBandStack } from './StationBandStack';
export type { StationBand } from './StationBandStack';
/**
 * The centre block face. Both consumers used to import it by path because the
 * barrel did not carry it, which is how a page-local fork (`SectionLabel` in
 * `CartonInspectionPage`) went unnoticed for as long as it did.
 */
export {
  StationCollapsibleBlock,
  StationBlockLabel,
  StationCollapseAllAction,
  StationExpandAllAction,
} from './StationCollapsibleBlock';
