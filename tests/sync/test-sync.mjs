// Tests de la synchronisation, sans réseau et sans production.
import { db } from './fausse-db.mjs';
import { journal, tables } from './faux-supabase.mjs';
import {
  abonnerTempsReel,
  enregistrerEcritures,
  fusionner,
  interpreterEvenement,
  lireDistant,
} from './sync.bundle.mjs';

let reussis = 0;
let rates = 0;
const verifier = (nom, condition, detail = '') => {
  if (condition) reussis += 1;
  else {
    rates += 1;
    console.log('  ECHEC :', nom, detail);
  }
};
const titre = (t) => console.log('\n' + t);

// ---------- fabriques ----------
const H = (minutes) => new Date(Date.UTC(2026, 10, 14, 10, minutes, 0)).toISOString();
const serveur = (iso) => iso.replace('Z', '+00:00'); // le format que renvoie la base
const tournee = (id, plus = {}) => ({
  id,
  nom: 'Tournée ' + id,
  couleur: '#e63946',
  polygone: [[45.8, 1.4], [45.9, 1.4], [45.9, 1.5]],
  dispoConseillee: '',
  calendriersAnneeDerniere: null,
  banIdsExclus: [],
  creeLe: H(0),
  modifieLe: H(0),
  ...plus,
});
const adresse = (id, tourneeId, plus = {}) => ({
  id,
  tourneeId,
  banId: null,
  manuelle: false,
  libelle: 'rue ' + id,
  commune: 'Saint-Léonard',
  codePostal: '87400',
  lat: 45.83,
  lng: 1.49,
  autresAdresses: [],
  typeBatiment: 'maison',
  appartements: [],
  statut: 'a_faire',
  paiement: null,
  statutPrecedent: null,
  noteLe: null,
  somme: null,
  calendriersLaisses: null,
  rappelLe: null,
  note: null,
  modifieLe: H(0),
  ...plus,
});
const equipe = (id, plus = {}) => ({
  id,
  nom: 'Équipe ' + id,
  membres: ['p1'],
  tourneeId: null,
  creeLe: H(0),
  modifieLe: H(0),
  ...plus,
});
const decompte = (id, tourneeId, plus = {}) => ({
  id,
  tourneeId,
  campagneId: 'c1',
  participants: ['p1'],
  seances: [],
  especes: {},
  cheques: [],
  cb: null,
  calendriersDistribues: null,
  termine: false,
  termineLe: null,
  numeroRecu: null,
  creeLe: H(0),
  modifieLe: H(0),
  ...plus,
});
const campagne = (id, plus = {}) => ({
  id,
  nom: '2026',
  calendriersCommandes: null,
  taillePaquet: null,
  statut: 'active',
  lots: [],
  creeLe: H(0),
  archiveeLe: null,
  modifieLe: H(0),
  ...plus,
});
const etat = (plus = {}) => ({ tournees: [], adresses: [], campagnes: [], equipes: [], decomptes: [], ...plus });
const distant = (plus = {}) => ({ ...etat(), tombes: new Set(), ...plus });
const copieServeur = (x) => ({ ...x, modifieLe: serveur(x.modifieLe), ...(x.creeLe ? { creeLe: serveur(x.creeLe) } : {}) });

// =====================================================================
titre('1. Rien n’a changé : aucune liste remplacée, rien à écrire, rien à envoyer');
{
  const local = etat({
    tournees: [tournee('t1')],
    adresses: [adresse('a1', 't1'), adresse('a2', 't1', { statut: 'distribue', somme: 10 })],
    campagnes: [campagne('c1')],
    equipes: [equipe('e1', { tourneeId: 't1' })],
    decomptes: [decompte('d1', 't1')],
  });
  const f = fusionner(
    local,
    distant({
      tournees: local.tournees.map(copieServeur),
      adresses: local.adresses.map(copieServeur),
      campagnes: local.campagnes.map(copieServeur),
      equipes: local.equipes.map(copieServeur),
      decomptes: local.decomptes.map(copieServeur),
    }),
  );
  for (const t of ['tournees', 'adresses', 'campagnes', 'equipes', 'decomptes']) {
    verifier(`liste ${t} conservée telle quelle`, f.listes[t] === local[t]);
    verifier(`rien à écrire pour ${t}`, f.ecritures[t].mettre.length === 0 && f.ecritures[t].retirer.length === 0);
    verifier(`rien à envoyer pour ${t}`, f.aPousser[t].length === 0);
  }
}

