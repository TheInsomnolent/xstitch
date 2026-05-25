import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: site served from /CosyCrossStitch/
export default defineConfig({
  base: '/CosyCrossStitch/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
});
