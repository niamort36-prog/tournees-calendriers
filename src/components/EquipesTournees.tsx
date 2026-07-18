// Fenêtre « Équipes » : composition des équipes à partir des comptes SP et
// attribution aux tournées. Lecture pour tous, modification par les admins.

import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { supabaseActif } from '../lib/supabase';
import type { Equipe } from '../types';

function CarteEquipe({ equipe, estAdmin }: { equipe: Equipe; estAdmin: boolean }) {
  const tournees = useAppStore((s) => s.tournees);
  const annuaire = useAppStore((s) => s.annuaire);
  const [nom, setNom] = useState(equipe.nom);
  useEffect(() => setNom(equipe.nom), [equipe.nom]);

  const s = useAppStore.getState;
  const membres = equipe.membres
    .map((id) => annuaire.find((p) => p.id === id))
    .filter((p) => p !== undefined);
  const disponibles = annuaire.filter((p) => !equipe.membres.includes(p.id));

  return (
    <div className="equipe-tournee-carte">
      <div className="equipe-tournee-entete">
        <span className="equipe-icone">🧑‍🚒</span>
        <input
          className="tournee-nom"
          value={nom}
          disabled={!estAdmin}
          onChange={(e) => setNom(e.target.value)}
          onBlur={() => {
            if (nom.trim() && nom !== equipe.nom) void s().majEquipe(equipe.id, { nom: nom.trim() });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <select
          value={equipe.tourneeId ?? ''}
          disabled={!estAdmin}
          onChange={(e) => void s().majEquipe(equipe.id, { tourneeId: e.target.value || null })}
        >
          <option value="">— pas de tournée —</option>
          {tournees.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>
        {estAdmin && (
          <button
            className="danger"
            title="Supprimer l'équipe"
            onClick={() => {
              if (window.confirm(`Supprimer l'équipe « ${equipe.nom} » ?`)) {
                void s().supprimerEquipe(equipe.id);
              }
            }}
          >
            🗑️
          </button>
        )}
      </div>

      <div className="equipe-membres">
        {membres.length === 0 && <span className="equipe-vide-note">Aucun membre pour l'instant.</span>}
        {membres.map((p) => (
          <span key={p.id} className="membre-chip">
            {p.nom}
            {estAdmin && (
              <button
                title="Retirer de l'équipe"
                onClick={() =>
                  void s().majEquipe(equipe.id, { membres: equipe.membres.filter((m) => m !== p.id) })
                }
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {estAdmin && disponibles.length > 0 && (
          <select
            className="membre-ajout"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                void s().majEquipe(equipe.id, { membres: [...equipe.membres, e.target.value] });
              }
            }}
          >
            <option value="">➕ Ajouter un membre…</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
                {p.centre ? ` (${p.centre})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default function EquipesTournees({ onFermer }: { onFermer: () => void }) {
  const profil = useAppStore((s) => s.profil);
  const equipes = useAppStore((s) => s.equipes);
  const [nom, setNom] = useState('');
  const estAdmin = !supabaseActif || profil?.role === 'admin';

  useEffect(() => {
    void useAppStore.getState().rafraichirAnnuaire();
  }, []);

  const creer = (e: FormEvent) => {
    e.preventDefault();
    void useAppStore.getState().creerEquipe(nom);
    setNom('');
  };

  return (
    <div className="fenetre-voile" onClick={onFermer}>
      <div className="fenetre" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <h2>🚒 Équipes de tournée</h2>
          <button className="panneau-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        {estAdmin && (
          <form className="equipe-creation" onSubmit={creer}>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom de la nouvelle équipe (ex. Équipe 1)"
              required
            />
            <button type="submit">Créer l'équipe</button>
          </form>
        )}

        {equipes.length === 0 ? (
          <p className="campagne-vide">
            Aucune équipe pour l'instant.
            {estAdmin ? ' Crée la première ci-dessus, puis ajoute des membres et attribue une tournée.' : ''}
          </p>
        ) : (
          equipes.map((e) => <CarteEquipe key={e.id} equipe={e} estAdmin={estAdmin} />)
        )}

        <p className="equipe-note">
          Les membres concernés voient leur affectation changer en direct sur leur appareil.
        </p>
      </div>
    </div>
  );
}
