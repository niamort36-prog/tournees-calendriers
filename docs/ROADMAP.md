# Feuille de route

## ✅ Phase 1 — Fondations + carte administrateur (en cours)
- [x] Projet Vite + React + TypeScript, base locale IndexedDB (Dexie)
- [x] Carte Leaflet/OSM, recherche d'adresse (BAN)
- [x] Dessin des zones de tournées (polygone/rectangle), édition des sommets
- [x] Pings automatiques sur chaque adresse de la zone (fichiers BAN départementaux,
      cache par commune), regroupement des immeubles
- [x] Ajout / déplacement / renommage / suppression de pings (exclusions mémorisées)
- [x] Fiche tournée : nom, couleur, dispo conseillée, distribués N-1, estimation

## Phase 2 — Mise en ligne
- [ ] Dépôt GitHub + déploiement GitHub Pages (avec l'utilisateur)
- [ ] Compte Supabase + schéma de base + proxy Edge Function pour les fichiers BAN

## Phase 3 — Comptes et rôles
- [ ] Authentification Supabase, rôles admin / normal
- [ ] Centres de secours, création de comptes SP par l'admin
- [ ] Changement de mot de passe par l'admin + réinitialisation

## Phase 4 — Campagnes et équipes
- [ ] Campagnes (nom, calendriers commandés, taille des paquets, archivage)
- [ ] Équipes, attribution aux tournées, notifications de changement
- [ ] Reprise des infos d'une campagne à l'autre (refus, distribués…)

## Phase 5 — Vue téléphone (terrain)
- [ ] Carte + vue liste par proximité, statuts couleur, saisies rapides
- [ ] Rappels date/heure, voiture par demi-journée, position GPS temps réel
- [ ] Modifications d'adresses en attente de validation admin

## Phase 6 — Fin de tournée et comptabilité
- [ ] Décompte pièces/billets/chèques + CB, total automatique
- [ ] Contrôle des points restants, dates/demi-journées
- [ ] Reçus PDF numérotés, exports Excel, graphiques/camemberts
- [ ] Fenêtre de notifications PC

## Phase 7 — Hors-ligne complet (PWA)
- [ ] Service worker, file de synchronisation, dernière modif gagne + traçabilité

## Limites connues (v1)
- Une zone à cheval sur deux départements ne charge que le département du centre
  de la zone.
- Les tuiles OSM publiques suffisent pour un usage amicale ; alternative IGN
  Géoplateforme si besoin.
