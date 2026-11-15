// Bloc « détail du paiement » : pièces, billets, chèques et carte bancaire.
// Utilisé pour une maison et pour chaque appartement d'un immeuble.

import { useEffect, useState } from 'react';
import {
  COUPURES,
  formatEuros,
  paiementNeuf,
  paiementVide,
  totalPaiement,
  type PaiementAdresse,
} from '../types';

/** Lit un montant tapé : null si la case est vide, undefined si ce n'est pas un nombre. */
function lireMontant(texte: string): number | null | undefined {
  const brut = texte.trim().replace(',', '.');
  if (brut === '') return null;
  const n = Number(brut);
  return Number.isNaN(n) || n < 0 ? undefined : n;
}

/**
 * Case de montant où l'on peut taper une virgule.
 *
 * Avant, la case réaffichait à chaque frappe le nombre déjà compris : en
 * tapant « 12,50 », la virgule disparaissait aussitôt (« 12, » vaut 12) et l'on
 * obtenait 1250. Ici la case garde le texte tel qu'il est tapé et ne transmet
 * que le nombre qu'il représente.
 *
 * `zeroSiVide` : pour un chèque, une case vide vaut 0 (et 0 s'affiche vide).
 */
function ChampMontant({
  valeur,
  onValeur,
  placeholder,
  zeroSiVide = false,
}: {
  valeur: number | null;
  onValeur: (v: number | null) => void;
  placeholder: string;
  zeroSiVide?: boolean;
}) {
  const normaliser = (v: number | null | undefined) => (zeroSiVide ? (v ?? 0) : (v ?? null));
  const enTexte = (v: number | null) =>
    v == null || (zeroSiVide && v === 0) ? '' : String(v).replace('.', ',');
  const [texte, setTexte] = useState(() => enTexte(valeur));

  // La valeur a changé ailleurs (collègue, ligne retirée) : la case suit.
  useEffect(() => {
    const lu = lireMontant(texte);
    if (lu === undefined || normaliser(lu) !== normaliser(valeur)) setTexte(enTexte(valeur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur]);

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={texte}
      onChange={(e) => {
        const suite = e.target.value;
        setTexte(suite);
        const lu = lireMontant(suite);
        // texte incomplet (« 12, ») ou identique : rien à transmettre
        if (lu !== undefined && normaliser(lu) !== normaliser(valeur)) onValeur(lu);
      }}
    />
  );
}

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
                <ChampMontant
                  placeholder="montant"
                  zeroSiVide
                  valeur={montant}
                  onValeur={(v) => {
                    const cheques = [...p.cheques];
                    cheques[i] = v ?? 0;
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
            <ChampMontant
              placeholder="0"
              valeur={p.cb ?? null}
              onValeur={(v) => appliquer({ ...p, cb: v })}
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
