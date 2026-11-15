// Carte Leaflet + outils de dessin Geoman : zones de tournées et pings d'adresses.

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-rotate';
import { chargerOutilsDessin, equiperCarte } from '../lib/dessin';
import { calculerTourneesVisibles, estAdminEffectif, useAppStore } from '../store/useAppStore';
import MenuNavigation from './MenuNavigation';
import { COULEUR_STATUT, type AdressePoint } from '../types';
import type { LatLng } from '../lib/geo';
import { htmlIcone, ICONE_PAR_DEFAUT, trouverIcone } from '../lib/iconesPosition';

// ----- dernière vue de la carte, gardée sur l'appareil -----
// L'application rouvre là où on l'a laissée, au lieu de montrer la France
// entière à chaque lancement.
const CLE_VUE = 'vue-carte';

function lireVue(): { lat: number; lng: number; zoom: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VUE) ?? 'null') as {
      lat?: unknown;
      lng?: unknown;
      zoom?: unknown;
    } | null;
    if (
      v &&
      typeof v.lat === 'number' &&
      typeof v.lng === 'number' &&
      typeof v.zoom === 'number' &&
      Number.isFinite(v.lat) &&
      Number.isFinite(v.lng) &&
      Number.isFinite(v.zoom)
    ) {
      return { lat: v.lat, lng: v.lng, zoom: v.zoom };
    }
  } catch {
    /* mémoire illisible : on repart de la vue par défaut */
  }
  return null;
}

const texteInfobulle = (a: AdressePoint): string => {
  const nb = 1 + a.autresAdresses.length;
  return nb > 1 ? `${a.libelle} — ${nb} adresses` : a.libelle;
};

