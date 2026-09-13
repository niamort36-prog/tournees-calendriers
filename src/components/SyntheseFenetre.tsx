// Fenêtre « Synthèse » : grands compteurs, camemberts (statuts des adresses,
// répartition des paiements), barres par tournée, export Excel.

import { useEffect, useState } from 'react';
import { estAdminEffectif, useAppStore } from '../store/useAppStore';
import RecapModifications from './RecapModifications';
import { construireFeuilles, exporterExcel, type DonneesExport } from '../lib/exportExcel';
import {
  COULEUR_STATUT,
  LIBELLE_JOURNAL,
  LIBELLE_STATUT,
  formatCoordonnees,
  formatEuros,
  totalDecompte,
  totalCalendriersLots,
  totalMontantLots,
  trierTournees,
  trouverDecompte,
} from '../types';

interface Part {
  libelle: string;
  valeur: number;
  couleur: string;
}

function Camembert({ parts, format }: { parts: Part[]; format?: (v: number) => string }) {
  const total = parts.reduce((somme, p) => somme + p.valeur, 0);
  if (total <= 0) return <p className="campagne-vide">Pas encore de données.</p>;
  const affiche = format ?? ((v: number) => String(v));

  let angle = -Math.PI / 2;
  const arcs = parts
    .filter((p) => p.valeur > 0)
    .map((p) => {
      const portion = p.valeur / total;
      const debut = angle;
      angle += portion * 2 * Math.PI;
      const x1 = 50 + 40 * Math.cos(debut);
      const y1 = 50 + 40 * Math.sin(debut);
      const x2 = 50 + 40 * Math.cos(angle);
      const y2 = 50 + 40 * Math.sin(angle);
      const grand = portion > 0.5 ? 1 : 0;
      const chemin =
        portion >= 0.999
          ? ''
          : `M 50 50 L ${x1} ${y1} A 40 40 0 ${grand} 1 ${x2} ${y2} Z`;
      return { ...p, portion, chemin };
    });

  return (
    <div className="camembert">
      <svg viewBox="0 0 100 100">
        {arcs.map((a) =>
          a.chemin === '' ? (
            <circle key={a.libelle} cx={50} cy={50} r={40} fill={a.couleur} />
          ) : (
            <path key={a.libelle} d={a.chemin} fill={a.couleur} />
          ),
        )}
      </svg>
      <ul className="camembert-legende">
        {arcs.map((a) => (
          <li key={a.libelle}>
            <span className="pastille" style={{ background: a.couleur }} />
            {a.libelle} : <strong>{affiche(a.valeur)}</strong> ({Math.round(a.portion * 100)} %)
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SyntheseFenetre({ onFermer }: { onFermer: () => void }) {
  const tournees = useAppStore((s) => s.tournees);
  const adresses = useAppStore((s) => s.adresses);
  const equipes = useAppStore((s) => s.equipes);
  const decomptes = useAppStore((s) => s.decomptes);
  const campagnes = useAppStore((s) => s.campagnes);
  const annuaire = useAppStore((s) => s.annuaire);
  const profil = useAppStore((s) => s.profil);
  const vueMembre = useAppStore((s) => s.vueMembre);
  const estAdmin = estAdminEffectif(profil, vueMembre);
  const journal = useAppStore((s) => s.journal);
  const [recapOuvert, setRecapOuvert] = useState(false);

  useEffect(() => {
    if (estAdmin) void useAppStore.getState().rafraichirJournal();
  }, [estAdmin]);

  const dateCourte = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  };
  const nomTournee = (id: string | null) => tournees.find((t) => t.id === id)?.nom ?? '—';
  const commentaires = adresses
    .filter((a) => a.note && a.note.trim())
    .sort((a, b) => (b.noteLe ?? b.modifieLe).localeCompare(a.noteLe ?? a.modifieLe));

  const campagneActive = campagnes.find((c) => c.statut === 'active') ?? null;
  const decomptesCampagne = decomptes.filter((d) => d.campagneId === (campagneActive?.id ?? null));

  const lots = campagneActive?.lots ?? [];
  const calendriersLots = totalCalendriersLots(lots);
  const montantLots = totalMontantLots(lots);
  const totalCollecte =
    Math.round(
      (decomptesCampagne.reduce((somme, d) => somme + totalDecompte(d).total, 0) + montantLots) * 100,
    ) / 100;
  const totalDistribues = adresses
    .filter((a) => a.statut === 'distribue')
    .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
  const nbPoints = adresses.length;
  const nbVus = adresses.filter((a) => a.statut !== 'a_faire').length;
  const avancement = nbPoints > 0 ? Math.round((nbVus / nbPoints) * 100) : 0;
  const restantsStock =
    campagneActive?.calendriersCommandes != null
      ? campagneActive.calendriersCommandes - totalDistribues - calendriersLots
      : null;

  const partsStatuts: Part[] = (['a_faire', 'distribue', 'absent', 'refus'] as const).map(
    (statut) => ({
      libelle: LIBELLE_STATUT[statut],
      valeur: adresses.filter((a) => a.statut === statut).length,
      couleur: COULEUR_STATUT[statut],
    }),
  );

  const sommesPaiements = decomptesCampagne.reduce(
    (acc, d) => {
      const t = totalDecompte(d);
      acc.especes += t.especes;
      acc.cheques += t.cheques;
      acc.cb += t.cb;
      return acc;
    },
    { especes: 0, cheques: 0, cb: 0 },
  );
  const partsPaiements: Part[] = [
    { libelle: 'Espèces', valeur: Math.round(sommesPaiements.especes * 100) / 100, couleur: '#2a9d8f' },
    { libelle: 'Chèques', valeur: Math.round(sommesPaiements.cheques * 100) / 100, couleur: '#457b9d' },
    { libelle: 'Carte bancaire', valeur: Math.round(sommesPaiements.cb * 100) / 100, couleur: '#e76f51' },
    { libelle: 'Lots', valeur: montantLots, couleur: '#8338ec' },
  ];

  const barres = trierTournees(tournees).map((t) => {
    const siennes = adresses.filter((a) => a.tourneeId === t.id);
    const distribues = siennes
      .filter((a) => a.statut === 'distribue')
      .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
    const decompte = trouverDecompte(decomptesCampagne, t.id, campagneActive?.id ?? null);
    return {
      tournee: t,
      points: siennes.length,
      vus: siennes.filter((a) => a.statut !== 'a_faire').length,
      distribues,
      collecte: decompte ? totalDecompte(decompte).total : 0,
    };
  });
  const maxCollecte = Math.max(1, ...barres.map((b) => b.collecte));

  const exporter = () => {
    const donnees: DonneesExport = { tournees, adresses, equipes, decomptes, campagnes, annuaire };
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).dernierExport = construireFeuilles(donnees);
    }
    exporterExcel(donnees);
  };

  return (
    <div className="fenetre-voile" onClick={onFermer}>
      <div className="fenetre" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <h2>📊 Synthèse{campagneActive ? ` — Campagne ${campagneActive.nom}` : ''}</h2>
          <button className="panneau-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        <div className="campagne-compteurs">
          {estAdmin && (
            <div className="compteur">
              <span className="compteur-valeur">{formatEuros(totalCollecte)}</span>
              <span className="compteur-libelle">collectés</span>
            </div>
          )}
          <div className="compteur">
            <span className="compteur-valeur">{totalDistribues}</span>
            <span className="compteur-libelle">calendriers distribués</span>
          </div>
          <div className="compteur">
            <span className="compteur-valeur">{avancement} %</span>
            <span className="compteur-libelle">d'avancement</span>
          </div>
          {calendriersLots > 0 && (
            <div className="compteur">
              <span className="compteur-valeur">{calendriersLots}</span>
              <span className="compteur-libelle">donnés en lots</span>
            </div>
          )}
          {estAdmin && (
            <div className="compteur">
              <span className="compteur-valeur">{restantsStock ?? '—'}</span>
              <span className="compteur-libelle">calendriers restants</span>
            </div>
          )}
        </div>

        <div className={estAdmin ? 'synthese-camemberts' : undefined}>
          <div className="synthese-bloc">
            <h3>🏠 Avancement des adresses</h3>
            <Camembert parts={partsStatuts} />
          </div>
          {estAdmin && (
            <div className="synthese-bloc">
              <h3>💶 Répartition de la recette</h3>
              <Camembert parts={partsPaiements} format={formatEuros} />
            </div>
          )}
        </div>

        {lots.length > 0 && (
          <div className="synthese-bloc">
            <h3>📦 Calendriers donnés en lots</h3>
            <table className="historique-table">
              <thead>
                <tr>
                  <th>Bénéficiaire</th>
                  <th>Date</th>
                  <th>Calendriers</th>
                  {estAdmin && <th>Montant</th>}
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td>{lot.libelle || '—'}</td>
                    <td>
                      {lot.date ? new Date(lot.date + 'T12:00:00').toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td>{lot.nombre ?? '—'}</td>
                    {estAdmin && <td>{lot.montant != null ? formatEuros(lot.montant) : '—'}</td>}
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{calendriersLots}</strong>
                  </td>
                  {estAdmin && (
                    <td>
                      <strong>{formatEuros(montantLots)}</strong>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="synthese-bloc">
          <h3>📍 Par tournée</h3>
          {barres.length === 0 && <p className="campagne-vide">Aucune tournée pour l'instant.</p>}
          {barres.map((b) => (
            <div key={b.tournee.id} className="barre-tournee">
              <div className="barre-tournee-entete">
                <span className="pastille" style={{ background: b.tournee.couleur }} />
                <strong>{b.tournee.nom}</strong>
                <span className="barre-tournee-detail">
                  {b.vus}/{b.points} vus · {b.distribues} distribués
                  {estAdmin ? ` · ${formatEuros(b.collecte)}` : ''}
                </span>
              </div>
              <div className="barre-fond">
                <div
                  className="barre-remplissage avancement"
                  style={{ width: `${b.points > 0 ? (b.vus / b.points) * 100 : 0}%` }}
                />
              </div>
              {estAdmin && (
                <div className="barre-fond">
                  <div
                    className="barre-remplissage collecte"
                    style={{ width: `${(b.collecte / maxCollecte) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {estAdmin && (
        <div className="synthese-bloc">
          <h3>📚 Historique par tournée</h3>
          {campagnes.length === 0 ? (
            <p className="campagne-vide">Pas encore de campagne.</p>
          ) : (
            <div className="historique-defilement">
              <table className="historique-table">
                <thead>
                  <tr>
                    <th>Tournée</th>
                    {[...campagnes]
                      .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
                      .map((c) => (
                        <th key={c.id}>
                          {c.nom}
                          {c.statut === 'active' ? ' (en cours)' : ''}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {trierTournees(tournees).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span className="pastille" style={{ background: t.couleur }} /> {t.nom}
                      </td>
                      {[...campagnes]
                        .sort((a, b) => a.creeLe.localeCompare(b.creeLe))
                        .map((c) => {
                          const d = trouverDecompte(decomptes, t.id, c.id);
                          return (
                            <td key={c.id}>
                              {d && d.termine
                                ? `${d.calendriersDistribues ?? '—'} cal. · ${formatEuros(totalDecompte(d).total)}`
                                : '—'}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {estAdmin && commentaires.length > 0 && (
          <div className="synthese-bloc">
            <h3>📝 Commentaires laissés sur les adresses ({commentaires.length})</h3>
            <div className="recap-defilement">
              <table className="historique-table">
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
                      <td className="recap-commentaire">{a.note}</td>
                      <td>{dateCourte(a.noteLe ?? a.modifieLe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {estAdmin && (
          <div className="synthese-bloc">
            <h3>🛠️ Interventions sur les adresses ({journal.length})</h3>
            {journal.length === 0 ? (
              <p className="campagne-vide">
                Aucune intervention enregistrée pour le moment. Les ajouts, suppressions,
                renommages et déplacements d’adresses apparaîtront ici.
              </p>
            ) : (
              <div className="recap-defilement">
                <table className="historique-table">
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
                        <td>{dateCourte(e.quand)}</td>
                        <td>
                          {LIBELLE_JOURNAL[e.type]}
                          {e.detail && <div className="recap-detail">{e.detail}</div>}
                        </td>
                        <td>{e.libelle}</td>
                        <td>{e.tourneeNom || nomTournee(e.tourneeId)}</td>
                        <td>{formatCoordonnees(e.lat, e.lng)}</td>
                        <td>{e.auteurNom || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {estAdmin && (
          <button className="btn-recap" onClick={() => setRecapOuvert(true)}>
            🖨️ Imprimer le récapitulatif (commentaires et interventions)
          </button>
        )}

        {estAdmin && (
          <button className="btn-export" onClick={exporter}>
            📥 Exporter tout en Excel
          </button>
        )}

        {recapOuvert && <RecapModifications onFermer={() => setRecapOuvert(false)} />}
      </div>
    </div>
  );
}
