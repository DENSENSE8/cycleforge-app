import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface KeyboardState {
  /** True when the mobile virtual keyboard is visible. Always false on desktop. */
  isKeyboardOpen: boolean;
  /** Estimated height of the keyboard in CSS pixels (0 when closed). */
  keyboardHeight: number;
  /** Height of the visible viewport (excludes keyboard area). */
  visibleHeight: number;
}

interface UseKeyboardOptions {
  /**
   * When true, auto-scrolls the focused input to the vertical center of the
   * visible viewport whenever the keyboard opens. Default: false.
   */
  centerOnFocus?: boolean;
  /**
   * Minimum height reduction (px) between `window.innerHeight` and
   * `visualViewport.height` to consider the keyboard open. Default: 150.
   */
  threshold?: number;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/** Universal mobile keyboard detection hook. */
export function useKeyboard(options: UseKeyboardOptions = {}) {
  const { centerOnFocus = false, threshold = 150 } = options;

  const [state, setState] = useState<KeyboardState>({
    isKeyboardOpen: false,
    keyboardHeight: 0,
    visibleHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  // Baseline height — captured on mount and after orientation changes.
  const baselineRef = useRef(
    typeof window !== 'undefined' ? window.innerHeight : 0,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    baselineRef.current = window.innerHeight;
    // iOS scrolls the layout viewport to reveal a focused field and can leave it
    // scrolled after the keys close, parking fixed bottom sheets above a dead
    // gap. Remember the scroll from before the keys opened and put it back.
    let wasOpen = false;
    let scrollBeforeOpen = window.scrollY;
    // Focus lands before iOS scrolls to the field: that is the position to restore.
    const rememberScroll = () => {
      if (!wasOpen) scrollBeforeOpen = window.scrollY;
    };
    document.addEventListener('focusin', rememberScroll);

    const measure = () => {
      const baseline = baselineRef.current;
      const layoutHeight = window.innerHeight;
      const visible = vv.height;
      // iOS often scrolls the visual viewport (`offsetTop`) without shrinking
      // `innerHeight`. Ignoring it over-counts the obscured band and parks a
      // `bottom: keyboardHeight` bar with a dead gap above the keys.
      const obscured = Math.max(0, layoutHeight - visible - vv.offsetTop);
      const layoutShrink = Math.max(0, baseline - layoutHeight);
      // Overlay keyboards shrink the visual viewport; `resizes-content` shrinks
      // the layout viewport instead. Either means the keys are up.
      const isOpen = obscured > threshold || layoutShrink > threshold;
      // Only the overlay inset is useful for `position: fixed; bottom: …`.
      // When the layout itself resized, a bottom-anchored sheet is already flush
      // — lifting by `layoutShrink` would double-count and leave a gap.
      const keyboardHeight = obscured > threshold ? obscured : 0;

      if (!isOpen && wasOpen && window.scrollY !== scrollBeforeOpen) window.scrollTo(0, scrollBeforeOpen);
      wasOpen = isOpen;

      setState({
        isKeyboardOpen: isOpen,
        keyboardHeight,
        visibleHeight: visible,
      });

      // Auto-center the focused element in the visible viewport.
      if (isOpen && centerOnFocus) {
        requestAnimationFrame(() => {
          const el = document.activeElement;
          if (!el || !(el instanceof HTMLElement)) return;

          const rect = el.getBoundingClientRect();
          const viewportTop = vv.offsetTop;
          const viewportCenter = viewportTop + visible / 2;
          const elCenter = rect.top + rect.height / 2;
          const offset = elCenter - viewportCenter;

          if (Math.abs(offset) > 10) {
            window.scrollBy({ top: offset, behavior: 'smooth' });
          }
        });
      }
    };

    vv.addEventListener('resize', measure);
    // Focus often scrolls the visual viewport without a resize — keep the bar
    // glued to the keys while `offsetTop` moves.
    vv.addEventListener('scroll', measure);
    measure();

    // Recalculate baseline after orientation change (layout needs time to settle).
    const handleOrientation = () => {
      setTimeout(() => {
        baselineRef.current = window.innerHeight;
        measure();
      }, 300);
    };
    window.addEventListener('orientationchange', handleOrientation);

    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      window.removeEventListener('orientationchange', handleOrientation);
      document.removeEventListener('focusin', rememberScroll);
    };
  }, [centerOnFocus, threshold]);

  /**
   * Manually scroll a specific element to the vertical center of the
   * visible viewport. Works with or without the keyboard being open.
   */
  const scrollToCenter = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const rect = el.getBoundingClientRect();
    const viewportCenter = vv.offsetTop + vv.height / 2;
    const elCenter = rect.top + rect.height / 2;
    const offset = elCenter - viewportCenter;

    if (Math.abs(offset) > 10) {
      window.scrollBy({ top: offset, behavior: 'smooth' });
    }
  }, []);

  return { ...state, scrollToCenter };
}
