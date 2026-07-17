// Accès à la Base Adresse Nationale (BAN) :
//  - recherche et géocodage inverse via api-adresse.data.gouv.fr (CORS ouvert) ;
//  - fichier complet des adresses d'un département (gzip, ~10 Mo), téléchargé une
//    seule fois puis mis en cache par commune dans IndexedDB. Ce serveur de
//    fichiers n'envoie pas de CORS : en dev on passe par le proxy Vite /ban-data,
//    en production VITE_BAN_DATA_BASE pointera vers un proxy (Supabase).

import { db } from '../store/db';
import type { BanAdresseBrute } from '../types';
import {
  bboxDePoints,
  bboxDePolygone,
  bboxSeChevauchent,
  centreDePolygone,
  dansBbox,
  dansPolygone,
  type LatLng,
} from './geo';

const API_ADRESSE = 'https://api-adresse.data.gouv.fr';
const API_GEO = 'https://geo.api.gouv.fr';
const BAN_DATA_BASE = (import.meta.env.VITE_BAN_DATA_BASE as string | undefined) ?? '/ban-data';

export type EtatChargement = (message: string, progression: number | null) => void;

export interface ResultatRecherche {
  libelle: string;
  lat: number;
  lng: number;
  type: string; // housenumber | street | locality | municipality
}

export async function rechercherAdresse(q: string, limite = 6): Promise<ResultatRecherche[]> {
  const r = await fetch(`${API_ADRESSE}/search/?q=${encodeURIComponent(q)}&limit=${limite}`);
  if (!r.ok) return [];
  const json = await r.json();
  return (json.features ?? []).map((f: any) => ({
    libelle: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    type: f.properties.type,
  }));
}

export interface InfoAdresse {
  libelle: string;
  commune: string;
  codePostal: string;
  banId: string | null;
}

export async function geocodageInverse(lat: number, lng: number): Promise<InfoAdresse | null> {
  try {
    const r = await fetch(`${API_ADRESSE}/reverse/?lon=${lng}&lat=${lat}`);
    if (!r.ok) return null;
    const f = (await r.json()).features?.[0];
    if (!f) return null;
    return {
      libelle: f.properties.name ?? f.properties.label,
      commune: f.properties.city ?? '',
      codePostal: f.properties.postcode ?? '',
      banId: f.properties.id ?? null,
    };
  } catch {
    return null;
  }
}

async function departementDuPoint(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(`${API_GEO}/communes?lat=${lat}&lon=${lng}&fields=codeDepartement`);
    if (!r.ok) return null;
    const communes = await r.json();
    return communes?.[0]?.codeDepartement ?? null;
  } catch {
    return null;
  }
}

