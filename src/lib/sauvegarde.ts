// Sauvegarde complète : un seul fichier JSON qui contient tout l'avancement
// des tournées — statuts maison par maison, sommes reçues et leur détail,
// commentaires, rappels, décomptes, équipes, campagnes et journal.
//
// Le même format est produit automatiquement trois fois par jour sur le
// Google Drive de l'amicale (voir docs/sauvegarde/README.md). Un seul outil
// de restauration (docs/sauvegarde/restaurer.mjs) sert donc pour les deux.

import type {
  AdressePoint,
  Campagne,
  Decompte,
  EntreeJournal,
  Equipe,
  Profil,
  Tournee,
} from '../types';
import {
  adresseVersLigne,
  campagneVersLigne,
  decompteVersLigne,
  equipeVersLigne,
  journalVersLigne,
  tourneeVersLigne,
} from './sync';

/** Marqueur du format, vérifié à la restauration. */
export const FORMAT_SAUVEGARDE = 'sauvegarde-tournees-calendriers';
export const VERSION_SAUVEGARDE = 1;

export interface DonneesSauvegarde {
  tournees: Tournee[];
  adresses: AdressePoint[];
  equipes: Equipe[];
  decomptes: Decompte[];
  campagnes: Campagne[];
  annuaire: Profil[];
  journal: EntreeJournal[];
}

export interface Sauvegarde {
  format: string;
  version: number;
  genere_le: string;
  /** « application » = bouton de la Synthèse, « automatique » = Google Drive. */
  source: string;
  /** Une entrée par table, avec les lignes telles que la base les stocke. */
  tables: Record<string, unknown[]>;
  /** Nombre de lignes par table : contrôle rapide à l'œil nu. */
  compte: Record<string, number>;
}

/**
 * Construit la sauvegarde à partir de ce que l'application a en mémoire.
 *
 * Les lignes sont écrites avec les noms de colonnes de la base (et non ceux
 * du code) : une sauvegarde reste donc lisible et réinjectable même si le
 * code de l'application change par la suite.
 */
export function construireSauvegarde(d: DonneesSauvegarde): Sauvegarde {
  const tables: Record<string, unknown[]> = {
    profils: d.annuaire.map((p) => ({
      id: p.id,
      nom: p.nom,
      role: p.role,
      centre: p.centre,
      approuve: p.approuve,
    })),
    tournees: d.tournees.map(tourneeVersLigne),
    // Le détail des paiements est toujours inclus, même si la base en place
    // ne l'accepte pas encore : une sauvegarde ne doit jamais perdre un
    // montant déjà saisi sur le terrain.
    adresses: d.adresses.map((a) => ({ ...adresseVersLigne(a), paiement: a.paiement })),
    campagnes: d.campagnes.map(campagneVersLigne),
    equipes: d.equipes.map(equipeVersLigne),
    decomptes: d.decomptes.map(decompteVersLigne),
    journal: d.journal.map(journalVersLigne),
  };

  const compte: Record<string, number> = {};
  for (const [nom, lignes] of Object.entries(tables)) compte[nom] = lignes.length;

  return {
    format: FORMAT_SAUVEGARDE,
    version: VERSION_SAUVEGARDE,
    genere_le: new Date().toISOString(),
    source: 'application',
    tables,
    compte,
  };
}

/** sauvegarde-2026-11-14-13h05.json */
export function nomFichierSauvegarde(quand = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const jour = `${quand.getFullYear()}-${p(quand.getMonth() + 1)}-${p(quand.getDate())}`;
  return `sauvegarde-${jour}-${p(quand.getHours())}h${p(quand.getMinutes())}.json`;
}

/** Enregistre la sauvegarde dans les téléchargements de l'appareil. */
export function telechargerSauvegarde(d: DonneesSauvegarde): void {
  const contenu = JSON.stringify(construireSauvegarde(d));
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichierSauvegarde();
  lien.click();
  // Le navigateur a copié le contenu : on libère la mémoire.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// accès console en développement (débogage / tests)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).construireSauvegarde = construireSauvegarde;
  (window as unknown as Record<string, unknown>).nomFichierSauvegarde = nomFichierSauvegarde;
}
