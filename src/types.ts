// Modèle de données de l'application.
// Les statuts et champs "téléphone" sont déjà prévus pour les phases suivantes.

export type StatutAdresse = 'a_faire' | 'distribue' | 'absent' | 'refus';

export const COULEUR_STATUT: Record<StatutAdresse, string> = {
  a_faire: '#8d99ae',
  distribue: '#2e7d32',
  absent: '#e53935',
  refus: '#1e88e5',
};

export const LIBELLE_STATUT: Record<StatutAdresse, string> = {
  a_faire: 'À faire',
  distribue: 'Calendrier distribué',
  absent: 'Absent, à repasser',
  refus: 'Refus / pas intéressé',
};

export interface Tournee {
  id: string;
  nom: string;
  couleur: string;
  /** Contour de la zone : liste de sommets [latitude, longitude]. */
  polygone: [number, number][];
  /** Disponibilité conseillée par l'admin (texte libre, ex. "2 équipes, 3 demi-journées"). */
  dispoConseillee: string;
  /** Nombre de calendriers distribués l'année dernière (saisi manuellement). */
  calendriersAnneeDerniere: number | null;
  /** Adresses BAN supprimées à la main : on ne les recrée pas lors d'un recalcul. */
  banIdsExclus: string[];
  creeLe: string;
  modifieLe: string;
}

export interface AdressePoint {
  id: string;
  tourneeId: string;
  /** Identifiant Base Adresse Nationale (null si introuvable). */
  banId: string | null;
  /** true si le point a été ajouté à la main (conservé lors des recalculs de zone). */
  manuelle: boolean;
  libelle: string;
  commune: string;
  codePostal: string;
  lat: number;
  lng: number;
  /** Autres adresses regroupées sur le même point (immeuble, même bâtiment). */
  autresAdresses: string[];
  statut: StatutAdresse;
  /** Champs remplis en tournée (phases suivantes). */
  somme: number | null;
  calendriersLaisses: number | null;
  rappelLe: string | null;
  note: string | null;
  modifieLe: string;
}

/** Adresse brute issue du fichier BAN d'un département. */
export interface BanAdresseBrute {
  banId: string;
  libelle: string;
  commune: string;
  codePostal: string;
  lat: number;
  lng: number;
}
