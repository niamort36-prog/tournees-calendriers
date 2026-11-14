# Sauvegarde automatique

Trois sauvegardes par jour — **6 h, 13 h et 23 h** — de tout l'avancement des
tournées. Deux montages possibles, au choix :

| | Où ça tourne | Les fichiers arrivent | Mise en place |
|---|---|---|---|
| **A — sur l'ordinateur** *(installé le 15/11/2026)* | tâche Windows de ce PC | dans `Documents\Sauvegardes calendriers pompiers` — **et directement sur le Drive** si Google Drive pour ordinateur est installé | faite ; il reste la clé à coller |
| **B — chez Google** | Apps Script, indépendant de tout ordinateur | dans le dossier Drive « sauvegarde calendriers pompiers » | 10 minutes, voir plus bas |

**La différence qui compte :** le montage A ne part que si l'ordinateur est
allumé (ou en veille — Windows le réveille). S'il était éteint à 6 h, la
sauvegarde se fait à l'ouverture de session suivante : vous avez donc en
pratique une sauvegarde par jour d'allumage, pas trois. Le montage B part
toujours, à l'heure. Les deux peuvent cohabiter sans se gêner.

---

## Montage A — sur cet ordinateur

Déjà installé. La tâche Windows s'appelle **« Sauvegarde calendriers
pompiers »** et se déclenche à 6 h, 13 h et 23 h.

**Il reste une seule chose à faire** : ouvrir
`Documents\Sauvegardes calendriers pompiers\cle.txt`, y coller la clé
**service_role** de Supabase (étape 1 plus bas), enregistrer. La sauvegarde
suivante partira.

Ce qui arrive dans le dossier :

- `sauvegarde-2026-11-15-06h.json.gz` — la vraie sauvegarde, compressée
  (quelques centaines de Ko) ;
- `derniere-sauvegarde-tournees.csv`, `-adresses.csv`, `-decomptes.csv` — la
  dernière photo, lisible dans Excel, remplacée à chaque passage ;
- `journal.txt` — l'historique des passages ;
- `SAUVEGARDE-EN-ECHEC-LIRE-MOI.txt` — n'apparaît qu'en cas de problème et
  disparaît tout seul au passage suivant ;
