import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// On Replit, PORT and BASE_PATH are injected via .replit-artifact/artifact.toml.
// Outside Replit (local dev, Vercel, etc.) they usually aren't set, so we fall
// back to sensible defaults instead of crashing the whole config.
const rawPort = process.env.PORT || '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;

          // Resolve the REAL package name from the last "node_modules/<pkg>"
          // segment instead of substring-matching the whole path. This
          // matters because pnpm encodes each package's resolved peer
          // dependencies directly into its .pnpm folder name — e.g.
          // recharts (whose peer deps are react + react-dom) resolves to
          // something like:
          //   .pnpm/recharts@2.15.4_react-dom@19.1.0_react@19.1.0/node_modules/recharts/...
          // A naive id.includes('react-dom') check matches that folder name
          // and silently sweeps the *entire* recharts + d3 dependency tree
          // into vendor-react — which is exactly what was happening (this
          // is the real reason vendor-react was 700KB+: it wasn't just
          // React, it was React + a full charting library). Same root cause
          // as the earlier Sentry mis-chunking bug (broad substring match on
          // a resolved node_modules path), different trigger.
          const afterNodeModules = id.split('node_modules/').pop() ?? '';
          const pkg = afterNodeModules.startsWith('@')
            ? afterNodeModules.split('/').slice(0, 2).join('/') // @scope/name
            : afterNodeModules.split('/')[0];                    // name

          if (pkg.startsWith('@sentry')) return 'vendor-sentry';
          if (pkg === 'react-dom' || pkg === 'react' || pkg === 'scheduler') return 'vendor-react';
          if (pkg.startsWith('react-router')) return 'vendor-router';
          if (pkg === 'framer-motion') return 'vendor-motion';
          if (pkg === 'recharts' || pkg.startsWith('d3-') || pkg === 'victory-vendor' || pkg === 'react-smooth') return 'vendor-charts';
          if (pkg.startsWith('@supabase')) return 'vendor-supabase';
          if (pkg.startsWith('@stripe')) return 'vendor-stripe';
          if (pkg === 'lucide-react') return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
