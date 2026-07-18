// Fenêtre « Campagne » : création, calendriers commandés, taille des paquets,
// compteurs de distribution et archivage de fin de campagne.

import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { supabaseActif } from '../lib/supabase';

export default function CampagneFenetre({ onFermer }: { onFermer: () => void }) {
  const profil = useAppStore((s) => s.profil);
  const campagnes = useAppStore((s) => s.campagnes);
  const adresses = useAppStore((s) => s.adresses);
  const [nom, setNom] = useState(String(new Date().getFullYear() + 1));

  const estAdmin = !supabaseActif || profil?.role === 'admin';
  const active = campagnes.find((c) => c.statut === 'active');
  const archivees = campagnes
    .filter((c) => c.statut === 'archivee')
    .sort((a, b) => (b.archiveeLe ?? '').localeCompare(a.archiveeLe ?? ''));

  const distribues = adresses
    .filter((a) => a.statut === 'distribue')
    .reduce((n, a) => n + (a.calendriersLaisses ?? 1), 0);
  const restants =
    active?.calendriersCommandes != null ? active.calendriersCommandes - distribues : null;

  const s = useAppStore.getState;

  const creer = (e: FormEvent) => {
    e.preventDefault();
    void s().creerCampagne(nom);
  };

  const archiver = () => {
    if (!active) return;
    const ok = window.confirm(
      `Archiver la campagne « ${active.nom} » ?\n\n` +
        `• Les statuts et sommes de toutes les adresses sont photographiés dans les archives\n` +
        `• « Distribués l'an dernier » est mis à jour sur chaque tournée\n` +
        `• Tous les pings repassent en gris « à faire » (le statut de cette année reste visible dans chaque adresse)\n\n` +
        `Cette action prépare la campagne suivante.`,
    );
    if (ok) void s().archiverCampagne(active.id);
  };

  return (
    <div className="fenetre-voile" onClick={onFermer}>
      <div className="fenetre" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <h2>📅 Campagne</h2>
          <button className="panneau-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        {active ? (
          <div className="campagne-active">
            <div className="campagne-titre">
              Campagne en cours : <strong>{active.nom}</strong>
            </div>

            <div className="campagne-champs">
              <label>
                Calendriers commandés
                <input
                  type="number"
                  min={0}
                  disabled={!estAdmin}
                  value={active.calendriersCommandes ?? ''}
                  onChange={(e) =>
                    void s().majCampagne(active.id, {
                      calendriersCommandes: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Livrés par paquets de
                <input
                  type="number"
                  min={1}
                  disabled={!estAdmin}
                  value={active.taillePaquet ?? ''}
                  onChange={(e) =>
                    void s().majCampagne(active.id, {
                      taillePaquet: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>

            <div className="campagne-compteurs">
              <div className="compteur">
                <span className="compteur-valeur">{active.calendriersCommandes ?? '—'}</span>
                <span className="compteur-libelle">commandés</span>
              </div>
              <div className="compteur">
                <span className="compteur-valeur">{distribues}</span>
                <span className="compteur-libelle">distribués</span>
              </div>
              <div className="compteur">
                <span className="compteur-valeur">{restants ?? '—'}</span>
                <span className="compteur-libelle">restants</span>
              </div>
            </div>

            {estAdmin && (
              <div className="campagne-archivage">
                <button className="btn-archiver" onClick={archiver}>
                  📦 Archiver la campagne
                </button>
                <p>
                  À faire une fois la distribution terminée : les compteurs sont archivés et
                  toutes les adresses repassent « à faire » pour l'année suivante.
                </p>
              </div>
            )}
          </div>
        ) : estAdmin ? (
          <form className="campagne-creation" onSubmit={creer}>
            <p>Aucune campagne en cours. Crée celle de l'année :</p>
            <div className="campagne-creation-ligne">
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="ex. 2026"
                required
              />
              <button type="submit">Créer la campagne</button>
            </div>
          </form>
        ) : (
          <p className="campagne-vide">Aucune campagne en cours pour le moment.</p>
        )}

        {archivees.length > 0 && (
          <div className="campagne-archives">
            <h3>Campagnes archivées</h3>
            {archivees.map((c) => (
              <div key={c.id} className="campagne-archivee">
                📦 {c.nom}
                <span>
                  archivée le{' '}
                  {c.archiveeLe ? new Date(c.archiveeLe).toLocaleDateString('fr-FR') : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
