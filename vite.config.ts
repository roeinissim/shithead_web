import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative so Add-to-Home-Screen works from any scope.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { outDir: 'dist', target: 'es2022' },
});
