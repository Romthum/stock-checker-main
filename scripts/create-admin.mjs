import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { loadEnv } from './load-env.mjs';

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const email = process.env.ADMIN_EMAIL ?? 'owner@example.com';
const password = process.env.ADMIN_PASSWORD ?? `Owner-${crypto.randomBytes(9).toString('base64url')}!`;
const displayName = process.env.ADMIN_DISPLAY_NAME ?? 'Store Owner';

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const hash = await bcrypt.hash(password, 12);
  await client.query(
    `
    insert into users (email, username, password_hash, display_name, role)
    values ($1, $2, $3, $4, 'OWNER')
    on conflict (email) do update set
      password_hash = excluded.password_hash,
      display_name = excluded.display_name,
      role = 'OWNER',
      is_active = true,
      updated_at = now()
    `,
    [email.toLowerCase(), email.toLowerCase(), hash, displayName]
  );
  console.log(`OWNER user ready: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Generated password: ${password}`);
  }
} finally {
  await client.end();
}
