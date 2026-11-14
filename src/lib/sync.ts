// Synchronisation avec la base partagée Supabase.
// Principe : l'application écrit toujours d'abord en local (IndexedDB), puis
// pousse vers Supabase. En cas d'échec (hors-ligne), l'opération rejoint une
// file d'attente rejouée au retour du réseau. Conflits : la dernière
// modification gagne (comparaison des dates modifie_le).

import { supabase } from './supabase';
import { maintenantISO } from './horloge';
import { colonneDisponible, signalerColonnes } from './capacites';
import { db, type EnAttente } from '../store/db';
import type {
  AdressePoint,
  Appartement,
  Campagne,
  Decompte,
  Equipe,
  EntreeJournal,
  LigneCheques,
  LotCalendriers,
  PaiementAdresse,
  Seance,
  StatutAdresse,
  Tournee,
} from '../types';

// ---------- correspondance application <-> colonnes SQL ----------

function tourneeVersLigne(t: Tournee) {
  return {
    id: t.id,
    nom: t.nom,
    couleur: t.couleur,
    polygone: t.polygone,
    dispo_conseillee: t.dispoConseillee,
    calendriers_annee_derniere: t.calendriersAnneeDerniere,
    ban_ids_exclus: t.banIdsExclus,
    cree_le: t.creeLe,
    modifie_le: t.modifieLe,
  };
}

function ligneVersTournee(l: Record<string, unknown>): Tournee {
  return {
    id: l.id as string,
    nom: (l.nom as string) ?? '',
    couleur: (l.couleur as string) ?? '#e63946',
    polygone: (l.polygone as [number, number][]) ?? [],
    dispoConseillee: (l.dispo_conseillee as string) ?? '',
    calendriersAnneeDerniere: (l.calendriers_annee_derniere as number | null) ?? null,
    banIdsExclus: (l.ban_ids_exclus as string[]) ?? [],
    creeLe: l.cree_le as string,
    modifieLe: l.modifie_le as string,
  };
}

function campagneVersLigne(c: Campagne) {
  return {
    id: c.id,
    nom: c.nom,
    calendriers_commandes: c.calendriersCommandes,
    taille_paquet: c.taillePaquet,
    statut: c.statut,
    lots: c.lots,
    cree_le: c.creeLe,
    archivee_le: c.archiveeLe,
    modifie_le: c.modifieLe,
  };
}

function ligneVersCampagne(l: Record<string, unknown>): Campagne {
  return {
    id: l.id as string,
    nom: (l.nom as string) ?? '',
    calendriersCommandes: (l.calendriers_commandes as number | null) ?? null,
    taillePaquet: (l.taille_paquet as number | null) ?? null,
    statut: (l.statut as 'active' | 'archivee') ?? 'active',
    lots: (l.lots as LotCalendriers[]) ?? [],
    creeLe: l.cree_le as string,
    archiveeLe: (l.archivee_le as string | null) ?? null,
    modifieLe: l.modifie_le as string,
  };
}

function equipeVersLigne(e: Equipe) {
  return {
    id: e.id,
    nom: e.nom,
    membres: e.membres,
    tournee_id: e.tourneeId,
    cree_le: e.creeLe,
    modifie_le: e.modifieLe,
  };
}

function ligneVersEquipe(l: Record<string, unknown>): Equipe {
  return {
    id: l.id as string,
    nom: (l.nom as string) ?? '',
    membres: (l.membres as string[]) ?? [],
    tourneeId: (l.tournee_id as string | null) ?? null,
    creeLe: l.cree_le as string,
    modifieLe: l.modifie_le as string,
  };
}

function decompteVersLigne(d: Decompte) {
  return {
    id: d.id,
    tournee_id: d.tourneeId,
    campagne_id: d.campagneId,
    participants: d.participants,
    seances: d.seances,
    especes: d.especes,
    cheques: d.cheques,
    cb: d.cb,
    calendriers_distribues: d.calendriersDistribues,
    termine: d.termine,
    termine_le: d.termineLe,
    numero_recu: d.numeroRecu,
    cree_le: d.creeLe,
    modifie_le: d.modifieLe,
  };
}

