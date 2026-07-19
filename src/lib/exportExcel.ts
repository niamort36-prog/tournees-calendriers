// Export Excel : un classeur avec les tournées, les adresses, les décomptes
// et la campagne. Généré entièrement dans le navigateur (SheetJS).

import * as XLSX from 'xlsx';
import type { AdressePoint, Campagne, Decompte, Equipe, Profil, Tournee } from '../types';
import { COUPURES, LIBELLE_STATUT, totalDecompte, trouverDecompte } from '../types';

export interface DonneesExport {
  tournees: Tournee[];
  adresses: AdressePoint[];
  equipes: Equipe[];
  decomptes: Decompte[];
  campagnes: Campagne[];
  annuaire: Profil[];
}

type Ligne = Record<string, string | number | null>;

export function construireFeuilles(d: DonneesExport): Record<string, Ligne[]> {
  const campagneActive = d.campagnes.find((c) => c.statut === 'active') ?? null;
  const nomDe = (id: string) => d.annuaire.find((p) => p.id === id)?.nom ?? '?';

  const feuilleTournees: Ligne[] = d.tournees.map((t) => {
    const adresses = d.adresses.filter((a) => a.tourneeId === t.id);
    const distribues = adresses
      .filter((a) => a.statut === 'distribue')
      .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
    const decompte = trouverDecompte(d.decomptes, t.id, campagneActive?.id ?? null);
    const equipes = d.equipes.filter((e) => e.tourneeId === t.id);
    return {
      Tournée: t.nom,
      'Nombre de points': adresses.length,
      'Calendriers distribués': decompte?.calendriersDistribues ?? distribues,
      "Distribués l'an dernier": t.calendriersAnneeDerniere,
      'Dispo conseillée': t.dispoConseillee,
      'Équipe(s)': equipes.map((e) => `${e.nom} (${e.membres.map(nomDe).join(', ')})`).join(' ; '),
      'Total collecté (€)': decompte ? totalDecompte(decompte).total : null,
      'N° de reçu': decompte?.numeroRecu ?? null,
      Terminée: decompte?.termine ? 'oui' : 'non',
    };
  });

  const nomTournee = (id: string) => d.tournees.find((t) => t.id === id)?.nom ?? '?';
  const feuilleAdresses: Ligne[] = d.adresses.map((a) => ({
    Tournée: nomTournee(a.tourneeId),
    Adresse: a.libelle,
    Commune: a.commune,
    'Code postal': a.codePostal,
    'Adresses regroupées': 1 + a.autresAdresses.length,
    Statut: LIBELLE_STATUT[a.statut],
    "L'an dernier": a.statutPrecedent ? LIBELLE_STATUT[a.statutPrecedent] : '',
    'Somme (€)': a.somme,
    'Calendriers laissés': a.calendriersLaisses,
    Note: a.note ?? '',
    Rappel: a.rappelLe ? new Date(a.rappelLe).toLocaleString('fr-FR') : '',
  }));

  const feuilleDecomptes: Ligne[] = d.decomptes.map((dec) => {
    const totaux = totalDecompte(dec);
    const ligne: Ligne = {
      Tournée: nomTournee(dec.tourneeId),
      'N° de reçu': dec.numeroRecu,
      Terminée: dec.termine ? 'oui' : 'non',
      'Clôturée le': dec.termineLe ? new Date(dec.termineLe).toLocaleDateString('fr-FR') : '',
      Participants: dec.participants.map(nomDe).join(', '),
      'Demi-journées': dec.seances.length,
    };
    for (const c of COUPURES) ligne[c.libelle] = dec.especes[c.cle] ?? null;
    ligne['Espèces (€)'] = totaux.especes;
    ligne['Chèques (détail)'] = dec.cheques
      .filter((l) => (l.nombre ?? 0) > 0)
      .map((l) => `${l.nombre} × ${l.montant} €`)
      .join(' ; ');
    ligne['Chèques (€)'] = totaux.cheques;
    ligne['CB (€)'] = totaux.cb;
    ligne['TOTAL (€)'] = totaux.total;
    return ligne;
  });

  const totalCollecte = d.decomptes
    .filter((dec) => dec.campagneId === (campagneActive?.id ?? null))
    .reduce((somme, dec) => somme + totalDecompte(dec).total, 0);
  const totalDistribues = d.adresses
    .filter((a) => a.statut === 'distribue')
    .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
  const feuilleCampagne: Ligne[] = campagneActive
    ? [
        {
          Campagne: campagneActive.nom,
          'Calendriers commandés': campagneActive.calendriersCommandes,
          'Taille des paquets': campagneActive.taillePaquet,
          'Calendriers distribués': totalDistribues,
          Restants:
            campagneActive.calendriersCommandes != null
              ? campagneActive.calendriersCommandes - totalDistribues
              : null,
          'Total collecté (€)': Math.round(totalCollecte * 100) / 100,
        },
      ]
    : [];

  return {
    Tournées: feuilleTournees,
    Adresses: feuilleAdresses,
    Décomptes: feuilleDecomptes,
    Campagne: feuilleCampagne,
  };
}

// accès console en développement (débogage / tests)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).construireFeuilles = construireFeuilles;
}

export function exporterExcel(d: DonneesExport): void {
  const feuilles = construireFeuilles(d);
  const classeur = XLSX.utils.book_new();
  for (const [nom, lignes] of Object.entries(feuilles)) {
    if (lignes.length > 0) {
      XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(lignes), nom);
    }
  }
  const jour = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(classeur, `tournees-calendriers-${jour}.xlsx`);
}