titre('2. Un collègue a modifié une adresse : elle seule change');
{
  const a1 = adresse('a1', 't1');
  const a2 = adresse('a2', 't1');
  const local = etat({ tournees: [tournee('t1')], adresses: [a1, a2] });
  const a2serveur = { ...a2, statut: 'distribue', modifieLe: serveur(H(5)) };
  const f = fusionner(local, distant({ tournees: local.tournees.map(copieServeur), adresses: [copieServeur(a1), a2serveur] }));
  verifier('a1 garde le même objet', f.listes.adresses[0] === a1);
  verifier('a2 prend la version du serveur', f.listes.adresses[1] === a2serveur);
  verifier('une seule écriture locale', f.ecritures.adresses.mettre.length === 1 && f.ecritures.adresses.mettre[0] === a2serveur);
  verifier('rien à envoyer', f.aPousser.adresses.length === 0);
  verifier('tournées non remplacées', f.listes.tournees === local.tournees);
}

titre('3. LA COURSE : une maison cochée PENDANT la lecture du serveur');
{
  // t = 0 : la lecture du serveur part. Le serveur connaît a1 en « à faire ».
  const a1 = adresse('a1', 't1');
  const lu = distant({ tournees: [copieServeur(tournee('t1'))], adresses: [copieServeur(a1)] });
  // t = 2 s : le pompier coche la maison ; la réponse n'est pas encore arrivée.
  const a1cochee = { ...a1, statut: 'distribue', modifieLe: H(1) };
  const etatDuMoment = etat({ tournees: [tournee('t1')], adresses: [a1cochee] });
  // t = 4 s : la réponse arrive, on fusionne avec l'état DU MOMENT.
  const f = fusionner(etatDuMoment, lu);
  verifier('la maison reste cochée', f.listes.adresses[0].statut === 'distribue');
  verifier('la liste n’est même pas remplacée', f.listes.adresses === etatDuMoment.adresses);
  verifier('la saisie est (re)envoyée au serveur', f.aPousser.adresses.length === 1 && f.aPousser.adresses[0] === a1cochee);
  verifier('rien n’est réécrit par-dessus dans le téléphone', f.ecritures.adresses.mettre.length === 0);
  // Contre-épreuve : l'ancienne méthode fusionnait avec la photo d'avant la lecture.
  const ancienne = fusionner(etat({ tournees: [tournee('t1')], adresses: [a1] }), lu);
  verifier('(contre-épreuve) avec la photo d’avant, la maison serait repassée grise', ancienne.listes.adresses[0].statut === 'a_faire');
}

titre('4. Horloges : contenu identique mais date locale plus récente → on adopte le serveur sans renvoyer');
{
  const a1 = adresse('a1', 't1', { modifieLe: H(9) });
  const a1s = { ...a1, modifieLe: serveur(H(2)) };
  const f = fusionner(etat({ tournees: [tournee('t1')], adresses: [a1] }), distant({ tournees: [copieServeur(tournee('t1'))], adresses: [a1s] }));
  verifier('version du serveur adoptée', f.listes.adresses[0] === a1s);
  verifier('rien à envoyer', f.aPousser.adresses.length === 0);
}

