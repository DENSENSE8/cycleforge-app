import './globals.css';
import { ShellProviders } from '@/shell/ShellProviders';
import { ShellRoot } from '@/shell/ShellRoot';
import { SHELL_THEME_BOOT_SCRIPT } from '@/shell/theme-boot';
import { getInitialAuthUser } from '@/lib/auth/server-session';
import { PRODUCT_NAME } from '@/lib/branding/constants';
import { cfSans, ibmPlexMono, ibmPlexSansCondensed } from '@/lib/fonts';

/**
 * ROOT LAYOUT — mounts the shell and nothing else.
 *
 * What it deliberately no longer mounts, and why: the nine page-scoped
 * providers (FBA workspace, studio workspace, activity inbox, staff switcher,
 * assistant, Ably, tooltip, step-up, UI mode) all belonged to page trees that
 * no longer exist, and each reached into `@/design-system`. The shell's own
 * stack is `ShellProviders` — react-query and auth. Everything else a tile or
 * a tool needs, that tile or tool brings.
 *
 * The three faces stay on `<html>` as CSS variables and are consumed by
 * `--font-sans` / `--font-condensed` / `--font-mono` in `shell/tokens.css`.
 * They are load-bearing, not decoration: every condensed technical label in
 * this design (rail labels, badges, table headers, pipeline steps, tile type
 * chips) is illegible at 9–11px in a non-condensed fallback, and the mono
 * column loses its tabular metrics. The prototype named all three and loaded
 * none of them for months; `next/font` self-hosts them here, so there is no
 * external font host and no CSP question.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUser = await getInitialAuthUser();
  // Signed-out first paint: platform brand only. Signed-in: the workspace
  // takes over the tab.
  const documentTitle = initialUser ? initialUser.organizationName : PRODUCT_NAME;

  return (
    // suppressHydrationWarning: SHELL_THEME_BOOT_SCRIPT stamps `data-theme` on
    // <html> before hydration to avoid a theme flash, so the SSR markup
    // (no attribute) intentionally differs from the booted DOM. The flag is
    // scoped to this one element's attributes.
    <html
      lang="en"
      className={`${cfSans.variable} ${ibmPlexSansCondensed.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <title>{documentTitle}</title>
        <meta name="description" content={`${PRODUCT_NAME} — Warehouse OS`} />
        <link rel="icon" type="image/png" href="/favicon.png" />
        {/* PWA — the floor runs this installed on mounted tablets. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content={PRODUCT_NAME} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={PRODUCT_NAME} />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Cover the notch; never zoom on input focus — a scanner-driven
            field that zooms the viewport takes the operator off the carton. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
        />
        <script dangerouslySetInnerHTML={{ __html: SHELL_THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ShellProviders initialUser={initialUser}>
          <ShellRoot>{children}</ShellRoot>
        </ShellProviders>
      </body>
    </html>
  );
}
