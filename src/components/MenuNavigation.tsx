// Menu « S'y rendre » : ouvre l'itinéraire vers un point de la carte dans une
// application de navigation (Plans, Google Maps, Waze…) selon l'appareil.

import { useEffect, useState } from 'react';
import { geocodageInverse } from '../lib/ban';

function estIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPad récent : se présente comme un Mac tactile
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function estAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

interface LienNavigation {
  cle: string;
  libelle: string;
  url: string;
  /** true = ouvre un onglet (https), false = laisse le système choisir (geo:). */
  nouvelOnglet: boolean;
}

export default function MenuNavigation({
  lat,
  lng,
  onFermer,
}: {
  lat: number;
  lng: number;
  onFermer: () => void;
}) {
  const [libelle, setLibelle] = useState<string | null>(null);
  const [recherche, setRecherche] = useState(true);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let annule = false;
    void geocodageInverse(lat, lng).then((info) => {
      if (annule) return;
      setLibelle(info ? `${info.libelle}${info.commune ? ', ' + info.commune : ''}` : null);
      setRecherche(false);
    });
    return () => {
      annule = true;
    };
  }, [lat, lng]);

  const coord = `${lat.toFixed(6)},${lng.toFixed(6)}`;

  const liens: LienNavigation[] = [];
  if (estIOS()) {
    liens.push({
      cle: 'plans',
      libelle: '🧭 Plans',
      url: `https://maps.apple.com/?daddr=${coord}&dirflg=d`,
      nouvelOnglet: true,
    });
  }
  liens.push({
    cle: 'google',
    libelle: '🗺️ Google Maps',
    url: `https://www.google.com/maps/dir/?api=1&destination=${coord}&travelmode=driving`,
    nouvelOnglet: true,
  });
  liens.push({
    cle: 'waze',
    libelle: '🚗 Waze',
    url: `https://waze.com/ul?ll=${coord}&navigate=yes`,
    nouvelOnglet: true,
  });
  if (estAndroid()) {
    liens.push({
      cle: 'autre',
      libelle: '📍 Autre application…',
      url: `geo:${coord}?q=${coord}(Destination)`,
      nouvelOnglet: false,
    });
  }

  const copierCoordonnees = async () => {
    try {
      await navigator.clipboard.writeText(coord);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
    } catch {
      // presse-papiers indisponible (navigateur ancien) : sans conséquence
    }
  };

  return (
    <div className="nav-voile" onClick={onFermer}>
      <div className="nav-panneau" onClick={(e) => e.stopPropagation()}>
        <div className="fiche-poignee" />
        <div className="nav-entete">
          <div className="nav-titre">🧭 S'y rendre</div>
          <button className="fiche-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        <div className="nav-destination">
          {recherche ? 'Recherche de l’adresse…' : (libelle ?? 'Point sur la carte')}
          <span className="nav-coord">{coord.replace(',', ' · ')}</span>
        </div>

        <div className="nav-liens">
          {liens.map((l) => (
            <a
              key={l.cle}
              href={l.url}
              {...(l.nouvelOnglet ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={() => window.setTimeout(onFermer, 400)}
            >
              {l.libelle}
            </a>
          ))}
        </div>

        <button className="nav-copier" onClick={() => void copierCoordonnees()}>
          {copie ? '✅ Coordonnées copiées' : '📋 Copier les coordonnées'}
        </button>
      </div>
    </div>
  );
}