titre('5. Mêmes dates mais contenu différent → le serveur fait foi');
{
  const a1 = adresse('a1', 't1', { statut: 'absent' });
  const a1s = { ...copieServeur(a1), statut: 'distribue' };
  const f = fusionner(etat({ tournees: [tournee('t1')], adresses: [a1] }), distant({ tournees: [copieServeur(tournee('t1'))], adresses: [a1s] }));
  verifier('version du serveur', f.listes.adresses[0] === a1s);
  verifier('rien à envoyer', f.aPousser.adresses.length === 0);
}

titre('6. Pierres tombales');
{
  const t1 = tournee('t1');
  const supprimee = adresse('a-supprimee', 't1');
  const creeeHorsLigne = adresse('a-neuve', 't1', { modifieLe: H(3) });
  const vivante = adresse('a-vivante', 't1', { statut: 'distribue', modifieLe: H(8) });
  const local = etat({ tournees: [t1], adresses: [supprimee, creeeHorsLigne, vivante] });
  const f = fusionner(
    local,
    distant({
      tournees: [copieServeur(t1)],
      // a-vivante existe sur le serveur ET porte une pierre (cas des 857 adresses
      // dont l'identifiant a servi à une tournée fantôme supprimée depuis)
      adresses: [{ ...copieServeur(vivante), statut: 'a_faire', modifieLe: serveur(H(1)) }],
      tombes: new Set(['a-supprimee', 'a-vivante']),
    }),
  );
  const ids = f.listes.adresses.map((a) => a.id);
  verifier('l’adresse supprimée ailleurs disparaît', !ids.includes('a-supprimee'));
  verifier('... et sort de la base du téléphone', f.ecritures.adresses.retirer.includes('a-supprimee'));
  verifier('... sans être renvoyée', !f.aPousser.adresses.some((a) => a.id === 'a-supprimee'));
  verifier('l’adresse créée hors ligne est gardée et envoyée', ids.includes('a-neuve') && f.aPousser.adresses.some((a) => a.id === 'a-neuve'));
  verifier('l’adresse vivante n’est PAS masquée par la pierre : la saisie locale gagne', f.listes.adresses.find((a) => a.id === 'a-vivante').statut === 'distribue');
  verifier('... et part vers le serveur', f.aPousser.adresses.some((a) => a.id === 'a-vivante'));
}

titre('7. Tournée disparue : ses adresses et décomptes partent avec elle, sans être renvoyés');
{
  const local = etat({
    tournees: [tournee('t1'), tournee('t-supprimee')],
    adresses: [adresse('a1', 't1'), adresse('a2', 't-supprimee', { modifieLe: H(4) })],
    equipes: [equipe('e1', { tourneeId: 't-supprimee' })],
    decomptes: [decompte('d2', 't-supprimee')],
  });
  const f = fusionner(
    local,
    distant({
      tournees: [copieServeur(tournee('t1'))],
      adresses: [copieServeur(adresse('a1', 't1'))],
      equipes: [copieServeur(equipe('e1', { tourneeId: 't-supprimee' }))],
      tombes: new Set(['t-supprimee']),
    }),
  );
  verifier('tournée retirée', f.listes.tournees.length === 1);
  verifier('adresse orpheline retirée', f.listes.adresses.length === 1 && f.ecritures.adresses.retirer.includes('a2'));
  verifier('adresse orpheline NON envoyée (elle ferait refuser tout le paquet)', f.aPousser.adresses.length === 0);
  verifier('décompte orphelin retiré et non envoyé', f.listes.decomptes.length === 0 && f.aPousser.decomptes.length === 0);
  verifier('équipe détachée', f.listes.equipes[0].tourneeId === null);
}

