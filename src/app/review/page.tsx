import { Suspense } from 'react';
import { ReviewWorkspace } from '@/features/review/ReviewWorkspace';

/**
 * `/review` — the all-in-one Review station (WS-REVIEW). `?mode=packer` is the
 * sole mode at birth; tech / receiving / shipping review land as sibling modes
 * on this same page. The queue navigator is the shell's route-keyed sidebar
 * (ReviewSidebarPanel); this page renders the Workbench right pane. Desktop-only
 * (see MOBILE_RESTRICTED_SIDEBAR_IDS). Plan §4.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewWorkspace />
    </Suspense>
  );
}
