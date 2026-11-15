// Outils de dessin des zones (Geoman).
//
// Ils pèsent un quart de l'application et ne servent qu'aux administrateurs :
// ils ne sont plus chargés au lancement, mais à la demande et pour eux seuls.
// Le téléphone d'un sapeur-pompier ne les lit donc jamais.

import L from 'leaflet';
import type {} from '@geoman-io/leaflet-geoman-free';

let chargement: Promise<void> | null = null;

/** Charge les outils de dessin (une seule fois, même si on le demande dix fois). */
export function chargerOutilsDessin(): Promise<void> {
  if (!chargement) {
    const enCours = Promise.all([
      import('@geoman-io/leaflet-geoman-free'),
      import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'),
    ]).then(() => undefined);
    chargement = enCours;
    // en cas d'échec (réseau coupé), la prochaine demande réessaiera
    enCours.catch(() => {
      if (chargement === enCours) chargement = null;
    });
  }
  return chargement;
}

interface OutilsDeCarte {
  setGlobalOptions: (options: object) => void;
}

/**
 * Équipe une carte créée AVANT le chargement des outils.
 *
 * Geoman s'installe tout seul sur les cartes créées après lui ; la nôtre
 * existe déjà, on fait donc ici exactement ce qu'il aurait fait.
 */
export function equiperCarte(map: L.Map): boolean {
  const carte = map as unknown as { pm?: OutilsDeCarte };
  if (carte.pm) return true;
  const PM = (L as unknown as { PM?: { Map: new (m: L.Map) => OutilsDeCarte } }).PM;
  if (!PM) return false;
  const outils = new PM.Map(map);
  carte.pm = outils;
  outils.setGlobalOptions({});
  return true;
}
