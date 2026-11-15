// Essai de la mise à jour n°16 sur un PostgreSQL d'essai, en mémoire.
// Aucun lien avec la vraie base.
//
// Le moteur d'essai (PGlite) n'est pas une dépendance de l'application : on
// l'installe à part, dans un dossier temporaire, puis on y lance ce fichier :
//   mkdir essai-sql && cd essai-sql && npm init -y && npm install @electric-sql/pglite
//   cp <projet>/tests/sql/test-archivage.mjs . && node test-archivage.mjs <projet>
// Il essaie d'abord l'archivage actuel (n°13), puis la mise à jour n°16.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const projet = process.argv[2];
const lireSql = (f) => readFileSync(projet + '/docs/' + f, 'utf8');
let reussis = 0;
let rates = 0;
const verifier = (nom, ok, detail = '') => {
  if (ok) reussis += 1;
  else {
    rates += 1;
    console.log('  ECHEC :', nom, detail);
  }
};

async function base() {
  const db = new PGlite();
  // schéma réduit, colonnes et types identiques à la production
  await db.exec(`
    create role authenticated;
    create function public.est_admin() returns boolean language sql as $$ select true $$;
    create table tournees (
      id uuid primary key, nom text not null, couleur text not null default '#e63946',
      polygone jsonb not null default '[]', dispo_conseillee text not null default '',
      calendriers_annee_derniere integer, ban_ids_exclus jsonb not null default '[]',
      cree_le timestamptz not null default now(), modifie_le timestamptz not null default now());
    create table adresses (
      id uuid primary key, tournee_id uuid not null references tournees(id) on delete cascade,
      ban_id text, manuelle boolean not null default false, libelle text not null,
      commune text not null default '', code_postal text not null default '',
      lat double precision not null, lng double precision not null,
      autres_adresses jsonb not null default '[]',
      statut text not null default 'a_faire'
        check (statut in ('a_faire','distribue','absent','refus','inhabite','secondaire')),
      somme double precision, calendriers_laisses integer, rappel_le timestamptz, note text,
      note_le timestamptz, statut_precedent text,
      type_batiment text not null default 'maison', appartements jsonb not null default '[]',
      paiement jsonb, modifie_le timestamptz not null default now());
    create table campagnes (
      id uuid primary key, nom text not null, calendriers_commandes integer, taille_paquet integer,
      statut text not null default 'active', lots jsonb not null default '[]',
      cree_le timestamptz not null default now(), archivee_le timestamptz,
      modifie_le timestamptz not null default now());
    create table decomptes (
      id uuid primary key, tournee_id uuid not null references tournees(id) on delete cascade,
      campagne_id uuid references campagnes(id) on delete set null,
      participants jsonb not null default '[]', seances jsonb not null default '[]',
      especes jsonb not null default '{}', cheques jsonb not null default '[]', cb double precision,
      calendriers_distribues integer, termine boolean not null default false, termine_le timestamptz,
      numero_recu integer, cree_le timestamptz not null default now(), modifie_le timestamptz not null default now());
    create table equipes (id uuid primary key, nom text not null default '', membres jsonb not null default '[]',
      tournee_id uuid, cree_le timestamptz not null default now(), modifie_le timestamptz not null default now());
    create table archives_adresses (
      id uuid primary key default gen_random_uuid(),
      campagne_id uuid not null references campagnes (id) on delete cascade,
      tournee_id uuid, tournee_nom text not null default '', adresse_id uuid, ban_id text,
      libelle text, commune text, statut text, somme double precision,
      calendriers_laisses integer, note text);
  `);
  // le garde-fou des écritures en retard (mise à jour n°13), comme en production
  const n13 = lireSql('supabase-statuts-et-synchro.sql');
  const garde = n13.slice(n13.indexOf('create or replace function public.proteger_ecriture_obsolete'), n13.indexOf('-- ---------- 4.'));
  await db.exec(garde);
  return db;
}

const T = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const paiement = JSON.stringify({ especes: { b10: 2, e2: 1 }, cheques: [15], cb: 12.5 });
const apparts = JSON.stringify([
  { id: 'app-1', etage: 'RDC', numero: 'A', statut: 'distribue', calendriers: 2, paiement: { especes: { b20: 1 }, cheques: [], cb: null } },
  { id: 'app-2', etage: '1er', numero: 'B', statut: 'absent' },
  { id: 'app-3', etage: '2e', numero: 'C', statut: 'refus', calendriers: null },
  { etage: '3e', numero: 'D', statut: 'distribue', calendriers: 1 }, // sans identifiant
]);

