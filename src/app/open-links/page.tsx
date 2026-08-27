'use client';

import { useMemo } from 'react';
import { WorkspaceCard } from '@/design-system/components';
import { OpenListingLinksPanel } from '@/components/receiving/workspace/line-edit/OpenListingLinksPanel';

function parseLinksParam(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v !== 'string') continue;
      const t = v.trim();
      if (!t) continue;
      out.push(t);
    }
    return out;
  } catch {
    return [];
  }
}

export default function OpenLinksPage() {
  const links = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return parseLinksParam(sp.get('links'));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <WorkspaceCard variant="solid" bodyClassName="p-4">
        <OpenListingLinksPanel hrefs={links} />
      </WorkspaceCard>
    </div>
  );
}