function ligneVersDecompte(l: Record<string, unknown>): Decompte {
  return {
    id: l.id as string,
    tourneeId: l.tournee_id as string,
    campagneId: (l.campagne_id as string | null) ?? null,
    participants: (l.participants as string[]) ?? [],
    seances: (l.seances as Seance[]) ?? [],
    especes: (l.especes as Record<string, number | null>) ?? {},
    cheques: (l.cheques as LigneCheques[]) ?? [],
    cb: (l.cb as number | null) ?? null,
    calendriersDistribues: (l.calendriers_distribues as number | null) ?? null,
    termine: Boolean(l.termine),
    termineLe: (l.termine_le as string | null) ?? null,
    numeroRecu: (l.numero_recu as number | null) ?? null,
    creeLe: l.cree_le as string,
    modifieLe: l.modifie_le as string,
  };
}

function adresseVersLigne(a: AdressePoint) {
  return {
    id: a.id,
    tournee_id: a.tourneeId,
    ban_id: a.banId,
    manuelle: a.manuelle,
    libelle: a.libelle,
    commune: a.commune,
    code_postal: a.codePostal,
    lat: a.lat,
    lng: a.lng,
    autres_adresses: a.autresAdresses,
    note_le: a.noteLe,
    type_batiment: a.typeBatiment,
    appartements: a.appartements,
    statut: a.statut,
    // tant que la mise à jour n°15 n'est pas passée, envoyer cette colonne
    // ferait échouer toute l'écriture — statut compris
    ...(colonneDisponible('paiement') ? { paiement: a.paiement } : {}),
    statut_precedent: a.statutPrecedent ?? null,
    somme: a.somme,
    calendriers_laisses: a.calendriersLaisses,
    rappel_le: a.rappelLe,
    note: a.note,
    modifie_le: a.modifieLe,
  };
}

function ligneVersAdresse(l: Record<string, unknown>): AdressePoint {
  signalerColonnes(l);
  return {
    id: l.id as string,
    tourneeId: l.tournee_id as string,
    banId: (l.ban_id as string | null) ?? null,
    manuelle: Boolean(l.manuelle),
    libelle: (l.libelle as string) ?? '',
    commune: (l.commune as string) ?? '',
    codePostal: (l.code_postal as string) ?? '',
    lat: l.lat as number,
    lng: l.lng as number,
    autresAdresses: (l.autres_adresses as string[]) ?? [],
    noteLe: (l.note_le as string | null) ?? null,
    typeBatiment: (l.type_batiment as 'maison' | 'immeuble') ?? 'maison',
    appartements: (l.appartements as Appartement[]) ?? [],
    statut: (l.statut as StatutAdresse) ?? 'a_faire',
    paiement: (l.paiement as PaiementAdresse | null) ?? null,
    statutPrecedent: (l.statut_precedent as StatutAdresse | null) ?? null,
    somme: (l.somme as number | null) ?? null,
    calendriersLaisses: (l.calendriers_laisses as number | null) ?? null,
    rappelLe: (l.rappel_le as string | null) ?? null,
    note: (l.note as string | null) ?? null,
    modifieLe: l.modifie_le as string,
  };
}

// ---------- garde-fous contre les lignes incomplètes ----------

/**
 * Vrai si cette ligne venue du serveur porte vraiment un enregistrement.
 *
 * Le flux temps réel de Supabase n'est pas toujours complet : quand il ne peut
 * pas transmettre une ligne (trop grosse pour le flux, erreur « Payload Too
 * Large »), il envoie un enregistrement VIDE. Convertir ce vide donnait une
 * tournée sans nom, sans contour et sans adresse — une « tournée fantôme »
 * que personne n'avait créée, qui s'enregistrait dans le téléphone puis
 * repartait vers le serveur à la synchronisation suivante, où tout le monde
 * la voyait apparaître.
 *
 * On ne devine donc plus rien : si l'identifiant ou l'horodatage manquent, on
 * ignore l'évènement et on demande une relecture complète.
 */
function ligneComplete(l: unknown): l is Record<string, unknown> {
  if (!l || typeof l !== 'object') return false;
  const r = l as Record<string, unknown>;
  return typeof r.id === 'string' && r.id !== '' && typeof r.modifie_le === 'string';
}

/**
 * Vrai si cet enregistrement local est un fantôme : identifiant ou horodatage
 * manquants. Ces lignes sont jetées à la fusion et ne sont jamais envoyées.
 */
