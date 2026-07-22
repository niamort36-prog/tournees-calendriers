// Fiche d'une adresse (panneau bas, pensé pour le téléphone) : gros boutons de
// statut, saisie rapide somme / calendriers laissés, rappel, note, et petites
// actions (renommer, déplacer, supprimer).

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  COULEUR_STATUT,
  LIBELLE_STATUT,
  statutAgrege,
  type Appartement,
  type StatutAdresse,
} from '../types';

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
];

function isoVersLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localVersIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function FicheAdresse() {
  const adresse = useAppStore((s) => s.adresses.find((a) => a.id === s.adresseOuverteId));
  const [somme, setSomme] = useState('');
  const [calendriers, setCalendriers] = useState('');
  const [note, setNote] = useState('');
  const [rappel, setRappel] = useState('');
  const [renommage, setRenommage] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');

  useEffect(() => {
    if (!adresse) return;
    setSomme(adresse.somme != null ? String(adresse.somme) : '');
    setCalendriers(adresse.calendriersLaisses != null ? String(adresse.calendriersLaisses) : '');
    setNote(adresse.note ?? '');
    setRappel(isoVersLocal(adresse.rappelLe));
    setRenommage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse?.id]);

  if (!adresse) return null;
  const s = useAppStore.getState;
  const nbGroupe = 1 + adresse.autresAdresses.length;
  const estImmeuble = adresse.typeBatiment === 'immeuble';

  const majAppartements = (liste: Appartement[]) => {
    const distribues = liste.filter((a) => a.statut === 'distribue').length;
    void s().majAdresse(adresse.id, {
      appartements: liste,
      statut: statutAgrege(liste),
      calendriersLaisses: distribues > 0 ? distribues : null,
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

  const validerSomme = () => {
    const brut = somme.trim().replace(',', '.');
    const valeur = brut === '' ? null : Number(brut);
    if (valeur === null || !Number.isNaN(valeur)) {
      void s().majAdresse(adresse.id, { somme: valeur });
    }
  };

  const validerCalendriers = () => {
    const valeur = calendriers.trim() === '' ? null : Math.max(0, Math.trunc(Number(calendriers)));
    if (valeur === null || !Number.isNaN(valeur)) {
      void s().majAdresse(adresse.id, { calendriersLaisses: valeur });
    }
  };

  const validerNote = () => {
    const valeur = note.trim() === '' ? null : note.trim();
    if (valeur !== (adresse.note ?? null)) void s().majAdresse(adresse.id, { note: valeur });
  };

  const validerRappel = (valeur: string) => {
    setRappel(valeur);
    void s().majAdresse(adresse.id, { rappelLe: localVersIso(valeur) });
  };

  return (
    <div className="fiche-voile" onClick={() => s().fermerAdresse()}>
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
          <button className="fiche-fermer" onClick={() => s().fermerAdresse()}>
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
                {adresse.appartements.length} appartements traités — statut d'ensemble :{' '}
                <strong style={{ color: COULEUR_STATUT[adresse.statut] }}>
                  {LIBELLE_STATUT[adresse.statut]}
                </strong>
              </div>
            )}
            {adresse.appartements.map((app) => (
              <div key={app.id} className="appartement-ligne">
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
            {ORDRE_STATUTS.map(({ valeur, libelle }) => {
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

        {adresse.statut === 'distribue' && (
          <div className="fiche-champs">
            <label>
              Somme (€) <span className="facultatif">facultatif</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex. 10"
                value={somme}
                onChange={(e) => setSomme(e.target.value)}
                onBlur={validerSomme}
              />
            </label>
            <label>
              Calendriers laissés
              <input
                type="number"
                min={0}
                placeholder="1"
                value={calendriers}
                onChange={(e) => setCalendriers(e.target.value)}
                onBlur={validerCalendriers}
              />
            </label>
          </div>
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
          <textarea
            rows={2}
            placeholder="ex. sonnette cassée, passer après 18 h, motif du refus…"
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
              s().fermerAdresse();
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
