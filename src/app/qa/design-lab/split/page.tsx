import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { SplitCompare } from '@/components/design-lab/SplitCompare';
import { DESIGN_LAB_HREF } from '@/lib/design-lab/constants';

export const metadata = { title: 'Design Lab · Split' };

/**
 * Side-by-side compare — the same route in two same-origin iframes, one per
 * skin generation. Session cookies carry over, so both sides are the real
 * signed-in QA surface rather than a screenshot.
 *
 * `href` is validated here: an app-relative path only. A protocol-relative or
 * absolute URL would turn this page into an open frame-embedder.
 */
function safeRoute(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.includes('\\')) return null;
  return raw;
}

export default async function DesignLabSplitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.href) ? params.href[0] : params.href;
  const route = safeRoute(raw);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <PageHeader
        title="Split compare"
        backHref={DESIGN_LAB_HREF}
        metaSlot={
          route ? <code className="text-role-micro text-text-soft">{route}</code> : undefined
        }
      />
      {route ? (
        <SplitCompare route={route} />
      ) : (
        <main className="flex flex-1 items-center justify-center">
          <p className="text-role-body text-text-muted">
            No route to compare —{' '}
            <Link href={DESIGN_LAB_HREF} className="underline">
              pick a viewpoint
            </Link>
            .
          </p>
        </main>
      )}
    </div>
  );
}