export default function MapView() {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polygonesRef = useRef<L.LayerGroup | null>(null);
  const marqueursRef = useRef<L.LayerGroup | null>(null);
  // un point de la carte par adresse, pour ne retoucher que ceux qui changent
  const marqueursParId = useRef(new Map<string, { marqueur: L.CircleMarker; adresse: AdressePoint }>());
  // vrai une fois la carte placée (vue mémorisée, ou premier cadrage sur les tournées)
  const cadrageInitialFait = useRef(false);
  const positionRef = useRef<L.LayerGroup | null>(null);
  // le point « ma position » affiché, et l'icône avec laquelle il a été dessiné
  const pointPositionRef = useRef<{ couche: L.Marker | L.CircleMarker; icone: string } | null>(null);
  const fondPlanRef = useRef<L.TileLayer | null>(null);
  const fondSatelliteRef = useRef<L.TileLayer | null>(null);
  const editionActiveRef = useRef(false);
  // vrai juste après un appui long : évite d'ouvrir aussi une fiche d'adresse
  const appuiLongRef = useRef(false);
  const [versionEdition, setVersionEdition] = useState(0);
  const [pointNavigation, setPointNavigation] = useState<{ lat: number; lng: number } | null>(null);

  const tournees = useAppStore((s) => s.tournees);
  const adresses = useAppStore((s) => s.adresses);
  const selectionTourneeId = useAppStore((s) => s.selectionTourneeId);
  const modeAjout = useAppStore((s) => s.modeAjout);
  const deplacementAdresseId = useAppStore((s) => s.deplacementAdresseId);
  const cadrage = useAppStore((s) => s.cadrage);
  const positionGPS = useAppStore((s) => s.positionGPS);
  const iconePosition = useAppStore((s) => s.iconePosition);
  const fondSatellite = useAppStore((s) => s.fondSatellite);
  const orientation = useAppStore((s) => s.orientation);
  const profil = useAppStore((s) => s.profil);
  const equipes = useAppStore((s) => s.equipes);
  const tourneesAffichees = useAppStore((s) => s.tourneesAffichees);
  const vueMembre = useAppStore((s) => s.vueMembre);
  const estAdmin = estAdminEffectif(profil, vueMembre);
  const visibles = useMemo(
    () => calculerTourneesVisibles(profil, equipes, tourneesAffichees, vueMembre),
    [profil, equipes, tourneesAffichees, vueMembre],
  );

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    // tolerance : élargit la zone de clic des pings (indispensable au doigt)
    const map = L.map(divRef.current, {
      preferCanvas: true,
      renderer: L.canvas({ tolerance: 12 }),
      // orientation libre de la carte : deux doigts sur téléphone,
      // Maj + glisser sur ordinateur, et la boussole de l'application
      rotate: true,
      touchRotate: true,
      shiftKeyRotate: true,
      rotateControl: false,
    });
    const vue = lireVue();
    if (vue) map.setView([vue.lat, vue.lng], vue.zoom);
    else map.setView([46.6, 2.4], 6);
    cadrageInitialFait.current = vue !== null;
    // la liste « par proximité » a besoin du centre dès le lancement, sans
    // attendre que l'on déplace la carte
    if (vue) useAppStore.getState().setCentreCarte({ lat: vue.lat, lng: vue.lng });
    fondPlanRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    fondSatelliteRef.current = L.tileLayer(
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
      { attribution: '© IGN — photos aériennes', maxZoom: 19 },
    );


    map.on('pm:create', (e: any) => {
      const layer = e.layer as L.Polygon;
      const anneau = (layer.getLatLngs()[0] as L.LatLng[]).map((ll) => [ll.lat, ll.lng] as LatLng);
      layer.remove();
      if (anneau.length >= 3) void useAppStore.getState().creerTourneeDepuisPolygone(anneau);
    });

    map.on('pm:globaleditmodetoggled', (e: any) => {
      editionActiveRef.current = e.enabled;
      if (!e.enabled) setVersionEdition((v) => v + 1);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (appuiLongRef.current) {
        appuiLongRef.current = false;
        return;
      }
      const s = useAppStore.getState();
      if (s.modeAjout && s.selectionTourneeId) {
        void s.ajouterAdresse(s.selectionTourneeId, e.latlng.lat, e.latlng.lng);
      } else if (s.deplacementAdresseId) {
        void s.deplacerAdresse(s.deplacementAdresseId, e.latlng.lat, e.latlng.lng);
      } else {
        // aimant à doigt : si le tap a raté le ping de peu, on ouvre quand même
        // l'adresse visible la plus proche du point touché
        const visibles = calculerTourneesVisibles(
          s.profil,
          s.equipes,
          s.tourneesAffichees,
          s.vueMembre,
        );
        const pointClic = map.latLngToContainerPoint(e.latlng);
        let meilleure: string | null = null;
        let meilleureDistance = 30; // pixels
        for (const a of s.adresses) {
          if (visibles !== null && !visibles.has(a.tourneeId)) continue;
          const p = map.latLngToContainerPoint([a.lat, a.lng]);
          const d = Math.hypot(p.x - pointClic.x, p.y - pointClic.y);
          if (d < meilleureDistance) {
            meilleureDistance = d;
            meilleure = a.id;
          }
        }
        if (meilleure) s.ouvrirAdresse(meilleure);
      }
    });

    map.on('rotate', () => {
      const angle = Math.round(((map.getBearing() % 360) + 360) % 360);
      if (angle !== useAppStore.getState().orientation) {
        useAppStore.getState().definirOrientation(angle);
      }
    });

    map.on('moveend', () => {
      const centre = map.getCenter();
      useAppStore.getState().setCentreCarte({ lat: centre.lat, lng: centre.lng });
      try {
        localStorage.setItem(
          CLE_VUE,
          JSON.stringify({ lat: centre.lat, lng: centre.lng, zoom: map.getZoom() }),
        );
      } catch {
        /* stockage indisponible : la vue ne sera pas retrouvée au prochain lancement */
      }
    });

    polygonesRef.current = L.layerGroup().addTo(map);
    marqueursRef.current = L.layerGroup().addTo(map);
    positionRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).carteLeaflet = map;
    return () => {
      map.remove();
      mapRef.current = null;
      marqueursParId.current = new Map();
      pointPositionRef.current = null;
    };
  }, []);

  // Tout premier lancement sur cet appareil (aucune vue mémorisée) : on cadre
  // d'emblée sur les tournées visibles au lieu de laisser la France entière.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || cadrageInitialFait.current) return;
    const points: LatLng[] = [];
    for (const t of tournees) {
      if (visibles !== null && !visibles.has(t.id)) continue;
      for (const p of t.polygone) points.push(p);
    }
    if (points.length < 2) return;
    cadrageInitialFait.current = true;
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], animate: false });
  }, [tournees, visibles]);

  // Orientation demandée par la boussole : on la reporte sur la carte.
  // (le sens inverse — gestes deux doigts, Maj + glisser — passe par
  //  l'événement « rotate » ci-dessus ; la comparaison évite toute boucle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const actuel = Math.round(((map.getBearing() % 360) + 360) % 360);
    if (actuel !== orientation) map.setBearing(orientation);
  }, [orientation]);

  // Appui long (téléphone) ou clic droit (PC) : proposition d'itinéraire
  useEffect(() => {
    const map = mapRef.current;
    const conteneur = divRef.current;
    if (!map || !conteneur) return;

    let minuterie: number | null = null;
    let depart: { x: number; y: number } | null = null;

    const annuler = () => {
      if (minuterie !== null) {
        window.clearTimeout(minuterie);
        minuterie = null;
      }
      depart = null;
    };

    const proposerItineraire = (clientX: number, clientY: number) => {
      const s = useAppStore.getState();
      if (s.modeAjout || s.deplacementAdresseId) return;
      const rect = conteneur.getBoundingClientRect();
      const point = map.containerPointToLatLng([clientX - rect.left, clientY - rect.top]);
      appuiLongRef.current = true;
      setPointNavigation({ lat: point.lat, lng: point.lng });
      navigator.vibrate?.(30);
    };

    const surDebut = (e: TouchEvent) => {
      appuiLongRef.current = false;
      if (e.touches.length !== 1) {
        annuler();
        return;
      }
      const { clientX, clientY } = e.touches[0];
      depart = { x: clientX, y: clientY };
      minuterie = window.setTimeout(() => {
        minuterie = null;
        proposerItineraire(clientX, clientY);
      }, 600);
    };

    const surMouvement = (e: TouchEvent) => {
      if (!depart || minuterie === null) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - depart.x, t.clientY - depart.y) > 12) annuler();
    };

    const surClicDroit = (e: L.LeafletMouseEvent) => {
      proposerItineraire(
        e.originalEvent.clientX,
        e.originalEvent.clientY,
      );
    };

    conteneur.addEventListener('touchstart', surDebut, { passive: true });
    conteneur.addEventListener('touchmove', surMouvement, { passive: true });
    conteneur.addEventListener('touchend', annuler);
    conteneur.addEventListener('touchcancel', annuler);
    map.on('contextmenu', surClicDroit);

    return () => {
      annuler();
      conteneur.removeEventListener('touchstart', surDebut);
      conteneur.removeEventListener('touchmove', surMouvement);
      conteneur.removeEventListener('touchend', annuler);
      conteneur.removeEventListener('touchcancel', annuler);
      map.off('contextmenu', surClicDroit);
    };
  }, []);

  // Fond de carte : plan OSM ou photos aériennes IGN
  useEffect(() => {
    const map = mapRef.current;
    const plan = fondPlanRef.current;
    const satellite = fondSatelliteRef.current;
    if (!map || !plan || !satellite) return;
    if (fondSatellite) {
      plan.remove();
      satellite.addTo(map);
    } else {
      satellite.remove();
      plan.addTo(map);
    }
  }, [fondSatellite]);

  // Outils de dessin : réservés aux administrateurs, et chargés pour eux seuls
  // (voir lib/dessin.ts). La carte existe déjà à ce moment-là : on l'équipe,
  // puis on retrace les zones pour qu'elles deviennent modifiables.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let abandonne = false;
    if (estAdmin) {
      void chargerOutilsDessin()
        .then(() => {
          if (abandonne || mapRef.current !== map || !equiperCarte(map)) return;
          map.pm.setLang('fr');
          map.pm.addControls({
            position: 'topleft',
            drawPolygon: true,
            drawRectangle: true,
            drawMarker: false,
            drawCircleMarker: false,
            drawCircle: false,
            drawPolyline: false,
            drawText: false,
            editMode: true,
            dragMode: false,
            cutPolygon: false,
            removalMode: false,
            rotateMode: false,
          });
          setVersionEdition((v) => v + 1);
        })
        .catch(() => {
          useAppStore.setState({
            erreur:
              "Les outils de dessin des tournées n'ont pas pu se charger (connexion ?). Le reste de l'application fonctionne normalement.",
          });
        });
    } else if ((map as unknown as { pm?: unknown }).pm) {
      map.pm.removeControls();
    }
    return () => {
      abandonne = true;
    };
  }, [estAdmin]);

  // Zones des tournées. On ne reconstruit pas les couches pendant l'édition de
  // sommets, sinon les poignées de Geoman disparaissent à chaque recalcul.
  useEffect(() => {
    const groupe = polygonesRef.current;
    if (!groupe || editionActiveRef.current) return;
    groupe.clearLayers();
    for (const t of tournees) {
      if (visibles !== null && !visibles.has(t.id)) continue;
      const poly = L.polygon(t.polygone, {
        color: t.couleur,
        weight: t.id === selectionTourneeId ? 4 : 2.5,
        fillOpacity: 0.05,
      }).addTo(groupe);
      poly.bindTooltip(t.nom, { sticky: true });
      poly.on('click', () => {
        if (appuiLongRef.current) {
          appuiLongRef.current = false;
          return;
        }
        const s = useAppStore.getState();
        if (s.modeAjout || s.deplacementAdresseId) return; // le clic sert alors à placer un point
        s.selectionnerTournee(t.id);
      });
      poly.on('pm:edit', () => {
        const anneau = (poly.getLatLngs()[0] as L.LatLng[]).map((ll) => [ll.lat, ll.lng] as LatLng);
        if (anneau.length >= 3) void useAppStore.getState().majPolygone(t.id, anneau);
      });
    }
  }, [tournees, selectionTourneeId, versionEdition, visibles]);

  // Pings d'adresses (canvas : supporte plusieurs milliers de points).
  //
  // On ne retouche que les points qui ont changé. Avant, cocher UNE maison
  // effaçait puis recréait TOUS les points de la carte (plus de six mille pour
  // un administrateur) : c'était la principale cause de saccade au toucher,
  // et à chaque synchronisation.
  useEffect(() => {
    const groupe = marqueursRef.current;
    const map = mapRef.current;
    if (!groupe || !map) return;
    const index = marqueursParId.current;
    const vus = new Set<string>();
    for (const a of adresses) {
      if (visibles !== null && !visibles.has(a.tourneeId)) continue;
      vus.add(a.id);
      const existant = index.get(a.id);
      if (existant) {
        const avant = existant.adresse;
        if (avant === a) continue; // strictement la même : rien à faire
        const m = existant.marqueur;
        if (avant.lat !== a.lat || avant.lng !== a.lng) m.setLatLng([a.lat, a.lng]);
        if (avant.statut !== a.statut) m.setStyle({ fillColor: COULEUR_STATUT[a.statut] });
        const groupeAvant = avant.autresAdresses.length > 0;
        const groupeApres = a.autresAdresses.length > 0;
        if (groupeAvant !== groupeApres) m.setRadius(groupeApres ? 11 : 8);
        if (avant.libelle !== a.libelle || avant.autresAdresses.length !== a.autresAdresses.length) {
          m.setTooltipContent(texteInfobulle(a));
        }
        existant.adresse = a;
        continue;
      }
      const marqueur = L.circleMarker([a.lat, a.lng], {
        radius: a.autresAdresses.length > 0 ? 11 : 8,
        color: '#ffffff',
        weight: 2,
        fillColor: COULEUR_STATUT[a.statut],
        fillOpacity: 0.95,
        bubblingMouseEvents: false,
        pmIgnore: true,
      } as L.CircleMarkerOptions).addTo(groupe);
      marqueur.bindTooltip(texteInfobulle(a));
      const id = a.id;
      marqueur.on('click', () => {
        if (appuiLongRef.current) {
          appuiLongRef.current = false;
          return;
        }
        const s = useAppStore.getState();
        if (s.modeAjout || s.deplacementAdresseId) return;
        s.ouvrirAdresse(id);
      });
      index.set(id, { marqueur, adresse: a });
    }
    // adresses supprimées, ou tournée masquée
    for (const [id, entree] of index) {
      if (vus.has(id)) continue;
      groupe.removeLayer(entree.marqueur);
      index.delete(id);
    }
  }, [adresses, visibles]);

  // Ma position GPS : le rond bleu, ou l'icône choisie dans les réglages.
  // Le point est déplacé à chaque nouvelle position, et redessiné seulement
  // quand l'icône change.
  useEffect(() => {
    const groupe = positionRef.current;
    if (!groupe) return;
    if (!positionGPS) {
      groupe.clearLayers();
      pointPositionRef.current = null;
      return;
    }
    const ici: L.LatLngExpression = [positionGPS.lat, positionGPS.lng];
    const actuel = pointPositionRef.current;
    if (actuel && actuel.icone === iconePosition) {
      actuel.couche.setLatLng(ici);
      return;
    }
    groupe.clearLayers();
    const icone = trouverIcone(iconePosition);
    const couche =
      icone.id === ICONE_PAR_DEFAUT
        ? L.circleMarker(ici, {
            radius: 9,
            color: '#ffffff',
            weight: 3,
            fillColor: '#1a73e8',
            fillOpacity: 1,
            bubblingMouseEvents: false,
            pmIgnore: true,
          } as L.CircleMarkerOptions)
        : // L'icône reste droite quand on tourne la carte, passe au-dessus des
          // pings, et laisse passer le doigt : toucher une maison sous
          // l'icône ouvre toujours sa fiche.
          L.marker(ici, {
            icon: L.divIcon({
              className: 'icone-position' + (icone.svg ? ' dessin' : ''),
              html: htmlIcone(icone),
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            }),
            interactive: false,
            keyboard: false,
            zIndexOffset: 1000,
            pmIgnore: true,
          } as L.MarkerOptions);
    couche.addTo(groupe);
    pointPositionRef.current = { couche, icone: icone.id };
  }, [positionGPS, iconePosition]);

  // Recentrage demandé par la recherche ou le bouton « Voir »
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cadrage) return;
    if (cadrage.type === 'point') {
      map.flyTo([cadrage.lat, cadrage.lng], cadrage.zoom, { duration: 0.9 });
    } else {
      map.fitBounds(L.latLngBounds(cadrage.points), { padding: [40, 40] });
    }
    useAppStore.getState().viderCadrage();
  }, [cadrage]);

  useEffect(() => {
    divRef.current?.classList.toggle('curseur-vise', modeAjout || !!deplacementAdresseId);
  }, [modeAjout, deplacementAdresseId]);

  return (
    <>
      <div ref={divRef} className="carte" />
      {pointNavigation && (
        <MenuNavigation
          lat={pointNavigation.lat}
          lng={pointNavigation.lng}
          onFermer={() => setPointNavigation(null)}
        />
      )}
    </>
  );
}
