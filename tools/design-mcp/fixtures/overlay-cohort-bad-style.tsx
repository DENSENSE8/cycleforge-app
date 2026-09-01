/**
 * Fixture — inline style that is NOT cohort-law (color literal).
 * Outside OVERLAY_COHORT_WORKSPACES so ds_critique must still flag style={{.
 */
export function OverlayCohortBadStyleFixture() {
  return <div style={{ color: 'red' }}>bad</div>
}
