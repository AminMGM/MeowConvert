import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// pdf.js needs its CMaps (CJK text) and standard font data at runtime; ship them offline.
function pdfjsAssets() {
  return {
    name: 'pdfjs-assets',
    buildStart() {
      for (const dir of ['cmaps', 'standard_fonts']) {
        const target = path.resolve('public/pdfjs', dir);
        if (!fs.existsSync(target)) fs.cpSync(path.resolve('node_modules/pdfjs-dist', dir), target, { recursive: true });
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [pdfjsAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome140',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0
  },
  worker: { format: 'es' },
  server: { port: 5183, strictPort: true }
});
