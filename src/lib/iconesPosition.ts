// Icône qui marque « ma position » sur la carte (réglage propre à chaque
// appareil). Par défaut : le rond bleu habituel.
//
// Les emojis s'affichent avec la police du téléphone (leur dessin varie un
// peu d'une marque à l'autre). La citrouille, le bonhomme de neige et la tête
// coiffés d'un casque de pompier n'existent pas en emoji : ils sont dessinés
// ici, et sont donc identiques partout.

export interface IconePosition {
  id: string;
  nom: string;
  groupe: string;
  /** emoji affiché tel quel */
  emoji?: string;
  /** dessin (constante du code, jamais une saisie) */
  svg?: string;
}

export const ICONE_PAR_DEFAUT = 'rond-bleu';

/**
 * Casque de sapeur-pompier vu de face (type F1 : coque chromée, crête,
 * visière dorée). Dessiné dans une boîte de 40 × 26, placée par `x`, `y`
 * et `echelle`. Pas de dégradé : un dégradé exige un identifiant unique,
 * et le même dessin apparaît plusieurs fois dans la page.
 */
function casque(x: number, y: number, echelle: number): string {
  return (
    `<g transform="translate(${x} ${y}) scale(${echelle})">` +
    // couvre-nuque, derrière
    '<ellipse cx="20" cy="22.5" rx="19.5" ry="3.6" fill="#374151"/>' +
    // coque
    '<path d="M2.5 23 C2.5 -1.5 37.5 -1.5 37.5 23 Z" fill="#c4ccd6" stroke="#6b7682" stroke-width="1"/>' +
    // ombre du côté droit
    // (le bord droit suit exactement la courbe de la coque)
    '<path d="M27.5 23 C29.5 17.5 30.6 12.6 32.03 9.22 C35.31 12.28 37.5 16.88 37.5 23 Z" fill="#9aa5b1"/>' +
    // reflet
    '<path d="M7.5 17 C7.5 10 10.5 6 14.5 4.5 C11.5 8 10.5 12 10.5 17 Z" fill="#f4f7fa"/>' +
    // crête centrale
    '<path d="M17.2 22 L17.2 5.2 Q20 -0.6 22.8 5.2 L22.8 22 Z" fill="#e6eaef" stroke="#6b7682" stroke-width="0.9"/>' +
    // visière dorée
    '<path d="M3 17.8 Q20 12.6 37 17.8 L37 23 Q20 18.6 3 23 Z" fill="#f5b800" stroke="#a87500" stroke-width="0.9"/>' +
    '<path d="M6 18.4 Q20 14.6 34 18.4" fill="none" stroke="#ffe27a" stroke-width="1"/>' +
    // rebord
    '<path d="M0.5 23.2 Q20 18.8 39.5 23.2 L39.5 25.4 Q20 21.4 0.5 25.4 Z" fill="#3f4753"/>' +
    '</g>'
  );
}

const debutSvg = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';

const SVG_TETE =
  debutSvg +
  // oreilles
  '<circle cx="15.5" cy="40" r="3.6" fill="#efb27f" stroke="#c98b55" stroke-width="1"/>' +
  '<circle cx="48.5" cy="40" r="3.6" fill="#efb27f" stroke="#c98b55" stroke-width="1"/>' +
  // visage
  '<circle cx="32" cy="38.5" r="17" fill="#f8c99a" stroke="#c98b55" stroke-width="1.2"/>' +
  '<circle cx="22.5" cy="45" r="2.6" fill="#f08a7e" opacity="0.45"/>' +
  '<circle cx="41.5" cy="45" r="2.6" fill="#f08a7e" opacity="0.45"/>' +
  '<ellipse cx="26" cy="38.5" rx="1.9" ry="2.5" fill="#1f2937"/>' +
  '<ellipse cx="38" cy="38.5" rx="1.9" ry="2.5" fill="#1f2937"/>' +
  '<path d="M25 46 Q32 52.5 39 46" fill="none" stroke="#7c2d12" stroke-width="1.9" stroke-linecap="round"/>' +
  // jugulaire
  '<path d="M14.5 30 Q16 50.5 32 56 Q48 50.5 49.5 30" fill="none" stroke="#374151" stroke-width="1.7"/>' +
  casque(10, 4, 1.1) +
  '</svg>';

