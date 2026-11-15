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
import { decompteVide, formatEuros, totalDecompte, trouverDecompte } from '../types';
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

/**
 * Équipes manifestement créées par erreur : pas de nom et aucun membre. Les
 * supprimer ne retire donc personne d'une tournée.
 */
export function equipesVides(equipes: Equipe[]): Equipe[] {
  return equipes.filter(estEquipeVide);
}

/**
 * Décomptes manifestement créés par erreur : rattachés à aucune campagne et
 * entièrement vides — aucun participant, aucune demi-journée, aucun montant,
 * pas terminés, pas de numéro de reçu. Les supprimer ne fait perdre aucun
 * chiffre : il n'y en a pas.
 *
 * Ce sont des adresses que le temps réel avait remises au mauvais endroit
 * (voir interpreterEvenement dans lib/sync.ts). Ils sont invisibles à
 * l'écran, mais chaque téléphone les télécharge à chaque synchronisation.
 */
export function decomptesVides(decomptes: Decompte[]): Decompte[] {
  return decomptes.filter((d) => d.campagneId === null && decompteVide(d));
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

// ----- profil et annuaire gardés sur l'appareil -----
// Sans réseau au lancement (cave, campagne, tunnel), l'application ne savait
// plus QUI était connecté : plus d'étoile « ma tournée », plus de case
// « Somme », toutes les tournées affichées. On garde donc la dernière réponse
// du serveur. Ce n'est qu'un confort d'affichage : les droits réels restent
// ceux du serveur.
const CLE_PROFIL = 'profil-connu';
const CLE_ANNUAIRE = 'annuaire-connu';

function lireMemoire<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

function ecrireMemoire(cle: string, valeur: unknown): void {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage indisponible : on redemandera au serveur */
  }
}
import { adressesDansPolygone, geocodageInverse, type PingGroupe } from '../lib/ban';
import { supabase, supabaseActif } from '../lib/supabase';
import {
  abonnerTempsReel,
  syncAdresse,
  syncAdresses,
  chargerJournal,
  ecrituresVides,
  enregistrerEcritures,
  estEquipeVide,
  estTourneeVide,
  fusionner,
  lireDistant,
  nombreEnAttente,
  pousserFusion,
  purgerFantomes,
  reveillerTempsReel,
  syncCampagne,
  syncDecompte,
  syncJournal,
  syncEquipe,
  syncSupprimerDecomptes,
  syncSupprimerEquipe,
  syncRemplacerAdresses,
  syncSupprimerAdresse,
  syncSupprimerTournee,
  syncTournee,
  viderFileAttente,
  type AbonnementTempsReel,
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
  /** Mise à jour des données en cours au lancement (discrète, non bloquante). */
  synchroInitiale: boolean;
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
  /** Supprime d'un coup les équipes vides créées par erreur. Renvoie le nombre retiré. */
  supprimerEquipesVides: () => Promise<number>;
  /** Supprime d'un coup les décomptes vides créés par erreur. Renvoie le nombre retiré. */
  supprimerDecomptesVides: () => Promise<number>;
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
  // Tout le calcul est fait d'une traite, SANS attendre le disque : l'état lu
  // au début est donc bien celui que l'on remplace à la fin. Avant, on
  // attendait IndexedDB à chaque évènement puis on réécrivait les cinq listes :
  // une maison cochée entre-temps était écrasée par l'ancienne photo, et tout
  // l'écran se redessinait pour une seule adresse modifiée.
  const appliquerTampon = () => {
    minuterieTampon = null;
    const lots = tampon;
    tampon = [];
    if (lots.length === 0) return;
    const plusRecent = (a: string, b: string) => Date.parse(a) > Date.parse(b);
    const s = get();
    const tournees = new Map(s.tournees.map((t) => [t.id, t] as const));
    const adresses = new Map(s.adresses.map((a) => [a.id, a] as const));
    const campagnes = new Map(s.campagnes.map((c) => [c.id, c] as const));
    const equipes = new Map(s.equipes.map((e) => [e.id, e] as const));
    const decomptes = new Map(s.decomptes.map((d) => [d.id, d] as const));
    const modifie = {
      tournees: false,
      adresses: false,
      campagnes: false,
      equipes: false,
      decomptes: false,
    };
    // ce qu'il faudra reporter dans la base du téléphone, une fois l'écran à jour
    const ecritures = ecrituresVides();
    const oublier = <X extends { id: string }>(e: { mettre: X[]; retirer: string[] }, id: string) => {
      if (e.mettre.length > 0) e.mettre = e.mettre.filter((x) => x.id !== id);
      e.retirer.push(id);
    };
    const monId = s.profil?.id ?? null;
    let notification: string | null = null;
    let incomplet = false;
    for (const c of lots) {
      if (c.table === 'decomptes') {
        if (c.type === 'delete') {
          if (decomptes.delete(c.id)) {
            modifie.decomptes = true;
            oublier(ecritures.decomptes, c.id);
          }
        } else {
          const local = decomptes.get(c.decompte.id);
          if (!local || plusRecent(c.decompte.modifieLe, local.modifieLe)) {
            // prévient les admins quand une tournée vient d'être terminée ailleurs
            if (c.decompte.termine && !local?.termine && s.profil?.role === 'admin') {
              const t = tournees.get(c.decompte.tourneeId);
              notification = `🏁 Tournée « ${t?.nom ?? '?'} » terminée — total ${formatEuros(totalDecompte(c.decompte).total)}`;
            }
            decomptes.set(c.decompte.id, c.decompte);
            ecritures.decomptes.mettre.push(c.decompte);
            modifie.decomptes = true;
          }
        }
      } else if (c.table === 'equipes') {
        if (c.type === 'delete') {
          const avant = equipes.get(c.id);
          if (equipes.delete(c.id)) {
            modifie.equipes = true;
            oublier(ecritures.equipes, c.id);
            if (monId && avant?.membres.includes(monId)) {
              notification = `📣 L'équipe « ${avant.nom} » a été dissoute.`;
            }
          }
        } else if (estEquipeVide(c.equipe)) {
          // Une équipe sans nom et sans membre n'a jamais été créée par le
          // formulaire. L'évènement est défectueux : l'appliquer effacerait le
          // nom et les membres d'une équipe bien réelle. On relit la vraie ligne.
          incomplet = true;
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
            ecritures.equipes.mettre.push(c.equipe);
            modifie.equipes = true;
          }
        }
      } else if (c.table === 'campagnes') {
        if (c.type === 'delete') {
          if (campagnes.delete(c.id)) {
            modifie.campagnes = true;
            oublier(ecritures.campagnes, c.id);
          }
        } else {
          const locale = campagnes.get(c.campagne.id);
          if (!locale || plusRecent(c.campagne.modifieLe, locale.modifieLe)) {
            campagnes.set(c.campagne.id, c.campagne);
            ecritures.campagnes.mettre.push(c.campagne);
            modifie.campagnes = true;
          }
        }
      } else if (c.table === 'tournees') {
        if (c.type === 'delete') {
          if (tournees.delete(c.id)) {
            modifie.tournees = true;
            oublier(ecritures.tournees, c.id);
            // ce qui était accroché à la tournée part avec elle
            for (const a of [...adresses.values()]) {
              if (a.tourneeId !== c.id) continue;
              adresses.delete(a.id);
              oublier(ecritures.adresses, a.id);
              modifie.adresses = true;
            }
            for (const d of [...decomptes.values()]) {
              if (d.tourneeId !== c.id) continue;
              decomptes.delete(d.id);
              oublier(ecritures.decomptes, d.id);
              modifie.decomptes = true;
            }
            // ... et ses équipes redeviennent « sans tournée »
            for (const e of [...equipes.values()]) {
              if (e.tourneeId !== c.id) continue;
              const libre = { ...e, tourneeId: null };
              equipes.set(e.id, libre);
              ecritures.equipes.mettre.push(libre);
              modifie.equipes = true;
            }
          }
        } else if (estTourneeVide(c.tournee)) {
          // Même garde-fou : une tournée sans nom ni contour n'a été dessinée
          // par personne. On ne l'enregistre pas et on relit la vraie ligne.
          incomplet = true;
        } else {
          const locale = tournees.get(c.tournee.id);
          if (!locale || plusRecent(c.tournee.modifieLe, locale.modifieLe)) {
            tournees.set(c.tournee.id, c.tournee);
            ecritures.tournees.mettre.push(c.tournee);
            modifie.tournees = true;
          }
        }
      } else {
        if (c.type === 'delete') {
          if (adresses.delete(c.id)) {
            modifie.adresses = true;
            oublier(ecritures.adresses, c.id);
          }
        } else {
          const locale = adresses.get(c.adresse.id);
          if (!locale || plusRecent(c.adresse.modifieLe, locale.modifieLe)) {
            adresses.set(c.adresse.id, c.adresse);
            ecritures.adresses.mettre.push(c.adresse);
            modifie.adresses = true;
          }
        }
      }
    }
    if (incomplet) surEvenementIncomplet();
    // Seules les listes réellement touchées sont remplacées : une adresse
    // modifiée ne fait plus redessiner les tournées, les équipes, etc.
    const maj: Partial<EtatApp> = {};
    if (modifie.tournees) maj.tournees = [...tournees.values()];
    if (modifie.adresses) maj.adresses = [...adresses.values()];
    if (modifie.campagnes) maj.campagnes = [...campagnes.values()];
    if (modifie.equipes) maj.equipes = [...equipes.values()];
    if (modifie.decomptes) maj.decomptes = [...decomptes.values()];
    if (Object.keys(maj).length === 0) return;
    if (notification) maj.notification = notification;
    set(maj);
    if (notification) void notifier('🚒 Tournées Calendriers', notification);
    void enregistrerEcritures(ecritures).catch(() => undefined);
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
    if (minuterieTampon === null) minuterieTampon = window.setTimeout(appliquerTampon, 250);
  };

  // ----- resynchronisation complète (connexion, retour réseau, archivage) -----
  /** Change à chaque déconnexion : une synchro lancée avant ne doit plus rien écrire. */
  let generation = 0;
  /** Vrai dès que la synchro en cours a commencé à lire le serveur. */
  let lectureCommencee = false;
  /** Au lancement : la lecture attend (brièvement) que le temps réel soit branché. */
  let attenteAvantLecture: Promise<void> | null = null;

  const resynchroniser = async () => {
    const maGeneration = generation;
    lectureCommencee = false;
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
    if (attenteAvantLecture) {
      const attente = attenteAvantLecture;
      attenteAvantLecture = null;
      await attente;
    }
    lectureCommencee = true;
    const distant = await lireDistant();
    // déconnecté (ou compte supprimé) pendant la lecture : on ne recharge rien
    if (maGeneration !== generation || !get().session) return;
    // Le serveur ne renvoie RIEN alors que l'appareil a des données : c'est ce
    // qu'il répond à un compte suspendu. On revérifie le compte avant de
    // conclure, au lieu de prendre ce vide pour la réalité.
    if (distant.tournees.length === 0 && distant.adresses.length === 0 && get().adresses.length > 0) {
      await verifierCompte();
      if (maGeneration !== generation || !get().session) return;
    }
    const compte = get().profil;
    if (compte && !compte.approuve) return;

    // À partir d'ici et jusqu'au set(), AUCUNE attente : on fusionne avec
    // l'état du moment, pas avec une photo prise avant la lecture. C'était la
    // cause des maisons qui « repassaient en gris » : la lecture prend
    // plusieurs secondes sur un téléphone, et tout ce qui était coché pendant
    // ce temps était écrasé par la photo.
    const s = get();
    const fusion = fusionner(
      {
        tournees: s.tournees,
        adresses: s.adresses,
        campagnes: s.campagnes,
        equipes: s.equipes,
        decomptes: s.decomptes,
      },
      distant,
    );
    // Une liste inchangée garde la même référence : l'écran ne redessine rien.
    const maj: Partial<EtatApp> = {};
    if (fusion.listes.tournees !== s.tournees) maj.tournees = fusion.listes.tournees;
    if (fusion.listes.adresses !== s.adresses) maj.adresses = fusion.listes.adresses;
    if (fusion.listes.campagnes !== s.campagnes) maj.campagnes = fusion.listes.campagnes;
    if (fusion.listes.equipes !== s.equipes) maj.equipes = fusion.listes.equipes;
    if (fusion.listes.decomptes !== s.decomptes) maj.decomptes = fusion.listes.decomptes;
    if (Object.keys(maj).length > 0) set(maj);

    await enregistrerEcritures(fusion.ecritures);
    await pousserFusion(fusion.aPousser);
    // Une saisie faite hors réseau pendant cette synchro a pu rejoindre la file
    // après son vidage : on la fait partir maintenant plutôt qu'au tour suivant.
    let restant = await nombreEnAttente();
    if (restant > 0) {
      await viderFileAttente();
      restant = await nombreEnAttente();
    }
    if (restant !== get().enAttente) set({ enAttente: restant });
    // lancement sans réseau : les noms des collègues n'avaient pas pu être lus
    if (get().annuaire.length === 0) void get().rafraichirAnnuaire();
  };

  // ----- resynchronisation encadrée (anti-rafales) -----
  let derniereSynchro = 0;
  let resyncEnCours: Promise<void> | null = null;
  /** Une nouvelle lecture est demandée dès que celle en cours sera finie. */
  let resyncEncore = false;

  /** Lance une synchro, ou rejoint celle qui tourne déjà. */
  const lancerResync = (): Promise<void> => {
    if (resyncEnCours) return resyncEnCours;
    const course = (async () => {
      do {
        resyncEncore = false;
        await resynchroniser();
        derniereSynchro = Date.now();
      } while (resyncEncore && get().session);
    })();
    const suivie = course.finally(() => {
      if (resyncEnCours === suivie) resyncEnCours = null;
      resyncEncore = false;
    });
    resyncEnCours = suivie;
    return suivie;
  };

  /** Une synchro qui lit le serveur À PARTIR DE MAINTENANT (après un archivage). */
  const resyncComplete = (): Promise<void> => {
    if (resyncEnCours) resyncEncore = true;
    return lancerResync();
  };

  const resynchroniserSiPossible = async (force = false) => {
    const s = get();
    if (!supabase || !s.session) return;
    // compte en attente de validation : le serveur ne lui donne rien
    if (s.profil && !s.profil.approuve) return;
    if (!force && (resyncEnCours || Date.now() - derniereSynchro < 30000)) return;
    try {
      await lancerResync();
    } catch {
      // hors ligne ou erreur passagère : on retentera
    }
  };

  // ----- compte supprimé : purge locale et déconnexion -----
  const purgerEtDeconnecter = async (message: string) => {
    arreterTempsReel();
    oublierProfil();
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
      // (profil absent : l'application a été lancée sans réseau et sans
      //  mémoire du compte — on le renseigne dès que le serveur répond)
      if (
        !profil ||
        profil.role !== frais.role ||
        profil.nom !== frais.nom ||
        profil.centre !== frais.centre ||
        profil.approuve !== frais.approuve
      ) {
        definirProfil(frais);
        // le compte vient d'être validé : on charge enfin les données
        if (etaitEnAttente && frais.approuve) void apresConnexion();
      }
    } catch {
      // réseau : on réessaiera
    }
  };

  // ----- profil et annuaire : à l'écran ET en mémoire de l'appareil -----
  const definirProfil = (profil: Profil) => {
    set({ profil });
    ecrireMemoire(CLE_PROFIL, profil);
  };
  const definirAnnuaire = (annuaire: Profil[]) => {
    set({ annuaire });
    ecrireMemoire(CLE_ANNUAIRE, annuaire);
  };
  const oublierProfil = () => {
    ecrireMemoire(CLE_PROFIL, null);
    ecrireMemoire(CLE_ANNUAIRE, null);
  };

  // ----- évènement temps réel arrivé sans son contenu -----
  // On ne devine pas la ligne manquante (c'est ce qui fabriquait des tournées
  // sans nom) : on relit tout. Le garde-fou anti-rafales de 30 s évite qu'une
  // série d'évènements incomplets déclenche une série de relectures.
  const surEvenementIncomplet = () => {
    void resynchroniserSiPossible();
  };

  // ----- temps réel : branchement, surveillance et reprise -----
  let canalTempsReel: AbonnementTempsReel | null = null;
  let tempsReelPret = false;
  let tentativesTempsReel = 0;
  let minuterieReprise: number | null = null;
  let minuterieRattrapage: number | null = null;
  /** Au lancement : prévient apresConnexion que le canal est branché. */
  let surPremierPret: (() => void) | null = null;

  // Le canal vient d'être (re)branché : tout ce qui a changé pendant la
  // coupure nous a échappé. On relit le serveur — une seule fois, même si la
  // liaison clignote.
  const rattraper = () => {
    if (resyncEnCours) {
      // la synchro en cours n'a pas encore lu le serveur : elle verra tout
      if (lectureCommencee) resyncEncore = true;
      return;
    }
    if (minuterieRattrapage !== null) return;
    const attente = Math.max(0, 20000 - (Date.now() - derniereSynchro));
    minuterieRattrapage = window.setTimeout(() => {
      minuterieRattrapage = null;
      void resynchroniserSiPossible(true);
    }, attente);
  };

  const surEtatTempsReel = (etat: 'pret' | 'perdu') => {
    if (etat === 'pret') {
      tempsReelPret = true;
      tentativesTempsReel = 0;
      if (surPremierPret) {
        // lancement : apresConnexion attendait ce signal pour lire le serveur
        const prevenir = surPremierPret;
        surPremierPret = null;
        prevenir();
        return;
      }
      rattraper();
    } else {
      tempsReelPret = false;
      programmerReprise();
    }
  };

  const brancherTempsReel = () => {
    canalTempsReel?.arreter();
    tempsReelPret = false;
    canalTempsReel = abonnerTempsReel(surChangementDistant, surEtatTempsReel, surEvenementIncomplet);
  };

  const arreterTempsReel = () => {
    generation += 1;
    canalTempsReel?.arreter();
    canalTempsReel = null;
    tempsReelPret = false;
    tentativesTempsReel = 0;
    surPremierPret = null;
    if (minuterieReprise !== null) window.clearTimeout(minuterieReprise);
    if (minuterieRattrapage !== null) window.clearTimeout(minuterieRattrapage);
    minuterieReprise = null;
    minuterieRattrapage = null;
  };

  // La bibliothèque se reconnecte d'elle-même dans la plupart des cas. Si le
  // canal n'est toujours pas rétabli au bout d'un moment, on en crée un neuf
  // (8 s, puis 16, 32 et 64 s : inutile de s'acharner sans réseau).
  const programmerReprise = () => {
    if (minuterieReprise !== null) return;
    const delai = 8000 * 2 ** Math.min(tentativesTempsReel, 3);
    minuterieReprise = window.setTimeout(() => {
      minuterieReprise = null;
      if (!get().session || !canalTempsReel) return;
      if (canalTempsReel.pret()) {
        // rétabli tout seul — si personne ne nous l'a signalé, on rattrape ici
        if (!tempsReelPret) {
          tempsReelPret = true;
          tentativesTempsReel = 0;
          rattraper();
        }
        return;
      }
      tentativesTempsReel += 1;
      // sans réseau, un nouveau canal n'y changerait rien : on attend
      if (navigator.onLine) brancherTempsReel();
      programmerReprise();
    }, delai);
  };

  const attendrePremierPret = (delai: number): Promise<void> =>
    new Promise((resolve) => {
      if (tempsReelPret) {
        resolve();
        return;
      }
      const minuterie = window.setTimeout(() => {
        surPremierPret = null;
        resolve();
      }, delai);
      surPremierPret = () => {
        window.clearTimeout(minuterie);
        resolve();
      };
    });

  // ----- après connexion : profil, temps réel, rattrapage, fusion -----
  const apresConnexion = async () => {
    const session = get().session;
    if (!supabase || !session) return;
    // Si l'appareil a déjà des données, on les montre tout de suite et la mise
    // à jour se fait derrière, sans bloquer l'écran. Le voile d'attente ne
    // sert plus qu'à la toute première connexion, quand il n'y a rien à voir.
    const premiereFois = get().tournees.length === 0;
    try {
      const connu = get().profil;
      if (connu && connu.id === session.user.id && connu.approuve) {
        // Compte déjà connu de cet appareil et validé : on n'attend pas la
        // réponse du serveur pour lancer la mise à jour, le compte est
        // revérifié en parallèle. Sur un réseau faible, cette seule question
        // retenait tout le lancement pendant plusieurs secondes.
        void verifierCompte();
      } else {
        const { data, error } = await supabase
          .from('profils')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!error && !data) {
          await purgerEtDeconnecter('Ce compte a été supprimé par un administrateur.');
          return;
        }
        if (data) definirProfil(versProfil(data));
        // Compte en attente de validation : aucune donnée de l'amicale n'est
        // chargée (le serveur les refuse de toute façon depuis la mise à jour n°14).
        if (data && !versProfil(data).approuve) {
          set({ chargement: CHARGEMENT_INACTIF });
          return;
        }
      }
      if (premiereFois) onEtat('Synchronisation des tournées…', null);
      // (sans réseau, rien ne se met à jour : le bandeau « Hors ligne » le dit déjà)
      else if (navigator.onLine) set({ synchroInitiale: true });
      // Le temps réel D'ABORD, la lecture ENSUITE : ce qui change pendant la
      // lecture arrive par le canal, rien ne peut passer entre les deux. On
      // n'attend pas plus de trois secondes, et ce temps n'est pas perdu :
      // l'horloge et les envois en attente se règlent pendant ce délai.
      brancherTempsReel();
      attenteAvantLecture = attendrePremierPret(3000);
      const [annuaire] = await Promise.all([
        supabase.from('profils').select('*').order('nom'),
        lancerResync(),
      ]);
      if (annuaire.data) {
        definirAnnuaire((annuaire.data as Record<string, unknown>[]).map(versProfil));
      }
      set({ chargement: CHARGEMENT_INACTIF, synchroInitiale: false });
    } catch {
      set({
        chargement: CHARGEMENT_INACTIF,
        synchroInitiale: false,
        // À la première connexion il n'y a rien à montrer : on le dit. Sinon
        // le bandeau « Hors ligne » suffit, inutile d'alarmer à chaque lancement.
        ...(premiereFois
          ? {
              erreur:
                'Synchronisation impossible pour le moment (connexion ?). Vos saisies restent enregistrées sur cet appareil.',
            }
          : {}),
      });
    }
    if (get().session && !canalTempsReel) brancherTempsReel();
  };

  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      verifierRappels();
      void verifierCompte();
      void nombreEnAttente().then((n) => {
        if (n !== get().enAttente) set({ enAttente: n });
      });
      if (!get().session) return;
      // filet : le canal s'est éteint sans prévenir
      if (canalTempsReel && tempsReelPret && !canalTempsReel.pret()) tempsReelPret = false;
      if (canalTempsReel && !tempsReelPret) programmerReprise();
      // Filet de rattrapage si le temps réel a raté des changements : toutes
      // les 5 minutes quand il fonctionne, toutes les 2 minutes sinon.
      const intervalle = tempsReelPret ? 300000 : 120000;
      if (!document.hidden && Date.now() - derniereSynchro > intervalle) {
        void resynchroniserSiPossible();
      }
    }, 60000);

    // les envois en attente repartent dès que le réseau revient
    window.setInterval(() => {
      if (!document.hidden && get().enAttente > 0) void resynchroniserSiPossible(true);
    }, 45000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      // au réveil du téléphone, la liaison temps réel est souvent morte
      reveillerTempsReel();
      void resynchroniserSiPossible();
    });
    window.addEventListener('online', () => {
      reveillerTempsReel();
      void resynchroniserSiPossible(true);
    });
    if (import.meta.env.DEV) {
      const expose = window as unknown as Record<string, unknown>;
      expose.verifierRappels = verifierRappels;
      expose.verifierCompte = verifierCompte;
      expose.resynchroniserSiPossible = resynchroniserSiPossible;
      expose.surChangementDistant = surChangementDistant;
      expose.appliquerTampon = appliquerTampon;
      expose.lancerResync = lancerResync;
      expose.brancherTempsReel = brancherTempsReel;
      expose.surEtatTempsReel = surEtatTempsReel;
      expose.etatTempsReel = () => ({
        pret: tempsReelPret,
        canal: canalTempsReel?.pret() ?? null,
        tentatives: tentativesTempsReel,
        repriseProgrammee: minuterieReprise !== null,
        derniereSynchro,
        resyncEnCours: resyncEnCours !== null,
      });
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
    synchroInitiale: false,
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
      // Le dernier profil connu est repris tout de suite : la bonne vue
      // (admin ou membre, mes tournées) s'affiche dès la première image, même
      // sans réseau. Le serveur confirme ou corrige juste après.
      const profilConnu = lireMemoire<Profil>(CLE_PROFIL);
      const memeCompte = !!data.session && profilConnu?.id === data.session.user.id;
      set({
        session: data.session,
        pret: true,
        ...(memeCompte && profilConnu
          ? { profil: profilConnu, annuaire: lireMemoire<Profil[]>(CLE_ANNUAIRE) ?? [] }
          : {}),
      });
      if (data.session) void apresConnexion();
      supabase.auth.onAuthStateChange((_evenement, session) => {
        const avait = get().session;
        set({ session });
        if (session && !avait) void apresConnexion();
        if (!session) {
          arreterTempsReel();
          oublierProfil();
          set({ profil: null, synchroInitiale: false });
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
      // L'écran d'abord, le disque ensuite : deux modifications qui se suivent
      // de près partent ainsi chacune de la précédente. Avant, la seconde
      // repartait de l'ancienne version et effaçait la première.
      set((s) => ({ campagnes: s.campagnes.map((c) => (c.id === id ? maj : c)) }));
      await db.campagnes.put(maj);
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
        await resyncComplete();
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
      // L'écran d'abord (voir majCampagne). Ici l'enjeu est l'argent : un
      // montant tapé juste avant « Valider la fin de tournée » était enregistré
      // par une première écriture, puis la validation repartait de l'ancienne
      // version du décompte — le reçu était validé sans ce montant.
      set((s) => ({ decomptes: s.decomptes.map((d) => (d.id === id ? maj : d)) }));
      await db.decomptes.put(maj);
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
      // l'écran d'abord (voir majCampagne) : ajouter deux membres coup sur
      // coup n'en perd plus un
      set((s) => ({ equipes: s.equipes.map((e) => (e.id === id ? maj : e)) }));
      await db.equipes.put(maj);
      await syncEquipe(maj);
    },

    supprimerEquipe: async (id) => {
      await db.equipes.delete(id);
      set((s) => ({ equipes: s.equipes.filter((e) => e.id !== id) }));
      await syncSupprimerEquipe(id);
    },

    supprimerEquipesVides: async () => {
      if (supabaseActif && get().profil?.role !== 'admin') {
        set({ erreur: 'Seul un administrateur peut supprimer une équipe.' });
        return 0;
      }
      const vides = equipesVides(get().equipes);
      for (const e of vides) await get().supprimerEquipe(e.id);
      return vides.length;
    },

    supprimerDecomptesVides: async () => {
      if (supabaseActif && get().profil?.role !== 'admin') {
        set({ erreur: 'Seul un administrateur peut supprimer des décomptes.' });
        return 0;
      }
      const ids = decomptesVides(get().decomptes).map((d) => d.id);
      if (ids.length === 0) return 0;
      const aRetirer = new Set(ids);
      set((s) => ({ decomptes: s.decomptes.filter((d) => !aRetirer.has(d.id)) }));
      await db.decomptes.bulkDelete(ids);
      await syncSupprimerDecomptes(ids);
      set({ enAttente: await nombreEnAttente() });
      return ids.length;
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
      if (data) definirAnnuaire((data as Record<string, unknown>[]).map(versProfil));
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
      // L'écran d'abord : le point change de couleur à l'instant du toucher,
      // sans attendre l'écriture sur le disque du téléphone.
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)) }));
      try {
        await db.adresses.put(maj);
      } catch {
        set({
          erreur:
            "Cet appareil n'arrive pas à enregistrer (mémoire pleine ?). La modification part quand même vers le serveur.",
        });
      }
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
      // l'écran d'abord (voir majCampagne)
      set((s) => ({ tournees: s.tournees.map((t) => (t.id === id ? maj : t)) }));
      await db.tournees.put(maj);
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
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)) }));
      await db.adresses.put(maj);
      consigner('renommage', maj, `« ${adresse.libelle} » → « ${maj.libelle} »`);
      await syncAdresse(maj);
    },

    deplacerAdresse: async (id, lat, lng) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      const maj = { ...adresse, lat, lng, modifieLe: maintenantISO() };
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)), deplacementAdresseId: null }));
      await db.adresses.put(maj);
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
