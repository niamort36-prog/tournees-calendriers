import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css';
import App from './App';
import { useAppStore } from './store/useAppStore';

// accès console en développement (débogage)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).appStore = useAppStore;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