const SVG_CITROUILLE =
  debutSvg +
  // côtes de la citrouille
  '<ellipse cx="20.5" cy="45" rx="14" ry="15.5" fill="#e06f12" stroke="#a84d08" stroke-width="1.2"/>' +
  '<ellipse cx="43.5" cy="45" rx="14" ry="15.5" fill="#e06f12" stroke="#a84d08" stroke-width="1.2"/>' +
  '<ellipse cx="32" cy="45" rx="12.5" ry="16.5" fill="#f58a26" stroke="#a84d08" stroke-width="1.2"/>' +
  // visage découpé
  '<path d="M19.5 41 L27 41 L23.2 35 Z" fill="#3b1a05"/>' +
  '<path d="M37 41 L44.5 41 L40.8 35 Z" fill="#3b1a05"/>' +
  '<path d="M30.3 45.5 L33.7 45.5 L32 42.5 Z" fill="#3b1a05"/>' +
  '<path d="M19 49 Q32 60.5 45 49 L41.5 50.5 L39.5 48.3 L36.3 51.2 L32 49.2 L27.7 51.2 L24.5 48.3 L22.5 50.5 Z" fill="#3b1a05"/>' +
  casque(10, 5, 1.1) +
  '</svg>';

const SVG_BONHOMME_NEIGE =
  debutSvg +
  // corps et tête
  '<circle cx="32" cy="48" r="14" fill="#ffffff" stroke="#8aa2bc" stroke-width="1.5"/>' +
  '<circle cx="32" cy="28" r="10.5" fill="#ffffff" stroke="#8aa2bc" stroke-width="1.5"/>' +
  // écharpe rouge
  '<path d="M22 35.5 Q32 40.5 42 35.5 L42.5 39 Q32 44 21.5 39 Z" fill="#e63946"/>' +
  '<path d="M35 39.5 L39.5 49.5 L35.3 50 L32.6 41 Z" fill="#c1121f"/>' +
  // boutons
  '<circle cx="32" cy="46" r="1.6" fill="#1f2937"/>' +
  '<circle cx="32" cy="52" r="1.6" fill="#1f2937"/>' +
  // visage
  '<circle cx="28" cy="27" r="1.5" fill="#1f2937"/>' +
  '<circle cx="36" cy="27" r="1.5" fill="#1f2937"/>' +
  '<path d="M31.6 29.4 L41 31.2 L31.6 32.2 Z" fill="#f97316"/>' +
  '<path d="M28.3 33.2 Q32 35.2 35.7 33.2" fill="none" stroke="#1f2937" stroke-width="1.1" stroke-linecap="round"/>' +
  casque(16.5, 4, 0.78) +
  '</svg>';

/** Roue vue de profil (pneu, jante claire, moyeu). */
function roue(cx: number, cy: number, r: number): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1f2937"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.5).toFixed(2)}" fill="#eef2f6"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 0.18).toFixed(2)}" fill="#9ca3af"/>`
  );
}

/** Passage de roue noir (élargisseur d'aile), posé au ras du bas de caisse. */
function passageRoue(cx: number, bas: number, r: number): string {
  return `<path d="M${cx - r} ${bas} A${r} ${r} 0 0 1 ${cx + r} ${bas} Z" fill="#2b2f36"/>`;
}

