/**
 * Creates .env from .env.example with freshly generated secrets.
 *   npm run setup:env            (refuses to overwrite an existing .env)
 *   npm run setup:env -- --force (overwrite)
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'];

if (existsSync('.env') && !process.argv.includes('--force')) {
  console.error('.env already exists. Use `npm run setup:env -- --force` to overwrite it.');
  process.exit(1);
}

let env = readFileSync('.env.example', 'utf8');
for (const key of SECRETS) {
  // 32 random bytes = 64 hex characters (what ENCRYPTION_KEY requires).
  env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${randomBytes(32).toString('hex')}`);
}

writeFileSync('.env', env);
console.log(`Created .env with fresh random values for: ${SECRETS.join(', ')}`);
