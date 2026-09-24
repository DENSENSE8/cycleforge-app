/**
 * Generate and enforce the API route authentication inventory.
 *
 * The manifest is review evidence, not the security control. `--enforce`
 * separately rejects every route whose source has neither a recognized guard
 * nor a narrowly documented public exemption, so re-emitting the manifest
 * cannot make an unguarded route pass.
 */

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const API_DIR = 'src/app/api';
const MANIFEST_PATH = 'docs/security/route-permissions.json';
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

// Explicit because `/api/auth/*` is not inherently safe. Adding a new public
// auth endpoint must be a review-visible change here; otherwise --enforce
// rejects it. Session-gated auth routes are detected from their source and do
// not need an entry.
const PUBLIC_AUTH_FLOW_ROUTES = new Set([
  '/api/auth/account/passkey/authenticate/begin/route.ts',
  '/api/auth/account/passkey/authenticate/finish/route.ts',
  '/api/auth/account/signin/route.ts',
  '/api/auth/act-as-staff/route.ts',
  '/api/auth/enroll/[token]/route.ts',
  '/api/auth/invitation/accept/route.ts',
  '/api/auth/oauth/[provider]/callback/route.ts',
  '/api/auth/passkey/authenticate/begin/route.ts',
  '/api/auth/passkey/authenticate/finish/route.ts',
  '/api/auth/password-reset/confirm/route.ts',
  '/api/auth/password-reset/request/route.ts',
  '/api/auth/pin/create/route.ts',
  '/api/auth/qr/begin/route.ts',
  '/api/auth/qr/handoff/claim/route.ts',
  '/api/auth/qr/status/route.ts',
  '/api/auth/session/route.ts',
  '/api/auth/signin/route.ts',
  '/api/auth/signout/route.ts',
  '/api/auth/staff-choice/route.ts',
  '/api/auth/staff-picker/route.ts',
  '/api/auth/switch-org/route.ts',
  '/api/auth/switch/route.ts',
  '/api/auth/workspace/route.ts',
]);

interface RouteInfo {
  path: string;
  methods: string[];
  gate: string;
  permission: string | null;
  exemptReason: string | null;
}

interface Manifest {
  version: 1;
  generatedAt: string;
  totalRoutes: number;
  summary: {
    permissionGated: number;
    authenticatedNoPermission: number;
    anonymousIntentional: number;
    serviceToService: number;
    ungatedRead: number;
    ungatedWrite: number;
  };
  routes: RouteInfo[];
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (entry === 'route.ts') files.push(full.split(sep).join('/'));
  }
  return files;
}

function detectMethods(source: string): string[] {
  const found = new Set<string>();
  const direct = /^export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/gm;
  for (const match of source.matchAll(direct)) found.add(match[1]);

  const reExports = /^export\s*\{([^}]+)\}(?:\s+from\s+[^;]+)?/gm;
  for (const match of source.matchAll(reExports)) {
    for (const method of HTTP_METHODS) {
      const methodExport = new RegExp(`(?:^|,)\\s*(?:${method}\\s+as\\s+)?${method}\\s*(?:,|$)`);
      const aliasExport = new RegExp(`\\bas\\s+${method}\\b`);
      if (methodExport.test(match[1]) || aliasExport.test(match[1])) found.add(method);
    }
  }
  return [...found].sort();
}

function publicExemption(path: string): string | null {
  const routePath = path.replace(/^src\/app/, '');
  if (PUBLIC_AUTH_FLOW_ROUTES.has(routePath)) return 'reviewed public authentication flow';
  if (/\/api\/(health|ready|version)\/route\.ts$/.test(path)) return 'public health/readiness probe';
  if (path.includes('/api/photos/share-packs/')) return 'public capability URL';
  if (path.includes('/api/nas-dev/')) return 'development-only NAS passthrough';
  if (path.includes('/api/beta/') && !path.includes('/api/beta/applications')) {
    return 'public marketing capture';
  }
  if (path.includes('/oauth/callback/') || path.includes('/google-drive/callback/')) {
    return 'public OAuth callback with signed/encrypted state';
  }
  if (path.endsWith('/api/ebay/callback/route.ts')) {
    return 'public OAuth callback with signed state';
  }
  if (path.endsWith('/api/webhooks/zoho/orders/route.ts')) {
    return 'retired endpoint (always 410 Gone)';
  }
  if (path.endsWith('/api/zoho/webhooks/route.ts')) {
    return 'retired tokenless endpoint (always 410 Gone)';
  }
  if (path.includes('/api/webhooks/shipstation/')) {
    return 'webhook authenticated by signature and capability token';
  }
  return null;
}

