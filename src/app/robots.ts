import type { MetadataRoute } from 'next';

/**
 * `robots.txt` for the APP host (`app.cycleforge.ai` / `{tenant}.app.cycleforge.ai`).
 *
 * Deny everything, to every crawler. Three reasons, in order of how much they cost:
 *
 * 1. **Token-bearing URLs live here.** `/share/photos/[token]` and
 *    `/invite/[token]` are unauthenticated by design — the token IS the
 *    credential. A crawler that walks one and a search engine that keeps it is
 *    a disclosure, not a ranking problem.
 * 2. **Compute.** 147 pages and 934 API routes, effectively all session-gated.
 *    An uninstructed crawler wakes Fluid Compute and burns Neon CU-hours to
 *    render 401 shells. That is real money for zero return.
 * 3. **Nothing here is public content.** Every operator surface is behind a
 *    session, so there is no indexable page to lose by denying.
 *
 * **Scan routes are unaffected.** `/q` · `/l` · `/p` · `/s` · `/m/r/{id}` ·
 * `/gs1/resolve` · `/carton` · `/serial` · `/bin` are reached by a phone camera
 * pointed at a printed sticker (see `encodePrintMatrix` → `routeScan`). robots.txt
 * governs CRAWLERS, never users — denying them costs nothing operationally, and
 * every one of those URLs keeps resolving exactly as it does today.
 *
 * **This is crawl control, not index control.** A URL blocked here can still be
 * indexed URL-only if something external links to it, and a crawler that never
 * fetches the page never sees a `noindex` meta tag. The `X-Robots-Tag` header in
 * `next.config.ts` is the half that actually deindexes, and it also catches bots
 * that ignore robots.txt outright. Keep both — neither is sufficient alone.
 *
 * **Do NOT copy this file to the marketing site.** The apex (`cycleforge.ai`) is
 * a separate Vercel project whose entire job is being found, by search engines
 * and by AI agents alike. It ships its own permissive robots + a sitemap, and it
 * must stay open to the retrieval crawlers — `OAI-SearchBot`, `ChatGPT-User`,
 * `PerplexityBot`, `Perplexity-User`, `Claude-SearchBot`, `Claude-User`,
 * `Bingbot` (which feeds Copilot). A blanket deny is right here and wrong there;
 * the two hosts have opposite jobs.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                disallow: '/',
            },
        ],
    };
}
