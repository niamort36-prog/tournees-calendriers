// Panneau latéral : liste des tournées avec leurs infos et actions.

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import DecompteFenetre from './DecompteFenetre';
import { formatEuros, totalDecompte, trouverDecompte, type Tournee } from '../types';

function CarteTournee({ tournee, onDecompte }: { tournee: Tournee; onDecompte: () => void }) {
  const adresses = useAppStore((s) => s.adresses);
  const selectionTourneeId = useAppStore((s) => s.selectionTourneeId);
  const campagneActive = useAppStore((s) => s.campagnes.find((c) => c.statut === 'active'));
  const equipes = useAppStore((s) => s.equipes);
  const annuaire = useAppStore((s) => s.annuaire);
  const profil = useAppStore((s) => s.profil);
  const [nom, setNom] = useState(tournee.nom);
  const [dispo, setDispo] = useState(tournee.dispoConseillee);
  useEffect(() => setNom(tournee.nom), [tournee.nom]);
  useEffect(() => setDispo(tournee.dispoConseillee), [tournee.dispoConseillee]);

  const points = adresses.filter((a) => a.tourneeId === tournee.id);
  const nbCalendriers = points.reduce((n, a) => n + 1 + a.autresAdresses.length, 0);
  const selectionnee = selectionTourneeId === tournee.id;
  const s = useAppStore.getState;

  // combien de calendriers prendre en début de tournée (arrondi au paquet)
  const base = tournee.calendriersAnneeDerniere ?? nbCalendriers;
  const taille = campagneActive?.taillePaquet ?? null;
  const paquets = taille && base > 0 ? Math.ceil(base / taille) : null;

  const equipesIci = equipes.filter((e) => e.tourneeId === tournee.id);
  const maTournee = profil !== null && equipesIci.some((e) => e.membres.includes(profil.id));

  const decomptes = useAppStore((st) => st.decomptes);
  const decompteIci = trouverDecompte(decomptes, tournee.id, campagneActive?.id ?? null);

  return (
    <div
      className={'tournee-carte' + (selectionnee ? ' selectionnee' : '')}
      style={{ borderLeftColor: tournee.couleur }}
      onClick={() => s().selectionnerTournee(tournee.id)}
    >
      <div className="tournee-entete">
        <span className="pastille" style={{ background: tournee.couleur }} />
        {maTournee && <span className="badge-ma-tournee">⭐</span>}
        <input
          className="tournee-nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onBlur={() => {
            if (nom.trim() && nom !== tournee.nom) void s().majTournee(tournee.id, { nom: nom.trim() });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <div className="tournee-stats">
        📍 {points.length} point{points.length > 1 ? 's' : ''} · ≈ {nbCalendriers} calendrier
        {nbCalendriers > 1 ? 's' : ''}
      </div>
      {paquets !== null && taille && (
        <div className="tournee-a-prendre">
          🎒 À prendre : {paquets} paquet{paquets > 1 ? 's' : ''} de {taille} ={' '}
          {paquets * taille} calendriers
        </div>
      )}
      {equipesIci.map((e) => {
        const noms = e.membres
          .map((id) => annuaire.find((p) => p.id === id)?.nom)
          .filter(Boolean)
          .join(', ');
        return (
          <div key={e.id} className="tournee-equipe">
            🧑‍🚒 <strong>{e.nom}</strong>
            {noms ? ` — ${noms}` : ''}
          </div>
        );
      })}
      {decompteIci?.termine && (
        <div className="tournee-decompte">
          💶 <strong>{formatEuros(totalDecompte(decompteIci).total)}</strong> · Reçu n°
          {decompteIci.numeroRecu}
        </div>
      )}
      <label className="tournee-champ">
        Dispo conseillée
        <input
          value={dispo}
          placeholder="ex. 2 équipes, 3 soirées"
          onChange={(e) => setDispo(e.target.value)}
          onBlur={() => {
            if (dispo !== tournee.dispoConseillee) void s().majTournee(tournee.id, { dispoConseillee: dispo });
          }}
        />
      </label>
      <label className="tournee-champ">
        Distribués l'an dernier
        <input
          type="number"
          min={0}
          value={tournee.calendriersAnneeDerniere ?? ''}
          onChange={(e) =>
            void s().majTournee(tournee.id, {
              calendriersAnneeDerniere: e.target.value === '' ? null : Number(e.target.value),
            })
          }
        />
      </label>
      <div className="tournee-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            s().selectionnerTournee(tournee.id);
            s().cadrerSur({ type: 'zone', points: tournee.polygone });
          }}
        >
          🎯 Voir
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            s().selectionnerTournee(tournee.id);
            s().activerModeAjout(true);
          }}
        >
          ➕ Adresse
        </button>
        <button
          title="Fin de tournée / décompte"
          onClick={(e) => {
            e.stopPropagation();
            onDecompte();
          }}
        >
          {decompteIci?.termine ? '💶' : '🏁'}
        </button>
        <button
          className="danger"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Supprimer la tournée « ${tournee.nom} » et toutes ses adresses ?`)) {
              void s().supprimerTournee(tournee.id);
            }
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const tournees = useAppStore((s) => s.tournees);
  const [decompteTourneeId, setDecompteTourneeId] = useState<string | null>(null);
  return (
    <aside className={'panneau' + (ouvert ? ' ouvert' : '')}>
      <div className="panneau-entete">
        <h2>Mes tournées</h2>
        <button className="panneau-fermer" onClick={onFermer} title="Fermer le panneau">
          ✕
        </button>
      </div>
      <div className="panneau-corps">
        {tournees.length === 0 ? (
          <div className="panneau-vide">
            <p>🗺️ Aucune tournée pour l'instant.</p>
            <p>
              Cherchez votre commune dans la barre du haut, puis dessinez la zone d'une tournée avec
              l'outil <strong>polygone</strong> (en haut à gauche de la carte).
            </p>
            <p>Les adresses de la zone apparaîtront automatiquement ✨</p>
          </div>
        ) : (
          tournees.map((t) => (
            <CarteTournee key={t.id} tournee={t} onDecompte={() => setDecompteTourneeId(t.id)} />
          ))
        )}
      </div>
      <div className="panneau-note">Données partagées : chaque modification est enregistrée et synchronisée.</div>
      {decompteTourneeId && (
        <DecompteFenetre tourneeId={decompteTourneeId} onFermer={() => setDecompteTourneeId(null)} />
      )}
    </aside>
  );
}
