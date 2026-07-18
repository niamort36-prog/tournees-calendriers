// Synchronisation avec la base partagée Supabase.
// Principe : l'application écrit toujours d'abord en local (IndexedDB), puis
// pousse vers Supabase. En cas d'échec (hors-ligne), l'opération rejoint une
// file d'attente rejouée au retour du réseau. Conflits : la dernière
// modification gagne (comparaison des dates modifie_le).

import { supabase } from './supabase';
import { db, type EnAttente } from '../store/db';
import type { AdressePoint, Campagne, StatutAdresse, Tournee } from '../types';

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
    creeLe: l.cree_le as string,
    archiveeLe: (l.archivee_le as string | null) ?? null,
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
    statut: a.statut,
    statut_precedent: a.statutPrecedent ?? null,
    somme: a.somme,
    calendriers_laisses: a.calendriersLaisses,
    rappel_le: a.rappelLe,
    note: a.note,
    modifie_le: a.modifieLe,
  };
}

function ligneVersAdresse(l: Record<string, unknown>): AdressePoint {
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
    statut: (l.statut as StatutAdresse) ?? 'a_faire',
    statutPrecedent: (l.statut_precedent as StatutAdresse | null) ?? null,
    somme: (l.somme as number | null) ?? null,
    calendriersLaisses: (l.calendriers_laisses as number | null) ?? null,
    rappelLe: (l.rappel_le as string | null) ?? null,
    note: (l.note as string | null) ?? null,
    modifieLe: l.modifie_le as string,
  };
}

// ---------- opérations et file d'attente ----------

type Operation =
  | { table: 'tournees'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'tournees'; op: 'delete'; id: string }
  | { table: 'campagnes'; op: 'upsert'; donnees: Record<string, unknown> }
  | { table: 'campagnes'; op: 'delete'; id: string }
  | { table: 'adresses'; op: 'upsert'; donnees: Record<string, unknown> | Record<string, unknown>[] }
  | { table: 'adresses'; op: 'delete'; id: string }
  | { table: 'adresses'; op: 'remplacer'; tourneeId: string; donnees: Record<string, unknown>[] };

async function executer(opr: Operation): Promise<void> {
  if (!supabase) return;
  if (opr.op === 'upsert') {
    const { error } = await supabase.from(opr.table).upsert(opr.donnees);
    if (error) throw error;
  } else if (opr.op === 'delete') {
    const { error } = await supabase.from(opr.table).delete().eq('id', opr.id);
    if (error) throw error;
  } else {
    const suppression = await supabase.from('adresses').delete().eq('tournee_id', opr.tourneeId);
    if (suppression.error) throw suppression.error;
    if (opr.donnees.length > 0) {
      const insertion = await supabase.from('adresses').insert(opr.donnees);
      if (insertion.error) throw insertion.error;
    }
  }
}

async function pousser(opr: Operation): Promise<void> {
  if (!supabase) return;
  try {
    await executer(opr);
  } catch {
    // hors-ligne ou erreur passagère : on rejouera plus tard, dans l'ordre
    await db.enAttente.add({ operation: opr, quand: new Date().toISOString() });
  }
}

/** Rejoue les écritures faites hors connexion (s'arrête au premier échec). */
export async function viderFileAttente(): Promise<void> {
  if (!supabase) return;
  const entrees = await db.enAttente.orderBy('cle').toArray();
  for (const entree of entrees) {
    try {
      await executer(entree.operation as Operation);
      await db.enAttente.delete(entree.cle as number);
    } catch {
      return;
    }
  }
}

export const syncTournee = (t: Tournee) =>
  pousser({ table: 'tournees', op: 'upsert', donnees: tourneeVersLigne(t) });
export const syncSupprimerTournee = (id: string) => pousser({ table: 'tournees', op: 'delete', id });
export const syncCampagne = (c: Campagne) =>
  pousser({ table: 'campagnes', op: 'upsert', donnees: campagneVersLigne(c) });
export const syncAdresse = (a: AdressePoint) =>
  pousser({ table: 'adresses', op: 'upsert', donnees: adresseVersLigne(a) });
export const syncAdresses = (liste: AdressePoint[]) =>
  liste.length > 0
    ? pousser({ table: 'adresses', op: 'upsert', donnees: liste.map(adresseVersLigne) })
    : Promise.resolve();
