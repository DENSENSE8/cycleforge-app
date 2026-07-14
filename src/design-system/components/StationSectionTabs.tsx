'use client';

/**
 * StationSectionTabs — the shared icon/label tab switcher that sits in the seam
 * BETWEEN a station's identity/header card and its primary content surface
 * (unbox, testing, shipping). It is a thin domain wrapper over the house tab SoT
 * `HorizontalButtonSlider` (the same segmented control mode rails use), so every
 * station gets the identical switcher instead of a page-local twin — supply a
 * tab config + render your body by the active id.
 *
 * - `presentation="icon"` → `segmented` icon-only tabs (unbox, testing). A tab
 *   appended at runtime (e.g. a Units tab that appears once serials are scanned)
 *   animates itself in via the slider's opt-in mount motion.
 * - `presentation="label"` → `nav` labeled pills (shipping, where 6 sections stay
 *   legible with text).
 *
 * Renders nothing for a single view — a switcher only earns its place once there
 * are ≥2 tabs to switch between.
 */

import {
  HorizontalButtonSlider,
  type HorizontalSliderItem,
} from '@/components/ui/HorizontalButtonSlider';

export interface StationSectionTab {
  id: string;
  /** Accessible name — shown as the pill label (`label`) or the hover tooltip (`icon`). */
  label: string;
  /** Leading icon from `@/components/Icons` (required for `presentation="icon"`). */
  icon?: (props: { className?: string }) => JSX.Element;
  count?: number;
}

export function StationSectionTabs({
  items,
  value,
  onChange,
  presentation = 'icon',
  className,
  ariaLabel = 'Section tabs',
}: {
  items: StationSectionTab[];
  value: string;
  onChange: (id: string) => void;
  presentation?: 'icon' | 'label';
  className?: string;
  ariaLabel?: string;
}) {
  if (items.length < 2) return null;

  const sliderItems: HorizontalSliderItem[] = items.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    count: t.count,
  }));

  // Compact, left-aligned pills in the body seam: `nav` gives content-sized
  // 32px pills (icon-only when `presentation="icon"`) with a sliding active
  // pill — far better here than `segmented`, which splits the full column width.
  return (
    <HorizontalButtonSlider
      items={sliderItems}
      value={value}
      onChange={onChange}
      variant="nav"
      dense
      navIconOnly={presentation === 'icon'}
      animateItemMount
      className={className}
      aria-label={ariaLabel}
    />
  );
}
