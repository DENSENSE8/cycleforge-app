import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import withBundleAnalyzerInit from "@next/bundle-analyzer";
import { networkInterfaces } from "node:os";

// ANALYZE=true pnpm build → .next/analyze/client.html (chunk treemap).
const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === "true" });

// PWA/workbox compile is a webpack-only memory spike. On Vercel we ship the
// committed `public/sw.js` (+ workbox-*) instead — regenerate with
// `pnpm build:webpack` when runtimeCaching / fallbacks change, then commit.
const skipPwaCompile =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL === "1" ||
    process.env.CF_SKIP_PWA === "1";

const withPWA = withPWAInit({
    dest: "public",
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    disable: skipPwaCompile,
    // NEVER precache build output from a COMMITTED service worker.
    //
    // `public/sw.js` is generated locally and committed, then shipped verbatim
    // (PWA compile is skipped on Vercel — see `skipPwaCompile` above). A
    // precache manifest naming `_next/static/chunks/<content-hash>.js` is only
    // valid for the single build that produced it; every later deploy renames
    // those chunks. Workbox precaching treats a 404 on a precached URL as a
    // FATAL install error, so the new worker never activates and each client
    // stays pinned to whichever worker last installed successfully — serving
    // that deploy's CSS forever. That is the "old machine still shows old
    // classes" bug: not a stale file, a worker that can no longer install.
    //
    // Excluding build output leaves a manifest of stable `public/` assets whose
    // URLs survive a rebuild, so the committed worker keeps installing across
    // deploys. `_next/static` is content-hashed and immutable, so it is cached
    // at RUNTIME below instead — same offline behaviour, no build coupling.
    // Served when a navigation request fails AND we have no cached version of
    // the target route. Mostly relevant for receivers/pickers walking out of
    // Wi-Fi range. The shell + last-cached responses still render.
    fallbacks: {
        document: "/offline",
    },
    workboxOptions: {
        disableDevLogs: true,
        // `exclude` is a WORKBOX option, not a top-level plugin option — it
        // lives on GenerateSWOptions (via WebpackOptions), so at the top level
        // it silently did nothing AND failed typecheck. Keeping it here is what
        // actually keeps build output out of the committed worker's precache
        // manifest; see the reasoning above `fallbacks`.
        // Patterns match the WEBPACK ASSET NAME (`static/chunks/x.js`) — no
        // leading slash and no `_next` prefix, both of which are added later
        // when the manifest URL is built. Anchoring on `/_next/...` (as this
        // first shipped) can never match: measured, the manifest still carried
        // 1438 build-hashed entries.
        exclude: [/^static\//, /\.map$/, /^build-manifest\.json$/],
        // `exclude` only filters assets workbox harvests from the compilation.
        // next-pwa injects its own via `additionalManifestEntries`, which skip
        // that filter entirely — so drop anything build-hashed that survives,
        // matching on the FINAL url this time.
        manifestTransforms: [
            // Must satisfy workbox's `ManifestTransform`, which hands over
            // `ManifestEntry & { size: number }`: `revision` is REQUIRED
            // (nullable value, not an optional key) and `size` is present, so
            // omitting either fails assignability.
            (entries: Array<{ url: string; revision: string | null; integrity?: string; size: number }>) => ({
                manifest: entries.filter((e) => !/^\/?_next\/static\//.test(e.url)),
                warnings: [] as string[],
            }),
        ],
        runtimeCaching: [
            {
                // Replaces the precache entries removed by `exclude` above.
                // `_next/static` URLs are content-hashed and immutable, so a
                // cache hit is always correct and a miss just fetches once.
                urlPattern: /\/_next\/static\/.*/i,
                handler: "CacheFirst",
                options: {
                    cacheName: "next-static",
                    expiration: { maxEntries: 512, maxAgeSeconds: 30 * 24 * 60 * 60 },
                },
            },
            {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: "CacheFirst",
                options: { cacheName: "google-fonts", expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } },
            },
            {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: "CacheFirst",
                options: { cacheName: "gstatic-fonts", expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } },
            },
            {
                urlPattern: /\/api\/(?!auth).*/i,
                handler: "NetworkFirst",
                options: { cacheName: "api-cache", networkTimeoutSeconds: 10, expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 } },
            },
        ],
    },
});

