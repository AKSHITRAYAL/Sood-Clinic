import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Vitest's esbuild transform does not run the React plugin, so JSX must be
  // compiled with the automatic runtime there too (no React import required).
  esbuild: { jsx: 'automatic' },
  resolve: {
    dedupe: ['firebase'],
    alias: {
      '@app-entry': path.resolve(import.meta.dirname, mode === 'staff' ? 'src/entry/staff.jsx' : 'src/entry/public.jsx'),
    },
  },
}))
