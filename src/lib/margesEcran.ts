// Marges des barres du téléphone : barre d'état en haut (heure, batterie),
// barre de navigation en bas.
//
// En temps normal, le téléphone les signale (env(safe-area-inset-*)) et le CSS
// s'en sert via --marge-haut / --marge-bas (styles.css, :root). Mais certains
// Android dessinent l'appli installée SOUS ces barres sans rien signaler : le
// bandeau du haut et le bas des fiches se retrouvaient à moitié cachés. On le
// détecte (la page occupe alors tout l'écran, barres comprises) et on impose
// des marges de secours.

const SECOURS_HAUT = 32;
const SECOURS_BAS = 48;

export interface EtatMarges {
  /** marges signalées par le téléphone, en px */
  signaleesHaut: number;
  signaleesBas: number;
  /** marges de secours appliquées (0 = aucune) */
  secoursHaut: number;
  secoursBas: number;
}

let etat: EtatMarges = { signaleesHaut: 0, signaleesBas: 0, secoursHaut: 0, secoursBas: 0 };

function margesSignalees(): { haut: number; bas: number } {
  const sonde = document.createElement('div');
  sonde.style.cssText =
    'position:fixed;left:0;top:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(sonde);
  const style = getComputedStyle(sonde);
  const marges = {
    haut: Math.round(parseFloat(style.paddingTop) || 0),
    bas: Math.round(parseFloat(style.paddingBottom) || 0),
  };
  sonde.remove();
  return marges;
}

/**
 * Appli installée sur un écran tactile, dont la fenêtre fait toute la hauteur
 * de l'écran : les barres du téléphone (toujours affichées dans ce mode) sont
 * forcément par-dessus. Dans le navigateur, la barre d'adresse rend la fenêtre
 * plus petite que l'écran : jamais concerné.
 */
function pageSousLesBarres(): boolean {
  const installee =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches;
  const tactile = window.matchMedia('(pointer: coarse)').matches;
  return installee && tactile && window.innerHeight >= screen.height - 4;
}

export function ajusterMarges(): void {
  const signalees = margesSignalees();
  const sous = pageSousLesBarres();
  const secoursHaut = sous && signalees.haut === 0 ? SECOURS_HAUT : 0;
  const secoursBas = sous && signalees.bas === 0 ? SECOURS_BAS : 0;
  const racine = document.documentElement.style;
  if (secoursHaut) racine.setProperty('--marge-haut', `${secoursHaut}px`);
  else racine.removeProperty('--marge-haut');
  if (secoursBas) racine.setProperty('--marge-bas', `${secoursBas}px`);
  else racine.removeProperty('--marge-bas');
  etat = { signaleesHaut: signalees.haut, signaleesBas: signalees.bas, secoursHaut, secoursBas };
}

export function etatMarges(): EtatMarges {
  return etat;
}

/** À appeler une fois au démarrage : recalcule à chaque rotation / redimensionnement. */
export function surveillerMarges(): void {
  ajusterMarges();
  window.addEventListener('resize', ajusterMarges);
}
