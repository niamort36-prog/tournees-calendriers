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

export default function App() {
  const [panneauOuvert, setPanneauOuvert] = useState(true);
  const [equipeOuverte, setEquipeOuverte] = useState(false);
  const [campagneOuverte, setCampagneOuverte] = useState(false);
  const [equipesOuvertes, setEquipesOuvertes] = useState(false);
  const [syntheseOuverte, setSyntheseOuverte] = useState(false);
  const campagneActive = useAppStore((s) => s.campagnes.find((c) => c.statut === 'active'));
  const notification = useAppStore((s) => s.notification);
  const vueListe = useAppStore((s) => s.vueListe);
  const gpsActif = useAppStore((s) => s.gpsActif);
  const fondSatellite = useAppStore((s) => s.fondSatellite);
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine);
  const pret = useAppStore((s) => s.pret);
  const session = useAppStore((s) => s.session);
  const profil = useAppStore((s) => s.profil);
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

  return (
    <div className="app">
      <header className="entete">
        <div className="titre">
          🚒 <strong>Tournées Calendriers</strong>
          <span className="sous-titre">Amicale des Sapeurs-Pompiers</span>
        </div>
        <SearchBar />
        <button className="btn-equipe" onClick={() => setCampagneOuverte(true)}>
          📅 {campagneActive ? campagneActive.nom : 'Campagne'}
        </button>
        <button className="btn-equipe" onClick={() => setEquipesOuvertes(true)}>
          🚒 Équipes
        </button>
        <button className="btn-equipe" onClick={() => setSyntheseOuverte(true)}>
          📊 Synthèse
        </button>
        {profil?.role === 'admin' && (
          <button className="btn-equipe" onClick={() => setEquipeOuverte(true)}>
            👥 Membres
          </button>
        )}
        {profil && (
          <div className="utilisateur">
            👤 {profil.nom}
            {profil.role === 'admin' && <span className="badge-admin">Admin</span>}
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
