import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
export default defineConfig({ root: 'public', base: './', envDir: false, plugins: [nodePolyfills({ globals: { Buffer: true, global: true, process: true }, protocolImports: true })], server: { host: '127.0.0.1', port: 3000, strictPort: true, fs: { deny: ['**/.env*', '**/.data/**'] } }, build: { outDir: '../dist', emptyOutDir: true, sourcemap: false }, preview: { host: '127.0.0.1', port: 3000, strictPort: true } });
