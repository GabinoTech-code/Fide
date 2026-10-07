import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { portalHeaders, previewHeaders, toCloudflareHeaders } from '../../packages/shared/src/security-headers.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  // Hosted Supabase projects live under *.supabase.co; add the configured URL
  // explicitly so a local stack (http://127.0.0.1:54321) works in development.
  const origins = ['https://*.supabase.co', ...(env.VITE_SUPABASE_URL ? [new URL(env.VITE_SUPABASE_URL).origin] : [])];
  const rules = portalHeaders([...new Set(origins)]);

  const securityHeaders: Plugin = {
    name: 'fide-security-headers',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: toCloudflareHeaders(rules) });
    },
  };

  return {
    plugins: [react(), securityHeaders],
    server: { port: 5173, strictPort: true, headers: previewHeaders(rules) },
    preview: { port: 5173, headers: previewHeaders(rules) },
    build: { target: 'es2022', sourcemap: true },
  };
});
