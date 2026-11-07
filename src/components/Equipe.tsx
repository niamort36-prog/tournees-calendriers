// Écran « Équipe » (admins uniquement) : liste des membres, création de
// comptes SP, rôles, centres, mots de passe. Les opérations sensibles passent
// par la fonction serveur « admin-utilisateurs ».

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { FONCTION_ADMIN } from '../config';
import { useAppStore } from '../store/useAppStore';

interface Membre {
  id: string;
  nom: string;
  email: string;
  role: 'admin' | 'normal';
  centre: string;
  /** Faux tant qu'un administrateur n'a pas validé le compte. */
  approuve: boolean;
}

export default function Equipe({ onFermer }: { onFermer: () => void }) {
  const profil = useAppStore((s) => s.profil);
  const [membres, setMembres] = useState<Membre[]>([]);
  // Faux tant que la base n'a pas reçu la mise à jour n°14 : on n'affiche
  // alors pas les boutons de validation, qui échoueraient.
  const [validationDispo, setValidationDispo] = useState(false);
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
    const { data, error } = await supabase.from('profils').select('*').order('nom');
    if (error) setErreur('Lecture des membres impossible : ' + error.message);
    else {
      const lignes = (data ?? []) as Record<string, unknown>[];
      setValidationDispo(lignes.length > 0 && 'approuve' in lignes[0]);
      setMembres(
        lignes.map((d) => ({
          id: d.id as string,
          nom: d.nom as string,
          email: (d.email as string) ?? '',
          role: d.role as 'admin' | 'normal',
          centre: (d.centre as string) ?? '',
          approuve: d.approuve !== false,
        })),
      );
    }
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
    const { data, error } = await supabase.functions.invoke(FONCTION_ADMIN, { body: corps });
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
      // Un compte créé ici l'est par un administrateur : il est validé d'office
      // (le déclencheur côté base met « en attente » les inscriptions spontanées).
      if (supabase) {
        const { data } = await supabase
          .from('profils')
          .select('id')
          .eq('email', email.trim())
          .maybeSingle();
        if (data?.id) await supabase.from('profils').update({ approuve: true }).eq('id', data.id);
      }
      messages(null, `Compte créé pour ${nom.trim() || email.trim()} ✔`);
      setNom('');
      setEmail('');
      setMdp('');
      setRole('normal');
      await charger();
    }
  };

  const changerMdp = async (cible: Membre) => {
    if (cible.role === 'admin' && cible.id !== profil?.id) {
      const ok = window.confirm(
        `${cible.nom} est administrateur. Lui attribuer un nouveau mot de passe ?` +
          `

Pensez à le lui communiquer : son ancien mot de passe ne fonctionnera plus.`,
      );
      if (!ok) return;
    }
    const err = await appelerFonction({ action: 'mdp', userId: cible.id, mdp: nouveauMdp });
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

        {membres.some((m) => !m.approuve) && (
          <div className="equipe-attente">
            ⚠️ {membres.filter((m) => !m.approuve).length} compte(s) en attente de validation. Tant
            qu'ils ne sont pas validés, ils ne voient aucune tournée ni aucune adresse. Validez
            uniquement les personnes que vous connaissez — supprimez les autres (🗑️).
          </div>
        )}

        <div className="equipe-liste">
          {membres.map((m) => {
            const moi = m.id === profil?.id;
            return (
              <div key={m.id} className={'membre-ligne' + (m.approuve ? '' : ' en-attente')}>
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
                {validationDispo && !moi && (
                  <button
                    className={m.approuve ? '' : 'valider'}
                    title={
                      m.approuve
                        ? `Retirer l'accès à ${m.nom} (le compte est conservé mais ne voit plus rien)`
                        : `Valider le compte de ${m.nom} : il aura accès aux tournées`
                    }
                    onClick={() => {
                      if (
                        m.approuve &&
                        !window.confirm(
                          `Retirer l'accès de « ${m.nom} » ? Son compte restera, mais il ne verra plus aucune tournée.`,
                        )
                      )
                        return;
                      void majMembre(m.id, { approuve: !m.approuve });
                    }}
                  >
                    {m.approuve ? '⛔' : '✅'}
                  </button>
                )}
                <button
                  title={`Changer le mot de passe de ${m.nom}`}
                  onClick={() => {
                    setMdpPour(mdpPour === m.id ? null : m.id);
                    setNouveauMdp('');
                    messages(null, null);
                  }}
                >
                  🔑
                </button>
                {(m.role === 'normal' || !m.approuve) && !moi && (
                  <button className="danger" title="Supprimer le compte" onClick={() => void supprimerMembre(m)}>
                    🗑️
                  </button>
                )}
                {mdpPour === m.id && (
                  <div className="membre-mdp">
                    <input
                      type="text"
                      autoFocus
                      placeholder={`Nouveau mot de passe de ${m.nom}`}
                      value={nouveauMdp}
                      onChange={(e) => setNouveauMdp(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && nouveauMdp.length >= 6) void changerMdp(m);
                      }}
                      minLength={6}
                    />
                    <button disabled={enCours || nouveauMdp.length < 6} onClick={() => void changerMdp(m)}>
                      {enCours ? '…' : 'Valider'}
                    </button>
                    <span className="mdp-aide">
                      {nouveauMdp.length === 0
                        ? '6 caractères minimum'
                        : nouveauMdp.length < 6
                          ? `encore ${6 - nouveauMdp.length} caractère${6 - nouveauMdp.length > 1 ? 's' : ''}`
                          : 'prêt : cliquez sur Valider'}
                    </span>
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
