// État global de l'application (zustand) : session, tournées, adresses, modes.
// Chaque action écrit d'abord en base locale (IndexedDB), met à jour l'état,
// puis pousse vers Supabase (file d'attente automatique si hors-ligne).

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { db } from './db';
import type { AdressePoint, Campagne, Equipe, Profil, Tournee } from '../types';
import { adressesDansPolygone, geocodageInverse, type PingGroupe } from '../lib/ban';
import { supabase, supabaseActif } from '../lib/supabase';
import {
  abonnerTempsReel,
  syncAdresse,
  syncAdresses,
  syncCampagne,
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
    statut: 'a_faire',
    statutPrecedent: null,
    somme: null,
    calendriersLaisses: null,
    rappelLe: null,
    note: null,
    modifieLe: new Date().toISOString(),
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
  /** Tous les profils (pour composer les équipes et afficher les noms). */
  annuaire: Profil[];
  notification: string | null;
  selectionTourneeId: string | null;
  modeAjout: boolean;
  deplacementAdresseId: string | null;
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

  creerEquipe: (nom: string) => Promise<void>;
  majEquipe: (id: string, patch: Partial<Equipe>) => Promise<void>;
  supprimerEquipe: (id: string) => Promise<void>;
  rafraichirAnnuaire: () => Promise<void>;
  fermerNotification: () => void;

  creerTourneeDepuisPolygone: (poly: LatLng[]) => Promise<void>;
  majTournee: (id: string, patch: Partial<Tournee>) => Promise<void>;
  majPolygone: (id: string, poly: LatLng[]) => Promise<void>;
  supprimerTournee: (id: string) => Promise<void>;

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
    const monId = get().profil?.id ?? null;
    let notification: string | null = null;
    let change = false;
    for (const c of lots) {
      if (c.table === 'equipes') {
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
        ...(notification ? { notification } : {}),
      });
    }
  };

  const surChangementDistant = (c: Changement) => {
    tampon.push(c);
    if (minuterieTampon === null) minuterieTampon = window.setTimeout(() => void appliquerTampon(), 250);
  };

  // ----- resynchronisation complète (connexion, retour réseau, archivage) -----
  const resynchroniser = async () => {
    await viderFileAttente();
    const fusion = await tirerEtFusionner(get().tournees, get().adresses, get().campagnes, get().equipes);
    await db.transaction('rw', db.tournees, db.adresses, db.campagnes, db.equipes, async () => {
      await db.tournees.clear();
      await db.tournees.bulkPut(fusion.tournees);
      await db.adresses.clear();
      await db.adresses.bulkPut(fusion.adresses);
      await db.campagnes.clear();
      await db.campagnes.bulkPut(fusion.campagnes);
      await db.equipes.clear();
      await db.equipes.bulkPut(fusion.equipes);
    });
    set({
      tournees: fusion.tournees,
      adresses: fusion.adresses,
      campagnes: fusion.campagnes,
      equipes: fusion.equipes,
    });
  };

  // ----- après connexion : profil, rattrapage, fusion, temps réel -----
  const apresConnexion = async () => {
    const session = get().session;
    if (!supabase || !session) return;
    try {
      const { data } = await supabase.from('profils').select('*').eq('id', session.user.id).single();
      if (data) set({ profil: { id: data.id, nom: data.nom, role: data.role, centre: data.centre ?? '' } });
      const annuaire = await supabase.from('profils').select('id, nom, role, centre').order('nom');
      if (annuaire.data) set({ annuaire: annuaire.data as Profil[] });
      onEtat('Synchronisation des tournées…', null);
      await resynchroniser();
      set({ chargement: CHARGEMENT_INACTIF });
    } catch {
      set({
        chargement: CHARGEMENT_INACTIF,
        erreur: 'Synchronisation impossible pour le moment (connexion ?). Vos saisies restent enregistrées sur cet appareil.',
      });
    }
    desabonner?.();
    desabonner = abonnerTempsReel(surChangementDistant);
  };

  return {
    pret: false,
    session: null,
    profil: null,
    tournees: [],
    adresses: [],
    campagnes: [],
    equipes: [],
    annuaire: [],
    notification: null,
    selectionTourneeId: null,
    modeAjout: false,
    deplacementAdresseId: null,
    chargement: CHARGEMENT_INACTIF,
    erreur: null,
    cadrage: null,

    init: async () => {
      const [tournees, adresses, campagnes, equipes] = await Promise.all([
        db.tournees.toArray(),
        db.adresses.toArray(),
        db.campagnes.toArray(),
        db.equipes.toArray(),
      ]);
      set({ tournees, adresses, campagnes, equipes });
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
      window.addEventListener('online', () => void viderFileAttente());
    },

    connexion: async (email, mdp) => {
      if (!supabase) return "La base partagée n'est pas configurée.";
      const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
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
      const maintenant = new Date().toISOString();
      const campagne: Campagne = {
        id: crypto.randomUUID(),
        nom: nom.trim(),
        calendriersCommandes: null,
        taillePaquet: null,
        statut: 'active',
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
      const maj = { ...campagne, ...patch, modifieLe: new Date().toISOString() };
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

    creerEquipe: async (nom) => {
      if (!nom.trim()) return;
      const maintenant = new Date().toISOString();
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
      const maj = { ...equipe, ...patch, modifieLe: new Date().toISOString() };
      await db.equipes.put(maj);
      set((s) => ({ equipes: s.equipes.map((e) => (e.id === id ? maj : e)) }));
      await syncEquipe(maj);
    },

    supprimerEquipe: async (id) => {
      await db.equipes.delete(id);
      set((s) => ({ equipes: s.equipes.filter((e) => e.id !== id) }));
      await syncSupprimerEquipe(id);
    },

    rafraichirAnnuaire: async () => {
      if (!supabase || !get().session) return;
      const { data } = await supabase.from('profils').select('id, nom, role, centre').order('nom');
      if (data) set({ annuaire: data as Profil[] });
    },

    fermerNotification: () => set({ notification: null }),

    creerTourneeDepuisPolygone: async (poly) => {
      try {
        const pings = await adressesDansPolygone(poly, onEtat);
        const numero = get().tournees.length + 1;
        const maintenant = new Date().toISOString();
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
      const maj = { ...tournee, ...patch, modifieLe: new Date().toISOString() };
      await db.tournees.put(maj);
      set((s) => ({ tournees: s.tournees.map((t) => (t.id === id ? maj : t)) }));
      await syncTournee(maj);
    },

    majPolygone: async (id, poly) => {
      const tournee = get().tournees.find((t) => t.id === id);
      if (!tournee) return;
      try {
        const pings = await adressesDansPolygone(poly, onEtat);
        const actuelles = get().adresses.filter((a) => a.tourneeId === id);
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
        const tourneeMaj = { ...tournee, polygone: poly, modifieLe: new Date().toISOString() };
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
        await syncRemplacerAdresses(id, conservees);
      } catch (e) {
        set({ chargement: CHARGEMENT_INACTIF, erreur: e instanceof Error ? e.message : String(e) });
      }
    },

    supprimerTournee: async (id) => {
      await db.transaction('rw', db.tournees, db.adresses, async () => {
        await db.tournees.delete(id);
        await db.adresses.where('tourneeId').equals(id).delete();
      });
      set((s) => ({
        tournees: s.tournees.filter((t) => t.id !== id),
        adresses: s.adresses.filter((a) => a.tourneeId !== id),
        selectionTourneeId: s.selectionTourneeId === id ? null : s.selectionTourneeId,
      }));
      await syncSupprimerTournee(id);
    },

    ajouterAdresse: async (tourneeId, lat, lng) => {
      set({ modeAjout: false, chargement: { actif: true, message: "Recherche de l'adresse…", progression: null } });
      const info = await geocodageInverse(lat, lng);
      const maintenant = new Date().toISOString();
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
        statut: 'a_faire',
        statutPrecedent: null,
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
      await syncAdresse(adresse);
      if (tourneeMaj) await syncTournee(tourneeMaj);
    },

    renommerAdresse: async (id, libelle) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse || !libelle.trim()) return;
      const maj = { ...adresse, libelle: libelle.trim(), modifieLe: new Date().toISOString() };
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)) }));
      await syncAdresse(maj);
    },

    deplacerAdresse: async (id, lat, lng) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      const maj = { ...adresse, lat, lng, modifieLe: new Date().toISOString() };
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)), deplacementAdresseId: null }));
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
          modifieLe: new Date().toISOString(),
        };
        await db.tournees.put(tourneeMaj);
        const fige = tourneeMaj;
        set((s) => ({ tournees: s.tournees.map((t) => (t.id === fige.id ? fige : t)) }));
      }
      set((s) => ({ adresses: s.adresses.filter((a) => a.id !== id) }));
      await syncSupprimerAdresse(id);
      if (tourneeMaj) await syncTournee(tourneeMaj);
    },
  };
});