const nextConfig: NextConfig = {
    turbopack: {},
    // Workspace package shipped as TypeScript source (main: src/index.ts).
    transpilePackages: ["@cycleforge/design-tokens"],
    // Vercel sets this on platform builds. Explicit so Skew Protection can
    // pin framework-managed assets/RSC to the deployment that served the
    // page (floor stations stay open across a ship). Do not remove the
    // Workbox precache exclusion below — that is a different bug (hashed
    // `/_next/static` in a committed SW). Function region is `iad1` in
    // vercel.json (Neon us-east-1).
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    // Optional build-output override so a production build/serve (e.g. the
    // Lighthouse audit runbook) can coexist with a running `next dev` in the
    // same checkout — dev clobbers `.next`. Unset ⇒ default `.next`.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    outputFileTracingRoot: process.cwd(),
    // No `outputFileTracingIncludes` for docs: bundling `docs/**/*.md` into the
    // task routes (which share the merged function bundle) made every Vercel
    // deploy fail at "Deploying outputs" with an empty "Unexpected error"
    // (bisected 2026-09-25: same tree minus that block deploys Ready). Task
    // `repo` documents therefore read from disk only where the repo is present
    // (dev / self-hosted); on Vercel `readPlanFile` answers file_not_found.
    //
    // Functions execute compiled `.next/server`; TypeScript source is never
    // read at request time (only tests read it), so keep it out of traces.
    outputFileTracingExcludes: {
        '*': ['./src/**/*.ts', './src/**/*.tsx'],
    },
    // Keep the production build fail-closed. CI typechecks earlier for faster
    // feedback, while Next repeats the check so a deployment cannot bypass CI
    // and publish a revision that does not compile.
    // Next 16 removed the `eslint` build key — `next build` no longer runs ESLint,
    // so there is nothing to disable here; CI's `eslint src` is the lint gate.
    // Remote hosts allowed through the next/image optimizer. The mobile
    // receiving gallery (PhotoGalleryView) renders photos with <Image>, which
    // rejects any un-listed host. NAS photos are served over the Cloudflare
    // Tunnel hostname; legacy receiving photos live in Vercel Blob.
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'nas-photos.michaelgarisek.com' },
            { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
            { protocol: 'https', hostname: '*.blob.vercel-storage.com' },
            { protocol: 'https', hostname: 'blob.vercel-storage.com' },
            // GCS-backed photos (PHOTOS_GCS_BUCKET: usav-photos-prod / -dev).
            // Without this, next/image throws "hostname not configured" and the
            // mobile photo gallery hits its error boundary.
            { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/usav-photos-prod/**' },
            { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/usav-photos-dev/**' },
        ],
    },
    /* Cross-device dev access. `**` is load-bearing: a single `*` matches
       exactly ONE label, so `*.michaelgarisek.com` never matched this lane's
       own `prod.dev.michaelgarisek.com` and no IP glob can work at all
       (`matchWildcardDomain`, next/dist/server/app-render/csrf-protection).
       Local IPs are therefore enumerated, not pinned. Same block as main's
       next.config.ts — see docs/dev/dev-server-runbook.md. */
    allowedDevOrigins: [
        'localhost',
        ...Object.values(networkInterfaces())
            .flat()
            .flatMap((iface) => (iface && iface.family === 'IPv4' ? [iface.address] : [])),
        // This workstation's tailscale0 address, pinned: the enumeration above
        // runs once at boot, and when the lane unit starts before tailscaled has
        // assigned tailscale0, every /_next chunk from this origin is blocked —
        // the page renders but never hydrates (no clicks, no client data).
        '100.72.226.55',
        '**.ts.net',
        '**.michaelgarisek.com',
        '**.trycloudflare.com',
        '**.ngrok-free.app',
    ],
    experimental: {
        webpackMemoryOptimizations: true,
        // Cap static/page-data workers. Vercel Enhanced is 8 cores / 16 GB;
        // with NODE_OPTIONS heap at 8 GB, even 2 workers can SIGKILL mid-
        // webpack or during "Collecting page data" — missing routes-manifest
        // is the symptom. Prefer slower + green (1 worker).
        cpus: 1,
        optimizePackageImports: [
            'framer-motion',
            'lucide-react',
            'sonner',
            'date-fns',
            'date-fns-tz',
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
            '@tanstack/react-query',
            'react-markdown',
        ],
    },
    productionBrowserSourceMaps: false,
    // On Vercel, keep webpack single-threaded so peak RSS stays under the
    // Enhanced 16 GB ceiling (parent heap is already capped at 8 GB).
    webpack: (config) => {
        if (process.env.VERCEL) {
            config.parallelism = 1;
        }
        return config;
    },
    // Warehouse-OS rebuild (2026-08-22): the redirect table is EMPTY on purpose.
    //
    // Every rule that used to live here pointed at a page route that has since
    // been deleted with the rest of the operator surface (/inventory, /shipping,
    // /products, /admin, /receiving, /onboarding, /warehouse, /manuals,
    // /sku-stock, /outbound). A redirect whose destination 404s is strictly
    // worse than no redirect at all, and most of these were `permanent: true`
    // (308) — which browsers cache INDEFINITELY. Leaving them would pin every
    // client that touched a legacy URL during the rebuild to a dead
    // destination, and they would keep landing there even after the new shell
    // reintroduces the route under the same path.
    //
    // Re-add a rule only when its destination exists again in the new shell.
    async redirects() {
        return [];
    },
    async headers() {
        // Cloudflare was honouring a 4h cache on the committed Workbox file.
        // A stale sw.js keeps CacheFirst `/_next/static` alive on usav-dev.
        return [
            {
                source: '/sw.js',
                headers: [
                    { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                    { key: 'CDN-Cache-Control', value: 'no-store' },
                ],
            },
            {
                source: '/workbox-:hash.js',
                headers: [
                    { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                    { key: 'CDN-Cache-Control', value: 'no-store' },
                ],
            },
        ];
    },
    serverExternalPackages: [
        '@anthropic-ai/sdk',
        '@google-cloud/storage',
        '@google-cloud/vision',
        '@googleapis/sheets',
        '@gorules/zen-engine-wasm',
        '@nangohq/node',
        'ably',
        'bwip-js',
        'drizzle-kit',
        'drizzle-orm',
        'ebay-api',
        'google-auth-library',
        'nodemailer',
        'pdfjs-dist',
        'pg',
        // sharp ships per-platform native binaries + an optional wasm32 fallback;
        // letting webpack bundle it makes the build choke trying to resolve
        // '@img/sharp-wasm32/versions'. Require it at runtime instead.
        'sharp',
        // isomorphic-dompurify pulls in jsdom, which reads data files (e.g.
        // browser/default-stylesheet.css) via __dirname-relative fs calls.
        // Bundling breaks those paths at page-data collection, so keep both
        // external and let Node require them from node_modules at runtime.
        'isomorphic-dompurify',
        'jsdom',
    ],
};

export default withBundleAnalyzer(withPWA(nextConfig));
