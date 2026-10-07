import 'server-only';

import { createHash } from 'node:crypto';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import { NAV_PAGE_DECLS } from './pages';
import { resolveNavContext } from './resolve';

const permissions = new Set<string>(ALL_PERMISSIONS);

/**
 * Fingerprint of what a `NavContext` is resolved from — the declarations plus
 * every page's resolved default context (so resolver logic counts, not only
 * the tables). The root layout stamps it on the document; a persisted sidebar
 * snapshot written under another fingerprint never paints
 * (`nav-context-snapshot.ts`), so a page that drops a control (a station's
 * Sort or Status row) cannot flash it from localStorage.
 */
export const NAV_CONTRACT = createHash('sha1')
  .update(JSON.stringify({ pages: NAV_PAGE_DECLS, facets: NAV_FACET_GROUPS }))
  .update(
    JSON.stringify(
      SIDEBAR_PAGE_NAV.map((page) => {
        const url = new URL(page.href, 'http://nav.local');
        return resolveNavContext({ pathname: url.pathname, params: url.searchParams, permissions, orgNav: null });
      }),
    ),
  )
  .digest('hex')
  .slice(0, 12);
