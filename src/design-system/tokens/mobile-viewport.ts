/** One Next.js viewport declaration; never add a second manual meta tag. */
export const appViewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
} as const;

/**
 * iOS standalone-PWA viewport contract.
 *
 * The phone root and its top bar must remain in normal flow. WebKit 26 can
 * paint fixed/sticky layers at a different vertical offset from their hit-test
 * boxes, so `fixed inset-0` and `sticky top-0` are invalid for this chassis.
 *
 * The root deliberately inherits the document's stable 100% height instead of
 * measuring itself with `dvh`. In standalone iOS, dynamic viewport units can
 * settle after first paint and briefly leave an unpainted band at the bottom.
 * `html`, `body`, and this root therefore form one percentage-height chain;
 * safe-area padding is applied by the mobile shell inside that box.
 */
export const mobileAppRootClass =
  'relative flex h-full w-full min-h-0 flex-col overflow-hidden';

export const desktopAppRootClass =
  'fixed inset-0 flex min-h-0 flex-col overflow-hidden';

export function appRootClass(mobile: boolean): string {
  return mobile ? mobileAppRootClass : desktopAppRootClass;
}

export const mobileTopBarClass =
  'relative z-header flex h-[3.25rem] shrink-0 items-center border-b border-border-soft bg-surface-card/95 backdrop-blur-xl has-[[data-mobile-navigation-open=true]]:z-panel';
