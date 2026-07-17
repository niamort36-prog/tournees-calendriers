# 🚒 Tournées Calendriers — Amicale des Sapeurs-Pompiers

Application web (PC + téléphone) de suivi des tournées de distribution de
calendriers : zones dessinées sur carte, pings automatiques sur chaque adresse
(Base Adresse Nationale), équipes, statuts de visite, décompte des sommes.

## Démarrer en développement

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173

## Documentation

- [Cahier des charges](docs/CAHIER-DES-CHARGES.md)
- [Feuille de route](docs/ROADMAP.md)

## Pile technique

React + TypeScript + Vite · Leaflet/OpenStreetMap + Geoman (dessin de zones) ·
Base Adresse Nationale (adresses) · Dexie/IndexedDB (données locales, futur
hors-ligne) · à venir : Supabase (comptes, synchro, temps réel) + GitHub Pages.
