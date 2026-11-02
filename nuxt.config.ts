export default defineNuxtConfig({
  // Leaflet needs window, and the whole page is the map
  ssr: false,
  compatibilityDate: '2026-11-01',
  modules: ['@vite-pwa/nuxt'],
  css: [
    'leaflet/dist/leaflet.css',
    '@fontsource-variable/fraunces/opsz.css',
    '@fontsource-variable/fraunces/opsz-italic.css',
    '@fontsource/dm-mono/400.css',
    '@fontsource/dm-mono/500.css',
    '~/assets/main.css',
  ],
  app: {
    head: {
      title: 'GeoRota',
      htmlAttrs: { lang: 'pt-BR' },
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      // Runs before first paint so a dark-mode user never sees a light flash
      script: [{
        innerHTML: `try{var t=localStorage.getItem('georota:theme')}catch(e){}document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`,
      }],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'GeoRota',
      short_name: 'GeoRota',
      description: 'Marque dois pontos no mapa e compare as rotas e distâncias.',
      lang: 'pt-BR',
      display: 'standalone',
      start_url: '/',
      background_color: '#efe8d8',
      theme_color: '#efe8d8',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      // nuxt generate writes these fallback pages. Their URLs 404 once hosted, and one failed precache entry stops the whole service worker from installing.
      globIgnores: ['200.html', '404.html'],
      runtimeCaching: [{
        // ponytail: keeps only tiles the user already saw. OSM forbids bulk tile download, so a full offline region needs another tile source.
        urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'map-tiles',
          networkTimeoutSeconds: 3,
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
        },
      }],
    },
  },
})
