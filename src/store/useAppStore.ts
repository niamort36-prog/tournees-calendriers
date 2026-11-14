// État global de l'application (zustand) : session, tournées, adresses, modes.
// Chaque action écrit d'abord en base locale (IndexedDB), met à jour l'état,
// puis pousse vers Supabase (file d'attente automatique si hors-ligne).

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { db } from './db';
import type {
  AdressePoint,
  Campagne,
  Decompte,
  EntreeJournal,
  Equipe,
  Profil,
  Tournee,
  TypeJournal,
} from '../types';
import { formatEuros, totalDecompte, trouverDecompte } from '../types';
import { notifier, permissionAccordee } from '../lib/notifications';
import { maintenantISO, synchroniserHorloge } from '../lib/horloge';

// verrou anti-doublon : une seule création de décompte à la fois par tournée
const decomptesEnCreation = new Map<string, Promise<string>>();

/**
 * Droits d'administration *affichés* : un administrateur peut basculer en
 * « vue membre » pour simplifier l'écran (surtout sur téléphone). Les règles
 * de sécurité réelles restent celles du serveur.
 */
export function estAdminEffectif(profil: Profil | null, vueMembre: boolean): boolean {
  return (!supabaseActif || profil?.role === 'admin') && !vueMembre;
}

/**
 * Tournées visibles pour l'utilisateur : null = toutes (admins, mode local) ;
 * sinon les tournées de ses équipes + celles qu'il a choisi d'afficher.
 */
export function calculerTourneesVisibles(
  profil: Profil | null,
  equipes: Equipe[],
  affichees: string[],
  vueMembre = false,
): Set<string> | null {
  if (estAdminEffectif(profil, vueMembre)) return null;
  if (!profil) return null;
  const ids = new Set<string>(affichees);
  for (const e of equipes) {
    if (e.tourneeId && e.membres.includes(profil.id)) ids.add(e.tourneeId);
  }
  return ids;
}

/**
 * Tournées auxquelles la personne est réellement ASSOCIÉE : elle figure dans
 * une équipe affectée à cette tournée.
 *
 * Différent de calculerTourneesVisibles() : ici pas de passe-droit pour les
 * administrateurs, et les tournées simplement « affichées » sur la carte ne
 * comptent pas. Un rappel d'absence ne doit sonner que chez les personnes
 * concernées par la tournée, pas chez tout le monde.
 */
export function tourneesAssociees(profil: Profil | null, equipes: Equipe[]): Set<string> {
  const ids = new Set<string>();
  if (!profil) return ids;
  for (const e of equipes) {
    if (e.tourneeId && e.membres.includes(profil.id)) ids.add(e.tourneeId);
  }
  return ids;
}

/**
 * Droit de voir l'argent d'une tournée : le décompte de fin de tournée et le
 * total porté sur le reçu.
 *
 * Réservé aux administrateurs et aux personnes réellement associées à la
 * tournée par leur équipe. Dès que quelqu'un quitte l'équipe, le total
 * disparaît de son écran : c'est l'argent de l'amicale, pas une information
 * à garder d'une année sur l'autre.
 *
 * Une tournée simplement « affichée » sur la carte ne donne aucun droit.
 */
export function peutVoirRecette(
  profil: Profil | null,
  equipes: Equipe[],
  tourneeId: string | null,
  vueMembre = false,
): boolean {
  if (!tourneeId) return estAdminEffectif(profil, vueMembre);
  const permises = tourneesDontOnVoitLaRecette(profil, equipes, vueMembre);
  return permises === null || permises.has(tourneeId);
}

/**
 * Même règle que peutVoirRecette(), mais sous forme d'ensemble : utile pour
 * parcourir une liste d'adresses sans recalculer les équipes à chaque ligne.
 * null = toutes les tournées (administrateur).
 */
export function tourneesDontOnVoitLaRecette(
  profil: Profil | null,
  equipes: Equipe[],
  vueMembre = false,
): Set<string> | null {
  if (estAdminEffectif(profil, vueMembre)) return null;
  return tourneesAssociees(profil, equipes);
}

/**
 * Tournées manifestement créées par erreur : pas de nom, pas de contour, et
 * rien d'accroché — aucune adresse, aucune équipe, aucun décompte. Les
 * supprimer ne peut donc faire perdre le travail de personne.
 *
 * Elles viennent d'évènements temps réel incomplets reçus par une version
 * précédente (voir estTourneeVide dans lib/sync.ts).
 */
export function tourneesVides(
  tournees: Tournee[],
  adresses: AdressePoint[],
  equipes: Equipe[],
  decomptes: Decompte[],
): Tournee[] {
  const avecAdresse = new Set(adresses.map((a) => a.tourneeId));
  const avecEquipe = new Set(equipes.map((e) => e.tourneeId).filter((x): x is string => !!x));
  const avecDecompte = new Set(decomptes.map((d) => d.tourneeId));
  return tournees.filter(
    (t) =>
      estTourneeVide(t) &&
      !avecAdresse.has(t.id) &&
      !avecEquipe.has(t.id) &&
      !avecDecompte.has(t.id),
  );
}

// ----- réglage « me notifier de tout » (administrateurs) -----
// Propre à l'appareil : un administrateur peut vouloir tout suivre depuis son
// téléphone sans encombrer celui des autres. Rien n'est synchronisé.
/** Au-delà de ce nombre de rappels dus d'un coup, on n'envoie qu'un résumé. */
const SEUIL_REGROUPEMENT_RAPPELS = 3;

const CLE_NOTIFIER_TOUT = 'notifier-tout';

function chargerNotifierTout(): boolean {
  try {
    return localStorage.getItem(CLE_NOTIFIER_TOUT) === '1';
  } catch {
    return false;
  }
}

// ----- rappels posés depuis CET appareil -----
// Filet de sécurité : celui qui pose un rappel doit l'entendre sonner, même
// s'il n'est dans aucune équipe (un administrateur qui donne un coup de main,
// une tournée sans équipe affectée). Purement local, rien n'est synchronisé.
const CLE_RAPPELS_POSES = 'rappels-poses';

function lireRappelsPoses(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CLE_RAPPELS_POSES) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function ecrireRappelsPoses(valeurs: Record<string, string>): void {
  try {
    localStorage.setItem(CLE_RAPPELS_POSES, JSON.stringify(valeurs));
  } catch {
    /* stockage indisponible : on perd seulement ce filet de sécurité */
  }
}

