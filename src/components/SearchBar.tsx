// Barre de recherche d'adresse / commune (api-adresse.data.gouv.fr).

import { useEffect, useRef, useState } from 'react';
import { rechercherAdresse, type ResultatRecherche } from '../lib/ban';
import { useAppStore } from '../store/useAppStore';

const ZOOM_PAR_TYPE: Record<string, number> = {
  municipality: 14,
  locality: 16,
  street: 17,
  housenumber: 18,
};

export default function SearchBar() {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const minuterie = useRef<number | null>(null);
  // numéro de la dernière recherche lancée : une réponse plus ancienne, arrivée
  // en retard, ne doit pas remplacer les résultats de la plus récente
  const derniere = useRef(0);

  useEffect(() => {
    if (minuterie.current) window.clearTimeout(minuterie.current);
    if (q.trim().length < 3) {
      setResultats([]);
      setOuvert(false);
      return;
    }
    minuterie.current = window.setTimeout(async () => {
      derniere.current += 1;
      const numero = derniere.current;
      let r: ResultatRecherche[] = [];
      try {
        r = await rechercherAdresse(q.trim());
      } catch {
        // hors ligne : pas de proposition, sans message d'erreur
      }
      if (numero !== derniere.current) return;
      setResultats(r);
      setOuvert(r.length > 0);
    }, 300);
  }, [q]);

  const choisir = (r: ResultatRecherche) => {
    useAppStore.getState().cadrerSur({
      type: 'point',
      lat: r.lat,
      lng: r.lng,
      zoom: ZOOM_PAR_TYPE[r.type] ?? 16,
    });
    setQ(r.libelle);
    setOuvert(false);
  };

  return (
    <div className="recherche">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Chercher une commune, une adresse…"
        onFocus={() => resultats.length > 0 && setOuvert(true)}
        onBlur={() => window.setTimeout(() => setOuvert(false), 150)}
      />
      {ouvert && (
        <ul className="recherche-resultats">
          {resultats.map((r, i) => (
            <li key={i} onMouseDown={() => choisir(r)}>
              {r.libelle}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
