// Horloge alignée sur celle du serveur.
//
// L'application arbitre les modifications concurrentes avec « la dernière
// modification gagne ». Si chaque téléphone horodate avec sa propre horloge,
// un appareil en avance de quelques minutes fait gagner ses anciennes valeurs
// et des points « reviennent en arrière ». On mesure donc une fois le décalage
// avec le serveur et on l'applique à tous les horodatages.

import { supabase } from './supabase';

let decalage = 0; // millisecondes à ajouter à l'horloge locale
let synchronisee = false;

// La fonction serveur « maintenant() » est créée par la même mise à jour SQL
// que les statuts « inhabité » / « maison secondaire ». Si elle répond, c'est
// que la base accepte aussi ces deux statuts. On mémorise la réponse pour que
// les boutons restent disponibles ensuite, même sans réseau.
const CLE_BASE_A_JOUR = 'base-statuts-etendus';

/** Vrai si la base accepte les statuts « inhabité » et « maison secondaire ». */
export function statutsEtendusDisponibles(): boolean {
  if (!supabase) return true; // mode démonstration : aucune base à ménager
  try {
    return localStorage.getItem(CLE_BASE_A_JOUR) === '1';
  } catch {
    return false;
  }
}

/** Date courante, corrigée du décalage avec le serveur. */
export function maintenantISO(): string {
  return new Date(Date.now() + decalage).toISOString();
}

/** Mesure le décalage entre l'horloge de l'appareil et celle du serveur. */
export async function synchroniserHorloge(): Promise<void> {
  if (!supabase) return;
  try {
    const avant = Date.now();
    const { data, error } = await supabase.rpc('maintenant');
    if (error || !data) return;
    const apres = Date.now();
    const serveur = new Date(data as string).getTime();
    if (!Number.isFinite(serveur)) return;
    // on retire la moitié de l'aller-retour réseau
    decalage = serveur - (avant + apres) / 2;
    synchronisee = true;
    try {
      localStorage.setItem(CLE_BASE_A_JOUR, '1');
    } catch {
      /* stockage indisponible : les deux statuts resteront masqués */
    }
  } catch {
    // réseau indisponible : on garde l'horloge locale
  }
}

/** Décalage mesuré, en secondes (pour le diagnostic). */
export function etatHorloge(): { synchronisee: boolean; decalageSecondes: number } {
  return { synchronisee, decalageSecondes: Math.round(decalage / 1000) };
}
