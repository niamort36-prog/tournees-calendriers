// Le greffon « leaflet-rotate » ne fournit pas de types TypeScript : on décrit
// ici ce qu'il ajoute à Leaflet (options de carte et pilotage de l'angle).

import 'leaflet';

declare module 'leaflet-rotate';

declare module 'leaflet' {
  interface MapOptions {
    /** Active la rotation de la carte. */
    rotate?: boolean;
    /** Angle de départ, en degrés. */
    bearing?: number;
    /** Rotation à deux doigts (téléphone / tablette). */
    touchRotate?: boolean;
    /** Rotation avec Maj + glisser (ordinateur). */
    shiftKeyRotate?: boolean;
    /** Boussole fournie par le greffon (on utilise la nôtre). */
    rotateControl?: boolean | { closeOnZeroBearing?: boolean };
  }

  interface Map {
    setBearing(degres: number): this;
    getBearing(): number;
  }
}
