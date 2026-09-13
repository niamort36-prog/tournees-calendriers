// Récapitulatif administrateur, prêt à imprimer : les commentaires laissés sur
// les adresses et le journal des interventions (ajouts, suppressions,
// renommages, déplacements).

import { useAppStore } from '../store/useAppStore';
import { LIBELLE_JOURNAL, formatCoordonnees } from '../types';

function dateHeure(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function RecapModifications({ onFermer }: { onFermer: () => void }) {
  const adresses = useAppStore((s) => s.adresses);
  const tournees = useAppStore((s) => s.tournees);
  const journal = useAppStore((s) => s.journal);
  const campagne = useAppStore((s) => s.campagnes.find((c) => c.statut === 'active'));
  const profil = useAppStore((s) => s.profil);

  const nomTournee = (id: string | null) =>
    tournees.find((t) => t.id === id)?.nom ?? '—';

  const commentaires = adresses
    .filter((a) => a.note && a.note.trim())
    .sort((a, b) => (b.noteLe ?? b.modifieLe).localeCompare(a.noteLe ?? a.modifieLe));

  return (
    <div className="recu-voile" onClick={onFermer}>
      <div className="recu-conteneur" onClick={(e) => e.stopPropagation()}>
        <div className="recu-outils no-print">
          <button className="btn-imprimer" onClick={() => window.print()}>
            🖨️ Imprimer / enregistrer en PDF
          </button>
          <button onClick={onFermer}>Fermer</button>
        </div>

        <div className="recu-imprimable">
          <header className="recu-entete">
            <div className="recu-logo">🚒</div>
            <div className="recu-titre">
              <h1>Récapitulatif des adresses</h1>
              {profil?.centre && <p>{profil.centre}</p>}
              <p>
                Commentaires et interventions
                {campagne ? ` — Campagne ${campagne.nom}` : ''}
              </p>
            </div>
            <div className="recu-numero">
              ÉDITÉ LE
              <strong>{new Date().toLocaleDateString('fr-FR')}</strong>
            </div>
          </header>

          <div className="recu-bloc">
            <h2>Commentaires laissés sur les adresses ({commentaires.length})</h2>
            {commentaires.length === 0 ? (
              <p className="recap-vide">Aucun commentaire pour le moment.</p>
            ) : (
              <table className="recu-decompte recap-table">
                <thead>
                  <tr>
                    <th>Tournée</th>
                    <th>Adresse</th>
                    <th>Commentaire</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {commentaires.map((a) => (
                    <tr key={a.id}>
                      <td>{nomTournee(a.tourneeId)}</td>
                      <td>
                        {a.libelle}
                        {a.commune ? `, ${a.commune}` : ''}
                      </td>
                      <td>{a.note}</td>
                      <td className="recap-date">{dateHeure(a.noteLe ?? a.modifieLe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="recu-bloc">
            <h2>Interventions sur les adresses ({journal.length})</h2>
            {journal.length === 0 ? (
              <p className="recap-vide">Aucune intervention enregistrée pour le moment.</p>
            ) : (
              <table className="recu-decompte recap-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Intervention</th>
                    <th>Adresse</th>
                    <th>Tournée</th>
                    <th>Coordonnées</th>
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.map((e) => (
                    <tr key={e.id}>
                      <td className="recap-date">{dateHeure(e.quand)}</td>
                      <td>
                        {LIBELLE_JOURNAL[e.type]}
                        {e.detail && <div className="recap-detail">{e.detail}</div>}
                      </td>
                      <td>{e.libelle}</td>
                      <td>{e.tourneeNom || nomTournee(e.tourneeId)}</td>
                      <td className="recap-date">{formatCoordonnees(e.lat, e.lng)}</td>
                      <td>{e.auteurNom || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
