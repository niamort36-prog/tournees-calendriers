#!/usr/bin/env node
/**
 * ===================================================================
 *  RESTAURATION D'UNE SAUVEGARDE DES TOURNÉES CALENDRIERS
 * ===================================================================
 *
 * Réinjecte dans la base un fichier `sauvegarde-....json` — qu'il vienne du
 * Google Drive (script automatique) ou du bouton « Sauvegarde complète » de
 * la Synthèse : c'est le même format.
 *
 * PAR DÉFAUT CE PROGRAMME N'ÉCRIT RIEN. Il affiche ce qu'il ferait. Il faut
 * ajouter --ecrire pour que la base soit réellement modifiée.
 *
 * Exemples
 * --------
 *   # voir ce que contient la sauvegarde et ce qui serait réécrit
 *   node restaurer.mjs sauvegarde-2026-11-14-06h.json --cle COLLER_LA_CLE
 *
 *   # ne remettre qu'une seule tournée (ses adresses, son équipe, son décompte)
 *   node restaurer.mjs sauvegarde.json --cle ... --tournee "Tournée 23"
 *
 *   # pour de vrai
 *   node restaurer.mjs sauvegarde.json --cle ... --tournee "Tournée 23" --ecrire
 *
 * ⚠ Une restauration écrase dans la base les lignes qui portent les mêmes
 * identifiants, y compris si elles ont été modifiées depuis la sauvegarde.
 * Faites toujours une sauvegarde fraîche AVANT de restaurer.
 */

import { readFileSync } from 'node:fs';

const URL_BASE = 'https://enopjnyqycrtydgtuiys.supabase.co';

// Ordre d'écriture : une ligne ne peut pas désigner une tournée ou une
// campagne qui n'existe pas encore.
const ORDRE = [
  'profils',
  'campagnes',
  'tournees',
  'equipes',
  'adresses',
  'decomptes',
  'journal',
  'archives_adresses',
  'suppressions',
];

const PAQUET = 500;

// ------------------------------------------------------------- arguments

function lireArguments(argv) {
  const options = { fichier: null, cle: process.env.SUPABASE_SERVICE_ROLE ?? null, ecrire: false, tables: null, tournee: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ecrire') options.ecrire = true;
    else if (a === '--cle') options.cle = argv[++i];
    else if (a === '--tables') options.tables = argv[++i].split(',').map((t) => t.trim());
    else if (a === '--tournee') options.tournee = argv[++i];
    else if (a.startsWith('--')) throw new Error(`Option inconnue : ${a}`);
    else options.fichier = a;
  }
  if (!options.fichier) throw new Error('Indiquez le fichier de sauvegarde à restaurer.');
  if (!options.cle) {
    throw new Error(
      'Clé manquante : ajoutez --cle <clé service_role> (Supabase → Project Settings → API).',
    );
  }
  return options;
}

// -------------------------------------------------------------- écriture

async function envoyer(table, lignes, cle, colonnesRetirees) {
  const reponse = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(lignes),
  });
  if (reponse.ok) return;

  const texte = await reponse.text();

  // La base en place peut être plus ancienne que la sauvegarde : une colonne
  // inconnue ferait échouer tout le paquet. On la retire et on réessaie,
  // en disant clairement ce qui n'a pas pu être remis.
  const manquante = /column "?([a-z_]+)"? of relation|Could not find the '([a-z_]+)' column/.exec(texte);
  const colonne = manquante?.[1] ?? manquante?.[2];
  if (colonne && lignes.some((l) => colonne in l)) {
    colonnesRetirees.add(`${table}.${colonne}`);
    const allegees = lignes.map((l) => {
      const copie = { ...l };
      delete copie[colonne];
      return copie;
    });
    return envoyer(table, allegees, cle, colonnesRetirees);
  }

  throw new Error(`Écriture de « ${table} » refusée (HTTP ${reponse.status}) : ${texte.slice(0, 400)}`);
}

// ------------------------------------------------------------------ main

async function main() {
  const options = lireArguments(process.argv.slice(2));
  const sauvegarde = JSON.parse(readFileSync(options.fichier, 'utf8'));

  if (sauvegarde.format !== 'sauvegarde-tournees-calendriers') {
    throw new Error(
      "Ce fichier n'est pas une sauvegarde des tournées calendriers (marqueur « format » absent).",
    );
  }

  console.log(`Sauvegarde du ${sauvegarde.genere_le} (source : ${sauvegarde.source}).`);
  if (sauvegarde.tables_absentes?.length) {
    console.log(`Tables absentes lors de la sauvegarde : ${sauvegarde.tables_absentes.join(', ')}.`);
  }

  // --- filtre éventuel sur une seule tournée ---
  let tables = sauvegarde.tables;
  if (options.tournee) {
    const tournee = (tables.tournees ?? []).find((t) => t.nom === options.tournee);
    if (!tournee) {
      throw new Error(
        `Aucune tournée « ${options.tournee} » dans cette sauvegarde. Noms disponibles : ` +
          (tables.tournees ?? []).map((t) => t.nom).join(', '),
      );
    }
    const id = tournee.id;
    tables = {
      tournees: [tournee],
      adresses: (tables.adresses ?? []).filter((a) => a.tournee_id === id),
      equipes: (tables.equipes ?? []).filter((e) => e.tournee_id === id),
      decomptes: (tables.decomptes ?? []).filter((d) => d.tournee_id === id),
    };
    console.log(`Filtré sur « ${options.tournee} » : les autres tournées ne seront pas touchées.`);
  }

  const aFaire = ORDRE.filter(
    (t) => tables[t]?.length > 0 && (!options.tables || options.tables.includes(t)),
  );

  console.log('\nCe qui serait réécrit :');
  for (const table of aFaire) console.log(`  ${table.padEnd(20)} ${tables[table].length} ligne(s)`);
  if (aFaire.length === 0) {
    console.log('  (rien)');
    return;
  }

  if (!options.ecrire) {
    console.log(
      '\nAucune modification faite : ajoutez --ecrire pour appliquer réellement.' +
        '\nPensez à prendre une sauvegarde fraîche juste avant.',
    );
    return;
  }

  console.log('\nÉcriture dans la base…');
  const colonnesRetirees = new Set();
  for (const table of aFaire) {
    const lignes = tables[table];
    for (let i = 0; i < lignes.length; i += PAQUET) {
      const paquet = lignes.slice(i, i + PAQUET);
      await envoyer(table, paquet, options.cle, colonnesRetirees);
      console.log(`  ${table} : ${Math.min(i + PAQUET, lignes.length)}/${lignes.length}`);
    }
  }

  if (colonnesRetirees.size > 0) {
    console.log(
      `\n⚠ Colonnes absentes de la base, non restaurées : ${[...colonnesRetirees].join(', ')}.` +
        '\n   Passez la mise à jour SQL correspondante puis relancez la restauration.',
    );
  }
  console.log('\nTerminé. Rouvrez l’application et rafraîchissez pour voir le résultat.');
}

main().catch((erreur) => {
  console.error(`\nÉchec : ${erreur.message}`);
  process.exit(1);
});
