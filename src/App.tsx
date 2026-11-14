import { useEffect, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import Login from './components/Login';
import Equipe from './components/Equipe';
import CampagneFenetre from './components/Campagne';
import EquipesTournees from './components/EquipesTournees';
import FicheAdresse from './components/FicheAdresse';
import ListeAdresses from './components/ListeAdresses';
import SyntheseFenetre from './components/SyntheseFenetre';
import { useAppStore } from './store/useAppStore';
import { supabaseActif } from './lib/supabase';
import { demanderPermission, permissionADemander } from './lib/notifications';

export default function App() {
  const [panneauOuvert, setPanneauOuvert] = useState(true);
  const [boussoleOuverte, setBoussoleOuverte] = useState(false);
  const [equipeOuverte, setEquipeOuverte] = useState(false);
  const [campagneOuverte, setCampagneOuverte] = useState(false);
  const [equipesOuvertes, setEquipesOuvertes] = useState(false);
  const [syntheseOuverte, setSyntheseOuverte] = useState(false);
  const campagneActive = useAppStore((s) => s.campagnes.find((c) => c.statut === 'active'));
  const notification = useAppStore((s) => s.notification);
  const vueListe = useAppStore((s) => s.vueListe);
  const gpsActif = useAppStore((s) => s.gpsActif);
  const fondSatellite = useAppStore((s) => s.fondSatellite);
  const orientation = useAppStore((s) => s.orientation);
  const vueMembre = useAppStore((s) => s.vueMembre);
  const enAttente = useAppStore((s) => s.enAttente);
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine);
  const [proposerNotifs, setProposerNotifs] = useState(
    () => permissionADemander() && localStorage.getItem('notifs-proposees') !== '1',
  );
  const pret = useAppStore((s) => s.pret);
  const session = useAppStore((s) => s.session);
  const profil = useAppStore((s) => s.profil);
  const estAdminReel = profil?.role === 'admin';
  const chargement = useAppStore((s) => s.chargement);
  const erreur = useAppStore((s) => s.erreur);
  const modeAjout = useAppStore((s) => s.modeAjout);
  const deplacementAdresseId = useAppStore((s) => s.deplacementAdresseId);

  useEffect(() => {
    void useAppStore.getState().init();
  }, []);

  useEffect(() => {
    const enLigne = () => setHorsLigne(false);
    const coupe = () => setHorsLigne(true);
    window.addEventListener('online', enLigne);
    window.addEventListener('offline', coupe);
    return () => {
      window.removeEventListener('online', enLigne);
      window.removeEventListener('offline', coupe);
    };
  }, []);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = useAppStore.getState();
        s.annulerModes();
        s.fermerAdresse();
        s.fermerVueListe();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  if (!pret) {
    return (
      <div className="ecran-attente">
        <div className="spinner" />
      </div>
    );
  }

  if (supabaseActif && !session) {
    return <Login />;
  }

  // Compte créé mais pas encore validé par un administrateur : aucune donnée
  // de l'amicale n'est affichée.
  if (supabaseActif && profil && !profil.approuve) {
    return (
      <div className="ecran-connexion">
        <div className="carte-connexion">
          <div className="connexion-logo">⏳</div>
          <h1>Compte en attente</h1>
          <p className="connexion-sous-titre">Amicale des Sapeurs-Pompiers</p>
          <p className="connexion-note">
            Bonjour {profil.nom}. Votre compte a bien été créé, mais il doit être validé par un
            responsable de l'amicale avant de donner accès aux tournées.
          </p>
          <p className="connexion-note">
            Prévenez-le : la validation se fait en un clic dans « 👥 Membres ». Cette page se
            débloquera toute seule, sans rien réinstaller.
          </p>
          <button
            type="button"
            className="connexion-valider"
            onClick={() => void useAppStore.getState().deconnexion()}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="entete">
        <div className="titre">
          🚒 <strong>Tournées Calendriers</strong>
          <span className="sous-titre">Amicale des Sapeurs-Pompiers</span>
        </div>
        <SearchBar />
        {enAttente > 0 && estAdminReel && !vueMembre && (
          <button
            className="btn-attente"
            title="Modifications pas encore envoyées au serveur. Cliquez pour réessayer maintenant."
            onClick={() => void useAppStore.getState().forcerSynchro()}
          >
            ⏳ {enAttente} en attente
          </button>
        )}
        <button className="btn-equipe" onClick={() => setCampagneOuverte(true)}>
          📅 {campagneActive ? campagneActive.nom : 'Campagne'}
        </button>
        <button className="btn-equipe" onClick={() => setEquipesOuvertes(true)}>
          🚒 Équipes
        </button>
        <button className="btn-equipe" onClick={() => setSyntheseOuverte(true)}>
          📊 Synthèse
        </button>
        {estAdminReel && !vueMembre && (
          <button className="btn-equipe" onClick={() => setEquipeOuverte(true)}>
            👥 Membres
          </button>
        )}
        {profil && (
          <div className="utilisateur">
            👤 {profil.nom}
            {estAdminReel && (
              <button
                className={'badge-vue' + (vueMembre ? ' en-membre' : '')}
                title={
                  vueMembre
                    ? 'Vous voyez l’application comme un sapeur-pompier. Cliquez pour revenir en vue administrateur.'
                    : 'Vue administrateur. Cliquez pour afficher l’application comme un sapeur-pompier.'
                }
                onClick={() => useAppStore.getState().basculerVueMembre()}
              >
                {vueMembre ? '👁️ Vue membre' : '🛠️ Admin'}
              </button>
            )}
            <button
              className="btn-sortir"
              title="Se déconnecter"
              onClick={() => void useAppStore.getState().deconnexion()}
            >
              Sortir
            </button>
          </div>
        )}
        <button className="btn-panneau" onClick={() => setPanneauOuvert((o) => !o)}>
          ☰ Tournées
        </button>
      </header>
      {horsLigne && (
        <div className="bandeau-hors-ligne">
          📴 Hors ligne — vos saisies sont enregistrées et se synchroniseront au retour du réseau
        </div>
      )}
      {proposerNotifs && (
        <div className="bandeau-notifs">
          🔔 Activer les notifications ? (rappels « à repasser », affectations d'équipe)
          <button
            onClick={() => {
              void demanderPermission().finally(() => {
                localStorage.setItem('notifs-proposees', '1');
                setProposerNotifs(false);
              });
            }}
          >
            Activer
          </button>
          <button
            className="bandeau-notifs-fermer"
            onClick={() => {
              localStorage.setItem('notifs-proposees', '1');
              setProposerNotifs(false);
            }}
          >
            ✕
          </button>
        </div>
      )}
      {equipeOuverte && <Equipe onFermer={() => setEquipeOuverte(false)} />}
      {campagneOuverte && <CampagneFenetre onFermer={() => setCampagneOuverte(false)} />}
      {equipesOuvertes && <EquipesTournees onFermer={() => setEquipesOuvertes(false)} />}
      {syntheseOuverte && <SyntheseFenetre onFermer={() => setSyntheseOuverte(false)} />}
      <div className="contenu">
        <Sidebar ouvert={panneauOuvert} onFermer={() => setPanneauOuvert(false)} />
        <main className="carte-conteneur">
          <MapView />
          <div className="boutons-flottants">
            <button
              className={'bouton-boussole' + (orientation !== 0 ? ' tournee' : '')}
              title={
                orientation === 0
                  ? 'Orienter la carte (le nord est en haut)'
                  : `Carte orientée à ${orientation}° — appui pour régler, le nord n'est plus en haut`
              }
              onClick={() => setBoussoleOuverte((o) => !o)}
            >
              <span className="aiguille" style={{ transform: `rotate(${-orientation}deg)` }}>
                ⬆
              </span>
            </button>
            <button
              title={fondSatellite ? 'Passer au plan' : 'Passer aux photos aériennes'}
              onClick={() => useAppStore.getState().basculerFondCarte()}
            >
              {fondSatellite ? '🗺️' : '🛰️'}
            </button>
            <button title="Liste des adresses par proximité" onClick={() => useAppStore.getState().basculerVueListe()}>
              📋
            </button>
            <button
              title="Ma position"
              className={gpsActif ? 'actif' : ''}
              onClick={() => {
                const s = useAppStore.getState();
                if (!s.gpsActif) s.demarrerGPS();
                else if (s.positionGPS) s.cadrerSur({ type: 'point', ...s.positionGPS, zoom: 17 });
              }}
            >
              📍
            </button>
          </div>
          {boussoleOuverte && (
            <div className="barre-boussole">
              <button
                title="Tourner vers la gauche"
                onClick={() => useAppStore.getState().definirOrientation(orientation - 15)}
              >
                ↺
              </button>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={orientation}
                aria-label="Orientation de la carte"
                onChange={(e) => useAppStore.getState().definirOrientation(Number(e.target.value))}
              />
              <button
                title="Tourner vers la droite"
                onClick={() => useAppStore.getState().definirOrientation(orientation + 15)}
              >
                ↻
              </button>
              <span className="boussole-valeur">{orientation}°</span>
              <button
                className="boussole-nord"
                disabled={orientation === 0}
                title="Remettre le nord en haut"
                onClick={() => useAppStore.getState().definirOrientation(0)}
              >
                <span className="boussole-nord-texte">Nord </span>⬆
              </button>
              <button
                className="boussole-fermer"
                title="Fermer"
                onClick={() => setBoussoleOuverte(false)}
              >
                ✕
              </button>
            </div>
          )}
          {vueListe && <ListeAdresses />}
          <FicheAdresse />
          {(modeAjout || deplacementAdresseId) && (
            <div className="bandeau-mode">
              {modeAjout
                ? '🖱️ Cliquez sur la carte pour placer la nouvelle adresse'
                : '🖱️ Cliquez sur la carte pour déplacer le point'}
              <button onClick={() => useAppStore.getState().annulerModes()}>Annuler (Échap)</button>
            </div>
          )}
          {chargement.actif && (
            <div className="voile-chargement">
              <div className="carte-chargement">
                <div className="spinner" />
                <div className="chargement-message">{chargement.message}</div>
                {chargement.progression !== null && (
                  <div className="barre">
                    <div className="barre-remplie" style={{ width: `${chargement.progression}%` }} />
                  </div>
                )}
              </div>
            </div>
          )}
          {erreur && (
            <div className="toast-erreur">
              <span>⚠️ {erreur}</span>
              <button onClick={() => useAppStore.getState().fermerErreur()}>✕</button>
            </div>
          )}
          {notification && (
            <div className="toast-notification">
              <span>{notification}</span>
              <button onClick={() => useAppStore.getState().fermerNotification()}>✕</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
