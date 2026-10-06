import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@app-entry': path.resolve(import.meta.dirname, mode === 'staff' ? 'src/entry/staff.jsx' : 'src/entry/public.jsx'),
    },
  },
}))