function estFantome(x: { id?: unknown; modifieLe?: unknown }): boolean {
  return typeof x.id !== 'string' || x.id === '' || typeof x.modifieLe !== 'string';
}

/** Les cinq listes de l'application, telles qu'elles sortent d'une fusion. */
export interface ResultatFusion {
  tournees: Tournee[];
  adresses: AdressePoint[];
  campagnes: Campagne[];
  equipes: Equipe[];
  decomptes: Decompte[];
}

/**
 * Retire du téléphone les enregistrements fantômes (voir estFantome) laissés
 * par une version précédente, et renvoie les listes nettoyées.
 *
 * Appelé au lancement : une tournée sans nom disparaît donc dès le premier
 * démarrage, sans attendre le réseau.
 */
export async function purgerFantomes(
  listes: ResultatFusion,
): Promise<{ propre: ResultatFusion; retires: number }> {
  let retires = 0;
  const garder = <T extends { id?: unknown; modifieLe?: unknown }>(liste: T[]): T[] => {
    const bons = liste.filter((x) => !estFantome(x));
    retires += liste.length - bons.length;
    return bons;
  };
  const propre: ResultatFusion = {
    tournees: garder(listes.tournees),
    adresses: garder(listes.adresses),
    campagnes: garder(listes.campagnes),
    equipes: garder(listes.equipes),
    decomptes: garder(listes.decomptes),
  };
  if (retires > 0) {
    // La clé d'un fantôme est inutilisable : on réécrit les tables sans lui.
    await db.transaction(
      'rw',
      [db.tournees, db.adresses, db.campagnes, db.equipes, db.decomptes],
      async () => {
        await db.tournees.clear();
        await db.tournees.bulkPut(propre.tournees);
        await db.adresses.clear();
        await db.adresses.bulkPut(propre.adresses);
        await db.campagnes.clear();
        await db.campagnes.bulkPut(propre.campagnes);
        await db.equipes.clear();
        await db.equipes.bulkPut(propre.equipes);
        await db.decomptes.clear();
        await db.decomptes.bulkPut(propre.decomptes);
      },
    );
  }
  return { propre, retires };
}

// ---------- opérations et file d'attente ----------

type Operation =
  | { table: 'tournees'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'tournees'; op: 'delete'; id: string }
  | { table: 'campagnes'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'campagnes'; op: 'delete'; id: string }
  | { table: 'equipes'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'equipes'; op: 'delete'; id: string }
  | { table: 'journal'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'decomptes'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'decomptes'; op: 'delete'; id: string }
  | { table: 'adresses'; op: 'upsert'; donnees: Record<string, unknown> | Record<string, unknown>[] }
  | { table: 'adresses'; op: 'delete'; id: string }
  | {
      table: 'adresses';
      op: 'remplacer';
      tourneeId: string;
      donnees: Record<string, unknown>[];
      suppressionsIds?: string[];
    };

// Enregistre des pierres tombales (l'échec n'est pas bloquant : au pire, la
// donnée pourrait réapparaître via un vieux cache, comme avant).
async function poserTombes(tableNom: string, ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return;
  await supabase
    .from('suppressions')
    .upsert(ids.map((id) => ({ id, table_nom: tableNom })));
}

async function executer(opr: Operation): Promise<void> {
  if (!supabase) return;
  if (opr.op === 'upsert') {
    const { error } = await supabase.from(opr.table).upsert(opr.donnees);
    if (error) throw error;
  } else if (opr.op === 'delete') {
    const { error } = await supabase.from(opr.table).delete().eq('id', opr.id);
    if (error) throw error;
    await poserTombes(opr.table, [opr.id]);
  } else {
    // Remplacement NON destructif. On écrit ce que cet appareil connaît et on
    // ne supprime QUE ce qui a été explicitement retiré. Auparavant toutes les
    // adresses de la tournée étaient effacées côté serveur avant réécriture :
    // une adresse créée ailleurs — ou tout le travail de l'équipe si le
    // recalcul n'avait rien trouvé — disparaissait définitivement.
    if (opr.donnees.length > 0) {
      const { error } = await supabase.from('adresses').upsert(opr.donnees);
      if (error) throw error;
    }
    const aSupprimer = opr.suppressionsIds ?? [];
    for (let i = 0; i < aSupprimer.length; i += 200) {
      const lot = aSupprimer.slice(i, i + 200);
      const { error } = await supabase.from('adresses').delete().in('id', lot);
      if (error) throw error;
    }
    await poserTombes('adresses', aSupprimer);
  }
}

