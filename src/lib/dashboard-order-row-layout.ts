/** Dashboard / queue row shell classes — Shipped / Receiving / walk-in rows. */

/** Legacy two-zone shell — Shipped / Receiving / walk-in. */
export function dashboardOrderRowShellClass(isMobile: boolean): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2';
}

export function dashboardOrderRowChipsClass(isMobile: boolean): string {
  const base = 'flex shrink-0 flex-wrap items-center gap-0.5';
  return isMobile
    ? `${base} w-full justify-end`
    : `${base} justify-end pr-1`;
}
