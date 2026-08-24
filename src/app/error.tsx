'use client';

/**
 * Per-route error boundary. Rewritten for the Warehouse-OS worktree
 * (2026-08-23): the old card imported the deleted `@/design-system`
 * primitives, which turned every route error into a module-not-found build
 * error — a boundary that cannot compile protects nothing.
 *
 * Dependency-free on purpose, styled inline from the shell's tokens: this is
 * the component that must still render when everything else is on fire.
 */

import { useEffect } from 'react';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error] uncaught route render error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-background)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        padding: '24px',
      }}
    >
      <div
        style={{
          border: '1px solid var(--border-danger)',
          background: 'var(--surfaceSubtle-danger)',
          padding: '24px',
          maxWidth: '420px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '13px', fontWeight: 600 }}>This screen hit an error</p>
        <p
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginTop: '8px',
            overflowWrap: 'anywhere',
          }}
        >
          {error?.message || 'Unexpected error.'}
          {error?.digest ? ` · ref ${error.digest}` : ''}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: '16px',
            padding: '5px 12px',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-container)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
