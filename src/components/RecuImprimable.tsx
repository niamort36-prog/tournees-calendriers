// Reçu de fin de tournée, prêt à imprimer (ou enregistrer en PDF via la
// boîte d'impression du navigateur). Récapitule : tournée, participants,
// voitures par demi-journée, détail par coupure, chèques, CB et total.

import { useAppStore } from '../store/useAppStore';
import { COUPURES, LIBELLE_MOMENT, formatEuros, totalDecompte } from '../types';

export default function RecuImprimable({
  decompteId,
  onFermer,
}: {
  decompteId: string;
  onFermer: () => void;
}) {
  const decompte = useAppStore((s) => s.decomptes.find((d) => d.id === decompteId));
  const tournee = useAppStore((s) => s.tournees.find((t) => t.id === decompte?.tourneeId));
  const campagne = useAppStore((s) => s.campagnes.find((c) => c.id === decompte?.campagneId));
  const annuaire = useAppStore((s) => s.annuaire);
  const profil = useAppStore((s) => s.profil);

  if (!decompte || !tournee) return null;

  const totaux = totalDecompte(decompte);
  const nomDe = (id: string) => annuaire.find((p) => p.id === id)?.nom ?? '—';
  const participants = decompte.participants.map(nomDe).join(', ');
  const centre = profil?.centre ?? '';

  const lignesEspeces = COUPURES.map((c) => ({
    libelle: c.libelle,
    nombre: decompte.especes[c.cle] ?? 0,
    montant: (decompte.especes[c.cle] ?? 0) * c.valeur,
  })).filter((l) => l.nombre > 0);

  const lignesCheques = decompte.cheques.filter((l) => (l.nombre ?? 0) > 0 && (l.montant ?? 0) > 0);

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
              <h1>Amicale des Sapeurs-Pompiers</h1>
              {centre && <p>{centre}</p>}
              <p>Tournée des calendriers{campagne ? ` — Campagne ${campagne.nom}` : ''}</p>
            </div>
            <div className="recu-numero">
              REÇU
              <strong>N° {decompte.numeroRecu ?? '—'}</strong>
            </div>
          </header>

          <table className="recu-infos">
            <tbody>
              <tr>
                <th>Tournée</th>
                <td>{tournee.nom}</td>
                <th>Clôturée le</th>
                <td>
                  {decompte.termineLe
                    ? new Date(decompte.termineLe).toLocaleDateString('fr-FR')
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>Participants</th>
                <td colSpan={3}>{participants || '—'}</td>
              </tr>
              <tr>
                <th>Calendriers distribués</th>
                <td colSpan={3}>{decompte.calendriersDistribues ?? '—'}</td>
              </tr>
            </tbody>
          </table>

          {decompte.seances.length > 0 && (
            <div className="recu-bloc">
              <h2>Demi-journées et voitures</h2>
              <ul>
                {decompte.seances.map((seance, i) => (
                  <li key={i}>
                    {new Date(seance.date + 'T12:00:00').toLocaleDateString('fr-FR')} —{' '}
                    {LIBELLE_MOMENT[seance.moment]}
                    {seance.voitureProfilId ? ` — voiture de ${nomDe(seance.voitureProfilId)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="recu-bloc">
            <h2>Décompte de la recette</h2>
            <table className="recu-decompte">
              <thead>
                <tr>
                  <th>Détail</th>
                  <th>Nombre</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {lignesEspeces.map((l) => (
                  <tr key={l.libelle}>
                    <td>{l.libelle}</td>
                    <td>{l.nombre}</td>
                    <td>{formatEuros(l.montant)}</td>
                  </tr>
                ))}
                <tr className="recu-sous-total">
                  <td colSpan={2}>Sous-total espèces</td>
                  <td>{formatEuros(totaux.especes)}</td>
                </tr>
                {lignesCheques.map((l, i) => (
                  <tr key={i}>
                    <td>Chèque(s) de {formatEuros(l.montant ?? 0)}</td>
                    <td>{l.nombre}</td>
                    <td>{formatEuros((l.nombre ?? 0) * (l.montant ?? 0))}</td>
                  </tr>
                ))}
                <tr className="recu-sous-total">
                  <td colSpan={2}>Sous-total chèques</td>
                  <td>{formatEuros(totaux.cheques)}</td>
                </tr>
                <tr>
                  <td colSpan={2}>Carte bancaire</td>
                  <td>{formatEuros(totaux.cb)}</td>
                </tr>
                <tr className="recu-total">
                  <td colSpan={2}>TOTAL</td>
                  <td>{formatEuros(totaux.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer className="recu-signatures">
            <div>
              <p>Le responsable de la tournée</p>
              <div className="recu-signature-zone" />
            </div>
            <div>
              <p>Le trésorier de l'amicale</p>
              <div className="recu-signature-zone" />
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