async function remplir(db) {
  await db.exec(`
    insert into tournees (id, nom, polygone, ban_ids_exclus, calendriers_annee_derniere)
      values ('${T}', 'Tournée 1', '[[45.8,1.4],[45.9,1.4],[45.9,1.5]]', '["ban-supprimee"]', 100);
    insert into campagnes (id, nom) values ('${C}', '2026');
    insert into adresses (id, tournee_id, ban_id, manuelle, libelle, lat, lng, statut, somme,
                          calendriers_laisses, rappel_le, note, note_le, type_batiment, appartements, paiement, modifie_le) values
      ('${id(1)}', '${T}', 'ban1', false, '1 rue du Pont (renommée)', 45.8311, 1.4822, 'distribue', 32.5, 2, null, 'chien', now(), 'maison', '[]', '${paiement}', now() - interval '2 day'),
      ('${id(2)}', '${T}', 'ban2', false, '2 rue du Pont', 45.8312, 1.4823, 'inhabite', null, null, null, null, null, 'maison', '[]', null, now() - interval '2 day'),
      ('${id(3)}', '${T}', 'ban3', false, '3 rue du Pont', 45.8313, 1.4824, 'secondaire', null, null, null, null, null, 'maison', '[]', null, now() - interval '2 day'),
      ('${id(4)}', '${T}', null, true, 'Ferme ajoutée à la main', 45.84, 1.49, 'absent', null, null, now() + interval '1 day', 'repasser après 18 h', now(), 'maison', '[]', null, now() - interval '2 day'),
      ('${id(5)}', '${T}', 'ban5', false, 'Résidence Les Tilleuls', 45.835, 1.485, 'absent', 20, 3, null, null, null, 'immeuble', '${apparts}', null, now() - interval '2 day'),
      ('${id(6)}', '${T}', 'ban6', false, 'Immeuble sans appartements', 45.836, 1.486, 'inhabite', null, null, null, null, null, 'immeuble', '[]', null, now() - interval '2 day'),
      ('${id(7)}', '${T}', 'ban7', false, '7 rue du Pont', 45.837, 1.487, 'refus', null, null, null, null, null, 'maison', '[]', '{"especes":{},"cheques":[],"cb":null}', now() - interval '2 day');
    insert into decomptes (id, tournee_id, campagne_id, especes, termine, numero_recu, calendriers_distribues)
      values ('${id(90)}', '${T}', '${C}', '{"b10":5}', true, 6, 120);
  `);
}

const lire = async (db) =>
  Object.fromEntries((await db.query('select * from adresses order by id')).rows.map((r) => [r.id, r]));

// ---------- 1. la version actuelle (n°13) : ce qu'elle laisse passer ----------
console.log('Version actuelle (mise à jour n°13)');
{
  const db = await base();
  const n13 = lireSql('supabase-statuts-et-synchro.sql');
  await db.exec(n13.slice(n13.indexOf('create or replace function public.archiver_campagne'), n13.lastIndexOf('$$;') + 3));
  await remplir(db);
  await db.query(`select archiver_campagne('${C}')`);
  const a = await lire(db);
  console.log('  détail du paiement resté sur la maison :', JSON.stringify(a[id(1)].paiement));
  console.log('  appartements restés :', a[id(5)].appartements.map((p) => p.statut + (p.paiement ? ' + paiement' : '') + (p.calendriers ? ' + ' + p.calendriers + ' cal.' : '')).join(', '));
}