async function pousser(opr: Operation): Promise<void> {
  if (!supabase) return;
  try {
    await executer(opr);
  } catch {
    // hors-ligne ou erreur passagère : on rejouera plus tard, dans l'ordre
    await db.enAttente.add({ operation: opr, quand: maintenantISO() });
  }
}

/**
 * Avant de rejouer une écriture mise de côté, on reprend la version ACTUELLE
 * de la ligne dans la base locale. Rejouer la photo d'origine écraserait les
 * modifications faites entre-temps par les collègues — c'est ce qui faisait
 * « revenir en gris » des maisons déjà distribuées.
 */
async function rafraichirOperation(opr: Operation): Promise<Operation | null> {
  const lire = async (table: string, id: string): Promise<Record<string, unknown> | null> => {
    if (table === 'adresses') {
      const x = await db.adresses.get(id);
      return x ? adresseVersLigne(x) : null;
    }
    if (table === 'tournees') {
      const x = await db.tournees.get(id);
      return x ? tourneeVersLigne(x) : null;
    }
    if (table === 'campagnes') {
      const x = await db.campagnes.get(id);
      return x ? campagneVersLigne(x) : null;
    }
    if (table === 'equipes') {
      const x = await db.equipes.get(id);
      return x ? equipeVersLigne(x) : null;
    }
    if (table === 'decomptes') {
      const x = await db.decomptes.get(id);
      return x ? decompteVersLigne(x) : null;
    }
    return null;
  };

  if (opr.op === 'remplacer') {
    const liste = await db.adresses.where('tourneeId').equals(opr.tourneeId).toArray();
    return { ...opr, donnees: liste.map(adresseVersLigne) };
  }
  if (opr.op !== 'upsert') return opr;
  // le journal est un historique : ses lignes ne changent jamais
  if (opr.table === 'journal') return opr;

  // seules les adresses s'envoient par paquets
  if (opr.table === 'adresses' && Array.isArray(opr.donnees)) {
    const fraiches: Record<string, unknown>[] = [];
    for (const d of opr.donnees) {
      const f = await lire('adresses', d.id as string);
      if (f) fraiches.push(f);
    }
    return fraiches.length > 0 ? { ...opr, donnees: fraiches } : null;
  }
  if (Array.isArray(opr.donnees)) return opr;
  const fraiche = await lire(opr.table, opr.donnees.id as string);
  // ligne disparue de la base locale (supprimée depuis) : on abandonne l'envoi
  return fraiche ? { ...opr, donnees: fraiche } : null;
}

/** Rejoue les écritures faites hors connexion (s'arrête au premier échec). */
/**
 * Vrai si le serveur a refusé l'écriture pour de bon (contrainte, clé
 * étrangère, droits…). Réessayer ne changerait rien : garder une telle
 * opération bloquerait toute la file derrière elle, indéfiniment.
 * Une coupure réseau, elle, n'a pas de code : on réessaiera.
 */
function refusDefinitif(e: unknown): boolean {
  const err = e as { code?: unknown; status?: unknown };
  const code = typeof err?.code === 'string' ? err.code : '';
  if (/^(22|23|42)/.test(code)) return true; // contrainte, clé étrangère, droits
  const statut = typeof err?.status === 'number' ? err.status : 0;
  return statut >= 400 && statut < 500 && statut !== 401 && statut !== 408 && statut !== 429;
}

/**
 * Clé de la ligne touchée par une opération. Deux opérations de même clé
 * visent la même ligne : comme le contenu est relu dans la base locale juste
 * avant l'envoi, seule la DERNIÈRE a un intérêt — les précédentes enverraient
 * exactement la même chose. C'est ce qui fait fondre les files de plusieurs
 * centaines d'entrées accumulées hors réseau.
 */
