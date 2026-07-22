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
- [x] Équipes : composition depuis l'annuaire des comptes (fenêtre 🚒 Équipes,
      admin), attribution aux tournées, badge ⭐ « Ma tournée », équipes et
      membres visibles sur chaque tournée
- [x] Notification en direct (toast) quand son affectation change — les vraies
      notifications push (appli fermée) viendront avec la PWA (phase 7)

## Phase 5 — Vue téléphone (terrain)
- [x] Fiche adresse tactile : statuts couleur (gris/vert/rouge/bleu), somme et
      calendriers laissés, rappel date/heure, note, renommer/déplacer/supprimer
- [x] Vue liste par proximité (GPS sinon centre de carte), compteur fait/total,
      indicateurs, sélecteur de tournée (défaut : ma tournée d'équipe)
- [x] Position GPS : point bleu suivi en continu, bouton 📍
- [ ] Partage des positions GPS entre équipes (carte temps réel)
- [ ] Voiture par demi-journée (avec la fin de tournée, phase 6)
- [ ] Modifications d'adresses en attente de validation admin
- [ ] Sonnerie des rappels appli fermée (avec la PWA, phase 7)

## Phase 6 — Fin de tournée et comptabilité
- [x] Fenêtre 🏁 fin de tournée : contrôle des points restants, participants,
      demi-journées datées avec voiture utilisée, calendriers distribués
- [x] Décompte espèces par coupure / chèques par montant / CB, total auto,
      validation avec numéro de reçu unique, notification admin temps réel
- [x] Reçu imprimable (impression/PDF) : n° de reçu, participants, voitures,
      détail par coupure, chèques, CB, total, signatures
- [x] Fenêtre 📊 Synthèse : compteurs, camemberts (statuts, paiements),
      barres par tournée ; export Excel (Tournées/Adresses/Décomptes/Campagne)
- [ ] Fenêtre de notifications PC (récap des fins de tournée, adresses à valider)

## Phase 7 — Hors-ligne complet (PWA)
- [x] Application installable (manifeste, icônes, service worker) ; appli et
      tuiles de carte déjà vues disponibles hors ligne ; bandeau « 📴 Hors ligne »
- [x] Pierres tombales : les suppressions ne ressuscitent plus via les caches
- [x] Tournées : création/modification/suppression réservées aux admins
      (interface + règles en base)
- [ ] Sonnerie des rappels et notifications push appli fermée

## Ajustements validés (19/07/2026)
- [x] « Distribués l'an dernier » modifiable uniquement par les admins
      (interface + trigger en base) et reporté automatiquement à l'archivage
      depuis le nombre validé au décompte de fin de tournée
- [x] Synthèse : historique par tournée, une colonne par campagne
- [x] Comptes Normaux : ne voient par défaut que les tournées de leurs équipes,
      boutons 👁️ Afficher / 🙈 Masquer pour les autres (choix mémorisé)
- [x] Tactile : pings agrandis, zone de clic élargie (tolérance 12 px) et
      « aimant à doigt » (un tap raté ouvre l'adresse la plus proche ≤ 30 px)
- [x] Synthèse des comptes Normaux limitée à l'avancement (aucun montant :
      recette, historique et export réservés aux admins)
- [x] Fond de carte satellite (photos aériennes IGN, gratuit) : bouton 🛰️/🗺️,
      choix mémorisé, tuiles mises en cache hors ligne
- [x] Notifications système (appli ouverte/arrière-plan) : rappels « à
      repasser » à l'heure dite, affectations d'équipe, fins de tournée
      (admins) ; clic = retour dans l'appli — le push appli fermée demandera
      un serveur d'envoi (à faire)
- [x] Clôture / décompte réservés aux membres de l'équipe de la tournée et
      aux admins (bouton masqué, garde-fou, RLS membre_de_tournee)
- [x] Immeubles : adresses typées 🏠/🏢, appartements par étage validables
      individuellement, statut d'ensemble et calendriers laissés automatiques

## Limites connues (v1)
- ~~Résurrection des suppressions par les caches~~ → réglé par les pierres
  tombales (table suppressions).
- Une zone à cheval sur deux départements ne charge que le département du centre
  de la zone.
- Les tuiles OSM publiques suffisent pour un usage amicale ; alternative IGN
  Géoplateforme si besoin.
