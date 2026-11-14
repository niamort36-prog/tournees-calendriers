#!/usr/bin/env node
/**
 * ===================================================================
 *  SAUVEGARDE DES TOURNÉES CALENDRIERS, LANCÉE PAR CET ORDINATEUR
 * ===================================================================
 *
 * Lit la base et dépose dans le dossier de sauvegarde :
 *   - sauvegarde-2026-11-15-06h.json.gz  → la copie complète (compressée,
 *     c'est elle qui permet de tout remettre en place)
 *   - derniere-sauvegarde-tournees.csv
 *   - derniere-sauvegarde-adresses.csv
 *   - derniere-sauvegarde-decomptes.csv  → la dernière photo, lisible dans
 *     Excel, remplacée à chaque passage
 *   - journal.txt                        → l'historique des passages
 *
 * Trois tâches Windows le lancent à 6 h, 13 h et 23 h. Voir
 * docs/sauvegarde/README.md.
 *
 * Où ça écrit : si Google Drive pour ordinateur est installé, le dossier
 * « sauvegarde calendriers pompiers » de « Mon Drive » est utilisé — les
 * sauvegardes montent alors toutes seules sur le Drive. Sinon, elles restent
 * dans « Documents\\Sauvegardes calendriers pompiers ».
 *
 * La clé de lecture de la base se trouve dans « cle.txt », à côté des
 * sauvegardes. Elle n'est jamais dans ce fichier : ce dossier-ci est public.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, appendFileSync, writeFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Adresse de la base. Peut etre remplacee par « --base <adresse> » : utile si
// le projet Supabase demenage, et pour essayer le script sans toucher a la
// vraie base.
const URL_BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'https://enopjnyqycrtydgtuiys.supabase.co';
})();

const TABLES = [
  'profils',
  'tournees',
  'adresses',
  'campagnes',
  'equipes',
  'decomptes',
  'journal',
  'suppressions',
  'archives_adresses',
];

const NOM_DOSSIER = 'sauvegarde calendriers pompiers';
const NOM_REPLI = join(homedir(), 'Documents', 'Sauvegardes calendriers pompiers');
const TEMOIN_ECHEC = 'SAUVEGARDE-EN-ECHEC-LIRE-MOI.txt';

// Ménage : rien n'est effacé, les fichiers écartés vont dans « corbeille ».
const MENAGE_ACTIF = true;
const JOURS_TOUT_GARDER = 60;
const JOURS_UN_PAR_JOUR = 400;

// ------------------------------------------------------------- où écrire

/**
 * Cherche un dossier Google Drive pour ordinateur. S'il en existe un, les
 * sauvegardes y vont et montent sur le Drive sans rien avoir à faire.
 */
function dossierDrive() {
  const bases = [];
  for (const lettre of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    bases.push(`${lettre}:\\Mon Drive`, `${lettre}:\\My Drive`);
  }
  bases.push(
    join(homedir(), 'Mon Drive'),
    join(homedir(), 'My Drive'),
    join(homedir(), 'Google Drive'),
  );
  for (const base of bases) {
    if (existsSync(base)) return join(base, NOM_DOSSIER);
  }
  return null;
}

function dossierDeTravail(force) {
  const choisi = force ?? dossierDrive() ?? NOM_REPLI;
  mkdirSync(choisi, { recursive: true });
  return choisi;
}

// ------------------------------------------------------------------- clé

function lireCle(dossier) {
  const chemin = join(dossier, 'cle.txt');
  if (!existsSync(chemin)) {
    throw new Error(
      `Clé absente. Ouvrez « ${chemin} » et collez-y la clé service_role de ` +
        'Supabase (tableau de bord → Project Settings → API Keys), puis enregistrez.',
    );
  }
  const cle = readFileSync(chemin, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .join('');
  const essai = process.argv.includes('--base');
  if (!essai && (cle.length < 40 || !cle.startsWith('ey'))) {
    throw new Error(
      `Le fichier « ${chemin} » ne contient pas une clé valable. Il faut la clé ` +
        '« service_role » entière, qui commence par « ey » et fait plusieurs ' +
        'centaines de caractères.',
    );
  }
  return cle;
}

// --------------------------------------------------------- lecture base

/**
 * Lit une table entière. La base ne renvoie que 1000 lignes à la fois : on
 * demande les pages l'une après l'autre, triées par identifiant pour qu'aucune
 * ligne ne soit ni oubliée ni comptée deux fois.
 */
async function lireTable(table, cle) {
  const PAS = 1000;
  const lignes = [];
  for (let depart = 0; ; depart += PAS) {
    const adresse = `${URL_BASE}/rest/v1/${table}?select=*&order=id.asc&limit=${PAS}&offset=${depart}`;
    const reponse = await fetch(adresse, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    });

    if ((reponse.status === 404 || reponse.status === 400) && depart === 0) {
      return { absente: true, lignes: [] };
    }
    if (reponse.status === 401 || reponse.status === 403) {
      throw new Error(
        `La base a refusé la clé (HTTP ${reponse.status}). Dans « cle.txt » il faut ` +
          'la clé « service_role », pas la clé « anon ».',
      );
    }
    if (!reponse.ok) {
      const texte = await reponse.text();
      throw new Error(
        `Lecture de « ${table} » impossible (HTTP ${reponse.status}) : ${texte.slice(0, 300)}`,
      );
    }

    const page = await reponse.json();
    lignes.push(...page);
    if (page.length < PAS) break;
  }
  return { absente: false, lignes };
}

