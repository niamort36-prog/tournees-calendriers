/// <reference types="vite/client" />

/** Mode d'emploi PDF embarqué à la construction (outils/mode-emploi.mjs). */
declare const __MODE_EMPLOI__: {
  fichier: string;
  /** empreinte du contenu : l'adresse change dès que le PDF change */
  version: string;
  /** date de génération du PDF (JJ/MM/AAAA) */
  date: string | null;
  pages: number | null;
  octets: number;
};
