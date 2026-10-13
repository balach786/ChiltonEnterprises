import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vendor splitting keeps the entry chunk small and makes repeat visits cheap: the browser
 * caches the vendor chunks across deployments, so a code change in our own
 * pages only invalidates the small app chunks.
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  // sonner is imported dynamically (see lib/notify.ts). Returning undefined lets Rollup keep it
  // in its own on-demand chunk; bucketing it here would pull it back into the eager vendor chunk.
  if (id.includes('sonner')) return undefined;
  // lodash is only reachable through recharts, which is lazy. Letting Rollup place it keeps
  // ~190 modules out of the eager vendor chunk.
  if (/[\/]lodash[\/]/.test(id)) return undefined;
  if (/[\\/](recharts|victory-vendor|d3-[^\\/]+)[\\/]/.test(id)) return 'vendor-charts';
  if (id.includes('@radix-ui')) return 'vendor-ui';
  if (id.includes('react-router')) return 'vendor-router';
  if (/[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'vendor-forms';
  if (id.includes('@tanstack')) return 'vendor-query';
  if (id.includes('lucide-react')) return 'vendor-icons';
  // React's runtime helpers travel with it: splitting them apart creates a circular
  return 'vendor';
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      // The browser only ever talks to this Vite origin; Vite forwards to the API.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Keep this low: a growing entry chunk should fail loudly in the build output.
    chunkSizeWarningLimit: 500,
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    css: false,
  },
} as never);
