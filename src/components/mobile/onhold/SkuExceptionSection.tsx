import type { ReactNode } from 'react';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import { cn } from '@/utils/_cn';

/** One labelled band of the SKU exception record — eyebrow on the ground, body below. */
export function SkuExceptionSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={cn('px-3 pb-1 pt-3 text-role-eyebrow text-text-soft', STATION_EYEBROW_CLASS)}>
        {heading}
      </h2>
      {children}
    </section>
  );
}
