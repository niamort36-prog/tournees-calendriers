// Synchronisation avec la base partagée Supabase.
// Principe : l'application écrit toujours d'abord en local (IndexedDB), puis
// pousse vers Supabase. En cas d'échec (hors-ligne), l'opération rejoint une
// file d'attente rejouée au retour du réseau. Conflits : la dernière
// modification gagne (comparaison des dates modifie_le).

import { supabase } from './supabase';
import { maintenantISO } from './horloge';
import { colonneDisponible, signalerColonnes } from './capacites';
import type { Table } from 'dexie';
import { db } from '../store/db';
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

export function tourneeVersLigne(t: Tournee) {
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

export function campagneVersLigne(c: Campagne) {
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

export function equipeVersLigne(e: Equipe) {
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

export function decompteVersLigne(d: Decompte) {
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

export function adresseVersLigne(a: AdressePoint) {
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
 * Colonnes que la base déclare « not null » : une vraie ligne venue du serveur
 * les porte forcément, toutes. Liste tirée directement du schéma SQL.
 */
const COLONNES_OBLIGATOIRES = {
  tournees: ['nom', 'couleur', 'polygone', 'cree_le', 'modifie_le'],
  adresses: ['tournee_id', 'libelle', 'lat', 'lng', 'statut', 'modifie_le'],
  campagnes: ['nom', 'statut', 'cree_le', 'modifie_le'],
  equipes: ['nom', 'membres', 'cree_le', 'modifie_le'],
  decomptes: ['tournee_id', 'participants', 'especes', 'termine', 'cree_le', 'modifie_le'],
} as const;

export type TableSynchronisee = keyof typeof COLONNES_OBLIGATOIRES;

/**
 * Vrai si cet évènement temps réel porte vraiment toute la ligne.
 *
 * Le flux de Supabase n'est pas toujours complet : il peut n'envoyer que
 * l'identifiant, rien du tout (ligne trop grosse : « Payload Too Large »), ou
 * une colonne à vide. L'application remplissait alors les trous avec des
 * valeurs par défaut — d'où des tournées sans nom ni contour, et des équipes
 * ayant perdu nom et membres, qu'un appareil administrateur renvoyait ensuite
 * vers la base partagée.
 *
 * On ne devine plus rien : il manque une colonne obligatoire, on ignore
 * l'évènement et on relit la vraie ligne. Le même garde-fou protège les
 * adresses (statut, somme, note), les campagnes et les décomptes (montants,
 * numéro de reçu), qui avaient exactement la même faiblesse.
 *
 * Attention : on teste la PRÉSENCE, pas la valeur — false, 0 et la chaîne
 * vide sont des valeurs parfaitement légitimes.
 */
function ligneComplete(table: TableSynchronisee, l: unknown): l is Record<string, unknown> {
  if (!l || typeof l !== 'object') return false;
  const r = l as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return false;
  return COLONNES_OBLIGATOIRES[table].every((c) => r[c] !== undefined && r[c] !== null);
}

/**
 * Vrai si cet enregistrement local est un fantôme : identifiant ou horodatage
 * manquants. Ces lignes sont jetées à la fusion et ne sont jamais envoyées.
 */
function estFantome(x: { id?: unknown; modifieLe?: unknown }): boolean {
  return typeof x.id !== 'string' || x.id === '' || typeof x.modifieLe !== 'string';
}

/**
 * Même idée pour les tournées, campagnes, équipes et décomptes : la base leur
 * donne TOUJOURS une date de création. Une ligne qui n'en a pas ne vient donc
 * ni de la base ni d'un formulaire — c'est une ligne d'une AUTRE table arrivée
 * au mauvais endroit (une adresse prise pour un décompte, par exemple : c'est
 * ainsi que sont nés les 859 décomptes vides de novembre 2026). On ne
 * l'envoie jamais et on ne la garde pas.
 */
function estIncomplete(x: { id?: unknown; modifieLe?: unknown; creeLe?: unknown }): boolean {
  return estFantome(x) || typeof x.creeLe !== 'string';
}

/**
 * Une tournée sans nom ET sans contour n'a jamais été dessinée par un
 * administrateur : c'est un reste d'évènement temps réel incomplet.
 *
 * Attention, elle n'est PAS reconnue par estFantome() : la conversion remplace
 * le nom manquant par une chaîne vide, et « vide » est une valeur acceptée par
 * la base. C'est ainsi que de fausses tournées ont fini par être envoyées
 * depuis un appareil administrateur et sont devenues visibles de toute
 * l'équipe. On ne les envoie plus.
 */
export function estTourneeVide(t: { nom?: unknown; polygone?: unknown }): boolean {
  const nom = typeof t.nom === 'string' ? t.nom.trim() : '';
  const points = Array.isArray(t.polygone) ? t.polygone.length : 0;
  return nom === '' && points === 0;
}

/**
 * Une équipe sans nom n'a été créée par personne : le formulaire exige un nom
 * et le renommage refuse une case vide. C'est donc, comme pour les tournées,
 * le reste d'un évènement temps réel dont le nom est arrivé vide — et qu'un
 * appareil administrateur a ensuite renvoyé vers la base partagée. On ne
 * l'envoie plus.
 */
export function estEquipeVide(e: { nom?: unknown; membres?: unknown }): boolean {
  const nom = typeof e.nom === 'string' ? e.nom.trim() : '';
  const membres = Array.isArray(e.membres) ? e.membres.length : 0;
  return nom === '' && membres === 0;
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
  const garderDatees = <T extends { id?: unknown; modifieLe?: unknown; creeLe?: unknown }>(
    liste: T[],
  ): T[] => {
    const bons = liste.filter((x) => !estIncomplete(x));
    retires += liste.length - bons.length;
    return bons;
  };
  const propre: ResultatFusion = {
    tournees: garderDatees(listes.tournees),
    adresses: garder(listes.adresses),
    campagnes: garderDatees(listes.campagnes),
    equipes: garderDatees(listes.equipes),
    decomptes: garderDatees(listes.decomptes),
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
  | { table: 'decomptes'; op: 'delete_lot'; ids: string[] }
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
  // « ignoreDuplicates » : une pierre déjà posée pour cet identifiant est
  // laissée telle quelle. Sans cela, un seul identifiant déjà connu faisait
  // échouer TOUT le paquet (la table n'accepte que des ajouts, pas de
  // modification) et aucune pierre n'était posée.
  for (let i = 0; i < ids.length; i += 500) {
    await supabase
      .from('suppressions')
      .upsert(
        ids.slice(i, i + 500).map((id) => ({ id, table_nom: tableNom })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
  }
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
  } else if (opr.op === 'delete_lot') {
    for (let i = 0; i < opr.ids.length; i += 100) {
      const lot = opr.ids.slice(i, i + 100);
      const { error } = await supabase.from(opr.table).delete().in('id', lot);
      if (error) throw error;
    }
    await poserTombes(opr.table, opr.ids);
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
  if (opr.op === 'delete_lot') return null;
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
  expose.estTourneeVide = estTourneeVide;
  expose.estEquipeVide = estEquipeVide;
  expose.ligneVersTournee = ligneVersTournee;
  expose.fusionner = fusionner;
  expose.interpreterEvenement = interpreterEvenement;
}

/** Nombre d'écritures encore en attente d'envoi. */
export async function nombreEnAttente(): Promise<number> {
  return db.enAttente.count();
}

export const syncTournee = (t: Tournee) =>
  estIncomplete(t) || estTourneeVide(t)
    ? Promise.resolve()
    : pousser({ table: 'tournees', op: 'upsert', donnees: tourneeVersLigne(t) });
export const syncSupprimerTournee = (id: string) => pousser({ table: 'tournees', op: 'delete', id });
export const syncCampagne = (c: Campagne) =>
  estIncomplete(c)
    ? Promise.resolve()
    : pousser({ table: 'campagnes', op: 'upsert', donnees: campagneVersLigne(c) });
export const syncEquipe = (e: Equipe) =>
  estIncomplete(e) || estEquipeVide(e)
    ? Promise.resolve()
    : pousser({ table: 'equipes', op: 'upsert', donnees: equipeVersLigne(e) });
export const syncSupprimerEquipe = (id: string) => pousser({ table: 'equipes', op: 'delete', id });
export function journalVersLigne(e: EntreeJournal) {
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
  estIncomplete(d)
    ? Promise.resolve()
    : pousser({ table: 'decomptes', op: 'upsert', donnees: decompteVersLigne(d) });
/** Supprime plusieurs décomptes d'un coup (ménage des décomptes vides). */
export const syncSupprimerDecomptes = (ids: string[]) =>
  ids.length > 0 ? pousser({ table: 'decomptes', op: 'delete_lot', ids }) : Promise.resolve();
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

// ---------- lecture complète (par pages) ----------

type TableLue = 'tournees' | 'adresses' | 'campagnes' | 'equipes' | 'decomptes' | 'suppressions';

/**
 * Lit toute une table, mille lignes à la fois.
 *
 * Les pages se suivent PAR IDENTIFIANT (« donne-moi les mille suivantes après
 * celle-ci »), et non par numéro de ligne. Avant, rien n'était trié : entre
 * deux pages, PostgreSQL pouvait déplacer une ligne qu'un collègue venait de
 * modifier, et elle était alors sautée ou lue deux fois. Une adresse sautée
 * passait pour « connue de ce seul téléphone » : sa vieille copie repartait
 * vers le serveur et effaçait la modification du collègue.
 */
async function chargerTable(table: TableLue): Promise<Record<string, unknown>[]> {
  if (!supabase) return [];
  const lignes: Record<string, unknown>[] = [];
  const parPage = 1000;
  let dernier: string | null = null;
  for (;;) {
    let requete = supabase.from(table).select('*');
    if (dernier !== null) requete = requete.gt('id', dernier);
    const { data, error } = await requete.order('id', { ascending: true }).limit(parPage);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    lignes.push(...page);
    if (page.length < parPage) break;
    const suivant = page[page.length - 1].id;
    // ne devrait jamais arriver ; évite de tourner en rond si le tri se perdait
    if (typeof suivant !== 'string' || suivant === dernier) break;
    dernier = suivant;
  }
  return lignes;
}

/** Le contenu de la base partagée, tel que lu à l'instant. */
export interface Distant extends ResultatFusion {
  /** Identifiants de tout ce qui a été supprimé (pierres tombales). */
  tombes: Set<string>;
}

/** Lit toute la base partagée. Aucune décision n'est prise ici. */
export async function lireDistant(): Promise<Distant> {
  const [lignesT, lignesA, lignesC, lignesE, lignesD, lignesS] = await Promise.all([
    chargerTable('tournees'),
    chargerTable('adresses'),
    chargerTable('campagnes'),
    chargerTable('equipes'),
    chargerTable('decomptes'),
    chargerTable('suppressions'),
  ]);
  return {
    tournees: lignesT.map(ligneVersTournee),
    adresses: lignesA.map(ligneVersAdresse),
    campagnes: lignesC.map(ligneVersCampagne),
    equipes: lignesE.map(ligneVersEquipe),
    decomptes: lignesD.map(ligneVersDecompte),
    tombes: new Set(lignesS.map((l) => l.id as string)),
  };
}

// ---------- fusion (aucun accès réseau ni disque : calcul pur) ----------

type Ligne = { id: string; modifieLe: string };

const temps = (iso: string): number => Date.parse(iso);

/**
 * Vrai si les deux versions ont exactement le même contenu (horodatage ignoré).
 * Garde-fou : un appareil dont l'horloge avance verrait toutes ses lignes
 * comme « plus récentes » et renverrait son ancienne copie par-dessus le
 * travail des autres. On ne pousse donc que ce qui a réellement changé.
 */
function memeContenu<T>(a: T, b: T, vers: (x: T) => Record<string, unknown>): boolean {
  // Une même date s'écrit « …Z » sur le téléphone et « …+00:00 » en revenant
  // du serveur : on compare l'instant, pas l'écriture. Sinon chaque ligne
  // créée ici passait pour « différente » de sa propre copie sur le serveur.
  const texte = (x: T) =>
    JSON.stringify({ ...vers(x), modifie_le: '' }, (cle, valeur) =>
      cle.endsWith('_le') && typeof valeur === 'string' ? Date.parse(valeur) : valeur,
    );
  return texte(a) === texte(b);
}

const memeDate = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return !a && !b;
  return a === b || temps(a) === temps(b);
};

const memeJson = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Même question que memeContenu, pour les adresses — mais sans tout convertir
 * en texte : il y en a plus de six mille à comparer à chaque synchronisation,
 * et la grande majorité n'a ni appartement ni détail de paiement.
 */
function memeAdresse(a: AdressePoint, b: AdressePoint): boolean {
  if (
    a.statut !== b.statut ||
    (a.somme ?? null) !== (b.somme ?? null) ||
    (a.note ?? null) !== (b.note ?? null) ||
    a.libelle !== b.libelle ||
    a.lat !== b.lat ||
    a.lng !== b.lng ||
    a.tourneeId !== b.tourneeId ||
    (a.calendriersLaisses ?? null) !== (b.calendriersLaisses ?? null) ||
    a.typeBatiment !== b.typeBatiment ||
    a.manuelle !== b.manuelle ||
    (a.banId ?? null) !== (b.banId ?? null) ||
    a.commune !== b.commune ||
    a.codePostal !== b.codePostal ||
    (a.statutPrecedent ?? null) !== (b.statutPrecedent ?? null)
  ) {
    return false;
  }
  if (!memeDate(a.rappelLe, b.rappelLe) || !memeDate(a.noteLe, b.noteLe)) return false;
  // (« ?? [] » : une très vieille ligne du téléphone peut ne pas avoir ces listes)
  const autresA = a.autresAdresses ?? [];
  const autresB = b.autresAdresses ?? [];
  if (autresA.length !== autresB.length) return false;
  if (autresA.length > 0 && !memeJson(autresA, autresB)) return false;
  const appartsA = a.appartements ?? [];
  const appartsB = b.appartements ?? [];
  if (appartsA.length !== appartsB.length) return false;
  if (appartsA.length > 0 && !memeJson(appartsA, appartsB)) return false;
  // tant que la base n'a pas la colonne « paiement », elle ne peut pas différer
  if (colonneDisponible('paiement') && !memeJson(a.paiement, b.paiement)) return false;
  return true;
}

/**
 * Fusionne une liste locale et la liste lue sur le serveur.
 *
 *  - la version la plus récente gagne ;
 *  - une ligne inchangée garde le MÊME objet qu'avant : l'écran sait ainsi
 *    qu'il n'a rien à redessiner ;
 *  - une ligne connue de ce seul appareil est gardée et renvoyée, sauf si une
 *    pierre tombale dit qu'elle a été supprimée ailleurs.
 *
 * Les pierres tombales ne servent QUE pour les lignes absentes du serveur.
 * Avant, une pierre masquait aussi la ligne vivante portant le même
 * identifiant — or 857 vraies adresses partagent le leur avec une tournée
 * fantôme supprimée : leurs modifications locales étaient ignorées.
 */
function fusionnerTable<T extends Ligne>(
  locales: T[],
  distantes: T[],
  tombes: Set<string>,
  egal: (a: T, b: T) => boolean,
  valide: (x: T) => boolean,
): { liste: T[]; aPousser: T[] } {
  const parId = new Map<string, T>();
  for (const d of distantes) parId.set(d.id, d);
  const vus = new Set<string>();
  const liste: T[] = [];
  const aPousser: T[] = [];
  // Une ligne mal formée ne doit jamais faire échouer toute la synchronisation :
  // dans le doute, les deux versions sont jugées différentes et la règle
  // habituelle s'applique (la plus récente gagne).
  const pareilles = (a: T, b: T): boolean => {
    try {
      return egal(a, b);
    } catch {
      return false;
    }
  };
  for (const locale of locales) {
    if (!valide(locale) || vus.has(locale.id)) continue;
    const distante = parId.get(locale.id);
    if (!distante) {
      if (tombes.has(locale.id)) continue; // supprimée ailleurs
      vus.add(locale.id);
      liste.push(locale);
      aPousser.push(locale);
      continue;
    }
    vus.add(locale.id);
    const tl = temps(locale.modifieLe);
    const td = temps(distante.modifieLe);
    if (tl > td) {
      // contenu identique : on adopte l'horodatage du serveur, rien à renvoyer
      if (pareilles(locale, distante)) liste.push(distante);
      else {
        liste.push(locale);
        aPousser.push(locale);
      }
    } else if (tl === td && pareilles(locale, distante)) {
      liste.push(locale); // strictement la même : on garde l'objet en place
    } else {
      liste.push(distante);
    }
  }
  for (const d of distantes) {
    if (!vus.has(d.id)) {
      vus.add(d.id);
      liste.push(d);
    }
  }
  return { liste, aPousser };
}

/** Rend la liste d'origine si rien n'a bougé (même contenu, même ordre). */
function stable<T>(avant: T[], apres: T[]): T[] {
  if (avant.length !== apres.length) return apres;
  for (let i = 0; i < avant.length; i += 1) if (avant[i] !== apres[i]) return apres;
  return avant;
}

/** Ce qu'il faut écrire dans la base du téléphone pour une table. */
export interface Ecart<T> {
  mettre: T[];
  retirer: string[];
}

function ecart<T extends { id: string }>(avant: T[], apres: T[]): Ecart<T> {
  if (avant === apres) return { mettre: [], retirer: [] };
  const anciens = new Set<T>(avant);
  const idsApres = new Set<string>();
  const mettre: T[] = [];
  for (const x of apres) {
    idsApres.add(x.id);
    if (!anciens.has(x)) mettre.push(x);
  }
  const retirer: string[] = [];
  for (const x of avant) {
    if (typeof x.id === 'string' && x.id !== '' && !idsApres.has(x.id)) retirer.push(x.id);
  }
  return { mettre, retirer };
}

export interface Ecritures {
  tournees: Ecart<Tournee>;
  adresses: Ecart<AdressePoint>;
  campagnes: Ecart<Campagne>;
  equipes: Ecart<Equipe>;
  decomptes: Ecart<Decompte>;
}

export interface Fusion {
  /** Les cinq listes après fusion (la liste d'origine si rien n'a changé). */
  listes: ResultatFusion;
  /** Ce que cet appareil est seul à avoir, à envoyer au serveur. */
  aPousser: ResultatFusion;
  /** Ce qu'il faut reporter dans la base du téléphone. */
  ecritures: Ecritures;
}

/**
 * Fusionne l'état de l'appareil avec ce qui vient d'être lu sur le serveur.
 *
 * Fonction PURE et immédiate : elle doit être appelée avec l'état du moment,
 * APRÈS la lecture réseau. Avant, l'état était photographié avant la lecture
 * (plusieurs secondes sur un téléphone) : une maison cochée pendant ce temps
 * était écrasée par la photo et « repassait en gris ».
 */
export function fusionner(local: ResultatFusion, distant: Distant): Fusion {
  const T = fusionnerTable(
    local.tournees,
    distant.tournees,
    distant.tombes,
    (a, b) => memeContenu(a, b, tourneeVersLigne),
    (x) => !estIncomplete(x),
  );
  const A = fusionnerTable(
    local.adresses,
    distant.adresses,
    distant.tombes,
    memeAdresse,
    (x) => !estFantome(x),
  );
  const C = fusionnerTable(
    local.campagnes,
    distant.campagnes,
    distant.tombes,
    (a, b) => memeContenu(a, b, campagneVersLigne),
    (x) => !estIncomplete(x),
  );
  const E = fusionnerTable(
    local.equipes,
    distant.equipes,
    distant.tombes,
    (a, b) => memeContenu(a, b, equipeVersLigne),
    (x) => !estIncomplete(x),
  );
  const D = fusionnerTable(
    local.decomptes,
    distant.decomptes,
    distant.tombes,
    (a, b) => memeContenu(a, b, decompteVersLigne),
    (x) => !estIncomplete(x),
  );

  // Une adresse ou un décompte dont la tournée n'existe plus disparaît avec
  // elle — et n'est surtout pas renvoyé : le serveur refuserait tout le paquet.
  // Une équipe dont la tournée a disparu redevient « sans tournée ».
  const idsT = new Set(T.liste.map((t) => t.id));
  const rattaches = <X extends { tourneeId: string }>(l: X[]): X[] => {
    const bons = l.filter((x) => idsT.has(x.tourneeId));
    return bons.length === l.length ? l : bons;
  };
  const detacher = (l: Equipe[]): Equipe[] =>
    l.map((e) => (e.tourneeId && !idsT.has(e.tourneeId) ? { ...e, tourneeId: null } : e));

  const listes: ResultatFusion = {
    tournees: stable(local.tournees, T.liste),
    adresses: stable(local.adresses, rattaches(A.liste)),
    campagnes: stable(local.campagnes, C.liste),
    equipes: stable(local.equipes, detacher(E.liste)),
    decomptes: stable(local.decomptes, rattaches(D.liste)),
  };
  return {
    listes,
    aPousser: {
      tournees: T.aPousser,
      adresses: rattaches(A.aPousser),
      campagnes: C.aPousser,
      equipes: detacher(E.aPousser),
      decomptes: rattaches(D.aPousser),
    },
    ecritures: {
      tournees: ecart(local.tournees, listes.tournees),
      adresses: ecart(local.adresses, listes.adresses),
      campagnes: ecart(local.campagnes, listes.campagnes),
      equipes: ecart(local.equipes, listes.equipes),
      decomptes: ecart(local.decomptes, listes.decomptes),
    },
  };
}

/** Aucune écriture à faire (point de départ pour accumuler des écarts). */
export function ecrituresVides(): Ecritures {
  return {
    tournees: { mettre: [], retirer: [] },
    adresses: { mettre: [], retirer: [] },
    campagnes: { mettre: [], retirer: [] },
    equipes: { mettre: [], retirer: [] },
    decomptes: { mettre: [], retirer: [] },
  };
}

async function ecrireTable<T extends Ligne>(table: Table<T, string>, e: Ecart<T>): Promise<void> {
  if (e.retirer.length > 0) await table.bulkDelete(e.retirer);
  if (e.mettre.length === 0) return;
  // On ne remplace jamais une ligne du téléphone par une version plus
  // ancienne : une saisie faite pendant la synchronisation reste en place.
  const actuelles = await table.bulkGet(e.mettre.map((x) => x.id));
  const bonnes = e.mettre.filter((x, i) => {
    const actuelle = actuelles[i];
    return !actuelle || !(temps(actuelle.modifieLe) > temps(x.modifieLe));
  });
  if (bonnes.length > 0) await table.bulkPut(bonnes);
}

/**
 * Reporte dans la base du téléphone ce qui vient du serveur (fusion ou temps
 * réel). Seules les lignes qui ont changé sont écrites : avant, les tables
 * étaient vidées puis réécrites en entier — plus de six mille lignes — à
 * chaque synchronisation.
 */
export async function enregistrerEcritures(e: Ecritures): Promise<void> {
  const total =
    e.tournees.mettre.length +
    e.tournees.retirer.length +
    e.adresses.mettre.length +
    e.adresses.retirer.length +
    e.campagnes.mettre.length +
    e.campagnes.retirer.length +
    e.equipes.mettre.length +
    e.equipes.retirer.length +
    e.decomptes.mettre.length +
    e.decomptes.retirer.length;
  if (total === 0) return;
  await db.transaction(
    'rw',
    [db.tournees, db.adresses, db.campagnes, db.equipes, db.decomptes],
    async () => {
      await ecrireTable(db.tournees, e.tournees);
      await ecrireTable(db.adresses, e.adresses);
      await ecrireTable(db.campagnes, e.campagnes);
      await ecrireTable(db.equipes, e.equipes);
      await ecrireTable(db.decomptes, e.decomptes);
    },
  );
}

/** Envoie au serveur ce que cet appareil était seul à avoir. */
export async function pousserFusion(p: ResultatFusion): Promise<void> {
  // d'abord les tournées (adresses, équipes et décomptes y font référence)
  for (const t of p.tournees) await syncTournee(t);
  for (let i = 0; i < p.adresses.length; i += 500) await syncAdresses(p.adresses.slice(i, i + 500));
  for (const c of p.campagnes) await syncCampagne(c);
  for (const e of p.equipes) await syncEquipe(e);
  for (const d of p.decomptes) await syncDecompte(d);
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

const TABLES_SYNCHRONISEES = Object.keys(COLONNES_OBLIGATOIRES) as TableSynchronisee[];

/** Un évènement temps réel, tel que la bibliothèque nous le remet. */
export interface EvenementBrut {
  schema?: string;
  table?: string;
  eventType?: string;
  commit_timestamp?: string;
  new?: unknown;
  old?: unknown;
}

/**
 * Traduit un évènement temps réel en changement à appliquer.
 *
 * La table est lue DANS LE MESSAGE, jamais déduite de l'abonnement qui l'a
 * reçu. C'est la correction de fond des « fantômes » de novembre 2026 : tant
 * qu'un abonnement n'a pas reçu son identifiant du serveur, la bibliothèque
 * lui remet TOUS les évènements du canal, quelle que soit la table. Une
 * adresse modifiée par un collègue était alors prise pour une tournée, une
 * équipe et un décompte — d'où les tournées sans nom, les équipes vides et
 * les 859 décomptes vides, tous porteurs d'un identifiant d'adresse (vérifié
 * dans la sauvegarde du 15/11/2026 : 856 sur 859).
 *
 * Renvoie 'incomplet' si la ligne est amputée (il faut alors relire la base),
 * et null si l'évènement ne nous concerne pas.
 */
export function interpreterEvenement(p: EvenementBrut): Changement | 'incomplet' | null {
  if (p.schema !== undefined && p.schema !== 'public') return null;
  if (typeof p.table !== 'string' || !TABLES_SYNCHRONISEES.includes(p.table as TableSynchronisee)) {
    return null;
  }
  const table = p.table as TableSynchronisee;
  if (p.eventType === 'DELETE') {
    const id = (p.old as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' && id !== '' ? { table, type: 'delete', id } : null;
  }
  if (p.eventType !== 'INSERT' && p.eventType !== 'UPDATE') return null;
  if (!ligneComplete(table, p.new)) return 'incomplet';
  switch (table) {
    case 'tournees':
      return { table, type: 'upsert', tournee: ligneVersTournee(p.new) };
    case 'adresses':
      return { table, type: 'upsert', adresse: ligneVersAdresse(p.new) };
    case 'campagnes':
      return { table, type: 'upsert', campagne: ligneVersCampagne(p.new) };
    case 'equipes':
      return { table, type: 'upsert', equipe: ligneVersEquipe(p.new) };
    default:
      return { table, type: 'upsert', decompte: ligneVersDecompte(p.new) };
  }
}

/** Un abonnement au temps réel. */
export interface AbonnementTempsReel {
  /** Coupe l'abonnement (définitif : on en recrée un autre pour reprendre). */
  arreter: () => void;
  /** Vrai tant que le canal est bien branché. */
  pret: () => boolean;
}

let numeroCanal = 0;

/**
 * S'abonne aux changements des autres appareils.
 *
 * `onEtat` reçoit 'pret' chaque fois que le canal est branché (y compris
 * après une reconnexion automatique) et 'perdu' s'il tombe — jamais lors d'un
 * arrêt volontaire. `onIncomplet` est appelé quand un évènement arrive sans
 * son contenu : il faut alors relire la vraie ligne.
 *
 * Chaque abonnement porte un nom de canal UNIQUE. Avec un nom fixe, un canal
 * recréé après une coupure recevait les évènements encore en route pour
 * l'ancien canal du même nom, AVANT d'avoir reçu ses identifiants du serveur :
 * pendant ce laps de temps, chaque évènement était remis aux cinq abonnements
 * à la fois (voir interpreterEvenement). Avec un nom neuf, rien ne peut
 * arriver sur le canal avant que le serveur ne l'ait enregistré.
 */
export function abonnerTempsReel(
  onChangement: (c: Changement) => void,
  onEtat?: (etat: 'pret' | 'perdu') => void,
  onIncomplet?: () => void,
): AbonnementTempsReel {
  if (!supabase) return { arreter: () => undefined, pret: () => false };
  const client = supabase;
  let arrete = false;
  numeroCanal += 1;
  const nom = `sync-donnees-${Date.now().toString(36)}-${numeroCanal}`;

  // Filet supplémentaire : un même évènement remis plusieurs fois n'est
  // traité qu'une fois.
  const dejaVus = new Set<string>();
  const ordre: string[] = [];
  const recevoir = (p: EvenementBrut) => {
    if (arrete) return;
    const ligne = (p.eventType === 'DELETE' ? p.old : p.new) as { id?: unknown } | null | undefined;
    const cle = `${p.table}|${p.eventType}|${p.commit_timestamp}|${String(ligne?.id)}`;
    if (dejaVus.has(cle)) return;
    dejaVus.add(cle);
    ordre.push(cle);
    if (ordre.length > 500) dejaVus.delete(ordre.shift() as string);
    const changement = interpreterEvenement(p);
    if (changement === 'incomplet') onIncomplet?.();
    else if (changement) onChangement(changement);
  };

  let canal = client.channel(nom);
  for (const table of TABLES_SYNCHRONISEES) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table }, recevoir);
  }
  canal.subscribe((etat) => {
    if (arrete) return;
    if (etat === 'SUBSCRIBED') onEtat?.('pret');
    else if (etat === 'CHANNEL_ERROR' || etat === 'TIMED_OUT' || etat === 'CLOSED') onEtat?.('perdu');
  });
  return {
    arreter: () => {
      if (arrete) return;
      arrete = true;
      void client.removeChannel(canal).catch(() => undefined);
    },
    pret: () => !arrete && (canal.state as string) === 'joined',
  };
}

/**
 * Au réveil du téléphone, la liaison temps réel est souvent morte sans que
 * personne ne le sache encore. On la sonde tout de suite au lieu d'attendre
 * la vérification périodique de la bibliothèque (jusqu'à une minute).
 */
export function reveillerTempsReel(): void {
  if (!supabase) return;
  try {
    const liaison = supabase.realtime;
    if (!liaison.isConnected()) liaison.connect();
    else void liaison.sendHeartbeat().catch(() => undefined);
  } catch {
    // la bibliothèque se reconnectera d'elle-même
  }
}
