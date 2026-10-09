'use client';

import type { RefObject } from 'react';
import { motion } from '@/design-system/motion';

/** The phone's camera scan picture: the live feed, a target box and its sweeping line. */
export function ScanViewfinderFrame({
  videoRef,
  height,
  boxSize,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** CSS height of the feed (a viewport fraction, e.g. `20vh`). */
  height: string;
  /** Target box size classes. */
  boxSize: string;
}) {
  return (
    <div className="relative w-full overflow-hidden bg-blue-950" style={{ height }}>
      <video
        ref={videoRef as RefObject<HTMLVideoElement>}
        className="absolute inset-0 h-full w-full object-cover opacity-70 contrast-125"
        autoPlay
        playsInline
        muted
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={`relative ${boxSize} rounded-mode-control border-2 border-glass/40 bg-glass/5 backdrop-blur-[1px]`}>
          <motion.div
            animate={{ top: ['5%', '95%', '5%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-6 right-6 h-[2px] bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,1)]"
          />
        </div>
      </div>
    </div>
  );
}
