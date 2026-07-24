// Fenêtre « Synthèse » : grands compteurs, camemberts (statuts des adresses,
// répartition des paiements), barres par tournée, export Excel.

import { useAppStore } from '../store/useAppStore';
import { supabaseActif } from '../lib/supabase';
import { construireFeuilles, exporterExcel, type DonneesExport } from '../lib/exportExcel';
import {
  COULEUR_STATUT,
  LIBELLE_STATUT,
  formatEuros,
  totalDecompte,
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
  const estAdmin = !supabaseActif || profil?.role === 'admin';

  const campagneActive = campagnes.find((c) => c.statut === 'active') ?? null;
  const decomptesCampagne = decomptes.filter((d) => d.campagneId === (campagneActive?.id ?? null));

  const totalCollecte =
    Math.round(decomptesCampagne.reduce((somme, d) => somme + totalDecompte(d).total, 0) * 100) / 100;
  const totalDistribues = adresses
    .filter((a) => a.statut === 'distribue')
    .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
  const nbPoints = adresses.length;
  const nbVus = adresses.filter((a) => a.statut !== 'a_faire').length;
  const avancement = nbPoints > 0 ? Math.round((nbVus / nbPoints) * 100) : 0;
  const restantsStock =
    campagneActive?.calendriersCommandes != null
      ? campagneActive.calendriersCommandes - totalDistribues
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

        {estAdmin && (
          <button className="btn-export" onClick={exporter}>
            📥 Exporter tout en Excel
          </button>
        )}
      </div>
    </div>
  );
}
