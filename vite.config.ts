import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Tanpa polyfill preload: build statis tidak boleh memanggil fetch()
    // saat gameplay (NFR-04). Aset sudah lokal dan satu bundle.
    modulePreload: { polyfill: false },
  },
});
