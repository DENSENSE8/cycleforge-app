/**
 * Raised app card inside the recessed window chrome.
 *
 * The BrowserWindow paints the inverted frame (top + left gutters). This
 * module mounts the hosted Next app in a WebContentsView on that card so the
 * app layout stays identical to the browser — the shell insets the VIEW, it
 * does not pad the page.
 *
 * Legacy Electron 22 has no WebContentsView: callers fall back to loading
 * the app in the window itself.
 */

const path = require('path');
const { WebContentsView } = require('electron');
const { canvasBounds } = require('./inset-canvas-geometry');

/**
 * @param {import('electron').BrowserWindow} win
 * @param {{
 *   preloadPath: string,
 * }} opts
 */
function attachInsetCanvas(win, opts) {
  if (typeof WebContentsView !== 'function') {
    return {
      supported: false,
      getAppWebContents: () => win.webContents,
      getCanvasBounds: () => {
        const [width, height] = win.getContentSize();
        return canvasBounds({ width, height, fullscreen: true });
      },
      loadApp: (url) => win.loadURL(url),
    };
  }

  const view = new WebContentsView({
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  win.contentView.addChildView(view);

  const layout = () => {
    const [width, height] = win.getContentSize();
    const bounds = canvasBounds({
      width,
      height,
      fullscreen: win.isFullScreen(),
    });
    view.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    if (typeof view.setBorderRadius === 'function') {
      view.setBorderRadius(bounds.radius);
    }
  };

  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  layout();

  return {
    supported: true,
    getAppWebContents: () => view.webContents,
    getCanvasBounds: () => {
      const [width, height] = win.getContentSize();
      return canvasBounds({
        width,
        height,
        fullscreen: win.isFullScreen(),
      });
    },
    loadApp: (url) => view.webContents.loadURL(url),
  };
}

function chromeFileUrl() {
  return `file://${path.join(__dirname, 'chrome.html')}`;
}

module.exports = {
  attachInsetCanvas,
  chromeFileUrl,
};
