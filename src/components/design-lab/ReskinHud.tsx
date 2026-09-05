'use client';

/**
 * The cherry-pick skin control for the QA Design Lab.
 *
 * Mounted app-wide by src/app/layout.tsx, but ONLY for a session that passes
 * `resolveDesignLabAccess` (QA sandbox org + `design_lab` flag). Dogfood never
 * ships this component, the reskin stylesheet, or the boot script.
 *
 * It rides OUTSIDE product chrome on purpose: the whole point is that the
 * routes under it are untouched real surfaces, so the lab must not become a
 * wrapper the product can accidentally depend on. Bottom-LEFT, clear of the
 * bottom-right AppToaster — and raised a row so it clears Next's dev-overlay
 * indicator, which owns the very corner in development and otherwise swallows
 * every click on this control (found 2026-09-02 driving the lab headless).
 *
 * ## Why a list and not a switch
 *
 * Operator, 2026-09-02: *"not a mass token change — I need to cherry pick and
 * nit pick."* Each group flips on its own, so a verdict can be "the rules are
 * right, the bench wells are wrong" instead of one undifferentiated yes/no.
 * Collapsed it is a single chip showing how many groups are live; open it is
 * the list. The panel is deliberately small and quiet — it sits on top of the
 * surface being judged, and a loud control would bias the judgement.
 *
 * Controls are `ui/button` — the shadcn-lane primitive for CHROME (quiet
 * controls inside a bar), not the house CTA Button, which is for things an
 * operator would call an action.
 *
 * No keyboard binding: standing keycaps and cheat sheets are refused by the
 * shortcut-display cohort, and a lab affordance is not worth opening that door.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/_cn';
import { Button } from '@/components/ui/button';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import {
  RESKIN_CANDIDATE,
  RESKIN_GROUPS,
  RESKIN_GROUP_IDS,
  reskinChangedKeys,
  reskinGroupSize,
  type ReskinGroupId,
} from '@/design-system/themes/reskin';
import {
  applyReskin,
  readReskinPreference,
  toggleReskinGroup,
} from '@/lib/theme/reskin';
import { DESIGN_LAB_HREF } from '@/lib/design-lab/constants';

export function ReskinHud() {
  const pathname = usePathname();
  const [selection, setSelection] = useState<readonly ReskinGroupId[]>([]);
  const [open, setOpen] = useState(false);

  // Reconcile once on mount and after every client navigation: the boot script
  // stamps <html> before paint, but a soft nav does not re-run it and a deep
  // link may carry a different `?reskin=`.
  useEffect(() => {
    setSelection(applyReskin(readReskinPreference()));
  }, [pathname]);

  const toggle = useCallback((group: ReskinGroupId) => {
    setSelection((current) => applyReskin(toggleReskinGroup(current, group)));
  }, []);

  const setAll = useCallback((on: boolean) => {
    setSelection(applyReskin(on ? [...RESKIN_GROUP_IDS] : []));
  }, []);

  const liveGroups = selection.length;
  const changedCount = reskinChangedKeys(selection).length;
  const onLab = pathname === DESIGN_LAB_HREF || pathname.startsWith(`${DESIGN_LAB_HREF}/`);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Design Lab skin: ${liveGroups} of ${RESKIN_GROUP_IDS.length} groups live`}
        className={cn(
          'fixed bottom-14 left-3 z-toast gap-1.5 tabular-nums',
          cornerClass('control'),
          elevationClass('raised'),
        )}
        data-design-lab-hud=""
      >
        <span className="text-role-eyebrow font-semibold uppercase tracking-wide text-text-faint">
          Skin
        </span>
        <span className="text-role-micro">
          {liveGroups === 0 ? 'Before' : `${liveGroups}/${RESKIN_GROUP_IDS.length}`}
        </span>
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'fixed bottom-14 left-3 z-toast w-64 border border-border-soft bg-surface-card',
        cornerClass('control'),
        elevationClass('raised'),
      )}
      data-design-lab-hud=""
    >
      <div className="flex items-center gap-1 border-b border-border-soft px-2 py-1.5">
        <span className="flex-1 pl-1 text-role-eyebrow font-semibold uppercase tracking-wide text-text-faint">
          Skin · {RESKIN_CANDIDATE.name}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
          All
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAll(false)}>
          None
        </Button>
        <Button
          variant="ghost"
          size="iconTight"
          onClick={() => setOpen(false)}
          aria-label="Collapse the Design Lab skin control"
        >
          ×
        </Button>
      </div>

      <ul className="max-h-[52vh] overflow-y-auto py-1">
        {RESKIN_GROUPS.map((group) => {
          const on = selection.includes(group.id);
          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-pressed={on}
                title={group.note}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-left',
                  'hover:bg-surface-hover',
                  on ? 'text-text-primary' : 'text-text-muted',
                )}
              >
                {/* State is a filled mark, not a colour-only cue: the accent
                    group can be OFF while judging it, so the control must not
                    depend on the accent it is toggling. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-3 shrink-0 border',
                    cornerClass('chip'),
                    on ? 'border-edge-accent bg-edge-accent' : 'border-border-strong bg-transparent',
                  )}
                />
                <span className="flex-1 truncate text-role-nav">{group.label}</span>
                <span className="shrink-0 text-role-micro tabular-nums text-text-faint">
                  {reskinGroupSize(group)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 border-t border-border-soft px-3 py-1.5">
        <span className="flex-1 text-role-micro tabular-nums text-text-faint">
          {liveGroups === 0
            ? 'Before — today’s tokens'
            : `${changedCount} variables differ`}
        </span>
        {!onLab && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={DESIGN_LAB_HREF}>Lab</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
