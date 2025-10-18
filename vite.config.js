import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    base: '/myytunes/',
    sourcemap: true, // Generate source maps for debugging
    minify: 'terser', // Use Terser for minification
  },
});
