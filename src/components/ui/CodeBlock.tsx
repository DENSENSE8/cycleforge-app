'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Copy } from '@/components/Icons';
import { Panel } from '@/design-system/primitives';


/** Fenced code block chrome for chat answers: */
export default function CodeBlock({ language, children }: { language?: string; children: ReactNode }) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = codeRef.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <Panel radius="lg" padding="none" className="my-2 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-soft bg-surface-canvas px-3 py-1.5">
        <span className="text-role-micro font-semibold uppercase tracking-wider text-text-soft">{language || 'code'}</span>
        <button
          type="button"
          onClick={copy}
          className="ds-raw-button inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-role-micro font-semibold text-text-soft transition-colors hover:bg-surface-strong hover:text-text-default"
          aria-label="Copy code"
        >
          <Copy className="h-3 w-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-role-caption leading-5">
        <code ref={codeRef} className={`hljs language-${language ?? ''} bg-transparent font-mono text-text-default`}>
          {children}
        </code>
      </pre>
    </Panel>
  );
}
