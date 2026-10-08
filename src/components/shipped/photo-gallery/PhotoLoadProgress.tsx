'use client';

import { useEffect, useState } from 'react';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { useImageLoadProgress } from './image-preload';

/** Time constant of the estimated fill used when a response does not state its size. */
const ESTIMATE_TAU_MS = 1500;
/** The estimated fill never claims more than this; the bar leaves when the photo lands. */
const ESTIMATE_CEILING = 0.9;

/**
 * How far the viewer's display image has downloaded — real bytes when the
 * response states its size, otherwise an estimate that eases toward 90%.
 */
export function PhotoLoadProgress({ url }: { url: string }) {
  const progress = useImageLoadProgress(url);
  const estimating = progress !== null && progress.total === null;
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!estimating) return;
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [estimating]);

  const fraction = !progress
    ? 0
    : progress.total
      ? progress.received / progress.total
      : ESTIMATE_CEILING * (1 - Math.exp(-Math.max(0, now - progress.startedAt) / ESTIMATE_TAU_MS));

  return (
    <ProgressBar
      current={Math.round(fraction * 100)}
      goal={100}
      ariaLabel="Loading photo"
      showPercentage={false}
      showRemaining={false}
      className="w-48 sm:w-64"
    />
  );
}