export const syncSupprimerAdresse = (id: string) => pousser({ table: 'adresses', op: 'delete', id });
export const syncRemplacerAdresses = (tourneeId: string, liste: AdressePoint[]) =>
  pousser({ table: 'adresses', op: 'remplacer', tourneeId, donnees: liste.map(adresseVersLigne) });

// ---------- lecture complète (avec pagination PostgREST) ----------

async function chargerTable(table: 'tournees' | 'adresses' | 'campagnes'): Promise<Record<string, unknown>[]> {
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

export interface ResultatFusion {
  tournees: Tournee[];
  adresses: AdressePoint[];
  campagnes: Campagne[];
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
): Promise<ResultatFusion> {
  const [lignesT, lignesA, lignesC] = await Promise.all([
    chargerTable('tournees'),
    chargerTable('adresses'),
    chargerTable('campagnes'),
  ]);
  const distantesT = lignesT.map(ligneVersTournee);
  const distantesA = lignesA.map(ligneVersAdresse);
  const distantesC = lignesC.map(ligneVersCampagne);

  const resultatT = new Map<string, Tournee>(distantesT.map((t) => [t.id, t]));
  const aPousserT: Tournee[] = [];
  for (const locale of tourneesLocales) {
    const distante = resultatT.get(locale.id);
    if (!distante || plusRecent(locale.modifieLe, distante.modifieLe)) {
      resultatT.set(locale.id, locale);
      aPousserT.push(locale);
    }
  }

  const resultatA = new Map<string, AdressePoint>(distantesA.map((a) => [a.id, a]));
  const aPousserA: AdressePoint[] = [];
  for (const locale of adressesLocales) {
    const distante = resultatA.get(locale.id);
    if (!distante || plusRecent(locale.modifieLe, distante.modifieLe)) {
      resultatA.set(locale.id, locale);
      aPousserA.push(locale);
    }
  }

  const resultatC = new Map<string, Campagne>(distantesC.map((c) => [c.id, c]));
  const aPousserC: Campagne[] = [];
  for (const locale of campagnesLocales) {
    const distante = resultatC.get(locale.id);
    if (!distante || plusRecent(locale.modifieLe, distante.modifieLe)) {
      resultatC.set(locale.id, locale);
      aPousserC.push(locale);
    }
  }

  // pousse d'abord les tournées (les adresses y font référence)
  for (const t of aPousserT) await syncTournee(t);
  await syncAdresses(aPousserA);
  for (const c of aPousserC) await syncCampagne(c);

  // ne garde que les adresses dont la tournée existe encore
  const adresses = [...resultatA.values()].filter((a) => resultatT.has(a.tourneeId));
  return { tournees: [...resultatT.values()], adresses, campagnes: [...resultatC.values()] };
}

// ---------- temps réel ----------

export type Changement =
  | { table: 'tournees'; type: 'upsert'; tournee: Tournee }
  | { table: 'tournees'; type: 'delete'; id: string }
  | { table: 'adresses'; type: 'upsert'; adresse: AdressePoint }
  | { table: 'adresses'; type: 'delete'; id: string }
  | { table: 'campagnes'; type: 'upsert'; campagne: Campagne }
  | { table: 'campagnes'; type: 'delete'; id: string };

/** S'abonne aux changements des autres appareils. Renvoie la fonction d'arrêt. */
export function abonnerTempsReel(onChangement: (c: Changement) => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  const canal = client
    .channel('sync-donnees')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournees' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'tournees', type: 'delete', id });
      } else {
        onChangement({ table: 'tournees', type: 'upsert', tournee: ligneVersTournee(p.new as Record<string, unknown>) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'adresses' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'adresses', type: 'delete', id });
      } else {
        onChangement({ table: 'adresses', type: 'upsert', adresse: ligneVersAdresse(p.new as Record<string, unknown>) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'campagnes' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id;
        if (id) onChangement({ table: 'campagnes', type: 'delete', id });
      } else {
        onChangement({ table: 'campagnes', type: 'upsert', campagne: ligneVersCampagne(p.new as Record<string, unknown>) });
      }
    })
    .subscribe();
  return () => {
    void client.removeChannel(canal);
  };
}
