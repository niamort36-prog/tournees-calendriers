// Vue liste des adresses, triée par proximité (position GPS, sinon centre de
// la carte). Périmètre : tournée sélectionnée, sinon « ma tournée », sinon tout.

import { useMemo } from 'react';
import { calculerTourneesVisibles, useAppStore } from '../store/useAppStore';
import { COULEUR_STATUT, trierTournees } from '../types';
import { distanceMetres } from '../lib/geo';
import type { AdressePoint } from '../types';

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
  const visibles = useMemo(
    () => calculerTourneesVisibles(profil, equipes, tourneesAffichees),
    [profil, equipes, tourneesAffichees],
  );

  const maTourneeId = profil
    ? (equipes.find((e) => e.tourneeId && e.membres.includes(profil.id))?.tourneeId ?? null)
    : null;
  const tourneeId = selectionTourneeId ?? maTourneeId;
  const liste = adresses.filter((a) =>
    tourneeId ? a.tourneeId === tourneeId : visibles === null || visibles.has(a.tourneeId),
  );

  const reference = positionGPS ?? centreCarte;
  const lignes = liste
    .map((a) => ({
      adresse: a,
      distance: reference ? distanceMetres(reference.lat, reference.lng, a.lat, a.lng) : null,
    }))
    .sort(
      (x, y) =>
        (x.distance ?? Number.MAX_VALUE) - (y.distance ?? Number.MAX_VALUE) ||
        x.adresse.libelle.localeCompare(y.adresse.libelle),
    );

  const faites = liste.filter((a) => a.statut === 'distribue' || a.statut === 'refus').length;

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
          {lignes.map(({ adresse, distance }) => (
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
                {adresse.somme != null && '💶'}
                {adresse.note && '📝'}
              </span>
              <span className="liste-distance">{formatDistance(distance)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
