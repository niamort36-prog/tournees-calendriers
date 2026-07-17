// Écran « Équipe » (admins uniquement) : liste des membres, création de
// comptes SP, rôles, centres, mots de passe. Les opérations sensibles passent
// par la fonction serveur « admin-utilisateurs ».

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

interface Membre {
  id: string;
  nom: string;
  email: string;
  role: 'admin' | 'normal';
  centre: string;
}

export default function Equipe({ onFermer }: { onFermer: () => void }) {
  const profil = useAppStore((s) => s.profil);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [role, setRole] = useState<'normal' | 'admin'>('normal');
  const [centre, setCentre] = useState('');

  const [mdpPour, setMdpPour] = useState<string | null>(null);
  const [nouveauMdp, setNouveauMdp] = useState('');

  const charger = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profils')
      .select('id, nom, email, role, centre')
      .order('nom');
    if (error) setErreur('Lecture des membres impossible : ' + error.message);
    else setMembres((data ?? []) as Membre[]);
  };

  useEffect(() => {
    void charger();
  }, []);

  const messages = (e: string | null, i: string | null) => {
    setErreur(e);
    setInfo(i);
  };

  const appelerFonction = async (corps: Record<string, unknown>): Promise<string | null> => {
    if (!supabase) return "La base partagée n'est pas configurée.";
    setEnCours(true);
    const { data, error } = await supabase.functions.invoke('admin-utilisateurs', { body: corps });
    setEnCours(false);
    if (error) return "Fonction d'administration injoignable — est-elle bien déployée dans Supabase ?";
    if (data?.erreur) return String(data.erreur);
    return null;
  };

  const ajouterMembre = async (e: FormEvent) => {
    e.preventDefault();
    const err = await appelerFonction({
      action: 'creer',
      email: email.trim(),
      mdp,
      nom: nom.trim(),
      role,
      centre: centre.trim(),
    });
    if (err) {
      messages(err, null);
    } else {
      messages(null, `Compte créé pour ${nom.trim() || email.trim()} ✔`);
      setNom('');
      setEmail('');
      setMdp('');
      setRole('normal');
      await charger();
    }
  };

  const changerMdp = async () => {
    const err = await appelerFonction({ action: 'mdp', userId: mdpPour, mdp: nouveauMdp });
    if (err) {
      messages(err, null);
    } else {
      messages(null, 'Mot de passe modifié ✔');
      setMdpPour(null);
      setNouveauMdp('');
    }
  };

  const supprimerMembre = async (m: Membre) => {
    if (!window.confirm(`Supprimer le compte de « ${m.nom} » (${m.email}) ?`)) return;
    const err = await appelerFonction({ action: 'supprimer', userId: m.id });
    if (err) messages(err, null);
    else {
      messages(null, 'Compte supprimé ✔');
      await charger();
    }
  };

  const majMembre = async (id: string, patch: Partial<Membre>) => {
    if (!supabase) return;
    const { error } = await supabase.from('profils').update(patch).eq('id', id);
    if (error) messages('Modification impossible : ' + error.message, null);
    await charger();
  };

  const centresExistants = [...new Set(membres.map((m) => m.centre).filter(Boolean))];

  return (
    <div className="fenetre-voile" onClick={onFermer}>
      <div className="fenetre" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <h2>👥 Équipe</h2>
          <button className="panneau-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        <form className="equipe-ajout" onSubmit={ajouterMembre}>
          <strong>➕ Ajouter un sapeur-pompier</strong>
          <div className="equipe-ajout-grille">
            <input placeholder="Nom / prénom" value={nom} onChange={(e) => setNom(e.target.value)} required />
            <input
              type="email"
              placeholder="E-mail de connexion"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Mot de passe initial (6 min.)"
              value={mdp}
              onChange={(e) => setMdp(e.target.value)}
              minLength={6}
              required
            />
            <input
              placeholder="Centre de secours"
              value={centre}
              onChange={(e) => setCentre(e.target.value)}
              list="liste-centres"
            />
            <datalist id="liste-centres">
              {centresExistants.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value as 'normal' | 'admin')}>
              <option value="normal">Rôle : Normal</option>
              <option value="admin">Rôle : Admin</option>
            </select>
            <button type="submit" disabled={enCours}>
              {enCours ? '…' : 'Créer le compte'}
            </button>
          </div>
          <p className="equipe-note">
            Communiquez l'e-mail et le mot de passe initial au SP : il pourra se connecter immédiatement.
          </p>
        </form>

        {erreur && <div className="connexion-erreur">⚠️ {erreur}</div>}
        {info && <div className="connexion-info">✅ {info}</div>}

        <div className="equipe-liste">
          {membres.map((m) => {
            const moi = m.id === profil?.id;
            return (
              <div key={m.id} className="membre-ligne">
                <div className="membre-infos">
                  <input
                    className="membre-nom"
                    defaultValue={m.nom}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== m.nom)
                        void majMembre(m.id, { nom: e.target.value.trim() });
                    }}
                  />
                  <span className="membre-email">{m.email}</span>
                </div>
                <input
                  className="membre-centre"
                  placeholder="Centre"
                  defaultValue={m.centre}
                  list="liste-centres"
                  onBlur={(e) => {
                    if (e.target.value !== m.centre) void majMembre(m.id, { centre: e.target.value.trim() });
                  }}
                />
                <select
                  value={m.role}
                  disabled={moi}
                  title={moi ? 'On ne change pas son propre rôle' : 'Rôle'}
                  onChange={(e) => void majMembre(m.id, { role: e.target.value as 'admin' | 'normal' })}
                >
                  <option value="normal">Normal</option>
                  <option value="admin">Admin</option>
                </select>
                {(m.role === 'normal' || moi) && (
                  <button title="Changer le mot de passe" onClick={() => { setMdpPour(mdpPour === m.id ? null : m.id); setNouveauMdp(''); }}>
                    🔑
                  </button>
                )}
                {m.role === 'normal' && !moi && (
                  <button className="danger" title="Supprimer le compte" onClick={() => void supprimerMembre(m)}>
                    🗑️
                  </button>
                )}
                {mdpPour === m.id && (
                  <div className="membre-mdp">
                    <input
                      type="text"
                      placeholder="Nouveau mot de passe (6 min.)"
                      value={nouveauMdp}
                      onChange={(e) => setNouveauMdp(e.target.value)}
                      minLength={6}
                    />
                    <button disabled={enCours || nouveauMdp.length < 6} onClick={() => void changerMdp()}>
                      Valider
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
