// Fin de tournée : contrôle des adresses restantes, participants,
// demi-journées (avec la voiture utilisée), décompte espèces / chèques / CB
// avec total automatique, validation avec numéro de reçu.

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { COUPURES, LIBELLE_MOMENT, formatEuros, type Seance } from '../types';

const entier = (v: string) => {
  const n = Math.trunc(Number(v.trim()));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const decimal = (v: string) => {
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export default function DecompteFenetre({
  tourneeId,
  onFermer,
}: {
  tourneeId: string;
  onFermer: () => void;
}) {
  const [decompteId, setDecompteId] = useState<string | null>(null);
  useEffect(() => {
    void useAppStore.getState().obtenirOuCreerDecompte(tourneeId).then(setDecompteId);
  }, [tourneeId]);

  const decompte = useAppStore((s) => s.decomptes.find((d) => d.id === decompteId));
  const tournee = useAppStore((s) => s.tournees.find((t) => t.id === tourneeId));
  const adresses = useAppStore((s) => s.adresses);
  const annuaire = useAppStore((s) => s.annuaire);

  const [especes, setEspeces] = useState<Record<string, string>>({});
  const [cheques, setCheques] = useState<{ nombre: string; montant: string }[]>([]);
  const [cb, setCb] = useState('');
  const [calendriers, setCalendriers] = useState('');

  useEffect(() => {
    if (!decompte) return;
    const e: Record<string, string> = {};
    for (const c of COUPURES) {
      e[c.cle] = decompte.especes[c.cle] != null ? String(decompte.especes[c.cle]) : '';
    }
    setEspeces(e);
    setCheques(
      decompte.cheques.map((l) => ({
        nombre: l.nombre != null ? String(l.nombre) : '',
        montant: l.montant != null ? String(l.montant) : '',
      })),
    );
    setCb(decompte.cb != null ? String(decompte.cb) : '');
    setCalendriers(decompte.calendriersDistribues != null ? String(decompte.calendriersDistribues) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decompte?.id]);

  if (!decompte || !tournee) return null;
  const s = useAppStore.getState;
  const fige = decompte.termine;

  const adressesTournee = adresses.filter((a) => a.tourneeId === tourneeId);
  const restantsAFaire = adressesTournee.filter((a) => a.statut === 'a_faire').length;
  const aRepasser = adressesTournee.filter((a) => a.statut === 'absent').length;
  const distribuesAuto = adressesTournee
    .filter((a) => a.statut === 'distribue')
    .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
  const sommesSaisies = adressesTournee.reduce((somme, a) => somme + (a.somme ?? 0), 0);

  const totEspeces = COUPURES.reduce((somme, c) => somme + entier(especes[c.cle] ?? '') * c.valeur, 0);
  const totCheques = cheques.reduce((somme, l) => somme + entier(l.nombre) * decimal(l.montant), 0);
  const totCb = decimal(cb);
  const total = Math.round((totEspeces + totCheques + totCb) * 100) / 100;

  const commitEspeces = () => {
    const resultat: Record<string, number | null> = {};
    for (const c of COUPURES) {
      const brut = (especes[c.cle] ?? '').trim();
      resultat[c.cle] = brut === '' ? null : entier(brut);
    }
    void s().majDecompte(decompte.id, { especes: resultat });
  };

  const commitCheques = (lignes: { nombre: string; montant: string }[]) => {
    setCheques(lignes);
    void s().majDecompte(decompte.id, {
      cheques: lignes
        .filter((l) => l.nombre.trim() !== '' || l.montant.trim() !== '')
        .map((l) => ({
          nombre: l.nombre.trim() === '' ? null : entier(l.nombre),
          montant: l.montant.trim() === '' ? null : decimal(l.montant),
        })),
    });
  };

  const majSeance = (index: number, patch: Partial<Seance>) => {
    const seances = decompte.seances.map((x, i) => (i === index ? { ...x, ...patch } : x));
    void s().majDecompte(decompte.id, { seances });
  };

  const participants = decompte.participants
    .map((id) => annuaire.find((p) => p.id === id))
    .filter((p) => p !== undefined);
  const disponibles = annuaire.filter((p) => !decompte.participants.includes(p.id));

  const valider = () => {
    const message =
      restantsAFaire + aRepasser > 0
        ? `⚠️ Il reste ${restantsAFaire} adresse(s) à faire et ${aRepasser} à repasser.\n\nTerminer la tournée quand même ?`
        : 'Valider la fin de tournée ? Le décompte recevra un numéro de reçu.';
    if (window.confirm(message)) void s().validerFinTournee(decompte.id);
  };

  return (
    <div className="fenetre-voile" onClick={onFermer}>
      <div className="fenetre" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <h2>🏁 Fin de tournée — {tournee.nom}</h2>
          <button className="panneau-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        {fige ? (
          <div className="controle ok">
            ✅ Tournée terminée le{' '}
            {decompte.termineLe ? new Date(decompte.termineLe).toLocaleDateString('fr-FR') : '—'} —{' '}
            <strong>Reçu n°{decompte.numeroRecu}</strong>
            <button className="btn-rouvrir" onClick={() => void s().rouvrirDecompte(decompte.id)}>
              Rouvrir
            </button>
          </div>
        ) : restantsAFaire + aRepasser > 0 ? (
          <div className="controle attention">
            ⚠️ Il reste <strong>{restantsAFaire}</strong> adresse{restantsAFaire > 1 ? 's' : ''} à faire
            et <strong>{aRepasser}</strong> à repasser.
          </div>
        ) : (
          <div className="controle ok">🎉 Toutes les adresses ont été vues !</div>
        )}

        <div className="decompte-section">
          <h3>👥 Participants</h3>
          <div className="equipe-membres">
            {participants.map((p) => (
              <span key={p.id} className="membre-chip">
                {p.nom}
                {!fige && (
                  <button
                    title="Retirer"
                    onClick={() =>
                      void s().majDecompte(decompte.id, {
                        participants: decompte.participants.filter((x) => x !== p.id),
                      })
                    }
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {!fige && disponibles.length > 0 && (
              <select
                className="membre-ajout"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    void s().majDecompte(decompte.id, {
                      participants: [...decompte.participants, e.target.value],
                    });
                  }
                }}
              >
                <option value="">➕ Ajouter…</option>
                {disponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="decompte-section">
          <h3>🗓️ Demi-journées effectuées</h3>
          {decompte.seances.map((seance, i) => (
            <div key={i} className="seance-ligne">
              <input
                type="date"
                value={seance.date}
                disabled={fige}
                onChange={(e) => majSeance(i, { date: e.target.value })}
              />
              <select
                value={seance.moment}
                disabled={fige}
                onChange={(e) => majSeance(i, { moment: e.target.value as Seance['moment'] })}
              >
                {Object.entries(LIBELLE_MOMENT).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
              <select
                value={seance.voitureProfilId ?? ''}
                disabled={fige}
                title="Voiture utilisée"
                onChange={(e) => majSeance(i, { voitureProfilId: e.target.value || null })}
              >
                <option value="">🚗 Voiture : —</option>
                {annuaire.map((p) => (
                  <option key={p.id} value={p.id}>
                    🚗 {p.nom}
                  </option>
                ))}
              </select>
              {!fige && (
                <button
                  className="danger"
                  onClick={() =>
                    void s().majDecompte(decompte.id, {
                      seances: decompte.seances.filter((_, j) => j !== i),
                    })
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!fige && (
            <button
              className="btn-ajout-ligne"
              onClick={() =>
                void s().majDecompte(decompte.id, {
                  seances: [
                    ...decompte.seances,
                    {
                      date: new Date().toISOString().slice(0, 10),
                      moment: 'apres_midi',
                      voitureProfilId: null,
                    },
                  ],
                })
              }
            >
              ➕ Ajouter une demi-journée
            </button>
          )}
        </div>

        <div className="decompte-section">
          <h3>📆 Calendriers distribués</h3>
          <div className="decompte-calendriers">
            <input
              type="number"
              min={0}
              placeholder={String(distribuesAuto)}
              value={calendriers}
              disabled={fige}
              onChange={(e) => setCalendriers(e.target.value)}
              onBlur={() =>
                void s().majDecompte(decompte.id, {
                  calendriersDistribues: calendriers.trim() === '' ? null : entier(calendriers),
                })
              }
            />
            <span className="decompte-reference">compté automatiquement : {distribuesAuto}</span>
          </div>
        </div>

        <div className="decompte-section">
          <h3>💰 Espèces</h3>
          <div className="especes-grille">
            {COUPURES.map((c) => (
              <div key={c.cle} className="espece-ligne">
                <span>{c.libelle}</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={especes[c.cle] ?? ''}
                  disabled={fige}
                  onChange={(e) => setEspeces({ ...especes, [c.cle]: e.target.value })}
                  onBlur={commitEspeces}
                />
                <span className="espece-sous-total">
                  {formatEuros(entier(especes[c.cle] ?? '') * c.valeur)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="decompte-section">
          <h3>🖊️ Chèques</h3>
          {cheques.map((ligne, i) => (
            <div key={i} className="cheque-ligne">
              <input
                type="number"
                min={0}
                placeholder="Nombre"
                value={ligne.nombre}
                disabled={fige}
                onChange={(e) =>
                  setCheques(cheques.map((l, j) => (j === i ? { ...l, nombre: e.target.value } : l)))
                }
                onBlur={() => commitCheques(cheques)}
              />
              <span>chèque(s) de</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Montant"
                value={ligne.montant}
                disabled={fige}
                onChange={(e) =>
                  setCheques(cheques.map((l, j) => (j === i ? { ...l, montant: e.target.value } : l)))
                }
                onBlur={() => commitCheques(cheques)}
              />
              <span>€ = {formatEuros(entier(ligne.nombre) * decimal(ligne.montant))}</span>
              {!fige && (
                <button className="danger" onClick={() => commitCheques(cheques.filter((_, j) => j !== i))}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {!fige && (
            <button
              className="btn-ajout-ligne"
              onClick={() => setCheques([...cheques, { nombre: '', montant: '' }])}
            >
              ➕ Ajouter des chèques
            </button>
          )}
        </div>

        <div className="decompte-section">
          <h3>💳 Carte bancaire</h3>
          <div className="decompte-calendriers">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Montant total CB (€)"
              value={cb}
              disabled={fige}
              onChange={(e) => setCb(e.target.value)}
              onBlur={() =>
                void s().majDecompte(decompte.id, { cb: cb.trim() === '' ? null : decimal(cb) })
              }
            />
          </div>
        </div>

        <div className="decompte-totaux">
          <div className="decompte-sous-totaux">
            💰 {formatEuros(Math.round(totEspeces * 100) / 100)} · 🖊️{' '}
            {formatEuros(Math.round(totCheques * 100) / 100)} · 💳 {formatEuros(totCb)}
          </div>
          <div className="decompte-total">TOTAL : {formatEuros(total)}</div>
          {sommesSaisies > 0 && (
            <div className="decompte-reference">
              pour information, sommes notées en tournée : {formatEuros(Math.round(sommesSaisies * 100) / 100)}
            </div>
          )}
        </div>

        {!fige && (
          <button className="btn-valider-fin" onClick={valider}>
            ✅ Valider la fin de tournée
          </button>
        )}
      </div>
    </div>
  );
}
