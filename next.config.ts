import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

// ANALYZE=true pnpm build → .next/analyze/client.html (chunk treemap).
const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === "true" });

const withPWA = withPWAInit({
    dest: "public",
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    disable: process.env.NODE_ENV === "development",
    // Served when a navigation request fails AND we have no cached version of
    // the target route. Mostly relevant for receivers/pickers walking out of
    // Wi-Fi range. The shell + last-cached responses still render.
    fallbacks: {
        document: "/offline",
    },
    workboxOptions: {
        disableDevLogs: true,
        runtimeCaching: [
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
    // Optional build-output override so a production build/serve (e.g. the
    // Lighthouse audit runbook) can coexist with a running `next dev` in the
    // same checkout — dev clobbers `.next`. Unset ⇒ default `.next`.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    outputFileTracingRoot: process.cwd(),
    // Type-check + lint are the gate in CI (.github/workflows/ci.yml runs
    // `eslint src` + `tsc --noEmit`). Running them AGAIN inside `next build`
    // is redundant, and on this ~550k-LOC strict project the in-build `tsc`
    // step ("Running TypeScript …") GC-thrashes under the build heap and
    // wedges Vercel prod deploys until the 45-min build timeout. Keep the
    // Vercel build a pure bundler step; CI owns correctness.
    typescript: { ignoreBuildErrors: true },
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
            // GCS-backed photos (PHOTOS_GCS_BUCKET: usav-photos-prod / -dev).
            // Without this, next/image throws "hostname not configured" and the
            // mobile photo gallery hits its error boundary.
            { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/usav-photos-prod/**' },
            { protocol: 'https', hostname: 'storage.googleapis.com', pathname: '/usav-photos-dev/**' },
        ],
    },
    // Allow cross-device dev access through Cloudflare quick tunnels
    // (pnpm dev:tunnel) and LAN IPs. Without this, Next 15+ blocks HMR and
    // dev asset requests from origins other than localhost.
    allowedDevOrigins: ['*.trycloudflare.com', '*.ngrok-free.app', '192.168.*', '*.michaelgarisek.com'],
    experimental: {
        webpackMemoryOptimizations: true,
        // Cap static/page-data workers. Vercel Enhanced (8 cores) otherwise
        // fans out ~7 workers and OOM-kills during "Collecting page data"
        // (routes-manifest missing is the symptom). Prefer slower + green.
        cpus: 2,
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
    // Phase C of the Products / Inventory / Warehouse rename. /sku-stock is
    // the legacy path; the same content now lives at /inventory. Order matters:
    // longer-prefix rules (e.g. /location) must precede the bare :sku catch.
    async redirects() {
        return [
            { source: '/sku-stock', destination: '/inventory', permanent: true },
            { source: '/sku-stock/location/:path*', destination: '/inventory/location/:path*', permanent: true },
            { source: '/sku-stock/:sku', destination: '/inventory/sku/:sku', permanent: true },
            // Shipping surface: `/outbound` → `/shipping` (proxy also normalizes; this
            // covers static/CDN hits and keeps query strings via Next redirects).
            { source: '/outbound', destination: '/shipping', permanent: true },
            { source: '/outbound/', destination: '/shipping', permanent: true },
            // Shipping modes moved from `?mode=` onto their own segments.
            // `permanent: false` (307) ON PURPOSE while the old links drain: a
            // 308 is cached by browsers forever, so it cannot be taken back if
            // the mapping turns out wrong. Switch to 308 at sunset, not before.
            // The stale `?mode=` rides along to the destination and is dropped
            // there by the boundary parse — it is not declared on any mode spec.
            // Ready folded into FBA as `?fbaMode=ready` (lifecycle stage tab).
            { source: '/shipping/ready', destination: '/shipping/fba?fbaMode=ready', permanent: true },
            { source: '/shipping', has: [{ type: 'query', key: 'mode', value: 'ready' }], destination: '/shipping/fba?fbaMode=ready', permanent: false },
            { source: '/shipping', has: [{ type: 'query', key: 'mode', value: 'fba' }], destination: '/shipping/fba', permanent: false },
            { source: '/shipping', has: [{ type: 'query', key: 'mode', value: 'scan-out' }], destination: '/shipping/scan-out', permanent: false },
            { source: '/shipping', has: [{ type: 'query', key: 'mode', value: 'labels' }], destination: '/shipping/labels', permanent: false },
            // Locations desk folded under Inventory (P4 condensation).
            // Orphan children `/warehouse/rma` and `/warehouse/replenishment` stay.
            { source: '/warehouse', destination: '/inventory/locations', permanent: true },
            // D2 — the product detail page moved under a static segment:
            // `/products/:sku` → `/products/sku/:sku`. A BARE dynamic child
            // cannot coexist with the view segments `/products` will grow,
            // because static beats dynamic in Next.js: the day `/products/qc`
            // exists as a page, the SKU literally named "qc" becomes
            // unreachable. Every sibling surface already namespaces its dynamic
            // child (/inventory/sku/:sku, /inventory/location/:barcode,
            // /receiving/lines/:id), so this is the house shape, not a new one.
            //
            // The negative lookahead is what keeps this redirect from swallowing
            // those future segments — without it, `/products/qc` would bounce to
            // `/products/sku/qc` before the page could ever render.
            //
            // Each alternative is terminated by `(?:$|/)`, NOT by `$` alone.
            // With `sku$` the exemption only covers the bare `/products/sku`, so
            // `/products/sku/CABLE-001` — the redirect's own destination — still
            // matched and rewrote to `/products/sku/sku/CABLE-001`, forever.
            // Anchoring on "segment ends" instead of "path ends" fixes the loop
            // and lets a view grow a nested child later.
            //
            // Keep the list in sync with PRODUCTS_VIEWS
            // (src/components/products/products-view.ts); the guard in
            // src/lib/routing/products-detail-redirect.guard.test.ts compiles
            // this source and fails on drift or a self-match.
            // `permanent: false` for the same reason as the shipping rules
            // above — a 308 is cached by browsers forever.
            {
                source: '/products/:sku((?!(?:sku|catalog|manuals|labels|pairing|qc|kit)(?:$|/)).*)',
                destination: '/products/sku/:sku',
                permanent: false,
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
        'googleapis-common',
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