function chargerTourneesAffichees(): string[] {
  try {
    return JSON.parse(localStorage.getItem('tournees-affichees') ?? '[]') as string[];
  } catch {
    return [];
  }
}
import { adressesDansPolygone, geocodageInverse, type PingGroupe } from '../lib/ban';
import { supabase, supabaseActif } from '../lib/supabase';
import {
  abonnerTempsReel,
  syncAdresse,
  syncAdresses,
  chargerJournal,
  estTourneeVide,
  nombreEnAttente,
  purgerFantomes,
  syncCampagne,
  syncDecompte,
  syncJournal,
  syncEquipe,
  syncSupprimerEquipe,
  syncRemplacerAdresses,
  syncSupprimerAdresse,
  syncSupprimerTournee,
  syncTournee,
  tirerEtFusionner,
  viderFileAttente,
  type Changement,
} from '../lib/sync';
import type { LatLng } from '../lib/geo';

const PALETTE = [
  '#e63946', '#457b9d', '#2a9d8f', '#e76f51', '#8338ec',
  '#ff006e', '#0077b6', '#606c38', '#bc6c25', '#5f0f40',
];

const CHARGEMENT_INACTIF = { actif: false, message: '', progression: null as number | null };

export type Cadrage =
  | { type: 'point'; lat: number; lng: number; zoom: number }
  | { type: 'zone'; points: LatLng[] }
  | null;

function nouvelleAdresse(p: PingGroupe, tourneeId: string): AdressePoint {
  return {
    id: crypto.randomUUID(),
    tourneeId,
    banId: p.banId,
    manuelle: false,
    libelle: p.libelle,
    commune: p.commune,
    codePostal: p.codePostal,
    lat: p.lat,
    lng: p.lng,
    autresAdresses: p.autres,
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
    modifieLe: maintenantISO(),
  };
}

