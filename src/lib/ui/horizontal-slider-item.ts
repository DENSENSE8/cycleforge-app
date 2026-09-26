/** Horizontal button-slider item shape — the pure model behind the pill strip. */

export type HorizontalSliderTone =
  | 'zinc'
  | 'yellow'
  | 'emerald'
  | 'red'
  | 'blue'
  | 'orange'
  | 'purple';

export type HorizontalSliderItem = {
  id: string;
  label: string;
  count?: number;
  /** Used when variant is `fba`. */
  tone?: HorizontalSliderTone;
  /**
   * Leading icon. Used by the `nav` variant where desktop pills collapse to
   * icon-only and reveal the label on hover (or when active). Ignored by
   * other variants.
   */
  icon?: (props: { className?: string }) => JSX.Element;
  /**
   * Renders the pill as a non-interactive placeholder (e.g. "coming soon"
   * sections). Currently honored by the `nav` variant.
   */
  disabled?: boolean;
  /**
   * Status badge overlay — `'dot'` paints a small emerald dot at the top-right
   * of the pill to signal "there's something on this tab" without affecting
   * the click target. Honored by the `nav` variant.
   */
  badge?: 'dot' | null;
};
