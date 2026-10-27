import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (Number(process.versions.node.split('.')[0]) < 24) {
  throw new Error('Unsaid requires Node.js 24 or newer.');
}
mkdirSync('data', { recursive: true, mode: 0o700 });
if (!existsSync('.env')) {
  writeFileSync(
    '.env',
    `PORT=3001\nHOST=0.0.0.0\nDATABASE_PATH=./data/unsaid.db\nADMIN_TOKEN=${randomBytes(32).toString('base64url')}\nTRUST_PROXY_HOPS=0\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Created a private .env with an administrator key. No secret values are logged.');
} else {
  console.log('Preserved existing .env.');
}
console.log('Setup complete. Run npm run dev, or npm run build && npm start.');
