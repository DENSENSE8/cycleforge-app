import { Suspense } from 'react';
import { ReviewWorkspace } from '@/features/review/ReviewWorkspace';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';

/** `/review` — the all-in-one Review station (WS-REVIEW). */
export default function ReviewPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <Suspense fallback={null}>
        <ReviewWorkspace />
      </Suspense>
    </>
  );
}
