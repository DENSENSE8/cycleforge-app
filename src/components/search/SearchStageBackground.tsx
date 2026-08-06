/**
 * SearchStageBackground — non-interactive work-surface fill behind the
 * centered `/search` find composition. Kept independent of find logic so the
 * body can later swap to a placeholder, illustration, or custom backdrop
 * without touching {@link SearchFindStage} behavior.
 *
 * Mount as the first child of a `relative` stage host so DOM order paints it
 * behind the content column (no z-index inventing).
 */

import { AppSurfaceFill } from '@/design-system/components/AppSurfaceFill';

export function SearchStageBackground() {
  return <AppSurfaceFill tone="canvas" />;
}