function cleOperation(opr: Operation): string | null {
  if (opr.op === 'remplacer') return 'remplacer|' + opr.tourneeId;
  if (opr.op === 'delete') return opr.table + '|' + opr.id;
  if (Array.isArray(opr.donnees)) return null; // paquet : on ne touche pas
  const id = (opr.donnees as { id?: unknown }).id;
  return typeof id === 'string' ? opr.table + '|' + id : null;
}

/**
 * Envoie les écritures en attente, dans l'ordre. Renvoie le nombre
 * d'écritures définitivement refusées par le serveur et abandonnées.
 */
export async function viderFileAttente(): Promise<number> {
  if (!supabase) return 0;
  const entrees = await db.enAttente.orderBy('cle').toArray();

  // Les doublons sont supprimés sans être envoyés : on parcourt à l'envers et
  // on ne garde que la dernière opération de chaque ligne.
  const vues = new Set<string>();
  const aEnvoyer: typeof entrees = [];
  const inutiles: number[] = [];
  for (let i = entrees.length - 1; i >= 0; i -= 1) {
    const entree = entrees[i];
    const cle = cleOperation(entree.operation as Operation);
    if (cle !== null && vues.has(cle)) {
      inutiles.push(entree.cle as number);
      continue;
    }
    if (cle !== null) vues.add(cle);
    aEnvoyer.push(entree);
  }
  aEnvoyer.reverse();
  if (inutiles.length > 0) await db.enAttente.bulkDelete(inutiles);

  let abandonnees = 0;
  for (const entree of aEnvoyer) {
    try {
      const opr = await rafraichirOperation(entree.operation as Operation);
      if (opr) await executer(opr);
    } catch (e) {
      // Réseau coupé ou panne passagère : on garde l'ordre et on réessaiera.
      if (!refusDefinitif(e)) return abandonnees;
      // Refus définitif : on abandonne cette écriture. La donnée reste dans la
      // base locale et repartira à la prochaine fusion si elle est la plus
      // récente — mais elle ne bloque plus le travail de toute l'équipe.
      abandonnees += 1;
    }
    await db.enAttente.delete(entree.cle as number);
  }
  return abandonnees;
}

// accès console en développement (tests de la file d'attente)
if (import.meta.env.DEV) {
  const expose = window as unknown as Record<string, unknown>;
  expose.rafraichirOperation = rafraichirOperation;
  expose.memeContenu = memeContenu;
  expose.adresseVersLigne = adresseVersLigne;
  expose.ligneComplete = ligneComplete;
  expose.estFantome = estFantome;
  expose.purgerFantomes = purgerFantomes;
  expose.ligneVersTournee = ligneVersTournee;
}

/** Nombre d'écritures encore en attente d'envoi. */
export async function nombreEnAttente(): Promise<number> {
  return db.enAttente.count();
}

export const syncTournee = (t: Tournee) =>
  estFantome(t)
    ? Promise.resolve()
    : pousser({ table: 'tournees', op: 'upsert', donnees: tourneeVersLigne(t) });
export const syncSupprimerTournee = (id: string) => pousser({ table: 'tournees', op: 'delete', id });
export const syncCampagne = (c: Campagne) =>
  estFantome(c)
    ? Promise.resolve()
    : pousser({ table: 'campagnes', op: 'upsert', donnees: campagneVersLigne(c) });
export const syncEquipe = (e: Equipe) =>
  estFantome(e)
    ? Promise.resolve()
    : pousser({ table: 'equipes', op: 'upsert', donnees: equipeVersLigne(e) });
export const syncSupprimerEquipe = (id: string) => pousser({ table: 'equipes', op: 'delete', id });
function journalVersLigne(e: EntreeJournal) {
  return {
    id: e.id,
    type: e.type,
    adresse_id: e.adresseId,
    libelle: e.libelle,
    detail: e.detail,
    tournee_id: e.tourneeId,
    tournee_nom: e.tourneeNom,
    lat: e.lat,
    lng: e.lng,
    auteur_id: e.auteurId,
    auteur_nom: e.auteurNom,
    quand: e.quand,
  };
}

