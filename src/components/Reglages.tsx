import { useAppStore } from '../store/useAppStore';
import { GROUPES_ICONES, ICONES_POSITION, type IconePosition } from '../lib/iconesPosition';
import { etatMarges } from '../lib/margesEcran';

// Mode d'emploi PDF : toujours celui de la version en ligne de l'appli (voir
// outils/mode-emploi.mjs). L'empreinte dans l'adresse évite qu'un téléphone
// garde une ancienne version en mémoire.
const MODE_EMPLOI = __MODE_EMPLOI__;
const ADRESSE_MODE_EMPLOI = `${import.meta.env.BASE_URL}${MODE_EMPLOI.fichier}?v=${MODE_EMPLOI.version}`;

function poids(octets: number): string {
  const mo = octets / (1024 * 1024);
  if (mo >= 1) return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

const INFOS_MODE_EMPLOI = [
  MODE_EMPLOI.date ? `Version du ${MODE_EMPLOI.date}` : null,
  MODE_EMPLOI.pages ? `${MODE_EMPLOI.pages} pages` : null,
  poids(MODE_EMPLOI.octets),
]
  .filter(Boolean)
  .join(' · ');

const VERSION = __VERSION_APPLI__;

/** « Android 15 · Chrome 142 », lu dans l'identité du navigateur. */
function systemeEtNavigateur(): string {
  const ua = navigator.userAgent;
  const morceaux: string[] = [];
  const android = /Android ([\d.]+)/.exec(ua);
  const ios = /(?:iPhone|iPad).*? OS (\d+)_/.exec(ua);
  if (android) morceaux.push(`Android ${android[1]}`);
  else if (ios) morceaux.push(`iOS ${ios[1]}`);
  else if (/Windows/.test(ua)) morceaux.push('Windows');
  else if (/Mac OS/.test(ua)) morceaux.push('Mac');
  const navigateurs: [RegExp, string][] = [
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/EdgA?\/(\d+)/, 'Edge'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [motif, nom] of navigateurs) {
    const m = motif.exec(ua);
    if (m) {
      morceaux.push(`${nom} ${m[1]}`);
      break;
    }
  }
  return morceaux.join(' · ') || ua.slice(0, 60);
}

/**
 * Infos pour le dépannage : la version reçue par l'appareil et les mesures de
 * l'écran. Une capture de ce bloc suffit pour comprendre un souci d'affichage
 * sur un téléphone qu'on n'a pas sous la main.
 */
function InfosDepannage() {
  const installee =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const vv = window.visualViewport;
  const marges = etatMarges();
  const lignes: [string, string][] = [
    ['Version', `${VERSION.commit} du ${VERSION.date}`],
    ['Mode', installee ? 'appli installée' : 'dans le navigateur'],
    ['Système', systemeEtNavigateur()],
    ['Écran', `${screen.width} × ${screen.height} (×${Math.round(devicePixelRatio * 100) / 100})`],
    ['Fenêtre', `${window.innerWidth} × ${window.innerHeight}` + (vv ? ` · visible ${Math.round(vv.height)}` : '')],
    ['Marges', `haut ${marges.signaleesHaut} px · bas ${marges.signaleesBas} px`],
    [
      'Secours',
      marges.secoursHaut || marges.secoursBas
        ? `oui : haut ${marges.secoursHaut} px · bas ${marges.secoursBas} px`
        : 'non',
    ],
  ];
  return (
    <details className="depannage">
      <summary>🔧 Infos pour le dépannage</summary>
      <p className="equipe-note">
        En cas de souci d'affichage, faites une capture d'écran de ce bloc et envoyez-la : elle dit
        quelle version de l'appli ce téléphone a reçue.
      </p>
      <dl>
        {lignes.map(([nom, valeur]) => (
          <div key={nom}>
            <dt>{nom}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

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
          <h3>📖 Mode d'emploi</h3>
          <p className="equipe-note">
            Le guide complet et illustré de l'application, pour les sapeurs-pompiers comme pour les
            administrateurs. C'est toujours la dernière version : il est mis à jour en même temps que
            l'application.
          </p>
          <p className="mode-emploi-infos">{INFOS_MODE_EMPLOI}</p>
          <div className="mode-emploi-boutons">
            <a className="reglage-lien principal" href={ADRESSE_MODE_EMPLOI} target="_blank" rel="noopener">
              📖 Ouvrir
            </a>
            <a
              className="reglage-lien"
              href={ADRESSE_MODE_EMPLOI}
              download="Mode-d-emploi-Tournees-Calendriers.pdf"
            >
              ⬇️ Télécharger
            </a>
          </div>
        </section>

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

        <section className="reglage-bloc">
          <InfosDepannage />
        </section>
      </div>
    </div>
  );
}
