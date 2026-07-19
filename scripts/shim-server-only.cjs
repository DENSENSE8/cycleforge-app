/**
 * No-op stand-in for Next's `server-only` package under node:test / tsx.
 * Production Next builds still enforce the real package; unit tests import
 * server modules (db, neon queries) outside the RSC graph.
 */
module.exports = {};
