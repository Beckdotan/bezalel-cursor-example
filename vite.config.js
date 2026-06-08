import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from https://<user>.github.io/bezalel-cursor-example/,
// so asset URLs must be prefixed with the repo name in production. Locally
// (dev) we keep the root base so `npm run dev` works normally.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bezalel-cursor-example/' : '/',
  plugins: [react()],
  // Poll the filesystem for changes. Native file-watching events were not
  // firing reliably in this environment, which made hot-reload miss edits;
  // polling is a touch heavier but detects every change. (Dev-only.)
  server: {
    watch: { usePolling: true, interval: 300 },
  },
}))
