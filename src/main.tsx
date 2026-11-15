import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css';
import App from './App';
import { useAppStore } from './store/useAppStore';

// accès console en développement (débogage)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).appStore = useAppStore;

// ----- nouvelle version de l'application -----
// Une application installée garde l'ancienne version tant qu'on ne la relance
// pas : un téléphone resté ouvert plusieurs jours continuait à tourner avec
// les défauts déjà corrigés (c'est ainsi qu'est né le dernier fantôme du
// 14 novembre 2026). On vérifie donc régulièrement s'il existe du nouveau et,
// quand c'est le cas, on recharge au premier moment où cela ne dérange
// personne : aucune fiche ouverte, aucune saisie en cours.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  const sw = navigator.serviceWorker;
  // la toute première installation prend aussi la main : ce n'est pas une mise à jour
  let dejaPilotee = sw.controller !== null;
  let nouvelleVersion = false;
  let dernierGeste = Date.now();
  let derniereRecherche = 0;

  const noterGeste = () => {
    dernierGeste = Date.now();
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    window.addEventListener(type, noterGeste, { passive: true, capture: true });
  }

  const tranquille = (): boolean => {
    const s = useAppStore.getState();
    if (s.adresseOuverteId !== null || s.vueListe || s.modeAjout || s.deplacementAdresseId !== null) {
      return false;
    }
    if (s.chargement.actif || s.enAttente > 0) return false;
    // une fenêtre (décompte, synthèse, équipes, campagne…) est ouverte
    if (document.querySelector('.fenetre-voile')) return false;
    const actif = document.activeElement;
    if (
      actif instanceof HTMLInputElement ||
      actif instanceof HTMLTextAreaElement ||
      actif instanceof HTMLSelectElement
    ) {
      return false;
    }
    // écran allumé : on attend une minute sans y toucher
    return document.hidden || Date.now() - dernierGeste > 60000;
  };

  const rechargerSiTranquille = () => {
    if (nouvelleVersion && tranquille()) window.location.reload();
  };

  sw.addEventListener('controllerchange', () => {
    if (!dejaPilotee) {
      dejaPilotee = true;
      return;
    }
    nouvelleVersion = true;
    rechargerSiTranquille();
  });

  const chercherNouvelleVersion = () => {
    if (Date.now() - derniereRecherche < 10 * 60 * 1000) return;
    derniereRecherche = Date.now();
    void sw
      .getRegistration()
      .then((enregistrement) => enregistrement?.update())
      .catch(() => undefined);
  };

  document.addEventListener('visibilitychange', () => {
    rechargerSiTranquille();
    if (!document.hidden) chercherNouvelleVersion();
  });
  window.setInterval(rechargerSiTranquille, 20000);
  window.setInterval(chercherNouvelleVersion, 30 * 60 * 1000);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