// -------------------------------------------------------------- lisible

const LIBELLE_STATUT = {
  a_faire: 'À faire',
  distribue: 'Calendrier distribué',
  absent: 'Absent, à repasser',
  refus: 'Refus / pas intéressé',
  inhabite: 'Inhabité',
  secondaire: 'Maison secondaire',
};

const COUPURES = [['c50', 0.5], ['e1', 1], ['e2', 2], ['b5', 5], ['b10', 10], ['b20', 20], ['b50', 50], ['b100', 100]];

function totalDecompte(d) {
  let total = 0;
  for (const [cle, valeur] of COUPURES) total += ((d.especes ?? {})[cle] ?? 0) * valeur;
  for (const l of d.cheques ?? []) total += (l.nombre ?? 0) * (l.montant ?? 0);
  total += d.cb ?? 0;
  return Math.round(total * 100) / 100;
}

/** Excel français : séparateur « ; », virgule décimale, et un BOM pour les accents. */
function versCsv(entetes, lignes) {
  const cellule = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const texte = String(v);
    return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  const tout = [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n');
  return '﻿' + tout + '\r\n';
}

function ecrireLisibles(dossier, tables) {
  const nomTournee = new Map((tables.tournees ?? []).map((t) => [t.id, t.nom]));
  const nomProfil = new Map((tables.profils ?? []).map((p) => [p.id, p.nom]));
  const decompteDe = new Map((tables.decomptes ?? []).map((d) => [d.tournee_id, d]));

  const tournees = [...(tables.tournees ?? [])]
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }))
    .map((t) => {
      const siennes = (tables.adresses ?? []).filter((a) => a.tournee_id === t.id);
      const d = decompteDe.get(t.id);
      return [
        t.nom,
        siennes.length,
        siennes.filter((a) => a.statut !== 'a_faire').length,
        siennes.filter((a) => a.statut === 'a_faire').length,
        siennes.filter((a) => a.statut === 'absent').length,
        d ? totalDecompte(d) : null,
        d?.numero_recu ?? null,
        d?.termine ? 'oui' : 'non',
      ];
    });

  const adresses = (tables.adresses ?? []).map((a) => [
    nomTournee.get(a.tournee_id) ?? '?',
    a.libelle,
    a.commune,
    LIBELLE_STATUT[a.statut] ?? a.statut,
    a.somme,
    a.calendriers_laisses,
    a.note,
    a.rappel_le,
    a.modifie_le,
  ]);

  const decomptes = (tables.decomptes ?? []).map((d) => [
    nomTournee.get(d.tournee_id) ?? '?',
    d.numero_recu,
    d.termine ? 'oui' : 'non',
    d.termine_le,
    (d.participants ?? []).map((id) => nomProfil.get(id) ?? '?').join(', '),
    totalDecompte(d),
  ]);

  writeFileSync(
    join(dossier, 'derniere-sauvegarde-tournees.csv'),
    versCsv(['Tournée', 'Points', 'Faits', 'À faire', 'À repasser', 'Total reçu (€)', 'N° reçu', 'Terminée'], tournees),
  );
  writeFileSync(
    join(dossier, 'derniere-sauvegarde-adresses.csv'),
    versCsv(['Tournée', 'Adresse', 'Commune', 'Statut', 'Somme (€)', 'Calendriers', 'Commentaire', 'Rappel', 'Modifié le'], adresses),
  );
  writeFileSync(
    join(dossier, 'derniere-sauvegarde-decomptes.csv'),
    versCsv(['Tournée', 'N° reçu', 'Terminée', 'Clôturée le', 'Participants', 'Total (€)'], decomptes),
  );
}

// --------------------------------------------------------------- ménage

/**
 * Déplace les sauvegardes trop anciennes dans « corbeille » — rien n'est
 * effacé, vous videz ce sous-dossier quand vous voulez.
 *
 *   - moins de 60 jours  : tout est gardé (les trois par jour)
 *   - jusqu'à 400 jours  : la dernière de chaque jour
 *   - au-delà            : la dernière de chaque mois
 */
