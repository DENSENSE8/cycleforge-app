'use client';

import { LEGAL_DOCS, LEGAL_INDEX_BLURB, type LegalDoc } from '@/content/legal';
import { Button } from '@/design-system/primitives';
import { ExternalLinkActionIcon } from '@/design-system/components/ExternalLinkActionIcon';

/**
 * Settings → Legal & Policies.
 *
 * LINK ROWS, not an inline corpus (Impeccable audit + design review,
 * 2026-09-06): the full ToS/Privacy/DPA markdown was ~60% of /settings/me's
 * 23,100px scroll and buried operator controls under bench-irrelevant text.
 * The authoritative copies live at cycleforge.ai/legal; each row links out
 * and offers the markdown download. The page-level section eyebrow supplies
 * the heading (no duplicate h2 here).
 */
const LEGAL_SITE_BASE = 'https://cycleforge.ai/legal';

function download(doc: LegalDoc) {
  const blob = new Blob([doc.md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cycleforge-${doc.slug}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LegalSection() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">{LEGAL_INDEX_BLURB}</p>

      {/* Draft disclaimer — these are pre-counsel working drafts. */}
      <div className="rounded-xl border border-dashed border-border-warning bg-surface-warning px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-warning">
          Draft — pending legal review
        </p>
        <p className="mt-1 text-xs leading-5 text-text-warning">
          Working drafts, not legal advice; bracketed placeholders must be completed
          before publication.
        </p>
      </div>

      {LEGAL_DOCS.map((doc) => (
        <div
          key={doc.slug}
          className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-card p-4"
        >
          <div className="min-w-0 flex-1">
            <a
              href={`${LEGAL_SITE_BASE}/${doc.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-default hover:underline"
            >
              {doc.label}
              <ExternalLinkActionIcon ariaLabel={`Open ${doc.label} on cycleforge.ai`} />
            </a>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => download(doc)}
            className="shrink-0"
          >
            Download .md
          </Button>
        </div>
      ))}
    </div>
  );
}
