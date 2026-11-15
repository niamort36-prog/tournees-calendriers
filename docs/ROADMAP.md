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
- [x] Fiabilité : compte supprimé → purge locale + déconnexion en ≤ 1 min
      (rôle rafraîchi aussi) ; resynchronisation au premier plan / retour
      réseau / toutes les 3 min (5 min depuis le 15/11/2026) et reconnexion auto du temps réel
- [x] Tri alphabétique des tournées partout (numérique : 2 avant 10)
- [x] Immeubles : nombre de calendriers pris par appartement (1 par défaut),
      total affiché et repris dans le décompte
- [x] Bascule « vue administrateur / vue membre » pour simplifier l'écran
      (affichage seulement, mémorisé sur l'appareil)
- [x] Tutoriel PDF illustré (docs/) — à régénérer à chaque évolution
      (générateur et captures versionnés dans docs/tutoriel/)
- [x] Calendriers donnés en lots (JSP, mairie…) : campagne, synthèse, export
- [x] Récapitulatif admin : commentaires horodatés + journal des interventions
      sur les adresses (ajout, suppression, renommage, déplacement) avec
      tournée, coordonnées et auteur ; version imprimable
- [x] Appui long sur la carte (ou clic droit sur PC) → menu « 🧭 S'y rendre » :
      Plans sur iPhone, Google Maps, Waze, chooser Android (geo:), adresse
      retrouvée par géocodage inverse, copie des coordonnées
- [x] Audit complet du 15/11/2026 (fiabilité, vitesse, fluidité) :
      - temps réel : la table est lue dans le message et chaque abonnement a
        son propre canal — cause prouvée des tournées, équipes et décomptes
        « fantômes » (des adresses remises au mauvais abonnement) ;
      - synchronisation : fusion avec l'état du moment (une saisie faite
        pendant la lecture n'est plus écrasée), lecture par pages triées,
        écriture du seul écart dans le téléphone, rattrapage à chaque
        reconnexion du temps réel ;
      - lancement : affichage immédiat des données de l'appareil, profil gardé
        en mémoire (fonctionne sans réseau), carte rouverte au même endroit ;
      - fluidité : seuls les points modifiés sont redessinés, cartes de
        tournée mémoïsées, liste limitée aux 150 adresses les plus proches ;
      - fiche : saisies enregistrées à la fermeture (iPhone), plus d'écriture
        sans changement ;
      - export Excel chargé à la demande, mise à jour automatique de
        l'application, ménage des décomptes vides ;
      - tests automatiques : `npm test` (voir tests/LISEZ-MOI.md).
- [x] Seconde passe de l'audit (15/11/2026), écrans d'administration :
      - décompte : ce qui est tapé est pris en compte à la validation, à la
        fermeture et au verrouillage (le dernier montant pouvait manquer au
        reçu) ; les cases suivent le décompte rempli par un collègue ; plus
        d'écriture sans changement ;
      - toutes les modifications (décompte, équipe, campagne, tournée) mettent
        l'écran à jour avant d'écrire sur le disque : deux modifications
        rapprochées ne s'écrasent plus ;
      - détail du paiement : les montants à virgule se tapent normalement
        (« 12,50 » devenait 1250) ;
      - campagne : commandés / taille des paquets enregistrés en sortant de la
        case, et non à chaque chiffre ;
      - export Excel : feuille des décomptes sans les décomptes vides, avec une
        colonne Campagne ;
      - outils de dessin chargés pour les seuls administrateurs : fichier
        principal 1 129 → 849 Ko (1 407 Ko avant l'audit) ;
      - recherche d'adresse et « ➕ Adresse » : plus de blocage sans réseau.
- [x] Clôture de campagne (15/11/2026, décision de l'utilisateur) : d'une année
      sur l'autre, aucune trace des paiements (détail effacé, maisons et
      appartements) et tous les appartements repassent « à faire ».
      Mise à jour SQL n°16 (`docs/supabase-mise-a-jour-16.sql`, testée sur une
      base d'essai PGlite : `tests/sql/`) ; l'appli refuse d'archiver tant
      qu'elle n'est pas passée. Pré-remplissage du décompte et total d'un
      immeuble : seul l'argent des maisons / appartements « distribué » compte.
- [x] Onglet « ⚙️ Réglages » dans le bandeau (15/11/2026) : choix de l'icône
      de ma position (rond bleu par défaut ; pompiers, véhicules, gyrophare,
      hélicoptère ; citrouille, bonhomme de neige et tête coiffés d'un casque F1,
      dessinés dans `src/lib/iconesPosition.ts`). Choix propre à l'appareil
      (localStorage `icone-position`), jamais envoyé au serveur. L'icône reste
      droite quand la carte tourne et laisse passer le doigt vers les pings.
      Bandeau : « ⚙️ » seul sous 1100 px, sur la 1re ligne au téléphone ; entre
      721 et 1200 px le bandeau passe à la ligne (avant : « ☰ Tournées » sortait
      de l'écran sur tablette, recherche écrasée).

## Limites connues (v1)
- Chaque synchronisation relit toute la base (≈ 450 Ko compressés). Une
  lecture « seulement ce qui a changé » demande une colonne d'horodatage posée
  par le serveur : à faire après l'archivage de la campagne.
- Deux personnes qui modifient la MÊME adresse à la même seconde : la dernière
  écriture gagne pour toute la fiche (sensible surtout dans un immeuble).
- Le numéro de reçu est attribué par le téléphone (plus grand numéro connu + 1) :
  deux clôtures strictement simultanées pourraient recevoir le même numéro.
- ~~Résurrection des suppressions par les caches~~ → réglé par les pierres
  tombales (table suppressions).
- Une zone à cheval sur deux départements ne charge que le département du centre
  de la zone.
- Les tuiles OSM publiques suffisent pour un usage amicale ; alternative IGN
  Géoplateforme si besoin.