function ligneVersJournal(l: Record<string, unknown>): EntreeJournal {
  return {
    id: l.id as string,
    type: l.type as EntreeJournal['type'],
    adresseId: (l.adresse_id as string | null) ?? null,
    libelle: (l.libelle as string) ?? '',
    detail: (l.detail as string) ?? '',
    tourneeId: (l.tournee_id as string | null) ?? null,
    tourneeNom: (l.tournee_nom as string) ?? '',
    lat: (l.lat as number | null) ?? null,
    lng: (l.lng as number | null) ?? null,
    auteurId: (l.auteur_id as string | null) ?? null,
    auteurNom: (l.auteur_nom as string) ?? '',
    quand: l.quand as string,
  };
}

/** Consigne une intervention (rejouée plus tard si hors ligne). */
export const syncJournal = (e: EntreeJournal) =>
  pousser({ table: 'journal', op: 'upsert', donnees: journalVersLigne(e) });

/** Lit le journal (réservé aux administrateurs par les règles du serveur). */
export async function chargerJournal(limite = 300): Promise<EntreeJournal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('journal')
    .select('*')
    .order('quand', { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data ?? []).map(ligneVersJournal);
}

export const syncDecompte = (d: Decompte) =>
  estFantome(d)
    ? Promise.resolve()
    : pousser({ table: 'decomptes', op: 'upsert', donnees: decompteVersLigne(d) });
export const syncAdresse = (a: AdressePoint) =>
  estFantome(a)
    ? Promise.resolve()
    : pousser({ table: 'adresses', op: 'upsert', donnees: adresseVersLigne(a) });
export const syncAdresses = (liste: AdressePoint[]) => {
  const vraies = liste.filter((a) => !estFantome(a));
  return vraies.length > 0
    ? pousser({ table: 'adresses', op: 'upsert', donnees: vraies.map(adresseVersLigne) })
    : Promise.resolve();
};
export const syncSupprimerAdresse = (id: string) => pousser({ table: 'adresses', op: 'delete', id });
export const syncRemplacerAdresses = (
  tourneeId: string,
  liste: AdressePoint[],
  suppressionsIds: string[] = [],
) =>
  pousser({
    table: 'adresses',
    op: 'remplacer',
    tourneeId,
    donnees: liste.map(adresseVersLigne),
    suppressionsIds,
  });

// ---------- lecture complète (avec pagination PostgREST) ----------

async function chargerTable(
  table: 'tournees' | 'adresses' | 'campagnes' | 'equipes' | 'decomptes' | 'suppressions',
): Promise<Record<string, unknown>[]> {
  if (!supabase) return [];
  const lignes: Record<string, unknown>[] = [];
  const parPage = 1000;
  for (let debut = 0; ; debut += parPage) {
    const { data, error } = await supabase.from(table).select('*').range(debut, debut + parPage - 1);
    if (error) throw error;
    lignes.push(...(data ?? []));
    if (!data || data.length < parPage) break;
  }
  return lignes;
}

const plusRecent = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/**
 * Vrai si les deux versions ont exactement le même contenu (horodatage ignoré).
 * Garde-fou : un appareil dont l'horloge avance verrait toutes ses lignes
 * comme « plus récentes » et renverrait son ancienne copie par-dessus le
 * travail des autres. On ne pousse donc que ce qui a réellement changé.
 */
function memeContenu<T>(a: T, b: T, vers: (x: T) => Record<string, unknown>): boolean {
  return (
    JSON.stringify({ ...vers(a), modifie_le: '' }) === JSON.stringify({ ...vers(b), modifie_le: '' })
  );
}

/**
 * Récupère tout le contenu distant et le fusionne avec le contenu local :
 * la version la plus récente gagne ; ce qui n'existe que d'un côté est
 * conservé (et poussé si c'est local).
 */
