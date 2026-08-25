/**
 * Preload for the recessed shell chrome only — not the hosted app.
 *
 * Named window actions. No generic invoke, no filesystem, no app bridge.
 * The hosted app keeps using preload.js / cycleForgeDesktop.
 */

const { contextBridge, ipcRenderer } = require('electron');

const ACTIONS = new Set(['min', 'max', 'close']);

contextBridge.exposeInMainWorld('cycleForgeChrome', {
  platform: process.platform,
  windowAction: (action) => {
    if (!ACTIONS.has(action)) return;
    ipcRenderer.send('cf:chrome-window', action);
  },
});
