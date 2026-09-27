import pg from 'pg';import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
const c=new pg.Client({connectionString:env.DATABASE_URL_UNPOOLED});await c.connect();
const q=process.argv.slice(2).join(' ');const r=await c.query(q);for(const row of r.rows) console.log(Object.values(row).join(" | "));await c.end();