/** Télécharge et met en cache toutes les adresses d'un département (une seule fois). */
export async function chargerDepartement(dept: string, onEtat: EtatChargement): Promise<void> {
  if (await db.banDepartements.get(dept)) return;

  const messageTelechargement = `Téléchargement des adresses du département ${dept}…`;
  onEtat(messageTelechargement, 0);

  const reponse = await fetch(`${BAN_DATA_BASE}/adresses-${dept}.csv.gz`);
  if (!reponse.ok || !reponse.body) {
    throw new Error(`Téléchargement des adresses impossible (HTTP ${reponse.status}).`);
  }

  const total = Number(reponse.headers.get('content-length')) || 0;
  let recu = 0;
  const compteur = new TransformStream<Uint8Array, Uint8Array>({
    transform(morceau, ctrl) {
      recu += morceau.byteLength;
      if (total) onEtat(messageTelechargement, Math.min(99, Math.round((recu / total) * 100)));
      ctrl.enqueue(morceau);
    },
  });

  const flux = reponse.body
    .pipeThrough(compteur)
    .pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>);

  const parCommune = new Map<string, { nom: string; adresses: BanAdresseBrute[] }>();
  let indexColonnes: Record<string, number> | null = null;
  let nbTotal = 0;

  const traiterLigne = (brute: string) => {
    const ligne = brute.endsWith('\r') ? brute.slice(0, -1) : brute;
    if (!ligne) return;
    const champs = ligne.split(';');
    if (!indexColonnes) {
      indexColonnes = {};
      for (const nom of ['id', 'numero', 'rep', 'nom_voie', 'code_postal', 'code_insee', 'nom_commune', 'lon', 'lat']) {
        indexColonnes[nom] = champs.indexOf(nom);
      }
      return;
    }
    const lat = parseFloat(champs[indexColonnes.lat]);
    const lng = parseFloat(champs[indexColonnes.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const codeInsee = champs[indexColonnes.code_insee];
    const rep = champs[indexColonnes.rep];
    const adresse: BanAdresseBrute = {
      banId: champs[indexColonnes.id],
      libelle: `${champs[indexColonnes.numero]}${rep ? ' ' + rep : ''} ${champs[indexColonnes.nom_voie]}`,
      commune: champs[indexColonnes.nom_commune],
      codePostal: champs[indexColonnes.code_postal],
      lat,
      lng,
    };
    let entree = parCommune.get(codeInsee);
    if (!entree) {
      entree = { nom: adresse.commune, adresses: [] };
      parCommune.set(codeInsee, entree);
    }
    entree.adresses.push(adresse);
    nbTotal++;
  };

  const lecteur = flux.getReader();
  let reste = '';
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    const lignes = (reste + value).split('\n');
    reste = lignes.pop() ?? '';
    for (const l of lignes) traiterLigne(l);
  }
  if (reste) traiterLigne(reste);

  onEtat(`Enregistrement de ${nbTotal.toLocaleString('fr-FR')} adresses…`, null);

  const metas = [];
  const paquets = [];
  for (const [codeInsee, entree] of parCommune) {
    metas.push({
      codeInsee,
      dept,
      nom: entree.nom,
      bbox: bboxDePoints(entree.adresses),
      nbAdresses: entree.adresses.length,
    });
    paquets.push({ codeInsee, adresses: entree.adresses });
  }
  await db.banCommunes.bulkPut(metas);
  for (let i = 0; i < paquets.length; i += 30) {
    await db.banAdressesCommunes.bulkPut(paquets.slice(i, i + 30));
  }
  await db.banDepartements.put({ dept, chargeLe: new Date().toISOString(), nbAdresses: nbTotal });
}

/** Un ping sur la carte : une adresse, éventuellement regroupée (immeuble). */
export interface PingGroupe {
  banId: string;
  libelle: string;
  commune: string;
  codePostal: string;
  lat: number;
  lng: number;
  autres: string[];
}

/**
 * Toutes les adresses BAN situées dans le polygone, regroupées par point exact
 * (plusieurs adresses aux mêmes coordonnées = un immeuble = un seul ping).
 * Limite connue (v1) : seul le département du centre de la zone est chargé.
 */
export async function adressesDansPolygone(poly: LatLng[], onEtat: EtatChargement): Promise<PingGroupe[]> {
  const [latCentre, lngCentre] = centreDePolygone(poly);
  const dept = await departementDuPoint(latCentre, lngCentre);
  if (!dept) {
    throw new Error("Impossible d'identifier la commune de la zone dessinée (connexion internet ?).");
  }
  await chargerDepartement(dept, onEtat);

  onEtat('Recherche des adresses dans la zone…', null);
  const zone = bboxDePolygone(poly);
  const metas = await db.banCommunes.toArray();
  const communesCandidates = metas.filter((m) => bboxSeChevauchent(zone, m.bbox));

  const parPoint = new Map<string, PingGroupe>();
  for (const meta of communesCandidates) {
    const paquet = await db.banAdressesCommunes.get(meta.codeInsee);
    if (!paquet) continue;
    for (const a of paquet.adresses) {
      if (!dansBbox(a.lat, a.lng, zone)) continue;
      if (!dansPolygone(a.lat, a.lng, poly)) continue;
      const cle = a.lat.toFixed(6) + ',' + a.lng.toFixed(6);
      const existant = parPoint.get(cle);
      if (existant) {
        existant.autres.push(a.libelle);
      } else {
        parPoint.set(cle, {
          banId: a.banId,
          libelle: a.libelle,
          commune: a.commune,
          codePostal: a.codePostal,
          lat: a.lat,
          lng: a.lng,
          autres: [],
        });
      }
    }
  }
  return [...parPoint.values()];
}