- `corbeille\` — les sauvegardes écartées par le ménage, **jamais effacées**.

Lancer une sauvegarde tout de suite : **Planificateur de tâches** →
Bibliothèque → clic droit sur la tâche → **Exécuter**. Ou, en ligne de
commande :

```bash
node "docs/sauvegarde/sauvegarder-sur-ce-pc.mjs"
```

### Les faire monter sur le Drive

Installez **Google Drive pour ordinateur** (<https://www.google.com/drive/download/>)
et créez dans « Mon Drive » le dossier `sauvegarde calendriers pompiers`. Le
script le détecte tout seul au passage suivant et écrit directement dedans :
les sauvegardes montent alors sur le Drive sans rien changer d'autre. Le
journal indique à chaque fois le dossier utilisé.

### Désinstaller / réinstaller

```bash
powershell -ExecutionPolicy Bypass -File "docs/sauvegarde/installer-sur-ce-pc.ps1" -Desinstaller
```

Sans `-Desinstaller`, la même commande (ré)installe la tâche.

---

## Montage B — chez Google (Apps Script)

Le script tourne **chez Google**, pas sur un ordinateur : les sauvegardes
partent même ordinateur éteint et téléphone éteint. C'est gratuit et il n'y a
rien à entretenir.

---

## Ce qui est sauvegardé

Tout ce qui se remplit sur le terrain, et tout le reste :

| | |
|---|---|
| **Adresses** | statut de chaque maison, somme reçue et son détail (pièces, billets, chèques, carte), nombre de calendriers laissés, commentaire, rappel « à repasser », appartements des immeubles, date de dernière modification |
| **Tournées** | nom, couleur, contour sur la carte, disponibilité conseillée, chiffres de l'an dernier |
| **Décomptes** | participants, demi-journées, détail des espèces, chèques, carte, numéro de reçu |
| **Équipes** | nom, membres, tournée affectée |
| **Campagnes** | calendriers commandés, lots donnés, archives des campagnes passées |
| **Comptes** | nom, rôle, centre (jamais les mots de passe : ils ne sont pas lisibles, même par vous) |
| **Journal** | qui a ajouté, déplacé, renommé ou commenté quoi, et quand |

À chaque passage, deux fichiers arrivent dans le dossier :

- `sauvegarde-2026-11-14-06h.json` — **la vraie sauvegarde**. C'est elle qui
  permet de tout remettre en place. Inutile de l'ouvrir.
- `lisible-2026-11-14` — une **feuille de calcul**, mise à jour aux trois
  passages de la journée. Celle-là s'ouvre d'un clic dans le navigateur :
  tournées, adresses et décomptes, en clair.

---

### Mise en place (une seule fois, environ 10 minutes)

### 1. Récupérer la clé de la base

1. Allez sur <https://supabase.com/dashboard> et ouvrez le projet.
2. Roue dentée **Project Settings** → **API Keys**.
3. Dans la partie **service_role**, cliquez sur l'œil puis **copiez** la clé
   (elle est longue, commence par `eyJ…`).

> ⚠ Cette clé donne accès à toute la base. Ne la mettez jamais dans un
> courriel, un message, ni dans le code de l'application.

### 2. Créer le projet de sauvegarde

1. Allez sur <https://script.google.com> (avec le compte Google dont vous
   voulez utiliser le Drive).
2. **Nouveau projet**.
3. En haut à gauche, cliquez sur « Projet sans titre » et nommez-le
   **Sauvegarde calendriers pompiers**.
4. Effacez tout ce qu'il y a dans la fenêtre de code, puis **collez le contenu
   complet du fichier `Code.gs`** qui se trouve à côté de ce mode d'emploi.
5. Cliquez sur la disquette 💾 (Enregistrer).

### 3. Y déposer la clé

1. Dans la colonne de gauche, roue dentée **Paramètres du projet**.
2. Tout en bas : **Propriétés du script** → **Ajouter une propriété de script**.
3. Nom : `CLE_SERVICE` — Valeur : la clé copiée à l'étape 1.
4. **Enregistrer les propriétés du script**.

La clé est ainsi rangée à part : elle n'apparaît pas dans le code.

### 4. Vérifier, puis lancer

1. Revenez sur l'onglet **Éditeur** (`< >`).
2. En haut, dans la liste des fonctions, choisissez **`verifier`** et cliquez
   **Exécuter**.
3. Google demande l'autorisation d'accéder à votre Drive : **Examiner les
   autorisations** → choisissez votre compte → l'écran « Google n'a pas validé
   cette application » s'affiche (c'est normal, l'application c'est vous) →
   **Paramètres avancés** → **Accéder à Sauvegarde calendriers pompiers
   (non sécurisé)** → **Autoriser**.
4. En bas, le journal d'exécution doit afficher le nombre de lignes de chaque
   table, par exemple `adresses : 4812 ligne(s)`. Si c'est le cas, la clé est
   bonne.
5. Choisissez maintenant la fonction **`installer`** et cliquez **Exécuter**.

C'est fini. `installer` crée le dossier dans votre Drive, programme les trois
horaires et fait **une première sauvegarde tout de suite** pour que vous
puissiez la voir.

### 5. Regarder le résultat

Ouvrez <https://drive.google.com> : le dossier **sauvegarde calendriers
pompiers** contient le premier `sauvegarde-....json` et la feuille
`lisible-...`.

---

## Au quotidien

Il n'y a rien à faire. Les sauvegardes arrivent toutes seules à 6 h, 13 h et
23 h (à quelques minutes près, Google choisit le moment exact dans le quart
d'heure).

**Si une sauvegarde échoue**, vous recevez un courriel sur l'adresse du compte
Google qui a installé le script, avec le motif. Les sauvegardes précédentes ne
sont jamais touchées : une panne ne peut pas les abîmer.

Pour voir l'historique des passages : <https://script.google.com> → votre
projet → **Exécutions** dans la colonne de gauche.

### Le ménage du dossier

Pour que le dossier ne grossisse pas sans fin :

- **moins de 60 jours** : tout est gardé, les trois par jour ;
- **jusqu'à 400 jours** : une sauvegarde par jour (la dernière de la journée) ;
- **au-delà** : une sauvegarde par mois, pour toujours.

Rien n'est effacé pour de bon : les fichiers écartés partent à la **corbeille
du Drive**, où ils restent récupérables 30 jours. Pour tout garder, mettez
`menageActif: false` en haut du `Code.gs`.

### Arrêter les sauvegardes

Lancez la fonction **`desinstaller`**. Les fichiers déjà faits restent en place.

---

## Faire une sauvegarde à la main

Dans l'application, en tant qu'administrateur : **📊 Synthèse** → bouton
**💾 Sauvegarde complète (fichier de secours)**. Vous obtenez exactement le
même fichier, dans les téléchargements de l'appareil. Pratique juste avant une
manipulation délicate (archiver une campagne, recalculer une zone).

---

## Restaurer

Le fichier `restaurer.mjs`, à côté de ce mode d'emploi, remet une sauvegarde
dans la base. **Il n'écrit rien tant qu'on ne le lui demande pas** : sans
l'option `--ecrire`, il se contente d'afficher ce qu'il ferait.

Voir ce que contient une sauvegarde :

```bash
node docs/sauvegarde/restaurer.mjs sauvegarde-2026-11-14-06h.json --cle LA_CLE_SERVICE
```

Ne remettre qu'une seule tournée (ses adresses, son équipe, son décompte) :

```bash
node docs/sauvegarde/restaurer.mjs sauvegarde.json --cle LA_CLE_SERVICE --tournee "Tournée 23"
```

Puis, pour de vrai, la même commande avec `--ecrire` à la fin.

> ⚠ Une restauration **écrase** dans la base les lignes qui portent les mêmes
> identifiants, même si elles ont été modifiées depuis. Prenez toujours une
> sauvegarde fraîche juste avant (bouton de la Synthèse), et restaurez de
> préférence une seule tournée à la fois.

Après une restauration, les téléphones se remettent à jour tout seuls au
rafraîchissement suivant.

---

## En cas de doute

| Symptôme | À faire |
|---|---|
| `Clé absente` | L'étape 3 n'est pas passée : la propriété doit s'appeler exactement `CLE_SERVICE`. |
| `La base a refusé la clé (HTTP 401)` | C'est la clé **anon** qui a été collée au lieu de **service_role**. |
| `aucune adresse : sauvegarde annulée` | La base n'a rien renvoyé (projet Supabase en pause ?). Rien n'a été écrasé. Ouvrez le tableau de bord Supabase, réveillez le projet, relancez `sauvegarder`. |
| Plus aucun fichier n'arrive | <https://script.google.com> → **Exécutions** : le motif y est écrit. Si les horaires ont disparu, relancez `installer`. |
| Le dossier a été renommé ou déplacé | Le script le retrouve par son nom. S'il ne le trouve pas, il en recrée un : remettez le nom exact `sauvegarde calendriers pompiers`. |

---

## Pourquoi ce montage plutôt qu'un autre

- **Chez Google et pas sur le PC** : à 6 h et à 23 h un ordinateur est
  généralement éteint. Une sauvegarde qui ne part pas ne sert à rien.
- **Pas de service tiers** : la clé reste dans votre projet Apps Script et les
  fichiers dans votre Drive. Rien ne transite ailleurs.
- **Un format lisible** : du JSON et une feuille de calcul. Même sans
  l'application et sans personne pour aider, les données restent exploitables.
