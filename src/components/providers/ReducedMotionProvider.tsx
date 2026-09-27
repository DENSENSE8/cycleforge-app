'use client';

import { MotionConfig } from '@/design-system/motion';

/** App-wide `prefers-reduced-motion` floor for every Motion `motion.*` component. */
export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
