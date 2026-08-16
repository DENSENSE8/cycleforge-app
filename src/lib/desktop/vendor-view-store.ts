/**
 * Renderer-side VendorView mask state.
 *
 * React paints an opaque full-window mask BEFORE Main opens the WebContentsView
 * so Unbox layout does not thrash. Main owns the native view bounds below the
 * chrome strip; Esc / Ctrl+] / Close clear both sides.
 */

/**
 * `takeover` = full-window vendor console (helpdesk golden) — the React mask
 * paints the whole window and owns the Close chrome.
 * `anchored`  = the view is bounded to a slot the FEATURE owns (Unbox Listings
 * dropdown inside the Displays column). The mask host must paint nothing there:
 * a full-window scrim over an anchored view would cover the carton the operator
 * is unboxing, which is the whole reason the dropdown exists.
 */
export type VendorViewMode = 'takeover' | 'anchored';

export type VendorViewMaskState = {
  open: boolean;
  /** Capability / helpdesk label for the chrome title (never a hardcoded brand). */
  title: string;
  url: string | null;
  mode: VendorViewMode;
};

type Listener = () => void;

let state: VendorViewMaskState = {
  open: false,
  title: 'Helpdesk',
  url: null,
  mode: 'takeover',
};
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function getVendorViewMaskState(): VendorViewMaskState {
  return state;
}

export function subscribeVendorViewMask(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showVendorViewMask(opts: {
  title: string;
  url: string;
  mode?: VendorViewMode;
}): void {
  state = {
    open: true,
    title: opts.title,
    url: opts.url,
    mode: opts.mode ?? 'takeover',
  };
  emit();
}

export function hideVendorViewMask(): void {
  if (!state.open) return;
  state = { open: false, title: state.title, url: null, mode: state.mode };
  emit();
}