export async function tirerEtFusionner(
  tourneesLocales: Tournee[],
  adressesLocales: AdressePoint[],
  campagnesLocales: Campagne[],
  equipesLocales: Equipe[],
  decomptesLocaux: Decompte[],
): Promise<ResultatFusion> {
  const [lignesT, lignesA, lignesC, lignesE, lignesD, lignesS] = await Promise.all([
    chargerTable('tournees'),
    chargerTable('adresses'),
    chargerTable('campagnes'),
    chargerTable('equipes'),
    chargerTable('decomptes'),
    chargerTable('suppressions'),
  ]);
  const distantesT = lignesT.map(ligneVersTournee);
  const distantesA = lignesA.map(ligneVersAdresse);
  const distantesC = lignesC.map(ligneVersCampagne);
  const distantesE = lignesE.map(ligneVersEquipe);
  const distantsD = lignesD.map(ligneVersDecompte);
  // pierres tombales : une donnée supprimée ne doit pas être repoussée par un
  // appareil qui en gardait une vieille copie
  const tombes = new Set(lignesS.map((l) => l.id as string));

  const resultatT = new Map<string, Tournee>(distantesT.map((t) => [t.id, t]));
  const aPousserT: Tournee[] = [];
  for (const locale of tourneesLocales) {
    // fantôme d'un évènement temps réel incomplet : on l'oublie
    if (estFantome(locale)) continue;
    if (tombes.has(locale.id)) continue;
    const distante = resultatT.get(locale.id);
    if (!distante) {
      resultatT.set(locale.id, locale);
      aPousserT.push(locale);
    } else if (plusRecent(locale.modifieLe, distante.modifieLe)) {
      // contenu identique : on adopte l'horodatage du serveur, rien à renvoyer
      if (memeContenu(locale, distante, tourneeVersLigne)) resultatT.set(locale.id, distante);
      else {
        resultatT.set(locale.id, locale);
        aPousserT.push(locale);
      }
    }
  }

  const resultatA = new Map<string, AdressePoint>(distantesA.map((a) => [a.id, a]));
  const aPousserA: AdressePoint[] = [];
  for (const locale of adressesLocales) {
    // fantôme d'un évènement temps réel incomplet : on l'oublie
    if (estFantome(locale)) continue;
    if (tombes.has(locale.id)) continue;
    const distante = resultatA.get(locale.id);
    if (!distante) {
      resultatA.set(locale.id, locale);
      aPousserA.push(locale);
    } else if (plusRecent(locale.modifieLe, distante.modifieLe)) {
      // contenu identique : on adopte l'horodatage du serveur, rien à renvoyer
      if (memeContenu(locale, distante, adresseVersLigne)) resultatA.set(locale.id, distante);
      else {
        resultatA.set(locale.id, locale);
        aPousserA.push(locale);
      }
    }
  }

  const resultatC = new Map<string, Campagne>(distantesC.map((c) => [c.id, c]));
  const aPousserC: Campagne[] = [];
  for (const locale of campagnesLocales) {
    // fantôme d'un évènement temps réel incomplet : on l'oublie
    if (estFantome(locale)) continue;
    if (tombes.has(locale.id)) continue;
    const distante = resultatC.get(locale.id);
    if (!distante) {
      resultatC.set(locale.id, locale);
      aPousserC.push(locale);
    } else if (plusRecent(locale.modifieLe, distante.modifieLe)) {
      // contenu identique : on adopte l'horodatage du serveur, rien à renvoyer
      if (memeContenu(locale, distante, campagneVersLigne)) resultatC.set(locale.id, distante);
      else {
        resultatC.set(locale.id, locale);
        aPousserC.push(locale);
      }
    }
  }

  const resultatE = new Map<string, Equipe>(distantesE.map((e) => [e.id, e]));
  const aPousserE: Equipe[] = [];
  for (const locale of equipesLocales) {
    // fantôme d'un évènement temps réel incomplet : on l'oublie
    if (estFantome(locale)) continue;
    if (tombes.has(locale.id)) continue;
    const distante = resultatE.get(locale.id);
    if (!distante) {
      resultatE.set(locale.id, locale);
      aPousserE.push(locale);
    } else if (plusRecent(locale.modifieLe, distante.modifieLe)) {
      // contenu identique : on adopte l'horodatage du serveur, rien à renvoyer
      if (memeContenu(locale, distante, equipeVersLigne)) resultatE.set(locale.id, distante);
      else {
        resultatE.set(locale.id, locale);
        aPousserE.push(locale);
      }
    }
  }

  const resultatD = new Map<string, Decompte>(distantsD.map((d) => [d.id, d]));
  const aPousserD: Decompte[] = [];
  for (const local of decomptesLocaux) {
    // fantôme d'un évènement temps réel incomplet : on l'oublie
    if (estFantome(local)) continue;
    if (tombes.has(local.id)) continue;
    const distant = resultatD.get(local.id);
    if (!distant) {
      resultatD.set(local.id, local);
      aPousserD.push(local);
    } else if (plusRecent(local.modifieLe, distant.modifieLe)) {
      // contenu identique : on adopte l'horodatage du serveur, rien à renvoyer
      if (memeContenu(local, distant, decompteVersLigne)) resultatD.set(local.id, distant);
      else {
        resultatD.set(local.id, local);
        aPousserD.push(local);
      }
    }
  }

  // pousse d'abord les tournées (adresses, équipes et décomptes y font référence)
  for (const t of aPousserT) await syncTournee(t);
  await syncAdresses(aPousserA);
  for (const c of aPousserC) await syncCampagne(c);
  for (const e of aPousserE) await syncEquipe(e);
  for (const d of aPousserD) await syncDecompte(d);

  // ne garde que les adresses dont la tournée existe encore ; une équipe dont
  // la tournée a disparu redevient « sans tournée »
  const adresses = [...resultatA.values()].filter((a) => resultatT.has(a.tourneeId));
  const equipes = [...resultatE.values()].map((e) =>
    e.tourneeId && !resultatT.has(e.tourneeId) ? { ...e, tourneeId: null } : e,
  );
  const decomptes = [...resultatD.values()].filter((d) => resultatT.has(d.tourneeId));
  return {
    tournees: [...resultatT.values()],
    adresses,
    campagnes: [...resultatC.values()],
    equipes,
    decomptes,
  };
}

