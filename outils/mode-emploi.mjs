// Mode d'emploi PDF dans l'application (bouton « Réglages »).
//
// Le fichier servi est TOUJOURS docs/Tutoriel-Tournees-Calendriers.pdf du
// dépôt, copié à chaque construction : il suit donc automatiquement chaque
// mise en ligne, sans copie à tenir à jour à la main. Il suffit de le
// régénérer (python docs/tutoriel/tutoriel.py) quand l'appli change.
//
// L'application reçoit aussi sa date, son nombre de pages, son poids et une
// empreinte de son contenu : l'adresse change dès que le PDF change, si bien
// qu'aucun téléphone ne peut rester bloqué sur une ancienne version.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const SOURCE = 'docs/Tutoriel-Tournees-Calendriers.pdf';
const FICHIER = 'mode-emploi.pdf';

function lire(racine) {
  const contenu = readFileSync(resolve(racine, SOURCE));
  const texte = contenu.toString('latin1');
  const date = /\/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})/.exec(texte);
  const pages = /\/Count\s+(\d+)\s*\/Kids/.exec(texte);
  return {
    contenu,
    infos: {
      fichier: FICHIER,
      version: createHash('sha256').update(contenu).digest('hex').slice(0, 12),
      date: date ? `${date[3]}/${date[2]}/${date[1]}` : null,
      pages: pages ? Number(pages[1]) : null,
      octets: contenu.length,
    },
  };
}

export default function modeEmploi() {
  let racine = process.cwd();
  return {
    name: 'mode-emploi',
    config(config) {
      racine = config.root ? resolve(config.root) : process.cwd();
      return { define: { __MODE_EMPLOI__: JSON.stringify(lire(racine).infos) } };
    },
    // en développement : servi directement depuis docs/
    configureServer(serveur) {
      serveur.middlewares.use('/' + FICHIER, (_requete, reponse) => {
        reponse.setHeader('Content-Type', 'application/pdf');
        reponse.end(lire(racine).contenu);
      });
    },
    // à la construction : copié à côté de l'application
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: FICHIER, source: lire(racine).contenu });
    },
  };
}
