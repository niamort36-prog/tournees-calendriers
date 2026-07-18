// Carte Leaflet + outils de dessin Geoman : zones de tournées et pings d'adresses.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { useAppStore } from '../store/useAppStore';
import { COULEUR_STATUT } from '../types';
import type { LatLng } from '../lib/geo';

export default function MapView() {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polygonesRef = useRef<L.LayerGroup | null>(null);
  const marqueursRef = useRef<L.LayerGroup | null>(null);
  const positionRef = useRef<L.LayerGroup | null>(null);
  const editionActiveRef = useRef(false);
  const [versionEdition, setVersionEdition] = useState(0);

  const tournees = useAppStore((s) => s.tournees);
  const adresses = useAppStore((s) => s.adresses);
  const selectionTourneeId = useAppStore((s) => s.selectionTourneeId);
  const modeAjout = useAppStore((s) => s.modeAjout);
  const deplacementAdresseId = useAppStore((s) => s.deplacementAdresseId);
  const cadrage = useAppStore((s) => s.cadrage);
  const positionGPS = useAppStore((s) => s.positionGPS);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { preferCanvas: true }).setView([46.6, 2.4], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

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
      const s = useAppStore.getState();
      if (s.modeAjout && s.selectionTourneeId) {
        void s.ajouterAdresse(s.selectionTourneeId, e.latlng.lat, e.latlng.lng);
      } else if (s.deplacementAdresseId) {
        void s.deplacerAdresse(s.deplacementAdresseId, e.latlng.lat, e.latlng.lng);
      }
    });

    map.on('moveend', () => {
      const centre = map.getCenter();
      useAppStore.getState().setCentreCarte({ lat: centre.lat, lng: centre.lng });
    });

    polygonesRef.current = L.layerGroup().addTo(map);
    marqueursRef.current = L.layerGroup().addTo(map);
    positionRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).carteLeaflet = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Zones des tournées. On ne reconstruit pas les couches pendant l'édition de
  // sommets, sinon les poignées de Geoman disparaissent à chaque recalcul.
  useEffect(() => {
    const groupe = polygonesRef.current;
    if (!groupe || editionActiveRef.current) return;
    groupe.clearLayers();
    for (const t of tournees) {
      const poly = L.polygon(t.polygone, {
        color: t.couleur,
        weight: t.id === selectionTourneeId ? 4 : 2.5,
        fillOpacity: 0.05,
      }).addTo(groupe);
      poly.bindTooltip(t.nom, { sticky: true });
      poly.on('click', () => {
        const s = useAppStore.getState();
        if (s.modeAjout || s.deplacementAdresseId) return; // le clic sert alors à placer un point
        s.selectionnerTournee(t.id);
      });
      poly.on('pm:edit', () => {
        const anneau = (poly.getLatLngs()[0] as L.LatLng[]).map((ll) => [ll.lat, ll.lng] as LatLng);
        if (anneau.length >= 3) void useAppStore.getState().majPolygone(t.id, anneau);
      });
    }
  }, [tournees, selectionTourneeId, versionEdition]);

  // Pings d'adresses (canvas : supporte plusieurs milliers de points)
  useEffect(() => {
    const groupe = marqueursRef.current;
    const map = mapRef.current;
    if (!groupe || !map) return;
    groupe.clearLayers();
    for (const a of adresses) {
      const nb = 1 + a.autresAdresses.length;
      const marqueur = L.circleMarker([a.lat, a.lng], {
        radius: nb > 1 ? 9 : 6,
        color: '#ffffff',
        weight: 1.5,
        fillColor: COULEUR_STATUT[a.statut],
        fillOpacity: 0.95,
        bubblingMouseEvents: false,
        pmIgnore: true,
      } as L.CircleMarkerOptions).addTo(groupe);
      marqueur.bindTooltip(nb > 1 ? `${a.libelle} — ${nb} adresses` : a.libelle);
      marqueur.on('click', () => {
        const s = useAppStore.getState();
        if (s.modeAjout || s.deplacementAdresseId) return;
        s.ouvrirAdresse(a.id);
      });
    }
  }, [adresses]);

  // Point bleu : ma position GPS
  useEffect(() => {
    const groupe = positionRef.current;
    if (!groupe) return;
    groupe.clearLayers();
    if (positionGPS) {
      L.circleMarker([positionGPS.lat, positionGPS.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1a73e8',
        fillOpacity: 1,
        bubblingMouseEvents: false,
        pmIgnore: true,
      } as L.CircleMarkerOptions).addTo(groupe);
    }
  }, [positionGPS]);

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

  return <div ref={divRef} className="carte" />;
}
