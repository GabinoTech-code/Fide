// Writes deploy/caddy/Caddyfile from the shared security rules, so the
// self-hosted server sends exactly the CSP and headers Cloudflare and
// `vite preview` do. Node >= 22.18 runs the TypeScript module directly.
import { writeFileSync } from 'node:fs';
import { fideCaddyfile } from '../packages/shared/src/security-headers.ts';

const target = new URL('../../deploy/caddy/Caddyfile', import.meta.url);
writeFileSync(target, fideCaddyfile());
console.log('wrote deploy/caddy/Caddyfile');
