'use client';

/**
 * shadcn/ui Label, restyled to house tokens.
 *
 * Implemented on the native `<label>` rather than `@radix-ui/react-label`
 * (not installed; the radix part only adds double-click text-selection
 * suppression). Keeps shadcn's `data-slot` naming and peer-disabled styling so
 * a generated call site drops in unchanged.
 */

import * as React from 'react';
import { cn } from '@/utils/_cn';

/**
 * **Sentence case, not an eyebrow.** The house `typography/presets.ts` defines
 * `fieldLabel` as `uppercase tracking-[0.16em]`, and this primitive first
 * copied it — which made every form on the shadcn lane a wall of 11px caps.
 *
 * Two reasons it reads in sentence case here instead:
 *
 *   1. Upstream shadcn's Label is `text-sm font-medium` — sentence case. This
 *      lane exists to be shadcn's lineage; adopting the house eyebrow was drift
 *      FROM that, not toward it.
 *   2. Caps cost legibility exactly where a form can least afford it. All-caps
 *      strips the ascender/descender silhouette a reader shapes words from, so
 *      a scanning operator parses letter by letter. Wide tracking then spends
 *      horizontal room to make it worse. An eyebrow is for a section *marker*
 *      read once; a field label is read on every pass.
 *
 * (Operator direction, 2026-08-31: "a more breathable font instead of caps
 * lock".) Eyebrow styling stays available for genuine eyebrows via the presets.
 */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- association is the caller's htmlFor/nesting
    <label
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-2 text-role-caption font-medium text-text-muted',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
