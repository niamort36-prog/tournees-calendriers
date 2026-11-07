// Bloc « détail du paiement » : pièces, billets, chèques et carte bancaire.
// Utilisé pour une maison et pour chaque appartement d'un immeuble.

import {
  COUPURES,
  formatEuros,
  paiementNeuf,
  paiementVide,
  totalPaiement,
  type PaiementAdresse,
} from '../types';

export default function DetailPaiement({
  paiement,
  onChange,
  ouvert,
  onBasculer,
  compact = false,
  aide,
}: {
  paiement: PaiementAdresse | null;
  onChange: (suite: PaiementAdresse | null) => void;
  ouvert: boolean;
  onBasculer: () => void;
  /** Version resserrée, pour une ligne d'appartement. */
  compact?: boolean;
  aide?: string;
}) {
  const p = paiement ?? paiementNeuf();

  const appliquer = (suite: PaiementAdresse) => {
    onChange(paiementVide(suite) ? null : suite);
  };

  const changerCoupure = (cle: string, delta: number) => {
    const suivant = Math.max(0, (p.especes[cle] ?? 0) + delta);
    const especes = { ...p.especes };
    if (suivant === 0) delete especes[cle];
    else especes[cle] = suivant;
    appliquer({ ...p, especes });
  };

  return (
    <div className={'fiche-paiement' + (compact ? ' compact' : '')}>
      <button type="button" className="paiement-bascule" onClick={onBasculer}>
        {ouvert ? '▾' : '▸'} 💶 Détail du paiement
        {!ouvert && !paiementVide(paiement) ? ` — ${formatEuros(totalPaiement(paiement))}` : ''}
      </button>

      {ouvert && (
        <>
          <div className="paiement-coupures">
            {COUPURES.map((c) => {
              const n = p.especes[c.cle] ?? 0;
              return (
                <div key={c.cle} className={'coupure' + (n > 0 ? ' prise' : '')}>
                  <span className="coupure-libelle">{c.libelle}</span>
                  <button
                    type="button"
                    aria-label={`Un ${c.libelle} de moins`}
                    disabled={n === 0}
                    onClick={() => changerCoupure(c.cle, -1)}
                  >
                    −
                  </button>
                  <span className="coupure-nombre">{n}</span>
                  <button
                    type="button"
                    aria-label={`Un ${c.libelle} de plus`}
                    onClick={() => changerCoupure(c.cle, 1)}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>

          <div className="paiement-cheques">
            <strong>🧾 Chèques</strong>
            {p.cheques.map((montant, i) => (
              <div key={i} className="cheque-ligne">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="montant"
                  value={montant === 0 ? '' : String(montant)}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(',', '.'));
                    const cheques = [...p.cheques];
                    cheques[i] = Number.isNaN(v) ? 0 : v;
                    appliquer({ ...p, cheques });
                  }}
                />
                <span>€</span>
                <button
                  type="button"
                  aria-label="Retirer ce chèque"
                  onClick={() => appliquer({ ...p, cheques: p.cheques.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="paiement-ajout"
              onClick={() => appliquer({ ...p, cheques: [...p.cheques, 0] })}
            >
              ＋ Ajouter un chèque
            </button>
          </div>

          <label className="paiement-cb">
            💳 Carte bancaire
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={p.cb != null ? String(p.cb) : ''}
              onChange={(e) => {
                const brut = e.target.value.trim().replace(',', '.');
                const v = brut === '' ? null : Number(brut);
                appliquer({ ...p, cb: v === null || Number.isNaN(v) ? null : v });
              }}
            />
            <span>€</span>
          </label>

          <div className="paiement-total">
            Total détaillé : <strong>{formatEuros(totalPaiement(p))}</strong>
          </div>
          {aide && <p className="paiement-aide">{aide}</p>}
        </>
      )}
    </div>
  );
}
