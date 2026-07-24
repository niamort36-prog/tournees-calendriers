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

export interface Profil {
  id: string;
  nom: string;
  role: 'admin' | 'normal';
  centre: string;
}

export interface Campagne {
  id: string;
  nom: string;
  /** Nombre de calendriers commandés pour la campagne. */
  calendriersCommandes: number | null;
  /** Taille des paquets livrés (ex. 25) → calcul du nombre à prendre par tournée. */
  taillePaquet: number | null;
  statut: 'active' | 'archivee';
  creeLe: string;
  archiveeLe: string | null;
  modifieLe: string;
}

export interface Equipe {
  id: string;
  nom: string;
  /** Ids des profils membres de l'équipe. */
  membres: string[];
  /** Tournée attribuée (null si pas encore affectée). */
  tourneeId: string | null;
  creeLe: string;
  modifieLe: string;
}

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

/** Un appartement d'un immeuble, validable individuellement. */
export interface Appartement {
  id: string;
  etage: string; // texte libre : « RDC », « 1er », « 2 »…
  numero: string; // « Apt 12 », « Porte gauche »…
  statut: StatutAdresse;
}

/**
 * Statut d'ensemble d'un immeuble d'après ses appartements :
 * rouge s'il reste un absent, gris s'il reste du travail,
 * vert si au moins un calendrier est passé, bleu si tout est refus.
 */
export function statutAgrege(appartements: Appartement[]): StatutAdresse {
  if (appartements.length === 0) return 'a_faire';
  if (appartements.some((a) => a.statut === 'absent')) return 'absent';
  if (appartements.some((a) => a.statut === 'a_faire')) return 'a_faire';
  if (appartements.some((a) => a.statut === 'distribue')) return 'distribue';
  return 'refus';
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
  /** Maison individuelle ou immeuble (avec appartements). */
  typeBatiment: 'maison' | 'immeuble';
  /** Appartements de l'immeuble (statut global calculé automatiquement). */
  appartements: Appartement[];
  statut: StatutAdresse;
  /** Statut lors de la campagne précédente (rempli par l'archivage). */
  statutPrecedent: StatutAdresse | null;
  /** Champs remplis en tournée (phases suivantes). */
  somme: number | null;
  calendriersLaisses: number | null;
  rappelLe: string | null;
  note: string | null;
  modifieLe: string;
}

/** Une demi-journée de tournée effectuée, avec la voiture utilisée. */
export interface Seance {
  date: string; // AAAA-MM-JJ
  moment: 'matin' | 'apres_midi' | 'soiree';
  /** Profil du SP dont la voiture a été utilisée (null si non renseigné). */
  voitureProfilId: string | null;
}

export const LIBELLE_MOMENT: Record<Seance['moment'], string> = {
  matin: 'Matin',
  apres_midi: 'Après-midi',
  soiree: 'Soirée',
};

export interface LigneCheques {
  nombre: number | null;
  montant: number | null;
}

/** Coupures du décompte espèces, dans l'ordre d'affichage. */
export const COUPURES: { cle: string; libelle: string; valeur: number }[] = [
  { cle: 'c50', libelle: 'Pièces de 0,50 €', valeur: 0.5 },
  { cle: 'e1', libelle: 'Pièces de 1 €', valeur: 1 },
  { cle: 'e2', libelle: 'Pièces de 2 €', valeur: 2 },
  { cle: 'b5', libelle: 'Billets de 5 €', valeur: 5 },
  { cle: 'b10', libelle: 'Billets de 10 €', valeur: 10 },
  { cle: 'b20', libelle: 'Billets de 20 €', valeur: 20 },
  { cle: 'b50', libelle: 'Billets de 50 €', valeur: 50 },
  { cle: 'b100', libelle: 'Billets de 100 €', valeur: 100 },
];

/** Décompte de fin de tournée (un par tournée et par campagne). */
export interface Decompte {
  id: string;
  tourneeId: string;
  campagneId: string | null;
  participants: string[]; // ids de profils
  seances: Seance[];
  especes: Record<string, number | null>; // clé de coupure → nombre
  cheques: LigneCheques[];
  cb: number | null; // montant total payé par carte
  calendriersDistribues: number | null;
  termine: boolean;
  termineLe: string | null;
  numeroRecu: number | null;
  creeLe: string;
  modifieLe: string;
}

export function totalDecompte(d: Decompte): {
  especes: number;
  cheques: number;
  cb: number;
  total: number;
} {
  const arrondi = (x: number) => Math.round(x * 100) / 100;
  let especes = 0;
  for (const c of COUPURES) especes += (d.especes[c.cle] ?? 0) * c.valeur;
  let cheques = 0;
  for (const l of d.cheques) cheques += (l.nombre ?? 0) * (l.montant ?? 0);
  const cb = d.cb ?? 0;
  return {
    especes: arrondi(especes),
    cheques: arrondi(cheques),
    cb: arrondi(cb),
    total: arrondi(especes + cheques + cb),
  };
}

export function formatEuros(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}

/** Tri alphabétique des tournées (numérique : « Tournée 2 » avant « Tournée 10 »). */
export function trierTournees(liste: Tournee[]): Tournee[] {
  return [...liste].sort((a, b) =>
    a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * Trouve le décompte d'une tournée pour une campagne. S'il existe des doublons
 * (créations simultanées), privilégie celui qui est terminé, puis le plus récent.
 */
export function trouverDecompte(
  decomptes: Decompte[],
  tourneeId: string,
  campagneId: string | null,
): Decompte | undefined {
  const candidats = decomptes.filter((d) => d.tourneeId === tourneeId && d.campagneId === campagneId);
  if (candidats.length <= 1) return candidats[0];
  return [...candidats].sort(
    (a, b) => Number(b.termine) - Number(a.termine) || Date.parse(b.modifieLe) - Date.parse(a.modifieLe),
  )[0];
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
