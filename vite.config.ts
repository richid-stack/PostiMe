import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Crucial for Electron to load assets from the file system
  define: {
    'process.env': {} // Polyfill process.env to prevent crashes in renderer
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // Disable source maps for production
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio.html'),
        embed: resolve(__dirname, 'embed.html'),
        'embed-host-demo': resolve(__dirname, 'embed-host-demo.html'),
        portal: resolve(__dirname, 'portal.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
