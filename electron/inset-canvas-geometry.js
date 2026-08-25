/**
 * Inset-canvas geometry — the Arc-style inverted frame.
 *
 * The window chrome (top + left) sits at a LOWER elevation. The hosted app
 * sits on a raised rounded card inset from that chrome. Right/bottom keep a
 * thin float gap so the card reads as a slab, not a flush fill.
 *
 * Pure functions, no Electron — so the numbers can be unit-tested without
 * booting a window. Fullscreen collapses the inset so the station does not
 * lose scan-bench pixels to decorative gutters.
 */

const INSET = Object.freeze({
  top: 40,
  left: 56,
  right: 8,
  bottom: 8,
  radius: 12,
});

/**
 * @param {{ width: number, height: number, fullscreen?: boolean }} size
 * @returns {{ x: number, y: number, width: number, height: number, radius: number }}
 */
function canvasBounds(size) {
  const width = Math.max(0, Number(size?.width) || 0);
  const height = Math.max(0, Number(size?.height) || 0);
  if (size?.fullscreen) {
    return { x: 0, y: 0, width, height, radius: 0 };
  }
  return {
    x: INSET.left,
    y: INSET.top,
    width: Math.max(0, width - INSET.left - INSET.right),
    height: Math.max(0, height - INSET.top - INSET.bottom),
    radius: INSET.radius,
  };
}

/**
 * Map a rect in APP-view coordinates into WINDOW content coordinates.
 * VendorView bounds are measured by the renderer against the hosted app
 * viewport, which after the invert is the inset card — not the window.
 *
 * @param {{ x: number, y: number, width: number, height: number }} appBounds
 * @param {{ x: number, y: number }} canvas
 */
function mapAppBoundsToWindow(appBounds, canvas) {
  const originX = Number(canvas?.x) || 0;
  const originY = Number(canvas?.y) || 0;
  return {
    x: originX + (Number(appBounds?.x) || 0),
    y: originY + (Number(appBounds?.y) || 0),
    width: Math.max(0, Number(appBounds?.width) || 0),
    height: Math.max(0, Number(appBounds?.height) || 0),
  };
}

/**
 * Full-card takeover, leaving `chromeH` at the top of the card for the in-app
 * Close control. The 48px strip lives INSIDE the raised canvas, not in the
 * recessed gutter.
 *
 * @param {{ x: number, y: number, width: number, height: number }} canvas
 * @param {number} chromeH
 */
function takeoverBounds(canvas, chromeH) {
  const top = Math.max(0, Number(chromeH) || 0);
  return {
    x: Number(canvas?.x) || 0,
    y: (Number(canvas?.y) || 0) + top,
    width: Math.max(0, Number(canvas?.width) || 0),
    height: Math.max(0, (Number(canvas?.height) || 0) - top),
  };
}

module.exports = {
  INSET,
  canvasBounds,
  mapAppBoundsToWindow,
  takeoverBounds,
};