// DEF : 4×4 de type Defender des feux tactiques — caisse rouge, toit blanc,
// arceau jaune, gyrophare bleu, bande jaune, coffre jaune à l'arrière.
const SVG_DEF =
  debutSvg +
  '<g transform="translate(0 3)">' +
  // caisse
  '<path d="M4 19.5 Q4 17 6.5 17 L42.5 17 L46.5 29.5 L58.5 30.3 Q61.5 30.6 61.5 33.5 L61.5 43 L4 43 Z" fill="#d62828" stroke="#8f1717" stroke-width="0.8"/>' +
  // toit blanc
  '<path d="M4.4 21 L4.4 19.5 Q4.4 17.4 6.5 17.4 L42.2 17.4 L43.3 21 Z" fill="#f8fafc"/>' +
  // coffre jaune « feux tactiques »
  '<rect x="6.5" y="22.5" width="11" height="8.5" rx="0.8" fill="#ffd200" stroke="#b38f00" stroke-width="0.6"/>' +
  // vitres
  '<rect x="20" y="22.5" width="9" height="6.5" rx="0.6" fill="#bfe0f5" stroke="#4b5563" stroke-width="0.6"/>' +
  '<rect x="31" y="22.5" width="9.5" height="6.5" rx="0.6" fill="#bfe0f5" stroke="#4b5563" stroke-width="0.6"/>' +
  '<path d="M42.2 22.5 L43.9 22.5 L45.8 28.8 L43.6 28.8 Z" fill="#bfe0f5" stroke="#4b5563" stroke-width="0.5"/>' +
  // portière, rétroviseur
  '<path d="M30 21.5 L30 42.5" stroke="#8f1717" stroke-width="0.6"/>' +
  '<rect x="44.6" y="23.2" width="1.7" height="2.8" rx="0.4" fill="#1f2937"/>' +
  // bande jaune
  '<rect x="4.4" y="33" width="56.7" height="3" fill="#ffd200"/>' +
  // phare, pare-buffle
  '<circle cx="60" cy="31.6" r="1.3" fill="#fff7c2" stroke="#6b7280" stroke-width="0.5"/>' +
  '<rect x="57.8" y="38.6" width="5.2" height="5.4" rx="0.6" fill="#1f2937"/>' +
  // arceau jaune (il descend le long du pare-brise)
  '<path d="M6.5 17.2 L6.5 11.5 L39.5 11.5 L42.5 17.2 L46.5 29.5 M23 11.5 L23 17.2" fill="none" stroke="#f5c400" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  // gyrophare bleu
  '<rect x="35" y="7.6" width="4.6" height="3.8" rx="1" fill="#2563eb"/>' +
  '<rect x="36" y="8.3" width="1.2" height="2.3" rx="0.5" fill="#93c5fd"/>' +
  passageRoue(15, 43, 8.6) +
  passageRoue(50, 43, 8.6) +
  roue(15, 44.5, 6.8) +
  roue(50, 44.5, 6.8) +
  '</g></svg>';

// CCF : camion-citerne feux de forêt — cabine avancée, grosses roues tout
// terrain, canon à eau et gyrophares sur la cabine.
const SVG_CCF =
  debutSvg +
  '<g transform="translate(0 1.5)">' +
  // châssis
  '<rect x="6" y="38.5" width="54" height="3.5" fill="#2b2f36"/>' +
  // caisse (citerne et coffres)
  '<rect x="4" y="13" width="37.2" height="26.5" rx="1.5" fill="#d62828" stroke="#8f1717" stroke-width="0.8"/>' +
  '<text x="22.6" y="28.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="900" fill="#ffffff" letter-spacing="0.4">CCF</text>' +
  // galerie sur le toit de la caisse
  '<path d="M6 13 L6 10.6 L39 10.6 L39 13 M17 10.6 L17 13 M28 10.6 L28 13" fill="none" stroke="#9ca3af" stroke-width="1.1"/>' +
  // cabine
  '<path d="M42.5 14 L56.5 14 Q60 14 60.6 17.5 L61.8 38.5 L42.5 38.5 Z" fill="#d62828" stroke="#8f1717" stroke-width="0.8"/>' +
  '<path d="M49 17 L58.4 17 Q59.5 17 59.7 18.2 L60.4 25.5 L49 25.5 Z" fill="#bfe0f5" stroke="#4b5563" stroke-width="0.6"/>' +
  '<path d="M47.4 16 L47.4 38" stroke="#8f1717" stroke-width="0.6"/>' +
  // bande jaune
  '<rect x="4.4" y="32" width="57.2" height="3" fill="#ffd200"/>' +
  // gyrophares, canon à eau
  '<rect x="43.4" y="10.4" width="3.8" height="3.6" rx="0.9" fill="#2563eb"/>' +
  '<rect x="56" y="10.4" width="3.8" height="3.6" rx="0.9" fill="#2563eb"/>' +
  '<rect x="49.4" y="11" width="4.2" height="3" rx="0.6" fill="#6b7280"/>' +
  '<path d="M52.4 11.8 L58.6 9.4" stroke="#9ca3af" stroke-width="1.6" stroke-linecap="round"/>' +
  // phare, pare-chocs
  '<circle cx="60.9" cy="29.6" r="1.2" fill="#fff7c2" stroke="#6b7280" stroke-width="0.5"/>' +
  '<rect x="58" y="36" width="5" height="5.2" rx="0.6" fill="#1f2937"/>' +
  passageRoue(15, 40, 8.8) +
  passageRoue(51, 40, 8.8) +
  roue(15, 45, 7.6) +
  roue(51, 45, 7.6) +
  '</g></svg>';

