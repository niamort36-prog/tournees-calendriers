import { useAppStore } from '../store/useAppStore';
import { GROUPES_ICONES, ICONES_POSITION, type IconePosition } from '../lib/iconesPosition';

/** Petit aperçu d'une icône, tel qu'elle apparaîtra sur la carte. */
function Apercu({ icone }: { icone: IconePosition }) {
  if (icone.svg) {
    // dessin fixe, écrit dans le code (jamais une saisie)
    return <span className="apercu-icone dessin" dangerouslySetInnerHTML={{ __html: icone.svg }} />;
  }
  if (icone.emoji) return <span className="apercu-icone emoji">{icone.emoji}</span>;
  return (
    <span className="apercu-icone">
      <span className="apercu-rond-bleu" />
    </span>
  );
}

export default function Reglages({ onFermer }: { onFermer: () => void }) {
  const choisie = useAppStore((s) => s.iconePosition);
  const gpsActif = useAppStore((s) => s.gpsActif);

  const montrerMaPosition = () => {
    const s = useAppStore.getState();
    if (!s.gpsActif) s.demarrerGPS();
    else if (s.positionGPS) s.cadrerSur({ type: 'point', ...s.positionGPS, zoom: 17 });
    onFermer();
  };

  return (
    <div className="fenetre-voile" onClick={onFermer}>
      <div className="fenetre" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <h2>⚙️ Réglages</h2>
          <button className="panneau-fermer" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>

        <section className="reglage-bloc">
          <h3>Icône de ma position</h3>
          <p className="equipe-note">
            Elle remplace le rond bleu qui vous suit sur la carte quand vous appuyez sur 📍. Le choix
            ne vaut que pour cet appareil : chacun peut avoir la sienne.
          </p>

          {GROUPES_ICONES.map((groupe) => (
            <div key={groupe} className="icones-groupe">
              <h4>{groupe}</h4>
              <div className="icones-grille" role="radiogroup" aria-label={`Icônes : ${groupe}`}>
                {ICONES_POSITION.filter((i) => i.groupe === groupe).map((icone) => {
                  const active = icone.id === choisie;
                  return (
                    <button
                      key={icone.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={'icone-choix' + (active ? ' choisie' : '')}
                      onClick={() => useAppStore.getState().choisirIconePosition(icone.id)}
                    >
                      <Apercu icone={icone} />
                      <span className="icone-choix-nom">{icone.nom}</span>
                      {active && <span className="icone-choix-coche">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button type="button" className="reglage-voir-position" onClick={montrerMaPosition}>
            📍 {gpsActif ? 'Voir ma position sur la carte' : 'Afficher ma position sur la carte'}
          </button>
        </section>
      </div>
    </div>
  );
}
