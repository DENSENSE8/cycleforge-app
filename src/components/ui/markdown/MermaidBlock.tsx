'use client';

/**
 * A fenced ```mermaid``` block — flowcharts, `pie` and `xychart-beta` bar
 * charts drawn from the text (P6: a chart is a derived view of the doc's own
 * data, never a pasted image). `mermaid` is ~1 MB, so it loads on the first
 * diagram a reader actually sees, client-side only. A diagram that does not
 * parse shows why, with its source, instead of a blank box.
 */

import { useEffect, useId, useState } from 'react';
import type { Mermaid } from 'mermaid';
import CodeBlock from '@/components/ui/CodeBlock';

let mermaidLoad: Promise<Mermaid> | null = null;
let mermaidTheme: 'default' | 'dark' | null = null;

/** One module load per page; re-initialized only when the colour mode flips. */
async function loadMermaid(theme: 'default' | 'dark'): Promise<Mermaid> {
  mermaidLoad ??= import('mermaid').then((mod) => mod.default);
  const mermaid = await mermaidLoad;
  if (mermaidTheme !== theme) {
    // `strict`: no click handlers or HTML labels from document text.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'inherit' });
    mermaidTheme = theme;
  }
  return mermaid;
}

export function MermaidBlock({ source }: { source: string }) {
  const reactId = useId();
  const [state, setState] = useState<{ svg: string } | { error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'default';
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    loadMermaid(theme)
      .then(async (mermaid) => {
        await mermaid.parse(source);
        const { svg } = await mermaid.render(id, source);
        if (!cancelled) setState({ svg });
      })
      .catch((err: unknown) => {
        // A failed render can leave its scratch node behind in <body>.
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setState({ error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [source, reactId]);

  if (state && 'error' in state) {
    return (
      <figure className="my-3 rounded-mode border border-border-soft bg-surface-card" data-doc-mermaid-error>
        <figcaption role="alert" className="border-b border-border-hairline px-3 py-1.5 text-role-caption text-text-default">
          <span className="font-semibold">This diagram does not draw.</span>{' '}
          <span className="text-text-muted">{state.error.split('\n')[0]}</span>
        </figcaption>
        <CodeBlock language="mermaid">{source}</CodeBlock>
      </figure>
    );
  }
  return (
    <figure className="my-3 overflow-x-auto rounded-mode border border-border-soft bg-surface-card p-3" data-doc-mermaid>
      {state ? (
        // Mermaid's own SVG output, rendered with securityLevel 'strict'.
        <div className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: state.svg }} />
      ) : (
        <p className="text-role-caption text-text-muted">Drawing the diagram…</p>
      )}
    </figure>
  );
}
