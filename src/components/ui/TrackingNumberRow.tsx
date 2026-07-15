'use client';

import { useState, type ReactNode } from 'react';
import { Copy, ExternalLink, RefreshCw } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { DetailsPanelRow } from '@/design-system/components/DetailsPanelRow';
import { getTrackingUrl, getTrackingUrlByCarrier } from '@/lib/tracking-format';

export interface TrackingNumberRowProps {
  value: string;
  /** Uppercase ledger label. Default "Tracking Number" (shipped panel wording). */
  label?: string;
  placeholder?: string;
  /** Inline-edit change handler. Only wired when `allowEdit` is on. */
  onChange?: (value: string) => void;
  /** Fired when the inline editor blurs (commit point). Only when `allowEdit`. */
  onBlur?: () => void;
  /** @deprecated The paste-&-replace clipboard icon was replaced by the carrier
   *  external-link icon. Accepted (so existing callers keep type-checking) but no
   *  longer rendered. Use {@link onReplace} for the explicit replace flow. */
  onPasteReplace?: () => Promise<void> | void;
  /**
   * Explicit "replace tracking number" commit. When provided, a Replace action
   * (↻) renders in the row; clicking it opens a seeded inline editor where the
   * operator can type OR paste a new number. Commits `onReplace(next)` on Enter
   * or blur when the value actually changed; Esc cancels. Independent of
   * {@link allowEdit} (which is click-the-value inline editing).
   */
  onReplace?: (next: string) => void | Promise<void>;
  /**
   * Click-to-edit the value inline. The shipped panel leaves this off (edits go
   * through its modal); the receiving panel turns it on so tracking stays
   * hand-editable while still rendering identically when not being edited.
   */
  allowEdit?: boolean;
  headerAccessory?: ReactNode;
  headerAccessoryClassName?: string;
  /** Keep the bottom divider even as the last child (rows above more content). */
  keepBottomDivider?: boolean;
  className?: string;
  dividerClassName?: string;
}

/**
 * Canonical tracking-number display row, extracted from the shipped details
 * panel (the reference design) so the receiving details panel renders tracking
 * the exact same way — uppercase label, bold value, an external-link to the
 * carrier's tracking page (for the in-depth carrier updates), and copy.
 */
export function TrackingNumberRow({
  value,
  label = 'Tracking Number',
  placeholder = 'No tracking number',
  onChange,
  onBlur,
  onReplace,
  allowEdit = false,
  headerAccessory,
  headerAccessoryClassName,
  keepBottomDivider = false,
  className,
  dividerClassName,
}: TrackingNumberRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Replace flow — a local seeded draft (null = not replacing) so it never
  // collides with the `allowEdit` click-to-edit path above.
  const [replaceDraft, setReplaceDraft] = useState<string | null>(null);
  const isReplacing = replaceDraft !== null;
  const displayValue = String(value || '').trim();
  const iconClassName = 'h-3.5 w-3.5';

  const commitReplace = async () => {
    const next = String(replaceDraft ?? '').trim();
    setReplaceDraft(null);
    if (onReplace && next && next !== displayValue) {
      await onReplace(next);
    }
  };
  // Carrier tracking page for the live in-depth updates. getTrackingUrl resolves
  // known carriers by number pattern; fall back to the carrier-agnostic builder
  // (a tracking-number web search) so the link always opens something useful.
  const trackingUrl = displayValue
    ? (getTrackingUrl(displayValue) ?? getTrackingUrlByCarrier(displayValue, ''))
    : null;

  const actions = (
    <div className="flex items-center gap-1.5 text-text-faint">
      {onReplace ? (
        <HoverTooltip label={`Replace ${label}`} asChild>
          <IconButton
            tone="accent"
            ariaLabel={`Replace ${label}`}
            onClick={() => setReplaceDraft(displayValue)}
            icon={<RefreshCw className={iconClassName} />}
          />
        </HoverTooltip>
      ) : null}
      {trackingUrl ? (
        <HoverTooltip label={`Open ${label} on the carrier site for full tracking updates`} asChild>
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="transition-colors hover:text-blue-600"
            aria-label={`Track ${label} on the carrier site`}
          >
            <ExternalLink className={iconClassName} />
          </a>
        </HoverTooltip>
      ) : null}
      <HoverTooltip label={`Copy ${label}`} asChild>
        <IconButton
          ariaLabel={`Copy ${label}`}
          onClick={() => {
            if (!displayValue) return;
            navigator.clipboard.writeText(displayValue);
          }}
          icon={<Copy className={iconClassName} />}
        />
      </HoverTooltip>
    </div>
  );

  const rowClassName = keepBottomDivider
    ? (className ?? '')
    : className
      ? `${className} last:border-b-0`
      : 'last:border-b-0';

  return (
    <DetailsPanelRow
      label={label}
      headerAccessory={headerAccessory ? (
        <span className={headerAccessoryClassName || 'text-role-micro uppercase tracking-wide text-text-soft'}>
          {headerAccessory}
        </span>
      ) : null}
      actions={actions}
      className={rowClassName}
      dividerClassName={dividerClassName}
    >
      {isReplacing ? (
        <input
          type="text"
          value={replaceDraft ?? ''}
          onChange={(e) => setReplaceDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commitReplace();
            } else if (e.key === 'Escape') {
              setReplaceDraft(null);
            }
          }}
          onBlur={() => { void commitReplace(); }}
          placeholder={placeholder}
          autoFocus
          className="h-8 w-full border-0 bg-transparent px-0 text-sm font-bold text-text-default outline-none ring-0"
        />
      ) : allowEdit && isEditing ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            onBlur?.();
          }}
          placeholder={placeholder}
          autoFocus
          className="h-8 w-full border-0 bg-transparent px-0 text-sm font-bold text-text-default outline-none ring-0"
        />
      ) : allowEdit ? (
        <button type="button" onClick={() => setIsEditing(true)} className="ds-raw-button block w-full py-0 text-left">
          <p className="truncate text-sm font-bold text-text-default">{displayValue || placeholder}</p>
        </button>
      ) : (
        <p className="truncate text-sm font-bold text-text-default">{displayValue || placeholder}</p>
      )}
    </DetailsPanelRow>
  );
}
