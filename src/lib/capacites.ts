// Détection des colonnes présentes dans la base partagée.
//
// Les mises à jour SQL ne sont pas forcément appliquées au moment où une
// nouvelle version de l'application est déployée. Envoyer une colonne que la
// base ne connaît pas ferait échouer TOUTE l'écriture — y compris le statut
// d'une maison. On regarde donc ce que le serveur nous renvoie et on n'envoie
// la nouveauté que lorsqu'elle existe vraiment.
//
// La réponse est mémorisée pour que l'interface ne change pas d'avis hors réseau.

const CLE = 'colonnes-connues';

function charger(): Set<string> {
  try {
    const brut = localStorage.getItem(CLE);
    return new Set<string>(brut ? (JSON.parse(brut) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

let connues = charger();

/** Enregistre les colonnes vues sur une ligne venue du serveur. */
export function signalerColonnes(ligne: Record<string, unknown>): void {
  let nouveau = false;
  for (const nom of Object.keys(ligne)) {
    if (!connues.has(nom)) {
      connues.add(nom);
      nouveau = true;
    }
  }
  if (!nouveau) return;
  try {
    localStorage.setItem(CLE, JSON.stringify([...connues]));
  } catch {
    /* stockage indisponible : la détection repartira de zéro au rechargement */
  }
}

/** Vrai si la base partagée connaît cette colonne. */
export function colonneDisponible(nom: string): boolean {
  return connues.has(nom);
}

/** Pour les tests : repart d'une détection vierge. */
export function oublierColonnes(): void {
  connues = new Set<string>();
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à faire */
  }
}
