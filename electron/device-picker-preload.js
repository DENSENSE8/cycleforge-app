/**
 * Preload for the device chooser only — not the hosted app.
 *
 * One inbound channel (the list) and two outbound (choose / cancel). No generic
 * invoke, no filesystem, no app bridge — same shape as chrome-preload.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cycleForgeDevicePicker', {
  onList: (listener) => {
    ipcRenderer.on('cf:device-picker-list', (_event, payload) => {
      try {
        listener(payload);
      } catch {
        /* listener fault must not tear down the bridge */
      }
    });
  },
  choose: (id) => ipcRenderer.send('cf:device-picker-choose', String(id)),
  cancel: () => ipcRenderer.send('cf:device-picker-cancel'),
});
