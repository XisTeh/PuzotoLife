import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3210', changeOrigin: false } },
    fs: { deny: ['.env', '.env.*', '.inv', '**/Info/**', '**/data/**', '**/Casaê/**', '**/*.db', '**/*.sqlite', '**/.git/**'] }
  },
  publicDir: 'public'
});
