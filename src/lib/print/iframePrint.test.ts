import test from 'node:test';
import assert from 'node:assert/strict';
import { printHtmlInIframe, reserveLegacyPrintPopup } from './iframePrint';

test('falls back to a popup print document when iframe srcdoc is unavailable', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const html = '<!doctype html><html><body><script>window.print()</script></body></html>';
  let opened = false;
  let written = '';

  const popup = {
    document: {
      open() {},
      write(value: string) {
        written = value;
      },
      close() {},
    },
  };

  globalThis.window = {
    open() {
      opened = true;
      return popup;
    },
  } as unknown as Window & typeof globalThis;
  globalThis.document = {
    body: { appendChild() {} },
    createElement() {
      return {
        setAttribute() {},
        style: { cssText: '' },
      };
    },
  } as unknown as Document;

  try {
    assert.equal(printHtmlInIframe(html, { name: 'Legacy label' }), true);
    assert.equal(opened, true);
    assert.equal(written, html);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('uses a popup reserved during the button gesture after label HTML loads', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const html = '<!doctype html><html><body>reserved</body></html>';
  let openCount = 0;
  let written = '';
  const popup = {
    document: {
      open() {},
      write(value: string) {
        written = value;
      },
      close() {},
    },
  };

  globalThis.window = {
    open() {
      openCount += 1;
      return popup;
    },
  } as unknown as Window & typeof globalThis;
  globalThis.document = {
    body: { appendChild() {} },
    createElement() {
      return { setAttribute() {}, style: { cssText: '' } };
    },
  } as unknown as Document;

  try {
    const reserved = reserveLegacyPrintPopup();
    assert.notEqual(reserved, null);
    assert.equal(printHtmlInIframe(html, { name: 'Reserved label', legacyPopup: reserved }), true);
    assert.equal(openCount, 1);
    assert.equal(written, html);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('routes supplied paperwork HTML through a rendered off-screen iframe', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const html = '<!doctype html><html><body>repair paperwork</body></html>';
  let appended: {
    srcdoc?: string;
    style: { cssText: string };
    setAttribute(): void;
  } | null = null;

  globalThis.window = {
    setTimeout() { return 1; },
  } as unknown as Window & typeof globalThis;
  globalThis.document = {
    body: {
      appendChild(node: typeof appended) { appended = node; },
    },
    createElement() {
      return {
        srcdoc: '',
        setAttribute() {},
        style: { cssText: '' },
        remove() {},
      };
    },
  } as unknown as Document;

  try {
    assert.equal(printHtmlInIframe(html, { name: 'Repair paperwork' }), true);
    assert.equal(appended?.srcdoc, html);
    assert.match(appended?.style.cssText ?? '', /left:-10000px/);
    assert.doesNotMatch(appended?.style.cssText ?? '', /visibility:hidden|display:none/);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