// ---------- 2. la mise à jour n°16 ----------
console.log('\nMise à jour n°16');
{
  const db = await base();
  await db.exec(lireSql('supabase-mise-a-jour-16.sql'));
  await remplir(db);
  const avant = await lire(db);
  const version = (await db.query('select public.version_archivage() as v')).rows[0].v;
  verifier('version_archivage répond 16', version === 16, String(version));

  await db.query(`select archiver_campagne('${C}')`);
  const a = await lire(db);

  // --- plus aucune trace d'argent sur les fiches ---
  for (const r of Object.values(a)) {
    verifier(`${r.libelle} : somme effacée`, r.somme === null);
    verifier(`${r.libelle} : détail du paiement effacé`, r.paiement === null);
    verifier(`${r.libelle} : calendriers laissés effacés`, r.calendriers_laisses === null);
    verifier(`${r.libelle} : rappel effacé`, r.rappel_le === null);
    for (const p of r.appartements) {
      verifier(`${r.libelle} ${p.etage} : appartement « à faire »`, p.statut === 'a_faire', p.statut);
      verifier(`${r.libelle} ${p.etage} : sans paiement ni calendriers`, !('paiement' in p) && !('calendriers' in p), JSON.stringify(p));
    }
  }

  // --- statuts ---
  verifier('maison distribuée → à faire', a[id(1)].statut === 'a_faire');
  verifier('… avec « l’an dernier : distribué »', a[id(1)].statut_precedent === 'distribue');
  verifier('maison inhabitée → reste inhabitée', a[id(2)].statut === 'inhabite');
  verifier('maison secondaire → reste secondaire', a[id(3)].statut === 'secondaire');
  verifier('maison absente → à faire', a[id(4)].statut === 'a_faire');
  verifier('refus → à faire', a[id(7)].statut === 'a_faire' && a[id(7)].statut_precedent === 'refus');
  verifier('immeuble à appartements → à faire', a[id(5)].statut === 'a_faire', a[id(5)].statut);
  verifier('immeuble sans appartement, inhabité → reste inhabité', a[id(6)].statut === 'inhabite');

  // --- appartements : liste, ordre, étage, numéro conservés ---
  const ap = a[id(5)].appartements;
  verifier('4 appartements conservés', ap.length === 4, String(ap.length));
  verifier('ordre et étages conservés', ap.map((p) => p.etage).join(',') === 'RDC,1er,2e,3e', ap.map((p) => p.etage).join(','));
  verifier('numéros conservés', ap.map((p) => p.numero).join(',') === 'A,B,C,D');
  verifier('identifiants conservés', ap.slice(0, 3).map((p) => p.id).join(',') === 'app-1,app-2,app-3');
  verifier('appartement sans identifiant : en reçoit un', typeof ap[3].id === 'string' && ap[3].id.length === 36, String(ap[3].id));
  verifier('seulement id, étage, numéro, statut', ap.every((p) => Object.keys(p).sort().join(',') === 'etage,id,numero,statut'));

  // --- ce qui doit rester d'une année sur l'autre ---
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const x = avant[id(n)];
    const y = a[id(n)];
    verifier(`${x.libelle} : position conservée`, x.lat === y.lat && x.lng === y.lng);
    verifier(`${x.libelle} : nom conservé`, x.libelle === y.libelle);
    verifier(`${x.libelle} : ajout manuel conservé`, x.manuelle === y.manuelle);
    verifier(`${x.libelle} : maison / immeuble conservé`, x.type_batiment === y.type_batiment);
    verifier(`${x.libelle} : note conservée`, x.note === y.note && String(x.note_le) === String(y.note_le));
    verifier(`${x.libelle} : date de modification avancée`, y.modifie_le > x.modifie_le);
  }
  const t = (await db.query('select * from tournees')).rows[0];
  verifier('tournée : contour conservé', JSON.stringify(t.polygone) === '[[45.8,1.4],[45.9,1.4],[45.9,1.5]]');
  verifier('tournée : adresses supprimées le restent', JSON.stringify(t.ban_ids_exclus) === '["ban-supprimee"]');
  verifier('tournée : « distribués l’an dernier » repris du reçu', t.calendriers_annee_derniere === 120, String(t.calendriers_annee_derniere));
  const c = (await db.query('select * from campagnes')).rows[0];
  verifier('campagne archivée', c.statut === 'archivee' && c.archivee_le !== null);
  const arch = (await db.query('select count(*)::int as n from archives_adresses')).rows[0].n;
  verifier('photographie de la campagne : 7 adresses', arch === 7, String(arch));
  const d = (await db.query('select * from decomptes')).rows[0];
  verifier('le reçu de la campagne reste intact', d.numero_recu === 6 && d.termine === true);
}

// ---------- 3. la mise à jour se colle sans rien toucher, et deux fois sans erreur ----------
console.log('\nCollage en pleine campagne');
{
  const db = await base();
  await remplir(db);
  const avant = JSON.stringify(await lire(db));
  await db.exec(lireSql('supabase-mise-a-jour-16.sql'));
  await db.exec(lireSql('supabase-mise-a-jour-16.sql'));
  verifier('coller la mise à jour ne modifie aucune adresse', JSON.stringify(await lire(db)) === avant);
}

console.log(`\n${reussis} vérifications réussies, ${rates} en échec`);
process.exit(rates > 0 ? 1 : 0);
