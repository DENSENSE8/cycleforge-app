import type { MetadataRoute } from 'next';

/** `robots.txt` for the APP host (`app.cycleforge.ai` / `{tenant}.app.cycleforge.ai`). */
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