titre('8. Lignes fantômes : jamais gardées, jamais envoyées');
{
  // une adresse arrivée dans la liste des décomptes (ce qui s'est produit en production)
  const adresseDeguisee = { id: 'a1', tourneeId: 't1', campagneId: null, participants: [], seances: [], especes: {}, cheques: [], cb: null, calendriersDistribues: null, termine: false, termineLe: null, numeroRecu: null, creeLe: undefined, modifieLe: H(2) };
  const tourneeDeguisee = { id: 'a1', nom: '', couleur: '#e63946', polygone: [], dispoConseillee: '', calendriersAnneeDerniere: null, banIdsExclus: [], creeLe: undefined, modifieLe: H(2) };
  const equipeDeguisee = { id: 'a1', nom: '', membres: [], tourneeId: 't1', creeLe: undefined, modifieLe: H(2) };
  const local = etat({
    tournees: [tournee('t1'), tourneeDeguisee],
    adresses: [adresse('a1', 't1'), { id: 'sans-date', tourneeId: 't1' }],
    equipes: [equipeDeguisee],
    decomptes: [adresseDeguisee],
  });
  const f = fusionner(local, distant({ tournees: [copieServeur(tournee('t1'))], adresses: [copieServeur(adresse('a1', 't1'))] }));
  verifier('fausse tournée écartée', f.listes.tournees.length === 1 && f.aPousser.tournees.length === 0);
  verifier('fausse équipe écartée', f.listes.equipes.length === 0 && f.aPousser.equipes.length === 0);
  verifier('faux décompte écarté', f.listes.decomptes.length === 0 && f.aPousser.decomptes.length === 0);
  verifier('adresse sans date écartée', f.listes.adresses.length === 1 && f.aPousser.adresses.length === 0);
  verifier('la vraie adresse a1 est intacte', f.listes.adresses[0] === local.adresses[0]);
}

titre('9. Immeubles et rappels : comparaison fine');
{
  const immeuble = adresse('a1', 't1', {
    typeBatiment: 'immeuble',
    appartements: [{ id: 'x', etage: '1', numero: 'A', statut: 'distribue' }],
    rappelLe: '2026-11-15T17:00:00.000Z',
    modifieLe: H(6),
  });
  const meme = { ...immeuble, appartements: [{ id: 'x', etage: '1', numero: 'A', statut: 'distribue' }], rappelLe: '2026-11-15T17:00:00+00:00', modifieLe: serveur(H(6)) };
  const f1 = fusionner(etat({ tournees: [tournee('t1')], adresses: [immeuble] }), distant({ tournees: [copieServeur(tournee('t1'))], adresses: [meme] }));
  verifier('même immeuble, formats de date différents : rien ne bouge', f1.listes.adresses[0] === immeuble && f1.aPousser.adresses.length === 0);
  const autre = { ...meme, appartements: [{ id: 'x', etage: '1', numero: 'A', statut: 'absent' }] };
  const f2 = fusionner(etat({ tournees: [tournee('t1')], adresses: [immeuble] }), distant({ tournees: [copieServeur(tournee('t1'))], adresses: [autre] }));
  verifier('appartement différent à date égale : le serveur fait foi', f2.listes.adresses[0] === autre);
}

titre('10. Volume réel : 6 172 adresses');
{
  const t = Array.from({ length: 31 }, (_, i) => tournee('t' + i));
  const a = Array.from({ length: 6172 }, (_, i) => adresse('a' + String(i).padStart(5, '0'), 't' + (i % 31)));
  const local = etat({ tournees: t, adresses: a });
  const lu = distant({ tournees: t.map(copieServeur), adresses: a.map(copieServeur) });
  lu.adresses[100] = { ...lu.adresses[100], statut: 'distribue', modifieLe: serveur(H(7)) };
  const debut = performance.now();
  let f;
  for (let i = 0; i < 20; i += 1) f = fusionner(local, lu);
  const duree = (performance.now() - debut) / 20;
  console.log(`  fusion de 6 172 adresses : ${duree.toFixed(1)} ms`);
  verifier('une seule adresse à écrire sur 6 172', f.ecritures.adresses.mettre.length === 1);
  verifier('6 171 objets inchangés', f.listes.adresses.filter((x, i) => x === a[i]).length === 6171);
  verifier('fusion rapide (< 60 ms sur ce PC)', duree < 60, `${duree.toFixed(1)} ms`);
}

