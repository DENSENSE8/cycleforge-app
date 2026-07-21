import { Suspense } from 'react';
import { ReviewWorkspace } from '@/features/review/ReviewWorkspace';

/**
 * `/review` — the all-in-one Review station (WS-REVIEW). Modes: Packing
 * (default, photo/item decide) · Pairing (serial/SKU allocate). The sidebar is
 * slim chrome; the Workbench table + detail overlay own the map. Desktop-only
 * (see MOBILE_RESTRICTED_SIDEBAR_IDS). Plan §4.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewWorkspace />
    </Suspense>
  );
}