// ---------- temps réel ----------

export type Changement =
  | { table: 'tournees'; type: 'upsert'; tournee: Tournee }
  | { table: 'tournees'; type: 'delete'; id: string }
  | { table: 'adresses'; type: 'upsert'; adresse: AdressePoint }
  | { table: 'adresses'; type: 'delete'; id: string }
  | { table: 'campagnes'; type: 'upsert'; campagne: Campagne }
  | { table: 'campagnes'; type: 'delete'; id: string }
  | { table: 'equipes'; type: 'upsert'; equipe: Equipe }
  | { table: 'equipes'; type: 'delete'; id: string }
  | { table: 'decomptes'; type: 'upsert'; decompte: Decompte }
  | { table: 'decomptes'; type: 'delete'; id: string };

/**
 * S'abonne aux changements des autres appareils. Renvoie la fonction d'arrêt.
 * `onPerte` est appelé si le flux tombe (veille, changement de réseau…) —
 * jamais lors d'un arrêt volontaire. `onIncomplet` est appelé quand un
 * évènement arrive sans son contenu : il faut alors relire la vraie ligne.
 */
export function abonnerTempsReel(
  onChangement: (c: Changement) => void,
  onPerte?: () => void,
  onIncomplet?: () => void,
): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  let arretVolontaire = false;
  const canal = client
    .channel('sync-donnees')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournees' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'tournees', type: 'delete', id });
      } else if (!ligneComplete(p.new)) {
        onIncomplet?.();
      } else {
        onChangement({ table: 'tournees', type: 'upsert', tournee: ligneVersTournee(p.new) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'adresses' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'adresses', type: 'delete', id });
      } else if (!ligneComplete(p.new)) {
        onIncomplet?.();
      } else {
        onChangement({ table: 'adresses', type: 'upsert', adresse: ligneVersAdresse(p.new) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'campagnes' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'campagnes', type: 'delete', id });
      } else if (!ligneComplete(p.new)) {
        onIncomplet?.();
      } else {
        onChangement({ table: 'campagnes', type: 'upsert', campagne: ligneVersCampagne(p.new) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipes' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'equipes', type: 'delete', id });
      } else if (!ligneComplete(p.new)) {
        onIncomplet?.();
      } else {
        onChangement({ table: 'equipes', type: 'upsert', equipe: ligneVersEquipe(p.new) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'decomptes' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'decomptes', type: 'delete', id });
      } else if (!ligneComplete(p.new)) {
        onIncomplet?.();
      } else {
        onChangement({ table: 'decomptes', type: 'upsert', decompte: ligneVersDecompte(p.new) });
      }
    })
    .subscribe((etat) => {
      if (arretVolontaire) return;
      if (etat === 'CHANNEL_ERROR' || etat === 'TIMED_OUT' || etat === 'CLOSED') onPerte?.();
    });
  return () => {
    arretVolontaire = true;
    void client.removeChannel(canal);
  };
}
