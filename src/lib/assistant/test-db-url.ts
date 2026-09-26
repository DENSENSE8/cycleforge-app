/** Test-only side-effect module: */
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
export {};
