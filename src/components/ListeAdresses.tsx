// Vue liste des adresses, triée par proximité (position GPS, sinon centre de
// la carte). Périmètre : tournée sélectionnée, sinon « ma tournée », sinon tout.

import { useEffect, useMemo, useState } from 'react';
import {
  calculerTourneesVisibles,
  tourneesDontOnVoitLaRecette,
  useAppStore,
} from '../store/useAppStore';
import { COULEUR_STATUT, STATUTS_TERMINES, trierTournees } from '../types';
import { distanceMetres } from '../lib/geo';
import type { AdressePoint } from '../types';

/** Nombre de lignes affichées d'emblée (les plus proches), puis par tranche. */
const TRANCHE = 150;

function formatDistance(d: number | null): string {
  if (d === null) return '';
  if (d < 1000) return `${Math.round(d)} m`;
  return `${(d / 1000).toFixed(1).replace('.', ',')} km`;
}

export default function ListeAdresses() {
  const adresses = useAppStore((s) => s.adresses);
  const tournees = useAppStore((s) => s.tournees);
  const selectionTourneeId = useAppStore((s) => s.selectionTourneeId);
  const equipes = useAppStore((s) => s.equipes);
  const profil = useAppStore((s) => s.profil);
  const positionGPS = useAppStore((s) => s.positionGPS);
  const centreCarte = useAppStore((s) => s.centreCarte);
  const s = useAppStore.getState;

  const tourneesAffichees = useAppStore((st) => st.tourneesAffichees);
  const vueMembre = useAppStore((st) => st.vueMembre);
  const visibles = useMemo(
    () => calculerTourneesVisibles(profil, equipes, tourneesAffichees, vueMembre),
    [profil, equipes, tourneesAffichees, vueMembre],
  );
  // Le repère « 💶 » dit qu'une somme a été reçue : réservé, lui aussi, à
  // l'équipe de la tournée et aux administrateurs.
  const recettesVisibles = useMemo(
    () => tourneesDontOnVoitLaRecette(profil, equipes, vueMembre),
    [profil, equipes, vueMembre],
  );

  const maTourneeId = profil
    ? (equipes.find((e) => e.tourneeId && e.membres.includes(profil.id))?.tourneeId ?? null)
    : null;
  const tourneeId = selectionTourneeId ?? maTourneeId;
  const liste = useMemo(
    () =>
      adresses.filter((a) =>
        tourneeId ? a.tourneeId === tourneeId : visibles === null || visibles.has(a.tourneeId),
      ),
    [adresses, tourneeId, visibles],
  );

  // Le tri par distance n'est refait que si l'on a bougé d'une dizaine de
  // mètres. Avant, chaque nouvelle position du GPS (une par seconde) retriait
  // et redessinait toute la liste — jusqu'à six mille lignes.
  const reference = positionGPS ?? centreCarte;
  const latRef = reference ? Math.round(reference.lat * 10000) / 10000 : null;
  const lngRef = reference ? Math.round(reference.lng * 10000) / 10000 : null;
  const lignes = useMemo(
    () =>
      liste
        .map((a) => ({
          adresse: a,
          distance:
            latRef !== null && lngRef !== null ? distanceMetres(latRef, lngRef, a.lat, a.lng) : null,
        }))
        .sort(
          (x, y) =>
            (x.distance ?? Number.MAX_VALUE) - (y.distance ?? Number.MAX_VALUE) ||
            x.adresse.libelle.localeCompare(y.adresse.libelle),
        ),
    [liste, latRef, lngRef],
  );

  // On n'affiche d'abord que les plus proches : c'est elles que l'on cherche.
  const [limite, setLimite] = useState(TRANCHE);
  useEffect(() => setLimite(TRANCHE), [tourneeId]);
  const affichees = lignes.length > limite ? lignes.slice(0, limite) : lignes;

  const faites = useMemo(
    () => liste.filter((a) => STATUTS_TERMINES.includes(a.statut)).length,
    [liste],
  );

  const choisir = (a: AdressePoint) => {
    s().cadrerSur({ type: 'point', lat: a.lat, lng: a.lng, zoom: 18 });
    s().ouvrirAdresse(a.id);
  };

  return (
    <div className="liste-voile" onClick={() => s().fermerVueListe()}>
      <div className="liste-panneau" onClick={(e) => e.stopPropagation()}>
        <div className="liste-entete">
          <h2>📋 Adresses</h2>
          <select
            value={tourneeId ?? ''}
            onChange={(e) => s().selectionnerTournee(e.target.value || null)}
          >
            <option value="">Toutes les tournées</option>
            {trierTournees(tournees).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
          <button className="panneau-fermer" onClick={() => s().fermerVueListe()}>
            ✕
          </button>
        </div>

        <div className="liste-resume">
          {faites}/{liste.length} faites · triées par proximité{' '}
          {positionGPS ? '(position GPS)' : '(centre de la carte)'}
        </div>

        <div className="liste-corps">
          {lignes.length === 0 && <p className="campagne-vide">Aucune adresse dans ce périmètre.</p>}
          {affichees.map(({ adresse, distance }) => (
            <button key={adresse.id} className="liste-ligne" onClick={() => choisir(adresse)}>
              <span className="liste-pastille" style={{ background: COULEUR_STATUT[adresse.statut] }} />
              <span className="liste-libelle">
                {adresse.libelle}
                <span className="liste-commune">{adresse.commune}</span>
              </span>
              <span className="liste-indicateurs">
                {(1 + adresse.autresAdresses.length > 1 || adresse.typeBatiment === 'immeuble') &&
                  '🏢'}
                {adresse.rappelLe && '⏰'}
                {adresse.somme != null &&
                  (recettesVisibles === null || recettesVisibles.has(adresse.tourneeId)) &&
                  '💶'}
                {adresse.note && '📝'}
              </span>
              <span className="liste-distance">{formatDistance(distance)}</span>
            </button>
          ))}
          {lignes.length > limite && (
            <button className="liste-suite" onClick={() => setLimite((n) => n + TRANCHE)}>
              Afficher les {Math.min(TRANCHE, lignes.length - limite)} suivantes (
              {lignes.length - limite} plus loin)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
