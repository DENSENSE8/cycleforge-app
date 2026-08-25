const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  INSET,
  canvasBounds,
  mapAppBoundsToWindow,
  takeoverBounds,
} = require('./inset-canvas-geometry');

describe('canvasBounds', () => {
  it('insets top+left more than right+bottom so the card reads as raised', () => {
    const b = canvasBounds({ width: 1600, height: 1000 });
    assert.equal(b.x, INSET.left);
    assert.equal(b.y, INSET.top);
    assert.equal(b.width, 1600 - INSET.left - INSET.right);
    assert.equal(b.height, 1000 - INSET.top - INSET.bottom);
    assert.equal(b.radius, INSET.radius);
    assert.ok(INSET.left > INSET.right, 'left gutter is the waterfall');
    assert.ok(INSET.top > INSET.bottom, 'top gutter is the waterfall');
  });

  it('collapses to a flush rect in fullscreen', () => {
    const b = canvasBounds({ width: 1600, height: 1000, fullscreen: true });
    assert.deepEqual(b, { x: 0, y: 0, width: 1600, height: 1000, radius: 0 });
  });

  it('never returns a negative size', () => {
    const b = canvasBounds({ width: 10, height: 10 });
    assert.equal(b.width, 0);
    assert.equal(b.height, 0);
  });
});

describe('mapAppBoundsToWindow', () => {
  it('offsets renderer rects by the canvas origin', () => {
    const mapped = mapAppBoundsToWindow(
      { x: 10, y: 20, width: 300, height: 400 },
      { x: 56, y: 40 },
    );
    assert.deepEqual(mapped, { x: 66, y: 60, width: 300, height: 400 });
  });
});

describe('takeoverBounds', () => {
  it('keeps the in-app close strip inside the raised card', () => {
    const canvas = canvasBounds({ width: 1600, height: 1000 });
    const t = takeoverBounds(canvas, 48);
    assert.equal(t.x, canvas.x);
    assert.equal(t.y, canvas.y + 48);
    assert.equal(t.width, canvas.width);
    assert.equal(t.height, canvas.height - 48);
  });
});
