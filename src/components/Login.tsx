// Écran de connexion (affiché quand Supabase est actif).
//
// Il n'y a volontairement PAS de création de compte ici : n'importe qui
// pouvait sinon s'inscrire et voir aussitôt toutes les tournées et toutes
// les adresses de l'amicale. Les comptes sont créés par un administrateur
// dans la fenêtre « 👥 Membres ».

import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function Login() {
  const avisConnexion = useAppStore((s) => s.avisConnexion);
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const message = await useAppStore.getState().connexion(email.trim(), mdp);
    setEnCours(false);
    if (message) setErreur(message);
  };

  return (
    <div className="ecran-connexion">
      <form className="carte-connexion" onSubmit={soumettre}>
        <div className="connexion-logo">🚒</div>
        <h1>Tournées Calendriers</h1>
        <p className="connexion-sous-titre">Amicale des Sapeurs-Pompiers</p>

        {avisConnexion && <div className="connexion-erreur">⚠️ {avisConnexion}</div>}

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
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
            placeholder="votre mot de passe"
            autoComplete="current-password"
          />
        </label>

        {erreur && <div className="connexion-erreur">⚠️ {erreur}</div>}

        <button type="submit" className="connexion-valider" disabled={enCours}>
          {enCours ? '…' : 'Se connecter'}
        </button>

        <p className="connexion-note">
          Pas encore de compte ? Demandez à un responsable de l'amicale de vous en créer un.
        </p>
      </form>
    </div>
  );
}
