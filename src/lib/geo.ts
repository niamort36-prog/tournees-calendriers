// Petits utilitaires géométriques, sans dépendance externe.

export type LatLng = [number, number]; // [latitude, longitude]

export interface Bbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function bboxDePoints(points: { lat: number; lng: number }[]): Bbox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const { lat, lng } of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

export function bboxDePolygone(poly: LatLng[]): Bbox {
  return bboxDePoints(poly.map(([lat, lng]) => ({ lat, lng })));
}

export function bboxSeChevauchent(a: Bbox, b: Bbox): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
}

export function dansBbox(lat: number, lng: number, b: Bbox): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Test point-dans-polygone par lancer de rayon (x = longitude, y = latitude). */
export function dansPolygone(lat: number, lng: number, poly: LatLng[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latI, lngI] = poly[i];
    const [latJ, lngJ] = poly[j];
    if (latI > lat !== latJ > lat) {
      const lngCroisement = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
      if (lng < lngCroisement) dedans = !dedans;
    }
  }
  return dedans;
}

/** Distance en mètres entre deux points GPS (formule de haversine). */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Centre approximatif (moyenne des sommets) — suffisant pour trouver le département. */
export function centreDePolygone(poly: LatLng[]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const p of poly) {
    lat += p[0];
    lng += p[1];
  }
  return [lat / poly.length, lng / poly.length];
}