function menage(dossier, aujourdhui) {
  const MOTIF = /^sauvegarde-(\d{4})-(\d{2})-(\d{2})-(\d{2})h\.json\.gz$/;
  const parJour = new Map();
  for (const nom of readdirSync(dossier)) {
    const m = MOTIF.exec(nom);
    if (!m) continue;
    const jour = `${m[1]}-${m[2]}-${m[3]}`;
    if (!parJour.has(jour)) parJour.set(jour, []);
    parJour.get(jour).push(nom);
  }

  const jours = [...parJour.keys()].sort().reverse();
  const jourGardeDuMois = new Map();
  for (const jour of jours) {
    const mois = jour.slice(0, 7);
    if (!jourGardeDuMois.has(mois)) jourGardeDuMois.set(mois, jour);
  }

  const aJeter = [];
  for (const jour of jours) {
    const [a, m, j] = jour.split('-').map(Number);
    const age = Math.round((aujourdhui - Date.UTC(a, m - 1, j)) / 86400000);
    if (age <= JOURS_TOUT_GARDER) continue;
    const liste = parJour.get(jour).sort();
    if (age <= JOURS_UN_PAR_JOUR || jour === jourGardeDuMois.get(jour.slice(0, 7))) {
      aJeter.push(...liste.slice(0, -1)); // on garde la dernière du jour
    } else {
      aJeter.push(...liste); // ce jour-là n'est pas celui retenu pour le mois
    }
  }

  if (aJeter.length === 0) return 'rien à ranger';
  const corbeille = join(dossier, 'corbeille');
  mkdirSync(corbeille, { recursive: true });
  for (const nom of aJeter) renameSync(join(dossier, nom), join(corbeille, nom));
  return `${aJeter.length} ancien(s) fichier(s) déplacé(s) dans « corbeille »`;
}

// ----------------------------------------------------------------- main

function horodatage(d) {
  const p = (n) => String(n).padStart(2, '0');
  return {
    jour: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    heure: p(d.getHours()),
    complet: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

function noter(dossier, texte) {
  try {
    appendFileSync(join(dossier, 'journal.txt'), texte + '\r\n', 'utf8');
  } catch {
    /* le journal est un confort, il ne doit jamais faire échouer la sauvegarde */
  }
}

async function main() {
  const argForce = process.argv.indexOf('--dossier');
  const dossier = dossierDeTravail(argForce > -1 ? process.argv[argForce + 1] : null);

  // « --ou » sert a l'installateur : il affiche le dossier retenu et s'arrete.
  if (process.argv.includes('--ou')) {
    console.log(dossier);
    return;
  }

  const maintenant = new Date();
  const t = horodatage(maintenant);

  try {
    const cle = lireCle(dossier);

    const tables = {};
    const compte = {};
    const absentes = [];
    for (const table of TABLES) {
      const lu = await lireTable(table, cle);
      if (lu.absente) absentes.push(table);
      else {
        tables[table] = lu.lignes;
        compte[table] = lu.lignes.length;
      }
    }

    // Garde-fou : une base en panne ne doit pas remplacer de bonnes
    // sauvegardes par un fichier vide.
    if (!tables.adresses || tables.adresses.length === 0) {
      throw new Error(
        'La base n’a renvoyé aucune adresse : sauvegarde annulée pour ne pas ' +
          'enregistrer un fichier vide. Les sauvegardes précédentes sont intactes.',
      );
    }

    const sauvegarde = {
      format: 'sauvegarde-tournees-calendriers',
      version: 1,
      genere_le: maintenant.toISOString(),
      source: 'ordinateur',
      tables,
      compte,
    };
    if (absentes.length > 0) sauvegarde.tables_absentes = absentes;

    const nom = `sauvegarde-${t.jour}-${t.heure}h.json.gz`;
    writeFileSync(join(dossier, nom), gzipSync(JSON.stringify(sauvegarde), { level: 9 }));
    ecrireLisibles(dossier, tables);

    const rangement = MENAGE_ACTIF
      ? menage(dossier, Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()))
      : 'ménage désactivé';

    // Le témoin d'échec disparaît dès qu'une sauvegarde repasse.
    try {
      rmSync(join(dossier, TEMOIN_ECHEC));
    } catch {
      /* il n'y en avait pas : tant mieux */
    }

    const resume = Object.entries(compte).map(([k, v]) => `${k} ${v}`).join(', ');
    noter(dossier, `${t.complet}  OK  ${nom} — ${resume}${absentes.length ? ` — tables absentes : ${absentes.join(', ')}` : ''} — ${rangement}`);
    console.log(`Sauvegarde écrite : ${join(dossier, nom)}`);
    console.log(resume);
  } catch (erreur) {
    noter(dossier, `${t.complet}  ÉCHEC  ${erreur.message}`);
    try {
      writeFileSync(
        join(dossier, TEMOIN_ECHEC),
        'La dernière sauvegarde automatique n’a pas abouti.\r\n\r\n' +
          `Quand : ${t.complet}\r\n` +
          `Motif : ${erreur.message}\r\n\r\n` +
          'Les sauvegardes précédentes de ce dossier sont intactes.\r\n' +
          'Ce fichier disparaîtra tout seul dès qu’une sauvegarde repassera.\r\n' +
          'L’historique complet des passages est dans journal.txt.\r\n',
        'utf8',
      );
    } catch {
      /* rien de plus à faire */
    }
    console.error(`Échec : ${erreur.message}`);
    process.exit(1);
  }
}

main();