function detectGate(source: string): { gate: string; permission: string | null } {
  const withAuthPermission = source.match(/withAuth\([^]*?permission\s*:\s*['"]([\w.]+)['"]/m)?.[1];
  if (withAuthPermission) return { gate: 'withAuth', permission: withAuthPermission };

  const routePermission = source.match(/requireRoutePerm\([^,]+,\s*['"]([\w.]+)['"]/m)?.[1];
  if (routePermission) return { gate: 'requireRoutePerm', permission: routePermission };

  if (/withAuth\s*\([^)]*allowAnonymous\s*:\s*true/s.test(source)) {
    return { gate: 'withAuth (anonymous allowed)', permission: null };
  }
  if (/\bwithAuth\s*\(/.test(source)) return { gate: 'withAuth (no permission)', permission: null };
  if (/\bwithKioskAuth\s*\(/.test(source)) return { gate: 'withKioskAuth', permission: null };
  // `withKioskCart` (src/app/api/kiosk/carts/cart-route.ts) resolves `[id]` and
  // delegates to `withKioskAuth`; the device cookie is still the only gate.
  if (/\bwithKioskCart\s*\(/.test(source)) return { gate: 'withKioskAuth (via withKioskCart)', permission: null };
  if (/\brequireRoutePerm\s*\(/.test(source)) return { gate: 'requireRoutePerm', permission: null };
  if (/\brequirePermission\s*\(/.test(source)) return { gate: 'requirePermission', permission: null };
  if (/\brequireInternalToken\s*\(/.test(source)) return { gate: 'internal token', permission: null };
  if (/\bisAuthorizedCronRequest\s*\(/.test(source)) {
    return { gate: 'cron bearer secret', permission: null };
  }
  if (/\b(?:verify[A-Z]\w*Signature|verifyWebhookSignature|verifySignature)\s*\(/.test(source)) {
    return { gate: 'webhook signature', permission: null };
  }
  if (/\bprocessZohoWebhook\s*\(/.test(source)) {
    return { gate: 'delegated webhook signature', permission: null };
  }
  if (/if\s*\(\s*!isAuthorized\s*\(/.test(source)) {
    return { gate: 'shared-secret authorization', permission: null };
  }
  if (/\b(?:verifyEnrollToken|ENROLL_TOKEN_SECRET)\b/.test(source)) {
    return { gate: 'enrollment token', permission: null };
  }
  if (/\bgetCurrentUser\s*\(/.test(source)) return { gate: 'authenticated user', permission: null };
  if (/^export\s*\{[^}]+\}\s+from\s+/m.test(source)) {
    return { gate: 're-export (inherits target)', permission: null };
  }
  return { gate: 'NONE', permission: null };
}

function collectRoutes(): RouteInfo[] {
  return walk(API_DIR)
    .map((file) => {
      const source = readFileSync(file, 'utf8');
      const methods = detectMethods(source);
      if (methods.length === 0) return null;
      const gate = detectGate(source);
      return {
        path: file.replace(/^src\/app/, ''),
        methods,
        ...gate,
        exemptReason: publicExemption(file),
      } satisfies RouteInfo;
    })
    .filter((route): route is RouteInfo => route !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function isServiceGate(gate: string): boolean {
  return gate === 'internal token' || gate === 'cron bearer secret' || gate === 'webhook signature';
}

function summarize(routes: RouteInfo[]): Manifest['summary'] {
  const summary: Manifest['summary'] = {
    permissionGated: 0,
    authenticatedNoPermission: 0,
    anonymousIntentional: 0,
    serviceToService: 0,
    ungatedRead: 0,
    ungatedWrite: 0,
  };
  for (const route of routes) {
    if (route.permission) summary.permissionGated += 1;
    else if (isServiceGate(route.gate)) summary.serviceToService += 1;
    else if (route.gate !== 'NONE' && route.gate !== 'withAuth (anonymous allowed)') {
      summary.authenticatedNoPermission += 1;
    } else if (route.exemptReason || route.gate === 'withAuth (anonymous allowed)') {
      summary.anonymousIntentional += 1;
    } else if (route.methods.some((method) => method !== 'GET')) summary.ungatedWrite += 1;
    else summary.ungatedRead += 1;
  }
  return summary;
}

function buildManifest(routes: RouteInfo[]): Manifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    totalRoutes: routes.length,
    summary: summarize(routes),
    routes,
  };
}

function offenders(routes: RouteInfo[]): RouteInfo[] {
  return routes.filter((route) => route.gate === 'NONE' && !route.exemptReason);
}

function printOffenders(routes: RouteInfo[]): void {
  const unsafe = offenders(routes);
  const writes = unsafe.filter((route) => route.methods.some((method) => method !== 'GET'));
  const reads = unsafe.filter((route) => route.methods.every((method) => method === 'GET'));
  if (writes.length) {
    console.error('Unguarded writes:');
    for (const route of writes) console.error(`  ${route.methods.join(',').padEnd(18)} ${route.path}`);
  }
  if (reads.length) {
    console.error('Unguarded reads:');
    for (const route of reads) console.error(`  ${route.methods.join(',').padEnd(18)} ${route.path}`);
  }
}

function enforce(routes: RouteInfo[]): number {
  const unsafe = offenders(routes);
  if (!unsafe.length) {
    console.log(`✓ route-auth enforce: all ${routes.length} routes are gated or explicitly public`);
    return 0;
  }
  console.error(`✗ route-auth enforce: ${unsafe.length} route(s) have no recognized guard or public exemption`);
  printOffenders(routes);
  return 1;
}

function emit(routes: RouteInfo[]): number {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(buildManifest(routes), null, 2)}\n`);
  console.log(`Wrote ${MANIFEST_PATH} (${routes.length} routes)`);
  return 0;
}

function check(routes: RouteInfo[]): number {
  let committed: Manifest;
  try {
    committed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch (error) {
    console.error(`Cannot read ${MANIFEST_PATH}: ${String(error)}`);
    return 1;
  }
  const live = buildManifest(routes);
  const stable = (manifest: Manifest) => JSON.stringify({ ...manifest, generatedAt: '' });
  if (stable(committed) === stable(live)) {
    console.log('✓ route-permissions manifest matches live source');
    return 0;
  }

  const before = new Map(committed.routes.map((route) => [route.path, route]));
  const after = new Map(live.routes.map((route) => [route.path, route]));
  console.error(`✗ ${relative(process.cwd(), MANIFEST_PATH)} is out of date`);
  for (const [path, route] of after) {
    const previous = before.get(path);
    if (!previous) console.error(`  + ${path} (${route.methods.join(',')})`);
    else if (JSON.stringify(previous) !== JSON.stringify(route)) console.error(`  ~ ${path}`);
  }
  for (const path of before.keys()) if (!after.has(path)) console.error(`  - ${path}`);
  console.error('Run `pnpm audit-route-auth:emit`, review the diff, and commit it with the route change.');
  return 1;
}

const routes = collectRoutes();
const args = new Set(process.argv.slice(2));
if (args.has('--emit')) process.exit(emit(routes));
if (args.has('--check')) process.exit(check(routes));
if (args.has('--enforce')) process.exit(enforce(routes));

const summary = summarize(routes);
console.log(JSON.stringify({ totalRoutes: routes.length, summary }, null, 2));
printOffenders(routes);
process.exit(0);
