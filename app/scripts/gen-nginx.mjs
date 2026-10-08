// Writes deploy/nginx/fide.conf (and the port-80-only bootstrap used to obtain
// the first certificate) from the shared security rules, so the self-hosted
// server sends exactly the CSP and headers Cloudflare and `vite preview` do.
// Node >= 22.18 runs the TypeScript module directly.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fideNginxBootstrap, fideNginxConf } from '../packages/shared/src/security-headers.ts';

const dir = new URL('../../deploy/nginx/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('fide.conf', dir), fideNginxConf());
writeFileSync(new URL('fide-bootstrap.conf', dir), fideNginxBootstrap());
console.log('wrote deploy/nginx/fide.conf and deploy/nginx/fide-bootstrap.conf');
