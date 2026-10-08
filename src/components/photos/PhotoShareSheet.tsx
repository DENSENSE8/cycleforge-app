'use client';

/**
 * The share sheet — rises from the library's bottom edge once share links or a
 * share page are ready, and stays until the operator closes it. The link was
 * already copied during the press when the browser allowed it; the sheet's own
 * Copy button is a fresh press, so it always works.
 */

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, X } from '@/components/Icons';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionPresenceMobile, motionTransitionMobile } from '@/design-system/foundations/motion-presets';
import { Button, IconButton } from '@/design-system/primitives';
import { ACTION_DOCK_LIFT } from '@/design-system/tokens/dock-clearance';
import { cornerClass } from '@/design-system/tokens/radius';
import type { PhotoShareReady } from '@/hooks/usePhotoShareLinks';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';
import { cn } from '@/utils/_cn';

export function PhotoShareSheet({
  ready,
  onDismiss,
  aboveDock,
}: {
  ready: PhotoShareReady | null;
  onDismiss: () => void;
  /** The selection dock is showing — sit above it instead of on the edge. */
  aboveDock: boolean;
}) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(ready?.copied ?? false);
  }, [ready]);

  const copy = async () => {
    if (!ready) return;
    const ok = await copyToClipboard(ready.text, {
      historyKind: ready.kind === 'page' ? 'photo-share-page' : 'photo-share-links',
    });
    setCopied(ok);
    if (!ok) toast.error('Couldn’t reach the clipboard — select the link and press ⌘C');
  };

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const title = ready?.kind === 'page'
    ? 'Your shareable page is ready'
    : `${plural(ready?.count ?? 0, 'share link')} ready`;
  const detail = [
    copied ? 'Copied to your clipboard' : 'Press Copy to put it on your clipboard',
    ready?.kind === 'page' ? plural(ready.count, 'photo') : null,
    ready?.expiresInLabel ? `expires in ${ready.expiresInLabel}` : null,
    ready?.skipped ? `${ready.skipped} skipped (not found)` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const shown = ready?.url ?? ready?.text.split('\n')[0] ?? '';

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-full z-sticky flex justify-center px-3',
        aboveDock ? 'pb-20' : ACTION_DOCK_LIFT,
      )}
    >
      <AnimatePresence>
        {ready ? (
          <motion.div
            key={ready.text}
            {...motionPresenceMobile.sheet}
            transition={reduce ? { duration: 0 } : motionTransitionMobile.sheetSlide}
            role="status"
            aria-live="polite"
            data-testid="photo-share-sheet"
            className={cn(
              'pointer-events-auto flex w-[min(34rem,calc(100vw-2rem))] flex-col gap-3 bg-surface-card p-4 shadow-xl ring-1 ring-inset ring-border-soft',
              cornerClass('card'),
            )}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center bg-surface-sunken text-text-default [&_svg]:h-4 [&_svg]:w-4',
                  cornerClass('pill'),
                )}
              >
                {copied ? <Check /> : <Link2 />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-role-body font-semibold text-text-default">{title}</p>
                <p className="text-role-caption text-text-soft">{detail}</p>
              </div>
              <IconButton
                icon={<X className="h-4 w-4" />}
                ariaLabel="Close"
                size="md"
                radius="pill"
                onClick={onDismiss}
                data-testid="photo-share-sheet-close"
              />
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <p
                className={cn(
                  'min-w-0 flex-1 select-all truncate bg-surface-sunken px-3 py-2 font-mono text-role-caption text-text-default',
                  cornerClass('field'),
                )}
                title={shown}
                data-testid="photo-share-sheet-url"
              >
                {shown}
              </p>
              {ready.kind === 'page' && ready.url ? (
                <Button variant="secondary" size="md" radius="pill" icon={<ExternalLink />} href={ready.url}>
                  Open
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="md"
                radius="pill"
                icon={copied ? <Check /> : <Copy />}
                onClick={() => void copy()}
                data-testid="photo-share-sheet-copy"
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
