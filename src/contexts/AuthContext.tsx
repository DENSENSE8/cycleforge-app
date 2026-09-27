'use client';

/** Client-side auth context. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import {
  DEFAULT_MOBILE_DISPLAY_CONFIG,
  type MobileDisplayConfig,
} from '@/lib/auth/mobile-display-config';
import type { OrgMembership } from '@/lib/identity/types';
import { clearWorkbenchCache } from '@/lib/mobile/workbench-cache';

export type { OrgMembership };

// Mirror of PUBLIC_PATHS in src/proxy.ts. Kept in sync by hand — small and
// stable. Used by the client-side guard below to avoid bouncing the user
// off /signin or the enrollment landing while their session is null.
const CLIENT_PUBLIC_PATHS: ReadonlyArray<RegExp> = [
  /^\/signin(?:$|\/)/,
  /^\/signup(?:$|\/)/,                  // public account creation — must match proxy.ts
  /^\/account\/signin(?:$|\/)/,         // account-level sign-in — must match proxy.ts
  /^\/m\/signin(?:$|\/)/,
  /^\/m\/qr-auth(?:$|\/)/,             // workstation QR auth - chromeless + exempt from the anon redirect;
                                        // mirrors proxy.ts PUBLIC_PATHS.
  /^\/m\/claim(?:$|\/)/,               // desk→phone handoff claim — mirrors proxy.ts PUBLIC_PATHS.
  /^\/not-authorized(?:$|\/)/,
  /^\/m\/enroll\//,
  /^\/kiosk(?:$|\/)/,                    // customer-facing kiosk — chromeless, no staff nav (must match proxy.ts)
  /^\/invite\/[A-Za-z0-9_-]+(?:$|\/)/,  // org invitation accept — must match proxy.ts

  /^\/offline(?:$|\/)/,
  /^\/share\/photos\//,                 // public photo share-pack viewer — must match proxy.ts GS1 Digital Link resolver — server-side redirects anon callers to the storefront…
  /^\/gs1\/resolve(?:$|\/)/,
  /^\/01\/[0-9]+(?:$|\/)/,
  /^\/414\/[0-9]+\/254\/[A-Za-z0-9]+(?:$|\/)/,
  // Platform carton Digital Link — must match proxy.ts PUBLIC_PATHS.
  /^\/m\/r\/\d+(?:$|\/)/,
  // Generic anon QR landing — must match proxy.ts PUBLIC_PATHS.
  /^\/qr(?:$|\/)/,
  // Square checkout thank-you landing — must match proxy.ts PUBLIC_PATHS.
  /^\/pay\/thanks(?:$|\/)/,
];

export function isClientPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return CLIENT_PUBLIC_PATHS.some((re) => re.test(pathname));
}

export interface AuthSessionUser {
  staffId: number;
  /** Active tenant. Used to build org-namespaced realtime channel names on the
   *  client (security is still enforced server-side by the Ably token grant). */
  organizationId: string;
  /** Active tenant's display name — shown as a passive "which workspace am I
   *  in" signal in the account menu and Settings → Organization. Falls back to
   *  'Workspace' if the org row can't be resolved. */
  organizationName: string;
  /** Active tenant's slug + plan, for the Settings workspace card. Nullable
   *  when the org row is unavailable. */
  organizationSlug: string | null;
  organizationPlan: string | null;
  /** Every workspace this account can act in (≥1; the current org is flagged
   *  isCurrent). Drives the Settings → Organization switcher. Pre-migration
   *  this is always a single synthesized entry for the current org. */
  memberships: OrgMembership[];
  name: string;
  /** Signed-in email for the account row under the name. Null/absent = none. */
  email?: string | null;
  role: string;
  permissions: string[];
  mobileDisplayConfig?: MobileDisplayConfig;
  /** Profile photo id (`staff.avatar_photo_id`), or null when the staffer has none — every surface then renders colour + initials via… */
  avatarPhotoId?: number | null;
  session: {
    sid: string;
    deviceKind: 'station' | 'personal' | 'phone';
    deviceLabel: string | null;
    expiresAt: string;
    /**
     * "Keep me signed in" for THIS device. Surfaced so the feature is
     * observable without a debug UI: open /api/auth/session and read it
     * beside `expiresAt` (~1 year when true, the device window when false).
     */
    persistent: boolean;
  };
}

