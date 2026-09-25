import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = process.argv[2];
const r = await pool.query(q);
console.table(r.rows);
await pool.end();