export const ICONES_POSITION: IconePosition[] = [
  { id: ICONE_PAR_DEFAUT, nom: 'Rond bleu', groupe: 'Par défaut' },

  { id: 'pompier', nom: 'Pompier', groupe: 'Pompiers', emoji: '🧑‍🚒' },
  { id: 'pompier-homme', nom: 'Pompier (homme)', groupe: 'Pompiers', emoji: '👨‍🚒' },
  { id: 'pompiere', nom: 'Pompière', groupe: 'Pompiers', emoji: '👩‍🚒' },
  { id: 'tete-casque', nom: 'Tête casquée', groupe: 'Pompiers', svg: SVG_TETE },
  { id: 'casque-secours', nom: 'Casque de secours', groupe: 'Pompiers', emoji: '⛑️' },
  { id: 'extincteur', nom: 'Extincteur', groupe: 'Pompiers', emoji: '🧯' },
  { id: 'flamme', nom: 'Flamme', groupe: 'Pompiers', emoji: '🔥' },
  { id: 'gyrophare', nom: 'Gyrophare', groupe: 'Pompiers', emoji: '🚨' },

  { id: 'camion-pompiers', nom: 'Camion de pompiers', groupe: 'Véhicules', emoji: '🚒' },
  { id: 'def', nom: 'DEF pompiers', groupe: 'Véhicules', svg: SVG_DEF },
  { id: 'ccf', nom: 'CCF', groupe: 'Véhicules', svg: SVG_CCF },
  { id: 'ambulance', nom: 'Ambulance', groupe: 'Véhicules', emoji: '🚑' },
  { id: 'fourgon', nom: 'Fourgon', groupe: 'Véhicules', emoji: '🚐' },
  { id: 'vehicule-leger', nom: 'Véhicule léger', groupe: 'Véhicules', emoji: '🚙' },
  { id: 'camion', nom: 'Camion', groupe: 'Véhicules', emoji: '🚚' },
  { id: 'pick-up', nom: 'Pick-up', groupe: 'Véhicules', emoji: '🛻' },
  { id: 'helicoptere', nom: 'Hélicoptère', groupe: 'Véhicules', emoji: '🚁' },

  { id: 'citrouille-casque', nom: 'Citrouille casquée', groupe: 'Saisons', svg: SVG_CITROUILLE },
  { id: 'bonhomme-neige-casque', nom: 'Bonhomme de neige casqué', groupe: 'Saisons', svg: SVG_BONHOMME_NEIGE },
];

/** Groupes, dans l'ordre d'affichage. */
export const GROUPES_ICONES: string[] = [...new Set(ICONES_POSITION.map((i) => i.groupe))];

/** L'icône demandée, ou le rond bleu si elle n'existe pas (ou plus). */
export function trouverIcone(id: string | null | undefined): IconePosition {
  return ICONES_POSITION.find((i) => i.id === id) ?? ICONES_POSITION[0];
}

/** Contenu HTML de l'icône (emoji ou dessin) pour le marqueur de la carte. */
export function htmlIcone(icone: IconePosition): string {
  if (icone.svg) return icone.svg;
  return `<span class="icone-position-emoji">${icone.emoji ?? ''}</span>`;
}

const CLE_ICONE = 'icone-position';

export function lireIconePosition(): string {
  try {
    return trouverIcone(localStorage.getItem(CLE_ICONE)).id;
  } catch {
    return ICONE_PAR_DEFAUT;
  }
}

export function ecrireIconePosition(id: string): void {
  try {
    if (id === ICONE_PAR_DEFAUT) localStorage.removeItem(CLE_ICONE);
    else localStorage.setItem(CLE_ICONE, id);
  } catch {
    /* stockage indisponible : le choix vaut jusqu'à la fermeture de l'appli */
  }
}