function traduireErreurAuth(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (message.includes('already registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (message.includes('at least 6 characters')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (message.includes('Email not confirmed'))
    return "E-mail non confirmé : cliquez sur le lien reçu par e-mail (ou demandez à l'admin de désactiver la confirmation).";
  if (message.includes('valid email')) return 'Adresse e-mail invalide.';
  return message;
}

interface EtatApp {
  pret: boolean;
  session: Session | null;
  profil: Profil | null;
  tournees: Tournee[];
  adresses: AdressePoint[];
  campagnes: Campagne[];
  equipes: Equipe[];
  decomptes: Decompte[];
  /** Tous les profils (pour composer les équipes et afficher les noms). */
  annuaire: Profil[];
  /** Journal des interventions sur les adresses (lecture admin). */
  journal: EntreeJournal[];
  /** Nombre de modifications pas encore envoyées au serveur. */
  enAttente: number;
  /** Tournées supplémentaires que l'utilisateur a choisi d'afficher. */
  tourneesAffichees: string[];
  /** Fond de carte satellite (photos aériennes IGN) au lieu du plan. */
  fondSatellite: boolean;
  /** Un administrateur affiche l'application comme un simple membre. */
  vueMembre: boolean;
  notification: string | null;
  /** Message affiché sur l'écran de connexion (ex. compte supprimé). */
  avisConnexion: string | null;
  selectionTourneeId: string | null;
  modeAjout: boolean;
  deplacementAdresseId: string | null;
  /** Adresse dont la fiche est ouverte (vue tournée). */
  adresseOuverteId: string | null;
  vueListe: boolean;
  positionGPS: { lat: number; lng: number } | null;
  /** Orientation de la carte en degrés (0 = nord en haut). */
  orientation: number;
  /**
   * Réservé aux administrateurs : recevoir les rappels de TOUTES les tournées,
   * et pas seulement celles de ses équipes. Propre à cet appareil.
   */
  notifierTout: boolean;
  gpsActif: boolean;
  centreCarte: { lat: number; lng: number } | null;
  chargement: { actif: boolean; message: string; progression: number | null };
  erreur: string | null;
  cadrage: Cadrage;

  init: () => Promise<void>;
  connexion: (email: string, mdp: string) => Promise<string | null>;
  inscription: (email: string, mdp: string, nom: string) => Promise<string | null>;
  deconnexion: () => Promise<void>;

  selectionnerTournee: (id: string | null) => void;
  cadrerSur: (c: Cadrage) => void;
  viderCadrage: () => void;
  fermerErreur: () => void;
  activerModeAjout: (actif: boolean) => void;
  commencerDeplacement: (adresseId: string | null) => void;
  annulerModes: () => void;

  creerCampagne: (nom: string) => Promise<void>;
  majCampagne: (id: string, patch: Partial<Campagne>) => Promise<void>;
  archiverCampagne: (id: string) => Promise<void>;

  /** Trouve (ou crée) le décompte de la tournée pour la campagne en cours. */
  obtenirOuCreerDecompte: (tourneeId: string) => Promise<string>;
  majDecompte: (id: string, patch: Partial<Decompte>) => Promise<void>;
  validerFinTournee: (id: string) => Promise<void>;
  rouvrirDecompte: (id: string) => Promise<void>;

  creerEquipe: (nom: string) => Promise<void>;
  majEquipe: (id: string, patch: Partial<Equipe>) => Promise<void>;
  supprimerEquipe: (id: string) => Promise<void>;
  rafraichirAnnuaire: () => Promise<void>;
  rafraichirJournal: () => Promise<void>;
  /** Relance tout de suite l'envoi des modifications en attente. */
  forcerSynchro: () => Promise<void>;
  fermerNotification: () => void;
  basculerAffichageTournee: (id: string) => void;
  basculerFondCarte: () => void;
  basculerVueMembre: () => void;

  creerTourneeDepuisPolygone: (poly: LatLng[]) => Promise<void>;
  majTournee: (id: string, patch: Partial<Tournee>) => Promise<void>;
  majPolygone: (id: string, poly: LatLng[]) => Promise<void>;
  supprimerTournee: (id: string) => Promise<void>;
  /** Supprime d'un coup les tournées vides créées par erreur. Renvoie le nombre retiré. */
  supprimerTourneesVides: () => Promise<number>;

  ouvrirAdresse: (id: string) => void;
  fermerAdresse: () => void;
  basculerVueListe: () => void;
  fermerVueListe: () => void;
  setCentreCarte: (c: { lat: number; lng: number }) => void;
  demarrerGPS: () => void;
  /** Oriente la carte (degrés, ramenés dans 0–359). */
  definirOrientation: (degres: number) => void;
  definirNotifierTout: (actif: boolean) => void;
  majAdresse: (id: string, patch: Partial<AdressePoint>) => Promise<void>;

  ajouterAdresse: (tourneeId: string, lat: number, lng: number) => Promise<void>;
  renommerAdresse: (id: string, libelle: string) => Promise<void>;
  deplacerAdresse: (id: string, lat: number, lng: number) => Promise<void>;
  supprimerAdresse: (id: string) => Promise<void>;
}

export const useAppStore = create<EtatApp>((set, get) => {
  const onEtat = (message: string, progression: number | null) =>
    set({ chargement: { actif: true, message, progression } });

  // ----- réception des changements des autres appareils (temps réel) -----
  // Les événements arrivent un par un : on les regroupe un court instant
  // avant de les appliquer, pour éviter des centaines de rafraîchissements.
  let tampon: Changement[] = [];
  let minuterieTampon: number | null = null;
  let desabonner: (() => void) | null = null;

  const appliquerTampon = async () => {
    minuterieTampon = null;
    const lots = tampon;
    tampon = [];
    const plusRecent = (a: string, b: string) => Date.parse(a) > Date.parse(b);
    const tournees = new Map(get().tournees.map((t) => [t.id, t]));
    const adresses = new Map(get().adresses.map((a) => [a.id, a]));
    const campagnes = new Map(get().campagnes.map((c) => [c.id, c]));
    const equipes = new Map(get().equipes.map((e) => [e.id, e]));
    const decomptes = new Map(get().decomptes.map((d) => [d.id, d]));
    const monId = get().profil?.id ?? null;
    let notification: string | null = null;
    let change = false;
    for (const c of lots) {
      if (c.table === 'decomptes') {
        if (c.type === 'delete') {
          if (decomptes.delete(c.id)) {
            change = true;
            await db.decomptes.delete(c.id);
          }
        } else {
          const local = decomptes.get(c.decompte.id);
          if (!local || plusRecent(c.decompte.modifieLe, local.modifieLe)) {
            // prévient les admins quand une tournée vient d'être terminée ailleurs
            if (c.decompte.termine && !local?.termine && get().profil?.role === 'admin') {
              const t = tournees.get(c.decompte.tourneeId);
              notification = `🏁 Tournée « ${t?.nom ?? '?'} » terminée — total ${formatEuros(totalDecompte(c.decompte).total)}`;
            }
            decomptes.set(c.decompte.id, c.decompte);
            await db.decomptes.put(c.decompte);
            change = true;
          }
        }
      } else if (c.table === 'equipes') {
        if (c.type === 'delete') {
          const avant = equipes.get(c.id);
          if (equipes.delete(c.id)) {
            change = true;
            await db.equipes.delete(c.id);
            if (monId && avant?.membres.includes(monId)) {
              notification = `📣 L'équipe « ${avant.nom} » a été dissoute.`;
            }
          }
        } else {
          const locale = equipes.get(c.equipe.id);
          if (!locale || plusRecent(c.equipe.modifieLe, locale.modifieLe)) {
            // notification si mon affectation change (fait par un autre appareil)
            if (monId) {
              const avantDedans = locale?.membres.includes(monId) ?? false;
              const apresDedans = c.equipe.membres.includes(monId);
              if (apresDedans && (!avantDedans || locale?.tourneeId !== c.equipe.tourneeId)) {
                const t = c.equipe.tourneeId ? tournees.get(c.equipe.tourneeId) : null;
                notification =
                  `📣 Équipe « ${c.equipe.nom} »` +
                  (t ? ` : tu es affecté(e) à la tournée « ${t.nom} »` : " : tu fais partie de l'équipe");
              } else if (!apresDedans && avantDedans) {
                notification = `📣 Tu ne fais plus partie de l'équipe « ${c.equipe.nom} ».`;
              }
            }
            equipes.set(c.equipe.id, c.equipe);
            await db.equipes.put(c.equipe);
            change = true;
          }
        }
      } else if (c.table === 'campagnes') {
        if (c.type === 'delete') {
          if (campagnes.delete(c.id)) {
            change = true;
            await db.campagnes.delete(c.id);
          }
        } else {
          const locale = campagnes.get(c.campagne.id);
          if (!locale || plusRecent(c.campagne.modifieLe, locale.modifieLe)) {
            campagnes.set(c.campagne.id, c.campagne);
            await db.campagnes.put(c.campagne);
            change = true;
          }
        }
      } else if (c.table === 'tournees') {
        if (c.type === 'delete') {
          if (tournees.delete(c.id)) {
            change = true;
            await db.tournees.delete(c.id);
            await db.adresses.where('tourneeId').equals(c.id).delete();
            for (const a of [...adresses.values()]) if (a.tourneeId === c.id) adresses.delete(a.id);
          }
        } else {
          const locale = tournees.get(c.tournee.id);
          if (!locale || plusRecent(c.tournee.modifieLe, locale.modifieLe)) {
            tournees.set(c.tournee.id, c.tournee);
            await db.tournees.put(c.tournee);
            change = true;
          }
        }
      } else {
        if (c.type === 'delete') {
          if (adresses.delete(c.id)) {
            change = true;
            await db.adresses.delete(c.id);
          }
        } else {
          const locale = adresses.get(c.adresse.id);
          if (!locale || plusRecent(c.adresse.modifieLe, locale.modifieLe)) {
            adresses.set(c.adresse.id, c.adresse);
            await db.adresses.put(c.adresse);
            change = true;
          }
        }
      }
    }
    if (change) {
      set({
        tournees: [...tournees.values()],
        adresses: [...adresses.values()],
        campagnes: [...campagnes.values()],
        equipes: [...equipes.values()],
        decomptes: [...decomptes.values()],
        ...(notification ? { notification } : {}),
      });
      if (notification) void notifier('🚒 Tournées Calendriers', notification);
    }
  };

  // ----- rappels « à repasser » : notification à l'heure dite -----
  const verifierRappels = () => {
    const s = get();
    if (!permissionAccordee() || !s.pret) return;
    // Un rappel ne sonne que chez l'équipe de SA tournée (+ celui qui l'a
    // posé) — sauf réglage « me notifier de tout », réservé aux admins.
    const toutSuivre = s.notifierTout && estAdminEffectif(s.profil, s.vueMembre);
    const miennes = tourneesAssociees(s.profil, s.equipes);
    const poses = lireRappelsPoses();
    const nomTournee = new Map(s.tournees.map((t) => [t.id, t.nom]));
    const maintenant = Date.now();
    let dejaNotifies: Record<string, string> = {};
    try {
      dejaNotifies = JSON.parse(localStorage.getItem('rappels-notifies') ?? '{}');
    } catch {
      dejaNotifies = {};
    }
    // On rassemble d'abord tout ce qui est dû : au-delà de quelques rappels,
    // mieux vaut une notification groupée que vingt d'affilée sur le téléphone.
    const dus: AdressePoint[] = [];
    for (const a of s.adresses) {
      if (!a.rappelLe || a.statut !== 'absent') continue;
      if (!toutSuivre && !miennes.has(a.tourneeId) && poses[a.id] !== a.rappelLe) continue;
      const echeance = Date.parse(a.rappelLe);
      if (!Number.isFinite(echeance) || echeance > maintenant) continue;
      if (maintenant - echeance > 24 * 3600 * 1000) continue; // trop ancien
      if (dejaNotifies[a.id] === a.rappelLe) continue;
      dus.push(a);
      dejaNotifies[a.id] = a.rappelLe;
    }
    if (dus.length === 0) return;
    if (dus.length <= SEUIL_REGROUPEMENT_RAPPELS) {
      for (const a of dus) {
        void notifier(
          `⏰ À repasser : ${a.libelle}`,
          [a.commune, nomTournee.get(a.tourneeId), a.note]
            .filter((t): t is string => !!t)
            .join(' — '),
        );
      }
    } else {
      const apercu = dus.slice(0, 3).map((a) => a.libelle);
      const reste = dus.length - apercu.length;
      void notifier(
        `⏰ ${dus.length} adresses à repasser`,
        apercu.join(', ') + (reste > 0 ? ` et ${reste} autre${reste > 1 ? 's' : ''}` : ''),
      );
    }
    try {
      localStorage.setItem('rappels-notifies', JSON.stringify(dejaNotifies));
    } catch {
      // stockage local indisponible : le rappel pourra se répéter, sans gravité
    }
  };

  const surChangementDistant = (c: Changement) => {
    tampon.push(c);
    if (minuterieTampon === null) minuterieTampon = window.setTimeout(() => void appliquerTampon(), 250);
  };

  // ----- resynchronisation complète (connexion, retour réseau, archivage) -----
  const resynchroniser = async () => {
    await synchroniserHorloge();
    const abandonnees = await viderFileAttente();
    // Message de plomberie : seul un administrateur peut y faire quelque chose.
    // Les sapeurs-pompiers n'ont pas à voir passer ça en pleine tournée.
    if (abandonnees > 0 && estAdminEffectif(get().profil, get().vueMembre)) {
      set({
        notification:
          `⚠️ ${abandonnees} modification(s) en attente ont été refusées par le serveur et abandonnées ` +
          `(adresse ou tournée supprimée entre-temps, le plus souvent). Le reste est bien parti.`,
      });
    }
    const fusion = await tirerEtFusionner(
      get().tournees,
      get().adresses,
      get().campagnes,
      get().equipes,
      get().decomptes,
    );
    await db.transaction(
      'rw',
      [db.tournees, db.adresses, db.campagnes, db.equipes, db.decomptes],
      async () => {
        await db.tournees.clear();
        await db.tournees.bulkPut(fusion.tournees);
        await db.adresses.clear();
        await db.adresses.bulkPut(fusion.adresses);
        await db.campagnes.clear();
        await db.campagnes.bulkPut(fusion.campagnes);
        await db.equipes.clear();
        await db.equipes.bulkPut(fusion.equipes);
        await db.decomptes.clear();
        await db.decomptes.bulkPut(fusion.decomptes);
      },
    );
    set({
      tournees: fusion.tournees,
      adresses: fusion.adresses,
      campagnes: fusion.campagnes,
      equipes: fusion.equipes,
      decomptes: fusion.decomptes,
      enAttente: await nombreEnAttente(),
    });
  };

  // ----- resynchronisation encadrée (anti-rafales) -----
  let derniereSynchro = 0;
  let resyncEnCours = false;
  const resynchroniserSiPossible = async (force = false) => {
    if (!supabase || !get().session || resyncEnCours) return;
    if (!force && Date.now() - derniereSynchro < 30000) return;
    resyncEnCours = true;
    try {
      await resynchroniser();
      derniereSynchro = Date.now();
    } catch {
      // hors ligne ou erreur passagère : on retentera
    } finally {
      resyncEnCours = false;
    }
  };

  // ----- compte supprimé : purge locale et déconnexion -----
  const purgerEtDeconnecter = async (message: string) => {
    desabonner?.();
    desabonner = null;
    try {
      await Promise.all([
        db.tournees.clear(),
        db.adresses.clear(),
        db.campagnes.clear(),
        db.equipes.clear(),
        db.decomptes.clear(),
        db.enAttente.clear(),
      ]);
    } catch {
      // au pire, les données locales partiront à la prochaine tentative
    }
    set({
      tournees: [],
      adresses: [],
      campagnes: [],
      equipes: [],
      decomptes: [],
      annuaire: [],
      profil: null,
      avisConnexion: message,
    });
    await supabase?.auth.signOut();
  };

  // Une base qui n'a pas encore reçu la mise à jour n°14 n'a pas la colonne
  // « approuve » : dans ce cas on considère le compte comme validé.
  const versProfil = (d: Record<string, unknown>): Profil => ({
    id: d.id as string,
    nom: d.nom as string,
    role: d.role as 'admin' | 'normal',
    centre: (d.centre as string) ?? '',
    approuve: d.approuve !== false,
  });

  // Vérifie que le compte existe toujours (et rafraîchit le rôle au passage).
  const verifierCompte = async () => {
    const session = get().session;
    if (!supabase || !session) return;
    try {
      const { data, error } = await supabase
        .from('profils')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) return; // réseau : on réessaiera
      if (!data) {
        await purgerEtDeconnecter('Ce compte a été supprimé par un administrateur.');
        return;
      }
      const frais = versProfil(data);
      const profil = get().profil;
      const etaitEnAttente = profil ? !profil.approuve : false;
      if (
        profil &&
        (profil.role !== frais.role ||
          profil.nom !== frais.nom ||
          profil.centre !== frais.centre ||
          profil.approuve !== frais.approuve)
      ) {
        set({ profil: frais });
        // le compte vient d'être validé : on charge enfin les données
        if (etaitEnAttente && frais.approuve) void apresConnexion();
      }
    } catch {
      // réseau : on réessaiera
    }
  };

  // ----- évènement temps réel arrivé sans son contenu -----
  // On ne devine pas la ligne manquante (c'est ce qui fabriquait des tournées
  // sans nom) : on relit tout. Le garde-fou anti-rafales de 30 s évite qu'une
  // série d'évènements incomplets déclenche une série de relectures.
  const surEvenementIncomplet = () => {
    void resynchroniserSiPossible();
  };

  // ----- reconnexion du temps réel s'il tombe (veille, réseau…) -----
  let reabonnementPrevu = false;
  const surPerteTempsReel = () => {
    if (reabonnementPrevu) return;
    reabonnementPrevu = true;
    window.setTimeout(() => {
      reabonnementPrevu = false;
      if (!get().session) return;
      desabonner?.();
      desabonner = abonnerTempsReel(surChangementDistant, surPerteTempsReel, surEvenementIncomplet);
      void resynchroniserSiPossible(true);
    }, 10000);
  };

  // ----- après connexion : profil, rattrapage, fusion, temps réel -----
  const apresConnexion = async () => {
    const session = get().session;
    if (!supabase || !session) return;
    try {
      const { data, error } = await supabase
        .from('profils')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!error && !data) {
        await purgerEtDeconnecter('Ce compte a été supprimé par un administrateur.');
        return;
      }
      if (data) set({ profil: versProfil(data) });
      // Compte en attente de validation : aucune donnée de l'amicale n'est
      // chargée (le serveur les refuse de toute façon depuis la mise à jour n°14).
      if (data && !versProfil(data).approuve) {
        set({ chargement: CHARGEMENT_INACTIF });
        return;
      }
      const annuaire = await supabase.from('profils').select('*').order('nom');
      if (annuaire.data) {
        set({ annuaire: (annuaire.data as Record<string, unknown>[]).map(versProfil) });
      }
      onEtat('Synchronisation des tournées…', null);
      await resynchroniser();
      derniereSynchro = Date.now();
      set({ chargement: CHARGEMENT_INACTIF });
    } catch {
      set({
        chargement: CHARGEMENT_INACTIF,
        erreur: 'Synchronisation impossible pour le moment (connexion ?). Vos saisies restent enregistrées sur cet appareil.',
      });
    }
    desabonner?.();
    desabonner = abonnerTempsReel(surChangementDistant, surPerteTempsReel, surEvenementIncomplet);
  };

  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      verifierRappels();
      void verifierCompte();
      void nombreEnAttente().then((n) => {
        if (n !== get().enAttente) set({ enAttente: n });
      });
    }, 60000);

    // les envois en attente repartent dès que le réseau revient
    window.setInterval(() => {
      if (!document.hidden && get().enAttente > 0) void resynchroniserSiPossible(true);
    }, 45000);
    // filets de rattrapage si le temps réel a raté des changements
    window.setInterval(() => {
      if (!document.hidden) void resynchroniserSiPossible();
    }, 180000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void resynchroniserSiPossible();
    });
    window.addEventListener('online', () => void resynchroniserSiPossible(true));
    if (import.meta.env.DEV) {
      const expose = window as unknown as Record<string, unknown>;
      expose.verifierRappels = verifierRappels;
      expose.verifierCompte = verifierCompte;
      expose.resynchroniserSiPossible = resynchroniserSiPossible;
      expose.store = { getState: get, setState: set };
    }
  }

  /** Consigne une intervention sur une adresse dans le journal. */
  const consigner = (
    type: TypeJournal,
    adresse: AdressePoint,
    detail = '',
  ) => {
    const profil = get().profil;
    const tournee = get().tournees.find((t) => t.id === adresse.tourneeId);
    const entree: EntreeJournal = {
      id: crypto.randomUUID(),
      type,
      adresseId: adresse.id,
      libelle: `${adresse.libelle}${adresse.commune ? ', ' + adresse.commune : ''}`,
      detail,
      tourneeId: adresse.tourneeId,
      tourneeNom: tournee?.nom ?? '',
      lat: adresse.lat,
      lng: adresse.lng,
      auteurId: profil?.id ?? null,
      auteurNom: profil?.nom ?? '',
      quand: maintenantISO(),
    };
    void syncJournal(entree);
    set((s) => ({ journal: [entree, ...s.journal] }));
  };

  return {
    pret: false,
    session: null,
    profil: null,
    tournees: [],
    adresses: [],
    campagnes: [],
    equipes: [],
    decomptes: [],
    annuaire: [],
    journal: [],
    enAttente: 0,
    tourneesAffichees: chargerTourneesAffichees(),
    fondSatellite: localStorage.getItem('fond-satellite') === '1',
    vueMembre: localStorage.getItem('vue-membre') === '1',
    notification: null,
    avisConnexion: null,
    selectionTourneeId: null,
    modeAjout: false,
    deplacementAdresseId: null,
    adresseOuverteId: null,
    vueListe: false,
    positionGPS: null,
    orientation: 0,
    notifierTout: chargerNotifierTout(),
    gpsActif: false,
    centreCarte: null,
    chargement: CHARGEMENT_INACTIF,
    erreur: null,
    cadrage: null,

    init: async () => {
      const [tournees, adresses, campagnes, equipes, decomptes] = await Promise.all([
        db.tournees.toArray(),
        db.adresses.toArray(),
        db.campagnes.toArray(),
        db.equipes.toArray(),
        db.decomptes.toArray(),
      ]);
      // Ménage : une version précédente pouvait enregistrer des « tournées
      // fantômes » (sans nom ni contour) à partir d'un évènement temps réel
      // incomplet. Elles disparaissent ici, dès le lancement et sans réseau.
      const { propre } = await purgerFantomes({
        tournees,
        adresses,
        campagnes,
        equipes,
        decomptes,
      });
      set(propre);
      if (!supabaseActif || !supabase) {
        set({ pret: true });
        return;
      }
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, pret: true });
      if (data.session) void apresConnexion();
      supabase.auth.onAuthStateChange((_evenement, session) => {
        const avait = get().session;
        set({ session });
        if (session && !avait) void apresConnexion();
        if (!session) {
          desabonner?.();
          desabonner = null;
          set({ profil: null });
        }
      });
    },

    connexion: async (email, mdp) => {
      if (!supabase) return "La base partagée n'est pas configurée.";
      const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
      if (!error) set({ avisConnexion: null });
      return error ? traduireErreurAuth(error.message) : null;
    },

    inscription: async (email, mdp, nom) => {
      if (!supabase) return "La base partagée n'est pas configurée.";
      const { error } = await supabase.auth.signUp({
        email,
        password: mdp,
        options: { data: { nom } },
      });
      return error ? traduireErreurAuth(error.message) : null;
    },

    deconnexion: async () => {
      await supabase?.auth.signOut();
    },

    selectionnerTournee: (id) => set({ selectionTourneeId: id, modeAjout: false, deplacementAdresseId: null }),
    cadrerSur: (c) => set({ cadrage: c }),
    viderCadrage: () => set({ cadrage: null }),
    fermerErreur: () => set({ erreur: null }),
    activerModeAjout: (actif) => set({ modeAjout: actif, deplacementAdresseId: null }),
    commencerDeplacement: (adresseId) => set({ deplacementAdresseId: adresseId, modeAjout: false }),
    annulerModes: () => set({ modeAjout: false, deplacementAdresseId: null }),

    creerCampagne: async (nom) => {
      if (!nom.trim() || get().campagnes.some((c) => c.statut === 'active')) return;
      const maintenant = maintenantISO();
      const campagne: Campagne = {
        id: crypto.randomUUID(),
        nom: nom.trim(),
        calendriersCommandes: null,
        taillePaquet: null,
        statut: 'active',
        lots: [],
        creeLe: maintenant,
        archiveeLe: null,
        modifieLe: maintenant,
      };
      await db.campagnes.put(campagne);
      set((s) => ({ campagnes: [...s.campagnes, campagne] }));
      await syncCampagne(campagne);
    },

    majCampagne: async (id, patch) => {
      const campagne = get().campagnes.find((c) => c.id === id);
      if (!campagne) return;
      const maj = { ...campagne, ...patch, modifieLe: maintenantISO() };
      await db.campagnes.put(maj);
      set((s) => ({ campagnes: s.campagnes.map((c) => (c.id === id ? maj : c)) }));
      await syncCampagne(maj);
    },

    archiverCampagne: async (id) => {
      if (!supabase) {
        set({ erreur: "L'archivage nécessite la connexion à la base partagée." });
        return;
      }
      set({ chargement: { actif: true, message: 'Archivage de la campagne…', progression: null } });
      const { error } = await supabase.rpc('archiver_campagne', { campagne: id });
      if (error) {
        set({ chargement: CHARGEMENT_INACTIF, erreur: 'Archivage impossible : ' + error.message });
        return;
      }
      try {
        await resynchroniser();
        set({ chargement: CHARGEMENT_INACTIF });
      } catch {
        set({
          chargement: CHARGEMENT_INACTIF,
          erreur: 'Campagne archivée, mais la resynchronisation a échoué : rechargez la page.',
        });
      }
    },

    obtenirOuCreerDecompte: async (tourneeId) => {
      const profil = get().profil;
      if (supabaseActif && profil && profil.role !== 'admin') {
        const membre = get().equipes.some(
          (e) => e.tourneeId === tourneeId && e.membres.includes(profil.id),
        );
        if (!membre) {
          set({
            erreur:
              "Seuls les membres de l'équipe de cette tournée (ou un administrateur) peuvent faire le décompte.",
          });
          return '';
        }
      }
      const campagneId = get().campagnes.find((c) => c.statut === 'active')?.id ?? null;
      const existant = trouverDecompte(get().decomptes, tourneeId, campagneId);
      if (existant) return existant.id;
      const cle = `${tourneeId}|${campagneId ?? ''}`;
      const enCours = decomptesEnCreation.get(cle);
      if (enCours) return enCours;
      const creation = (async () => {
        const maintenant = maintenantISO();
        // participants pré-remplis avec les membres des équipes de la tournée
        const participants = [
          ...new Set(
            get()
              .equipes.filter((e) => e.tourneeId === tourneeId)
              .flatMap((e) => e.membres),
          ),
        ];
        const decompte: Decompte = {
          id: crypto.randomUUID(),
          tourneeId,
          campagneId,
          participants,
          seances: [],
          especes: {},
          cheques: [],
          cb: null,
          calendriersDistribues: null,
          termine: false,
          termineLe: null,
          numeroRecu: null,
          creeLe: maintenant,
          modifieLe: maintenant,
        };
        await db.decomptes.put(decompte);
        set((s) => ({ decomptes: [...s.decomptes, decompte] }));
        await syncDecompte(decompte);
        return decompte.id;
      })().finally(() => decomptesEnCreation.delete(cle));
      decomptesEnCreation.set(cle, creation);
      return creation;
    },

    majDecompte: async (id, patch) => {
      const decompte = get().decomptes.find((d) => d.id === id);
      if (!decompte) return;
      const maj = { ...decompte, ...patch, modifieLe: maintenantISO() };
      await db.decomptes.put(maj);
      set((s) => ({ decomptes: s.decomptes.map((d) => (d.id === id ? maj : d)) }));
      await syncDecompte(maj);
    },

    validerFinTournee: async (id) => {
      const decompte = get().decomptes.find((d) => d.id === id);
      if (!decompte) return;
      const numero =
        decompte.numeroRecu ??
        Math.max(0, ...get().decomptes.map((d) => d.numeroRecu ?? 0)) + 1;
      await get().majDecompte(id, {
        termine: true,
        termineLe: maintenantISO(),
        numeroRecu: numero,
      });
    },

    rouvrirDecompte: async (id) => {
      await get().majDecompte(id, { termine: false });
    },

    creerEquipe: async (nom) => {
      if (!nom.trim()) return;
      const maintenant = maintenantISO();
      const equipe: Equipe = {
        id: crypto.randomUUID(),
        nom: nom.trim(),
        membres: [],
        tourneeId: null,
        creeLe: maintenant,
        modifieLe: maintenant,
      };
      await db.equipes.put(equipe);
      set((s) => ({ equipes: [...s.equipes, equipe] }));
      await syncEquipe(equipe);
    },

    majEquipe: async (id, patch) => {
      const equipe = get().equipes.find((e) => e.id === id);
      if (!equipe) return;
      const maj = { ...equipe, ...patch, modifieLe: maintenantISO() };
      await db.equipes.put(maj);
      set((s) => ({ equipes: s.equipes.map((e) => (e.id === id ? maj : e)) }));
      await syncEquipe(maj);
    },

    supprimerEquipe: async (id) => {
      await db.equipes.delete(id);
      set((s) => ({ equipes: s.equipes.filter((e) => e.id !== id) }));
      await syncSupprimerEquipe(id);
    },

    forcerSynchro: async () => {
      await resynchroniserSiPossible(true);
      set({ enAttente: await nombreEnAttente() });
    },

    rafraichirJournal: async () => {
      if (!supabase || !get().session) return;
      set({ journal: await chargerJournal() });
    },

    rafraichirAnnuaire: async () => {
      if (!supabase || !get().session) return;
      const { data } = await supabase.from('profils').select('*').order('nom');
      if (data) set({ annuaire: (data as Record<string, unknown>[]).map(versProfil) });
    },

    fermerNotification: () => set({ notification: null }),

    basculerAffichageTournee: (id) =>
      set((s) => {
        const liste = s.tourneesAffichees.includes(id)
          ? s.tourneesAffichees.filter((x) => x !== id)
          : [...s.tourneesAffichees, id];
        try {
          localStorage.setItem('tournees-affichees', JSON.stringify(liste));
        } catch {
          // stockage local indisponible : le choix ne survivra pas au rechargement
        }
        return { tourneesAffichees: liste };
      }),

    definirOrientation: (degres) =>
      set({ orientation: ((Math.round(degres) % 360) + 360) % 360 }),

    definirNotifierTout: (actif) => {
      try {
        if (actif) localStorage.setItem(CLE_NOTIFIER_TOUT, '1');
        else localStorage.removeItem(CLE_NOTIFIER_TOUT);
      } catch {
        /* stockage indisponible : le réglage ne survivra pas au rechargement */
      }
      set({ notifierTout: actif });
    },

    basculerFondCarte: () =>
      set((s) => {
        const valeur = !s.fondSatellite;
        try {
          localStorage.setItem('fond-satellite', valeur ? '1' : '0');
        } catch {
          // stockage local indisponible : le choix ne survivra pas au rechargement
        }
        return { fondSatellite: valeur };
      }),

    basculerVueMembre: () =>
      set((s) => {
        const valeur = !s.vueMembre;
        try {
          localStorage.setItem('vue-membre', valeur ? '1' : '0');
        } catch {
          // stockage local indisponible : le choix ne survivra pas au rechargement
        }
        return { vueMembre: valeur, notification: null };
      }),

    ouvrirAdresse: (id) => set({ adresseOuverteId: id, vueListe: false }),
    fermerAdresse: () => set({ adresseOuverteId: null }),
    basculerVueListe: () => set((s) => ({ vueListe: !s.vueListe, adresseOuverteId: null })),
    fermerVueListe: () => set({ vueListe: false }),
    setCentreCarte: (c) => set({ centreCarte: c }),

    demarrerGPS: () => {
      if (get().gpsActif) return;
      if (!('geolocation' in navigator)) {
        set({ erreur: "La géolocalisation n'est pas disponible sur cet appareil." });
        return;
      }
      set({ gpsActif: true });
      let premierPoint = true;
      navigator.geolocation.watchPosition(
        (pos) => {
          const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          set({ positionGPS: point });
          if (premierPoint) {
            premierPoint = false;
            set({ cadrage: { type: 'point', ...point, zoom: 17 } });
          }
        },
        () => {
          set({ gpsActif: false, erreur: 'Position GPS indisponible (autorisation refusée ?).' });
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    },

    majAdresse: async (id, patch) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      const noteChangee = patch.note !== undefined && (patch.note ?? null) !== (adresse.note ?? null);
      const maintenant = maintenantISO();
      const maj = {
        ...adresse,
        ...patch,
        ...(noteChangee ? { noteLe: patch.note ? maintenant : null } : {}),
        modifieLe: maintenant,
      };
      if (patch.rappelLe !== undefined) {
        const poses = lireRappelsPoses();
        if (maj.rappelLe) poses[id] = maj.rappelLe;
        else delete poses[id];
        ecrireRappelsPoses(poses);
      }
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)) }));
      if (noteChangee && maj.note) consigner('commentaire', maj, maj.note);
      await syncAdresse(maj);
    },

    creerTourneeDepuisPolygone: async (poly) => {
      if (supabaseActif && get().profil?.role !== 'admin') {
        set({ erreur: 'Seul un administrateur peut créer une tournée.' });
        return;
      }
      try {
        const pings = await adressesDansPolygone(poly, onEtat);
        const numero = get().tournees.length + 1;
        const maintenant = maintenantISO();
        const tournee: Tournee = {
          id: crypto.randomUUID(),
          nom: `Tournée ${numero}`,
          couleur: PALETTE[(numero - 1) % PALETTE.length],
          polygone: poly,
          dispoConseillee: '',
          calendriersAnneeDerniere: null,
          banIdsExclus: [],
          creeLe: maintenant,
          modifieLe: maintenant,
        };
        const adresses = pings.map((p) => nouvelleAdresse(p, tournee.id));
        await db.tournees.put(tournee);
        await db.adresses.bulkPut(adresses);
        set((s) => ({
          tournees: [...s.tournees, tournee],
          adresses: [...s.adresses, ...adresses],
          selectionTourneeId: tournee.id,
          chargement: CHARGEMENT_INACTIF,
          erreur: adresses.length === 0
            ? 'Aucune adresse trouvée dans cette zone. Vous pouvez en ajouter à la main avec « ➕ Adresse ».'
            : null,
        }));
        await syncTournee(tournee);
        await syncAdresses(adresses);
      } catch (e) {
        set({ chargement: CHARGEMENT_INACTIF, erreur: e instanceof Error ? e.message : String(e) });
      }
    },

    majTournee: async (id, patch) => {
      const tournee = get().tournees.find((t) => t.id === id);
      if (!tournee) return;
      const maj = { ...tournee, ...patch, modifieLe: maintenantISO() };
      await db.tournees.put(maj);
      set((s) => ({ tournees: s.tournees.map((t) => (t.id === id ? maj : t)) }));
      await syncTournee(maj);
    },

    majPolygone: async (id, poly) => {
      if (supabaseActif && get().profil?.role !== 'admin') {
        set({ erreur: 'Seul un administrateur peut modifier le contour d’une tournée.' });
        return;
      }
      const tournee = get().tournees.find((t) => t.id === id);
      if (!tournee) return;
      try {
        const pings = await adressesDansPolygone(poly, onEtat);
        const actuelles = get().adresses.filter((a) => a.tourneeId === id);
        // Garde-fou : un recalcul qui ne trouve plus rien vidait la tournée —
        // contour et statuts de l'équipe compris. On refuse d'appliquer.
        if (pings.length === 0 && actuelles.some((a) => !a.manuelle)) {
          throw new Error(
            "Aucune adresse trouvée dans cette zone alors que la tournée en contient déjà : rien n'a été modifié. Réessayez avec une meilleure connexion.",
          );
        }
        const manuelles = actuelles.filter((a) => a.manuelle);
        const banIdsManuels = new Set(manuelles.map((a) => a.banId).filter(Boolean));
        const exclus = new Set(tournee.banIdsExclus);
        const existantesParBanId = new Map(
          actuelles.filter((a) => !a.manuelle && a.banId).map((a) => [a.banId as string, a]),
        );
        const conservees: AdressePoint[] = [...manuelles];
        for (const p of pings) {
          if (exclus.has(p.banId) || banIdsManuels.has(p.banId)) continue;
          const existante = existantesParBanId.get(p.banId);
          conservees.push(existante ?? nouvelleAdresse(p, id));
        }
        const tourneeMaj = { ...tournee, polygone: poly, modifieLe: maintenantISO() };
        await db.transaction('rw', db.tournees, db.adresses, async () => {
          await db.tournees.put(tourneeMaj);
          await db.adresses.where('tourneeId').equals(id).delete();
          await db.adresses.bulkPut(conservees);
        });
        set((s) => ({
          tournees: s.tournees.map((t) => (t.id === id ? tourneeMaj : t)),
          adresses: [...s.adresses.filter((a) => a.tourneeId !== id), ...conservees],
          chargement: CHARGEMENT_INACTIF,
        }));
        await syncTournee(tourneeMaj);
        const conserveesIds = new Set(conservees.map((a) => a.id));
        const suppressionsIds = actuelles.filter((a) => !conserveesIds.has(a.id)).map((a) => a.id);
        await syncRemplacerAdresses(id, conservees, suppressionsIds);
      } catch (e) {
        set({ chargement: CHARGEMENT_INACTIF, erreur: e instanceof Error ? e.message : String(e) });
      }
    },

    supprimerTournee: async (id) => {
      if (supabaseActif && get().profil?.role !== 'admin') {
        set({ erreur: 'Seul un administrateur peut supprimer une tournée.' });
        return;
      }
      await db.transaction('rw', [db.tournees, db.adresses, db.decomptes], async () => {
        await db.tournees.delete(id);
        await db.adresses.where('tourneeId').equals(id).delete();
        await db.decomptes.where('tourneeId').equals(id).delete();
      });
      set((s) => ({
        tournees: s.tournees.filter((t) => t.id !== id),
        adresses: s.adresses.filter((a) => a.tourneeId !== id),
        decomptes: s.decomptes.filter((d) => d.tourneeId !== id),
        selectionTourneeId: s.selectionTourneeId === id ? null : s.selectionTourneeId,
      }));
      await syncSupprimerTournee(id);
    },

    supprimerTourneesVides: async () => {
      const s = get();
      if (supabaseActif && s.profil?.role !== 'admin') {
        set({ erreur: 'Seul un administrateur peut supprimer une tournée.' });
        return 0;
      }
      const vides = tourneesVides(s.tournees, s.adresses, s.equipes, s.decomptes);
      for (const t of vides) await get().supprimerTournee(t.id);
      return vides.length;
    },

    ajouterAdresse: async (tourneeId, lat, lng) => {
      set({ modeAjout: false, chargement: { actif: true, message: "Recherche de l'adresse…", progression: null } });
      const info = await geocodageInverse(lat, lng);
      const maintenant = maintenantISO();
      const adresse: AdressePoint = {
        id: crypto.randomUUID(),
        tourneeId,
        banId: info?.banId ?? null,
        manuelle: true,
        libelle: info?.libelle ?? 'Adresse à préciser',
        commune: info?.commune ?? '',
        codePostal: info?.codePostal ?? '',
        lat,
        lng,
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
        modifieLe: maintenant,
      };
      await db.adresses.put(adresse);
      // si cette adresse BAN avait été supprimée avant, on la retire des exclusions
      const tournee = get().tournees.find((t) => t.id === tourneeId);
      let tourneeMaj: Tournee | null = null;
      if (tournee && adresse.banId && tournee.banIdsExclus.includes(adresse.banId)) {
        tourneeMaj = {
          ...tournee,
          banIdsExclus: tournee.banIdsExclus.filter((b) => b !== adresse.banId),
          modifieLe: maintenant,
        };
        await db.tournees.put(tourneeMaj);
        const fige = tourneeMaj;
        set((s) => ({ tournees: s.tournees.map((t) => (t.id === tourneeId ? fige : t)) }));
      }
      set((s) => ({ adresses: [...s.adresses, adresse], chargement: CHARGEMENT_INACTIF }));
      consigner('creation', adresse);
      await syncAdresse(adresse);
      if (tourneeMaj) await syncTournee(tourneeMaj);
    },

    renommerAdresse: async (id, libelle) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse || !libelle.trim()) return;
      const maj = { ...adresse, libelle: libelle.trim(), modifieLe: maintenantISO() };
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)) }));
      consigner('renommage', maj, `« ${adresse.libelle} » → « ${maj.libelle} »`);
      await syncAdresse(maj);
    },

    deplacerAdresse: async (id, lat, lng) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      const maj = { ...adresse, lat, lng, modifieLe: maintenantISO() };
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)), deplacementAdresseId: null }));
      consigner(
        'deplacement',
        maj,
        `depuis ${adresse.lat.toFixed(5)}, ${adresse.lng.toFixed(5)}`,
      );
      await syncAdresse(maj);
    },

    supprimerAdresse: async (id) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      await db.adresses.delete(id);
      // mémorise l'exclusion pour ne pas recréer ce ping lors d'un recalcul de zone
      const tournee = get().tournees.find((t) => t.id === adresse.tourneeId);
      let tourneeMaj: Tournee | null = null;
      if (tournee && adresse.banId && !adresse.manuelle) {
        tourneeMaj = {
          ...tournee,
          banIdsExclus: [...tournee.banIdsExclus, adresse.banId],
          modifieLe: maintenantISO(),
        };
        await db.tournees.put(tourneeMaj);
        const fige = tourneeMaj;
        set((s) => ({ tournees: s.tournees.map((t) => (t.id === fige.id ? fige : t)) }));
      }
      set((s) => ({ adresses: s.adresses.filter((a) => a.id !== id) }));
      consigner('suppression', adresse, adresse.note ? `commentaire : ${adresse.note}` : '');
      await syncSupprimerAdresse(id);
      if (tourneeMaj) await syncTournee(tourneeMaj);
    },
  };
});
