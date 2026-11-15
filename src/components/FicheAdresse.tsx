// Fiche d'une adresse (panneau bas, pensé pour le téléphone) : gros boutons de
// statut, saisie rapide somme / calendriers laissés, rappel, note, et petites
// actions (renommer, déplacer, supprimer).

import { useEffect, useRef, useState } from 'react';
import { peutVoirRecette, useAppStore } from '../store/useAppStore';
import {
  COULEUR_STATUT,
  LIBELLE_STATUT,
  calendriersImmeuble,
  statutAgrege,
  STATUTS_PERMANENTS,
  formatEuros,
  paiementVide,
  sommeImmeuble,
  totalPaiement,
  type PaiementAdresse,
  type Appartement,
  type StatutAdresse,
} from '../types';
import { statutsEtendusDisponibles } from '../lib/horloge';
import { colonneDisponible } from '../lib/capacites';
import DetailPaiement from './DetailPaiement';

const PASTILLES_STATUT: { valeur: StatutAdresse; symbole: string; titre: string }[] = [
  { valeur: 'a_faire', symbole: '○', titre: 'À faire' },
  { valeur: 'distribue', symbole: '✓', titre: 'Distribué' },
  { valeur: 'absent', symbole: '↺', titre: 'Absent, à repasser' },
  { valeur: 'refus', symbole: '✕', titre: 'Refus' },
];

const ORDRE_STATUTS: { valeur: StatutAdresse; libelle: string }[] = [
  { valeur: 'a_faire', libelle: 'À faire' },
  { valeur: 'distribue', libelle: 'Distribué ✔' },
  { valeur: 'absent', libelle: 'Absent, à repasser' },
  { valeur: 'refus', libelle: 'Refus' },
  { valeur: 'inhabite', libelle: 'Inhabité' },
  { valeur: 'secondaire', libelle: 'Maison secondaire' },
];

function isoVersLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Fait quitter la case en cours de saisie, ce qui l'enregistre.
 *
 * Les cases « Somme », « Calendriers », « Note », étage et numéro
 * s'enregistrent quand on en sort. Or sur iPhone, toucher ✕ ou le fond gris
 * ne fait PAS sortir de la case : la fiche se fermait et ce qui venait d'être
 * tapé était perdu. On en sort donc nous-mêmes avant de fermer.
 */
function quitterLaCase(): void {
  const actif = document.activeElement;
  if (actif instanceof HTMLElement && actif !== document.body) actif.blur();
}

function localVersIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function FicheAdresse() {
  const adresse = useAppStore((s) => s.adresses.find((a) => a.id === s.adresseOuverteId));
  const campagneActive = useAppStore((s) => s.campagnes.find((c) => c.statut === 'active'));
  const profil = useAppStore((s) => s.profil);
  const equipes = useAppStore((s) => s.equipes);
  const vueMembre = useAppStore((s) => s.vueMembre);
  const [somme, setSomme] = useState('');
  const [calendriers, setCalendriers] = useState('');
  const [note, setNote] = useState('');
  const [rappel, setRappel] = useState('');
  const [renommage, setRenommage] = useState(false);
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [appartOuvert, setAppartOuvert] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState('');

  const champSomme = useRef<HTMLInputElement>(null);
  const champCalendriers = useRef<HTMLInputElement>(null);
  const champNote = useRef<HTMLTextAreaElement>(null);
  const enSaisie = (champ: { current: HTMLElement | null }) =>
    champ.current !== null && document.activeElement === champ.current;

  useEffect(() => {
    if (!adresse) return;
    setRenommage(false);
    setDetailOuvert(!paiementVide(adresse.paiement));
    setAppartOuvert(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse?.id]);

  // Les cases suivent la fiche. Si un collègue modifie la somme ou la note
  // pendant que la fiche est ouverte, ou si le détail du paiement / les
  // appartements recalculent la somme, la case se met à jour — sauf celle où
  // l'on est en train d'écrire. Avant, la case gardait l'ancienne valeur et
  // la réenregistrait par-dessus celle du collègue en la quittant.
  useEffect(() => {
    if (!adresse || enSaisie(champSomme)) return;
    setSomme(adresse.somme != null ? String(adresse.somme) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse?.id, adresse?.somme]);
  useEffect(() => {
    if (!adresse || enSaisie(champCalendriers)) return;
    setCalendriers(adresse.calendriersLaisses != null ? String(adresse.calendriersLaisses) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse?.id, adresse?.calendriersLaisses]);
  useEffect(() => {
    if (!adresse || enSaisie(champNote)) return;
    setNote(adresse.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse?.id, adresse?.note]);
  useEffect(() => {
    if (!adresse) return;
    setRappel(isoVersLocal(adresse.rappelLe));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse?.id, adresse?.rappelLe]);

  // Téléphone verrouillé ou autre application au premier plan : on enregistre
  // la case en cours, au cas où le système fermerait l'application derrière.
  const ouverte = adresse !== undefined;
  // (toujours la version à jour de la fonction définie plus bas)
  const enregistrerCases = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!ouverte) return;
    const surMasquage = () => {
      if (!document.hidden) return;
      enregistrerCases.current();
      quitterLaCase();
    };
    document.addEventListener('visibilitychange', surMasquage);
    return () => document.removeEventListener('visibilitychange', surMasquage);
  }, [ouverte]);

  if (!adresse) return null;
  const s = useAppStore.getState;
  // L'argent reste dans la tournée : les sommes reçues ne s'affichent que pour
  // les personnes associées à cette tournée et pour les administrateurs.
  const voitSommes = peutVoirRecette(profil, equipes, adresse.tourneeId, vueMembre);
  const nbGroupe = 1 + adresse.autresAdresses.length;
  const estImmeuble = adresse.typeBatiment === 'immeuble';

  const majAppartements = (liste: Appartement[]) => {
    const total = calendriersImmeuble(liste);
    // la somme de l'immeuble est le cumul des appartements détaillés
    const encaisse = sommeImmeuble(liste);
    const detaille = liste.some((a) => !paiementVide(a.paiement ?? null));
    void s().majAdresse(adresse.id, {
      appartements: liste,
      statut: statutAgrege(liste),
      calendriersLaisses: total > 0 ? total : null,
      ...(detaille ? { somme: encaisse } : {}),
    });
  };

  const changerType = (type: 'maison' | 'immeuble') => {
    if (type === adresse.typeBatiment) return;
    const patch: Partial<typeof adresse> = { typeBatiment: type };
    if (type === 'immeuble' && adresse.appartements.length > 0) {
      patch.statut = statutAgrege(adresse.appartements);
    }
    void s().majAdresse(adresse.id, patch);
  };

  // La fiche telle qu'elle est À L'INSTANT dans l'application (et non telle
  // qu'elle était au dernier affichage) : c'est à elle que l'on compare avant
  // d'écrire.
  const courante = () => s().adresses.find((a) => a.id === adresse.id) ?? adresse;

  // (on n'écrit que si la valeur a réellement changé : entrer puis sortir
  //  d'une case ne doit pas dater la fiche d'« à l'instant » et écraser ce
  //  qu'un collègue vient de noter sur la même adresse)
  const validerSomme = () => {
    const brut = somme.trim().replace(',', '.');
    const valeur = brut === '' ? null : Number(brut);
    if ((valeur === null || !Number.isNaN(valeur)) && valeur !== (courante().somme ?? null)) {
      void s().majAdresse(adresse.id, { somme: valeur });
    }
  };

  // Détail du paiement : pièces, billets, chèques, carte.
  // La somme se recalcule toute seule à partir du détail (on peut toujours la
  // corriger à la main en repliant le détail).
  const detailDisponible = colonneDisponible('paiement');

  const validerCalendriers = () => {
    const valeur = calendriers.trim() === '' ? null : Math.max(0, Math.trunc(Number(calendriers)));
    if (
      (valeur === null || !Number.isNaN(valeur)) &&
      valeur !== (courante().calendriersLaisses ?? null)
    ) {
      void s().majAdresse(adresse.id, { calendriersLaisses: valeur });
    }
  };

  const validerNote = () => {
    const valeur = note.trim() === '' ? null : note.trim();
    if (valeur !== (courante().note ?? null)) void s().majAdresse(adresse.id, { note: valeur });
  };

  // Enregistre ce qui a été tapé dans les trois cases sans attendre qu'on en
  // sorte. Sans effet si rien n'a changé.
  enregistrerCases.current = () => {
    if (adresse.statut === 'distribue') {
      if (voitSommes && champSomme.current && !champSomme.current.readOnly) validerSomme();
      if (champCalendriers.current) validerCalendriers();
    }
    validerNote();
  };

  const fermer = () => {
    enregistrerCases.current();
    quitterLaCase(); // étage et numéro d'un appartement
    s().fermerAdresse();
  };

  const validerRappel = (valeur: string) => {
    setRappel(valeur);
    void s().majAdresse(adresse.id, { rappelLe: localVersIso(valeur) });
  };

  return (
    <div className="fiche-voile" onClick={fermer}>
      <div className="fiche" onClick={(e) => e.stopPropagation()}>
        <div className="fiche-poignee" />

        <div className="fiche-entete">
          {renommage ? (
            <div className="fiche-renommage">
              <input
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void s().renommerAdresse(adresse.id, nouveauNom);
                    setRenommage(false);
                  }
                }}
                autoFocus
              />
              <button
                onClick={() => {
                  void s().renommerAdresse(adresse.id, nouveauNom);
                  setRenommage(false);
                }}
              >
                OK
              </button>
            </div>
          ) : (
            <div className="fiche-titre">{adresse.libelle}</div>
          )}
          <button className="fiche-fermer" onClick={fermer}>
            ✕
          </button>
        </div>

        <div className="fiche-sous-titre">
          {`${adresse.codePostal} ${adresse.commune}`.trim()}
          {nbGroupe > 1 && <span className="fiche-groupe"> · 🏢 {nbGroupe} adresses</span>}
        </div>

        {adresse.statutPrecedent && (
          <div className="fiche-precedent">🕘 L'an dernier : {LIBELLE_STATUT[adresse.statutPrecedent]}</div>
        )}

        <div className="fiche-type">
          <button
            className={!estImmeuble ? 'actif' : ''}
            onClick={() => changerType('maison')}
          >
            🏠 Maison
          </button>
          <button
            className={estImmeuble ? 'actif' : ''}
            onClick={() => changerType('immeuble')}
          >
            🏢 Immeuble
          </button>
        </div>

        {estImmeuble ? (
          <div className="appartements">
            {adresse.appartements.length > 0 && (
              <div className="appartements-resume">
                {adresse.appartements.filter((a) => a.statut !== 'a_faire').length}/
                {adresse.appartements.length} appartements traités
                {calendriersImmeuble(adresse.appartements) > 0 &&
                  ` — ${calendriersImmeuble(adresse.appartements)} calendrier${
                    calendriersImmeuble(adresse.appartements) > 1 ? 's' : ''
                  }`}
                {voitSommes &&
                  sommeImmeuble(adresse.appartements) > 0 &&
                  ` — ${formatEuros(sommeImmeuble(adresse.appartements))}`}{' '}
                — statut d'ensemble :{' '}
                <strong style={{ color: COULEUR_STATUT[adresse.statut] }}>
                  {LIBELLE_STATUT[adresse.statut]}
                </strong>
              </div>
            )}
            {adresse.appartements.map((app) => (
              <div key={app.id} className="appartement-bloc">
              <div className="appartement-ligne">
                <input
                  placeholder="Étage"
                  defaultValue={app.etage}
                  onBlur={(e) => {
                    if (e.target.value !== app.etage) {
                      majAppartements(
                        adresse.appartements.map((x) =>
                          x.id === app.id ? { ...x, etage: e.target.value.trim() } : x,
                        ),
                      );
                    }
                  }}
                />
                <input
                  placeholder="N° / porte"
                  defaultValue={app.numero}
                  onBlur={(e) => {
                    if (e.target.value !== app.numero) {
                      majAppartements(
                        adresse.appartements.map((x) =>
                          x.id === app.id ? { ...x, numero: e.target.value.trim() } : x,
                        ),
                      );
                    }
                  }}
                />
                <div className="appartement-statuts">
                  {PASTILLES_STATUT.map(({ valeur, symbole, titre }) => {
                    const actif = app.statut === valeur;
                    return (
                      <button
                        key={valeur}
                        title={titre}
                        className={'pastille-statut' + (actif ? ' actif' : '')}
                        style={
                          actif
                            ? { background: COULEUR_STATUT[valeur], borderColor: COULEUR_STATUT[valeur] }
                            : { color: COULEUR_STATUT[valeur], borderColor: COULEUR_STATUT[valeur] }
                        }
                        onClick={() =>
                          majAppartements(
                            adresse.appartements.map((x) =>
                              x.id === app.id ? { ...x, statut: valeur } : x,
                            ),
                          )
                        }
                      >
                        {symbole}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="appartement-retirer"
                  title="Retirer cet appartement"
                  onClick={() => majAppartements(adresse.appartements.filter((x) => x.id !== app.id))}
                >
                  ✕
                </button>
              </div>
              {app.statut === 'distribue' && (
                <label className="appartement-calendriers">
                  Calendriers pris
                  <input
                    type="number"
                    min={0}
                    placeholder="1"
                    value={app.calendriers ?? ''}
                    onChange={(e) => {
                      const brut = e.target.value.trim();
                      const valeur = brut === '' ? null : Math.max(0, Math.trunc(Number(brut)));
                      if (valeur !== null && Number.isNaN(valeur)) return;
                      majAppartements(
                        adresse.appartements.map((x) =>
                          x.id === app.id ? { ...x, calendriers: valeur } : x,
                        ),
                      );
                    }}
                  />
                </label>
              )}
              {app.statut === 'distribue' && voitSommes && (
                <DetailPaiement
                  compact
                  paiement={app.paiement ?? null}
                  ouvert={appartOuvert === app.id}
                  onBasculer={() => setAppartOuvert((o) => (o === app.id ? null : app.id))}
                  onChange={(suite) =>
                    majAppartements(
                      adresse.appartements.map((x) =>
                        x.id === app.id ? { ...x, paiement: suite } : x,
                      ),
                    )
                  }
                />
              )}
              </div>
            ))}
            <button
              className="btn-ajout-ligne"
              onClick={() =>
                majAppartements([
                  ...adresse.appartements,
                  { id: crypto.randomUUID(), etage: '', numero: '', statut: 'a_faire' },
                ])
              }
            >
              ➕ Ajouter un appartement
            </button>
          </div>
        ) : (
          <div className="fiche-statuts">
            {ORDRE_STATUTS.filter(
              ({ valeur }) => !STATUTS_PERMANENTS.includes(valeur) || statutsEtendusDisponibles(),
            ).map(({ valeur, libelle }) => {
              const actif = adresse.statut === valeur;
              return (
                <button
                  key={valeur}
                  className={'statut-bouton' + (actif ? ' actif' : '')}
                  style={
                    actif
                      ? { background: COULEUR_STATUT[valeur], borderColor: COULEUR_STATUT[valeur] }
                      : { color: COULEUR_STATUT[valeur], borderColor: COULEUR_STATUT[valeur] }
                  }
                  onClick={() => void s().majAdresse(adresse.id, { statut: valeur })}
                >
                  {libelle}
                </button>
              );
            })}
          </div>
        )}

        {adresse.statut === 'distribue' && !voitSommes && (
          <p className="fiche-sommes-cachees">
            🔒 Les sommes de cette tournée ne sont visibles que par son équipe et par les
            administrateurs.
          </p>
        )}

        {adresse.statut === 'distribue' && (
          <div className={'fiche-champs' + (voitSommes ? '' : ' une-colonne')}>
            {voitSommes && (
              <label>
                Somme (€) <span className="facultatif">facultatif</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="ex. 10"
                  ref={champSomme}
                  value={somme}
                  readOnly={
                    (detailDisponible && detailOuvert && !paiementVide(adresse.paiement)) ||
                    (estImmeuble &&
                      adresse.appartements.some((a) => !paiementVide(a.paiement ?? null)))
                  }
                  onChange={(e) => setSomme(e.target.value)}
                  onBlur={validerSomme}
                />
              </label>
            )}
            <label>
              Calendriers laissés
              <input
                type="number"
                min={0}
                placeholder="1"
                ref={champCalendriers}
                value={calendriers}
                onChange={(e) => setCalendriers(e.target.value)}
                onBlur={validerCalendriers}
              />
            </label>
          </div>
        )}

        {adresse.statut === 'distribue' && !estImmeuble && detailDisponible && voitSommes && (
          <DetailPaiement
            paiement={adresse.paiement}
            ouvert={detailOuvert}
            onBasculer={() => setDetailOuvert((o) => !o)}
            onChange={(suite) => {
              setSomme(suite ? String(totalPaiement(suite)) : '');
              void s().majAdresse(adresse.id, {
                paiement: suite,
                ...(suite ? { somme: totalPaiement(suite) } : {}),
              });
            }}
            aide="Ce détail sert à pré-remplir le décompte de fin de tournée. Le comptage réel reste modifiable et c'est lui qui fait foi sur le reçu."
          />
        )}

        {adresse.statut === 'absent' && (
          <div className="fiche-champs">
            <label>
              ⏰ Rappel <span className="facultatif">facultatif</span>
              <input type="datetime-local" value={rappel} onChange={(e) => validerRappel(e.target.value)} />
            </label>
          </div>
        )}

        <label className="fiche-note">
          📝 Note
          {adresse.noteLe && (
            <span className="note-date">
              {(() => {
                const d = new Date(adresse.noteLe);
                const texte = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR');
                const dAvant =
                  campagneActive != null && Date.parse(adresse.noteLe) < Date.parse(campagneActive.creeLe);
                return dAvant ? `🕘 écrite le ${texte}, campagne précédente` : `écrite le ${texte}`;
              })()}
            </span>
          )}
          <textarea
            rows={2}
            placeholder="ex. sonnette cassée, passer après 18 h, motif du refus…"
            ref={champNote}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={validerNote}
          />
        </label>

        <div className="fiche-actions">
          <button
            onClick={() => {
              setNouveauNom(adresse.libelle);
              setRenommage(true);
            }}
          >
            ✏️ Renommer
          </button>
          <button
            onClick={() => {
              fermer();
              s().commencerDeplacement(adresse.id);
            }}
          >
            📍 Déplacer
          </button>
          <button
            className="danger"
            onClick={() => {
              if (window.confirm(`Supprimer « ${adresse.libelle} » ?`)) {
                s().fermerAdresse();
                void s().supprimerAdresse(adresse.id);
              }
            }}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
