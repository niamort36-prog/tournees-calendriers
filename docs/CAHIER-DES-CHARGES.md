# Cahier des charges — Application de suivi des tournées calendriers

Application pour une amicale de sapeurs-pompiers : organisation et suivi des tournées
de distribution de calendriers. Fonctionne sur PC (gestion) et téléphone (terrain),
simple d'utilisation, propre visuellement et ludique.

## Comptes et rôles

- Deux rôles : **Administrateur** et **Normal**.
- L'administrateur crée un **Centre de Secours** et un compte pour chaque sapeur-pompier,
  avec son rôle.
- L'administrateur peut modifier le mot de passe d'un compte Normal.
- Réinitialisation de mot de passe prévue (validé).

## Côté PC (administrateur)

### Campagnes
- Création d'une campagne avec nom libre (ex. « 2026 »).
- Infos de campagne : nombre de calendriers commandés, taille des paquets livrés
  (→ l'appli indique au SP combien de calendriers prendre en début de tournée).
- À la fin d'une campagne : archivage ; les informations utiles reviennent la
  campagne suivante (refus et motifs, nombre de calendriers distribués, etc.).

### Tournées (zones)
- Sur une carte, l'admin **entoure les zones** qui forment les tournées et les nomme.
- Une fois la zone entourée, un **ping apparaît automatiquement sur chaque adresse**
  (Base Adresse Nationale), regroupé par point pour les immeubles.
- Pings modifiables : créer, déplacer, renommer, supprimer.
- Les tournées restent enregistrées d'une campagne à l'autre.
- L'admin indique la **disponibilité conseillée** pour chaque tournée.
- Estimation du nombre de calendriers d'après les adresses repérées + saisie du
  nombre distribué l'année précédente.

### Équipes
- L'admin compose des équipes en piochant dans les comptes SP de sa base.
- Attribution des équipes aux tournées ; modifiable à tout moment (même depuis un
  téléphone) → notification (« ping ») envoyée aux SP concernés.
- Un admin peut s'attribuer ou être attribué à une tournée.

### Suivi et synthèse
- Totaux des sommes par tournée visibles à tout moment, avec le détail des coupures.
- Impression d'un **reçu** par tournée : numéro/nom de tournée, SP participants,
  qui a conduit/utilisé sa voiture, récap par coupure, total. Reçus **numérotés** (validé).
- Graphiques et camemberts de synthèse ; **export Excel**.
- Fenêtre de notifications sur PC : fins de tournée, adresses à valider…

## Côté téléphone (SP en tournée)

- Connexion → carte avec les maisons à visiter.
- Clic sur un ping → changement de statut :
  - **Gris** : à faire
  - **Vert** : calendrier distribué (saisie rapide facultative de la somme et du
    nombre de calendriers laissés)
  - **Rouge** : absent, à repasser (+ rappel possible par date et heure)
  - **Bleu** : refus / pas intéressé
- Vue **liste** des adresses triée par proximité.
- L'équipe peut indiquer qui a pris sa voiture, par tranches de demi-journées datées.
- N'importe qui peut modifier/ajouter/supprimer une adresse ; pour un compte
  **Normal**, la modification est **temporaire** (visible par tous) jusqu'à
  validation par un administrateur.

### Fin de tournée
- Bouton « Tournée terminée » : confirmation + alerte s'il reste des points non
  visités ou à repasser.
- Saisie des dates/demi-journées effectuées (même réparties sur plusieurs tournées).
- Confirmation/correction du nombre de calendriers distribués.
- Décompte de la somme : pièces (0,50 € / 1 € / 2 €), billets (5 / 10 / 20 / 50 / 100 €),
  chèques par montant (ex. 2 chèques de 35 €, 1 de 50 €). **Total automatique.**
- Paiement par carte (SumUp / HelloAsso ou similaire) à prévoir dans le décompte (validé).

## Technique

- **PWA** : une seule appli web pour PC et téléphone, installable.
- **Hors-ligne** : la saisie continue sans connexion, resynchronisation automatique
  au retour du réseau. Conflits : la dernière modification gagne, avec traçabilité (validé).
- Partage de position GPS des équipes sur la carte, en temps réel.
- Hébergement : code sur **GitHub**, appli sur GitHub Pages, données/comptes/temps
  réel sur **Supabase** (gratuit).
- Cartographie : **Leaflet + OpenStreetMap** ; adresses via la **Base Adresse
  Nationale** (géocodage : api-adresse.data.gouv.fr, CORS ouvert ; fichiers
  départementaux : proxy nécessaire, Vite en dev, Supabase en production).
- **RGPD** (validé) : accès restreint par rôles, purge des vieilles campagnes,
  pas de commentaires personnels sensibles sur les habitants.
