// Écran de connexion / création de compte (affiché quand Supabase est actif).

import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function Login() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnCours(true);
    const s = useAppStore.getState();
    const message =
      mode === 'connexion'
        ? await s.connexion(email.trim(), mdp)
        : await s.inscription(email.trim(), mdp, nom.trim() || email.split('@')[0]);
    setEnCours(false);
    if (message) {
      setErreur(message);
    } else if (mode === 'inscription' && !useAppStore.getState().session) {
      setInfo('Compte créé ! Vérifiez votre boîte mail si une confirmation est demandée, puis connectez-vous.');
      setMode('connexion');
    }
  };

  return (
    <div className="ecran-connexion">
      <form className="carte-connexion" onSubmit={soumettre}>
        <div className="connexion-logo">🚒</div>
        <h1>Tournées Calendriers</h1>
        <p className="connexion-sous-titre">Amicale des Sapeurs-Pompiers</p>

        <div className="connexion-onglets">
          <button
            type="button"
            className={mode === 'connexion' ? 'actif' : ''}
            onClick={() => { setMode('connexion'); setErreur(null); }}
          >
            Se connecter
          </button>
          <button
            type="button"
            className={mode === 'inscription' ? 'actif' : ''}
            onClick={() => { setMode('inscription'); setErreur(null); }}
          >
            Créer un compte
          </button>
        </div>

        {mode === 'inscription' && (
          <label>
            Nom / prénom
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Martin Dupont" />
          </label>
        )}
        <label>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.fr"
            autoComplete="username"
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            required
            minLength={6}
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
            placeholder="6 caractères minimum"
            autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
          />
        </label>

        {erreur && <div className="connexion-erreur">⚠️ {erreur}</div>}
        {info && <div className="connexion-info">✅ {info}</div>}

        <button type="submit" className="connexion-valider" disabled={enCours}>
          {enCours ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer le compte'}
        </button>

        {mode === 'inscription' && (
          <p className="connexion-note">Le premier compte créé devient automatiquement administrateur.</p>
        )}
      </form>
    </div>
  );
}
