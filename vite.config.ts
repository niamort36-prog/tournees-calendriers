import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : nécessaire pour un futur hébergement sur GitHub Pages (sous-chemin)
export default defineConfig({
  plugins: [react()],
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