interface AuthContextValue {
  user: AuthSessionUser | null;
  isLoaded: boolean;
  has: (perm: string) => boolean;
  /** Resolved per-staff mobile UI config. Falls back to defaults when no user. */
  mobileDisplayConfig: MobileDisplayConfig;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  has: () => false,
  mobileDisplayConfig: DEFAULT_MOBILE_DISPLAY_CONFIG,
  refresh: async () => {},
  signOut: async () => {},
});

interface ProviderProps {
  initial?: AuthSessionUser | null;
  /** True when this request is on a tenant kiosk host ({slug}.kiosk.app…), resolved server-side in the root layout. */
  kioskHost?: boolean;
  children: React.ReactNode;
}

export function AuthProvider({ initial = null, kioskHost = false, children }: ProviderProps) {
  const [user, setUser] = useState<AuthSessionUser | null>(initial);
  const [isLoaded, setIsLoaded] = useState<boolean>(initial !== null || kioskHost);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    // We have to compute the next state outside the React-render path so that flushSync below can commit it synchronously.
    let nextUser: AuthSessionUser | null = null;
    try {
      const r = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (r.ok) {
        const data = (await r.json()) as { user: AuthSessionUser | null };
        nextUser = data.user ?? null;
      }
    } catch {
      nextUser = null;
    }
    // flushSync forces React to commit BEFORE this function resolves, so
    // `await refresh()` is genuinely "AuthContext is up to date now".
    flushSync(() => {
      setUser(nextUser);
      setIsLoaded(true);
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } catch {
      // swallow — even if the server call fails, drop the local user
    }
    // Committed synchronously so `WorkbenchCachePersistence` has unmounted (and
    // cancelled its throttled write) before the repair workbench's refresh
    // cache — customer PII in this tab — is cleared.
    flushSync(() => setUser(null));
    clearWorkbenchCache();
    // Rail first-paint seeds now live in Upstash keyed per org + viewer with a
    // short TTL (see rail-snapshot-cache.ts) — no browser-side purge needed; a
    // different login simply reads its own (or an empty) seed.
    if (typeof window !== 'undefined') {
      window.location.href = '/signin';
    }
  }, []);

  useEffect(() => {
    if (!kioskHost && initial === null) {
      void refresh();
    }
  }, [initial, kioskHost, refresh]);

  // Client-side fallback gate.
  const onPublicPath = isClientPublicPath(pathname) || kioskHost;
  const mustRedirect = isLoaded && !user && !onPublicPath;

  useEffect(() => {
    if (!mustRedirect) return;
    const target = pathname || '/';
    router.replace(`/signin?next=${encodeURIComponent(target)}`);
  }, [mustRedirect, pathname, router]);

  const value = useMemo<AuthContextValue>(() => {
    const perms = new Set(user?.permissions ?? []);
    return {
      user,
      isLoaded,
      has: (perm: string) => perms.has(perm),
      mobileDisplayConfig: user?.mobileDisplayConfig ?? DEFAULT_MOBILE_DISPLAY_CONFIG,
      refresh,
      signOut,
    };
  }, [user, isLoaded, refresh, signOut]);

  return (
    <AuthCtx.Provider value={value}>
      {mustRedirect ? <RedirectingSplash /> : children}
    </AuthCtx.Provider>
  );
}

/**
 * Shown for the brief moment between AuthContext resolving user:null and the
 * router.replace() landing on /signin. Without this, the page (and the FAB
 * with its "Sign in" branch) would render for ~1 frame before disappearing.
 */
function RedirectingSplash() {
  return (
    <div className="fixed inset-0 z-splash flex items-center justify-center bg-surface-card">
      <div className="flex flex-col items-center gap-3 text-text-soft">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-soft border-t-text-muted" />
        <p className="text-role-caption font-semibold uppercase tracking-widest">Redirecting to sign-in…</p>
      </div>
    </div>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthCtx);
}
