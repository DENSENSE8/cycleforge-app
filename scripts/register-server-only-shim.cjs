/**
 * Redirect `require('server-only')` / import 'server-only' to a no-op during
 * unit tests. Loaded via `node --import` / `--require` before the test suite.
 */
const Module = require('module');
const path = require('path');
const shimPath = path.join(__dirname, 'shim-server-only.cjs');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'server-only') return shimPath;
  return orig.call(this, request, parent, isMain, options);
};
