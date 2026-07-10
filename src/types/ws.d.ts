// `ws` ships no bundled types and is pulled in transitively (via
// @neondatabase/serverless) rather than declared directly, so `@types/ws`
// isn't installed. db.ts imports it only to hand Neon a WebSocket constructor,
// so an ambient `any` module declaration is sufficient to satisfy the build.
declare module 'ws';
