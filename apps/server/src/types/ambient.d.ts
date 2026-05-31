// Declare missing module types for runtime-only dependencies
// This keeps TypeScript happy without adding new dev deps on the server.
declare module 'cookie';
