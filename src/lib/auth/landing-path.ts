/**
 * Where a freshly signed-in staff member lands.
 *
 * Precedence: `next` deep link → admin-set per-staff home → station role home
 * → Daily (`/` desktop, `/m/home` mobile). Only station roles own a home; every
 * other role lands on Daily. `/dashboard` is no longer a home (it only
 * redirects to /shipping/orders), so a stored `/dashboard*` override is treated
 * as unset.
 *
 * Pure — shared by the client sign-in page and server-side sign-in redirects.
 */

import { isMobileFirstPath } from '@/lib/mobile/mobile-first-surface';

const STATION_ROLE_HOME: Readonly<Record<string, string>> = {
  packer: '/pack',
  receiver: '/receiving',
  receiving: '/receiving',
  technician: '/test',
};

const MOBILE_STATION_ROLE_HOME: Readonly<Record<string, string>> = {
  packer: '/m/pick',
};

export const DAILY_HOME_PATH = '/';
export const MOBILE_DAILY_HOME_PATH = '/m/home';

function usableOverride(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('/dashboard')) return null;
  return path;
}

export function resolveLandingPath(input: {
  next?: string | null;
  role?: string | null;
  defaultHomePath?: string | null;
  defaultHomePathMobile?: string | null;
  mobile: boolean;
}): string {
  const role = input.role ? input.role.toLowerCase() : '';
  const roleHomes = input.mobile ? MOBILE_STATION_ROLE_HOME : STATION_ROLE_HOME;
  const roleHome = role && Object.hasOwn(roleHomes, role) ? roleHomes[role]! : null;
  const override = usableOverride(input.mobile ? input.defaultHomePathMobile : input.defaultHomePath);
  const fallback = input.mobile ? MOBILE_DAILY_HOME_PATH : DAILY_HOME_PATH;
  return input.next || override || roleHome || fallback;
}

/** Query flag the shell welcome host reads to play the welcome after a server redirect. */
const WELCOME_HANDOFF_PARAM = 'welcome=1';

/**
 * Server-redirect form of the sign-in welcome: a redirect cannot arm the
 * client's sessionStorage flag, so every desktop landing gets `welcome=1`
 * appended (existing query and hash preserved; never twice). The shell host
 * plays the welcome and strips the param. Mobile (`/m/*`) targets are returned
 * unchanged — the welcome is desktop-only.
 */
export function withWelcomeHandoff(target: string): string {
  const hashAt = target.indexOf('#');
  const beforeHash = hashAt === -1 ? target : target.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : target.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  if (isMobileFirstPath(path)) return target;
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);
  if (query.split('&').includes(WELCOME_HANDOFF_PARAM)) return target;
  const joined = query ? `${query}&${WELCOME_HANDOFF_PARAM}` : WELCOME_HANDOFF_PARAM;
  return `${path}?${joined}${hash}`;
}