titre('11. Écriture dans le téléphone : jamais une version plus ancienne par-dessus une plus récente');
{
  await db.adresses.clear();
  const recente = adresse('a1', 't1', { statut: 'distribue', modifieLe: H(9) });
  await db.adresses.put(recente);
  const avant = db.adresses.ecritures;
  const vieille = adresse('a1', 't1', { statut: 'a_faire', modifieLe: serveur(H(2)) });
  const neuve = adresse('a2', 't1', { modifieLe: serveur(H(2)) });
  await enregistrerEcritures({
    tournees: { mettre: [], retirer: [] },
    adresses: { mettre: [vieille, neuve], retirer: [] },
    campagnes: { mettre: [], retirer: [] },
    equipes: { mettre: [], retirer: [] },
    decomptes: { mettre: [], retirer: [] },
  });
  verifier('la saisie récente est restée', (await db.adresses.get('a1')).statut === 'distribue');
  verifier('la nouvelle ligne est écrite', (await db.adresses.get('a2')) === neuve);
  verifier('une seule écriture', db.adresses.ecritures - avant === 1);
}

titre('12. Lecture du serveur : par pages triées, sans trou ni doublon');
{
  const uuid = (i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
  tables.adresses = Array.from({ length: 2500 }, (_, i) => ({ id: uuid((i * 7919) % 2500), tournee_id: 't1', libelle: 'x', lat: 1, lng: 1, statut: 'a_faire', modifie_le: serveur(H(0)) }));
  tables.tournees = [{ id: 't1', nom: 'T', couleur: '#000', polygone: [], cree_le: serveur(H(0)), modifie_le: serveur(H(0)) }];
  tables.suppressions = Array.from({ length: 1342 }, (_, i) => ({ id: 's' + String(i).padStart(5, '0'), table_nom: 'adresses' }));
  journal.requetes.length = 0;
  const lu = await lireDistant();
  verifier('2 500 adresses lues', lu.adresses.length === 2500, String(lu.adresses.length));
  verifier('aucun doublon', new Set(lu.adresses.map((a) => a.id)).size === 2500);
  verifier('1 342 pierres lues', lu.tombes.size === 1342);
  const pagesA = journal.requetes.filter((r) => r.table === 'adresses');
  verifier('3 pages pour les adresses', pagesA.length === 3, String(pagesA.length));
  verifier('toutes les pages sont triées par identifiant', journal.requetes.every((r) => r.tri?.colonne === 'id' && r.tri.options.ascending === true));
  verifier('la 2e page repart de la dernière ligne lue', pagesA[1].apres === uuid(999) && pagesA[2].apres === uuid(1999));
}

titre('13. Temps réel : la table vient du MESSAGE, pas de l’abonnement');
{
  const ligneAdresse = { id: 'a1', tournee_id: 't1', libelle: '3 rue du Pont', lat: 45.8, lng: 1.4, statut: 'distribue', modifie_le: serveur(H(3)), commune: 'Saint-Léonard' };
  const e = { schema: 'public', table: 'adresses', eventType: 'UPDATE', commit_timestamp: 'x', new: ligneAdresse, old: {} };
  const c = interpreterEvenement(e);
  verifier('adresse reconnue comme adresse', c && c !== 'incomplet' && c.table === 'adresses' && c.adresse.statut === 'distribue');
  verifier('ligne amputée → relecture', interpreterEvenement({ ...e, new: { id: 'a1' } }) === 'incomplet');
  verifier('adresse annoncée comme décompte → refusée', interpreterEvenement({ ...e, table: 'decomptes' }) === 'incomplet');
  verifier('adresse annoncée comme tournée → refusée', interpreterEvenement({ ...e, table: 'tournees' }) === 'incomplet');
  verifier('table inconnue ignorée', interpreterEvenement({ ...e, table: 'journal' }) === null);
  verifier('autre schéma ignoré', interpreterEvenement({ ...e, schema: 'auth' }) === null);
  const s = interpreterEvenement({ schema: 'public', table: 'decomptes', eventType: 'DELETE', old: { id: 'a1' }, new: {} });
  verifier('suppression d’un décompte : c’est bien un décompte', s && s !== 'incomplet' && s.table === 'decomptes' && s.type === 'delete' && s.id === 'a1');
  verifier('suppression sans identifiant ignorée', interpreterEvenement({ schema: 'public', table: 'adresses', eventType: 'DELETE', old: {}, new: {} }) === null);
}

titre('14. Temps réel : le défaut de la bibliothèque ne peut plus fabriquer de fantôme');
{
  const recus = [];
  let incomplets = 0;
  const etats = [];
  const abo1 = abonnerTempsReel((c) => recus.push(c), (x) => etats.push(x), () => (incomplets += 1));
  const canal1 = journal.canaux[journal.canaux.length - 1];
  verifier('cinq abonnements, un par table', canal1.liaisons.length === 5);
  canal1.brancher();
  verifier('état « pret » signalé', etats.join() === 'pret' && abo1.pret());
  const ligneAdresse = { id: 'a1', tournee_id: 't1', libelle: '3 rue du Pont', lat: 45.8, lng: 1.4, statut: 'distribue', modifie_le: serveur(H(3)) };
  // la bibliothèque remet l'évènement d'adresse aux CINQ abonnements
  canal1.diffuserATous({ schema: 'public', table: 'adresses', eventType: 'UPDATE', commit_timestamp: 'c1', new: ligneAdresse, old: {} });
  verifier('un seul changement appliqué (pas cinq)', recus.length === 1, String(recus.length));
  verifier('... et c’est une adresse', recus[0].table === 'adresses');
  verifier('aucune tournée, équipe ni décompte fabriqué', !recus.some((c) => c.table !== 'adresses'));
  // suppression d'un décompte fantôme (même identifiant qu'une adresse) remise à tous
  canal1.diffuserATous({ schema: 'public', table: 'decomptes', eventType: 'DELETE', commit_timestamp: 'c2', old: { id: 'a1' }, new: {} });
  verifier('la suppression vise le décompte, jamais l’adresse du même identifiant', recus.length === 2 && recus[1].table === 'decomptes' && recus[1].type === 'delete');
  // coupure puis nouvel abonnement
  canal1.tomber();
  verifier('état « perdu » signalé', etats[etats.length - 1] === 'perdu');
  abo1.arreter();
  const abo2 = abonnerTempsReel((c) => recus.push(c), (x) => etats.push(x), () => (incomplets += 1));
  const canal2 = journal.canaux[journal.canaux.length - 1];
  verifier('le nouvel abonnement a son PROPRE canal', canal2 !== canal1 && canal2.topic !== canal1.topic);
  verifier('... avec exactement cinq abonnements (pas dix)', canal2.liaisons.length === 5 && canal1.liaisons.length === 5);
  verifier('l’ancien canal a été retiré', journal.retires.includes(canal1));
  // l'ancien canal, s'il parlait encore, ne serait plus écouté
  const avant = recus.length;
  canal1.diffuser({ schema: 'public', table: 'adresses', eventType: 'UPDATE', commit_timestamp: 'c3', new: ligneAdresse, old: {} });
  verifier('un canal arrêté ne livre plus rien', recus.length === avant);
  canal1.tomber('CLOSED');
  verifier('... et ne signale plus d’état', etats[etats.length - 1] === 'perdu' && etats.length === 2);
  canal2.brancher();
  canal2.diffuser({ schema: 'public', table: 'adresses', eventType: 'UPDATE', commit_timestamp: 'c4', new: ligneAdresse, old: {} });
  verifier('le nouveau canal livre normalement', recus.length === avant + 1 && abo2.pret());
  verifier('aucun évènement incomplet signalé à tort', incomplets === 0, String(incomplets));
  abo2.arreter();
}

console.log(`\n${reussis} vérifications réussies, ${rates} en échec`);
process.exit(rates > 0 ? 1 : 0);
