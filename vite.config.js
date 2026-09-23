import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Week bucketing is local-time by design, so the suite has to run somewhere that actually
  // has a UTC offset — under TZ=UTC a local-vs-UTC bug is invisible and every test passes.
  test: { env: { TZ: 'Europe/London' } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // registerType: 'autoUpdate' only turns these on when the plugin also injects its own
      // registration script. We register manually, so set them here or a new worker waits
      // behind a backgrounded home-screen app forever and the update never lands.
      // woff2 is NOT in workbox's default globPatterns, and the app must render with no
      // signal — without this the self-hosted Inter is fetched over the network on a cold
      // offline start and every display size silently falls back to SF.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Forge',
        short_name: 'Forge',
        description: 'Offline-first gym workout tracker and weightlifting log',
        // The app is dark only, so the single value a manifest allows is finally the right
        // one — the launch splash now matches the ground the app paints.
        theme_color: '#0B0B0C',
        background_color: '#0B0B0C',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-180x180.png', sizes: '180x180', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
