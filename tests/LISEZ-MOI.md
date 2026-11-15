# Tests de la synchronisation

Ces tests ne touchent **jamais** la base de production : ils remplacent
Supabase et la base du téléphone par de faux modules en mémoire.

## Tests automatiques (une commande)

```bash
npm test
```

Ils vérifient `src/lib/sync.ts` :

- la **fusion** entre l'appareil et le serveur (rien ne bouge quand rien n'a
  changé, la version la plus récente gagne, une saisie faite *pendant* la
  lecture du serveur n'est pas écrasée) ;
- les **pierres tombales** (une adresse vivante n'est pas masquée par une
  pierre portant le même identifiant) ;
- les **lignes fantômes** (une adresse arrivée dans la liste des décomptes
  n'est ni gardée ni envoyée) ;
- la **lecture par pages** triées par identifiant (aucun trou, aucun doublon) ;
- le **temps réel** : la table est lue dans le message, un évènement remis à
  tous les abonnements n'est traité qu'une fois, chaque abonnement a son
  propre canal.

Fichiers : `sync/construire.mjs` (assemble le module avec esbuild),
`sync/faux-supabase.mjs`, `sync/fausse-db.mjs`, `sync/test-sync.mjs`.

## Essais dans le navigateur (mode isolé)

`faux-serveur-navigateur.js` est un faux serveur Supabase à charger dans la
page en développement (6 172 adresses fictives, identifiants fixes). Il sert à
essayer le lancement, la saisie pendant une synchronisation, le démarrage
sans réseau, etc.

Marche à suivre, à défaire entièrement après les essais :

1. dans `src/config.ts`, remplacer l'adresse du projet par
   `https://base-de-test-inexistante.invalid` et la clé par une chaîne
   factice de plus de 20 caractères (aucune requête ne peut alors atteindre
   la vraie base) ;
2. ajouter à la fin de ce même fichier :
   `if (import.meta.env.DEV) { const code = sessionStorage.getItem('__faux_code'); if (code) (0, eval)(code); }`
3. copier `faux-serveur-navigateur.js` dans `public/`, le lire depuis la page
   et le ranger dans `sessionStorage['__faux_code']`, puis recharger ;
4. à la fin : `git checkout -- src/config.ts`, supprimer la copie dans
   `public/`, vider IndexedDB et le stockage du navigateur, et vérifier que
   `src/config.ts` pointe de nouveau sur le vrai projet.
