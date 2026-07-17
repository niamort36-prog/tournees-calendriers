import { useEffect, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const [panneauOuvert, setPanneauOuvert] = useState(true);
  const chargement = useAppStore((s) => s.chargement);
  const erreur = useAppStore((s) => s.erreur);
  const modeAjout = useAppStore((s) => s.modeAjout);
  const deplacementAdresseId = useAppStore((s) => s.deplacementAdresseId);

  useEffect(() => {
    void useAppStore.getState().init();
  }, []);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAppStore.getState().annulerModes();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  return (
    <div className="app">
      <header className="entete">
        <div className="titre">
          🚒 <strong>Tournées Calendriers</strong>
          <span className="sous-titre">Amicale des Sapeurs-Pompiers</span>
        </div>
        <SearchBar />
        <button className="btn-panneau" onClick={() => setPanneauOuvert((o) => !o)}>
          ☰ Tournées
        </button>
      </header>
      <div className="contenu">
        <Sidebar ouvert={panneauOuvert} onFermer={() => setPanneauOuvert(false)} />
        <main className="carte-conteneur">
          <MapView />
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
        </main>
      </div>
    </div>
  );
}
