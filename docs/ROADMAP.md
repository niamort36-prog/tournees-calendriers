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
- [x] Dépôt GitHub (niamort36-prog/tournees-calendriers) + déploiement automatique
      GitHub Pages : https://niamort36-prog.github.io/tournees-calendriers/
- [x] Adresses BAN du département 87 embarquées dans le site (contournement CORS),
      rafraîchies à chaque déploiement
- [x] Projet Supabase (enopjnyqycrtydgtuiys, région UE) + schéma déployé
      (profils/rôles, tournées, adresses, RLS, temps réel)
- [x] Synchronisation multi-appareils vérifiée : fusion au démarrage, envoi à
      chaque action, file hors-ligne, temps réel (< 3 s)

## Phase 3 — Comptes et rôles
- [x] Authentification (e-mail + mot de passe, confirmation désactivée),
      premier compte = admin, suivants = normal — compte admin : Roy Romain
- [x] Écran « Équipe » (admins) : création de comptes SP (e-mail + mot de passe
      initial), rôles, centres de secours (champ libre avec suggestions)
- [x] Changement de mot de passe des comptes Normal par l'admin, suppression de
      comptes — via la fonction serveur « bright-action » (garde-fous : un compte
      normal ne peut rien faire, les autres admins sont protégés)
- [ ] Réinitialisation de mot de passe en autonomie (e-mail « mot de passe oublié »)

## Phase 4 — Campagnes et équipes
- [x] Campagnes : création (admin), calendriers commandés, taille des paquets,
      compteurs commandés/distribués/restants, « à prendre : X paquets » par
      tournée, pastille dans l'en-tête
- [x] Archivage annuel (RPC « archiver_campagne ») : photo dans
      archives_adresses, distribués N-1 recalculés par tournée, pings remis à
      zéro avec mémoire (« L'an dernier : refus » dans la popup)
- [ ] Équipes, attribution aux tournées, notifications de changement

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
