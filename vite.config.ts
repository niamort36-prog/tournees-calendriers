import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' : nécessaire pour un futur hébergement sur GitHub Pages (sous-chemin)
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Tournées Calendriers — Amicale SP',
        short_name: 'Calendriers',
        description: "Suivi des tournées de calendriers de l'amicale des sapeurs-pompiers",
        lang: 'fr',
        theme_color: '#1d3557',
        background_color: '#f4f6fa',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // fond de carte : les zones déjà vues restent disponibles hors ligne
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-osm',
              expiration: { maxEntries: 4000, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Le serveur de fichiers d'adresses BAN n'envoie pas d'en-têtes CORS :
      // en développement on passe par ce proxy ; en production une URL de
      // remplacement sera fournie via VITE_BAN_DATA_BASE (futur proxy Supabase).
      '/ban-data': {
        target: 'https://adresse.data.gouv.fr',
        changeOrigin: true,
        rewrite: (chemin) => chemin.replace(/^\/ban-data/, '/data/ban/adresses/latest/csv'),
      },
    },
  },
});
