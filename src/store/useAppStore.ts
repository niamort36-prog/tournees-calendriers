// État global de l'application (zustand) : tournées, adresses, modes d'édition.
// Chaque action écrit d'abord en base locale (IndexedDB) puis met à jour l'état.

import { create } from 'zustand';
import { db } from './db';
import type { AdressePoint, Tournee } from '../types';
import { adressesDansPolygone, geocodageInverse, type PingGroupe } from '../lib/ban';
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
    somme: null,
    calendriersLaisses: null,
    rappelLe: null,
    note: null,
    modifieLe: new Date().toISOString(),
  };
}

interface EtatApp {
  pret: boolean;
  tournees: Tournee[];
  adresses: AdressePoint[];
  selectionTourneeId: string | null;
  modeAjout: boolean;
  deplacementAdresseId: string | null;
  chargement: { actif: boolean; message: string; progression: number | null };
  erreur: string | null;
  cadrage: Cadrage;

  init: () => Promise<void>;
  selectionnerTournee: (id: string | null) => void;
  cadrerSur: (c: Cadrage) => void;
  viderCadrage: () => void;
  fermerErreur: () => void;
  activerModeAjout: (actif: boolean) => void;
  commencerDeplacement: (adresseId: string | null) => void;
  annulerModes: () => void;

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

  return {
    pret: false,
    tournees: [],
    adresses: [],
    selectionTourneeId: null,
    modeAjout: false,
    deplacementAdresseId: null,
    chargement: CHARGEMENT_INACTIF,
    erreur: null,
    cadrage: null,

    init: async () => {
      const [tournees, adresses] = await Promise.all([db.tournees.toArray(), db.adresses.toArray()]);
      set({ tournees, adresses, pret: true });
    },

    selectionnerTournee: (id) => set({ selectionTourneeId: id, modeAjout: false, deplacementAdresseId: null }),
    cadrerSur: (c) => set({ cadrage: c }),
    viderCadrage: () => set({ cadrage: null }),
    fermerErreur: () => set({ erreur: null }),
    activerModeAjout: (actif) => set({ modeAjout: actif, deplacementAdresseId: null }),
    commencerDeplacement: (adresseId) => set({ deplacementAdresseId: adresseId, modeAjout: false }),
    annulerModes: () => set({ modeAjout: false, deplacementAdresseId: null }),

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
        somme: null,
        calendriersLaisses: null,
        rappelLe: null,
        note: null,
        modifieLe: maintenant,
      };
      await db.adresses.put(adresse);
      // si cette adresse BAN avait été supprimée avant, on la retire des exclusions
      const tournee = get().tournees.find((t) => t.id === tourneeId);
      if (tournee && adresse.banId && tournee.banIdsExclus.includes(adresse.banId)) {
        const maj = { ...tournee, banIdsExclus: tournee.banIdsExclus.filter((b) => b !== adresse.banId) };
        await db.tournees.put(maj);
        set((s) => ({ tournees: s.tournees.map((t) => (t.id === tourneeId ? maj : t)) }));
      }
      set((s) => ({ adresses: [...s.adresses, adresse], chargement: CHARGEMENT_INACTIF }));
    },

    renommerAdresse: async (id, libelle) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse || !libelle.trim()) return;
      const maj = { ...adresse, libelle: libelle.trim(), modifieLe: new Date().toISOString() };
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)) }));
    },

    deplacerAdresse: async (id, lat, lng) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      const maj = { ...adresse, lat, lng, modifieLe: new Date().toISOString() };
      await db.adresses.put(maj);
      set((s) => ({ adresses: s.adresses.map((a) => (a.id === id ? maj : a)), deplacementAdresseId: null }));
    },

    supprimerAdresse: async (id) => {
      const adresse = get().adresses.find((a) => a.id === id);
      if (!adresse) return;
      await db.adresses.delete(id);
      // mémorise l'exclusion pour ne pas recréer ce ping lors d'un recalcul de zone
      const tournee = get().tournees.find((t) => t.id === adresse.tourneeId);
      if (tournee && adresse.banId && !adresse.manuelle) {
        const maj = { ...tournee, banIdsExclus: [...tournee.banIdsExclus, adresse.banId] };
        await db.tournees.put(maj);
        set((s) => ({ tournees: s.tournees.map((t) => (t.id === tournee.id ? maj : t)) }));
      }
      set((s) => ({ adresses: s.adresses.filter((a) => a.id !== id) }));
    },
  };
});
